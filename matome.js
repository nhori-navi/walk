// matome.js：版25 散歩のまとめ（hikae.js のあとに読み込む）
// 「■ 終了」を押したとき、その散歩の時間の分だけを1枚のカードにまとめて、ルートタブのいちばん上に出す
// ・MichiMiru：距離・時間・はじめて歩いた道・新しい踏破マス・完全制覇・スタンプ・東海道
// ・MeguMiru：その時間に集めた場所（はじめて・段階が上がった）。MeguMiru の画面が残っていればその中から、なければ入れ物 megu／kv から
// ・TenMiru：その時間にキャッチした飛行機（sora_catch_v1）と、散歩中の通知で知らせた飛行機（walk_skylog、native.js が書く）
// ・YamaMiru：その時間に見つけた山（yama_zukan_v1 の t2）
// 地図には、それぞれの場所に小さな印。まとめは IndexedDB michimiru／kv の 'walks' に1回ずつ残す（版26 の散歩日記が使う）
const SUM = {mk: [], cur: null};
const SUM_MIN_M = 100; // これより短い記録は、今まで通り1行だけ
const MEGU_IC = {st: '🚉', city: '🗾', mi: '🛣️', mu: '🏛️', hi: '🏯'};

// 歩き始めたときの控え（スタンプと東海道。開き直して続けるときは、前の控えをそのまま使う）
function sumStart() {
  if (!walk || walk.s0) return;
  const today = ymd(Date.now());
  walk.s0 = {st: Object.keys(stamps).filter(k => (stamps[k].days || []).includes(today)), tk: typeof tkKm === 'number' ? tkKm : 0,
    prog: Number(getLS('walk_tokaido_last')) || 0};
}
// その時刻にいた場所（記録の各点の時刻 ts から）
function sumPosAt(tr, t) {
  if (!tr || !tr.pts || !tr.pts.length) return null;
  if (!Array.isArray(tr.ts) || tr.ts.length !== tr.pts.length) return tr.pts[tr.pts.length - 1];
  const s = (t - tr.t0) / 1000; let i = 0;
  while (i + 1 < tr.ts.length && tr.ts[i + 1] <= s) i++;
  return tr.pts[i];
}
async function sumMegu(t0, t1) {
  let LOGm = null, RECm = null;
  try { const f = typeof ovFrames !== 'undefined' && ovFrames.megu; if (f && f.contentWindow) { LOGm = f.contentWindow.eval('typeof LOG !== "undefined" ? LOG : null'); RECm = f.contentWindow.eval('typeof REC !== "undefined" ? REC : null'); } } catch (e) {}
  if (!LOGm && typeof meguDb === 'function') {
    const db = await meguDb(false);
    if (db) { LOGm = await kvGet(db, 'log'); RECm = await kvGet(db, 'rec'); db.close(); }
  }
  if (!Array.isArray(LOGm) || !RECm) return [];
  const seen = new Set(), out = [];
  LOGm.forEach(e => {
    if (!e || e.t < t0 || e.t > t1 + 60000 || (e.k !== 'new' && e.k !== 'up') || seen.has(e.id)) return;
    const r = RECm[e.id], s = r && r.s; if (!s || !s.n) return;
    seen.add(e.id);
    out.push({n: s.n, sh: s.sh || '', k: e.k, t: e.t, p: s.x != null && s.y != null ? [s.x, s.y] : null});
  });
  return out;
}
function sumTen(t0, t1, tr) {
  const out = [];
  try {
    const c = JSON.parse(localStorage.getItem('sora_catch_v1') || '{}');
    (c.log || []).forEach(e => { if (e && e.t >= t0 && e.t <= t1) out.push({k: 'catch', t: e.t, cs: e.cs || '', ty: e.ty || '', route: e.route || '', p: sumPosAt(tr, e.t)}); });
  } catch (e) {}
  try {
    (JSON.parse(getLS('walk_skylog') || '[]') || []).forEach(e => { if (e && e.t >= t0 && e.t <= t1) out.push({k: e.k, t: e.t, cs: e.cs || '', ty: e.ty || '', route: '', p: e.p || sumPosAt(tr, e.t)}); });
  } catch (e) {}
  // 同じ飛行機は1つに（キャッチ＞軍用機＞真上の順で残す）
  const rank = {catch: 0, mil: 1, over: 2}, best = new Map();
  out.forEach(e => { const id = (e.cs || '') + '|' + (e.ty || ''); const b = best.get(id); if (!b || rank[e.k] < rank[b.k]) best.set(id, e); });
  return [...best.values()].sort((a, b) => a.t - b.t);
}
function sumYama(t0, t1, tr) {
  const out = [];
  try {
    const z = JSON.parse(localStorage.getItem('yama_zukan_v1') || '{}');
    Object.values(z.peaks || {}).forEach(e => { if (e && e.t2 >= t0 && e.t2 <= t1) out.push({n: e.n, t: e.t2, first: e.t1 >= t0, p: sumPosAt(tr, e.t2)}); });
  } catch (e) {}
  return out.sort((a, b) => a.t - b.t);
}
// まとめを作る（終了の直後、記録を数え直したあとに呼ぶ）
async function sumBuild(w) {
  const tr = w.track, t0 = w.t0, t1 = tr.t1 || Date.now();
  const o = {t0, t1, dist: Math.round(w.dist), sec: Math.round((t1 - t0) / 1000), kcal: Math.round(w.kcal), up: Math.round(w.up || 0)};
  // はじめて歩いた道：この散歩より前の記録で歩いていない道（読み込んだ道のデータの範囲だけ）
  if (graph && typeof markWalked === 'function') {
    try { markWalked(graph, t0); let m = 0; graph.edges.forEach(e => { if (e.k && !e.k0) m += e.w; }); o.newRoad = Math.round(m); } catch (e) {}
    try { markWalked(graph); } catch (e) {}
  }
  // 新しい踏破マス：この散歩の線が通ったマスのうち、前の記録で通っていないもの
  try {
    const mine = new Set(); meshOfSegs(cleanTrack(tr).segs, k => mine.add(k));
    o.newMesh = [...mine].filter(k => !(meshBase.get(k) < t0)).length;
  } catch (e) {}
  o.done = Object.values(meshDone).filter(t => t >= t0).length;
  // スタンプ
  const today = ymd(t0), s0 = (w.s0 && w.s0.st) || [];
  o.stamps = Object.entries(stamps).filter(([k, s]) => (s.days || []).includes(today) && !s0.includes(k)).map(([k, s]) => ({n: s.n, k: s.k, neu: s.first >= t0, p: s.p}));
  // 東海道
  if (w.s0 && typeof tkKm === 'number') {
    const N = TOKAIDO.length - 1, p1 = Number(getLS('walk_tokaido_last')) || 0, reach = [];
    for (let q = w.s0.prog + 1; q <= p1 && reach.length < 10; q++) { const i = q % N; reach.push(i === 0 ? '京都三条大橋' : TOKAIDO[i][0]); }
    o.tk = {km: Math.max(0, Math.round((tkKm - w.s0.tk) * 10) / 10), reach};
  }
  o.megu = await sumMegu(t0, t1);
  o.ten = sumTen(t0, t1, tr);
  o.yama = sumYama(t0, t1, tr);
  o.meguOpen = !!(typeof ovFrames !== 'undefined' && ovFrames.megu);
  o.bb = (() => { let w0 = 180, s = 90, e = -180, n = -90; (tr.pts || []).forEach(p => { w0 = Math.min(w0, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]); }); return [[w0, s], [e, n]]; })();
  return o;
}
// IndexedDB michimiru／kv の 'walks'（散歩ごとのまとめ。始めた時刻で1つ）
async function sumLoad() { try { const a = await trkDo('readonly', st => st.get('walks')); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
async function sumSave(o) {
  try {
    const a = (await sumLoad()).filter(x => x && x.t0 !== o.t0);
    const keep = Object.assign({}, o); delete keep.meguOpen;
    a.push(keep); a.sort((x, y) => x.t0 - y.t0);
    await trkDo('readwrite', st => st.put(a, 'walks'));
  } catch (e) {}
}
// ---------- 見せる ----------
const sumName = (list, f, max = 5) => list.slice(0, max).map(f).join('・') + (list.length > max ? `（ほか${list.length - max}）` : '');
function sumHtml(o) {
  const L = [];
  const avg = o.sec > 0 ? o.dist / o.sec * 3.6 : 0;
  if (o.newRoad >= 10) L.push(`🆕 はじめて歩いた道 <b>${fmtDist(o.newRoad)}</b>`);
  if (o.newMesh || o.done) L.push(`🟧 新しい踏破マス <b>${o.newMesh || 0}</b>` + (o.done ? `・🏆 完全制覇 <b>${o.done}</b>` : ''));
  if (o.stamps && o.stamps.length) { const nu = o.stamps.filter(s => s.neu); L.push(`⛩ スタンプ <b>${o.stamps.length}</b>` + (nu.length ? `（はじめて：${esc(sumName(nu, s => s.n, 3))}）` : '')); }
  if (o.tk && o.tk.km >= 0.1) L.push(`🏯 東海道 <b>+${o.tk.km.toFixed(1)}km</b>` + (o.tk.reach.length ? `（${esc(o.tk.reach.join('・'))}に着きました）` : ''));
  if (o.megu && o.megu.length) {
    const nu = o.megu.filter(m => m.k === 'new'), up = o.megu.filter(m => m.k === 'up');
    L.push(`🗾 MeguMiru：` + (nu.length ? `はじめて <b>${nu.length}</b>（${esc(sumName(nu, m => (MEGU_IC[m.sh] || '') + m.n))}）` : '') + (up.length ? `${nu.length ? '・' : ''}段階が上がった ${up.length}` : ''));
  } else if (typeof IN_APP !== 'undefined' && IN_APP && !o.meguOpen) L.push('<span class="sub">🗾 MeguMiru を開くと、この散歩で通った場所が入ります</span>');
  if (o.ten && o.ten.length) L.push('✈️ TenMiru：' + esc(sumName(o.ten, e => (e.cs || e.ty) + (e.route ? ' ' + e.route : '') + (e.k === 'catch' ? '（キャッチ）' : e.k === 'mil' ? '（軍用機）' : '（真上）'), 4)));
  if (o.yama && o.yama.length) L.push('🏔 YamaMiru：' + esc(sumName(o.yama, e => e.n + (e.first ? '（はじめて）' : ''))));
  return `<div class="ch">🏁 散歩のまとめ<span class="sub">${hm(new Date(o.t0))}〜${hm(new Date(o.t1))}</span></div>` +
    `<div class="sbig">${fmtDist(o.dist)}・${fmtTime(o.sec)}</div>` +
    `<div class="sub">平均 ${avg.toFixed(1)}km/h${o.up >= 1 ? `・上り ${o.up}m` : ''}・${o.kcal}kcal</div>` +
    (L.length ? `<ul class="sumL">${L.map(x => `<li>${x}</li>`).join('')}</ul>` : '') +
    '<div class="acts"><button id="sumMap">🗺 地図で見る</button><button id="sumClose">閉じる</button></div>';
}
function sumMarks(o) {
  sumMarksClear();
  const add = (p, ic, title) => {
    if (!p) return;
    const el = document.createElement('div'); el.className = 'sumMk'; el.textContent = ic; el.title = title;
    el.addEventListener('click', e => { e.stopPropagation(); status(title); });
    SUM.mk.push(new mapboxgl.Marker({element: el}).setLngLat(p).addTo(map));
  };
  (o.megu || []).forEach(m => add(m.p, MEGU_IC[m.sh] || '📍', `${m.n}（MeguMiru・${m.k === 'new' ? 'はじめて' : '段階が上がった'}・${hm(new Date(m.t))}）`));
  (o.ten || []).forEach(e => add(e.p, '✈️', `${e.cs || ''} ${e.ty}${e.route ? ' ' + e.route : ''}（${e.k === 'catch' ? 'キャッチ' : e.k === 'mil' ? '軍用機の知らせ' : '真上の知らせ'}・${hm(new Date(e.t))}）`));
  (o.yama || []).forEach(e => add(e.p, '🏔', `ここで${e.n}を見つけました（${hm(new Date(e.t))}）`));
  (o.stamps || []).forEach(s => add(s.p, POI[s.k] ? POI[s.k].ic : '⛩', `${s.n}のスタンプ`));
}
function sumMarksClear() { SUM.mk.forEach(m => { try { m.remove(); } catch (e) {} }); SUM.mk = []; }
function sumFit(o) { try { if (o.bb && o.bb[0][0] <= o.bb[1][0]) { setFollow(false); map.fitBounds(o.bb, {padding: 40, maxZoom: 16, duration: 0}); } } catch (e) {} }
function sumClose() {
  const c = $('sumCard'); if (c) c.style.display = 'none';
  sumMarksClear(); SUM.cur = null; $('result').style.display = '';
}
function sumShow(o) {
  let c = $('sumCard');
  if (!c) { c = document.createElement('div'); c.id = 'sumCard'; c.className = 'card'; $('tab-route').prepend(c); }
  SUM.cur = o; c.innerHTML = sumHtml(o); c.style.display = '';
  $('result').style.display = 'none';
  $('sumMap').onclick = () => { sumMarks(o); sumFit(o); };
  $('sumClose').onclick = sumClose;
  sumMarks(o); sumFit(o);
  if (typeof showTab === 'function') showTab('route');
  try { $('panel').scrollTop = 0; } catch (e) {}
}
// 終了のあと（walk.js から）。w は終わる前の歩行の中身
async function sumEnd(w) {
  if (!w || !w.track || !(w.dist >= SUM_MIN_M)) return;
  try {
    const o = await sumBuild(w);
    sumShow(o);
    sumSave(o);
  } catch (e) { showErr('散歩のまとめを作れませんでした（' + jaErr(e) + '）'); }
}
// 見た目
(() => {
  const st = document.createElement('style');
  st.textContent = '#sumCard{border:2px solid #2fbf71}#sumCard .ch{display:flex;align-items:baseline;gap:8px}#sumCard .ch .sub{font-size:12px;font-weight:normal;color:#5b6b61}' +
    '#sumCard .sbig{font-size:24px;font-weight:bold;margin:2px 0}#sumCard .sub{font-size:13px;color:#5b6b61}' +
    '.sumL{list-style:none;margin:8px 0 4px;padding:0}.sumL li{padding:5px 0;border-top:1px solid #e3e8e5;font-size:14px;line-height:1.45}' +
    '.sumMk{font-size:20px;line-height:1;width:30px;height:30px;display:flex;align-items:center;justify-content:center;background:#fff;border-radius:15px;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:pointer}' +
    'body.dark #sumCard .sub,body.dark #sumCard .ch .sub{color:#c9d3cd}body.dark .sumL li{border-color:#3d4a44}body.dark .sumMk{background:#28322e}';
  document.head.appendChild(st);
})();
