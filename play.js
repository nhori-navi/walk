// MichiMiru：あそぶ（踏破マス・スタンプ帳・バーチャル東海道）

// 見つけたとき・着いたときの知らせ（歩行中は左上にも出る。振動の設定がオンなら振動も）
function notify(m) {
  status(m);
  if (walk && $('vibChk').checked && navigator.vibrate) { try { navigator.vibrate([100, 80, 100, 80, 300]); } catch (e) {} }
}
const pad2 = n => String(n).padStart(2, '0');
const ymd = t => { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
function setLS(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function getLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

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
function meshPoly(k) {
  const [y, x] = k.split('_').map(Number), s = y * MESH_Y, w = 100 + x * MESH_X, n = s + MESH_Y, e = w + MESH_X;
  return {type: 'Feature', properties: {}, geometry: {type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}};
}
// 歩行中の記録を除いた分（記録が変わったときにまとめて計算しておき、歩行中は今の記録だけ足す）
let meshBase = new Map(), playCleaned = [], playDist = 0, meshCount = 0;
function updPlay(cleaned) {
  playCleaned = cleaned;
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
  meshCount = cells.size;
  $('meshStat').textContent = `踏破マス：${cells.size}個（今日 新しく${today}個）`;
  setData('mesh', $('meshChk').checked ? [...cells.keys()].map(meshPoly) : []);
  updTokaido(dist);
  updPlaySum();
}
$('meshChk').addEventListener('change', playLive);

// ---------- バーチャル東海道（宿場間の距離は川口市の資料の「おおよその距離」による） ----------
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
let tkKm = 0;
function updTokaido(m) {
  const km = m / 1000, lap = Math.floor(km / TK_LEN), r = km - lap * TK_LEN;
  let i = 0; while (i + 2 < TOKAIDO.length && TOKAIDO[i + 1][1] <= r) i++;
  const nx = TOKAIDO[i + 1], here = i === 0 && lap > 0 ? '京都三条大橋' : TOKAIDO[i][0];
  tkKm = km;
  $('tkText').innerHTML = (lap ? `京都に${lap}回着きました。いま${lap + 1}周目<br>` : '') +
    `${i === 0 ? '日本橋を出発した' : TOKAIDO[i][0] + 'を過ぎた'}ところ（${r.toFixed(1)}km／${TK_LEN}km）<br>次の${nx[0]}まで あと${(nx[1] - r).toFixed(1)}km`;
  $('tkBar').style.width = (r / TK_LEN * 100).toFixed(1) + '%';
  // 宿場に着いたら知らせる（数え直したときや、初めて開いたときは知らせない）
  const prog = lap * (TOKAIDO.length - 1) + i, last = getLS('walk_tokaido_last');
  if (last !== null && prog > Number(last)) {
    const n = prog - Number(last);
    notify(`🏯 ${n > 1 ? `宿場を${n}つ進んで、` : ''}${here}に着きました！`);
  }
  if (last === null || prog !== Number(last)) setLS('walk_tokaido_last', String(prog));
}
twoStep($('tkReset'), '最初からやり直す', () => {
  setLS('walk_tokaido_from', String(Date.now())); setLS('walk_tokaido_last', '0');
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
const saveStamps = () => setLS('walk_stamps', JSON.stringify(stamps));
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
function updPlaySum() {
  $('playSum').textContent = `あそぶ（踏破マス ${meshCount}・スタンプ ${Object.keys(stamps).length}・東海道 ${tkKm.toFixed(1)}km）`;
}
