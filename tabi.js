// MichiMiru：旅の地図（版7）。徒歩・電車・車の記録で、全国の「行った市区町村」を塗る
// 歩いた市区町村は濃い色、乗り物で通っただけの所は薄い色。踏破マス・東海道・スタンプは今までどおり徒歩だけで数える
// 市区町村の境目：国土数値情報（行政区域・2021年）を加工した city.json。線路：地球地図日本（国土地理院・2016年）を加工した rail.json
const TABI_R = 300, TABI_RATIO = 0.8; // 乗り物の区間の点の8割以上が線路から300m以内なら電車
const TABI_MODE = {walk: {nm: '徒歩', col: '#27ae60'}, train: {nm: '電車', col: '#8e44ad'}, car: {nm: '車', col: '#e67e22'}};
let cityD = null, railD = null, tabiRes = null, tabiPop = null;
const tabiOn = () => mapMode === 'tabi';

// ---------- データの読み込み（初めの1回だけ取りに行き、端末に保存） ----------
async function tabiFile(name, key) {
  try { const c = await cacheGet(key); if (c) return c; } catch (e) {}
  const r = await fetch(name + '?v=' + APP_VER);
  if (!r.ok) throw new Error(name + 'を読み込めませんでした（HTTP ' + r.status + '）');
  const j = await r.json();
  try { await cachePut(key, j); } catch (e) {}
  return j;
}
// 差分で詰めた整数の列を、緯度経度の並び（[経度, 緯度, 経度, 緯度…]）に戻す
function tabiUnpack(f, q) {
  const o = new Float64Array(f.length);
  let x = 0, y = 0;
  for (let i = 0; i < f.length; i += 2) { x += f[i]; y += f[i + 1]; o[i] = x / q; o[i + 1] = y / q; }
  return o;
}
async function tabiLoad() {
  if (cityD && railD) return;
  const [c, r] = await Promise.all([tabiFile('city.json', 'city_v1'), tabiFile('rail.json', 'rail_v1')]);
  // 市区町村：0.1°ごとのマスに、重なる市区町村を入れておく
  const cities = c.c.map(([code, pi, name, bb, polys]) => ({code, pref: c.p[pi], name, bb: bb.map(v => v / c.q),
    polys: polys.map(R => R.map(f => tabiUnpack(f, c.q)))}));
  const grid = new Map();
  cities.forEach((ct, i) => {
    for (let x = Math.floor(ct.bb[0] * 10); x <= Math.floor(ct.bb[2] * 10); x++)
      for (let y = Math.floor(ct.bb[1] * 10); y <= Math.floor(ct.bb[3] * 10); y++) {
        const k = x + ',' + y; let l = grid.get(k); if (!l) { l = []; grid.set(k, l); } l.push(i);
      }
  });
  cityD = {cities, grid, prefs: c.p, last: -1};
  // 線路：0.01°（約1km）ごとのマスに線分を入れておく
  const rg = new Map();
  r.l.forEach(f => {
    const a = tabiUnpack(f, r.q);
    for (let i = 2; i < a.length; i += 2) {
      const s = [[a[i - 2], a[i - 1]], [a[i], a[i + 1]]];
      for (let x = Math.floor(Math.min(s[0][0], s[1][0]) * 100); x <= Math.floor(Math.max(s[0][0], s[1][0]) * 100); x++)
        for (let y = Math.floor(Math.min(s[0][1], s[1][1]) * 100); y <= Math.floor(Math.max(s[0][1], s[1][1]) * 100); y++) {
          const k = x + ',' + y; let l = rg.get(k); if (!l) { l = []; rg.set(k, l); } l.push(s);
        }
    }
  });
  railD = {grid: rg};
}

// ---------- 判定 ----------
// 点がどの市区町村にあるか（偶奇の規則：境目を何回またぐか）
function inRings(p, R) {
  let inside = false;
  for (const a of R) for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2) {
    const xi = a[i], yi = a[i + 1], xj = a[j], yj = a[j + 1];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function cityIn(i, p) {
  const ct = cityD.cities[i], b = ct.bb;
  if (p[0] < b[0] || p[0] > b[2] || p[1] < b[1] || p[1] > b[3]) return false;
  return ct.polys.some(R => inRings(p, R));
}
function cityAt(p) {
  if (cityD.last >= 0 && cityIn(cityD.last, p)) return cityD.last; // 続く点はたいてい同じ市区町村
  const l = cityD.grid.get(Math.floor(p[0] * 10) + ',' + Math.floor(p[1] * 10)) || [];
  for (const i of l) if (cityIn(i, p)) { cityD.last = i; return i; }
  return -1;
}
function nearRail(p, r) {
  const cx = Math.floor(p[0] * 100), cy = Math.floor(p[1] * 100);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const l = railD.grid.get((cx + dx) + ',' + (cy + dy));
    if (l) for (const s of l) if (segDist(p, s[0], s[1]).d <= r) return true;
  }
  return false;
}
// 記録が途切れて直線でつないだ区間（2点だけの乗り物の区間）
const tabiGap = t => t.k === 'veh' && t.pts.length <= 2;
// 乗り物の区間が電車か車か（手で直したものはそれを使う）
function tabiAuto(t) {
  if (tabiGap(t)) return t.pts.every(p => nearRail(p, TABI_R)) ? 'train' : 'car';
  const n = t.pts.filter(p => nearRail(p, TABI_R)).length;
  return n / t.pts.length >= TABI_RATIO ? 'train' : 'car';
}
const tabiMode = t => t.k !== 'veh' ? 'walk' : (t.mode === 'train' || t.mode === 'car') ? t.mode : tabiAuto(t);
// すべての記録から、歩いた・通った市区町村と、手段ごとの距離を出す
function tabiCalc() {
  const walked = new Set(), passed = new Set(), dist = {walk: 0, train: 0, car: 0};
  tracks.forEach(t => {
    if (!t.pts || t.pts.length < 2) return;
    const m = tabiMode(t), set = m === 'walk' ? walked : passed;
    dist[m] += cumOf(t.pts)[t.pts.length - 1];
    let last = null;
    t.pts.forEach((p, i) => {
      // 直線でつないだ区間は、両端（GPS で取れた点）だけ数える。ほかは50mおきに調べる
      if (!tabiGap(t) && last && i < t.pts.length - 1 && distM(last, p) < 50) return;
      last = p;
      const c = cityAt(p); if (c >= 0) set.add(c);
    });
  });
  walked.forEach(c => passed.delete(c));
  return {walked, passed, dist};
}

// ---------- 地図に出す ----------
function cityFeature(i, w) {
  const ct = cityD.cities[i], polys = ct.polys.map(R => R.map(a => { const r = []; for (let k = 0; k < a.length; k += 2) r.push([a[k], a[k + 1]]); return r; }));
  return {type: 'Feature', properties: {w, i}, geometry: {type: 'MultiPolygon', coordinates: polys}};
}
function tabiDraw(fit) {
  const r = tabiRes = tabiCalc();
  setData('tabiCity', [...r.walked].map(i => cityFeature(i, 1)).concat([...r.passed].map(i => cityFeature(i, 0))));
  const lines = [];
  tracks.forEach((t, i) => {
    if (!t.pts || t.pts.length < 2) return;
    lines.push({type: 'Feature', properties: {i, m: tabiMode(t), g: tabiGap(t) ? 1 : 0}, geometry: {type: 'LineString', coordinates: t.pts}});
  });
  setData('tabiLine', lines);
  // 都道府県ごとの数
  const total = cityD.cities.length, per = new Map();
  cityD.cities.forEach(c => { if (!per.has(c.pref)) per.set(c.pref, {n: 0, w: 0, p: 0}); per.get(c.pref).n++; });
  r.walked.forEach(i => per.get(cityD.cities[i].pref).w++);
  r.passed.forEach(i => per.get(cityD.cities[i].pref).p++);
  const all = r.walked.size + r.passed.size, zero = [...per.values()].filter(x => !x.w && !x.p).length;
  const km = m => (r.dist[m] / 1000).toFixed(1);
  const rows = [...per.entries()].filter(([, x]) => x.w || x.p).map(([pf, x]) =>
    `<div><a href="#" data-pf="${esc(pf)}">${esc(pf)}</a>　${x.w + x.p}／${x.n}（歩いた ${x.w}・通った ${x.p}）</div>`).join('');
  mbSet(`🗾 行った市区町村 ${all}／${total}・歩いた ${r.walked.size}`,
    `<div>行った市区町村 ${all}／${total}（歩いた ${r.walked.size}・乗り物で通った ${r.passed.size}）</div>` +
    `<div>距離：<span style="color:${TABI_MODE.walk.col}">■</span>徒歩 ${km('walk')}km　<span style="color:${TABI_MODE.train.col}">■</span>電車 ${km('train')}km　<span style="color:${TABI_MODE.car.col}">■</span>車 ${km('car')}km</div>` +
    `<div class="small" style="margin:2px 0">濃い色＝歩いた市区町村、薄い色＝乗り物で通っただけ。点線は記録が途切れて直線でつないだ区間（線の上は数えません）。電車・車の線をタップすると直せます。</div>` +
    (rows || '<div>まだ記録がありません</div>') + (zero ? `<div class="small">まだ行っていない都道府県：${zero}</div>` : '') +
    `<div class="small" style="margin-top:4px">市区町村：国土数値情報（行政区域・2021年1月時点、国土交通省）を加工／線路：地球地図日本（国土地理院・2016年）を加工。境目のすぐそばでは隣の市区町村として数えることがあります。2016年より後の新線は線路がないので、車と判定されることがあります。</div>`);
  $('mbMore').querySelectorAll('[data-pf]').forEach(a => a.onclick = ev => {
    ev.preventDefault();
    const cs = cityD.cities.filter(c => c.pref === a.dataset.pf);
    const b = new mapboxgl.LngLatBounds();
    cs.forEach(c => { b.extend([c.bb[0], c.bb[1]]); b.extend([c.bb[2], c.bb[3]]); });
    map.fitBounds(b, {padding: 30});
  });
  $('tabiStat').textContent = `行った市区町村 ${all}／${total}（歩いた ${r.walked.size}・通った ${r.passed.size}）`;
  if (fit) {
    const vis = [...r.walked, ...r.passed];
    if (!vis.length) map.jumpTo({center: JAPAN, zoom: JAPAN_Z});
    else {
      const b = new mapboxgl.LngLatBounds();
      vis.forEach(i => { const bb = cityD.cities[i].bb; b.extend([bb[0], bb[1]]); b.extend([bb[2], bb[3]]); });
      map.fitBounds(b, {padding: 40, maxZoom: 10});
    }
  }
}
async function tabiOpen() {
  if (!modeOpen('tabi', tabiClear)) return;
  mbSet('🗾 旅の地図を準備中…（初めの1回は市区町村と線路のデータ 約2MB を読み込みます）', '');
  try { await tabiLoad(); }
  catch (e) { showErr('旅の地図：' + jaErr(e)); if (tabiOn()) mbSet('🗾 データを読み込めませんでした。電波のよい所でもう一度開いてください'); return; }
  if (tabiOn()) tabiDraw(true);
}
function tabiClear() {
  setData('tabiCity', []); setData('tabiLine', []);
  if (tabiPop) { tabiPop.remove(); tabiPop = null; }
}
// 記録が変わったら描き直す（walk.js の afterTracksChanged から呼ぶ）
function tabiRefresh() { if (tabiOn() && cityD) tabiDraw(false); }

// ---------- タップ：電車・車の線なら直す、市区町村ならその名前 ----------
function tabiTap(e) {
  if (!cityD) return;
  let f = [];
  try { f = map.queryRenderedFeatures([[e.point.x - 12, e.point.y - 12], [e.point.x + 12, e.point.y + 12]], {layers: ['tabiLine', 'tabiGap']}); } catch (er) {}
  const v = f.find(x => x.properties.m !== 'walk');
  if (tabiPop) tabiPop.remove();
  if (v) { tabiPop = new mapboxgl.Popup({closeButton: true}).setLngLat(e.lngLat).setHTML(tabiVehHtml(v.properties.i)).addTo(map); tabiBind(); return; }
  const c = cityAt([e.lngLat.lng, e.lngLat.lat]);
  if (c < 0) { tabiPop = null; return; }
  const ct = cityD.cities[c], st = tabiRes && tabiRes.walked.has(c) ? '歩いた' : tabiRes && tabiRes.passed.has(c) ? '乗り物で通った' : 'まだ';
  tabiPop = new mapboxgl.Popup({closeButton: true}).setLngLat(e.lngLat).setText(`${ct.pref}${ct.name}（${st}）`).addTo(map);
}
function tabiVehHtml(i) {
  const t = tracks[i]; if (!t) return '';
  const m = tabiMode(t), auto = !(t.mode === 'train' || t.mode === 'car');
  const when = new Date(t.t0), km = (cumOf(t.pts)[t.pts.length - 1] / 1000).toFixed(1);
  return `<div class="tabiPop">${ymd(t.t0).replace(/-/g, '/')} ${hm(when)}・${km}km<br>いまの判定：<b>${TABI_MODE[m].nm}</b>${auto ? '（自動）' : '（手で直した）'}<br>` +
    `<button data-tm="train" data-ti="${i}">電車にする</button><button data-tm="car" data-ti="${i}">車にする</button>` +
    (auto ? '' : `<button data-tm="" data-ti="${i}">自動に戻す</button>`) + '</div>';
}
function tabiBind() {
  document.querySelectorAll('.tabiPop [data-tm]').forEach(b => b.onclick = () => tabiSetMode(Number(b.dataset.ti), b.dataset.tm));
}
function tabiSetMode(i, m) {
  const t = tracks[i]; if (!t) return;
  if (m) t.mode = m; else delete t.mode;
  saveTracks();
  if (tabiPop) { tabiPop.remove(); tabiPop = null; }
  tabiDraw(false);
  status(`${ymd(t.t0).replace(/-/g, '/')}の乗り物の区間を「${m ? TABI_MODE[m].nm : '自動の判定'}」にしました`);
}
$('tabiBtn').onclick = tabiOpen;
