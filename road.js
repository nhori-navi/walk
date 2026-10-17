// MichiMiru：道のデータ（OpenStreetMap）・ルート計算（A*法）・曲がり角などの案内

// ---------- 道のデータ（OpenStreetMap） ----------
const bboxStr = bb => [bb.s, bb.w, bb.n, bb.e].map(v => v.toFixed(5)).join(',');
// 版10：道のデータは約2km四方のマス（タイル）ごとに取る。1回の問い合わせを小さくして、混んでいるときも時間切れになりにくくする
const TILE = 0.02, TILE_MAX = 150, GRAPH_TILES = 25; // マスの大きさ（度）・端末に保存する数・道の網に入れる数
const tileKey = (x, y) => x + '_' + y;
const tileBB = k => { const [x, y] = k.split('_').map(Number); return {w: x * TILE, s: y * TILE, e: (x + 1) * TILE, n: (y + 1) * TILE}; };
function tileRange(bb) { return {x0: Math.floor(bb.w / TILE), x1: Math.floor(bb.e / TILE), y0: Math.floor(bb.s / TILE), y1: Math.floor(bb.n / TILE)}; }
function tilesOfRange(r) { const o = []; for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) o.push(tileKey(x, y)); return o; }
let tileMeta = loadJSON('walk_tile_meta', '{}'); // {マス: [取得した時刻, 最後に使った時刻]}
const saveTileMeta = () => lsSet('walk_tile_meta', JSON.stringify(tileMeta));
// 問い合わせの順番待ち（同時に2つまで）。道も神社・寺・公園も同じ列に並ぶ
const ovpQ = []; let ovpRun = 0;
function ovpQueue(q, limit) {
  return new Promise((res, rej) => { ovpQ.push({q, limit, res, rej}); ovpPump(); });
}
function ovpPump() {
  while (ovpRun < 2 && ovpQ.length) {
    const j = ovpQ.shift(); ovpRun++;
    overpass(j.q, j.limit).then(j.res, j.rej).finally(() => { ovpRun--; ovpPump(); });
  }
}
// 1マス1回の問い合わせで、神社・寺・公園（先に出す）と道をまとめて受け取る
async function fetchTile(k) {
  const box = bboxStr(tileBB(k));
  try { return await ovpQueue(`[out:json][timeout:40];(nwr["amenity"="place_of_worship"]["religion"~"^(shinto|buddhist)$"](${box});nwr["leisure"~"^(park|garden)$"](${box}););out tags center;way["highway"~"${HW}"](${box});out body;>;out skel qt;`, OVP_LIMIT); }
  catch (e) { throw new Error('道の' + e.message); }
}
// マスのデータを用意する（覚えている分 → 端末の保存 → 取り寄せ）
const tileMem = new Map();
async function getTile(k, onNew) {
  const now = Date.now(), life = CACHE_DAYS * 864e5, m = tileMeta[k];
  if (tileMem.has(k) && m && now - m[0] < life) return tileMem.get(k);
  if (m && now - m[0] < life) {
    try { const els = await cacheGet('t2:' + k); if (els) { m[1] = now; tileMem.set(k, els); return els; } } catch (e) {}
  }
  const els = await fetchTile(k);
  if (onNew) onNew();
  tileMem.set(k, els);
  try {
    await cachePut('t2:' + k, els);
    tileMeta[k] = [now, now];
    // 古いもの・多すぎる分は消す
    const keys = Object.keys(tileMeta).filter(x => x !== k && (now - tileMeta[x][0] >= life)).concat(
      Object.keys(tileMeta).sort((a, b) => tileMeta[b][1] - tileMeta[a][1]).slice(TILE_MAX));
    [...new Set(keys)].forEach(x => { delete tileMeta[x]; tileMem.delete(x); cacheDel('t2:' + x).catch(() => {}); cacheDel('tp:' + x).catch(() => {}); });
    saveTileMeta();
  } catch (e) { /* 保存できなくても計算は続ける */ }
  return els;
}
// 版9までの「範囲ごと」の保存は使わないので消す
if (areaMeta.length) { areaMeta.forEach(a => { cacheDel(a.id).catch(() => {}); cacheDel('p' + a.id).catch(() => {}); }); areaMeta = []; saveMeta(); }
// サーバーに上から順に頼む。6秒返事がなければ次にも頼み（同時は2か所まで）、断られたら待たずに次へ。
// 最初に返ってきた答えを使い、残りは止める（各25秒で打ち切り）
const OVP_PAR = 2, OVP_WAIT = 6000, OVP_LIMIT = 45000; // 版10：25秒→45秒
function overpass(q, limit) {
  return new Promise((resolve, reject) => {
    const reasons = [], ctls = [];
    let idx = 0, running = 0, done = false, timer = null;
    const why = e => e.name === 'AbortError' ? '時間切れ' : e.name === 'TypeError' ? '接続できず' : e.message;
    const fail = () => {
      if (done || running || idx < OVERPASS.length) return;
      done = true; reject(new Error('データを取得できませんでした（' + reasons.join('、') + '）'));
    };
    const next = () => {
      clearTimeout(timer);
      if (done) return;
      if (idx >= OVERPASS.length || running >= OVP_PAR) { fail(); return; }
      const [url, label] = OVERPASS[idx++];
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), limit || OVP_LIMIT);
      ctls.push(ctl); running++;
      (async () => {
        const r = await fetch(url, {method:'POST', body:'data=' + encodeURIComponent(q),
          headers:{'Content-Type':'application/x-www-form-urlencoded'}, signal: ctl.signal});
        if (!r.ok) throw new Error('HTTP ' + r.status);
        let j; try { j = await r.json(); } catch (e) { throw new Error('応答が壊れていた'); }
        if (j.remark && /error/i.test(j.remark)) throw new Error('混雑で打ち切り');
        return j.elements || [];
      })().then(els => {
        if (done) return;
        done = true; clearTimeout(timer); ctls.forEach(c => c.abort()); // 残りの問い合わせは止める
        resolve(els);
      }, e => {
        if (done) return;
        reasons.push(label + '：' + why(e)); running--;
        next(); // 断られたら待たずに次へ
      }).finally(() => clearTimeout(tm));
      if (idx < OVERPASS.length) timer = setTimeout(next, OVP_WAIT); // 返事が遅ければ次にも頼む
    };
    next();
  });
}
// 必要な範囲の道の網を用意する。fetchBB にかかるマスをそろえる（今の網のマスと合わせて長方形になり、25枚までなら一緒に入れる）
// 取れないマスがあったら、20秒待って1回だけやり直す（retry=false なら、やり直さない）
async function ensureGraph(need, fetchBB, retry = true) {
  if (graph && inside(need, graph.bb)) return;
  let r = tileRange(fetchBB);
  if (graph && graph.tr) {
    const u = {x0: Math.min(r.x0, graph.tr.x0), x1: Math.max(r.x1, graph.tr.x1), y0: Math.min(r.y0, graph.tr.y0), y1: Math.max(r.y1, graph.tr.y1)};
    if ((u.x1 - u.x0 + 1) * (u.y1 - u.y0 + 1) <= GRAPH_TILES) r = u;
  }
  const keys = tilesOfRange(r);
  let fresh = 0, done = 0;
  const show = () => status(`道のデータを準備中…（${done}／${keys.length}マス${fresh ? `、うち${fresh}マスを新しく取得` : ''}）`);
  show(); await pause();
  const got = new Map(), fail = [];
  let lastErr = null;
  const load = async ks => {
    await Promise.all(ks.map(k => getTile(k, () => fresh++).then(els => { got.set(k, els); done++; show(); }, e => { fail.push(k); lastErr = e; })));
  };
  await load(keys);
  if (fail.length && retry) {
    const why = (jaErr(lastErr).match(/（([^（）]*)）$/) || [])[1];
    status(`道のデータが${fail.length}マス取れませんでした${why ? `（${why}）` : ''}。20秒後にもう一度試します…`);
    await new Promise(res => setTimeout(res, 20000));
    const again = fail.splice(0); lastErr = null; await load(again);
  }
  if (fail.length) throw lastErr || new Error('道のデータを取得できませんでした');
  status('道の網を組み立て中…'); await pause();
  // マスの境目をまたぐ道は両方のマスに入っているので、重なりを除いてつなぐ
  const seen = new Set(), els = [];
  keys.forEach(k => got.get(k).forEach(e => { const id = e.type + e.id; if (!seen.has(id)) { seen.add(id); els.push(e); } }));
  const now = Date.now(), oldest = Math.min(...keys.map(k => (tileMeta[k] || [now])[0]));
  graph = buildGraph(els);
  graph.bb = {w: r.x0 * TILE, s: r.y0 * TILE, e: (r.x1 + 1) * TILE, n: (r.y1 + 1) * TILE};
  graph.tr = r; graph.tiles = keys;
  graph.from = fresh ? `${fresh}マスを新しく取得` : `保存済みデータ（${Math.floor((now - oldest) / 864e5)}日前に取得）`;
  saveTileMeta();
  markWalked(graph);
  drawNet(); drawPois(); drawTracks();
  ensurePois(graph, true).then(() => updStamps()).catch(() => {}); // スタンプ帳のために神社・寺・公園も用意（失敗しても続ける）
}
// 起動直後に、出発地の周りの道のデータを先に用意しておく
// 現在地は精度100m以内のときだけ使う。送る範囲の中心は約500m単位に丸める（範囲は半径2kmあるので使い勝手は変わらない）
async function prefetch() {
  const o = startPt || (isRough() ? null : pos);
  if (busy || graph || !o) return;
  busy = true;
  try {
    const c = round500(o);
    await ensureGraph(bboxOf([c], 1500), bboxOf([c], 2000), false); // 先読みはやり直さない
    if (!route) status('周辺の道のデータを準備しました。目的地を設定してください。');
  }
  catch (e) { status(''); }
  finally { busy = false; if (pending) { pending = false; calc(); } }
}
function walkable(t) {
  t = t || {};
  const foot = t.foot || '', access = t.access || '';
  if (/^(no|private)$/.test(foot)) return false;
  if (/^(no|private)$/.test(access) && !/^(yes|designated|permissive)$/.test(foot)) return false;
  if (t.motorroad === 'yes') return false;
  return true;
}
const edgeKey = (a, b) => a < b ? a + '_' + b : b + '_' + a;
function buildGraph(els) {
  const idx = new Map(), lon = [], lat = [], ways = [], edges = [], emap = new Map();
  els.forEach(e => { if (e.type === 'node') { idx.set(e.id, lon.length); lon.push(e.lon); lat.push(e.lat); } });
  const adj = lon.map(() => []);
  const onGround = new Uint8Array(lon.length), onBridge = new Uint8Array(lon.length);
  els.forEach(e => {
    if (e.type !== 'way' || !e.nodes) return;
    const n = e.nodes.map(id => idx.get(id)).filter(i => i !== undefined);
    if (n.length < 2) return;
    const t = e.tags || {}, ok = walkable(t), stp = t.highway === 'steps', hw = t.highway || '';
    // 道の種類：0＝歩行者の道（遊歩道・緑道など。車道沿いの歩道は除く）、1＝住宅街などの道、2＝大きな道
    const cls = /^(footway|path|pedestrian|steps|corridor|track|bridleway)$/.test(hw) && !/^(sidewalk|crossing)$/.test(t.footway || '') ? 0
      : /^(tertiary|secondary|primary|trunk)/.test(hw) ? 2 : 1;
    // 橋・トンネルの上は地面の高さと違うので、高さを両側からつなぐ対象にする
    const br = (t.bridge && t.bridge !== 'no') || t.tunnel === 'yes';
    // マスの完全制覇で数えない道：車道沿いの別線の歩道・横断歩道・駐車場の通路・敷地への引き込み道
    const nx = /^(sidewalk|crossing)$/.test(t.footway || '') || /^(parking_aisle|driveway|drive-through)$/.test(t.service || '') ? 1 : 0;
    n.forEach(i => { if (br) onBridge[i] = 1; else onGround[i] = 1; });
    ways.push({n, k: !ok ? 'ng' : (stp ? 'steps' : 'ok')});
    if (!ok) return;
    for (let i = 0; i < n.length - 1; i++) {
      const a = n[i], b = n[i + 1];
      if (a === b || emap.has(edgeKey(a, b))) continue;
      const ed = {a, b, w: distM([lon[a], lat[a]], [lon[b], lat[b]]), k: 0, s: stp ? 1 : 0, c: cls, x: nx};
      edges.push(ed); emap.set(edgeKey(a, b), ed);
      adj[a].push([b, ed]); adj[b].push([a, ed]);
    }
  });
  const comp = new Int32Array(lon.length).fill(-1);
  let cid = 0, main = -1, mainSize = 0;
  for (let s = 0; s < lon.length; s++) {
    if (comp[s] >= 0 || !adj[s].length) continue;
    let size = 0; const st = [s]; comp[s] = cid;
    while (st.length) {
      const v = st.pop(); size++;
      for (const [u] of adj[v]) if (comp[u] < 0) { comp[u] = cid; st.push(u); }
    }
    if (size > mainSize) { mainSize = size; main = cid; }
    cid++;
  }
  const floatN = [];
  for (let i = 0; i < lon.length; i++) if (onBridge[i] && !onGround[i]) floatN.push(i);
  return {lon, lat, adj, comp, main, ways, edges, emap, floatN};
}
// 版10：e.k＝歩いたことがある、e.k0＝今日より前に歩いたことがある（今日の未踏破＝k があって k0 がない道）
function markWalked(g) {
  g.edges.forEach(e => { e.k = 0; e.k0 = 0; }); g.wIdx = null;
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const bb = g.bb, kx = Math.cos((bb.s + bb.n) / 2 * Math.PI / 180) * 111320, ky = 110540, C = 40;
  const cell = p => [Math.floor((p[0] - bb.w) * kx / C), Math.floor((p[1] - bb.s) * ky / C)];
  const inBB = p => p[0] >= bb.w && p[0] <= bb.e && p[1] >= bb.s && p[1] <= bb.n;
  const grid = new Map(); let nseg = 0;
  tracks.forEach(t => {
    if (t.k === 'veh' || !t.pts) return;
    const old = !(t.t0 >= d0.getTime());
    for (let i = 1; i < t.pts.length; i++) {
      const a = t.pts[i - 1], b = t.pts[i];
      if (!inBB(a) && !inBB(b)) continue;
      if (distM(a, b) > 80) continue;
      const ca = cell(a), cb = cell(b);
      for (let x = Math.min(ca[0], cb[0]); x <= Math.max(ca[0], cb[0]); x++)
        for (let y = Math.min(ca[1], cb[1]); y <= Math.max(ca[1], cb[1]); y++) {
          const k = x + ',' + y; let l = grid.get(k); if (!l) { l = []; grid.set(k, l); } l.push([a, b, old]);
        }
      nseg++;
    }
  });
  if (!nseg) return;
  // 0＝近くに記録なし、1＝今日の記録だけ、2＝今日より前の記録もある
  const near = p => {
    const [cx, cy] = cell(p); let any = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const l = grid.get((cx + dx) + ',' + (cy + dy));
      if (l) for (const [a, b, o] of l) if (segDist(p, a, b).d <= 15) { if (o) return 2; any = 1; }
    }
    return any;
  };
  g.edges.forEach(e => {
    const A = [g.lon[e.a], g.lat[e.a]], B = [g.lon[e.b], g.lat[e.b]];
    const n = Math.max(1, Math.ceil(e.w / 20)); let hit = 0, hitO = 0;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, r = near([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]);
      if (r) hit++; if (r === 2) hitO++;
    }
    if (hit / n >= 0.5) e.k = 1;
    if (hitO / n >= 0.5) e.k0 = 1;
  });
}

// 歩行中：新しく歩いた区間（pts の点の並び）の近くの道にだけ「歩いた」の印を足す。印が増えたら true
function markWalkedPts(g, pts) {
  if (!g || !pts || pts.length < 2) return false;
  const segs = [];
  for (let i = 1; i < pts.length; i++) if (distM(pts[i - 1], pts[i]) <= 80) segs.push([pts[i - 1], pts[i]]);
  if (!segs.length) return false;
  const idx = segIndex(g.bb, segs);
  let w = 180, e = -180, s = 90, n = -90;
  segs.forEach(([a, b]) => { w = Math.min(w, a[0], b[0]); e = Math.max(e, a[0], b[0]); s = Math.min(s, a[1], b[1]); n = Math.max(n, a[1], b[1]); });
  const m = 0.0005; let ch = false;
  g.edges.forEach(ed => {
    if (ed.k) return;
    const A = [g.lon[ed.a], g.lat[ed.a]], B = [g.lon[ed.b], g.lat[ed.b]];
    if (Math.max(A[0], B[0]) < w - m || Math.min(A[0], B[0]) > e + m || Math.max(A[1], B[1]) < s - m || Math.min(A[1], B[1]) > n + m) return;
    const k = Math.max(1, Math.ceil(ed.w / 20)); let hit = 0;
    for (let i = 0; i < k; i++) {
      const t = (i + 0.5) / k;
      if (idx.near([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t], 15)) hit++;
    }
    if (hit / k >= 0.5) { ed.k = 1; ch = true; }
  });
  if (ch) g.wIdx = null;
  return ch;
}

// ---------- 記録の整理用：線分を40m四方のマスに入れて、点の近くにあるかをすばやく調べる ----------
function segIndex(bb, segs) {
  const kx = Math.cos((bb.s + bb.n) / 2 * Math.PI / 180) * 111320, ky = 110540, C = 40;
  const cell = p => [Math.floor((p[0] - bb.w) * kx / C), Math.floor((p[1] - bb.s) * ky / C)];
  const grid = new Map();
  segs.forEach(s => {
    const ca = cell(s[0]), cb = cell(s[1]);
    for (let x = Math.min(ca[0], cb[0]); x <= Math.max(ca[0], cb[0]); x++)
      for (let y = Math.min(ca[1], cb[1]); y <= Math.max(ca[1], cb[1]); y++) {
        const k = x + ',' + y; let l = grid.get(k); if (!l) { l = []; grid.set(k, l); } l.push(s);
      }
  });
  return {near(p, r) {
    const [cx, cy] = cell(p), R = Math.ceil(r / C);
    for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) {
      const l = grid.get((cx + dx) + ',' + (cy + dy));
      if (l) for (const s of l) if (segDist(p, s[0], s[1]).d <= r) return true;
    }
    return false;
  }, all(p, r) { // 近くにある線分をすべて返す
    const [cx, cy] = cell(p), R = Math.ceil(r / C), out = new Set();
    for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) {
      const l = grid.get((cx + dx) + ',' + (cy + dy));
      if (l) for (const s of l) if (segDist(p, s[0], s[1]).d <= r) out.add(s);
    }
    return [...out];
  }};
}
// すべての道（通れない道も含む）
function roadIdx(g) {
  if (!g.rIdx) {
    const s = [];
    g.ways.forEach(w => { for (let i = 1; i < w.n.length; i++) s.push([[g.lon[w.n[i - 1]], g.lat[w.n[i - 1]]], [g.lon[w.n[i]], g.lat[w.n[i]]]]); });
    g.rIdx = segIndex(g.bb, s);
  }
  return g.rIdx;
}
// 歩いたことのある道
function walkedIdx(g) {
  if (!g.wIdx) g.wIdx = segIndex(g.bb, g.edges.filter(e => e.k).map(e => [[g.lon[e.a], g.lat[e.a]], [g.lon[e.b], g.lat[e.b]]]));
  return g.wIdx;
}
// 道のデータで判定できる場所か（読み込んだ範囲の縁から50m内側）
function judgeable(g, p) {
  const bb = g.bb, mx = 50 / (Math.cos((bb.s + bb.n) / 2 * Math.PI / 180) * 111320), my = 50 / 110540;
  return p[0] >= bb.w + mx && p[0] <= bb.e - mx && p[1] >= bb.s + my && p[1] <= bb.n - my;
}

function drawNet() {
  if (!$('netChk').checked || !graph) { setData('net', []); return; }
  const g = graph, f = [];
  g.ways.forEach(w => {
    let k = w.k;
    if (k !== 'ng' && g.comp[w.n[0]] !== g.main) k = 'iso';
    f.push({type:'Feature', properties:{k}, geometry:{type:'LineString', coordinates: w.n.map(i => [g.lon[i], g.lat[i]])}});
  });
  setData('net', f);
}
function snap(g, p) {
  let bi = -1, bd = 1e12;
  for (let i = 0; i < g.lon.length; i++) {
    if (g.comp[i] !== g.main) continue;
    const d = distM(p, [g.lon[i], g.lat[i]]);
    if (d < bd) { bd = d; bi = i; }
  }
  return {i: bi, d: bd};
}

// ---------- 経路計算（A*法） ----------
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(k, v) {
    const a = this.a; a.push([k, v]); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}
function astar(g, s, t) {
  const mult = Number($('unexp').value) || 1, sm = slopeMode(), ele = g.ele || null, ff = FOOT_F[Number($('foot').value) || 0];
  const hk = sm === 2 ? 0.6 : 1; // 「あえて選ぶ」は道が軽くなるので、目安の距離も合わせて軽くする
  const n = g.lon.length, d = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  const tp = [g.lon[t], g.lat[t]], h = i => distM([g.lon[i], g.lat[i]], tp) * hk;
  const H = new Heap(); d[s] = 0; H.push(h(s), s);
  while (H.size) {
    const v = H.pop()[1];
    if (done[v]) continue; done[v] = 1;
    if (v === t) break;
    for (const [u, e] of g.adj[v]) {
      let c = (e.k ? e.w * mult : e.w) * ff[e.c || 0];
      if (sm) c = slopeCost(c, e, ele ? ele[v] : NaN, ele ? ele[u] : NaN, sm);
      const nd = d[v] + c;
      if (nd < d[u]) { d[u] = nd; prev[u] = v; H.push(nd + h(u), u); }
    }
  }
  if (d[t] === Infinity) return null;
  const path = [];
  for (let v = t; v !== -1; v = prev[v]) path.push(v);
  return path.reverse();
}
const slopeMode = () => Number($('slope').value) || 0;
const toCoords = (g, idx) => idx.map(i => [g.lon[i], g.lat[i]]);
function pathLen(g, idx) {
  let L = 0;
  for (let i = 1; i < idx.length; i++) L += distM([g.lon[idx[i - 1]], g.lat[idx[i - 1]]], [g.lon[idx[i]], g.lat[idx[i]]]);
  return L;
}
function unexpRatio(g, idx) {
  let L = 0, U = 0;
  for (let i = 1; i < idx.length; i++) {
    const e = g.emap.get(edgeKey(idx[i - 1], idx[i])); if (!e) continue;
    L += e.w; if (!e.k) U += e.w;
  }
  return L ? U / L : 1;
}
function legsPath(g, nodes) {
  let p = [];
  for (let k = 0; k < nodes.length - 1; k++) {
    const seg = astar(g, nodes[k], nodes[k + 1]);
    if (!seg) return null;
    p = p.concat(k ? seg.slice(1) : seg);
  }
  return p;
}
function edgeSet(idx) { const s = new Set(); for (let i = 1; i < idx.length; i++) s.add(edgeKey(idx[i - 1], idx[i])); return s; }
function overlapRatio(g, idx) {
  const seen = new Set(); let dup = 0, L = 0;
  for (let i = 1; i < idx.length; i++) {
    const a = idx[i - 1], b = idx[i], k = edgeKey(a, b);
    const d = distM([g.lon[a], g.lat[a]], [g.lon[b], g.lat[b]]);
    L += d; if (seen.has(k)) dup += d; else seen.add(k);
  }
  return L ? dup / L : 0;
}
function pickBest(list, tol) {
  list = list.filter(c => c.err <= tol).sort((a, b) => a.err - b.err);
  const out = [];
  for (const c of list) {
    c.es = edgeSet(c.idx);
    const similar = out.some(o => {
      let n = 0; c.es.forEach(k => { if (o.es.has(k)) n++; });
      return n / Math.min(c.es.size, o.es.size) > 0.7;
    });
    if (similar) continue;
    out.push(c); if (out.length >= 3) break;
  }
  return out;
}

// ---------- 曲がり角などの案内を作る ----------
// 交差点（3本以上の道が集まる点）で、向きが35°以上変わるところだけを拾う。12m以内に続く交差点はまとめて判断する
function computeTurns(g, idx, coords, prof) {
  const cum = cumOf(coords), total = cum[cum.length - 1], out = [], raw = [];
  const brg = (d0, d1) => bearing(pointAt(coords, cum, Math.max(0, d0)), pointAt(coords, cum, Math.min(total, d1)));
  for (let k = 1; k < idx.length - 1; k++) {
    if (g.adj[idx[k]].length < 3) continue;
    const d = cum[k + 1];
    if (d < 8 || total - d < 8) continue;
    raw.push({d, bi: brg(d - 15, d), bo: brg(d, d + 15)});
  }
  for (let i = 0; i < raw.length;) {
    let j = i; while (j + 1 < raw.length && raw[j + 1].d - raw[j].d <= 12) j++;
    const ang = ((raw[j].bo - raw[i].bi) % 360 + 540) % 360 - 180;
    if (Math.abs(ang) >= 35) out.push({d: raw[i].d, kind: 'turn', ang: Math.round(ang)});
    i = j + 1;
  }
  // 階段の入口（上り・下りは高さから判断）
  for (let k = 1; k < idx.length; k++) {
    const e = g.emap.get(edgeKey(idx[k - 1], idx[k]));
    if (!e || !e.s) continue;
    const pe = k > 1 ? g.emap.get(edgeKey(idx[k - 2], idx[k - 1])) : null;
    if (pe && pe.s) continue;
    let m = k; while (m + 1 < idx.length) { const ne = g.emap.get(edgeKey(idx[m], idx[m + 1])); if (!ne || !ne.s) break; m++; }
    let up;
    if (g.ele) { const dh = g.ele[idx[m]] - g.ele[idx[k - 1]]; if (dh > 1) up = true; else if (dh < -1) up = false; }
    out.push({d: cum[k], kind: 'steps', up});
  }
  // 急な上り坂（30mで10%超）の入口。続けて出さないよう100mあける
  if (prof) {
    let last = -1e9;
    for (let i = 0; i + 3 < prof.d.length; i++) {
      const dd = prof.d[i + 3] - prof.d[i];
      if (dd >= 25 && (prof.h[i + 3] - prof.h[i]) / dd > 0.10 && !prof.s[i + 1] && prof.d[i] - last >= 100) {
        out.push({d: prof.d[i], kind: 'slope'}); last = prof.d[i];
      }
    }
  }
  return out.sort((a, b) => a.d - b.d);
}
