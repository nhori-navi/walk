// MichiMiru：共通の部品（画面の状態・表示の小道具・距離の計算・端末への保存・標高）
const $ = id => document.getElementById(id);
let pos = null, posMarker = null, arw = null, dest = null, destMarker = null, destName = '', vias = [], viaMarkers = [], loopStart = null, poiMarkers = [];
let pickMode = null, follow = true, busy = false, pending = false, mode = 'to';
let graph = null, route = null, cands = [], candIdx = 0, cmpCoords = null, cmpText = '', lastRemain = null;
let headingUp = false, heading = null, hx = 0, hy = 0, lastCompass = 0, lastCam = 0;
let walk = null, hudTimer = null;
// 版5：現在地の精度（m）・取れた時刻、地図で選んだ出発地、位置情報のエラー
let posAcc = null, posAt = 0, startPt = null, startMarker = null, geoErr = null;
const errs = [];
// 端末の種類（SoraMiru と同じ考え方）：主な操作がマウスで、向きの値が一度も届いていない端末は「センサーなし」
const PC_LIKE = !(window.matchMedia && matchMedia('(pointer: coarse)').matches);
let gotOri = false;
const noSensor = () => PC_LIKE && !gotOri;
const CAN_VIB = typeof navigator.vibrate === 'function' && !PC_LIKE; // パソコンの Chrome は命令だけあって震えない
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// 現在地が「粗い位置」か（精度100m超）。現在地がまだないときも true
const isRough = () => !pos || posAcc === null || posAcc > ROUGH_M;
// ルートの出発地：地図で選んだ場所があればそれ、なければ現在地
const origin = () => startPt || pos;
// 外へ送る前に約500m単位に丸める（0.005°）
const round500 = p => [Math.round(p[0] / 0.005) * 0.005, Math.round(p[1] / 0.005) * 0.005];
const fmtAcc = m => m >= 1000 ? (m / 1000).toFixed(1) + 'km' : Math.round(m) + 'm';
// 端末への保存（localStorage）。失敗したら10分に1回まで知らせる
let lsFailAt = 0;
function lsSet(k, v) {
  try { localStorage.setItem(k, v); return true; }
  catch (e) {
    if (Date.now() - lsFailAt > 600000) {
      lsFailAt = Date.now();
      showErr('端末への保存に失敗しました（保存容量が足りない可能性があります）。「全部まとめて書き出す」で控えを取ってください');
    }
    return false;
  }
}
// エラーの文を日本語にする（分からないものは元の文を括弧で残す）
function jaErr(e) {
  const m = String((e && (e.message || e.name)) || e || '');
  if (e && e.name === 'AbortError') return '時間切れ';
  if (e && e.name === 'QuotaExceededError') return '保存容量が足りません';
  if (/[ぁ-んァ-ヶ一-龠]/.test(m)) return m; // もともと日本語の文（中の HTTP 番号などもそのまま）
  if (/Failed to fetch|NetworkError|Load failed|network error/i.test(m)) return '通信できませんでした（電波・接続を確認してください）';
  const h = m.match(/HTTP (\d{3})/);
  if (h) {
    const c = Number(h[1]);
    if (c === 429) return '混雑で断られました（HTTP 429）';
    if (c >= 500) return `相手のサーバーの不調（HTTP ${c}）`;
    if (c === 401 || c === 403) return `利用を断られました（HTTP ${c}）`;
    return `HTTP ${c}`;
  }
  return '原因不明のエラー（' + m.slice(0, 80) + '）';
}
function getLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
const pad2 = n => String(n).padStart(2, '0');
const ymd = t => { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
// 保存場所の使い方（文字数。同じアドレスの navi／walk／sora／yama で約500万文字を共有）
const LS_CAP = 5000000;
function lsUsage() {
  let all = 0, mine = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i), n = k.length + (localStorage.getItem(k) || '').length;
      all += n; if (k.startsWith('walk_')) mine += n;
    }
  } catch (e) {}
  return {all, mine};
}
function loadJSON(k, d) { try { return JSON.parse(localStorage.getItem(k) || d); } catch (e) { return JSON.parse(d); } }
let favs = loadJSON('walk_favs', '[]');
let tracks = loadJSON('walk_tracks', '[]');
let areaMeta = loadJSON('walk_area_meta', '[]');
$('weight').value = localStorage.getItem('walk_weight') || '60';
$('weight').onchange = () => lsSet('walk_weight', $('weight').value);
const weight = () => { const w = Number($('weight').value); return w > 0 ? w : 60; };
function loadFlag(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch (e) { return d; } }
// 入・切の設定（書き出し・読み込みでも使う）。比較ルートは版5から初め「切」
const FLAGS = [['vibChk', 'walk_vib', true], ['autoFollowChk', 'walk_autofollow', true], ['offChk', 'walk_offshow', false], ['meshChk', 'walk_meshshow', false], ['cmpChk', 'walk_cmp', false]];
function loadFlags() { FLAGS.forEach(([id, k, d]) => { $(id).checked = loadFlag(k, d); }); }
loadFlags();
FLAGS.forEach(([id, k]) => $(id).addEventListener('change', () => lsSet(k, $(id).checked ? '1' : '0')));

// ---------- 共通 ----------
function showErr(m) {
  errs.unshift(nowHM() + ' ' + m); errs.length = Math.min(errs.length, 3);
  $('err').innerHTML = errs.map(x => `<div>${esc(x)}</div>`).join('');
  if (walk) { walk.msg = m; walk.msgErr = true; walk.msgUntil = Date.now() + 15000; renderHud(); }
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
// 歩行中はメニューが隠れるので、状況の表示を左上にも短く出す
const status = m => {
  $('status').textContent = m;
  if (walk && m) { walk.msg = m; walk.msgErr = false; walk.msgUntil = Date.now() + 8000; renderHud(); }
};
const pause = () => new Promise(r => setTimeout(r, 30));
function setData(id, f) { const s = map.getSource(id); if (s) s.setData({type:'FeatureCollection', features:f}); }
const line = c => [{type:'Feature', properties:{}, geometry:{type:'LineString', coordinates:c}}];
function fmtDist(m) { return m >= 1000 ? (m / 1000).toFixed(1) + 'km' : Math.round(m / 10) * 10 + 'm'; }
const mins = m => Math.max(1, Math.round(m / SPEED));
// 坂を加味した所要時間（分速80m＋上り10mごとに1分）
const walkMin = (m, up) => Math.max(1, Math.round(m / SPEED + (up || 0) / 10));
const hm = d => d.toLocaleTimeString('ja-JP', {hour:'2-digit', minute:'2-digit'});
const nowHM = () => hm(new Date());
function fmtTime(sec) { const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return h ? `${h}時間${String(m).padStart(2, '0')}分` : `${m}分`; }
const roundP = p => [Number(p[0].toFixed(5)), Number(p[1].toFixed(5))];
function twoStep(btn, label, fn) {
  btn.onclick = () => {
    if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = label; btn.style.color = ''; fn(); return; }
    btn.dataset.armed = '1'; btn.textContent = 'もう一度押すと実行'; btn.style.color = '#c00';
    setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = label; btn.style.color = ''; } }, 4000);
  };
}

// ---------- 距離・方角の計算 ----------
function distM(a, b) {
  const r = Math.PI / 180, x = (b[0] - a[0]) * r * Math.cos((a[1] + b[1]) / 2 * r), y = (b[1] - a[1]) * r;
  return Math.sqrt(x * x + y * y) * 6371000;
}
function segDist(p, a, b) {
  const k = Math.cos(p[1] * Math.PI / 180) * 111320, m = 110540;
  const ax = (a[0] - p[0]) * k, ay = (a[1] - p[1]) * m, bx = (b[0] - p[0]) * k, by = (b[1] - p[1]) * m;
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx, y = ay + t * dy;
  return {d: Math.sqrt(x * x + y * y), t};
}
function bearing(a, b) { const k = Math.cos(a[1] * Math.PI / 180); return Math.atan2((b[0] - a[0]) * k, b[1] - a[1]) * 180 / Math.PI; }
function offsetPt(p, brg, d) {
  const k = Math.cos(p[1] * Math.PI / 180) * 111320, m = 110540, r = brg * Math.PI / 180;
  return [p[0] + Math.sin(r) * d / k, p[1] + Math.cos(r) * d / m];
}
function bboxOf(pts, m) {
  const lons = pts.map(p => p[0]), lats = pts.map(p => p[1]);
  const s = Math.min(...lats), n = Math.max(...lats), w = Math.min(...lons), e = Math.max(...lons);
  const dLat = m / 110540, dLon = m / (111320 * Math.cos((s + n) / 2 * Math.PI / 180));
  return {s: s - dLat, n: n + dLat, w: w - dLon, e: e + dLon};
}
const inside = (a, b) => a.s >= b.s && a.n <= b.n && a.w >= b.w && a.e <= b.e;
function cumOf(c) { const cum = [0]; for (let i = 1; i < c.length; i++) cum.push(cum[i - 1] + distM(c[i - 1], c[i])); return cum; }
function pointAt(c, cum, d) {
  for (let i = 1; i < cum.length; i++) if (cum[i] >= d) {
    const t = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    return [c[i - 1][0] + t * (c[i][0] - c[i - 1][0]), c[i - 1][1] + t * (c[i][1] - c[i - 1][1])];
  }
  return c[c.length - 1];
}

// ---------- 道のデータの保存（IndexedDB：ブラウザ内のデータベース） ----------
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('walk_cache', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('areas');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('areas', mode), q = fn(tx.objectStore('areas'));
    tx.oncomplete = () => { db.close(); res(q && q.result); };
    tx.onerror = tx.onabort = () => { db.close(); rej(tx.error); };
  });
}
const cacheGet = id => idbDo('readonly', st => st.get(id));
const cachePut = (id, v) => idbDo('readwrite', st => st.put(v, id));
const cacheDel = id => idbDo('readwrite', st => st.delete(id));
const cacheClear = () => idbDo('readwrite', st => st.clear());
function saveMeta() { lsSet('walk_area_meta', JSON.stringify(areaMeta)); }

// ---------- 標高（国土地理院の標高タイル） ----------
// 5m間隔（航空レーザー）→ 5m間隔（写真測量）→ 10m間隔 の順に、データのあるものを使う
const DEM = [{id: 'dem5a_png', z: 15}, {id: 'dem5b_png', z: 15}, {id: 'dem_png', z: 14}];
const demMem = new Map(); // 読み込み済みのタイル（null＝その場所にデータなし）
function tileXY(p, z) {
  const n = 2 ** z, s = Math.sin(p[1] * Math.PI / 180);
  return [(p[0] + 180) / 360 * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}
async function decodeDem(buf) {
  const bmp = await createImageBitmap(new Blob([buf], {type: 'image/png'}), {premultiplyAlpha: 'none', colorSpaceConversion: 'none'});
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const cx = cv.getContext('2d', {willReadFrequently: true}); cx.drawImage(bmp, 0, 0);
  const d = cx.getImageData(0, 0, 256, 256).data, h = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) {
    const v = d[i * 4] * 65536 + d[i * 4 + 1] * 256 + d[i * 4 + 2];
    h[i] = v === 8388608 ? NaN : (v < 8388608 ? v : v - 16777216) * 0.01; // 0.01m単位。8388608は「データなし」
  }
  return h;
}
async function demTile(set, x, y) {
  const key = `dem:${set.id}/${set.z}/${x}/${y}`;
  if (demMem.has(key)) return demMem.get(key);
  let buf;
  try { buf = await cacheGet(key); } catch (e) {}
  if (buf === undefined) {
    const r = await fetch(`https://cyberjapandata.gsi.go.jp/xyz/${set.id}/${set.z}/${x}/${y}.png`);
    if (r.status === 404) buf = 0; // この場所にはこの種類のデータがない
    else if (!r.ok) throw new Error('HTTP ' + r.status);
    else buf = await r.arrayBuffer();
    try { await cachePut(key, buf); } catch (e) {}
  }
  const h = buf ? await decodeDem(buf) : null;
  demMem.set(key, h);
  if (demMem.size > 150) demMem.delete(demMem.keys().next().value); // 使いすぎないよう古いものから手放す
  return h;
}
function demSample(h, px, py) {
  px = Math.min(255, Math.max(0, px - 0.5)); py = Math.min(255, Math.max(0, py - 0.5));
  const x0 = Math.min(254, Math.floor(px)), y0 = Math.min(254, Math.floor(py)), fx = px - x0, fy = py - y0;
  const a = h[y0 * 256 + x0], b = h[y0 * 256 + x0 + 1], c = h[(y0 + 1) * 256 + x0], d = h[(y0 + 1) * 256 + x0 + 1];
  if ([a, b, c, d].some(isNaN)) return h[Math.round(py) * 256 + Math.round(px)];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
// 複数地点の高さをまとめて求める（取れない地点はNaN）
async function elevOf(pts) {
  const out = new Float32Array(pts.length).fill(NaN);
  let todo = pts.map((p, i) => i);
  for (const set of DEM) {
    if (!todo.length) break;
    const need = new Map();
    todo.forEach(i => {
      const [x, y] = tileXY(pts[i], set.z), k = Math.floor(x) + '/' + Math.floor(y);
      if (!need.has(k)) need.set(k, []);
      need.get(k).push([i, x, y]);
    });
    const keys = [...need.keys()];
    for (let j = 0; j < keys.length; j += 6) {
      await Promise.all(keys.slice(j, j + 6).map(async k => {
        const [tx, ty] = k.split('/').map(Number), h = await demTile(set, tx, ty);
        if (h) for (const [i, x, y] of need.get(k)) out[i] = demSample(h, (x - tx) * 256, (y - ty) * 256);
      }));
    }
    todo = todo.filter(i => isNaN(out[i]));
  }
  return out;
}
// 読み込み済みのタイルだけで高さを求める（歩行中のカロリー計算用。なければNaN）
function elevSync(p) {
  for (const set of DEM) {
    const [x, y] = tileXY(p, set.z), tx = Math.floor(x), ty = Math.floor(y);
    const h = demMem.get(`dem:${set.id}/${set.z}/${tx}/${ty}`);
    if (h === undefined) return NaN;
    if (h) { const v = demSample(h, (x - tx) * 256, (y - ty) * 256); if (!isNaN(v)) return v; }
  }
  return NaN;
}
// 道の網の全地点に高さを付ける。橋・トンネルの上は、両側の道の高さからなめらかにつなぐ
async function ensureElev(g) {
  if (g.ele !== undefined) return g.ele;
  status('高さのデータを準備中…（初めての場所は少し時間がかかります）'); await pause();
  try {
    const ele = await elevOf(g.lon.map((x, i) => [x, g.lat[i]]));
    const fl = g.floatN;
    for (let it = 0; it < 300 && fl.length; it++) {
      for (const i of fl) {
        let s = 0, sw = 0;
        for (const [u, e] of g.adj[i]) if (!isNaN(ele[u])) { const w = 1 / Math.max(1, e.w); s += w * ele[u]; sw += w; }
        if (sw) ele[i] = s / sw;
      }
    }
    g.ele = ele;
  } catch (e) {
    g.ele = null;
    showErr('高さのデータを取得できませんでした（' + jaErr(e) + '）。坂を考えずに計算します');
  }
  return g.ele;
}
// 坂を加味した道の重み（a→bの向きで計算）
function slopeCost(c, e, a, b, sm) {
  let dh = b - a; if (isNaN(dh)) dh = 0;
  const gr = e.w >= 5 ? dh / e.w : 0;
  if (sm === 1) {
    if (e.s) c *= 4;                                   // 階段は避ける
    if (dh > 0) c += dh * (gr > 0.08 ? 30 : 15);       // 上り1m＝平地15m分（急坂は30m分）
    else if (gr < -0.08) c += -dh * 5;                 // 急な下りも少し避ける
  } else if (sm === 2) {
    if (gr > 0.05) c *= 0.6;                           // 上り坂を選ばれやすくする
  }
  return c;
}
// ルートの高さの変化（10mごと）と、上り・下り・最大勾配
function makeProf(g, idx, coords) {
  if (!g.ele || !idx.length) return null;
  const hs = [g.ele[idx[0]], ...idx.map(i => g.ele[i]), g.ele[idx[idx.length - 1]]];
  if (hs.every(isNaN)) return null;
  const st = coords.map((c, k) => {
    if (k < 1 || k >= idx.length) return 0;
    const e = g.emap.get(edgeKey(idx[k - 1], idx[k])); return e && e.s ? 1 : 0;
  });
  const cum = cumOf(coords), total = cum[cum.length - 1], D = [], H = [], S = [];
  let k = 1, last = hs.find(v => !isNaN(v));
  for (let d = 0; ; d += 10) {
    if (d > total) d = total;
    while (k < cum.length - 1 && cum[k] < d) k++;
    const t = (d - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1), a = hs[k - 1], b = hs[k];
    let h = isNaN(a) ? b : isNaN(b) ? a : a + (b - a) * t;
    if (isNaN(h)) h = last; last = h;
    D.push(d); H.push(h); S.push(st[k - 1]);
    if (d >= total) break;
  }
  const Hs = H.map((h, i) => (H[Math.max(0, i - 1)] + h + H[Math.min(H.length - 1, i + 1)]) / 3); // 細かいぶれをならす
  let up = 0, down = 0, maxg = 0;
  for (let i = 1; i < Hs.length; i++) { const dh = Hs[i] - Hs[i - 1]; if (dh > 0) up += dh; else down -= dh; }
  for (let i = 3; i < Hs.length; i++) { const dd = D[i] - D[i - 3]; if (dd >= 25) maxg = Math.max(maxg, Math.abs(Hs[i] - Hs[i - 3]) / dd); }
  return {d: D, h: Hs, s: S, up, down, maxg};
}
function upFrom(pf, a) {
  let up = 0;
  for (let i = 1; i < pf.d.length; i++) if (pf.d[i] > a) { const dh = pf.h[i] - pf.h[i - 1]; if (dh > 0) up += dh; }
  return up;
}
function drawProf(a) {
  const cv = $('prof'), pf = route && route.prof;
  if (!pf) { cv.style.display = 'none'; return; }
  cv.style.display = 'block';
  const r = window.devicePixelRatio || 1, W = cv.clientWidth, Hh = 80;
  if (!W) return;
  cv.width = W * r; cv.height = Hh * r;
  const cx = cv.getContext('2d'); cx.scale(r, r); cx.clearRect(0, 0, W, Hh);
  let lo = Math.min(...pf.h), hi = Math.max(...pf.h);
  if (hi - lo < 20) { const m = (hi + lo) / 2; lo = m - 10; hi = m + 10; }
  const L = 34, T = 6, B = 16, total = pf.d[pf.d.length - 1] || 1;
  const X = d => L + (W - L - 6) * d / total, Y = h => T + (Hh - T - B) * (1 - (h - lo) / (hi - lo));
  cx.beginPath(); cx.moveTo(X(0), Hh - B);
  pf.d.forEach((d, i) => cx.lineTo(X(d), Y(pf.h[i])));
  cx.lineTo(X(total), Hh - B); cx.closePath(); cx.fillStyle = 'rgba(31,111,209,.15)'; cx.fill();
  cx.beginPath(); pf.d.forEach((d, i) => i ? cx.lineTo(X(d), Y(pf.h[i])) : cx.moveTo(X(d), Y(pf.h[i])));
  cx.strokeStyle = '#1f6fd1'; cx.lineWidth = 2; cx.stroke();
  cx.strokeStyle = '#f39c12'; cx.lineWidth = 4;
  for (let i = 1; i < pf.d.length; i++) if (pf.s[i]) {
    cx.beginPath(); cx.moveTo(X(pf.d[i - 1]), Y(pf.h[i - 1])); cx.lineTo(X(pf.d[i]), Y(pf.h[i])); cx.stroke();
  }
  if (a != null && a > 0) {
    cx.strokeStyle = '#c0392b'; cx.lineWidth = 2;
    cx.beginPath(); cx.moveTo(X(Math.min(a, total)), T); cx.lineTo(X(Math.min(a, total)), Hh - B); cx.stroke();
  }
  cx.fillStyle = '#555'; cx.font = '11px sans-serif'; cx.textBaseline = 'middle';
  cx.fillText(Math.round(hi) + 'm', 2, Y(hi)); cx.fillText(Math.round(lo) + 'm', 2, Y(lo));
  cx.textBaseline = 'alphabetic';
  cx.fillText('0', X(0), Hh - 3); const tl = fmtDist(total); cx.fillText(tl, W - 6 - cx.measureText(tl).width, Hh - 3);
}
window.addEventListener('resize', () => { if (route) drawProf(route.a); });
