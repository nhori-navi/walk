// mirutoko.js：版40 ミルトコ（Google Play に出す予定のシリーズアプリ）のホームを、MichiMiru の上にかぶせる（home.js のあと、seiri.js の前）
// ・版42：ホーム＝HP の TOP（https://nhori-navi.github.io/?inapp=1。アプリの中では毎日使う形に切り替わる＝toko/kyou.js）。
//   ミルビーは特別ページ（toko＝https://nhori-navi.github.io/toko/）で、TOP から「重ねて開く」（OV.toko）
// ・ここではホーム（TOP）を iframe でいちばん上に置き、隠したり出したりする
//   （MichiMiru のページを切り替えると、画面を消しての記録の受け取りが途切れるため。版21 と同じ考え方）
// ・ホームを出すのは「ミルトコとして動いているとき」（アプリの目印 MiruTokoApp）か、設定の「ミルトコのホームを試す」が入のときだけ
//   → それ以外は版39 と同じ動き
// ・ホームのボタン：歩く＝ホームが下がって MichiMiru、めぐる・空・山＝今の「重ねて開く」（ovOpen）。重ねたアプリはホームの上に開く
// ・戻り方：戻る帯「◀ ホームに戻る」、スマホの「戻る」（ミル→ホーム、ホーム→アプリを裏に回す）
//   版41：MichiMiru の画面の上にも同じ緑の帯（body.toko-walk）。▦ はミルトコのときは出さない（ホームに4つのボタンがあるので）
//   版41：index.html の頭の小さな script が、MichiMiru の画面より先に iframe を作る（開いたらすぐホーム）。ここではそれを引き継ぐ
// ・散歩を終えたら（まとめを保存したあと）、ホームに「判定して」と頼み、達成ならまとめのカードに1行
// ・ホームのみちくさの材料（walk_mk_v1）：近くの神社・寺・公園の数、MeguMiru のまだの場所の数といちばん近い所、山の見え方（版41）
const TOKO_APP = /MiruTokoApp/.test(navigator.userAgent);
const TOKO = {f: null, ready: false, shown: false, failed: false, th: '', mkAt: 0};
const tokoActive = () => TOKO_APP || getLS('walk_toko') === '1';
const tokoWin = () => { try { return TOKO.ready && TOKO.f && TOKO.f.contentWindow; } catch (e) { return null; } };
const TOKO_BG = {light: '#79b0e2', dark: '#1c1f1e'};   // TOP のはじめの絵の空の色・暗い画面の地の色
const TOKO_URL = () => new URL('../', location.href).href + '?inapp=1';   // ホーム＝HP の TOP
// 版42：ミルビーのページ（toko）を「重ねて開く」の仲間に（▦ の枠には出さない。枠は先に作ってあるため）
if (typeof OV !== 'undefined' && !OV.toko) OV.toko = {img: '../toko/img/icon.svg', vf: 'lib.js', vr: /TOKO_V *= *(\d+)/, vv: 'TOKO_V', vp: '版', path: '../toko/', btn: 'Toko', icon: '🐦', sub: 'ミルビーのみちくさ', title: 'ミルビー', color: '#2f4c53', bg: '#f4f1e8', keep: false};

function tokoStyle() {
  if ($('tokoStyle')) return;
  const st = document.createElement('style'); st.id = 'tokoStyle';
  st.textContent = '#tokoFrame{position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:8995;display:none;background:#f4f1e8}#tokoFrame.on{display:block}' +
    // 版41：MichiMiru の画面の上の緑の帯（ほかのミルと同じ）。地図と全画面の画面は帯の下から
    'body.toko-walk #ovStrip{display:flex}body.toko-walk #map{top:var(--ovs);height:calc(var(--split,50%) - var(--ovs))}body.toko-walk.walking #map{height:auto}body.toko-walk.walking.menu #map{height:calc(var(--split,50%) - var(--ovs))}' +
    '@media (min-width:900px){body.toko-walk #map{height:auto}}body.toko-walk #helpBox,body.toko-walk #intro{top:var(--ovs)}body.toko-walk #hud{top:calc(var(--ovs) + 8px)}body.toko-on #mApps{display:none}' +
    '#sumCard .sumMkz{margin-top:4px;padding:5px 8px;border-radius:10px;background:#e7f2e4;font-size:14px;font-weight:bold;color:#2e6b3a}#sumCard .sumMkz small{display:block;font-weight:normal;font-size:12px;color:#4d6b52}' +
    'body.dark #sumCard .sumMkz{background:#24382a;color:#a8e0b4}body.dark #sumCard .sumMkz small{color:#b9d3bf}';
  document.head.appendChild(st);
}
// ---------- かぶせる・外す ----------
function tokoStart() {
  if (TOKO.f) return;
  tokoStyle();
  if (typeof ovStyle === 'function') ovStyle();   // 戻る帯の見た目（Chrome では重ねて開くまで作られないため）
  let f = $('tokoFrame');
  const early = !!f;   // 版41：index.html の頭で先に作ってある
  if (!f) {
    f = document.createElement('iframe');
    f.id = 'tokoFrame'; f.title = 'ミルトコのホーム';
    f.src = TOKO_URL();
    document.body.appendChild(f);
  }
  f.style.background = document.body.classList.contains('dark') ? TOKO_BG.dark : TOKO_BG.light;
  TOKO.f = f; TOKO.ready = false; TOKO.failed = false;
  f.addEventListener('load', tokoLoaded);
  document.body.classList.add('toko-on');
  tokoShowHome(true);
  if (early) { let ok = false; try { ok = typeof f.contentWindow.TOKO_V !== 'undefined'; } catch (e) {} if (ok) tokoLoaded(); }
  // 読み込めない（電波なしなど）ときは、ホームを出さずにいつもの MichiMiru のまま
  setTimeout(() => { if (TOKO.f === f && !TOKO.ready) tokoFail(); }, 15000);
}
function tokoLoaded() {
  if (TOKO.ready) return;
  let ok = false;
  try { ok = typeof TOKO.f.contentWindow.TOKO_V !== 'undefined'; } catch (e) {}
  if (!ok) { tokoFail(); return; }
  TOKO.ready = true; TOKO.failed = false;
  tokoTheme(true);
  if (TOKO.shown) { try { TOKO.f.contentWindow.tokoShow(); } catch (e) {} }
}
// 読み込めなかった：いつもの MichiMiru に戻す（次に開いたときにもう一度読み込む）
function tokoFail() {
  if (!TOKO.f) return;
  tokoStop();
  if (typeof status === 'function') status('ミルトコのホームを読み込めませんでした（電波のよい所で開き直すと、もう一度読み込みます）');
}
function tokoStop() {
  if (!TOKO.f) return;
  try { TOKO.f.remove(); } catch (e) {}
  TOKO.f = null; TOKO.ready = false; TOKO.shown = false;
  document.body.classList.remove('toko-on', 'toko-walk');
  try { map.resize(); } catch (e) {}
  if (typeof ovCur !== 'undefined' && ovCur) stripUpd();
}
function tokoShowHome(first) {
  if (!TOKO.f) return;
  TOKO.f.classList.add('on'); TOKO.shown = true;
  document.body.classList.remove('toko-walk');
  lsSet('walk_toko_last', 'home');
  if (typeof appsClose === 'function') appsClose();
  if (!first && TOKO.ready) { try { TOKO.f.contentWindow.tokoShow(); } catch (e) {} }
  tokoMkSave();
}
function tokoHideHome() {
  if (!TOKO.f) return;
  TOKO.f.classList.remove('on'); TOKO.shown = false;
  document.body.classList.add('toko-walk');
  stripUpd();
  try { map.resize(); } catch (e) {}
  setTimeout(() => { try { map.resize(); } catch (e) {} }, 100);
}
// MichiMiru の地図（ホームが下がっている）からホームに戻る
function tokoBackHome() {
  if (typeof ovCur !== 'undefined' && ovCur) { ovClose(false); return; }
  if (history.state && history.state.mmToko) { try { history.back(); return; } catch (e) {} }
  tokoShowHome();
}
window.addEventListener('popstate', () => {
  if (!TOKO.f) return;
  const s = history.state || {};
  if (!s.mmToko && !s.mmHelp && !s.mmOv && !TOKO.shown) tokoShowHome();
});

// ---------- ホームから呼ばれるもの ----------
window.tokoGo = function (id, sub) {
  if (id === 'walk') {
    if (typeof ovCur !== 'undefined' && ovCur) { ovClose(false, true); lsSet('walk_ov', ''); }
    tokoHideHome();
    try { if (!(history.state && history.state.mmToko)) history.pushState({mmToko: 1}, ''); } catch (e) {}
    lsSet('walk_toko_last', 'walk');
    if (sub === 'nikki' && typeof showTab === 'function') { showTab('rec'); setTimeout(() => { const h = $('todayHead'); if (h) h.scrollIntoView({block: 'start'}); }, 80); }
    return;
  }
  if (id === 'bee') id = 'toko';   // ミルビーのページ
  if (typeof OV !== 'undefined' && OV[id]) { ovOpen(id); if (id !== 'toko') lsSet('walk_toko_last', id); }
};
window.tokoState = function () {
  const w = typeof walk !== 'undefined' ? walk : null;
  let txt = '';
  if (w) txt = w.vt ? `🚃 乗り物で移動中・${fmtDur(Date.now() - w.t0)}` : `● 記録中 ${fmtDist(w.dist || 0)}・${fmtDur(Date.now() - w.t0)}`;
  return {rec: !!w, veh: !!(w && w.vt), txt, trial: !TOKO_APP, inApp: typeof IN_APP !== 'undefined' && IN_APP, ver: APP_VER,
    meguOn: !!(typeof ovFrames !== 'undefined' && ovFrames.megu)};
};
window.tokoOff = function () {
  lsSet('walk_toko', '0');
  const c = $('mtkChk'); if (c) c.checked = false;
  tokoStop();
  if (typeof status === 'function') status('ミルトコのホームを試すのをやめました（設定タブの「🏠 ミルトコのホーム（ためし）」で、また試せます）');
};

// ---------- 重ねたアプリを閉じて TOP に戻ったとき：TOP を描き直す（ミルビーのページで達成したときなど） ----------
(function () {
  const close0 = ovClose;
  ovClose = function () {
    const was = typeof ovCur !== 'undefined' ? ovCur : '';
    const r = close0.apply(this, arguments);
    if (was && !ovCur && TOKO.shown && TOKO.ready) { try { TOKO.f.contentWindow.tokoShow(); } catch (e) {} }
    return r;
  };
  window.miruClose = () => ovClose(false); window.meguClose = window.miruClose;
})();

// ---------- 戻る帯：文字と押したとき ----------
// ホームに戻る＝ホームの上に重ねたアプリを開いているとき・MichiMiru の画面（ホームが下がっている）のとき
(function () {
  const strip0 = stripUpd;
  stripUpd = function () {
    strip0.apply(this, arguments);
    const s = $('ovStrip'), bk = s && s.querySelector('.bk'); if (!bk) return;
    const cur = typeof ovCur !== 'undefined' ? ovCur : '';
    const home = !!(TOKO.f && (TOKO.shown || !cur));
    const want = home ? 'ホームに戻る' : 'MichiMiru に戻る';
    if (bk.dataset.t !== want) {
      bk.dataset.t = want;
      bk.innerHTML = `◀ <img class="mi" src="${home ? '../toko/img/icon.svg' : 'icon-192.png'}" alt="" onerror="this.remove()">${want}`;
      s.title = want;
    }
    if (!s.__toko) { s.__toko = 1; s.onclick = () => { if (typeof ovCur !== 'undefined' && ovCur) ovClose(false); else if (TOKO.f) tokoBackHome(); }; }
  };
  setInterval(() => { if (document.body.classList.contains('toko-walk') && !(typeof ovCur !== 'undefined' && ovCur)) stripUpd(); }, 5000);
})();

// ---------- 明るさ ----------
function tokoTheme(force) {
  if (!TOKO.f) return;
  const t = window.miruTheme(), k = t.dark + ':' + t.preset;
  if (!force && k === TOKO.th) return;
  TOKO.th = k;
  TOKO.f.style.background = t.dark ? TOKO_BG.dark : TOKO_BG.light;
  const w = tokoWin(); if (w && typeof w.miruThemeSet === 'function') { try { w.miruThemeSet(t); } catch (e) {} }
}
try { new MutationObserver(() => tokoTheme(false)).observe(document.body, {attributes: true, attributeFilter: ['class']}); } catch (e) {}

// ---------- 散歩を終えたら判定 ----------
(function () {
  const save0 = sumSave;
  sumSave = async function (o) {
    const r = await save0.apply(this, arguments);
    try { await tokoAfterWalk(o); } catch (e) {}
    return r;
  };
})();
async function tokoAfterWalk(o) {
  const w = tokoWin(); if (!w || typeof w.tokoJudge !== 'function') return;
  const r = await w.tokoJudge('walk');
  if (!r || !r.now || !o || !SUM.cur || SUM.cur.t0 !== o.t0) return;
  const top = $('sumTop'); if (!top || top.querySelector('.sumMkz')) return;
  const d = document.createElement('div'); d.className = 'sumMkz';
  d.innerHTML = '🌿 きょうのみちくさ 達成' + (r.title ? `<small>${esc(r.title)}</small>` : '');
  top.appendChild(d);
}

// ---------- みちくさの材料（walk_mk_v1） ----------
async function tokoMkSave() {
  if (!TOKO.f || Date.now() - TOKO.mkAt < 120000) return;
  const here = (typeof pos !== 'undefined' && pos) || getLSjson('walk_lastpos');
  if (!here) return;
  TOKO.mkAt = Date.now();
  const old = getLSjson('walk_mk_v1') || {}, same = old.p && distM(old.p, here) < 500;
  const out = {t: Date.now(), p: [Math.round(here[0] * 1e4) / 1e4, Math.round(here[1] * 1e4) / 1e4], poi: same ? old.poi || null : null, megu: same ? old.megu || null : null, yama: same ? old.yama || null : null};
  // 神社・寺・公園：読み込んでいる道のデータが今の場所を含むときだけ数える
  try {
    const g = typeof graph !== 'undefined' ? graph : null, m = 0.01;
    if (g && g.poiList && g.bb && here[0] > g.bb.w + m && here[0] < g.bb.e - m && here[1] > g.bb.s + m && here[1] < g.bb.n - m) {
      const n = r => g.poiList.filter(p => p && p.p && distM(here, p.p) <= r).length;
      out.poi = {near: n(500), walk: n(1500)};
    }
  } catch (e) {}
  // MeguMiru のまだの場所（訪問＝段階2 になっていないミュージアム・史跡・道の駅）
  try {
    if (typeof mnLoad === 'function') await mnLoad();
    if (typeof MN !== 'undefined' && MN.spots && MN.spots.length) {
      const rec = MN.rec || {}, list = MN.spots.filter(s => s && s.x != null && !(rec[s.id] && rec[s.id].lv >= 2)).map(s => [s, distM(here, [s.x, s.y])]).sort((a, b) => a[1] - b[1]);
      const one = r => { const a = list.filter(x => x[1] <= r); return {n: a.length, nm: a.length ? a[0][0].n : '', dd: a.length ? Math.round(a[0][1]) : 0}; };
      out.megu = {walk: one(1500), far: one(5000)};
    }
  } catch (e) {}
  // 版41：山の見え方（今日のおすすめと同じ計算。天気は今日のおすすめが取ったもの）。{k:日付, nm, dd（0 今日・1 明日）, s（朝・昼・夕）, m（◎○△×）}
  try {
    if (typeof osTargets === 'function' && typeof osLevels === 'function') {
      const tg = osTargets(here);
      if (tg) {
        const hr = new Date().getHours(), dd = hr >= 18 ? 1 : 0, cs = hr < 10 ? 0 : hr < 15 ? 1 : 2;
        const lv = osLevels(tg, osWxStore(), dd);
        let bi = -1; lv.forEach((v, i) => { if (v != null && (dd || i >= cs) && (bi < 0 || v > lv[bi])) bi = i; });
        const k = ymd(Date.now() - 4 * 3600000);
        if (bi >= 0) out.yama = {k, nm: tg.peaks[0].name, dd, s: OS_SLOTS[bi][0], m: OS_MARK[lv[bi]]};
      }
    }
  } catch (e) {}
  lsSet('walk_mk_v1', JSON.stringify(out));
}
function getLSjson(k) { try { return JSON.parse(getLS(k) || 'null'); } catch (e) { return null; } }

// ---------- 設定タブ：試すスイッチ（ミルトコとして動いているときは出さない） ----------
function tokoCard() {
  if (TOKO_APP || $('mtkHead')) return;
  const after = $('hkHead') && $('hkHead').closest('.card');
  const set = $('tab-set'); if (!set) return;
  const c = document.createElement('div'); c.className = 'card';
  c.innerHTML = '<div class="ch" id="mtkHead">🏠 ミルトコのホーム（ためし）</div>' +
    '<label class="sw"><span class="swt">ミルトコのホームを試す<small>Google Play に出す予定のミルトコのホーム画面（きょうのみちくさ・ミルビー・4つのミルのボタン）が、MichiMiru の上にかぶさります。画面の上の緑の帯でホームに戻れます。切るといつもの MichiMiru</small></span><input type="checkbox" id="mtkChk"></label>';
  if (after) after.after(c); else set.appendChild(c);
  $('mtkChk').checked = tokoActive();
  $('mtkChk').onchange = e => {
    if (e.target.checked) { lsSet('walk_toko', '1'); tokoStart(); }
    else window.tokoOff();
  };
}
tokoCard();
window.addEventListener('load', () => { const s = $('mtkHead'); if (s && !s.dataset.hint) s.dataset.hint = 'Google Play 版のホーム画面を試す'; });

// ---------- 起動 ----------
if (tokoActive()) {
  tokoStart();
  // 前回のアプリから始める（ミルトコの設定）。切なら、前に開いていた重ねたアプリは閉じてホームから
  let resume = false; try { resume = !!(JSON.parse(localStorage.getItem('toko_set_v1') || '{}').resume); } catch (e) {}
  const last = getLS('walk_toko_last') || 'home';
  if (resume && last === 'walk') window.tokoGo('walk');
  else if (!resume && typeof ovCur !== 'undefined' && ovCur) ovClose(false);
}
setInterval(() => { if (TOKO.f) { tokoTheme(false); if (TOKO.shown) tokoMkSave(); } }, 30000);
