// MichiMiru：あそぶ（踏破マス・スタンプ帳・バーチャル東海道）

// 見つけたとき・着いたときの知らせ（歩行中は左上にも出る。振動の設定がオンなら振動も）
function notify(m) {
  status(m);
  if (walk && $('vibChk').checked && navigator.vibrate) { try { navigator.vibrate([100, 80, 100, 80, 300]); } catch (e) {} }
}

// ---------- 踏破マス（国の地域メッシュの1/8＝約125m四方。緯度3.75秒×経度5.625秒） ----------
const MESH_Y = 3.75 / 3600, MESH_X = 5.625 / 3600;
const meshKey = p => Math.floor(p[1] / MESH_Y) + '_' + Math.floor((p[0] - 100) / MESH_X);
// 歩いた線を20mおきにたどって、通ったマスを数える
function meshOfSegs(segs, add) {
  segs.forEach(([a, b]) => {
    const n = Math.max(1, Math.ceil(distM(a, b) / 20));
    for (let i = 0; i <= n; i++) add(meshKey([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]));
  });
}
function meshBB(k) {
  const [y, x] = k.split('_').map(Number), s = y * MESH_Y, w = 100 + x * MESH_X;
  return {s, w, n: s + MESH_Y, e: w + MESH_X};
}
// c：'w'＝歩いた、'near'＝残り200m以下、'done'＝完全制覇
function meshPoly(k, c) {
  const {s, w, n, e} = meshBB(k);
  return {type: 'Feature', properties: {k, c: c || 'w'}, geometry: {type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}};
}
// 歩行中の記録を除いた分（記録が変わったときにまとめて計算しておき、歩行中は今の記録だけ足す）
let meshBase = new Map(), playCleaned = [], playDist = 0, meshCount = 0, meshToday = 0;
function updPlay(cleaned) {
  playCleaned = cleaned;
  updMesh(false);
  const cur = walk && walk.track, from = tkFrom();
  meshBase = new Map(); playDist = 0;
  cleaned.forEach(({t, c}) => {
    if (t === cur) return;
    meshOfSegs(c.segs, k => { const v = meshBase.get(k); if (v === undefined || t.t0 < v) meshBase.set(k, t.t0); });
    if (t.t0 >= from) playDist += c.dist;
  });
  updStamps();
  playLive();
}
function playLive() {
  const cur = walk && walk.track, cells = new Map(meshBase);
  let dist = playDist;
  if (cur && cur.pts && cur.pts.length >= 2) {
    const c = cleanTrack(cur);
    meshOfSegs(c.segs, k => { if (!cells.has(k)) cells.set(k, cur.t0); });
    if (cur.t0 >= tkFrom()) dist += c.dist;
  }
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  let today = 0; cells.forEach(v => { if (v >= d0.getTime()) today++; });
  meshCount = cells.size; meshToday = today;
  if (walk) meshLive(); // 歩行中は、いま歩いている記録の分だけ「歩いた道」の印を足して完全制覇を調べる
  const doneN = Object.keys(meshDone).length;
  $('meshStat').textContent = `踏破マス：${cells.size}個（今日 新しく${today}個）・🏆完全制覇 ${doneN}個`;
  updPlaySum();
  if ($('meshChk').checked) {
    const f = [...cells.keys()].map(k => meshPoly(k, meshClass(k)));
    Object.keys(meshDone).forEach(k => { if (!cells.has(k)) f.push(meshPoly(k, 'done')); });
    setData('mesh', f);
  } else setData('mesh', []);
  updTokaido(dist);
  updPlaySum();
}
$('meshChk').addEventListener('change', () => { playLive(); showMeshRem(); });

// ---------- マスの完全制覇（版6）：マスの中の道を全部歩いたら金色 ----------
const DONE_M = 30, NEAR_M = 200; // 残り30m未満で完全制覇、残り200m以下は「あと少し」
let meshDone = loadJSON('walk_meshdone', '{}'); // {マス: 完全制覇した時刻}。道が書き足されても外さない
const saveMeshDone = () => lsSet('walk_meshdone', JSON.stringify(meshDone));
let meshInfo = new Map(); // 道のデータの範囲に丸ごと入るマス：{L：道の長さ, W：歩いた長さ, rem：まだ歩いていない道の線}
let meshSel = null, meshPopup = null;
const meshRest = m => Math.max(0, m.L - m.W);
function meshClass(k) {
  if (meshDone[k]) return 'done';
  const m = meshInfo.get(k);
  return m && m.W > 0 && meshRest(m) <= NEAR_M ? 'near' : 'w';
}
// マスごとに、数える道の長さと歩いた長さを出す（道を10mごとに区切って、どのマスにあるかを見る）
function calcMesh(g) {
  const out = new Map();
  if (!g) return out;
  g.edges.forEach(e => {
    if (e.x || g.comp[e.a] !== g.main) return; // 歩道の別線・横断歩道・駐車場の通路・つながっていない道は数えない
    const A = [g.lon[e.a], g.lat[e.a]], B = [g.lon[e.b], g.lat[e.b]], n = Math.max(1, Math.ceil(e.w / 10)), step = e.w / n;
    const at = t => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
    let curK = null, ln = null;
    for (let i = 0; i < n; i++) {
      const k = meshKey(at((i + 0.5) / n));
      let m = out.get(k); if (!m) { m = {L: 0, W: 0, rem: []}; out.set(k, m); }
      m.L += step;
      if (e.k) { m.W += step; continue; }
      if (k === curK && ln) ln.push(at((i + 1) / n));
      else { ln = [at(i / n), at((i + 1) / n)]; m.rem.push(ln); curK = k; }
    }
  });
  const bb = g.bb;
  for (const k of [...out.keys()]) { const b = meshBB(k); if (b.s < bb.s || b.n > bb.n || b.w < bb.w || b.e > bb.e) out.delete(k); }
  out.forEach(m => { m.rem = joinLines(m.rem); });
  return out;
}
// 端がつながっている線を1本にまとめる（「残りの道 ○本」を数えるため）
function joinLines(ls) {
  const same = (p, q) => Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9;
  ls = ls.map(l => l.slice());
  for (let ch = true; ch;) {
    ch = false;
    for (let i = 0; i < ls.length && !ch; i++) for (let j = 0; j < ls.length && !ch; j++) {
      if (i === j) continue;
      const a = ls[i], b = ls[j];
      if (same(a[a.length - 1], b[0])) { ls[i] = a.concat(b.slice(1)); ls.splice(j, 1); ch = true; }
      else if (same(a[a.length - 1], b[b.length - 1])) { ls[i] = a.concat(b.slice(0, -1).reverse()); ls.splice(j, 1); ch = true; }
    }
  }
  return ls;
}
// 完全制覇の判定（live＝歩行中。そのときは1つずつ知らせる）
function updMesh(live) {
  meshInfo = calcMesh(graph);
  const now = Date.now(), neu = [];
  meshInfo.forEach((m, k) => { if (m.L > 0 && m.W > 0 && meshRest(m) < DONE_M && !meshDone[k]) { meshDone[k] = now; neu.push(k); } });
  if (neu.length) {
    saveMeshDone();
    const n = Object.keys(meshDone).length;
    if (live) notify(`🏆 マスを完全制覇！（${n}個目）`);
    else status(`🏆 完全制覇のマスが新しく${neu.length}個になりました（合計${n}個）`);
  }
  drawNearList(); showMeshRem();
}
// 歩行中：前に調べたところから先の記録の点で「歩いた道」の印を足す
function meshLive() {
  const t = walk && walk.track; if (!t || !graph) return;
  const from = Math.max(0, (walk.meshIdx || 0) - 1);
  if (t.pts.length - from < 2) return;
  const ch = markWalkedPts(graph, t.pts.slice(from));
  walk.meshIdx = t.pts.length;
  if (ch) updMesh(true);
}
// マスの説明（タップしたとき・歩行中の左上）
function meshText(k, short) {
  const m = meshInfo.get(k), d = meshDone[k];
  if (d) return short ? 'このマス：🏆完全制覇' : `🏆 完全制覇（${ymd(d).replace(/-/g, '/')}）`;
  if (!m) return short ? '' : (graph ? 'このマスには数える道がないか、道のデータを読み込んだ範囲の外です' : '道のデータを読み込むと、このマスの残りが分かります');
  const r = meshRest(m);
  if (short) return `このマス：あと${fmtDist(r)}`;
  return `このマスはあと${fmtDist(r)}（残りの道 ${m.rem.length}本・歩いた割合 ${Math.round(m.W / m.L * 100)}%）` + (m.W ? '' : '<br>まだ歩いていないマスです');
}
const meshHud = () => (walk && pos && !isRough() && graph) ? meshText(meshKey(pos), true) : '';
// まだ歩いていない道を赤い点線で（タップしたマス、または歩行中に今いるマス）
function showMeshRem() {
  if (!$('meshChk').checked) { setData('meshRem', []); return; }
  const k = meshSel || (walk && pos && !isRough() ? meshKey(pos) : null), m = k && meshInfo.get(k);
  setData('meshRem', m && !meshDone[k] ? m.rem.map(l => line(l)[0]) : []);
}
// 版10：吹き出しは半透明。ほかの場所をタップすると消える（app.js）。消えている状態でマスをタップすると、またそのマスの説明を出す
// 道のデータがないマスには「この辺りの道のデータを読み込む」を付ける
function showMeshAt(p) {
  const k = meshKey(p); meshSel = k; showMeshRem();
  if (meshPopup) meshPopup.remove();
  const noData = !meshInfo.get(k) && !meshDone[k];
  const html = noData ? (graph ? 'このマスの道のデータはまだありません（数える道がない場所のこともあります）' : '道のデータを読み込むと、このマスの残りが分かります') +
    '<br><button class="meshLoad">この辺りの道のデータを読み込む</button>' : meshText(k);
  meshPopup = new mapboxgl.Popup({closeButton: false, closeOnClick: false, className: 'meshPop', maxWidth: '260px'}).setLngLat(p).setHTML(html).addTo(map);
  const b = document.querySelector('.meshPop .meshLoad');
  if (b) b.onclick = e => { e.stopPropagation(); meshLoad(p); };
}
const meshPopOpen = () => !!meshPopup;
function closeMeshPop() {
  if (meshPopup) meshPopup.remove();
  meshPopup = null; meshSel = null; showMeshRem();
}
// タップしたマスのまわり（約2km四方）の道のデータを読み込んで、すぐ残りを出す（現在地に関係なく使える）
async function meshLoad(p) {
  closeMeshPop();
  if (busy) { status('いま計算中です。終わってからもう一度押してください'); return; }
  busy = true;
  try { await ensureGraph(bboxOf([p], 300), bboxOf([p], 1000)); status('この辺りの道のデータを読み込みました'); showMeshAt(p); }
  catch (e) { showErr(jaErr(e)); }
  finally { busy = false; if (pending) { pending = false; calc(); } }
}
// あと少しのマス（残り200m以下、近い順に5つ）
function drawNearList() {
  const c = pos && !isRough() ? pos : origin() || map.getCenter().toArray();
  const arr = [];
  meshInfo.forEach((m, k) => {
    if (meshDone[k] || !m.W || meshRest(m) > NEAR_M) return;
    const b = meshBB(k), ctr = [(b.w + b.e) / 2, (b.s + b.n) / 2];
    arr.push({k, ctr, r: meshRest(m), d: distM(c, ctr)});
  });
  arr.sort((a, b) => a.d - b.d);
  const top = arr.slice(0, 5);
  $('nearList').innerHTML = top.length ? top.map((x, i) =>
    `<div class="hit" data-i="${i}" style="padding:5px 8px">あと${fmtDist(x.r)}で完全制覇<span class="small">　ここから約${fmtDist(x.d)}</span></div>`).join('')
    : `<div class="small" style="padding:4px">${graph ? '道のデータを読み込んだ範囲に、残り200m以下のマスはありません' : '道のデータを読み込むと表示されます'}</div>`;
  $('nearList').querySelectorAll('[data-i]').forEach(el => el.onclick = () => {
    const x = top[Number(el.dataset.i)];
    if (!$('meshChk').checked) { $('meshChk').checked = true; $('meshChk').dispatchEvent(new Event('change')); }
    setFollow(false); map.easeTo({center: x.ctr, zoom: 17}); showMeshAt(x.ctr);
  });
}

// ---------- バーチャル東海道（宿場間の距離は川口市の資料の「おおよその距離」による。出典は画面に表示） ----------
const TOKAIDO = [['日本橋', 0], ['品川宿', 7.9], ['川崎宿', 17.7], ['神奈川宿', 27.5], ['保土ヶ谷宿', 32.4], ['戸塚宿', 41.2], ['藤沢宿', 49.1],
  ['平塚宿', 62.8], ['大磯宿', 65.7], ['小田原宿', 81.4], ['箱根宿', 98.0], ['三島宿', 112.8], ['沼津宿', 118.7], ['原宿', 124.6],
  ['吉原宿', 136.4], ['蒲原宿', 147.6], ['由比宿', 151.5], ['興津宿', 160.7], ['江尻宿', 164.8], ['府中宿', 175.4], ['鞠子宿', 181.1],
  ['岡部宿', 189.0], ['藤枝宿', 195.8], ['島田宿', 204.5], ['金谷宿', 208.4], ['日坂宿', 214.9], ['掛川宿', 222.0], ['袋井宿', 231.6],
  ['見付宿', 237.5], ['浜松宿', 254.0], ['舞坂宿', 264.9], ['新居宿', 270.8], ['白須賀宿', 277.3], ['二川宿', 283.1], ['吉田宿', 289.2],
  ['御油宿', 299.5], ['赤坂宿', 301.2], ['藤川宿', 310.0], ['岡崎宿', 316.7], ['池鯉鮒宿', 331.7], ['鳴海宿', 342.8], ['宮宿', 349.3],
  ['桑名宿', 376.8], ['四日市宿', 389.5], ['石薬師宿', 400.3], ['庄野宿', 403.0], ['亀山宿', 410.9], ['関宿', 416.8], ['坂下宿', 423.3],
  ['土山宿', 433.1], ['水口宿', 443.7], ['石部宿', 457.4], ['草津宿', 469.2], ['大津宿', 483.6], ['京都三条大橋', 495.4]];
const TK_LEN = TOKAIDO[TOKAIDO.length - 1][1];
const tkFrom = () => Number(getLS('walk_tokaido_from')) || 0;
let tkKm = 0, tkNext = null; // 版18：まとめに出す次の宿場 {n：名前, rem：残りkm}
function updTokaido(m) {
  const km = m / 1000, lap = Math.floor(km / TK_LEN), r = km - lap * TK_LEN;
  let i = 0; while (i + 2 < TOKAIDO.length && TOKAIDO[i + 1][1] <= r) i++;
  const nx = TOKAIDO[i + 1], here = i === 0 && lap > 0 ? '京都三条大橋' : TOKAIDO[i][0];
  tkKm = km; tkNext = {n: nx[0], rem: nx[1] - r};
  $('tkText').innerHTML = (lap ? `京都に${lap}回着きました。いま${lap + 1}周目<br>` : '') +
    `${i === 0 ? '日本橋を出発した' : TOKAIDO[i][0] + 'を過ぎた'}ところ（${r.toFixed(1)}km／${TK_LEN}km）<br>次の${nx[0]}まで あと${(nx[1] - r).toFixed(1)}km`;
  // 版18：棒は「いまの宿場から次の宿場まで」の進み具合。上に前後の宿場名
  const a0 = TOKAIDO[i][1], span = nx[1] - a0;
  $('tkBar').style.width = (span > 0 ? Math.min(100, (r - a0) / span * 100) : 0).toFixed(1) + '%';
  $('tkFromN').textContent = i === 0 && lap === 0 ? '日本橋' : TOKAIDO[i][0]; $('tkToN').textContent = nx[0];
  updPlaySum();
  // 宿場に着いたら知らせる（数え直したときや、初めて開いたときは知らせない）
  const prog = lap * (TOKAIDO.length - 1) + i, last = getLS('walk_tokaido_last');
  if (last !== null && prog > Number(last)) {
    const n = prog - Number(last);
    notify(`🏯 ${n > 1 ? `宿場を${n}つ進んで、` : ''}${here}に着きました！`);
  }
  if (last === null || prog !== Number(last)) lsSet('walk_tokaido_last', String(prog));
  if (typeof tkRefresh === 'function') tkRefresh(); // 東海道の地図を開いていれば描き直す
}
twoStep($('tkReset'), '最初からやり直す', () => {
  lsSet('walk_tokaido_from', String(Date.now())); lsSet('walk_tokaido_last', '0');
  drawTracks(); status('バーチャル東海道を日本橋からやり直します（今から歩いた分を数えます）');
});

// ---------- スタンプ帳（名前のある神社・寺・公園の50m以内を通ったら押す。端末にずっと保存） ----------
let stamps = loadJSON('walk_stamps', '{}');
const STAMP_M = 50;
const stampKey = p => `${p.kind}|${p.name}|${p.p[0].toFixed(4)},${p.p[1].toFixed(4)}`;
// 判定する地点：その場所の中心と、寄り道で使う最寄りの道の地点
const stampTargets = (g, p) => [p.p, [g.lon[p.node], g.lat[p.node]]];
function addStamp(p, t) {
  const k = stampKey(p), d = ymd(t); let s = stamps[k], neu = false, ch = false;
  if (!s) { s = stamps[k] = {k: p.kind, n: p.name, p: roundP(p.p), first: t, days: []}; neu = ch = true; }
  if (t < s.first) { s.first = t; ch = true; }
  if (!s.days.includes(d)) { s.days.push(d); ch = true; }
  return {neu, ch};
}
const saveStamps = () => lsSet('walk_stamps', JSON.stringify(stamps));
// 保存されている記録から、読み込んだ範囲のスタンプをまとめて押す（過去の記録の分も）
function updStamps() {
  const g = graph;
  if (g && g.poiList && playCleaned.length) {
    const bb = g.bb, m = 0.003, inB = p => p[0] >= bb.w - m && p[0] <= bb.e + m && p[1] >= bb.s - m && p[1] <= bb.n + m;
    const segs = [];
    playCleaned.forEach(({t, c}) => c.segs.forEach(s => { if (inB(s[0]) || inB(s[1])) segs.push([s[0], s[1], t.t0]); }));
    const idx = segIndex(bb, segs); let ch = false, n = 0;
    g.poiList.forEach(p => {
      if (!p.name) return;
      const hit = new Set();
      stampTargets(g, p).forEach(q => idx.all(q, STAMP_M).forEach(s => hit.add(s[2])));
      hit.forEach(t => { const r = addStamp(p, t); if (r.ch) ch = true; if (r.neu) n++; });
    });
    if (ch) saveStamps();
    if (n) status(`スタンプ帳に${n}か所を追加しました`);
  }
  drawStampList();
}
// 歩行中：今いる場所でスタンプを押す（同じ日に同じ場所は1回だけ）
function stampLive(q) {
  const g = graph; if (!g || !g.poiList || !walk) return;
  const t = walk.t0, today = ymd(t);
  g.poiList.forEach(p => {
    if (!p.name || !stampTargets(g, p).some(x => distM(x, q) <= STAMP_M)) return;
    const k = stampKey(p);
    if (stamps[k] && stamps[k].days.includes(today)) return;
    const r = addStamp(p, t); saveStamps(); drawStampList();
    notify(`${POI[p.kind].ic}${p.name}のスタンプ！${r.neu ? '（はじめて）' : `（${stamps[k].days.length}日目）`}`);
  });
}
function drawStampList() {
  const arr = Object.values(stamps).sort((a, b) => b.first - a.first);
  const cnt = k => arr.filter(s => s.k === k).length;
  $('stampStat').textContent = `スタンプ帳：${POI.shrine.ic}神社 ${cnt('shrine')}・${POI.temple.ic}寺 ${cnt('temple')}・${POI.park.ic}公園 ${cnt('park')}（合計 ${arr.length}か所）`;
  $('stampList').innerHTML = arr.length ? arr.map((s, i) =>
    `<div class="hit" data-i="${i}" style="padding:5px 8px">${POI[s.k].ic}${esc(s.n)}<span class="small">　はじめて ${ymd(s.first).replace(/-/g, '/')}・${s.days.length}日</span></div>`).join('')
    : '<div class="small" style="padding:4px">まだスタンプはありません</div>';
  // タップすると地図でその場所を見せる
  $('stampList').querySelectorAll('[data-i]').forEach(el => el.onclick = () => {
    const s = arr[Number(el.dataset.i)]; setFollow(false); map.easeTo({center: s.p, zoom: 16});
  });
  updPlaySum();
}
// 版18：あそぶタブの上の成績のまとめ（大きな数字4つ）
function updPlaySum() {
  if (!$('ptMesh')) return;
  $('ptMesh').textContent = meshCount;
  $('ptMeshS').textContent = meshToday ? `今日 +${meshToday}` : '';
  $('ptDone').textContent = Object.keys(meshDone).length;
  $('ptStamp').textContent = Object.keys(stamps).length;
  $('ptTk').textContent = tkKm.toFixed(1) + 'km';
  $('ptTkS').textContent = tkNext ? `${tkNext.n}まで ${tkNext.rem.toFixed(1)}km` : '';
}
document.querySelectorAll('#ptiles .pt').forEach(b => b.onclick = () => { const c = $(b.dataset.go); if (c) c.scrollIntoView({behavior: 'smooth', block: 'start'}); });
