// osusume.js：版32 散歩の前の「☀ 今日のおすすめ」（nikki.js のあとに読み込む）。版33：「通る周回」は距離の指定に合わせた輪（app.js の loopPick）
// ルートタブの「🎲 おまかせで歩く」のすぐ上に1枚。ルートがあるとき・歩いているときは隠す（おまかせボタンと同じ）
// ・🗻 山の見え方：YamaMiru の「見える？予報」と同じ計算。YamaMiru の⭐お気に入りが1km以内にあればその山、なければ富士山（150km より遠ければ出さない）
//   天気は YamaMiru の保存（yama_wx_v1）が新しければそれ、なければ自分で Open-Meteo に聞いて walk_wx_v1 に（1時間に1回まで）
// ・🛰 宇宙ステーション：TenMiru（v42〜）が計算するたびに残す sora_iss_v1 を読む
// ・📍 近くの行き先（1行。押すと広がる）：MeguMiru のまだ行っていない場所（1.5km 以内・3つ）、行き先ピン（今日・明日・日付なし、5km 以内・2つ）、催し（今日・明日、5km 以内・2つ）
//   それぞれ「ここへ歩く」（目的地に）・「通る周回」（経由地にして周回）・「見る」（MeguMiru で開く）
// ・🟧 あと少しのマス：道のデータを読んだあと、1.5km 以内。「通る周回」はいちばん近いマスの、まだ歩いていない道のまん中を経由地に
// ・一言：東海道・続けて歩いた日・今日の分・今月
const OS = {open: getLS('walk_os_open') !== '0', nearOpen: false, wxBusy: false, wxAt: 0, wxErr: '', nr: null, nrAt: 0, nrBusy: false, last: '', at: 0, ap: null};
const OS_FUJI = {name: '富士山', p: [138.7274, 35.3606], h: 3776};
const OS_WX_MIN = 60, OS_H0 = 5, OS_HN = 15, OS_SLOTS = [['朝', 6, 9], ['昼', 11, 14], ['夕', 15, 18]], OS_MARK = ['×', '△', '○', '◎'];
const OS_SPOT_R = 1500, OS_FAR_R = 5000, OS_MESH_R = 1500;
const OS_DIR8 = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
const osDir8 = az => OS_DIR8[Math.round((((az % 360) + 360) % 360) / 45) % 8];
const osDir = (a, b) => osDir8(bearing(a, b));
const osLs = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const osHere = () => pos || startPt || osLs('walk_lastpos', null);
const osDay = (t = Date.now()) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`; };

// ---------- 🗻 山の見え方（YamaMiru の forecast.js と同じ考え方） ----------
const osKey = p => p[0].toFixed(2) + ',' + p[1].toFixed(2);
const osMid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
function osTargets(here) {
  const fav = (osLs('yama_fav_v1', []) || []).find(f => f && f.p && distM(f.p, here) < 1000 && (f.peaks || []).length);
  if (fav) return {from: fav.p, name: fav.name, peaks: fav.peaks.map(k => ({name: k.name, p: k.p, h: k.h, d: k.d || distM(fav.p, k.p)}))};
  const d = distM(here, OS_FUJI.p);
  if (d > 150000) return null;
  return {from: here, name: '', peaks: [Object.assign({d}, OS_FUJI)]};
}
function osWxStore() {
  const a = osLs('yama_wx_v1', {}) || {}, b = osLs('walk_wx_v1', {}) || {}, out = {};
  [a, b].forEach(st => Object.keys(st).forEach(k => { if (st[k] && (!out[k] || st[k].t > out[k].t)) out[k] = st[k]; }));
  return out;
}
function osNeedKeys(tg) {
  const ps = [tg.from];
  tg.peaks.forEach(k => { ps.push(k.p); if (k.d > 50000) ps.push(osMid(tg.from, k.p)); });
  return ps;
}
async function osWxEnsure(tg) {
  if (!tg || OS.wxBusy) return;
  const st = osWxStore(), now = Date.now(), today = ymd(now), need = new Map();
  osNeedKeys(tg).forEach(p => { const k = osKey(p), v = st[k]; if (!v || now - v.t > OS_WX_MIN * 60000 || v.day !== today) need.set(k, p); });
  if (!need.size || now - OS.wxAt < 10 * 60000) return; // 失敗したときなどは10分あける
  OS.wxBusy = true; OS.wxAt = now;
  try {
    const ps = [...need.values()];
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + ps.map(p => p[1].toFixed(2)).join(',') + '&longitude=' + ps.map(p => p[0].toFixed(2)).join(',') +
      '&hourly=cloud_cover_low,cloud_cover_mid,precipitation,visibility,relative_humidity_2m&forecast_days=3&timezone=Asia%2FTokyo';
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 15000);
    const r = await fetch(url, {signal: ac.signal}).finally(() => clearTimeout(tm));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    let js = await r.json(); if (!Array.isArray(js)) js = [js];
    const mine = osLs('walk_wx_v1', {}) || {};
    js.forEach((j, i) => {
      if (!ps[i]) return;
      const hr = j.hourly || {}, tmz = hr.time || [], o = {t: now, day: today, cl: [], cm: [], pr: [], vis: [], rh: []};
      tmz.forEach((s, n) => {
        const dd = Math.round((new Date(s.slice(0, 10) + 'T00:00') - new Date(today + 'T00:00')) / 86400000), h = +s.slice(11, 13);
        if (dd < 0 || dd > 2 || h < OS_H0 || h >= OS_H0 + OS_HN) return;
        const x = dd * OS_HN + h - OS_H0, g = a => (a && a[n] != null ? Math.round(a[n]) : null);
        o.cl[x] = g(hr.cloud_cover_low); o.cm[x] = g(hr.cloud_cover_mid); o.pr[x] = hr.precipitation && hr.precipitation[n] != null ? +hr.precipitation[n] : null;
        o.vis[x] = g(hr.visibility); o.rh[x] = g(hr.relative_humidity_2m);
      });
      mine[osKey(ps[i])] = o;
    });
    Object.keys(mine).forEach(k => { if (!mine[k] || now - mine[k].t > 6 * 3600000) delete mine[k]; });
    lsSet('walk_wx_v1', JSON.stringify(mine));
    OS.wxErr = '';
  } catch (e) { OS.wxErr = '天気予報を取得できませんでした'; }
  finally { OS.wxBusy = false; osRender(); }
}
function osHourLv(o, pk, mid, k, x) {
  if (!o || !pk || pk.cl[x] == null) return null;
  const n = v => v || 0;
  if (Math.max(n(o.pr[x]), n(pk.pr[x])) >= 0.5) return 0;
  let c = Math.max(n(pk.cl[x]), (k.h >= 2500 ? 1 : 0.5) * n(pk.cm[x]));
  if (mid) c = Math.max(c, 0.8 * n(mid.cl[x]));
  c = Math.max(c, 0.6 * n(o.cl[x]));
  let lv = c < 25 ? 3 : c < 50 ? 2 : c < 75 ? 1 : 0;
  const vis = o.vis[x];
  if (vis != null) { if (vis < k.d * 0.3 && vis < 15000) lv = 0; else if (vis < Math.min(k.d, 20000)) lv = Math.max(0, lv - 1); }
  if (k.d > 50000 && n(o.rh[x]) >= 85) lv = Math.max(0, lv - 1);
  return lv;
}
// その日（dd：0今日・1明日）の朝昼夕。山が何座かあればいちばんよいもの
function osLevels(tg, st, dd) {
  const o = st[osKey(tg.from)];
  return OS_SLOTS.map(([, h0, h1]) => {
    let best = null;
    tg.peaks.forEach(k => {
      const pk = st[osKey(k.p)], mid = k.d > 50000 ? st[osKey(osMid(tg.from, k.p))] : null;
      for (let h = h0; h <= h1; h++) { const lv = osHourLv(o, pk, mid, k, dd * OS_HN + h - OS_H0); if (lv != null && (best == null || lv > best)) best = lv; }
    });
    return best;
  });
}
function osWxRow(here) {
  const tg = osTargets(here); if (!tg) return null;
  const st = osWxStore(), hr = new Date().getHours(), dd = hr >= 18 ? 1 : 0, cs = hr < 10 ? 0 : hr < 15 ? 1 : 2;
  osWxEnsure(tg);
  const lv = osLevels(tg, st, dd), names = tg.peaks.slice(0, 2).map(k => k.name).join('・') + (tg.peaks.length > 2 ? 'ほか' : '');
  const has = lv.some(v => v != null);
  const marks = has ? OS_SLOTS.map((s, i) => `<span class="osLv lv${lv[i] == null ? 'n' : lv[i]}${dd === 0 && i < cs ? ' past' : ''}">${s[0]}${lv[i] == null ? '－' : OS_MARK[lv[i]]}</span>`).join('')
    : `<span class="sub">${OS.wxBusy ? '天気予報を取得中…' : esc(OS.wxErr || '天気予報を取得します')}</span>`;
  const best = has ? Math.max(...lv.slice(dd === 0 ? cs : 0).filter(v => v != null), -1) : -1;
  return {k: 'wx', mini: has ? `🗻${best >= 0 ? OS_MARK[best] : '－'}` : '🗻',
    html: `<button class="osRow" data-os="yama"><span class="ic">🗻</span><span class="tx"><b>${esc(names)}</b> ${dd ? '明日' : '今日'}の見え方${tg.name ? `<span class="sub">（⭐${esc(tg.name)}から）</span>` : ''}<br>${marks}</span></button>`};
}

// ---------- 🛰 宇宙ステーション（TenMiru v42〜の sora_iss_v1） ----------
function osIssRow(here) {
  const j = osLs('sora_iss_v1', null), now = Date.now();
  const btn = (body, mini) => ({k: 'iss', mini, html: `<button class="osRow" data-os="sora"><span class="ic">🛰</span><span class="tx">${body}</span></button>`});
  if (!j || !Array.isArray(j.list)) return btn('宇宙ステーション：<span class="sub">TenMiru を一度開くと、見える時刻が出ます</span>', '');
  const far = here && j.p && distM(here, j.p) > 30000;
  const nx = j.list.find(p => p && p.e > now);
  if (!nx) {
    if (now - j.t < 72 * 3600000 && !far) return btn('宇宙ステーション：<span class="sub">3日以内に見える通過はありません</span>', '');
    return btn('宇宙ステーション：<span class="sub">TenMiru を開くと、見える時刻を計算し直します</span>', '');
  }
  const d = new Date(nx.s), today = new Date(); today.setHours(0, 0, 0, 0);
  const dd = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - today) / 86400000), h = d.getHours();
  const when = (dd === 1 && h < 5 ? '今夜遅く' : dd === 0 ? (h < 12 ? '今朝' : h < 17 ? '今日' : '今夜') : dd === 1 ? (h < 12 ? '明日の朝' : '明日の夜') : dd === 2 ? (h < 12 ? 'あさっての朝' : 'あさっての夜') : osDay(nx.s));
  const on = nx.s <= now;
  return btn(`${on ? '<b class="osHot">いま見えています</b>' : `<b>${when} ${hm(d)}</b>`}〜${hm(new Date(nx.e))} ${osDir8(nx.saz)}→${osDir8(nx.eaz)}・最大 ${Math.round(nx.max)}°` +
    (far ? '<br><span class="sub">（前に計算した場所の時刻です。TenMiru を開くと、いまの場所で計算し直します）</span>' : ''), `🛰${hm(d)}`);
}

// ---------- 📍 近くの行き先（MeguMiru の置き場を読む） ----------
async function osNearLoad(force) {
  const now = Date.now();
  if (OS.nrBusy || (!force && OS.nr && now - OS.nrAt < 120000)) return;
  OS.nrBusy = true;
  try {
    const out = {spots: [], plans: [], flea: null, venue: {}, rec: {}, none: true};
    if (typeof mnLoad === 'function') { try { await mnLoad(); } catch (e) {} }
    if (typeof MN !== 'undefined') { out.spots = MN.spots || []; out.rec = MN.rec || {}; out.none = !out.spots.length; }
    if (typeof meguDb === 'function') {
      const db = await meguDb(false);
      if (db) {
        try { out.plans = (await kvGet(db, 'plans')) || []; out.flea = (await kvGet(db, 'flea')) || null; out.venue = (await kvGet(db, 'fleavenue')) || {}; if (!out.spots.length) out.rec = (await kvGet(db, 'rec')) || out.rec; }
        finally { db.close(); }
      }
    }
    OS.nr = out; OS.nrAt = now;
  } finally { OS.nrBusy = false; }
  osRender();
}
function osNearItems(here) {
  const nr = OS.nr; if (!nr || !here) return [];
  const today = ymd(Date.now()), tmw = ymd(Date.now() + 86400000), items = [];
  const lvOk = id => !(nr.rec && nr.rec[id] && nr.rec[id].lv >= 2);
  const IC = {mu: '🏛', hi: '🏯', mi: '🛣'};
  nr.spots.filter(s => s && s.x != null && lvOk(s.id)).map(s => [s, distM(here, [s.x, s.y])]).filter(([, d]) => d <= OS_SPOT_R)
    .sort((a, b) => a[1] - b[1]).slice(0, 3)
    .forEach(([s, d]) => items.push({k: 'spot', id: s.id, ic: IC[s.sh] || '📍', n: s.n, sub: s.sub || 'まだ行っていない場所', p: [s.x, s.y], d}));
  (nr.plans || []).filter(p => p && p.x != null && (!p.d || p.d === today || p.d === tmw)).map(p => [p, distM(here, [p.x, p.y])]).filter(([, d]) => d <= OS_FAR_R)
    .sort((a, b) => a[1] - b[1]).slice(0, 2)
    .forEach(([p, d]) => items.push({k: 'pin', id: p.id, ic: '📌', n: p.n || '行き先ピン', sub: '行き先ピン' + (p.d === today ? '・今日' : p.d === tmw ? '・明日' : ''), p: [p.x, p.y], d}));
  const ev = (nr.flea && Array.isArray(nr.flea.ev) ? nr.flea.ev : []).map(e => {
    const v = (nr.venue || {})[e.vc] || {}; if (v.x == null || !e.d) return null;
    const end = e.d2 || e.d, day = e.d <= today && end >= today ? today : e.d <= tmw && end >= tmw ? tmw : null;
    if (!day) return null;
    return {k: 'ev', id: e.vc, ic: e.gk === 'hb' ? '🎆' : '🎪', n: e.n || v.n || '催し', sub: '催し・' + (day === today ? '今日' : '明日') + (v.n && v.n !== e.n ? '・' + v.n : ''), p: [v.x, v.y], d: distM(here, [v.x, v.y]), day};
  }).filter(e => e && e.d <= OS_FAR_R);
  const seen = new Set();
  ev.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.d - b.d)).forEach(e => { if (seen.size < 2 && !seen.has(e.n)) { seen.add(e.n); items.push(e); } });
  return items;
}
function osNearRow(here) {
  const nr = OS.nr;
  if (!nr) { osNearLoad(); return null; }
  osNearLoad();
  const it = osNearItems(here);
  OS.items = it;
  if (!it.length) {
    if (nr.none && !(nr.plans || []).length) return {k: 'near', mini: '', html: '<button class="osRow" data-os="megu"><span class="ic">📍</span><span class="tx">近くの行き先：<span class="sub">MeguMiru を一度開くと、まだ行っていない場所が出ます</span></span></button>'};
    return null;
  }
  const nearest = it.slice().sort((a, b) => a.d - b.d)[0];
  let h = `<button class="osRow" id="osNearBtn"><span class="ic">📍</span><span class="tx"><b>近くの行き先 ${it.length}か所</b><span class="sub">（いちばん近い：${esc(nearest.n)} ${fmtDist(nearest.d)}）</span></span><i class="osArr">${OS.nearOpen ? '▴' : '▾'}</i></button>`;
  if (OS.nearOpen) {
    h += '<div class="osList">' + it.map((x, i) => `<div class="osIt"><div class="osItT">${x.ic} <b>${esc(x.n)}</b><span class="sub">${esc(x.sub)}・${osDir(here, x.p)} ${fmtDist(x.d)}</span></div>` +
      `<div class="osAct"><button data-go="${i}">ここへ歩く</button><button data-via="${i}">通る周回</button><button data-see="${i}">見る</button></div></div>`).join('') + '</div>';
  }
  return {k: 'near', mini: `📍${it.length}`, html: h};
}

// ---------- 🟧 あと少しのマス ----------
function osMeshRow(here) {
  if (typeof meshInfo === 'undefined' || !meshInfo || !meshInfo.size || !here) { OS.mesh = null; return null; }
  let k = 0, best = null;
  meshInfo.forEach((m, key) => {
    if (meshDone[key] || !m.W || meshRest(m) > NEAR_M) return;
    const b = meshBB(key), c = [(b.w + b.e) / 2, (b.s + b.n) / 2], d = distM(here, c);
    if (d > OS_MESH_R) return;
    k++; if (!best || d < best.d) best = {d, c, rest: meshRest(m), m, key};
  });
  if (!k) { OS.mesh = null; return null; }
  OS.mesh = {p: meshVia(best.m, best.key)}; // 経由する点：まだ歩いていない道のうち、いちばん長い線のまん中（poi.js）
  return {k: 'mesh', mini: `🟧${k}`, html: `<div class="osRow osRowB"><span class="ic">🟧</span><span class="tx"><b>あと少しで完全制覇のマス ${k}個</b><br><span class="sub">いちばん近いのは ${osDir(here, best.c)} ${fmtDist(best.d)}・残りの道 ${fmtDist(best.rest)}</span></span><button class="osSm" id="osMeshVia">通る周回</button></div>`};
}

// ---------- 一言 ----------
function osNudge() {
  const days = typeof nkDays === 'function' ? nkDays() : new Map(), today = ymd(Date.now());
  const a = typeof sumTkAt === 'function' ? sumTkAt() : null, td = days.get(today);
  let n = 0; const t = new Date(); t.setDate(t.getDate() - 1);
  for (; days.has(ymd(t)); t.setDate(t.getDate() - 1)) n++;
  if (a && a.rem <= 3 && !td) return `🏯 東海道：次の${esc(a.next)}まで あと ${a.rem.toFixed(1)}km。今日の散歩で着けそうです`;
  if (td) return `👣 今日はもう ${fmtDist(td.dist)} 歩いています${n ? `（${n + 1}日続けて）` : ''}`;
  if (n >= 1) return `🔥 昨日まで ${n}日続けて歩いています。今日歩けば ${n + 1}日目`;
  if (a) return `🏯 東海道：次の${esc(a.next)}まで あと ${a.rem.toFixed(1)}km`;
  let tm = 0; const y = new Date().getFullYear(), m = new Date().getMonth();
  days.forEach((e, k) => { const d = new Date(k + 'T12:00:00'); if (d.getFullYear() === y && d.getMonth() === m) tm += e.dist; });
  return tm ? `📈 今月 ${fmtDist(tm)} 歩いています` : '';
}

// ---------- 画面 ----------
function osOpenApp(id, spot) {
  if (IN_APP && typeof ovOpen === 'function' && typeof OV !== 'undefined' && OV[id]) { ovOpen(id); if (id === 'megu' && spot && typeof meguShowSpot === 'function') meguShowSpot(spot); return; }
  try { window.open(new URL('../' + id + '/', location.href).href, '_blank'); } catch (e) {}
}
function osBusy() { if (walk) { status('歩いている途中は使えません'); return true; } return false; }
function osGo(p, name) {
  if (osBusy()) return;
  if (typeof rmSet === 'function') rmSet('to');
  destName = name || ''; setDest(p);
  status(`「${name}」へのルートを作ります`);
}
// 版33：その場所を通る、距離（km）の指定に合わせた周回（app.js の loopPick。遠いときは距離を延ばす）
function osVia(p, name, ic, kind) {
  if (osBusy()) return;
  if (typeof rmSet === 'function') rmSet('loop');
  dest = null; clearVia(); loopStart = null; if (typeof clearTrip === 'function') clearTrip();
  if (destMarker) { destMarker.remove(); destMarker = null; }
  $('favAdd').disabled = true; $('recalcBtn').disabled = false;
  loopPick = {p, name, ic: ic || '', kind: kind || 'megu'};
  status(`「${name}」を通る周回コースを作ります`);
  calc('loop');
}
function osRender() {
  const box = $('osCard'); if (!box) return;
  const here = osHere();
  const rows = [osWxRow(here), osIssRow(here), osNearRow(here), osMeshRow(here)].filter(Boolean);
  const nudge = osNudge();
  const mini = rows.map(r => r.mini).filter(Boolean).join(' ');
  const html = `<button id="osHead" type="button"><span class="osT">☀ 今日のおすすめ</span><span class="sub">${osDay()}</span>` +
    `<span class="osMini">${OS.open ? '' : esc(mini)}</span><i class="osArr">${OS.open ? '▴' : '▾'}</i></button>` +
    (OS.open ? `<div id="osBody">${rows.map(r => r.html).join('')}${nudge ? `<div class="osN">${nudge}</div>` : ''}</div>` : '');
  if (html === OS.last) return;
  OS.last = html; box.innerHTML = html;
}
function osTick(force) {
  const here = osHere(), now = Date.now();
  if (walk) return; // 歩いている間は読み直さない（電池のため）
  const moved = here && OS.ap && distM(here, OS.ap) > 500;
  if (force || moved || now - OS.at > 30 * 60000) { OS.at = now; OS.ap = here ? here.slice() : null; osNearLoad(true); }
  osRender();
}
(() => {
  const st = document.createElement('style');
  st.textContent = '#osCard{display:none;margin:0 0 8px;border:1.5px solid #9fd8b4;border-radius:14px;background:#f2fbf5;overflow:hidden}body:not(.has-route):not(.walking) #osCard{display:block}' +
    '#panel #osHead{display:flex;align-items:center;gap:6px;width:100%;margin:0;min-height:38px;padding:4px 12px;border:0;border-radius:0;background:transparent;text-align:left;font-size:15px;color:#1d2b22}#osHead .osT{font-weight:bold}#osHead .osMini{margin-left:auto;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#osCard .osArr{font-style:normal;color:#1e7e34;margin-left:auto;padding-left:6px}#osHead .osMini + .osArr{margin-left:4px}#osCard .sub{font-size:12px;color:#5b6b61;margin-left:4px}' +
    '#osBody{padding:0 8px 6px}#panel #osCard .osRow{display:flex;align-items:flex-start;gap:8px;width:100%;margin:0;min-height:40px;padding:5px 6px;border:0;border-top:1px solid #d7ece0;border-radius:0;background:transparent;text-align:left;font-size:14px;line-height:1.4;color:#1d2b22}' +
    '#osCard .osRow .ic{font-size:18px;line-height:1.3;width:22px;text-align:center;flex:none}#osCard .osRow .tx{flex:1;min-width:0}#osCard .osRow .sub{margin-left:0}' +
    '#osCard .osLv{display:inline-block;margin:2px 6px 0 0;padding:1px 7px;border-radius:9px;font-size:13px;background:#e9efe9}#osCard .osLv.lv3{background:#cdeed7;color:#14632b;font-weight:bold}#osCard .osLv.lv2{background:#e1f3e6;color:#1e7e34}#osCard .osLv.lv1{background:#f5ecd6;color:#8a6d1f}#osCard .osLv.lv0{background:#eee;color:#888}#osCard .osLv.past{opacity:.45}' +
    '#osCard .osHot{color:#c0392b}#osCard .osList{padding:0 0 4px 30px}#osCard .osIt{padding:6px 0;border-top:1px dashed #d7ece0}#osCard .osItT{font-size:14px;line-height:1.45}#osCard .osItT .sub{display:block;margin-left:0}' +
    '#panel #osCard .osAct{display:flex;gap:6px;margin-top:4px}#panel #osCard .osAct button,#panel #osCard .osSm{margin:0;min-height:32px;padding:2px 10px;font-size:13px;border-radius:16px;border:1px solid #2fbf71;background:#fff;color:#1e7e34;flex:none}' +
    '#osCard .osN{margin:4px 0 2px;padding:5px 8px;border-radius:10px;background:#fff6d6;font-size:13px;line-height:1.4}' +
    'body.dark #osCard{background:#1f2a25;border-color:#3d6b4f}body.dark #panel #osHead,body.dark #panel #osCard .osRow{color:#f1f5f2}body.dark #osCard .sub{color:#c9d3cd}body.dark #panel #osCard .osRow,body.dark #osCard .osIt{border-color:#33473d}' +
    'body.dark #osCard .osLv{background:#2c3832;color:#c9d3cd}body.dark #osCard .osLv.lv3{background:#245c37;color:#d6f5df}body.dark #osCard .osLv.lv2{background:#22432f;color:#bfe8cb}body.dark #osCard .osLv.lv1{background:#4a4220;color:#ffe2a0}' +
    'body.dark #panel #osCard .osAct button,body.dark #panel #osCard .osSm{background:#22302a;color:#a8e0b4;border-color:#3aa85a}body.dark #osCard .osN{background:#4a4220}body.dark #osCard .osArr{color:#a8e0b4}';
  document.head.appendChild(st);
  const om = $('omBtn'); if (!om) return;
  const box = document.createElement('div'); box.id = 'osCard'; om.parentNode.insertBefore(box, om);
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'osHead') { OS.open = !OS.open; lsSet('walk_os_open', OS.open ? '1' : '0'); osRender(); return; }
    if (b.id === 'osNearBtn') { OS.nearOpen = !OS.nearOpen; osRender(); return; }
    if (b.id === 'osMeshVia') { if (OS.mesh) osVia(OS.mesh.p, 'あと少しのマス', '🟧', 'mesh'); return; }
    if (b.dataset.os) { osOpenApp(b.dataset.os); return; }
    const it = OS.items || [], i = Number(b.dataset.go ?? b.dataset.via ?? b.dataset.see), x = it[i];
    if (!x) return;
    if (b.dataset.go != null) osGo(x.p, x.n);
    else if (b.dataset.via != null) osVia(x.p, x.n, x.ic, 'megu');
    else osOpenApp('megu', x.k === 'spot' ? x.id : null);
  });
  window.addEventListener('storage', e => { if (e.key && /^(sora_iss_v1|yama_fav_v1|yama_wx_v1)$/.test(e.key)) osRender(); });
  setTimeout(() => osTick(true), 2500);
  setInterval(() => osTick(false), 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') osTick(false); });
})();
