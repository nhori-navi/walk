// MichiMiru：本体（地図・追従・現在地・検索・出発地・目的地と経由地・お気に入り・ルートを出す流れ）
mapboxgl.accessToken = TOKEN;
// 初めの地図：前回の場所（約100m単位）→ なければ日本全体
const lastPos = loadJSON('walk_lastpos', 'null');
const map = new mapboxgl.Map({
  container: 'map', style: 'mapbox://styles/mapbox/standard',
  center: Array.isArray(lastPos) ? lastPos : JAPAN, zoom: Array.isArray(lastPos) ? 14 : JAPAN_Z, language: 'ja'
});
map.addControl(new mapboxgl.NavigationControl(), 'top-right');

// ---------- 地図の準備 ----------
map.on('load', () => {
  const empty = {type:'FeatureCollection', features:[]};
  map.addSource('acc', {type:'geojson', data:empty});
  map.addLayer({id:'acc', type:'fill', source:'acc', paint:{'fill-color':['get', 'c'], 'fill-opacity':0.13, 'fill-outline-color':['get', 'c']}});
  ['mesh', 'off', 'walked', 'veh', 'net', 'cmp', 'route', 'poi'].forEach(id => map.addSource(id, {type:'geojson', data:empty}));
  map.addLayer({id:'mesh', type:'fill', source:'mesh', paint:{'fill-color':'#f39c12', 'fill-opacity':0.22, 'fill-outline-color':'#e67e22'}});
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
  drawNet(); drawTracks(); drawPois(); drawAcc();
});
// 地図の読み込みの失敗（地図の小さな画像ごとに出るので、1分に1回まで）
let mapErrAt = 0;
map.on('error', e => {
  if (Date.now() - mapErrAt < 60000) return;
  mapErrAt = Date.now(); showErr('地図の読み込みに失敗しました（' + jaErr(e.error || {}) + '）');
});
map.on('dragstart', () => { setFollow(false); touchedMap(); });
map.on('rotatestart', e => { if (e.originalEvent) { setFollow(false); touchedMap(); } });
map.on('touchstart', () => touchedMap());
map.on('mousedown', () => touchedMap());
map.on('click', e => {
  const p = [e.lngLat.lng, e.lngLat.lat];
  if (pickMode === 'from') { pickMode = null; setStart(p); }
  else if (pickMode === 'dest') { pickMode = null; destName = ''; setDest(p); }
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
  gotOri = true;
  const ang = (screen.orientation && screen.orientation.angle) || 0;
  lastCompass = Date.now();
  feedHeading((360 - e.alpha + ang) % 360, 0.15);
});
// iPhone：向きのセンサーは、ボタンを押したその場で許可を求める。方位は磁北なので、偏角の近似で真北に直す（YamaMiru と同じ式、西が正）
let oriAsked = false;
function iosHeading(e) {
  if (e.webkitCompassHeading == null || isNaN(e.webkitCompassHeading)) return;
  gotOri = true;
  const p = origin() || [139, 36], decl = 7.5 + 0.3 * (p[1] - 36) - 0.05 * (p[0] - 139);
  const ang = (screen.orientation && screen.orientation.angle) || 0;
  lastCompass = Date.now();
  feedHeading(((e.webkitCompassHeading - decl + ang) % 360 + 360) % 360, 0.15);
}
async function askOri() {
  if (oriAsked || typeof DeviceOrientationEvent === 'undefined' || typeof DeviceOrientationEvent.requestPermission !== 'function') return true;
  try {
    const r = await DeviceOrientationEvent.requestPermission();
    if (r !== 'granted') { status('向きのセンサーが許可されませんでした。歩き出すと、進む方向から向きを取ります'); return false; }
    oriAsked = true; window.addEventListener('deviceorientation', iosHeading); return true;
  } catch (e) { status('向きのセンサーの許可を確認できませんでした（' + jaErr(e) + '）'); return false; }
}
$('followBtn').onclick = () => setFollow(!follow);
$('headBtn').onclick = () => {
  if (!headingUp && noSensor()) { status('「向き：進行方向」はスマホで使えます（この端末には向きのセンサーがありません）'); return; }
  if (!headingUp) askOri(); // iPhone は押したその場で許可を求める必要がある
  headingUp = !headingUp;
  $('headBtn').textContent = headingUp ? '向き：進行方向' : '向き：北が上';
  if (headingUp) {
    if (heading === null) status('向きの情報を待っています（コンパス、または歩き出すと取得します）…');
    setFollow(true);
  } else map.easeTo({bearing: 0, duration: 500});
};

// ---------- 現在地 ----------
// 位置情報のエラーを日本語で（同じエラーは繰り返し並べない）
const GEO_MSG = {
  0: 'このブラウザは位置情報に対応していません。',
  1: '位置情報が許可されていません。アドレス欄の左のマーク →「権限」→ 位置情報を「許可」にして、読み込み直してください。',
  2: '現在地が取れません（屋内・電波の弱い場所、端末の位置情報がオフなど）。',
  3: '現在地の取得が時間切れになりました。続けて試しています。'};
function onGeoErr(e) {
  const code = e && GEO_MSG[e.code] ? e.code : 2;
  if (geoErr === code) return;
  geoErr = code;
  if (!pos) showErr(GEO_MSG[code] + '「出発地を地図で選ぶ」でルートは作れます。');
  updLoc();
}
if ('geolocation' in navigator) {
  navigator.geolocation.watchPosition(onPos, onGeoErr, {enableHighAccuracy: true, maximumAge: 2000, timeout: 20000});
} else onGeoErr({code: 0});
if (!Array.isArray(lastPos)) status('地図をタップするか、目的地を検索してください。現在地が取れないときは「出発地を地図で選ぶ」で出発地を決められます。');

// 現在地の行（精度・粗いとき・エラー）
function updLoc() {
  let h;
  if (pos) {
    h = `現在地：精度 約${fmtAcc(posAcc)}（${hm(new Date(posAt))}）`;
    if (isRough()) h += '<br><span style="color:#c0392b">ずれが大きいため、ルートの出発地・到着の判定・道のデータの先読みには使っていません</span>';
  } else h = geoErr !== null ? `<span style="color:#c0392b">${esc(GEO_MSG[geoErr])}</span>` : '現在地を取得中…';
  if (startPt) h += '<br><b style="color:#1e7e34">出発地：地図で選んだ場所（緑の印）</b>';
  $('loc').innerHTML = h;
}
// 精度の円（粗いときは灰色）
function drawAcc() {
  if (!pos || posAcc === null) { setData('acc', []); return; }
  const r = Math.min(posAcc, 20000), ring = [];
  for (let i = 0; i <= 48; i++) ring.push(offsetPt(pos, i * 7.5, r));
  setData('acc', [{type:'Feature', properties:{c: isRough() ? '#888' : '#1e90ff'}, geometry:{type:'Polygon', coordinates:[ring]}}]);
}
// 前回の場所：精度100m以内の位置を約100m単位に丸めて、1分に1回まで保存
let lastPosSaved = 0;
function saveLastPos() {
  if (Date.now() - lastPosSaved < 60000) return;
  lastPosSaved = Date.now();
  lsSet('walk_lastpos', JSON.stringify([Math.round(pos[0] * 1000) / 1000, Math.round(pos[1] * 1000) / 1000]));
}
let waitCalc = false, roughOk = false;
function onPos(p) {
  const c = p.coords, first = !posMarker, wasRough = isRough();
  pos = [c.longitude, c.latitude]; posAcc = c.accuracy; posAt = Date.now(); geoErr = null;
  const rough = isRough();
  if (first) {
    const el = document.createElement('div'); el.className = 'me';
    el.innerHTML = '<div class="arw"></div><div class="dot"></div>';
    arw = el.querySelector('.arw');
    posMarker = new mapboxgl.Marker({element: el, rotationAlignment: 'map'}).setLngLat(pos).addTo(map);
    if (heading !== null) { posMarker.setRotation(heading); arw.style.display = 'block'; }
    if (!startPt) map.jumpTo({center: pos, zoom: posAcc <= ROUGH_M ? 15 : posAcc <= 1000 ? 14 : 12}); // ずれが大きいときは広めに
    if (!dest && !startPt) status(rough
      ? `現在地のずれが大きい（約${fmtAcc(posAcc)}）ので、ルートを作るときは「出発地を地図で選ぶ」を使うか、精度がよくなるのを待ってください。`
      : '目的地を検索するか、「地図で指定」を押して地図をタップしてください。');
  } else posMarker.setLngLat(pos);
  posMarker.getElement().classList.toggle('rough', rough);
  drawAcc(); updLoc();
  if (!rough) {
    saveLastPos();
    if (first || wasRough) setTimeout(prefetch, 300); // 周りの道のデータを先に準備（精度がよくなってから）
    roughOk = false;
    if (waitCalc && !startPt) { waitCalc = false; calc(); } // 精度がよくなったら、待っていた計算をする
  }
  if (Date.now() - lastCompass > 3000 && c.heading != null && !isNaN(c.heading) && c.speed > 0.7 && c.accuracy <= REC_M) feedHeading(c.heading, 0.5);
  if (walk) walkStep(c);
  if (!(startPt && !walk)) cam();
  updateRemain();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && 'geolocation' in navigator)
    navigator.geolocation.getCurrentPosition(onPos, () => {}, {enableHighAccuracy: true, maximumAge: 0, timeout: 15000});
});

// ---------- 出発地を地図で選ぶ ----------
function setStart(p) {
  startPt = p; loopStart = null; waitCalc = false; hideWarn();
  if (startMarker) startMarker.remove();
  startMarker = new mapboxgl.Marker({color: '#27ae60'}).setLngLat(p).addTo(map);
  $('fromClear').style.display = '';
  setFollow(false); updLoc();
  if (!graph) setTimeout(prefetch, 300);
  if (dest && mode === 'to') calc('to');
  else if (mode === 'loop' && route) calc('loop');
  else status('出発地を決めました。目的地を検索するか「地図で指定」、または「周回コースを作る」を押してください。');
}
function clearStart() {
  startPt = null; loopStart = null;
  if (startMarker) { startMarker.remove(); startMarker = null; }
  $('fromClear').style.display = 'none'; updLoc();
}
const pickFrom = () => { pickMode = 'from'; status('出発地にする場所を地図でタップしてください。'); };
$('fromBtn').onclick = pickFrom;
$('fromClear').onclick = () => { clearStart(); if (dest || route) calc(); else status('現在地から出発します。'); };
// 出発地に使えないときの黄色の帯
function showWarn(m, force) {
  $('warnText').textContent = m; $('warnForce').style.display = force ? '' : 'none'; $('warn').style.display = 'block';
}
function hideWarn() { $('warn').style.display = 'none'; }
$('warnPick').onclick = () => { hideWarn(); pickFrom(); };
$('warnForce').onclick = () => { roughOk = true; hideWarn(); calc(); };
// ルートの出発地を決める。使えなければ黄色の帯を出して null（精度がよくなったら自動で計算）
function originOrWarn() {
  if (startPt) return startPt;
  if (!pos) {
    showWarn('現在地がまだ分かりません。「出発地を地図で選ぶ」で出発地を決めると計算できます（現在地が取れたら自動で計算します）。', false);
    waitCalc = true; return null;
  }
  if (isRough() && !roughOk) {
    showWarn(`現在地のずれが大きい（約${fmtAcc(posAcc)}）ため、出発地に使っていません。「出発地を地図で選ぶ」を押すか、精度がよくなるのを待ってください（よくなったら自動で計算します）。`, true);
    waitCalc = true; return null;
  }
  return pos;
}

// ---------- 検索（名称：OpenStreetMap／住所：国土地理院） ----------
$('searchBtn').onclick = doSearch;
$('search').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
let searching = false, lastNomi = 0;
async function doSearch() {
  const q = $('search').value.trim(); if (!q || searching) return;
  searching = true;
  $('hits').innerHTML = '<div class="small">検索中…</div>';
  try {
    const [a, b] = await Promise.all([searchOsm(q), searchGsi(q)]);
    const all = a.concat(b);
    $('hits').innerHTML = '';
    all.forEach(h => {
      const d = document.createElement('div'); d.className = 'hit';
      d.innerHTML = `<b>${esc(h.name)}</b><br><span class="small">${esc(h.sub)}</span>`;
      d.onclick = () => { $('hits').innerHTML = ''; destName = h.name; setDest(h.p); };
      $('hits').appendChild(d);
    });
    if (!all.length) $('hits').innerHTML = '<div class="small">見つかりませんでした。別の言い方で試すか「地図で指定」を使ってください。</div>';
  } finally { searching = false; }
}
// 名称検索（Nominatim）。1秒に1回までの決まりを守る。近くを優先する範囲の中心は約500m単位に丸める
async function searchOsm(q) {
  try {
    const wait = lastNomi + 1100 - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastNomi = Date.now();
    let vb = '';
    const c0 = origin() || (map.getZoom() >= 9 ? map.getCenter().toArray() : null);
    if (c0) { const c = round500(c0), d = 0.3; vb = `&viewbox=${(c[0] - d).toFixed(3)},${(c[1] + d).toFixed(3)},${(c[0] + d).toFixed(3)},${(c[1] - d).toFixed(3)}`; }
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&countrycodes=jp&accept-language=ja&limit=5${vb}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return j.map(x => ({name: x.name || x.display_name.split(',')[0], sub: x.display_name, p: [Number(x.lon), Number(x.lat)]}));
  } catch (e) { showErr('名称検索：' + jaErr(e)); return []; }
}
// 住所検索（国土地理院）。検索した文字だけを送る。出発地に近い順に5件
async function searchGsi(q) {
  try {
    const r = await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(q));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    let list = (Array.isArray(j) ? j : []).filter(f => f && f.geometry && Array.isArray(f.geometry.coordinates))
      .map(f => ({name: (f.properties && f.properties.title) || '', sub: '住所（国土地理院）', p: f.geometry.coordinates.map(Number)}))
      .filter(h => h.name && isFinite(h.p[0]) && isFinite(h.p[1]));
    const o = origin();
    if (o) list.sort((a, b) => distM(o, a.p) - distM(o, b.p));
    return list.slice(0, 5);
  } catch (e) { showErr('住所検索：' + jaErr(e)); return []; }
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
  clearRoute(); clearVia(); clearStart(); hideWarn(); waitCalc = false; roughOk = false; loopStart = null; mode = 'to';
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
$('cmpChk').addEventListener('change', () => {
  if ($('cmpChk').checked) { if (route && !route.loop) fetchCmp(route.pts); }
  else { cmpCoords = null; cmpText = ''; setData('cmp', []); showSummary(); }
});
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
  lsSet('walk_favs', JSON.stringify(favs));
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
  if (mode === 'to' && !dest) return;
  if (!(mode === 'loop' && loopStart) && !originOrWarn()) return;
  hideWarn(); waitCalc = false;
  busy = true;
  try { if (mode === 'loop') await calcLoop(); else await calcTo(); }
  catch (e) { showErr(jaErr(e)); status(''); }
  finally {
    busy = false;
    if (pending) { pending = false; calc(); }
  }
}
async function calcTo() {
  const from = origin().slice(), straight = distM(from, dest);
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
  if (sn[0].d > 200) msg += `　※${startPt ? '出発地' : '現在地'}から最寄りの道まで${fmtDist(sn[0].d)}あります`;
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
  if (!loopStart) loopStart = origin().slice(); // 出発点は「周回コースを作る」を押した場所（または地図で選んだ出発地）に固定
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
  } catch (e) { showErr('比較ルートの取得に失敗：' + jaErr(e)); cmpText = ''; }
  showSummary();
}

// ---------- 残り距離の表示 ----------
function updateRemain() {
  if (!route) return;
  const c = route.coords, total = route.cum[route.cum.length - 1];
  let remain = total, a = 0;
  // 地図で選んだ出発地からのルートを見ているだけのとき（歩いていない）は、現在地で進み具合を測らない
  const track = pos && !(startPt && !walk);
  route.rough = !!(track && isRough()); // 位置が粗い間は、到着の判定・外れの注意・案内を出さない
  route.off = 0;
  if (track) {
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
  $('rem').textContent = route.rough ? `残り 約${fmtDist(remain)}（位置が粗いため目安）`
    : remain < 20 ? (route.loop ? '出発点に戻りました' : '目的地付近です') : `残り ${fmtDist(remain)}　約${walkMin(remain, route.remUp)}分`;
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
  if (route.off > 60 && !route.rough) h += '<br><span style="color:#c0392b">ルートから離れています。必要なら「再計算」を押してください</span>';
  $('sub').innerHTML = h;
}
$('ver').textContent = '版 ' + APP_VER;
updLoc();
restoreSession();
