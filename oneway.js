// MichiMiru：片道散歩（版13）。「電車で出て歩いて帰る」「歩いて駅まで行って電車で帰る」コースを、まわりの駅ごとに計算して、未踏破の長い順に出す
// app.js のあと・ui.js の前に読む
const OW_N = 6, OW_SHOW = 3; // 計算する駅の数・出す数
let owRun = 0, owMarkers = [], owRes = [];
$('owDir').value = getLS('walk_owdir') === 'go' ? 'go' : 'home';
$('owKm').value = ['2', '3', '4', '5', '6'].includes(getLS('walk_owkm')) ? getLS('walk_owkm') : '3';
// 「帰る場所」（駅まで行く向きのときは「出発する場所」）の選択肢：現在地（または地図で選んだ出発地）とお気に入り
function owFillBase() {
  const sel = $('owBase'), v = sel.value;
  sel.innerHTML = '<option value="here">現在地（地図で選んだ出発地があればそこ）</option>' +
    favs.map((f, i) => `<option value="f${i}">★${esc(f.name)}</option>`).join('');
  sel.value = [...sel.options].some(o => o.value === v) ? v : 'here';
}
function owLabel() { $('owBaseLbl').textContent = $('owDir').value === 'go' ? '出発する場所' : '帰る場所'; }
owFillBase(); owLabel();
$('owDir').addEventListener('change', () => { lsSet('walk_owdir', $('owDir').value); owLabel(); owClear(); });
$('owKm').addEventListener('change', () => { lsSet('walk_owkm', $('owKm').value); owClear(); });
$('owBase').addEventListener('change', owClear);
const owMsg = h => { $('owMsg').innerHTML = h; };
function owClearMarkers() { owMarkers.forEach(m => m.remove()); owMarkers = []; }
function owClear() { owRun++; owRes = []; owClearMarkers(); $('owList').innerHTML = ''; owMsg(''); $('owStop').style.display = 'none'; $('owBtn').disabled = false; }
const stName = n => /駅$/.test(n) ? n : n + '駅';
// 乗換の調べ方：Google マップの経路（公共交通）。押したときだけ Google に位置が渡る
function owLink(o) {
  const ll = p => p[1].toFixed(5) + ',' + p[0].toFixed(5);
  return o.dir === 'go'
    ? `https://www.google.com/maps/dir/?api=1&origin=${ll(o.p)}&destination=${ll(round500(o.base))}&travelmode=transit`
    : `https://www.google.com/maps/dir/?api=1&destination=${ll(o.p)}&travelmode=transit`;
}
// 帰る場所の座標と名前。現在地が分からない（ずれが大きい）ときは null
function owBase() {
  const v = $('owBase').value;
  if (v !== 'here') { const f = favs[Number(v.slice(1))]; return f ? {p: f.p.slice(), name: f.name, here: false} : null; }
  // 片道散歩で「駅から帰る」を選んだあとは、出発地が駅になっているので、そのときの帰る場所を使う
  if (owSel && owSel.dir === 'home' && startPt && distM(startPt, owSel.p) < 1) return {p: owSel.base.slice(), name: owSel.baseName, here: owSel.here};
  if (startPt) return {p: startPt.slice(), name: '地図で選んだ場所', here: false};
  if (!pos || (isRough() && !roughOk)) return null;
  return {p: pos.slice(), name: '現在地', here: true};
}
// ---------- 駅のデータ（OpenStreetMap）。約2km四方のマスごとに、まわり約7kmの駅をまとめて取り、端末に30日保存 ----------
async function owStations(p) {
  const tx = Math.floor(p[0] / TILE), ty = Math.floor(p[1] / TILE), key = 'st:' + tileKey(tx, ty);
  try { const c = await cacheGet(key); if (c && Date.now() - c.t < CACHE_DAYS * 864e5) return c.list; } catch (e) {}
  const d = 0.07, box = bboxStr({s: ty * TILE - d, w: tx * TILE - d, n: (ty + 1) * TILE + d, e: (tx + 1) * TILE + d});
  let els;
  try {
    els = await ovpQueue(`[out:json][timeout:40];(nwr["railway"~"^(station|halt)$"](${box});nwr["public_transport"="station"](${box}););out tags center;`, OVP_LIMIT);
  } catch (e) { throw new Error('駅の' + e.message); }
  const RAIL = ['train', 'subway', 'light_rail', 'monorail', 'tram'];
  const list = [];
  els.forEach(e => {
    const t = e.tags || {}, nm = (t.name || '').trim();
    const lon = e.lon != null ? e.lon : e.center && e.center.lon, lat = e.lat != null ? e.lat : e.center && e.center.lat;
    if (!nm || lon == null || lat == null) return;
    if (t.disused || t.abandoned || /^(disused|abandoned|construction|proposed)/.test(t.railway || '')) return;
    if (!/^(station|halt)$/.test(t.railway || '') && !RAIL.some(k => t[k] === 'yes')) return; // バスターミナルなどは除く
    const p2 = [lon, lat], key2 = nm.replace(/駅$/, '').replace(/\s/g, '');
    // 同じ名前で近い（600m以内）ものは1つにまとめる（駅舎・ホーム・路線ごとに別の印があるため）
    const same = list.find(s => s[3] === key2 && distM([s[1], s[2]], p2) <= 600);
    if (same) { if (/^(station|halt)$/.test(t.railway || '') && !same[4]) { same[1] = lon; same[2] = lat; same[4] = 1; } return; }
    list.push([nm, lon, lat, key2, /^(station|halt)$/.test(t.railway || '') ? 1 : 0]);
  });
  const out = list.map(s => [s[0], Number(s[1].toFixed(6)), Number(s[2].toFixed(6))]);
  try { await cachePut(key, {t: Date.now(), list: out}); } catch (e) {}
  return out;
}
// 歩く距離に合う駅を、方角が偏らないように選ぶ（8方位で1つずつ、目安の距離に近い順に最大6駅）。並びは方角の順（道のデータを使い回しやすく）
function owPick(list, base, L) {
  const ideal = L / 1.25, lo = L * 0.45, hi = Math.min(L * 0.85, MAX_M);
  const sec = new Map();
  list.forEach(([name, lon, lat]) => {
    const p = [lon, lat], d = distM(base, p);
    if (d < lo || d > hi) return;
    const b = (bearing(base, p) + 360) % 360, k = Math.floor(((b + 22.5) % 360) / 45);
    const err = Math.abs(d - ideal), c = sec.get(k);
    if (!c || err < c.err) sec.set(k, {name, p, d, b, err});
  });
  return [...sec.values()].sort((a, b) => a.err - b.err).slice(0, OW_N).sort((a, b) => a.b - b.b);
}
// 1駅分のルート（延長・寄り道は使わず、未踏破・坂・遊歩道の好みだけで）
async function owRoute(st, base, dir) {
  const a = dir === 'go' ? base : st.p, b = dir === 'go' ? st.p : base;
  await ensureGraph(bboxOf([a, b], MARGIN), bboxOf([a, b], MARGIN + 500));
  if (slopeMode()) await ensureElev(graph);
  const g = graph, sa = snap(g, a), sb = snap(g, b);
  if (sa.i < 0 || sb.i < 0 || sa.d > 300 || sb.d > 300) return null;
  const idx = legsPath(g, [sa.i, sb.i]); if (!idx) return null;
  let len = sa.d + sb.d, ew = 0, un = 0, up = 0; // 未踏破の割合は、ルートのカードと同じく道の上の長さで出す
  for (let i = 1; i < idx.length; i++) {
    const e = g.emap.get(edgeKey(idx[i - 1], idx[i])); if (!e) continue;
    len += e.w; ew += e.w; if (!e.k) un += e.w;
    if (g.ele) { const dh = g.ele[idx[i]] - g.ele[idx[i - 1]]; if (dh > 0) up += dh; }
  }
  return {name: stName(st.name), p: st.p, len, un, up, ratio: ew ? un / ew : 1};
}
$('owStop').onclick = () => { owRun++; owMsg('やめました。'); $('owStop').style.display = 'none'; $('owBtn').disabled = false; };
$('owBtn').onclick = async () => {
  if (busy) { owMsg('ほかの計算をしています。少し待ってからもう一度押してください。'); return; }
  const base = owBase(), dir = $('owDir').value, L = Number($('owKm').value) * 1000;
  if (!base) { owMsg('<span style="color:#c0392b">現在地が分からない（またはずれが大きい）ため探せません。「出発地を地図で選ぶ」で場所を決めるか、お気に入りから選んでください。</span>'); return; }
  owClear(); const run = owRun;
  $('owBtn').disabled = true; $('owStop').style.display = '';
  busy = true;
  try {
    owMsg('⏳ まわりの駅を探しています…'); await pause();
    const list = await owStations(base.p);
    if (run !== owRun) return;
    const picks = owPick(list, base.p, L);
    if (!picks.length) {
      owMsg(`歩く距離（${L / 1000}km）に合う駅が見つかりませんでした（${base.name}から直線で${fmtDist(L * 0.45)}〜${fmtDist(Math.min(L * 0.85, MAX_M))}の駅を探しました。まわりに見つかった駅：${list.length}）。距離を変えて試してください。`);
      return;
    }
    // 地図に候補の駅を出して、全体が見えるように
    picks.forEach(s => {
      const el = document.createElement('div'); el.className = 'pmk'; el.textContent = '🚉' + stName(s.name).replace(/駅$/, '');
      owMarkers.push(new mapboxgl.Marker({element: el}).setLngLat(s.p).addTo(map));
    });
    if (!walk) { const bb = new mapboxgl.LngLatBounds(); bb.extend(base.p); picks.forEach(s => bb.extend(s.p)); setFollow(false); map.fitBounds(bb, {padding: 50, maxZoom: 15}); }
    let fails = 0, lastErr = null;
    for (let i = 0; i < picks.length; i++) {
      if (run !== owRun) return;
      owMsg(`⏳ 駅ごとにルートを計算しています（${i + 1}／${picks.length}駅：${esc(stName(picks[i].name))}）…`);
      await pause();
      try { const r = await owRoute(picks[i], base.p, dir); if (r) { owRes.push(r); owRender(base, dir, L); } }
      catch (e) { fails++; lastErr = e; }
    }
    if (run !== owRun) return;
    status('');
    if (!owRes.length) {
      owMsg(`<span style="color:#c0392b">ルートを作れませんでした${lastErr ? '：' + esc(jaErr(lastErr)) : ''}</span>`);
      return;
    }
    const memo = Number($('ext').value) || poiKinds().length ? '<br>※候補は延長・寄り道なしの長さです。選ぶと、今の道の好み（延長・寄り道も）でルートを作ります。' : '';
    owMsg(`${picks.length}駅を調べて、未踏破の長い順に出しています。${fails ? `（${fails}駅は道のデータが取れず、調べられませんでした）` : ''}${memo}`);
  } catch (e) {
    if (run === owRun) owMsg(`<span style="color:#c0392b">${esc(jaErr(e))}</span>`);
  } finally {
    busy = false;
    if (run === owRun) { $('owBtn').disabled = false; $('owStop').style.display = 'none'; }
    if (pending) { pending = false; calc(); }
  }
};
// 候補を並べる：歩く距離の6割〜1.5倍に入るものを未踏破の長い順に。入るものがなければ距離の近い順
function owRender(base, dir, L) {
  const ok = owRes.filter(r => r.len >= L * 0.6 && r.len <= L * 1.5).sort((a, b) => b.un - a.un);
  const rest = owRes.filter(r => !ok.includes(r)).sort((a, b) => Math.abs(a.len - L) - Math.abs(b.len - L));
  const show = (ok.length ? ok : rest).slice(0, OW_SHOW);
  const hasRec = tracks.some(t => t.k !== 'veh');
  $('owList').innerHTML = show.map((r, i) => `<div class="owItem">
    <b>${dir === 'go' ? `${esc(base.name)} → 🚉 ${esc(r.name)}` : `🚉 ${esc(r.name)} → ${esc(base.name)}`}</b><br>
    ${fmtDist(r.len)}・約${walkMin(r.len, r.up)}分${hasRec ? `・未踏破 ${fmtDist(r.un)}（${Math.round(r.ratio * 100)}%）` : ''}
    <div class="acts"><button class="primary" data-ow="${owRes.indexOf(r)}">このコースにする</button><a class="owT" href="${owLink({dir, p: r.p, base: base.p})}" target="_blank" rel="noopener">🚃 乗換を調べる</a></div></div>`).join('')
    + (!ok.length && show.length ? '<div class="small">歩く距離に近いコースが見つからなかったので、近いものを出しています。</div>' : '');
  $('owList').querySelectorAll('button[data-ow]').forEach(b => b.onclick = () => owChoose(owRes[Number(b.dataset.ow)], base, dir));
}
// 選んだコースで、ふつうのルートを作る（駅から帰る：出発地＝駅・目的地＝帰る場所／駅まで行く：目的地＝駅）
function owChoose(r, base, dir) {
  owClearMarkers();
  mode = 'to'; loopStart = null; dest = null;
  const start = p => {
    startPt = p; waitCalc = false; hideWarn();
    if (startMarker) startMarker.remove();
    startMarker = new mapboxgl.Marker({color: '#27ae60'}).setLngLat(p).addTo(map);
    $('fromClear').style.display = ''; updLoc();
  };
  if (dir === 'go') {
    if (base.here) clearStart(); else start(base.p); // 現在地から出るときは、地図で選んだ出発地（前に選んだ駅など）を外す
    destName = r.name; setDest(r.p);
  } else {
    start(r.p);
    destName = base.here ? '帰る場所（' + nowHM() + 'の現在地）' : base.name; setDest(base.p);
  }
  owSel = {name: r.name, dir, p: r.p, base: base.p, baseName: base.name, here: base.here};
  showTab('route'); $('panel').scrollTop = 0;
  status(dir === 'go' ? `${r.name}までのルートを作っています…` : `${r.name}から歩いて帰るルートを作っています…（駅に着いたら🚶を押してください）`);
}
