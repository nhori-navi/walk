// nikki.js：版26 散歩日記（matome.js のあとに読み込む）
// 記録タブの「今日の合計」の欄を「📅 散歩日記」に。月のカレンダー（歩いた日と距離）・週ごとの棒（直近8週）・選んだ日のまとめ
// ・距離と時間は歩いた記録（tracks、乗り物の区間は除く）から。版25 からの散歩は、まとめ（IndexedDB michimiru／kv の 'walks'）も出す
// ・ほかのアプリのその日：MeguMiru（はじめて行った場所。megu／kv の log）、TenMiru（見た機体・キャッチ。sora_day_v1）、YamaMiru（はじめて見つけた山。yama_zukan_v1）
const NK = {month: null, sel: null, walks: null, megu: null, at: 0, busy: false};
const NK_WD = ['日', '月', '火', '水', '木', '金', '土'];
const nkDay = t => ymd(t);
// 日ごとの合計（歩いた記録から。日付をまたいだ記録は始めた日に入れる）
function nkDays() {
  const m = new Map();
  (typeof playCleaned !== 'undefined' ? playCleaned : []).forEach(({t, c}) => {
    if (!t || t.k === 'veh' || !c) return;
    const d = nkDay(t.t0), e = m.get(d) || {dist: 0, sec: 0, n: 0, list: []};
    const end = walk && t === walk.track ? Date.now() : t.t1;
    e.dist += c.dist; e.sec += end > t.t0 ? (end - t.t0) / 1000 : c.rawDist / (SPEED / 60); e.n++; e.list.push({t, c});
    m.set(d, e);
  });
  return m;
}
// ほかのアプリの記録（重いものは1分に1回だけ読み直す）
async function nkLoad(force) {
  if (NK.busy || (!force && Date.now() - NK.at < 60000 && NK.walks)) return;
  NK.busy = true;
  try {
    NK.walks = typeof sumLoad === 'function' ? await sumLoad() : [];
    NK.megu = new Map();
    let LOGm = null, RECm = null;
    try { const f = typeof ovFrames !== 'undefined' && ovFrames.megu; if (f && f.contentWindow) { LOGm = f.contentWindow.eval('typeof LOG !== "undefined" ? LOG : null'); RECm = f.contentWindow.eval('typeof REC !== "undefined" ? REC : null'); } } catch (e) {}
    if (!LOGm && typeof meguDb === 'function') { const db = await meguDb(false); if (db) { LOGm = await kvGet(db, 'log'); RECm = await kvGet(db, 'rec'); db.close(); } }
    (LOGm || []).forEach(e => {
      if (!e || e.k !== 'new') return;
      const d = nkDay(e.t), r = RECm && RECm[e.id], s = r && r.s;
      const a = NK.megu.get(d) || []; a.push({n: s && s.n ? s.n : '', sh: s && s.sh || '', t: e.t}); NK.megu.set(d, a);
    });
    NK.at = Date.now();
  } catch (e) {} finally { NK.busy = false; }
}
function nkSora(d) { try { const D = (JSON.parse(localStorage.getItem('sora_day_v1') || '{}').days || {})[d]; return D ? {n: D.n || 0, cat: D.catN || 0} : null; } catch (e) { return null; } }
function nkYama(d) {
  try { return Object.values((JSON.parse(localStorage.getItem('yama_zukan_v1') || '{}').peaks) || {}).filter(e => e && e.t1 && nkDay(e.t1) === d).map(e => e.n); } catch (e) { return []; }
}
// ---------- 描く ----------
function nkCal(days) {
  const [y, mo] = NK.month, first = new Date(y, mo, 1), last = new Date(y, mo + 1, 0).getDate(), today = nkDay(Date.now());
  let tot = 0, nd = 0, max = 0;
  for (let i = 1; i <= last; i++) { const e = days.get(nkDay(new Date(y, mo, i))); if (e) { tot += e.dist; nd++; max = Math.max(max, e.dist); } }
  let h = `<div class="nkHd"><button id="nkPrev" type="button">◀</button><b>${y}年${mo + 1}月</b><button id="nkNext" type="button"${y * 12 + mo >= new Date().getFullYear() * 12 + new Date().getMonth() ? ' disabled' : ''}>▶</button></div>` +
    `<div class="nkSum">歩いた日 <b>${nd}日</b>・合わせて <b>${fmtDist(tot)}</b></div><div class="nkCal">` + NK_WD.map(w => `<div class="wd">${w}</div>`).join('');
  for (let i = 0; i < first.getDay(); i++) h += '<div></div>';
  for (let i = 1; i <= last; i++) {
    const d = nkDay(new Date(y, mo, i)), e = days.get(d), lv = e ? Math.min(4, 1 + Math.floor(e.dist / Math.max(max, 1) * 3.99)) : 0;
    const other = !e && ((NK.megu && NK.megu.get(d)) || nkSora(d) || nkYama(d).length);
    h += `<button type="button" class="nkD lv${lv}${d === today ? ' td' : ''}${d === NK.sel ? ' sel' : ''}" data-d="${d}"${d > today ? ' disabled' : ''}><span>${i}</span>${e ? `<small>${(e.dist / 1000).toFixed(1)}</small>` : other ? '<small>・</small>' : ''}</button>`;
  }
  return h + '</div>';
}
function nkWeeks(days) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const sun = new Date(now); sun.setDate(now.getDate() - now.getDay());
  const ws = [];
  for (let k = 7; k >= 0; k--) {
    const a = new Date(sun); a.setDate(sun.getDate() - k * 7); let s = 0;
    for (let i = 0; i < 7; i++) { const d = new Date(a); d.setDate(a.getDate() + i); const e = days.get(nkDay(d)); if (e) s += e.dist; }
    ws.push({a, s});
  }
  const max = Math.max(1, ...ws.map(w => w.s));
  return '<div class="nkWk"><div class="nkT">週ごとの距離（日曜はじまり）</div>' + ws.map((w, i) =>
    `<div class="nkW${i === ws.length - 1 ? ' cur' : ''}"><span class="l">${w.a.getMonth() + 1}/${w.a.getDate()}〜</span><span class="b"><i style="width:${(w.s / max * 100).toFixed(1)}%"></i></span><span class="v">${w.s ? fmtDist(w.s) : '—'}</span></div>`).join('') + '</div>';
}
function nkDayHtml(d, days) {
  const e = days.get(d), dt = new Date(d + 'T12:00:00');
  let h = `<div class="nkDay"><div class="nkT">${dt.getMonth() + 1}月${dt.getDate()}日（${NK_WD[dt.getDay()]}）</div>`;
  h += e ? `<div class="nkBig">${fmtDist(e.dist)}・${fmtTime(e.sec)}<small>（${e.n}回）</small></div>` : '<div class="sub">この日は歩いた記録がありません</div>';
  const ws = (NK.walks || []).filter(w => nkDay(w.t0) === d);
  (e ? e.list.slice().sort((a, b) => a.t.t0 - b.t.t0) : []).forEach(({t, c}) => {
    let w = ws.find(x => x.t0 === t.t0);
    // あとから MeguMiru が記録を読んだ分も入れる（まとめのときは MeguMiru が動いていなかった散歩）
    if (w && !(w.megu && w.megu.length) && NK.megu) w = Object.assign({}, w, {megu: (NK.megu.get(d) || []).filter(m => m.t >= w.t0 && m.t <= w.t1 + 60000).map(m => Object.assign({k: 'new'}, m))});
    const t1 = (walk && t === walk.track) ? Date.now() : t.t1;
    h += `<div class="nkWalk"><div class="nkWt">${hm(new Date(t.t0))}${t1 ? '〜' + hm(new Date(t1)) : ''}　<b>${fmtDist(c.dist)}</b>${walk && t === walk.track ? '（歩いています）' : ''}` +
      `<button type="button" class="nkMap" data-t0="${t.t0}">🗺</button></div>` + (w && typeof sumLines === 'function' ? `<ul class="sumL">${sumLines(w).map(x => `<li>${x}</li>`).join('')}</ul>` : '') + '</div>';
  });
  // ほかのアプリのこの日
  const L = [], mg = NK.megu && NK.megu.get(d), so = nkSora(d), ym = nkYama(d);
  if (mg && mg.length) L.push(`🗾 MeguMiru：はじめて <b>${mg.length}</b>（${esc(sumName(mg, m => (MEGU_IC[m.sh] || '') + m.n))}）`);
  if (so && (so.n || so.cat)) L.push(`✈️ TenMiru：見た機体 <b>${so.n}</b>${so.cat ? `・キャッチ <b>${so.cat}</b>` : ''}`);
  if (ym.length) L.push(`🏔 YamaMiru：はじめて見つけた山 <b>${ym.length}</b>（${esc(sumName(ym, n => n))}）`);
  if (L.length) h += `<div class="nkT" style="margin-top:8px">この日のほかのアプリ</div><ul class="sumL">${L.map(x => `<li>${x}</li>`).join('')}</ul>`;
  return h + '</div>';
}
function nkRender() {
  const box = $('nikki'); if (!box) return;
  if (!NK.month) { const n = new Date(); NK.month = [n.getFullYear(), n.getMonth()]; }
  if (!NK.sel) NK.sel = nkDay(Date.now());
  const days = nkDays();
  box.innerHTML = nkCal(days) + nkDayHtml(NK.sel, days) + nkWeeks(days);
  $('nkPrev').onclick = () => { const [y, m] = NK.month; NK.month = m ? [y, m - 1] : [y - 1, 11]; nkRender(); };
  $('nkNext').onclick = () => { const [y, m] = NK.month; NK.month = m === 11 ? [y + 1, 0] : [y, m + 1]; nkRender(); };
  box.querySelectorAll('.nkD').forEach(b => b.onclick = () => { NK.sel = b.dataset.d; nkRender(); const el = box.querySelector('.nkDay'); if (el) el.scrollIntoView({block: 'nearest'}); });
  box.querySelectorAll('.nkMap').forEach(b => b.onclick = () => nkMap(Number(b.dataset.t0)));
}
// 🗺：その散歩を地図に（まとめがあれば印も）
function nkMap(t0) {
  const w = (NK.walks || []).find(x => x.t0 === t0), t = tracks.find(x => x.t0 === t0 && x.k !== 'veh');
  let o = w;
  if (!o && t) { let w0 = 180, s = 90, e = -180, n = -90; t.pts.forEach(p => { w0 = Math.min(w0, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]); }); o = {bb: [[w0, s], [e, n]]}; }
  if (!o) return;
  if (typeof sumMarks === 'function') sumMarks(o);
  if (typeof sumFit === 'function') sumFit(o);
  status(`${hm(new Date(t0))} からの散歩を地図に出しました`);
}
async function nkRefresh(force) { await nkLoad(force); nkRender(); }
// 「今日の合計」の欄を散歩日記にする（#today は今まで通り今日の合計の1行）
(() => {
  const h = $('todayHead'); if (!h) return;
  h.firstChild && h.firstChild.nodeType === 3 ? (h.firstChild.textContent = '📅 散歩日記') : (h.textContent = '📅 散歩日記');
  const box = document.createElement('div'); box.id = 'nikki';
  h.closest('.card').appendChild(box);
  const st = document.createElement('style');
  st.textContent = '.nkHd{display:flex;align-items:center;justify-content:space-between;margin:8px 0 4px}.nkHd button{min-width:44px;height:36px;margin:0;padding:0}.nkHd b{font-size:17px}' +
    '.nkSum{font-size:13px;color:#5b6b61;margin-bottom:4px}.nkCal{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}.nkCal .wd{text-align:center;font-size:12px;color:#5b6b61}' +
    '#nikki .nkD{margin:0;padding:3px 0;min-height:44px;border-radius:8px;border:1px solid #e3e8e5;background:#fff;box-shadow:none;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:13px;color:#1d2b22}' +
    '.nkD small{font-size:11px;line-height:1.1}#nikki .nkD.lv1{background:#e2f5e9!important}#nikki .nkD.lv2{background:#b9e6c9!important}#nikki .nkD.lv3{background:#7fd1a0!important}#nikki .nkD.lv4{background:#2fbf71!important;color:#fff}' +
    '#nikki .nkD.td{border:2px solid #1e7e34}#nikki .nkD.sel{outline:3px solid #ffd23f;outline-offset:-1px}#nikki .nkD:disabled{opacity:.35}' +
    '.nkT{font-size:13px;font-weight:bold;color:#1e7e34;margin:10px 0 4px}.nkBig{font-size:20px;font-weight:bold}.nkBig small{font-size:12px;font-weight:normal;color:#5b6b61;margin-left:4px}' +
    '.nkDay{margin-top:6px;border-top:1px solid #e3e8e5}.nkWalk{margin-top:6px;padding:6px 8px;border-radius:10px;background:#f4f8f5}.nkWt{display:flex;align-items:center;gap:6px;font-size:14px}' +
    '.nkWt .nkMap{margin:0 0 0 auto;min-width:40px;height:34px;padding:0}' +
    '.nkWk{margin-top:6px;border-top:1px solid #e3e8e5}.nkW{display:flex;align-items:center;gap:6px;font-size:12px;margin:3px 0}.nkW .l{width:52px;color:#5b6b61}.nkW .b{flex:1;height:12px;background:#eef2ef;border-radius:6px;overflow:hidden}' +
    '.nkW .b i{display:block;height:100%;background:#7fd1a0}.nkW.cur .b i{background:#2fbf71}.nkW .v{width:52px;text-align:right}' +
    'body.dark #nikki .nkD{background:#28322e;border-color:#3d4a44;color:#f1f5f2}body.dark #nikki .nkD.lv1{background:#2c4a39!important}body.dark #nikki .nkD.lv2{background:#2f6a47!important}body.dark #nikki .nkD.lv3{background:#2f8a55!important}body.dark #nikki .nkD.lv4{background:#2fbf71!important;color:#08200f}' +
    'body.dark .nkSum,body.dark .nkCal .wd,body.dark .nkW .l,body.dark .nkBig small{color:#c9d3cd}body.dark .nkT{color:#a8e0b4}body.dark .nkWalk{background:#22302a}body.dark .nkW .b{background:#34403b}body.dark #nikki .nkDay,body.dark .nkWk{border-color:#3d4a44}';
  document.head.appendChild(st);
  // 今日の合計が更新されたら日記も（記録タブを開いているときだけ描く）
  const base = updToday;
  updToday = function () { base.apply(this, arguments); if (typeof curTab === 'function' && curTab() === 'rec') nkRender(); };
  const sb = window.showTab;
  if (typeof sb === 'function') window.showTab = showTab = function (k) { sb(k); if (k === 'rec') nkRefresh(); };
  document.querySelectorAll('.tb[data-tab="rec"]').forEach(b => b.addEventListener('click', () => nkRefresh()));
  nkRefresh();
})();
