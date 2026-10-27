// MichiMiru：東海道の地図（版6）。バーチャル東海道の「いまここ」を、旧東海道の道筋の上に出す
// 宿場の位置：国土地理院の住所検索で、各宿場の本陣があった今の町名（日本橋・三条大橋は橋のある町）を調べたもの。
// TOKAIDO（play.js）と同じ順の55か所。地図では、旧東海道の道筋に寄せて（3km以内）表示する
const TK_POS = [
  [139.77534, 35.6829], [139.74309, 35.61821], [139.70312, 35.5333], [139.63237, 35.47501], [139.59395, 35.4445],
  [139.52734, 35.39108], [139.48299, 35.34788], [139.34848, 35.33527], [139.31656, 35.31383], [139.16057, 35.25021],
  [139.03778, 35.18973], [138.91402, 35.1191], [138.85667, 35.09566], [138.78853, 35.12725], [138.68677, 35.16274],
  [138.60045, 35.13126], [138.56848, 35.11449], [138.51431, 35.05503], [138.48146, 35.02029], [138.38332, 34.97421],
  [138.34184, 34.9496], [138.29739, 34.92077], [138.25951, 34.87219], [138.17563, 34.8322], [138.12889, 34.82278],
  [138.08109, 34.8113], [138.01631, 34.77285], [137.923, 34.74766], [137.85896, 34.7362], [137.72862, 34.70481],
  [137.61539, 34.68724], [137.57321, 34.68784], [137.50543, 34.69579], [137.45256, 34.72275], [137.39012, 34.76666],
  [137.31277, 34.84681], [137.30444, 34.85856], [137.21689, 34.91098], [137.17172, 34.95719], [137.04103, 35.00815],
  [136.95337, 35.08648], [136.90855, 35.12008], [136.69566, 35.06872], [136.62683, 34.97149], [136.53847, 34.91056],
  [136.52562, 34.88189], [136.44861, 34.85934], [136.39302, 34.8526], [136.32933, 34.87989], [136.29341, 34.93964],
  [136.17691, 34.96944], [136.05899, 35.00976], [135.96391, 35.01724], [135.8651, 35.00626], [135.77292, 35.00916]];
const TK_REL = 5185746;   // OpenStreetMap の「旧東海道」の登録（route のまとまり）
const TK_SEA = 41;        // 宮宿 → 桑名宿（七里の渡し）は海の上なので、宿場どうしを点線で結ぶ
const TK_KEY = 'tokaido_v1', TK_LIFE = 90 * 864e5; // 道筋は端末に90日保存
let tkData = null, tkMarker = null, tkHere = null;
const tkOn = () => mapMode === 'tk';

// ---------- 道筋を作る ----------
// OpenStreetMap の旧東海道の道（順番はばらばら）を線の網にして、宿場から次の宿場までの道筋を探す
function tkBuild(els) {
  const id = new Map(), P = [], adj = [];
  const node = (lon, lat) => {
    const k = lon.toFixed(6) + ',' + lat.toFixed(6);
    let i = id.get(k); if (i === undefined) { i = P.length; id.set(k, i); P.push([lon, lat]); adj.push([]); }
    return i;
  };
  (els || []).forEach(e => {
    if (e.type !== 'way' || !Array.isArray(e.geometry)) return;
    let prev = -1;
    e.geometry.forEach(g => {
      if (!g || g.lon == null) { prev = -1; return; }
      const i = node(g.lon, g.lat);
      if (prev >= 0 && prev !== i) { const w = distM(P[prev], P[i]); adj[prev].push([i, w]); adj[i].push([prev, w]); }
      prev = i;
    });
  });
  // 宿場ごとに、いちばん近い道の点（3km以内）
  const snap = TK_POS.map(p => {
    let bi = -1, bd = 3000;
    for (let i = 0; i < P.length; i++) { if (!adj[i].length) continue; const d = distM(p, P[i]); if (d < bd) { bd = d; bi = i; } }
    return bi;
  });
  const st = TK_POS.map((p, i) => snap[i] >= 0 ? P[snap[i]] : p);
  const secs = [];
  for (let i = 0; i < TK_POS.length - 1; i++) {
    const want = (TOKAIDO[i + 1][1] - TOKAIDO[i][1]) * 1000;
    let path = null;
    if (i !== TK_SEA && snap[i] >= 0 && snap[i + 1] >= 0) path = tkPath(P, adj, snap[i], snap[i + 1], want * 2);
    // 資料の距離とかけ離れた道筋（遠回り・近道すぎ）は使わない
    if (path) { const L = cumOf(path).pop(); if (L < want * 0.6 || L > want * 1.7) path = null; }
    secs.push(path ? {c: tkThin(path), ok: 1} : {c: [st[i], st[i + 1]], ok: 0});
  }
  return {st, secs, t: Date.now()};
}
// いちばん短い道筋（ダイクストラ法）。lim（m）を超えたらあきらめる
function tkPath(P, adj, s, t, lim) {
  const dist = new Map([[s, 0]]), prev = new Map(), h = [[0, s]];
  const push = x => { h.push(x); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } };
  const pop = () => {
    const top = h[0], last = h.pop();
    if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
      if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r;
      if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } }
    return top;
  };
  while (h.length) {
    const [d, v] = pop();
    if (v === t) break;
    if (d > dist.get(v)) continue;
    if (d > lim) return null;
    for (const [u, w] of adj[v]) { const nd = d + w; if (nd < (dist.has(u) ? dist.get(u) : Infinity)) { dist.set(u, nd); prev.set(u, v); push([nd, u]); } }
  }
  if (!dist.has(t) || s === t) return null;
  const out = []; for (let v = t; v !== undefined; v = prev.get(v)) out.push(P[v]);
  return out.reverse();
}
// 15mより細かい点は間引いて保存を軽くする
function tkThin(c) {
  const o = [c[0]];
  for (let i = 1; i < c.length - 1; i++) if (distM(o[o.length - 1], c[i]) >= 15) o.push(c[i]);
  o.push(c[c.length - 1]);
  return o.map(roundP);
}
// 道筋を用意する（端末に保存したものがあればそれ。なければ OpenStreetMap から一度だけ取る）
async function tkLoad() {
  if (tkData) return tkData;
  try { const c = await cacheGet(TK_KEY); if (c && c.secs && Date.now() - c.t < TK_LIFE) return (tkData = c); } catch (e) {}
  tkMsg('旧東海道の道筋を OpenStreetMap から取得中…（初めの1回だけ。数十秒かかることがあります）');
  try {
    const els = await overpass(`[out:json][timeout:180];rel(${TK_REL});>>;way._;out geom;`, 120000);
    const d = tkBuild(els);
    if (d.secs.some(x => x.ok)) { try { await cachePut(TK_KEY, d); } catch (e) {} } // 1区間も取れなかったときは保存しない
    return (tkData = d);
  } catch (e) {
    showErr('旧東海道の道筋：' + jaErr(e));
    return tkBuild([]); // 宿場どうしを直線で結んだもの（保存しないので、次に開いたときにもう一度取りに行く）
  }
}

// ---------- 地図に出す ----------
function tkWhere(km) {
  const lap = Math.floor(km / TK_LEN), r = km - lap * TK_LEN;
  let i = 0; while (i + 2 < TOKAIDO.length && TOKAIDO[i + 1][1] <= r) i++;
  return {lap, r, i, f: (r - TOKAIDO[i][1]) / (TOKAIDO[i + 1][1] - TOKAIDO[i][1])};
}
const tkMsg = m => { if (tkOn()) mbSet('🏯 ' + esc(m)); };
const tkLineF = (c, done, gap) => ({type: 'Feature', properties: {d: done ? 1 : 0, g: gap ? 1 : 0}, geometry: {type: 'LineString', coordinates: c}});
function tkDraw(d, fly) {
  const w = tkWhere(tkKm), feats = [];
  let here = d.st[w.i];
  d.secs.forEach((s, i) => {
    const gap = !s.ok;
    if (i < w.i) feats.push(tkLineF(s.c, 1, gap));
    else if (i > w.i) feats.push(tkLineF(s.c, 0, gap));
    else {
      // いまの区間：資料の距離の割合を、地図の道筋の長さに当てはめる
      const cum = cumOf(s.c), at = cum[cum.length - 1] * Math.min(1, Math.max(0, w.f));
      here = pointAt(s.c, cum, at);
      const a = [], b = [here];
      s.c.forEach((p, k) => { if (cum[k] < at) a.push(p); else b.push(p); });
      a.push(here);
      if (a.length > 1) feats.push(tkLineF(a, 1, gap));
      if (b.length > 1) feats.push(tkLineF(b, 0, gap));
    }
  });
  setData('tkLine', feats);
  setData('tkSt', d.st.map((p, i) => ({type: 'Feature', properties: {n: TOKAIDO[i][0], d: i <= w.i ? 1 : 0}, geometry: {type: 'Point', coordinates: p}})));
  tkHere = here;
  if (!tkMarker) { const el = document.createElement('div'); el.className = 'tkme'; el.textContent = '🚶'; tkMarker = new mapboxgl.Marker({element: el}); }
  tkMarker.setLngLat(here).addTo(map);
  if (fly) { const wait = Math.max(0, 1200 - (Date.now() - tkOpenAt)); setTimeout(() => { if (tkOn()) map.flyTo({center: here, zoom: 13, duration: 2000}); }, wait); } // 版27：引いてから寄る
  const nx = TOKAIDO[w.i + 1], ng = d.secs.filter(s => !s.ok).length - 1; // 七里の渡しは数えない
  const ll = `${here[1].toFixed(6)},${here[0].toFixed(6)}`;
  // 帯の1行：「🏯 品川宿＋8.1km・川崎宿まで 1.7km」。詳しいことは ⓘ の中
  const failed = ng >= d.secs.length - 1;
  mbSet(`🏯 ${w.lap ? `${w.lap + 1}周目・` : ''}${esc(TOKAIDO[w.i][0])}＋${(w.r - TOKAIDO[w.i][1]).toFixed(1)}km・${esc(nx[0])}まで ${(nx[1] - w.r).toFixed(1)}km` + (failed ? '（道筋が取れず直線）' : ''),
    (failed ? '<button id="tkRetry" type="button" class="primary" style="margin:0 0 6px">↻ 旧東海道の道筋を取り直す</button><br>' : '') +
    `${w.i === 0 ? '日本橋を出発して' : esc(TOKAIDO[w.i][0]) + 'を過ぎて'} ${(w.r - TOKAIDO[w.i][1]).toFixed(1)}km（${esc(nx[0])}まで あと ${(nx[1] - w.r).toFixed(1)}km）。全行程 ${w.r.toFixed(1)}km／${TK_LEN}km` +
    (w.lap ? `（京都に${w.lap}回着きました）` : '') + '<br>' +
    (w.i === TK_SEA ? '宮宿から桑名宿までは「七里の渡し」（船）で海の上を進みます。<br>' : '') +
    (ng >= d.secs.length - 1 ? '旧東海道の道筋が取れなかったため、宿場どうしを直線で結んでいます（次に開いたときにもう一度取りに行きます）。'
      : ng > 0 ? `道筋：OpenStreetMap の旧東海道（${ng}区間は道筋が分からず、宿場どうしを点線で結んでいます）。` : '道筋：OpenStreetMap の旧東海道。') +
    `<br><a target="_blank" rel="noopener" href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}">ストリートビューで見る</a>　` +
    `<a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${ll}">Googleマップで見る</a>`);
  if (failed) $('mbar').classList.add('open'); // 取れなかったときは ⓘ を開いて「取り直す」を見せる
  const rb = $('tkRetry'); if (rb) rb.onclick = e => { e.stopPropagation(); tkData = null; modeClose(); tkOpen(); }; // 版27：取れなかったら、もう一度
}
// 版27：押したらすぐ地図を切り替えて、日本橋〜京都の全体まで引いてから、今の位置へ寄る（旅の地図と同じ引きの動き）。
// 初めの1回は道筋を取ってくるので、準備中をはっきり出す。準備中にもう一度押したら、待っていることを知らせる
let tkBusy = false, tkOpenAt = 0;
async function tkOpen() {
  if (mapMode === 'tk') { status(tkBusy ? '⏳ 旧東海道の道筋を取ってきています。もう少しお待ちください' : '東海道の地図を開いています（閉じるのは下の帯の ✕）'); return; }
  if (!modeOpen('tk', tkClear)) return;
  tkOpenAt = Date.now();
  try { let w = 180, s = 90, e = -180, n = -90; TK_POS.forEach(p => { w = Math.min(w, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]); }); map.fitBounds([[w, s], [e, n]], {padding: 30, duration: 1000}); } catch (e) {}
  if (!tkData) { mbSet('🏯 ⏳ 東海道の地図を準備中…', ''); status('⏳ 東海道の地図を準備中…（初めの1回は旧東海道の道筋を取ってくるので、1〜2分かかることがあります）'); }
  tkBusy = true;
  let d; try { d = await tkLoad(); } finally { tkBusy = false; }
  if (tkOn()) { if (/東海道の地図を準備中|旧東海道の道筋を取ってきています/.test($('status').textContent)) status(''); tkDraw(d, true); }
}
function tkClear() {
  setData('tkLine', []); setData('tkSt', []);
  if (tkMarker) tkMarker.remove();
}
// 歩いて東海道の距離が増えたら、開いている地図も描き直す（play.js の updTokaido から呼ぶ）
function tkRefresh() { if (tkOn() && tkData) tkDraw(tkData, false); }
$('tkMapBtn').onclick = tkOpen;
