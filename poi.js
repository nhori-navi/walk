// MichiMiru：寄り道（神社・寺・公園）

// ---------- 寄り道（神社・寺・公園） ----------
const poiKinds = () => [['poiShrine', 'shrine'], ['poiTemple', 'temple'], ['poiPark', 'park']].filter(([id]) => $(id).checked).map(x => x[1]);
const poiLabel = p => POI[p.kind].ic + (p.name || '名前なしの' + POI[p.kind].nm);
// 道の網の地点を100m四方のマスに分けて、近い地点をすばやく探せるようにする
function nearNode(g, p, maxD) {
  if (!g.grid) {
    g.grid = new Map(); g.gk = Math.cos(p[1] * Math.PI / 180) * 111320;
    for (let i = 0; i < g.lon.length; i++) {
      if (g.comp[i] !== g.main) continue;
      const k = Math.floor(g.lon[i] * g.gk / 100) + ',' + Math.floor(g.lat[i] * 110540 / 100);
      let l = g.grid.get(k); if (!l) { l = []; g.grid.set(k, l); } l.push(i);
    }
  }
  const cx = Math.floor(p[0] * g.gk / 100), cy = Math.floor(p[1] * 110540 / 100), R = Math.ceil(maxD / 100);
  let bi = -1, bd = maxD;
  for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) {
    const l = g.grid.get((cx + dx) + ',' + (cy + dy)); if (!l) continue;
    for (const i of l) { const d = distM(p, [g.lon[i], g.lat[i]]); if (d < bd) { bd = d; bi = i; } }
  }
  return bi < 0 ? null : bi;
}
// 道のデータと同じ範囲の神社・寺・公園を用意する（端末に保存して使い回す）
function ensurePois(g, quiet) {
  if (!g.poiP) g.poiP = loadPois(g, quiet).catch(e => { g.poiP = null; throw e; }); // 同時に呼ばれても取得は1回だけ
  return g.poiP;
}
async function loadPois(g, quiet) {
  let els = null;
  if (g.areaId) { try { els = await cacheGet('p' + g.areaId); } catch (e) {} }
  if (!els) {
    if (!quiet) { status('神社・寺・公園のデータを取得中…'); await pause(); }
    const box = bboxStr(g.bb);
    els = await overpass(`[out:json][timeout:60];(nwr["amenity"="place_of_worship"]["religion"~"^(shinto|buddhist)$"](${box});nwr["leisure"~"^(park|garden)$"](${box}););out tags center;`);
    if (g.areaId) { try { await cachePut('p' + g.areaId, els); } catch (e) {} }
  }
  const out = [];
  for (const e of els) {
    const t = e.tags || {}, c = e.type === 'node' ? [e.lon, e.lat] : e.center ? [e.center.lon, e.center.lat] : null;
    if (!c || /^(private|no)$/.test(t.access || '')) continue;
    const kind = t.amenity === 'place_of_worship' ? (t.religion === 'shinto' ? 'shrine' : 'temple') : 'park';
    const name = t.name || '';
    if (out.some(o => o.kind === kind && distM(o.p, c) < 60 && (o.name === name || !name || !o.name))) continue; // 同じ場所の重複
    const node = nearNode(g, c, 150); if (node === null) continue; // 近くに歩ける道がない場所は除く
    out.push({kind, name, p: c, node});
  }
  g.poiList = out; // スタンプ帳で使う
  return out;
}
// 行ったことがあるか（最寄りの道を歩いた記録があるか）
function markVisited(g, pois) { pois.forEach(p => { p.visited = g.adj[p.node].some(([, e]) => e.k) ? 1 : 0; }); }
const fewerMsg = list => {
  const N = Number($('poiN').value) || 1, n = Math.max(...list.map(c => c.stops.length));
  return n < N ? `　※${N}か所は入らなかったので、${n}か所にしました` : '';
};
function combos(a, n) {
  const out = [];
  (function rec(st, from) { if (st.length === n) { out.push(st.slice()); return; } for (let i = from; i < a.length; i++) { st.push(a[i]); rec(st, i + 1); st.pop(); } })([], 0);
  return out;
}
// 目的地まで：遠回りの上限X以内で寄れる場所を選び、通る順に並べた案を最大3つ
async function poiRouteTo(g, s, t, from, dest, baseLen, X, kinds) {
  const pois = (await ensurePois(g)).filter(p => kinds.includes(p.kind));
  markVisited(g, pois);
  const N = Number($('poiN').value) || 1, D = distM(from, dest);
  const k = Math.cos(from[1] * Math.PI / 180) * 111320, m = 110540;
  const vx = (dest[0] - from[0]) * k, vy = (dest[1] - from[1]) * m, L2 = vx * vx + vy * vy || 1;
  const cand = pois.map(p => Object.assign({}, p, {
    est: (distM(from, p.p) + distM(p.p, dest) - D) * 1.2,
    tt: ((p.p[0] - from[0]) * k * vx + (p.p[1] - from[1]) * m * vy) / L2}))
    .filter(p => p.est <= X * 1.2).sort((a, b) => (a.visited - b.visited) || (a.est - b.est)).slice(0, 8);
  if (!cand.length) return [];
  for (let n = Math.min(N, cand.length); n >= 1; n--) { // 指定の数で見つからなければ、数を減らして探し直す
    const r = await poiToN(g, s, t, from, dest, baseLen, X, cand, n, D);
    if (r.length) return r;
  }
  return [];
}
async function poiToN(g, s, t, from, dest, baseLen, X, cand, n, D) {
  const list = combos(cand, n).map(cb => {
    cb.sort((a, b) => a.tt - b.tt);
    let L = distM(from, cb[0].p); for (let i = 1; i < cb.length; i++) L += distM(cb[i - 1].p, cb[i].p); L += distM(cb[cb.length - 1].p, dest);
    return {cb, est: (L - D) * 1.2, unv: cb.filter(p => !p.visited).length};
  }).filter(c => c.est <= X * 1.3).sort((a, b) => (b.unv - a.unv) || (a.est - b.est)).slice(0, 6);
  const out = [];
  for (const c of list) {
    await pause();
    const idx = legsPath(g, [s, ...c.cb.map(p => p.node), t]); if (!idx) continue;
    const extra = pathLen(g, idx) - baseLen; if (extra > X * 1.5) continue;
    out.push({idx, stops: c.cb, err: Math.max(0, extra) + (c.cb.length - c.unv) * X * 0.5});
  }
  return pickBest(out, Infinity);
}
// 周回：出発点のまわりの場所を結んで、指定の距離に近い輪を作る（1か所のときは補助の点を足して輪にする）
async function poiRouteLoop(g, s0, from, T, kinds) {
  const pois = (await ensurePois(g)).filter(p => kinds.includes(p.kind) && distM(from, p.p) >= 50 && distM(from, p.p) <= T / 2.2);
  markVisited(g, pois);
  const N = Number($('poiN').value) || 1;
  const cand = pois.sort((a, b) => (a.visited - b.visited) || (Math.abs(distM(from, a.p) - T / 5) - Math.abs(distM(from, b.p) - T / 5))).slice(0, 8);
  if (!cand.length) return [];
  for (let n = Math.min(N, cand.length); n >= 1; n--) { // 指定の数で見つからなければ、数を減らして探し直す
    const r = await poiLoopN(g, s0, from, T, cand, n);
    if (r.length) return r;
  }
  return [];
}
async function poiLoopN(g, s0, from, T, cand, n) {
  const tours = [];
  combos(cand, n).forEach(cb => {
    const brs = cb.map(p => (bearing(from, p.p) + 360) % 360);
    // 輪が短すぎるときのために、寄り道先のあいだの一番広い方角に補助の点を置く案も作る
    const opts = [null];
    if (cb.length === 1) {
      const rp = distM(from, cb[0].p);
      [60, -60, 100, -100].forEach(dz => [rp, T / 3.75].forEach(r => opts.push({b: brs[0] + dz, r})));
    } else {
      const sb = brs.slice().sort((a, b) => a - b);
      let gap = 0, mid = 0;
      sb.forEach((b, i) => { const nb = i + 1 < sb.length ? sb[i + 1] : sb[0] + 360; if (nb - b > gap) { gap = nb - b; mid = b + gap / 2; } });
      [T / 3.75, T / 3].forEach(r => opts.push({b: mid, r}));
    }
    opts.forEach(o => {
      const stops = cb.map((p, i) => ({p: p.p, b: brs[i], poi: p}));
      if (o) stops.push({p: offsetPt(from, o.b, o.r), b: (o.b + 360) % 360, aux: true});
      stops.sort((a, b) => a.b - b.b);
      const ps = [from, ...stops.map(x => x.p), from];
      let L = 0; for (let i = 1; i < ps.length; i++) L += distM(ps[i - 1], ps[i]);
      tours.push({cb: stops.filter(x => x.poi).map(x => x.poi), seq: stops, est: L * 1.25, unv: cb.filter(p => !p.visited).length});
    });
  });
  const list = tours.filter(v => Math.abs(v.est - T) <= T * 0.35).sort((a, b) => (b.unv - a.unv) || (Math.abs(a.est - T) - Math.abs(b.est - T))).slice(0, 6);
  const out = [];
  for (const v of list) {
    await pause();
    const nodes = [s0.i]; let ok = true;
    for (const x of v.seq) {
      const nd = x.aux ? nearNode(g, x.p, 300) : x.poi.node;
      if (nd === null) { ok = false; break; }
      nodes.push(nd);
    }
    if (!ok) continue;
    nodes.push(s0.i);
    const idx = legsPath(g, nodes); if (!idx) continue;
    if (overlapRatio(g, idx) > 0.35) continue;
    const len = pathLen(g, idx); if (Math.abs(len - T) > T * 0.35) continue;
    out.push({idx, stops: v.cb, err: Math.abs(len - T) + (v.cb.length - v.unv) * T * 0.15});
  }
  return pickBest(out, Infinity);
}
// ルート上で寄り道先を通る位置に、案内を足す
function stopTurns(idx, coords, stops) {
  if (!stops) return [];
  const cum = cumOf(coords), out = []; let from = 0;
  stops.forEach(p => {
    const k = idx.indexOf(p.node, from); if (k < 0) return;
    from = k; out.push({d: cum[k + 1], kind: 'poi', label: poiLabel(p)});
  });
  return out;
}
// 地図に寄り道先の名札を出す
function drawStops() {
  poiMarkers.forEach(m => m.remove()); poiMarkers = [];
  if (!route || !route.stops) return;
  poiMarkers = route.stops.map(p => {
    const el = document.createElement('div'); el.className = 'pmk'; el.textContent = poiLabel(p);
    el.style.borderColor = POI[p.kind].col;
    return new mapboxgl.Marker({element: el, anchor: 'bottom', offset: [0, -6]}).setLngLat(p.p).addTo(map);
  });
}
// 「地図に神社・寺・公園を表示」
async function drawPois() {
  if (!$('poiShow').checked || !graph) { setData('poi', []); return; }
  try {
    const pois = await ensurePois(graph);
    setData('poi', pois.map(p => ({type: 'Feature', properties: {k: p.kind, t: poiLabel(p)}, geometry: {type: 'Point', coordinates: p.p}})));
  } catch (e) { showErr('神社・寺・公園の' + e.message); }
}
