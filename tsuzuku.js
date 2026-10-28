// tsuzuku.js：版34 続けたくなる仕掛け（osusume.js のあとに読み込む）
// ① 出かけた日：その日に4つのアプリのどれかを使った日（🚶500m 以上歩いた・🗾 MeguMiru で場所を記録・✈️ TenMiru で空を見た・🏔 YamaMiru で山を見つけた／見えたを記録）
//    それぞれのアプリの記録から拾い、MichiMiru の控え walk_days_v1 {日付: 'wmty' の文字} に書き足して消さずに残す（TenMiru の日ごとの記録は30日で消え、YamaMiru は最後に見た日しか残らないため）
//    散歩日記のいちばん上に連続日数、カレンダーの日付の下にアプリの色の点
// ② 週の目標（距離。日曜はじまり）：walk_wgoal（km、初めは15）。散歩日記の週の棒に目標の線と ✅、今週の残り・達成の連続
// ③ Miru バッジ（4つのアプリにまたがる）：walk_badges_v1 {id: [段階ごとの取った時刻]}。取ったら散歩のまとめの一言とスマホの通知（アプリ版）
//    はじめて数えたときに、もう届いていた分は黙って付ける（知らせない）
const TZ = {days: {}, at: 0, busy: false, best: 0, streak: 0, todayOn: false, got: null, newMsg: '', newAt: 0, walks: [], mgDays: null, shelfOpen: false};
const TZ_APPS = [['w', '#2fbf71', '🚶 歩いた'], ['m', '#7a5c8e', '🗾 MeguMiru'], ['t', '#1f6fd1', '✈️ TenMiru'], ['y', '#2e7d32', '🏔 YamaMiru']];
const TZ_GOALS = [5, 10, 15, 20, 30];
const tzLsj = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : (JSON.parse(v) ?? d); } catch (e) { return d; } };
const tzGoal = () => { const g = Number(getLS('walk_wgoal')); return TZ_GOALS.includes(g) ? g : 15; };
const tzAddDay = (d, f) => { if (!d) return; const s = TZ.days[d] || ''; if (!s.includes(f)) TZ.days[d] = s + f; };
const tzSunday = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d; };

// ---------- ① 出かけた日 ----------
async function tzLoad(force) {
  if (TZ.busy || (!force && Date.now() - TZ.at < 120000)) return;
  TZ.busy = true;
  try {
    TZ.days = Object.assign({}, tzLsj('walk_days_v1', {}));
    // 🚶 歩いた（500m 以上の日）
    if (typeof nkDays === 'function') nkDays().forEach((e, d) => { if (e.dist >= 500) tzAddDay(d, 'w'); });
    // 🗾 MeguMiru：記録（はじめて・段階が上がった）のあった日
    if (typeof meguDb === 'function') {
      const db = await meguDb(false);
      if (db) { try { ((await kvGet(db, 'log')) || []).forEach(e => { if (e && e.t) tzAddDay(ymd(e.t), 'm'); }); } finally { db.close(); } }
    }
    // ✈️ TenMiru：空を見た日（30日分の日ごとの記録と、バッジ用に残している通算の日）
    const sd = (tzLsj('sora_day_v1', {}) || {}).days || {};
    Object.keys(sd).forEach(d => { if (sd[d] && sd[d].n) tzAddDay(d, 't'); });
    Object.keys(((tzLsj('sora_badge_v1', {}) || {}).days) || {}).forEach(d => tzAddDay(d, 't'));
    // 🏔 YamaMiru：はじめて見つけた日・最後に見た日、見えた／見えなかったの記録
    Object.values(((tzLsj('yama_zukan_v1', {}) || {}).peaks) || {}).forEach(e => { if (e && e.t1) tzAddDay(ymd(e.t1), 'y'); if (e && e.t2) tzAddDay(ymd(e.t2), 'y'); });
    Object.values(tzLsj('yama_seen_v1', {}) || {}).forEach(r => Object.keys((r && r.d) || {}).forEach(d => tzAddDay(d, 'y')));
    lsSet('walk_days_v1', JSON.stringify(TZ.days));
    TZ.walks = typeof sumLoad === 'function' ? await sumLoad() : [];
    tzStreak();
    TZ.at = Date.now();
  } catch (e) {} finally { TZ.busy = false; }
}
function tzStreak() {
  const has = d => !!TZ.days[d], today = ymd(Date.now());
  TZ.todayOn = has(today);
  let n = 0; const t = new Date(); if (!TZ.todayOn) t.setDate(t.getDate() - 1);
  for (; has(ymd(t)); t.setDate(t.getDate() - 1)) n++;
  TZ.streak = n;
  let best = 0, run = 0, prev = null;
  Object.keys(TZ.days).filter(has).sort().forEach(d => {
    const t0 = new Date(d + 'T12:00:00').getTime();
    run = prev !== null && Math.round((t0 - prev) / 864e5) === 1 ? run + 1 : 1; prev = t0; best = Math.max(best, run);
  });
  TZ.best = best;
}
function tzStreakHtml() {
  const s = TZ.streak;
  let t = s ? (TZ.todayOn ? `🔥 出かけた日 <b>${s}日連続</b>` : `🔥 昨日まで <b>${s}日連続</b>。今日も出かけると ${s + 1}日目`) : '🔥 今日出かけると、連続の1日目';
  if (TZ.best > 1) t += `<span class="sub">（いちばん長い記録 ${TZ.best}日）</span>`;
  return `<div class="tzSt">${t}</div>`;
}
// カレンダーの日付の下の点（その日に使ったアプリの色）
function tzDots(d) {
  const s = TZ.days[d] || ''; if (!s) return '';
  return '<i class="tzDots">' + TZ_APPS.filter(([f]) => s.includes(f)).map(([, c]) => `<b style="background:${c}"></b>`).join('') + '</i>';
}

// ---------- ② 週の目標 ----------
function tzWeeks(days) {
  const m = new Map();
  (days || (typeof nkDays === 'function' ? nkDays() : new Map())).forEach((e, d) => { const k = ymd(tzSunday(new Date(d + 'T12:00:00'))); m.set(k, (m.get(k) || 0) + e.dist); });
  return m;
}
function tzWeekInfo(days) {
  const W = tzWeeks(days), goal = tzGoal() * 1000, cur = ymd(tzSunday(Date.now())), now = W.get(cur) || 0;
  let run = 0; const t = tzSunday(Date.now());
  if (now >= goal) run = 1;
  t.setDate(t.getDate() - 7);
  for (; (W.get(ymd(t)) || 0) >= goal; t.setDate(t.getDate() - 7)) run++;
  const left = Math.max(0, 6 - new Date().getDay()); // 今日を除いた今週の残りの日数
  return {goal, now, rest: Math.max(0, goal - now), ok: now >= goal, run, left, W};
}
function tzWeekHtml(days) {
  const w = tzWeekInfo(days);
  const sel = `<select id="tzGoal">${TZ_GOALS.map(g => `<option value="${g}"${g * 1000 === w.goal ? ' selected' : ''}>${g}km</option>`).join('')}</select>`;
  return `<div class="tzWk">📏 今週 <b>${fmtDist(w.now)}</b>／目標 ${sel}` + (w.ok ? '　✅ <b>達成</b>' : `　あと <b>${fmtDist(w.rest)}</b>`) +
    (w.run >= 2 ? `<span class="sub">（目標達成 ${w.run}週連続）</span>` : '') + '</div>';
}

// ---------- ③ Miru バッジ ----------
// [id, 印, 名前, 段階, 値, 単位, 説明]
const TZ_MEDAL = ['銅', '銀', '金', '白金'];
function tzMonthBest() { const m = {}; Object.keys(TZ.days).forEach(d => { if (TZ.days[d]) m[d.slice(0, 7)] = (m[d.slice(0, 7)] || 0) + 1; }); return Object.values(m).filter(n => n >= 20).length; }
function tzWeekRunBest() {
  const W = tzWeeks(), goal = tzGoal() * 1000; let best = 0, run = 0, prev = null;
  [...W.keys()].sort().forEach(k => { if (W.get(k) < goal) { run = 0; prev = null; return; } const t = new Date(k + 'T12:00:00').getTime(); run = prev && Math.round((t - prev) / 864e5) === 7 ? run + 1 : 1; prev = t; best = Math.max(best, run); });
  return best;
}
function tzTkStations() { if (typeof tkWhere !== 'function' || typeof tkKm !== 'number') return 0; const w = tkWhere(tkKm); return w.lap * (TOKAIDO.length - 1) + w.i; }
const tzHourCount = f => tracks.filter(t => t.k !== 'veh' && t.t0 && t.pts && t.pts.length > 10 && f(new Date(t.t0).getHours())).length;
const TZ_BADGES = [
  ['all4', '🌈', '4つそろい', [1, 5, 20], () => Object.values(TZ.days).filter(s => s.length >= 4).length, '日', '1日で4つのアプリを全部使う'],
  ['streak', '🔥', '続ける', [7, 30, 100], () => TZ.best, '日', '出かけた日が続く（いちばん長い記録）'],
  ['wgoal', '📏', '週の目標', [2, 4, 12], () => tzWeekRunBest(), '週', '週の目標の距離を続けて達成'],
  ['yori', '🗾', '寄り道上手', [1, 10, 30], () => TZ.walks.reduce((a, w) => a + (w.megu || []).filter(m => m.k === 'new').length, 0), 'か所', '散歩の途中で MeguMiru のまだの場所に着く'],
  ['mesh', '🟧', 'マスの仕上げ', [10, 50, 100], () => Object.keys(typeof meshDone !== 'undefined' ? meshDone : {}).length, 'マス', '完全制覇したマス'],
  ['yamasora', '🗻', '山と空', [1, 5], () => TZ.walks.filter(w => (w.yama || []).length && (w.ten || []).some(e => e.k === 'over')).length, '回', '同じ散歩で山を見つけて、真上を通る飛行機にも会う'],
  ['asa', '🌅', '朝の散歩', [10, 50], () => tzHourCount(h => h >= 5 && h < 7), '回', '5〜7時に歩き始める'],
  ['yoru', '🌙', '夜の散歩', [10, 50], () => tzHourCount(h => h >= 19 || h < 3), '回', '19時より後に歩き始める'],
  ['tokaido', '🏯', '東海道', [10, 30, 55, 110], () => tzTkStations(), '宿', '東海道の宿場（55で京都、110で2周目の京都）'],
  ['kaikin', '📅', '皆勤の月', [1, 3, 12], () => tzMonthBest(), '月', 'ひと月に20日以上出かける']];
function tzLevel(b, v) { let lv = 0; b[3].forEach((x, i) => { if (v >= x) lv = i + 1; }); return lv; }
function tzCheck(quiet) {
  const first = getLS('walk_badges_v1') === null;
  const got = tzLsj('walk_badges_v1', {}) || {}, now = Date.now(), neu = [];
  TZ_BADGES.forEach(b => {
    let v = 0; try { v = b[4]() || 0; } catch (e) {}
    const lv = tzLevel(b, v), have = (got[b[0]] || []).length;
    if (lv > have) { got[b[0]] = (got[b[0]] || []).concat(Array(lv - have).fill(now)); neu.push([b, lv]); }
  });
  TZ.got = got;
  if (!neu.length) return [];
  lsSet('walk_badges_v1', JSON.stringify(got));
  if (first || quiet) return []; // はじめて数えたとき（今までの分）は知らせない
  const name = ([b, lv]) => b[1] + b[2] + (b[3].length > 1 ? `（${TZ_MEDAL[lv - 1] || lv}）` : '');
  TZ.newMsg = `🏅 Miru バッジ「${esc(neu.map(name).join('」「'))}」を取りました`; TZ.newAt = now;
  if (typeof NT !== 'undefined' && NT.ok && typeof ntNow === 'function') ntNow('🏅 Miru バッジを取りました', neu.map(name).join('・'), {}, 'walk');
  else if (typeof notify === 'function') notify(TZ.newMsg.replace(/<[^>]+>/g, ''));
  return neu;
}
function tzShelfHtml() {
  const got = TZ.got || tzLsj('walk_badges_v1', {}) || {};
  const n = TZ_BADGES.reduce((a, b) => a + ((got[b[0]] || []).length ? 1 : 0), 0);
  let h = `<div class="tzSh"><button type="button" id="tzShBtn" class="tzShH">🏅 Miru バッジ <b>${n}</b>／${TZ_BADGES.length}<i>${TZ.shelfOpen ? '▴' : '▾'}</i></button>`;
  if (TZ.shelfOpen) {
    h += '<div class="tzGrid">' + TZ_BADGES.map(b => {
      let v = 0; try { v = b[4]() || 0; } catch (e) {}
      const t = got[b[0]] || [], lv = t.length, nx = b[3][lv];
      const md = lv ? (b[3].length > 1 ? TZ_MEDAL[lv - 1] : '') : '';
      return `<div class="tzB${lv ? ' on' : ''}"><div class="ic">${b[1]}</div><div class="tx"><b>${b[2]}</b>${md ? `<span class="md m${lv}">${md}</span>` : ''}<br>` +
        `<span class="sub">${esc(b[6])}</span><br><span class="sub">${lv ? `${ymd(t[lv - 1]).replace(/-/g, '/')} に取った` : 'まだ'}${nx != null ? `・次は ${nx}${b[5]}（いま ${Math.floor(v)}）` : '・全部取りました'}</span></div></div>`;
    }).join('') + '</div>';
  }
  return h + '</div>';
}

// ---------- 散歩日記・一言につなぐ ----------
(() => {
  const st = document.createElement('style');
  st.textContent = '.tzSt{margin:8px 0 2px;padding:6px 10px;border-radius:10px;background:#fff1e0;font-size:14px}.tzSt .sub{font-size:12px;color:#7a6650;margin-left:4px}' +
    '.tzDots{display:flex;gap:2px;justify-content:center;height:5px;margin-top:1px;font-style:normal}.tzDots b{display:block;width:5px;height:5px;border-radius:3px}' +
    '.tzWk{font-size:13px;margin:4px 0}.tzWk select{margin:0 2px;min-height:30px;padding:0 4px;font-size:13px;width:auto}.tzWk .sub{font-size:12px;color:#5b6b61;margin-left:4px}' +
    '.nkW .b{position:relative}.nkW .b .gl{position:absolute;top:-2px;bottom:-2px;width:2px;background:#d35400;border-radius:1px}.nkW .ok{color:#1e7e34;font-weight:bold}' +
    '.tzSh{margin-top:8px;border-top:1px solid #e3e8e5}#nikki .tzShH{display:flex;align-items:center;gap:6px;width:100%;margin:6px 0 0;min-height:38px;padding:4px 8px;border:0;border-radius:10px;background:#f4f8f5;text-align:left;font-size:14px;color:#1d2b22}#nikki .tzShH i{margin-left:auto;font-style:normal;color:#1e7e34}' +
    '.tzGrid{display:flex;flex-direction:column;gap:4px;margin-top:6px}.tzB{display:flex;gap:8px;align-items:flex-start;padding:6px 8px;border-radius:10px;background:#f2f2f2;opacity:.6;font-size:13px;line-height:1.4}.tzB.on{background:#fff7e0;opacity:1}' +
    '.tzB .ic{font-size:22px;line-height:1.2;width:28px;text-align:center;filter:grayscale(1)}.tzB.on .ic{filter:none}.tzB .sub{font-size:12px;color:#5b6b61}' +
    '.tzB .md{margin-left:6px;padding:0 6px;border-radius:8px;font-size:11px;color:#fff;background:#b87333}.tzB .md.m2{background:#8f9aa3}.tzB .md.m3{background:#d4a017}.tzB .md.m4{background:#6c7fa8}' +
    'body.dark .tzSt{background:#4a3a20}body.dark .tzSt .sub{color:#e6cfa8}body.dark .tzWk .sub,body.dark .tzB .sub{color:#c9d3cd}body.dark #nikki .tzShH{background:#22302a;color:#f1f5f2}body.dark .tzB{background:#2a302d}body.dark .tzB.on{background:#3d3420}body.dark .tzSh{border-color:#3d4a44}';
  document.head.appendChild(st);
  // 散歩日記：上に連続日数、カレンダーに点、週の棒に目標、下にバッジの棚
  if (typeof nkRender === 'function') {
    const base = nkRender;
    nkRender = function () {
      base.apply(this, arguments);
      const box = $('nikki'); if (!box) return;
      box.insertAdjacentHTML('afterbegin', tzStreakHtml());
      box.querySelectorAll('.nkD').forEach(b => { const s = b.querySelector('small'); if (s && s.textContent === '・') s.remove(); b.insertAdjacentHTML('beforeend', tzDots(b.dataset.d)); });
      const wk = box.querySelector('.nkWk');
      if (wk) {
        const days = nkDays(), w = tzWeekInfo(days), bars = [...wk.querySelectorAll('.nkW')];
        wk.querySelector('.nkT').insertAdjacentHTML('afterend', tzWeekHtml(days));
        // 棒の長さを目標も入る目盛りに直して、目標の線と ✅
        const sun = tzSunday(Date.now());
        const shown = bars.map((el, i) => { const a = new Date(sun); a.setDate(sun.getDate() - (bars.length - 1 - i) * 7); return w.W.get(ymd(a)) || 0; });
        const max = Math.max(1, w.goal * 1.2, ...shown); // 目標の線が右の端にくっつかないように
        bars.forEach((el, i) => {
          const a = new Date(sun); a.setDate(sun.getDate() - (bars.length - 1 - i) * 7);
          const s = w.W.get(ymd(a)) || 0, bi = el.querySelector('.b i'), bb = el.querySelector('.b');
          if (bi) bi.style.width = (s / max * 100).toFixed(1) + '%';
          if (bb) bb.insertAdjacentHTML('beforeend', `<span class="gl" style="left:calc(${(w.goal / max * 100).toFixed(1)}% - 1px)"></span>`);
          if (s >= w.goal) { const v = el.querySelector('.v'); if (v) v.innerHTML = '<span class="ok">✅</span>' + v.textContent; }
        });
        const g = $('tzGoal'); if (g) g.onchange = () => { lsSet('walk_wgoal', g.value); TZ.at = 0; nkRender(); };
      }
      box.insertAdjacentHTML('beforeend', tzShelfHtml());
      const sb = $('tzShBtn'); if (sb) sb.onclick = () => { TZ.shelfOpen = !TZ.shelfOpen; nkRender(); };
    };
  }
  // 散歩のまとめの一言：取ったばかりのバッジ → 今週の目標を達成した・あと少し → 今まで通り
  if (typeof sumNudge === 'function') {
    const base = sumNudge;
    sumNudge = function (o) {
      if (TZ.newMsg && Date.now() - TZ.newAt < 600000) return TZ.newMsg;
      const w = tzWeekInfo();
      if (w.ok && w.now - (o.dist || 0) < w.goal) return `✅ 今週の目標 ${fmtDist(w.goal)} を達成しました${w.run >= 2 ? `（${w.run}週連続）` : ''}`;
      if (!w.ok && w.rest <= 3000) return `📏 今週の目標まで あと ${fmtDist(w.rest)}`;
      return base.apply(this, arguments);
    };
  }
  // 今日のおすすめの一言：今週の目標が近いとき・出かけた日が続いているとき
  if (typeof osNudge === 'function') {
    const base = osNudge;
    osNudge = function () {
      const w = tzWeekInfo();
      if (!w.ok && w.now > 0 && w.rest <= 5000) return `📏 今週の目標まで あと ${fmtDist(w.rest)}${w.left ? `（今週はあと${w.left + 1}日）` : '（今日まで）'}`;
      if (TZ.streak >= 2 && !TZ.todayOn) return `🔥 出かけた日 ${TZ.streak}日連続中。今日で ${TZ.streak + 1}日目になります`;
      return base.apply(this, arguments);
    };
  }
  // 散歩のまとめを保存したあとに数え直して、取ったバッジがあればカードの一言を入れ替える
  if (typeof sumSave === 'function') {
    const base = sumSave;
    sumSave = async function (o) {
      const r = await base.apply(this, arguments);
      try { await tzLoad(true); if (tzCheck().length && SUM.cur === o && $('sumCard') && $('sumCard').style.display !== 'none') { const op = $('sumCard').classList.contains('open'); sumShow(o); if (op) sumOpen(true); } } catch (e) {}
      return r;
    };
  }
  const run = async quiet => { await tzLoad(true); tzCheck(quiet); if (typeof curTab === 'function' && curTab() === 'rec' && typeof nkRender === 'function') nkRender(); };
  setTimeout(() => run(false), 4000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(false); });
})();
// 4つのアプリの控えを読み込んだとき：出かけた日とバッジは足し合わせる（hikae.js から）
function tzMergeLs(ls) {
  if (!ls) return;
  try {
    const d = JSON.parse(ls.walk_days_v1 || '{}'), cur = tzLsj('walk_days_v1', {});
    Object.keys(d).forEach(k => { [...(d[k] || '')].forEach(f => { if (!(cur[k] || '').includes(f)) cur[k] = (cur[k] || '') + f; }); });
    lsSet('walk_days_v1', JSON.stringify(cur));
  } catch (e) {}
  try {
    const b = JSON.parse(ls.walk_badges_v1 || '{}'), cur = tzLsj('walk_badges_v1', {});
    Object.keys(b).forEach(k => { if ((b[k] || []).length > (cur[k] || []).length) cur[k] = b[k]; });
    lsSet('walk_badges_v1', JSON.stringify(cur));
  } catch (e) {}
  TZ.at = 0;
}
