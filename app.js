// 徒歩ナビ：本体（地図・追従・現在地・検索・目的地と経由地・お気に入り・ルートを出す流れ）
mapboxgl.accessToken = TOKEN;
const map = new mapboxgl.Map({
  container: 'map', style: 'mapbox://styles/mapbox/standard',
  center: [139.33, 35.62], zoom: 12, language: 'ja'
});
map.addControl(new mapboxgl.NavigationControl(), 'top-right');

// ---------- 地図の準備 ----------
map.on('load', () => {
  const empty = {type:'FeatureCollection', features:[]};
    ['off', 'walked', 'veh', 'net', 'cmp', 'route', 'poi'].forEach(id => map.addSource(id, {type:'geojson', data:empty}));
  map.addLayer({id:'off', type:'line', source:'off',
    paint:{'line-color':'#888', 'line-width':2.5, 'line-dasharray':[1, 2], 'line-opacity':0.7}});
  map.addLayer({id:'walked', type:'line', source:'walked', layout:{'line-cap':'round', 'line-join':'round'},
    paint:{'line-color':'#2ecc71', 'line-width':['interpolate', ['linear'], ['zoom'], 12, 3, 17, 10], 'line-opacity':0.55}});
  map.addLayer({id:'veh', type:'line', source:'veh', layout:{'line-cap':'round', 'line-join':'round'},
    paint:{'line-color':'#e74c3c', 'line-width':['interpolate', ['linear'], ['zoom'], 10, 2, 16, 6], 'line-opacity':0.6}});
  map.addLayer({id:'net', type:'line', source:'net', paint:{
    'line-color':['match', ['get', 'k'], 'steps', NET_COLOR.steps, 'iso', NET_COLOR.iso, 'ng', NET_COLOR.ng, NET_COLOR.ok],
    'line-width':['match', ['get', 'k'], 'steps', 5, 2], 'line-opacity':0.85}});
  map.addLayer({id:'cmp', type:'line', source:'cmp',
    paint:{'line-color':'#777', 'line-width':4, 'line-dasharray':[2, 1.5]}});
  map.addLayer({id:'routeCasing', type:'line', source:'route', layout:{'line-cap':'round', 'line-join':'round'},
    paint:{'line-color':'#fff', 'line-width':9}});
  map.addLayer({id:'route', type:'line', source:'route', layout:{'line-cap':'round', 'line-join':'round'},
    paint:{'line-color':'#1f6fd1', 'line-width':5}});
  const cv = document.createElement('canvas'); cv.width = cv.height = 24;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#fff'; cx.strokeStyle = '#1f6fd1'; cx.lineWidth = 2;
  cx.beginPath(); cx.moveTo(6, 5); cx.lineTo(19, 12); cx.lineTo(6, 19); cx.closePath(); cx.fill(); cx.stroke();
  map.addImage('arrow', cx.getImageData(0, 0, 24, 24), {pixelRatio: 2});
  map.addLayer({id:'routeArrow', type:'symbol', source:'route', layout:{
    'symbol-placement':'line', 'symbol-spacing':80, 'icon-image':'arrow',
    'icon-allow-overlap':true, 'icon-rotation-alignment':'map'}});
  map.addLayer({id:'poi', type:'circle', source:'poi', paint:{
    'circle-radius':6, 'circle-color':['match', ['get', 'k'], 'shrine', POI.shrine.col, 'temple', POI.temple.col, POI.park.col],
    'circle-stroke-color':'#fff', 'circle-stroke-width':2}});
  map.on('click', 'poi', e => {
    if (pickMode || !e.features.length) return;
    const f = e.features[0];
    new mapboxgl.Popup({closeButton: false}).setLngLat(f.geometry.coordinates).setText(f.properties.t).addTo(map);
  });
  if (route) setData('route', line(route.coords));
  if (cmpCoords) setData('cmp', line(cmpCoords));
  drawNet(); drawTracks(); drawPois();
});
map.on('error', e => showErr('地図エラー：' + (e.error && e.error.message ? e.error.message : '不明')));
map.on('dragstart', () => { setFollow(false); touchedMap(); });
map.on('rotatestart', e => { if (e.originalEvent) { setFollow(false); touchedMap(); } });
map.on('touchstart', () => touchedMap());
map.on('mousedown', () => touchedMap());
map.on('click', e => {
  const p = [e.lngLat.lng, e.lngLat.lat];
  if (pickMode === 'dest') { pickMode = null; destName = ''; setDest(p); }
  else if (pickMode === 'via') { pickMode = null; addVia(p); }
});

// ---------- 追従と向き ----------
// 地図の右下の「現在地に戻る」ボタン（追従がOFFのときだけ出す）
const reBtn = document.createElement('button');
reBtn.id = 'reBtn'; reBtn.textContent = '◎ 現在地に戻る';
$('map').appendChild(reBtn);
reBtn.onclick = () => setFollow(true);
let followTimer = null;
function setFollow(v) {
  follow = v; $('followBtn').textContent = follow ? '追従：ON' : '追従：OFF';
  reBtn.style.display = follow ? 'none' : 'block';
  if (v) { clearTimeout(followTimer); cam(); }
}
// 歩行中に地図を触ったら、最後に触ってから20秒で追従に戻す
function touchedMap() {
  if (follow) return;
  clearTimeout(followTimer);
  if (walk && $('autoFollowChk').checked) followTimer = setTimeout(() => { if (walk && !follow) setFollow(true); }, 20000);
}
function cam() {
  if (!follow || !pos) return;
  const o = {center: pos, duration: 600};
  if (headingUp && heading !== null) o.bearing = heading;
  lastCam = Date.now(); map.easeTo(o);
}
function maybeRotate() {
  if (!headingUp || !follow || heading === null) return;
  if (Date.now() - lastCam < 300) return;
  const d = Math.abs(((heading - map.getBearing()) % 360 + 540) % 360 - 180);
  if (d >= 3) cam();
}
function feedHeading(h, w) {
  const r = h * Math.PI / 180;
  hx = hx * (1 - w) + Math.cos(r) * w; hy = hy * (1 - w) + Math.sin(r) * w;
  heading = (Math.atan2(hy, hx) * 180 / Math.PI + 360) % 360;
  if (posMarker) { posMarker.setRotation(heading); arw.style.display = 'block'; }
  maybeRotate();
}
window.addEventListener('deviceorientationabsolute', e => {
  if (e.alpha == null) return;
  const ang = (screen.orientation && screen.orientation.angle) || 0;
  lastCompass = Date.now();
  feedHeading((360 - e.alpha + ang) % 360, 0.15);
});
$('followBtn').onclick = () => setFollow(!follow);
$('headBtn').onclick = () => {
  headingUp = !headingUp;
  $('headBtn').textContent = headingUp ? '向き：進行方向' : '向き：北が上';
  if (headingUp) {
    if (heading === null) status('向きの情報を待っています（コンパス、または歩き出すと取得します）…');
    setFollow(true);
  } else map.easeTo({bearing: 0, duration: 500});
};

// ---------- 現在地 ----------
if ('geolocation' in navigator) {
  navigator.geolocation.watchPosition(onPos, e => showErr('位置情報エラー：' + e.message),
    {enableHighAccuracy: true, maximumAge: 2000, timeout: 20000});
} else showErr('この端末では位置情報が使えません');

function onPos(p) {
  const c = p.coords;
  pos = [c.longitude, c.latitude];
  if (!posMarker) {
    const el = document.createElement('div'); el.className = 'me';
    el.innerHTML = '<div class="arw"></div><div class="dot"></div>';
    arw = el.querySelector('.arw');
    posMarker = new mapboxgl.Marker({element: el, rotationAlignment: 'map'}).setLngLat(pos).addTo(map);
    if (heading !== null) { posMarker.setRotation(heading); arw.style.display = 'block'; }
    map.jumpTo({center: pos, zoom: 15});
    if (!dest) status('目的地を検索するか、「地図で指定」を押して地図をタップしてください。');
    setTimeout(prefetch, 300); // 周りの道のデータを先に準備
  } else posMarker.setLngLat(pos);
  if (Date.now() - lastCompass > 3000 && c.heading != null && !isNaN(c.heading) && c.speed > 0.7) feedHeading(c.heading, 0.5);
  if (walk) walkStep(c);
  cam();
  updateRemain();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && 'geolocation' in navigator)
    navigator.geolocation.getCurrentPosition(onPos, () => {}, {enableHighAccuracy: true, maximumAge: 0, timeout: 15000});
});

// ---------- 検索（名称：OpenStreetMap／住所：Mapbox） ----------
$('searchBtn').onclick = doSearch;
$('search').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
async function doSearch() {
  const q = $('search').value.trim(); if (!q) return;
  $('hits').innerHTML = '<div class="small">検索中…</div>';
  const [a, b] = await Promise.all([searchOsm(q), searchMapbox(q)]);
  const all = a.concat(b);
  $('hits').innerHTML = '';
  all.forEach(h => {
    const d = document.createElement('div'); d.className = 'hit';
    d.innerHTML = `<b>${esc(h.name)}</b><br><span class="small">${esc(h.sub)}</span>`;
    d.onclick = () => { $('hits').innerHTML = ''; destName = h.name; setDest(h.p); };
    $('hits').appendChild(d);
  });
  if (!all.length) $('hits').innerHTML = '<div class="small">見つかりませんでした。別の言い方で試すか「地図で指定」を使ってください。</div>';
}
async function searchOsm(q) {
  try {
    let vb = '';
    if (pos) { const d = 0.3; vb = `&viewbox=${(pos[0] - d).toFixed(4)},${(pos[1] + d).toFixed(4)},${(pos[0] + d).toFixed(4)},${(pos[1] - d).toFixed(4)}`; }
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&countrycodes=jp&accept-language=ja&limit=5${vb}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return j.map(x => ({name: x.name || x.display_name.split(',')[0], sub: x.display_name, p: [Number(x.lon), Number(x.lat)]}));
  } catch (e) { showErr('名称検索エラー：' + e.message); return []; }
}
async function searchMapbox(q) {
  try {
    const prox = pos ? `&proximity=${pos[0]},${pos[1]}` : '';
    const j = await (await fetch(`https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}&country=jp&language=ja&limit=5${prox}&access_token=${TOKEN}`)).json();
    return (j.features || []).map(f => ({name: f.properties.name || '', sub: f.properties.full_address || '', p: f.geometry.coordinates}));
  } catch (e) { showErr('住所検索エラー：' + e.message); return []; }
}

// ---------- 目的地・経由地・周回 ----------
$('pickBtn').onclick = () => { pickMode = 'dest'; status('地図上の目的地をタップしてください。'); };
$('viaBtn').onclick = () => {
  if (!(dest && mode === 'to') && mode !== 'loop') { status('先に目的地を決めるか、周回コースを作ってください。'); return; }
  if (vias.length >= VIA_MAX) { status(`経由地は${VIA_MAX}か所までです。`); return; }
  pickMode = 'via'; status(`通りたい場所（経由地${vias.length + 1}）をタップしてください。タップした順に通ります。`);
};
// 経由地のマーク（番号付き）を描き直す
function drawVias() {
  viaMarkers.forEach(m => m.remove());
  viaMarkers = vias.map((p, i) => {
    const el = document.createElement('div'); el.className = 'vmk'; el.textContent = i + 1;
    return new mapboxgl.Marker({element: el}).setLngLat(p).addTo(map);
  });
  $('viaUndo').disabled = $('viaClear').disabled = !vias.length;
}
function clearVia() { vias = []; drawVias(); }
function setDest(p) {
  dest = p; clearVia();
  if (destMarker) destMarker.remove();
  destMarker = new mapboxgl.Marker({color: '#c0392b'}).setLngLat(p).addTo(map);
  $('recalcBtn').disabled = false; $('favAdd').disabled = false;
  calc('to');
}
function addVia(p) {
  if (vias.length >= VIA_MAX) return;
  vias.push(p); drawVias();
  calc();
}
$('viaUndo').onclick = () => { vias.pop(); drawVias(); calc(); };
$('viaClear').onclick = () => { clearVia(); calc(); };
$('recalcBtn').onclick = () => calc();
$('ext').onchange = () => { if (dest && mode === 'to') calc('to'); };
$('unexp').onchange = () => { if (route) calc(); };
$('slope').onchange = () => { if (route) calc(); };
$('foot').onchange = () => { if (route) calc(); };
$('poiN').onchange = () => { if (route && poiKinds().length) calc(); };
['poiShrine', 'poiTemple', 'poiPark'].forEach(id => $(id).onchange = () => {
  if (poiKinds().length && mode === 'to' && $('ext').value === '0') { $('ext').value = '500'; status('寄り道のため、延長を＋500mにしました（寄り道で遠回りしてよい上限です）'); }
  if (route) calc();
});
$('poiShow').onchange = () => {
  if ($('poiShow').checked && !graph) status('ルートを一度計算すると、その範囲の神社・寺・公園が表示されます。');
  drawPois();
};
$('routeClear').onclick = () => {
  clearRoute(); clearVia(); loopStart = null; mode = 'to';
  dest = null; if (destMarker) { destMarker.remove(); destMarker = null; }
  $('favAdd').disabled = true; $('recalcBtn').disabled = true;
  $('rem').textContent = '目的地を設定してください';
  status(walk ? 'ルートを消しました。記録はそのまま続けています。' : 'ルートを消しました。「記録だけ始める」で記録だけできます。');
  renderHud();
};
$('loopBtn').onclick = () => {
  dest = null; clearVia(); loopStart = null;
  if (destMarker) { destMarker.remove(); destMarker = null; }
  $('favAdd').disabled = true; $('recalcBtn').disabled = false;
  calc('loop');
};
$('altBtn').onclick = () => {
  if (cands.length < 2) return;
  candIdx = (candIdx + 1) % cands.length; showRoute();
};
$('cmpChk').onchange = () => {
  if ($('cmpChk').checked) { if (route && !route.loop) fetchCmp(route.pts); }
  else { cmpCoords = null; cmpText = ''; setData('cmp', []); showSummary(); }
};
$('netChk').onchange = () => {
  if ($('netChk').checked && !graph) status('ルートを一度計算すると、その範囲の道が表示されます。');
  drawNet();
};
$('netReset').onclick = async () => {
  graph = null; areaMeta = []; saveMeta();
  try { await cacheClear(); } catch (e) {}
  drawNet();
  status('保存していた道のデータを消しました。次の計算で取り直します。');
  if (route) calc();
};

// ---------- お気に入り ----------
function saveFavs() {
  try { localStorage.setItem('walk_favs', JSON.stringify(favs)); } catch (e) { showErr('お気に入りの保存に失敗しました'); }
  renderFavs();
}
function renderFavs() {
  $('favBar').innerHTML = favs.map((f, i) => `<button class="fav" data-go="${i}">★${esc(f.name)}</button>`).join('');
  $('favBar').querySelectorAll('button').forEach(b => b.onclick = () => {
    const f = favs[Number(b.dataset.go)]; destName = f.name; $('hits').innerHTML = ''; setDest(f.p);
  });
  $('favList').innerHTML = favs.length
    ? favs.map((f, i) => `<div>${esc(f.name)}　<button data-del="${i}">削除</button></div>`).join('')
    : '<div class="small">まだ登録がありません</div>';
  $('favList').querySelectorAll('button').forEach(b =>
    twoStep(b, '削除', () => { favs.splice(Number(b.dataset.del), 1); saveFavs(); }));
}
$('favAdd').onclick = () => {
  if (!dest) return;
  $('favName').value = destName || '';
  $('favForm').style.display = 'block'; $('favName').focus();
};
$('favCancel').onclick = () => { $('favForm').style.display = 'none'; };
$('favSave').onclick = () => {
  const name = $('favName').value.trim();
  if (!name || !dest) return;
  favs.push({name, p: dest}); saveFavs();
  $('favForm').style.display = 'none'; status(name + 'を登録しました。');
};
$('favExport').onclick = () => { $('favText').value = JSON.stringify(favs); };
$('favImport').onclick = () => {
  try {
    const a = JSON.parse($('favText').value);
    if (!Array.isArray(a)) throw 0;
    favs = a.filter(x => x && x.name && Array.isArray(x.p)); saveFavs();
    status('お気に入りを読み込みました。');
  } catch (e) { showErr('読み込めない形式です'); }
};
renderFavs();

// ---------- ルートを出す ----------
function clearRoute() {
  route = null; cands = []; candIdx = 0; lastRemain = null;
  $('altBtn').disabled = true; updWalkBtn();
  cmpCoords = null; cmpText = ''; setData('route', []); setData('cmp', []); $('sub').innerHTML = '';
  drawProf(); drawStops();
}
async function calc(m) {
  if (m) mode = m;
  if (busy) { pending = true; return; }
  if (!pos) { showErr('現在地がまだ取得できていません。少し待ってから「再計算」を押してください。'); return; }
  if (mode === 'to' && !dest) return;
  busy = true;
  try { if (mode === 'loop') await calcLoop(); else await calcTo(); }
  catch (e) { showErr(e.message); status(''); }
  finally {
    busy = false;
    if (pending) { pending = false; calc(); }
  }
}
async function calcTo() {
  const from = pos.slice(), straight = distM(from, dest);
  if (straight > MAX_M) {
    clearRoute();
    $('rem').textContent = '徒歩の範囲を超えています';
    $('sub').textContent = `直線で${fmtDist(straight)}あります。降りる駅を目的地にしてください。`;
    return;
  }
  const kinds = vias.length ? [] : poiKinds();
  if (kinds.length && $('ext').value === '0') $('ext').value = '500'; // 寄り道の遠回りの上限
  const X = vias.length ? 0 : Number($('ext').value);
  const pts = [from].concat(vias, [dest]);
  // 自前の計算が終わるまでの目安として、Mapboxの徒歩ルートを先に表示
  cmpText = ''; cmpCoords = null; setData('cmp', []);
  if ($('cmpChk').checked) fetchCmp(pts);
  if (!walk) { const b = new mapboxgl.LngLatBounds(); pts.forEach(p => b.extend(p)); setFollow(false); map.fitBounds(b, {padding: 60, maxZoom: 16}); }
  const extra = X ? X / 2 + 300 : 0;
  await ensureGraph(bboxOf(pts, MARGIN + extra), bboxOf(pts, MARGIN + extra + 500));
  await ensureElev(graph);
  markWalked(graph); // 歩いている途中の道も「歩いた道」に含める
  status('経路を計算中…'); await pause();
  const g = graph, sn = pts.map(p => snap(g, p));
  if (sn.some(s => s.i < 0)) throw new Error('近くに歩ける道が見つかりません');
  const base = legsPath(g, sn.map(s => s.i));
  if (!base) throw new Error('ルートが見つかりませんでした');
  const baseLen = pathLen(g, base);
  const baseTotal = baseLen + sn[0].d + sn[sn.length - 1].d;
  let list = [{idx: base}], msg = '';
  if (kinds.length) {
    status('寄り道の候補を探しています…'); await pause();
    try {
      const r = await poiRouteTo(g, sn[0].i, sn[sn.length - 1].i, from, dest, baseLen, X, kinds);
      if (r.length) { list = r; msg = fewerMsg(r); } else msg = `　※延長（＋${fmtDist(X)}）の範囲で寄れる場所が見つからず、最短ルートを表示しています`;
    } catch (e) { showErr('神社・寺・公園の' + e.message + '。寄り道なしで計算します'); }
  } else if (X) {
    status('遠回りの候補を探しています…'); await pause();
    list = extendCands(g, base, baseLen, X, sn[0].i, sn[sn.length - 1].i);
    if (!list.length) { list = [{idx: base}]; msg = '　※指定の距離に近い遠回りが見つからず、最短ルートを表示しています'; }
  }
  cands = list.map(c => makeCand(g, c, [from].concat(toCoords(g, c.idx), [dest]), {pts, baseTotal: X ? baseTotal : null, loop: false}));
  candIdx = 0; $('altBtn').disabled = cands.length < 2;
  showRoute();
  if (vias.length && Number($('ext').value)) msg += '　※経由地があるため延長は使っていません';
  if (vias.length && poiKinds().length) msg += '　※経由地があるため寄り道は使っていません';
  if (sn[0].d > 200) msg += `　※現在地から最寄りの道まで${fmtDist(sn[0].d)}あります`;
  if (slopeMode() && !g.ele) msg += '　※高さのデータがないため、坂は考えずに計算しました（階段の扱いは反映済み）';
  status(`計算完了 ${nowHM()}（道のデータ：${g.from}）${msg}`);
}
function extendCands(g, base, S, X, s, t) {
  const c = toCoords(g, base), cum = cumOf(c), target = S + X;
  const h0 = Math.sqrt(Math.max(0, (target / 2) ** 2 - (S / 2) ** 2)) / 1.2;
  const brg = bearing(c[0], c[c.length - 1]);
  const tries = [];
  [0.6, 0.85, 1.1].forEach(f => [-90, 90].forEach(side => tries.push({tp: 0.5, f, side})));
  [0.3, 0.7].forEach(tp => [-90, 90].forEach(side => tries.push({tp, f: 0.85, side})));
  const out = [];
  for (const tr of tries) {
    const v = offsetPt(pointAt(c, cum, S * tr.tp), brg + tr.side, h0 * tr.f);
    const sv = snap(g, v); if (sv.i < 0) continue;
    const idx = legsPath(g, [s, sv.i, t]); if (!idx) continue;
    if (overlapRatio(g, idx) > 0.2) continue;
    out.push({idx, err: Math.abs(pathLen(g, idx) - target)});
  }
  return pickBest(out, Math.max(200, X * 0.4));
}
async function calcLoop() {
  if (!loopStart) loopStart = pos.slice(); // 出発点は「周回コースを作る」を押した場所に固定
  const T = Number($('loopKm').value) * 1000, from = loopStart;
  const r = T / (3 * 1.25);
  cmpText = ''; cmpCoords = null; setData('cmp', []);
  if (vias.length) await ensureGraph(bboxOf([from, ...vias], MARGIN), bboxOf([from, ...vias], MARGIN + 500));
  else await ensureGraph(bboxOf([from], r * 1.3 + MARGIN), bboxOf([from], r * 1.3 + MARGIN + 500));
  await ensureElev(graph);
  markWalked(graph); // 歩いている途中の道も「歩いた道」に含める
  status('周回コースを探しています…'); await pause();
  const g = graph, s0 = snap(g, from);
  if (s0.i < 0) throw new Error('近くに歩ける道が見つかりません');
  let list, msg = '';
  if (vias.length) {
    // 経由地があるときは、出発点→経由地（タップ順）→出発点。2か所以上なら逆回りも「別の案」に
    const vs = vias.map(p => snap(g, p).i);
    if (vs.some(i => i < 0)) throw new Error('経由地の近くに歩ける道が見つかりません');
    const fwd = legsPath(g, [s0.i, ...vs, s0.i]);
    if (!fwd) throw new Error('経由地を通る周回コースが見つかりませんでした');
    list = [{idx: fwd}];
    if (vs.length >= 2) { const rev = legsPath(g, [s0.i, ...vs.slice().reverse(), s0.i]); if (rev) list.push({idx: rev, rev: true}); }
  } else {
    const kinds = poiKinds();
    if (kinds.length) {
      status('寄り道を入れた周回コースを探しています…'); await pause();
      try {
        list = await poiRouteLoop(g, s0, from, T, kinds);
        msg = list.length ? fewerMsg(list) : '　※指定の距離で寄れる場所が見つからず、寄り道なしのコースを表示しています';
      } catch (e) { showErr('神社・寺・公園の' + e.message + '。寄り道なしで計算します'); list = []; }
    }
    if (!list || !list.length) list = loopCands(g, s0, from, T, r);
  }
  cands = list.map(c => makeCand(g, c, [from].concat(toCoords(g, c.idx), [from]), {pts: [from], baseTotal: null, loop: true}));
  candIdx = 0; $('altBtn').disabled = cands.length < 2;
  showRoute();
  status(`周回コース 計算完了 ${nowHM()}（道のデータ：${g.from}）矢印の向きに歩いてください` +
    (vias.length ? `　※経由地${vias.length}か所を通るので、距離（km）の指定は使っていません` : '') + msg +
    (vias.length && poiKinds().length ? '　※経由地があるため寄り道は使っていません' : '') +
    (slopeMode() && !g.ele ? '　※高さのデータがないため、坂は考えずに計算しました' : ''));
}
// ルートの候補に、高さの変化・案内・寄り道先をまとめて付ける
function makeCand(g, c, coords, o) {
  const prof = makeProf(g, c.idx, coords);
  const turns = computeTurns(g, c.idx, coords, prof).concat(stopTurns(c.idx, coords, c.stops)).sort((a, b) => a.d - b.d);
  return Object.assign({idx: c.idx, coords, rev: !!c.rev, stops: c.stops || null, ur: unexpRatio(g, c.idx), prof, turns}, o);
}
// 距離を指定した周回コースの候補
function loopCands(g, s0, from, T, r) {
  const out = [];
  for (let k = 0; k < 8; k++) {
    const th = k * 45;
    for (const f of [0.8, 1.0]) {
      const a = snap(g, offsetPt(from, th, r * f)), b = snap(g, offsetPt(from, th + 60, r * f));
      if (a.i < 0 || b.i < 0) continue;
      const idx = legsPath(g, [s0.i, a.i, b.i, s0.i]); if (!idx) continue;
      if (overlapRatio(g, idx) > 0.3) continue;
      out.push({idx, err: Math.abs(pathLen(g, idx) - T)});
    }
  }
  const list = pickBest(out, Math.max(300, T * 0.25));
  if (!list.length) { clearRoute(); throw new Error('条件に合う周回コースが見つかりませんでした。距離を変えて試してください'); }
  return list;
}
function showRoute() {
  const c = cands[candIdx];
  route = {coords: c.coords, cum: cumOf(c.coords), pts: c.pts, baseTotal: c.baseTotal, loop: c.loop, rev: c.rev, ur: c.ur, off: 0, prog: 0,
    prof: c.prof, turns: c.turns || [], stops: c.stops, vib: {}, a: 0, remUp: c.prof ? c.prof.up : 0};
  setData('route', line(c.coords));
  updWalkBtn(); drawStops();
  const b = new mapboxgl.LngLatBounds(); c.coords.forEach(p => b.extend(p));
  if (walk) setFollow(true);
  else { setFollow(false); map.fitBounds(b, {padding: 50, maxZoom: 17}); }
  updateRemain();
}

// ---------- 比較用：Mapboxの徒歩ルート ----------
async function fetchCmp(pts) {
  try {
    const c = pts.map(p => p[0].toFixed(6) + ',' + p[1].toFixed(6)).join(';');
    const res = await fetch(`https://api.mapbox.com/directions/v5/mapbox/walking/${c}?geometries=geojson&overview=full&access_token=${TOKEN}`);
    const j = await res.json();
    if (!res.ok || j.code !== 'Ok' || !j.routes.length) throw new Error(`HTTP ${res.status} ${j.code || ''} ${j.message || ''}`);
    const r = j.routes[0];
    cmpCoords = r.geometry.coordinates; setData('cmp', line(cmpCoords));
    cmpText = `比較（Mapbox徒歩・最短・点線）：${fmtDist(r.distance)}・約${mins(r.distance)}分`;
  } catch (e) { showErr('比較ルートの取得に失敗：' + e.message); cmpText = ''; }
  showSummary();
}

// ---------- 残り距離の表示 ----------
function updateRemain() {
  if (!route) return;
  const c = route.coords, total = route.cum[route.cum.length - 1];
  let remain = total, a = 0;
  if (pos) {
    let best = {d: 1e12, i: 0, t: 0};
    for (let i = Math.max(0, route.prog - 2); i < c.length - 1; i++) {
      const s = segDist(pos, c[i], c[i + 1]);
      if (s.d < best.d) best = {d: s.d, i, t: s.t};
    }
    route.off = best.d;
    if (best.d <= 60) route.prog = Math.max(route.prog, best.i);
    a = route.cum[best.i] + best.t * (route.cum[best.i + 1] - route.cum[best.i]);
    remain = Math.max(0, total - a);
  }
  lastRemain = remain; route.a = a;
  route.remUp = route.prof ? upFrom(route.prof, a) : 0;
  $('rem').textContent = remain < 20 ? (route.loop ? '出発点に戻りました' : '目的地付近です') : `残り ${fmtDist(remain)}　約${walkMin(remain, route.remUp)}分`;
  showSummary();
  drawProf(a);
  maybeVibrate();
  renderHud();
}
function showSummary() {
  if (!route) return;
  const total = route.cum[route.cum.length - 1];
  const pf = route.prof;
  let h = (route.loop ? '周回コース ' : '') + `全長 ${fmtDist(total)}・約${walkMin(total, pf ? pf.up : 0)}分（分速80m${pf ? '＋上り10mごとに1分' : ''}）`;
  if (pf) h += `<br>上り ${Math.round(pf.up)}m・下り ${Math.round(pf.down)}m・最大勾配 ${Math.round(pf.maxg * 100)}%`;
  if (route.baseTotal && total - route.baseTotal > 50) h += `<br>最短より＋${fmtDist(total - route.baseTotal)}`;
  if (vias.length) h += `　経由地${vias.length}か所`;
  if (route.stops) h += `<br>寄り道：${route.stops.map(p => esc(poiLabel(p))).join('・')}`;
  if (cands.length > 1) h += `　案${candIdx + 1}／${cands.length}${route.rev ? '（逆回り）' : ''}`;
  if (slopeMode()) h += slopeMode() === 1 ? '　坂・階段を避ける' : '　坂を選ぶ';
  if (tracks.some(t => t.k !== 'veh')) h += `<br>このルートの未踏破率 ${Math.round((route.ur ?? 1) * 100)}%`;
  if (cmpText && !route.loop) h += '<br>' + cmpText;
  if (route.off > 60) h += '<br><span style="color:#c0392b">ルートから離れています。必要なら「再計算」を押してください</span>';
  $('sub').innerHTML = h;
}
$('ver').textContent = '版 ' + APP_VER;
restoreSession();
