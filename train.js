// MichiMiru：電車をはさむルート（版14）。現在地 →（歩く）→ ①乗る駅 →（電車）→ ②降りる駅 →（歩く）→ 目的地
// app.js のあと・ui.js の前に読む。電車の時刻・運賃・乗り換えは出さない（Google マップの経路を開く）
// 画面を消している間はページが止まるので、画面をつけたときに降りる駅の300m以内なら、聞かずに②のルートへ切り替える
const TRIP_LIFE = 6 * 3600000, TR_NEAR = 300, TR_N = 3;
let trMarkers = [], trSel = {a: null, b: null}, trLists = {a: [], b: []}, trRun = 0, tripWait = false;
$('trKm').value = ['0', '1', '2', '3'].includes(getLS('walk_trkm')) ? getLS('walk_trkm') : '0';
try { localStorage.removeItem('walk_owdir'); localStorage.removeItem('walk_owkm'); } catch (e) {} // 版13の片道散歩の設定は使わない
const stName = n => /駅$/.test(n) ? n : n + '駅';
const trLL = p => p[1].toFixed(5) + ',' + p[0].toFixed(5);
const trLink = (a, b) => `https://www.google.com/maps/dir/?api=1&origin=${trLL(a.p)}&destination=${trLL(b.p)}&travelmode=transit`;
const trWaitIdle = async () => { while (busy) await new Promise(r => setTimeout(r, 300)); };

// ---------- 駅のデータ（OpenStreetMap）。約2km四方のマスごとに、まわり約7kmの駅をまとめて取り、端末に30日保存 ----------
async function trStations(p) {
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
    const rail = /^(station|halt)$/.test(t.railway || '');
    if (!rail && !RAIL.some(k => t[k] === 'yes')) return; // バスターミナルなどは除く
    const p2 = [lon, lat], k2 = nm.replace(/駅$/, '').replace(/\s/g, '');
    // 同じ名前で近い（600m以内）ものは1つにまとめる（駅舎・ホーム・路線ごとに別の印があるため）
    const same = list.find(s => s[3] === k2 && distM([s[1], s[2]], p2) <= 600);
    if (same) { if (rail && !same[4]) { same[1] = lon; same[2] = lat; same[4] = 1; } return; }
    list.push([nm, lon, lat, k2, rail ? 1 : 0]);
  });
  const out = list.map(s => [s[0], Number(s[1].toFixed(6)), Number(s[2].toFixed(6))]);
  try { await cachePut(key, {t: Date.now(), list: out}); } catch (e) {}
  return out;
}
// 近い順に n 駅（直線 maxD まで）
function trNearest(list, p, n, maxD) {
  return list.map(([name, lon, lat]) => ({name: stName(name), p: [lon, lat], d: distM(p, [lon, lat])}))
    .filter(s => s.d <= maxD).sort((a, b) => a.d - b.d).slice(0, n);
}
// 降りてから L m 歩く駅：直線で L の0.5〜1.05倍の駅を8方位で1つずつ（最大6駅）選び、目的地までのルートで未踏破の長い順に3つ
async function trFar(list, goal, L, run) {
  const ideal = L / 1.2, lo = L * 0.5, hi = L * 1.05, sec = new Map();
  list.forEach(([name, lon, lat]) => {
    const p = [lon, lat], d = distM(goal, p);
    if (d < lo || d > hi) return;
    const b = (bearing(goal, p) + 360) % 360, k = Math.floor(((b + 22.5) % 360) / 45), err = Math.abs(d - ideal), c = sec.get(k);
    if (!c || err < c.err) sec.set(k, {name: stName(name), p, d, b, err});
  });
  const picks = [...sec.values()].sort((a, b) => a.err - b.err).slice(0, 6).sort((a, b) => a.b - b.b);
  const res = [];
  for (let i = 0; i < picks.length; i++) {
    if (run !== trRun) return null;
    trMsg(`⏳ 降りる駅ごとに目的地までのルートを計算しています（${i + 1}／${picks.length}駅）…`);
    try {
      const s = picks[i];
      await ensureGraph(bboxOf([s.p, goal], MARGIN), bboxOf([s.p, goal], MARGIN + 500));
      if (slopeMode()) await ensureElev(graph);
      const g = graph, sa = snap(g, s.p), sb = snap(g, goal);
      if (sa.i < 0 || sb.i < 0 || sa.d > 300 || sb.d > 300) continue;
      const idx = legsPath(g, [sa.i, sb.i]); if (!idx) continue;
      let len = sa.d + sb.d, ew = 0, un = 0;
      for (let j = 1; j < idx.length; j++) { const e = g.emap.get(edgeKey(idx[j - 1], idx[j])); if (!e) continue; len += e.w; ew += e.w; if (!e.k) un += e.w; }
      res.push(Object.assign({}, s, {len, un, ratio: ew ? un / ew : 1}));
    } catch (e) { /* 道のデータが取れない駅は飛ばす */ }
  }
  status('');
  const ok = res.filter(r => r.len >= L * 0.6 && r.len <= L * 1.6).sort((a, b) => b.un - a.un);
  return (ok.length ? ok : res.sort((a, b) => Math.abs(a.len - L) - Math.abs(b.len - L))).slice(0, TR_N);
}

// ---------- 電車をはさむ欄 ----------
const trMsg = h => { $('trMsg').innerHTML = h; };
function trRender(id, list, key) {
  const hasRec = tracks.some(t => t.k !== 'veh');
  $(id).innerHTML = list.length ? list.map((s, i) => `<button type="button" data-i="${i}">🚉 ${esc(s.name)}<span class="sm">${s.len != null
    ? `歩いて ${fmtDist(s.len)}・約${walkMin(s.len)}分${hasRec ? `・未踏破 ${fmtDist(s.un)}（${Math.round(s.ratio * 100)}%）` : ''}`
    : `直線 ${fmtDist(s.d)}`}</span></button>`).join('') : '<div class="small">見つかりませんでした</div>';
  $(id).querySelectorAll('button').forEach(b => b.onclick = () => { trSel[key] = list[Number(b.dataset.i)]; trMark(); });
  trLists[key] = list; trSel[key] = list[0] || null; trMark();
}
function trMark() {
  ['a', 'b'].forEach(k => $('tr' + k.toUpperCase()).querySelectorAll('button').forEach(b => b.classList.toggle('on', trLists[k][Number(b.dataset.i)] === trSel[k])));
  const ok = trSel.a && trSel.b && trSel.a.name !== trSel.b.name;
  $('trGo').disabled = !ok;
  $('trLink').style.display = ok ? '' : 'none';
  if (ok) $('trLink').href = trLink(trSel.a, trSel.b);
  if (trSel.a && trSel.b && trSel.a.name === trSel.b.name) trMsg('乗る駅と降りる駅が同じです。どちらかを選び直してください。');
}
async function trLoadB(run) {
  const km = Number($('trKm').value);
  $('trB').innerHTML = '<div class="small">⏳ 目的地のまわりの駅を探しています…</div>'; trSel.b = null; trLists.b = []; trMark();
  const list = await trStations(dest);
  if (run !== trRun) return;
  let b;
  if (!km) b = trNearest(list, dest, TR_N, 3000);
  else {
    await trWaitIdle(); busy = true;
    try { b = await trFar(list, dest, km * 1000, run); } finally { busy = false; if (pending) { pending = false; calc(); } }
    if (!b) return;
  }
  trRender('trB', b, 'b');
  trMsg(b.length ? (km ? `目的地から歩いて約${km}kmの駅を、未踏破の長い順に出しています。` : '') : (km ? `目的地から歩いて約${km}kmの駅が見つかりませんでした。距離を変えてください。` : '目的地の3km以内に駅が見つかりませんでした。'));
}
async function trainOpen() {
  if (!dest || mode !== 'to') return;
  const o = origin();
  $('trainBox').classList.add('on'); trUi(); showTab('route');
  const run = ++trRun; trSel = {a: null, b: null}; trMsg('');
  $('trA').innerHTML = '<div class="small">⏳ 現在地のまわりの駅を探しています…</div>'; $('trB').innerHTML = '';
  try {
    if (!o) $('trA').innerHTML = '<div class="small" style="color:#c0392b">現在地が分かりません。「出発地を地図で選ぶ」で出発地を決めてから、もう一度押してください。</div>';
    else { const la = await trStations(o); if (run !== trRun) return; trRender('trA', trNearest(la, o, TR_N, 3000), 'a'); }
    await trLoadB(run);
  } catch (e) { if (run === trRun) trMsg(`<span style="color:#c0392b">${esc(jaErr(e))}</span>`); }
}
function trainClose() { trRun++; $('trainBox').classList.remove('on'); trUi(); }
$('trainBtn').onclick = trainOpen;
$('trCancel').onclick = trainClose;
$('trKm').addEventListener('change', () => {
  lsSet('walk_trkm', $('trKm').value);
  if (!$('trainBox').classList.contains('on') || !dest) return;
  const run = ++trRun; trMsg('');
  trLoadB(run).catch(e => { if (run === trRun) trMsg(`<span style="color:#c0392b">${esc(jaErr(e))}</span>`); });
});
$('trGo').onclick = () => {
  if (!trSel.a || !trSel.b || !dest) return;
  trip = {dest: dest.slice(), destName: destName || '目的地', a: {name: trSel.a.name, p: trSel.a.p}, b: {name: trSel.b.name, p: trSel.b.p}, leg: 1, km: Number($('trKm').value), t: Date.now()};
  saveTrip(); trainClose(); tripApply();
  status(`①${trip.a.name}まで歩くルートを作っています…（電車を降りたら画面をつけてください。②のルートに自動で切り替わります）`);
};

// ---------- ルートの切り替え ----------
function saveTrip() { if (trip) lsSet('walk_trip', JSON.stringify(trip)); }
function clearTrip() {
  trip = null; tripWait = false; trainClose();
  try { localStorage.removeItem('walk_trip'); } catch (e) {}
  trMarkers.forEach(m => m.remove()); trMarkers = [];
  setTimeout(trUi, 0); // 呼んだ側が目的地を消し終えてから
}
function drawTripMarkers() {
  trMarkers.forEach(m => m.remove()); trMarkers = [];
  if (!trip) return;
  [['①乗る ', trip.a], ['②降りる ', trip.b]].forEach(([t, s]) => {
    const el = document.createElement('div'); el.className = 'pmk'; el.textContent = '🚉' + t + s.name.replace(/駅$/, '');
    trMarkers.push(new mapboxgl.Marker({element: el}).setLngLat(s.p).addTo(map));
  });
}
// いまの区間の目的地でルートを作る（①＝乗る駅、②＝最終の目的地）。赤い印はいつも最終の目的地
function tripApply() {
  const t = trip; if (!t) return;
  dest = (t.leg === 1 ? t.a.p : t.dest).slice(); destName = t.leg === 1 ? t.a.name : t.destName;
  clearVia(); mode = 'to'; loopStart = null;
  if (destMarker) destMarker.remove();
  destMarker = new mapboxgl.Marker({color: '#c0392b'}).setLngLat(t.dest).addTo(map);
  drawTripMarkers(); trUi();
  $('recalcBtn').disabled = false;
  calc('to');
}
function tripSwitch(leg, auto) {
  if (!trip) return;
  trip.leg = leg; saveTrip();
  // 降りる駅の近くにいる（自動）か①に戻すときは現在地から。手で②にしたときは降りる駅から
  if (leg === 2 && !auto) {
    startPt = trip.b.p.slice(); waitCalc = false; hideWarn();
    if (startMarker) startMarker.remove();
    startMarker = new mapboxgl.Marker({color: '#27ae60'}).setLngLat(startPt).addTo(map);
    $('fromClear').style.display = ''; updLoc();
  } else clearStart();
  tripApply();
  const m = leg === 2 ? `${trip.b.name}${auto ? 'に着いたので' : 'から'}、${trip.destName}までのルートに切り替えました` : `①${trip.a.name}までのルートに戻しました`;
  status(m);
  if (walk) { walk.note = m; walk.noteUntil = Date.now() + 15000; renderHud(); }
  if (auto && walk && $('vibChk').checked && CAN_VIB) { try { navigator.vibrate([200, 100, 200]); } catch (e) {} }
}
// 位置が届くたびに：降りる駅の300m以内なら②へ（①のときだけ）。true＝切り替えた
function tripCheck() {
  if (!trip || trip.leg !== 1 || !pos || isRough()) return false;
  if (distM(pos, trip.b.p) > TR_NEAR) return false;
  tripSwitch(2, true); return true;
}
function tripOnPos() {
  if (tripWait && pos && !isRough()) { tripWait = false; if (!tripCheck()) tripApply(); return; }
  tripCheck();
}
$('trSwitch').onclick = () => { if (trip) tripSwitch(trip.leg === 1 ? 2 : 1, false); };
// ルートのカードの1行
function tripLine() {
  const t = trip, a = esc(t.a.name), b = esc(t.b.name), d = esc(t.destName);
  return (t.leg === 1
    ? `🚃 電車をはさむ：<b>①${a}まで歩く</b> → 電車 → ②${b}から${d}まで歩く<br>電車を降りたら画面をつけてください。${b}の近く（300m以内）なら、②のルートに自動で切り替わります。`
    : `🚃 電車をはさむ：①${a}（済み）→ 電車 → <b>②${b}から${d}まで歩く</b>`)
    + ` <a class="trT" href="${trLink(t.a, t.b)}" target="_blank" rel="noopener">🚃 乗換を調べる</a>`;
}
// ボタンの出し入れ
function trUi() {
  $('trainBtn').style.display = !trip && mode === 'to' && dest && !$('trainBox').classList.contains('on') ? '' : 'none';
  $('trSwitch').style.display = trip ? '' : 'none';
  if (trip) $('trSwitch').textContent = trip.leg === 1 ? `⏭ ②${trip.b.name}からにする` : `⏮ ①${trip.a.name}までに戻す`;
  if (trip) $('favAdd').disabled = true; // お気に入りには最終の目的地を入れたいので、ルートの途中では登録しない
}
setInterval(trUi, 500);
// 開き直したとき：6時間以内の計画なら続きから（歩行の再開は30分までなので、別に覚えている）
(function tripRestore() {
  const t = loadJSON('walk_trip', 'null');
  if (!t || !t.a || !t.b || !(Date.now() - t.t < TRIP_LIFE)) { try { localStorage.removeItem('walk_trip'); } catch (e) {} return; }
  trip = t;
  if (walk && route) { // 歩行の続き（ルートも戻っている）：印だけ直す
    if (destMarker) destMarker.remove();
    destMarker = new mapboxgl.Marker({color: '#c0392b'}).setLngLat(t.dest).addTo(map);
    drawTripMarkers(); trUi(); tripCheck();
  } else if (pos && !isRough()) { if (!tripCheck()) tripApply(); }
  else { tripWait = true; drawTripMarkers(); trUi(); dest = (t.leg === 1 ? t.a.p : t.dest).slice(); destName = t.leg === 1 ? t.a.name : t.destName; }
  status(`前回の「電車をはさむ」ルートの続きです（${t.leg === 1 ? '①' + t.a.name + 'まで' : '②' + t.b.name + 'から' + t.destName + 'まで'}）`);
})();
