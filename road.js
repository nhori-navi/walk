// 徒歩ナビ：道のデータ（OpenStreetMap）・ルート計算（A*法）・曲がり角などの案内

// ---------- 道のデータ（OpenStreetMap） ----------
const bboxStr = bb => [bb.s, bb.w, bb.n, bb.e].map(v => v.toFixed(5)).join(',');
async function fetchOverpass(bb) {
  try { return await overpass(`[out:json][timeout:90];way["highway"~"${HW}"](${bboxStr(bb)});out body;>;out skel qt;`); }
  catch (e) { throw new Error('道の' + e.message); }
}
async function overpass(q) {
  let last = null;
  for (const url of OVERPASS) {
    try {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 30000); // 30秒で次のサーバーへ
      const r = await fetch(url, {method:'POST', body:'data=' + encodeURIComponent(q),
        headers:{'Content-Type':'application/x-www-form-urlencoded'}, signal: ctl.signal});
      clearTimeout(tm);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return (await r.json()).elements || [];
    } catch (e) { last = e; }
  }
  throw new Error('データを取得できませんでした（' + (last && last.name === 'AbortError' ? '時間切れ' : last.message) + '）');
}
// 必要な範囲の道の網を用意する（保存済みがあればそれを使い、なければ取り寄せて保存）
async function ensureGraph(need, fetchBB) {
  if (graph && inside(need, graph.bb)) return;
  const now = Date.now(), life = CACHE_DAYS * 864e5;
  const hit = areaMeta.filter(a => inside(need, a.bb) && now - a.t < life).sort((a, b) => b.t - a.t)[0];
  let els = null, bb = fetchBB, from = '', areaId = null;
  if (hit) {
    try {
      status('保存済みの道のデータを読み込み中…'); await pause();
      els = await cacheGet(hit.id);
      if (els) { bb = hit.bb; areaId = hit.id; hit.used = now; saveMeta(); from = `保存済みデータ（${Math.floor((now - hit.t) / 864e5)}日前に取得）`; }
    } catch (e) { els = null; }
  }
  if (!els) {
    status('道のデータを取得中…（数秒〜数十秒かかります）'); await pause();
    els = await fetchOverpass(fetchBB); from = '新しく取得';
    try {
      const id = 'a' + now; areaId = id;
      await cachePut(id, els);
      areaMeta.push({id, bb: fetchBB, t: now, used: now});
      const drop = areaMeta.filter(a => now - a.t >= life);
      areaMeta = areaMeta.filter(a => now - a.t < life).sort((a, b) => b.used - a.used);
      drop.push(...areaMeta.splice(CACHE_MAX));
      saveMeta();
      drop.forEach(a => { cacheDel(a.id).catch(() => {}); cacheDel('p' + a.id).catch(() => {}); });
    } catch (e) { /* 保存できなくても計算は続ける */ }
  }
  status('道の網を組み立て中…'); await pause();
  graph = buildGraph(els); graph.bb = bb; graph.from = from; graph.areaId = areaId;
  markWalked(graph);
  drawNet(); drawPois();
}
// 起動直後に、現在地の周りの道のデータを先に用意しておく
async function prefetch() {
  if (busy || graph || !pos) return;
  busy = true;
  try { await ensureGraph(bboxOf([pos], 1500), bboxOf([pos], 2000)); if (!route) status('周辺の道のデータを準備しました。目的地を設定してください。'); }
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
    n.forEach(i => { if (br) onBridge[i] = 1; else onGround[i] = 1; });
    ways.push({n, k: !ok ? 'ng' : (stp ? 'steps' : 'ok')});
    if (!ok) return;
    for (let i = 0; i < n.length - 1; i++) {
      const a = n[i], b = n[i + 1];
      if (a === b || emap.has(edgeKey(a, b))) continue;
      const ed = {a, b, w: distM([lon[a], lat[a]], [lon[b], lat[b]]), k: 0, s: stp ? 1 : 0, c: cls};
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
function markWalked(g) {
  g.edges.forEach(e => { e.k = 0; });
  const bb = g.bb, kx = Math.cos((bb.s + bb.n) / 2 * Math.PI / 180) * 111320, ky = 110540, C = 40;
  const cell = p => [Math.floor((p[0] - bb.w) * kx / C), Math.floor((p[1] - bb.s) * ky / C)];
  const inBB = p => p[0] >= bb.w && p[0] <= bb.e && p[1] >= bb.s && p[1] <= bb.n;
  const grid = new Map(); let nseg = 0;
  tracks.forEach(t => {
    if (t.k === 'veh' || !t.pts) return;
    for (let i = 1; i < t.pts.length; i++) {
      const a = t.pts[i - 1], b = t.pts[i];
      if (!inBB(a) && !inBB(b)) continue;
      if (distM(a, b) > 80) continue;
      const ca = cell(a), cb = cell(b);
      for (let x = Math.min(ca[0], cb[0]); x <= Math.max(ca[0], cb[0]); x++)
        for (let y = Math.min(ca[1], cb[1]); y <= Math.max(ca[1], cb[1]); y++) {
          const k = x + ',' + y; let l = grid.get(k); if (!l) { l = []; grid.set(k, l); } l.push([a, b]);
        }
      nseg++;
    }
  });
  if (!nseg) return;
  const near = p => {
    const [cx, cy] = cell(p);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const l = grid.get((cx + dx) + ',' + (cy + dy));
      if (l) for (const [a, b] of l) if (segDist(p, a, b).d <= 15) return true;
    }
    return false;
  };
  g.edges.forEach(e => {
    const A = [g.lon[e.a], g.lat[e.a]], B = [g.lon[e.b], g.lat[e.b]];
    const n = Math.max(1, Math.ceil(e.w / 20)); let hit = 0;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      if (near([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t])) hit++;
    }
    if (hit / n >= 0.5) e.k = 1;
  });
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
