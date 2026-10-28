// matome.js：版25 散歩のまとめ（hikae.js のあとに読み込む）。版31：地図の上のカード（小さく／くわしく）、正味のカロリーと食べ物（日替わり）、今日の合計、東海道のいま、歩く気になる一言
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
  const o = {t0, t1, dist: Math.round(w.dist), sec: Math.round((t1 - t0) / 1000), kcal: Math.round(w.kcal), up: Math.round(w.up || 0), down: Math.round(w.down || 0)};
  o.net = sumNet(o.kcal, o.sec); // 版31：正味（何もしなくても使う分を引いた、歩いた分）
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
  o.tkAt = sumTkAt(); // 版31：東海道のいま
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
    if (typeof NK !== 'undefined') NK.at = 0; // 版26：散歩日記を読み直す
  } catch (e) {}
}
// ---------- 見せる ----------
const sumName = (list, f, max = 5) => list.slice(0, max).map(f).join('・') + (list.length > max ? `（ほか${list.length - max}）` : '');
// 版26：行だけを作る（散歩日記でも使う）
function sumLines(o) {
  const L = [];
  if (o.newRoad >= 10) L.push(`🆕 はじめて歩いた道 <b>${fmtDist(o.newRoad)}</b>`);
  if (o.newMesh || o.done) L.push(`🟧 新しい踏破マス <b>${o.newMesh || 0}</b>` + (o.done ? `・🏆 完全制覇 <b>${o.done}</b>` : ''));
  if (o.stamps && o.stamps.length) { const nu = o.stamps.filter(s => s.neu); L.push(`⛩ スタンプ <b>${o.stamps.length}</b>` + (nu.length ? `（はじめて：${esc(sumName(nu, s => s.n, 3))}）` : '')); }
  if (o.tk && o.tk.km >= 0.1) L.push(`🏯 東海道 <b>+${o.tk.km.toFixed(1)}km</b>` + (o.tk.reach.length ? `（${esc(o.tk.reach.join('・'))}に着きました）` : ''));
  if (o.megu && o.megu.length) {
    const nu = o.megu.filter(m => m.k === 'new'), up = o.megu.filter(m => m.k === 'up');
    L.push(`🗾 MeguMiru：` + (nu.length ? `はじめて <b>${nu.length}</b>（${esc(sumName(nu, m => (MEGU_IC[m.sh] || '') + m.n))}）` : '') + (up.length ? `${nu.length ? '・' : ''}段階が上がった ${up.length}` : ''));
  } else if (typeof IN_APP !== 'undefined' && IN_APP && o.meguOpen === false) L.push('<span class="sub">🗾 MeguMiru を開くと、この散歩で通った場所が入ります</span>');
  if (o.ten && o.ten.length) L.push('✈️ TenMiru：' + esc(sumName(o.ten, e => (e.cs || e.ty) + (e.route ? ' ' + e.route : '') + (e.k === 'catch' ? '（キャッチ）' : e.k === 'mil' ? '（軍用機）' : '（真上）'), 4)));
  if (o.yama && o.yama.length) L.push('🏔 YamaMiru：' + esc(sumName(o.yama, e => e.n + (e.first ? '（はじめて）' : ''))));
  return L;
}
// ---------- 版31：カロリー・食べ物・東海道のいま・今日の合計・一言 ----------
// 正味＝歩いた分。記録のカロリー（速さの METs×体重×時間×1.05＋上った高さの分）から、何もしなくても使う分（1MET）を引く
function sumNet(kcal, sec) { return Math.max(0, Math.round(kcal - weight() * sec / 3600 * 1.05)); }
const FOODS = [['🍙', 'おにぎり', '個', 180], ['🍌', 'バナナ', '本', 86], ['🍩', 'ドーナツ', '個', 250], ['🍺', '缶ビール（350ml）', '本', 140],
  ['🍦', 'ソフトクリーム', '個', 150], ['🍫', '板チョコ', '枚', 280], ['🍊', 'みかん', '個', 45], ['🍡', 'みたらし団子', '本', 120],
  ['🥟', '肉まん', '個', 240], ['🍘', 'せんべい', '枚', 40], ['🍰', 'ショートケーキ', '個', 330], ['🥐', 'クロワッサン', '個', 180]];
// 日替わり：その日の番号から順に、0.3〜5個分になるものを選ぶ（少なすぎ・多すぎを避ける）
function sumFood(net, t) {
  if (!(net >= 5)) return '';
  const d = Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / 864e5);
  for (let i = 0; i < FOODS.length; i++) {
    const [ic, n, u, k] = FOODS[(d + i) % FOODS.length], x = net / k;
    if (x >= 0.3 && x <= 5) return `${ic} ${n} ${x < 1 ? x.toFixed(1) : (Math.round(x * 10) / 10).toString()}${u}分`;
  }
  const [ic, n, u, k] = FOODS[d % FOODS.length]; return `${ic} ${n} ${(net / k).toFixed(1)}${u}分`;
}
function sumTkAt() {
  if (typeof tkWhere !== 'function' || typeof tkKm !== 'number') return null;
  const w = tkWhere(tkKm), nx = TOKAIDO[w.i + 1];
  return {name: w.i === 0 && !w.lap ? '日本橋' : TOKAIDO[w.i][0], past: Math.round((w.r - TOKAIDO[w.i][1]) * 10) / 10, next: nx[0], rem: Math.round((nx[1] - w.r) * 10) / 10,
    pct: Math.round(w.r / TK_LEN * 1000) / 10, lap: w.lap, start: w.i === 0};
}
function sumTkHtml(a) {
  if (!a) return '';
  return `<div class="sumTk">🏯 東海道のいま：<b>${esc(a.name)}</b>${a.start ? 'から' : 'を過ぎて'} ${a.past.toFixed(1)}km（${esc(a.next)}まで あと <b>${a.rem.toFixed(1)}km</b>）` +
    `<span class="bar"><i style="width:${Math.min(100, a.pct)}%"></i></span><span class="sub">日本橋→京都 ${a.pct}%${a.lap ? `・${a.lap + 1}周目` : ''}</span></div>`;
}
// その日の合計（2回目から）。歩いた記録から数える（散歩日記と同じ）
function sumDay(o) {
  if (typeof nkDays !== 'function') return null;
  const e = nkDays().get(ymd(o.t0)); if (!e || e.n < 2) return null;
  let kcal = 0; e.list.forEach(({t}) => { kcal += typeof t.kcal === 'number' ? t.kcal : 0; });
  return {n: e.n, dist: e.dist, sec: e.sec, net: sumNet(kcal, e.sec)};
}
// 歩く気になる一言（1つだけ。上から順に、当てはまったもの）
function sumNudge(o) {
  const days = typeof nkDays === 'function' ? nkDays() : new Map(), d0 = ymd(o.t0);
  // 1回の距離の自己ベスト（1km 以上）
  let best = 0; days.forEach(e => e.list.forEach(({t, c}) => { if (t.t0 !== o.t0) best = Math.max(best, c.dist); }));
  if (o.dist >= 1000 && o.dist > best && best > 0) return `🏅 1回の距離の自己ベスト！（前は ${fmtDist(best)}）`;
  // 次の宿場がすぐ
  if (o.tkAt && o.tkAt.rem <= 1.5) return `🏯 次の${o.tkAt.next}まで あと ${o.tkAt.rem.toFixed(1)}km。次の散歩で着きます`;
  // 続けて歩いた日
  let n = 0; for (let t = new Date(d0 + 'T12:00:00'); days.has(ymd(t)); t.setDate(t.getDate() - 1)) n++;
  if (n >= 2) return `🔥 ${n}日続けて歩いています`;
  // あと少しのマス
  if (typeof meshInfo !== 'undefined' && pos) {
    let k = 0, near = Infinity, rest = 0;
    meshInfo.forEach((m, key) => { if (meshDone[key] || !m.W || meshRest(m) > NEAR_M) return; const b = meshBB(key), dd = distM(pos, [(b.w + b.e) / 2, (b.s + b.n) / 2]); if (dd <= 1500) { k++; if (dd < near) { near = dd; rest = meshRest(m); } } });
    if (k) return `🟧 あと少しで完全制覇のマスが近くに ${k}つ（いちばん近いのは あと${fmtDist(rest)}）`;
  }
  // MeguMiru のまだ行っていない場所
  if (typeof MN !== 'undefined' && MN.spots && MN.spots.length && pos) {
    const c = MN.spots.filter(s => !(MN.rec && MN.rec[s.id] && MN.rec[s.id].lv >= 2) && distM(pos, [s.x, s.y]) <= 1000);
    if (c.length) return `🗾 まだ行っていない場所が 1km 以内に ${c.length}か所（${esc(c.slice(0, 2).map(s => s.n).join('・'))}${c.length > 2 ? 'ほか' : ''}）`;
  }
  // 今月と先月の同じ日まで
  const now = new Date(o.t0), y = now.getFullYear(), m = now.getMonth(), dd = now.getDate();
  let tm = 0, lm = 0;
  days.forEach((e, k) => { const t = new Date(k + 'T12:00:00'); if (t.getDate() > dd) return; if (t.getFullYear() === y && t.getMonth() === m) tm += e.dist; const p = new Date(y, m - 1, 1); if (t.getFullYear() === p.getFullYear() && t.getMonth() === p.getMonth()) lm += e.dist; });
  const diff = tm - lm;
  return `📈 今月 ${fmtDist(tm)}${lm ? `（先月の同じ日までより ${diff >= 0 ? '+' : '−'}${fmtDist(Math.abs(diff))}）` : ''}`;
}
function sumHtml(o, live) {
  const L = sumLines(o), avg = o.sec > 0 ? o.dist / o.sec * 3.6 : 0, net = o.net != null ? o.net : sumNet(o.kcal, o.sec), food = sumFood(net, o.t0);
  const day = live && sumDay(o), nudge = live ? sumNudge(o) : '';
  return '<div class="sumGrip" id="sumGrip"></div><button id="sumClose" class="sumX" type="button" aria-label="閉じる">✕</button>' +
    `<div class="sumTop" id="sumTop"><div class="sumH">🏁 <b>${fmtDist(o.dist)}・${fmtTime(o.sec)}</b><span class="sub">${hm(new Date(o.t0))}〜${hm(new Date(o.t1))}</span></div>` +
    `<div class="sumK">💪 歩いた分 ${net}kcal${food ? `<span class="food">＝${food}</span>` : ''}</div>` +
    (nudge ? `<div class="sumN">${nudge}</div>` : '') + '</div>' +
    '<div class="sumMore">' +
    `<div class="sub">平均 ${avg.toFixed(1)}km/h${o.up >= 1 ? `・上り ${o.up}m` : ''}${o.down >= 1 ? `・下り ${o.down}m` : ''}・消費 ${o.kcal}kcal（うち歩いた分 ${net}kcal）</div>` +
    (day ? `<div class="sumDay">📅 今日の合計：<b>${day.n}回・${fmtDist(day.dist)}・${fmtTime(day.sec)}</b>・${day.net}kcal${sumFood(day.net, o.t0) ? `（${sumFood(day.net, o.t0)}）` : ''}</div>` : '') +
    sumTkHtml(o.tkAt) +
    (L.length ? `<ul class="sumL">${L.map(x => `<li>${x}</li>`).join('')}</ul>` : '') +
    '</div><button id="sumMore" class="sumMoreBtn" type="button">▴ くわしく</button>';
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
function sumOpen(v) {
  const c = $('sumCard'); if (!c) return;
  c.classList.toggle('open', v); $('sumMore').textContent = v ? '▾ 小さく' : '▴ くわしく';
  if (SUM.cur) sumFit(SUM.cur);
}
function sumFit(o) {
  try {
    if (!(o.bb && o.bb[0][0] <= o.bb[1][0])) return;
    setFollow(false);
    const c = $('sumCard'), h = c && c.style.display !== 'none' && !c.classList.contains('open') ? c.offsetHeight + 16 : 40;
    map.fitBounds(o.bb, {padding: {top: 40, left: 30, right: 70, bottom: Math.min(h, map.getContainer().clientHeight * 0.6)}, maxZoom: 16, duration: 0});
  } catch (e) {}
}
// 版31：地図の上（下の端）に浮かぶカード。初めは小さく（距離・時間・カロリー・一言）、「くわしく」か上になぞると全部
function sumShow(o) {
  let c = $('sumCard');
  if (!c) { c = document.createElement('div'); c.id = 'sumCard'; $('map').appendChild(c); }
  SUM.cur = o; c.innerHTML = sumHtml(o, true); c.style.display = ''; c.classList.remove('open');
  $('result').style.display = 'none';
  $('sumClose').onclick = e => { e.stopPropagation(); sumClose(); };
  $('sumMore').onclick = e => { e.stopPropagation(); sumOpen(!c.classList.contains('open')); };
  $('sumTop').onclick = () => { if (!c.classList.contains('open')) sumOpen(true); };
  let y0 = null;
  c.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, {passive: true});
  c.addEventListener('touchend', e => { if (y0 == null) return; const dy = e.changedTouches[0].clientY - y0; y0 = null; if (dy < -30) sumOpen(true); else if (dy > 30 && !c.scrollTop) sumOpen(false); });
  ['touchstart', 'touchmove', 'wheel', 'mousedown', 'click', 'dblclick'].forEach(ev => c.addEventListener(ev, e => e.stopPropagation(), {passive: true}));
  sumMarks(o); setTimeout(() => sumFit(o), 50);
  if (typeof showTab === 'function') showTab('route');
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
  st.textContent = '#sumCard{position:absolute;left:8px;right:62px;bottom:8px;z-index:6;background:rgba(255,255,255,.97);border:2px solid #2fbf71;border-radius:16px;padding:6px 12px 6px;box-shadow:0 4px 16px rgba(0,0,0,.25);' +
      'max-height:calc(100% - 16px);overflow-y:auto;overscroll-behavior:contain;font-size:14px;color:#1d2b22}' +
    '#sumCard .sumGrip{width:40px;height:4px;border-radius:2px;background:#c9d3cd;margin:0 auto 4px}#sumCard .sumX{position:absolute;right:6px;top:4px;margin:0;width:34px;height:34px;min-height:0;padding:0;border:0;background:transparent;font-size:18px;color:#5b6b61}' +
    '#sumCard .sumH{font-size:20px;padding-right:30px}#sumCard .sumH .sub{font-size:12px;margin-left:8px}#sumCard .sumK{font-size:15px;margin-top:2px}#sumCard .food{margin-left:4px;color:#b9770e;font-weight:bold}' +
    '#sumCard .sumN{margin-top:4px;padding:5px 8px;border-radius:10px;background:#fff6d6;font-size:13px;line-height:1.4}#sumCard .sub{font-size:12px;color:#5b6b61}' +
    '#sumCard .sumMore{display:none;margin-top:6px}#sumCard.open .sumMore{display:block}#sumCard .sumMoreBtn{display:block;width:100%;margin:6px 0 0;min-height:34px;padding:2px;border:0;background:#eef6f1;border-radius:10px;color:#1e7e34;font-size:13px}' +
    '#sumCard .sumDay{margin-top:6px;padding:5px 8px;border-radius:10px;background:#eef6f1}#sumCard .sumTk{margin-top:6px;line-height:1.5}#sumCard .sumTk .bar{display:block;height:8px;border-radius:4px;background:#e6e1d6;overflow:hidden;margin:3px 0 1px}#sumCard .sumTk .bar i{display:block;height:100%;background:#d4882b}' +
    '.sumL{list-style:none;margin:8px 0 4px;padding:0}.sumL li{padding:5px 0;border-top:1px solid #e3e8e5;font-size:14px;line-height:1.45}' +
    '.sumMk{font-size:20px;line-height:1;width:30px;height:30px;display:flex;align-items:center;justify-content:center;background:#fff;border-radius:15px;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:pointer}' +
    'body.dark #sumCard{background:rgba(36,44,41,.97);color:#f1f5f2}body.dark #sumCard .sub,body.dark #sumCard .sumX{color:#c9d3cd}body.dark #sumCard .sumN{background:#4a4220}body.dark #sumCard .sumDay,body.dark #sumCard .sumMoreBtn{background:#22302a;color:#a8e0b4}' +
    'body.dark #sumCard .food{color:#ffd27a}body.dark .sumL li{border-color:#3d4a44}body.dark .sumMk{background:#28322e}body.mode-tk #sumCard,body.mode-tabi #sumCard,body.walking #sumCard{display:none!important}';
  document.head.appendChild(st);
})();
