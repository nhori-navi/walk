// 版39：🏠 家へ・最近の行き先（見直しその2の D1）。tsuzuku.js のあと、seiri.js の前
// 家：walk_home＝家にしたお気に入りの位置 [経度, 緯度]。30m 以内のお気に入りが家。[0,0] は「外した」印
//     walk_home がないときは、名前が「家」「自宅」（または 🏠 で始まる）のお気に入りを家として使う
// 最近の行き先：walk_hist [{name, p（5桁）, t}] 新しい順に10件。検索の枠を押したとき（空のとき）だけ出す
const HM = {flag: false, more: false, key: ''};
const HM_MAX = 10, HM_SHOW = 5;

// ---------- 家 ----------
function hmHomeIdx() {
  const h = loadJSON('walk_home', 'null');
  if (Array.isArray(h) && h.length === 2) {
    if (!h[0] && !h[1]) return -1; // 外した
    let best = -1, bd = 30;
    favs.forEach((f, i) => { const d = distM(f.p, h); if (d <= bd) { bd = d; best = i; } });
    return best;
  }
  return favs.findIndex(f => /^(🏠|家$|自宅$)/.test(String(f.name || '').trim()));
}
function hmHome() { const i = hmHomeIdx(); return i < 0 ? null : favs[i]; }
function hmSetHome(i) {
  if (i === hmHomeIdx()) { lsSet('walk_home', '[0,0]'); status('家の設定を外しました'); }
  else { lsSet('walk_home', JSON.stringify(favs[i].p)); status(`「${favs[i].name}」を家にしました。ルートタブの「🏠 家へ」で帰り道が出ます`); }
  renderFavs();
}
// 家の設定がないとき：記録タブのお気に入りの管理を開いて案内する
function hmSetupHint() {
  if (typeof showTab === 'function') showTab('rec');
  const fh = $('favHead'), d = fh && fh.closest('details');
  if (d) d.open = true;
  setTimeout(() => { try { (fh || $('favList')).scrollIntoView({block: 'start', behavior: 'smooth'}); } catch (e) {} }, 80);
  status(favs.length ? '家にするお気に入りの「🏠 家にする」を押してください'
    : 'まず家を目的地にして「★登録」してから、ここの「🏠 家にする」を押してください');
}
function hmGoHome() {
  const f = hmHome();
  if (!f) { hmSetupHint(); return; }
  if (pos && distM(pos, f.p) < 50) { status('いまは家のすぐ近くです'); return; }
  if (typeof rmSet === 'function' && $('rmode').value !== 'to') rmSet('to');
  $('hits').innerHTML = ''; hmHistHide();
  destName = f.name; HM.flag = true;
  try { setDest(f.p); } finally { HM.flag = false; }
  status(walk ? `行き先を家（${f.name}）に変えました。記録はそのまま続けています` : `家（${f.name}）までのルートを作ります`);
}

// お気に入りの並び（ルートタブ）と管理（記録タブ）に家を足す
function hmDecorate() {
  const hi = hmHomeIdx(), f = hi < 0 ? null : favs[hi], bar = $('favBar');
  if (bar) {
    bar.querySelectorAll('button[data-go]').forEach(b => { b.style.display = Number(b.dataset.go) === hi ? 'none' : ''; });
    let hb = $('homeBtn');
    if (!hb) { hb = document.createElement('button'); hb.id = 'homeBtn'; hb.className = 'fav'; hb.onclick = hmGoHome; }
    bar.prepend(hb);
    hb.classList.toggle('unset', !f);
    hb.innerHTML = f ? `🏠 家へ${/^(🏠|家$|自宅$)/.test(f.name.trim()) ? '' : `<small>${esc(f.name)}</small>`}` : '🏠 家を決める';
  }
  const list = $('favList');
  if (list) list.querySelectorAll('button[data-del]').forEach(b => {
    const i = Number(b.dataset.del);
    const h = document.createElement('button'); h.className = 'favHome' + (i === hi ? ' on' : '');
    h.textContent = i === hi ? '🏠 家（外す）' : '🏠 家にする';
    h.onclick = () => hmSetHome(i);
    b.before(h);
  });
  hmBackUpd();
}
const _hmRenderFavs = renderFavs;
renderFavs = function () { _hmRenderFavs(); hmDecorate(); };

// 歩いている途中の「🏠 家へ帰る」（ルートのカードのボタンの並び。周回で歩いていても使える）
function hmBackUpd() {
  let b = $('homeBack');
  if (!b) {
    const clr = $('routeClear'); if (!clr) return;
    b = document.createElement('button'); b.id = 'homeBack'; b.textContent = '🏠 家へ帰る'; b.onclick = hmGoHome;
    clr.before(b);
  }
  const f = hmHome();
  const show = !!(walk && f && !(pos && distM(pos, f.p) < 80) && !(dest && distM(dest, f.p) < 30));
  b.style.display = show ? '' : 'none';
}

// ---------- 最近の行き先 ----------
function hmHist() { const a = loadJSON('walk_hist', '[]'); return Array.isArray(a) ? a.filter(h => h && Array.isArray(h.p)) : []; }
function hmSaveHist(a) { lsSet('walk_hist', JSON.stringify(a.slice(0, HM_MAX))); }
function hmMapName() { const d = new Date(); return `📍 地図で選んだ場所（${d.getMonth() + 1}/${d.getDate()}）`; }
function hmAddHist(p, name) {
  if (!Array.isArray(p) || !isFinite(p[0]) || !isFinite(p[1])) return;
  if (favs.some(f => distM(f.p, p) < 50)) return; // お気に入りの近くは入れない
  const a = hmHist().filter(h => distM(h.p, p) >= 50);
  a.unshift({name: name || hmMapName(), p: [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5], t: Date.now()});
  hmSaveHist(a);
}
const _hmSetDest = setDest;
setDest = function (p) {
  const nm = destName;
  _hmSetDest(p);
  if (!HM.flag) { try { hmAddHist(p, nm); } catch (e) {} }
  hmBackUpd();
};
function hmAgo(t) {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const k = Math.floor((d0.getTime() - t) / 864e5) + 1;
  if (t >= d0.getTime()) return 'きょう';
  if (k === 1) return 'きのう';
  if (k < 7) return `${k}日前`;
  const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`;
}
function hmHistRender() {
  const box = $('histBox'), a = hmHist();
  if (!box) return;
  if (!a.length) { box.classList.remove('on'); box.innerHTML = ''; return; }
  const n = HM.more ? a.length : Math.min(a.length, HM_SHOW);
  box.innerHTML = '<div class="hmHd">🕘 最近の行き先</div>' +
    a.slice(0, n).map((h, i) => `<div class="hmRow"><button class="hmGo" data-i="${i}">${esc(h.name)}<small>${hmAgo(h.t || 0)}</small></button><button class="hmX" data-x="${i}" aria-label="この行を消す">✕</button></div>`).join('') +
    `<div class="hmFoot">${a.length > n ? `<button id="hmMore">もっと見る（全部で${a.length}件）</button>` : '<span></span>'}<button id="hmClr" class="hmClr">履歴をすべて消す</button></div>`;
  if (!box.classList.contains('on')) { box.classList.add('on'); hmScroll(); }
  box.querySelectorAll('.hmGo').forEach(b => b.onclick = () => {
    const h = hmHist()[Number(b.dataset.i)]; if (!h) return;
    hmHistHide(); $('search').blur(); $('hits').innerHTML = '';
    if (typeof rmSet === 'function' && $('rmode').value === 'loop') rmSet('to');
    destName = h.name; setDest(h.p);
  });
  box.querySelectorAll('.hmX').forEach(b => b.onclick = () => {
    const x = hmHist(); x.splice(Number(b.dataset.x), 1); hmSaveHist(x); hmHistRender();
  });
  if ($('hmMore')) $('hmMore').onclick = () => { HM.more = true; hmHistRender(); };
  twoStep($('hmClr'), '履歴をすべて消す', () => { hmSaveHist([]); hmHistHide(); status('最近の行き先を消しました'); });
}
function hmScroll() {
  const f = () => { try { const pn = $('panel'), s = $('search'); if (pn && s) pn.scrollTop += s.getBoundingClientRect().top - pn.getBoundingClientRect().top - 8; } catch (e) {} };
  f(); setTimeout(f, 350); // キーボードが出て画面が縮んだあとにも
}
function hmHistHide() { const box = $('histBox'); if (box) box.classList.remove('on'); HM.more = false; }
(function hmHistSetup() {
  const s = $('search'), hits = $('hits'); if (!s || !hits) return;
  const box = document.createElement('div'); box.id = 'histBox'; hits.after(box);
  box.addEventListener('mousedown', e => e.preventDefault()); // 押しても検索の枠からフォーカスを外さない
  const maybe = () => { if (!s.value.trim()) hmHistRender(); else hmHistHide(); };
  s.addEventListener('focus', maybe);
  s.addEventListener('click', maybe);
  s.addEventListener('input', maybe);
  s.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== s) hmHistHide(); }, 250));
  s.addEventListener('keydown', e => { if (e.key === 'Enter') hmHistHide(); });
})();

// ---------- 見た目 ----------
(function () {
  const st = document.createElement('style');
  st.textContent = `
#panel #homeBtn{background:#e3f2e5;border:1px solid #2e7d32;color:#1b5e20;font-weight:bold}
#panel #homeBtn small{font-weight:normal;margin-left:5px;opacity:.8}
#panel #homeBtn.unset{background:transparent;border:1px dashed #9aa59c;color:#5f6b62;font-weight:normal}
#panel #homeBack{background:#e3f2e5;border-color:#2e7d32;color:#1b5e20;font-weight:bold}
#panel .favHome{margin:0 4px 0 6px}
#panel .favHome.on{background:#2e7d32;border-color:#2e7d32;color:#fff}
#histBox{display:none;margin:6px 0 2px;border:1px solid #d5dcd6;border-radius:10px;background:#f7faf7;overflow:hidden}
#histBox.on{display:block}
#histBox .hmHd{font-size:12px;color:#5f6b62;padding:6px 10px 3px}
#histBox .hmRow{display:flex;align-items:stretch;border-top:1px solid #e3e8e4}
#panel #histBox .hmGo{flex:1;min-width:0;text-align:left;background:none;border:0;border-radius:0;margin:0;padding:8px 10px;min-height:42px;font-size:15px;color:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#histBox .hmGo small{display:block;font-size:11px;color:#7a857c;margin-top:1px}
#panel #histBox .hmX{flex:0 0 44px;background:none;border:0;border-left:1px solid #e3e8e4;border-radius:0;margin:0;color:#8a948c;font-size:15px}
#histBox .hmFoot{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e3e8e4;padding:2px 4px}
#panel #histBox .hmFoot button{background:none;border:0;margin:0;padding:8px 6px;font-size:13px;color:#1e7e34}
#panel #histBox .hmFoot .hmClr{color:#c0392b}
body.dark #panel #homeBtn,body.dark #panel #homeBack{background:#1f3a26;border-color:#4caf50;color:#c8e6c9}
body.dark #panel #homeBtn.unset{background:transparent;border-color:#6b766e;color:#a9b4ac}
body.dark #panel .favHome.on{background:#3aa85a;border-color:#3aa85a;color:#0f1a12}
body.dark #histBox{background:#28322e;border-color:#3d4a44}
body.dark #panel #histBox .hmRow,body.dark #panel #histBox .hmFoot,body.dark #panel #histBox .hmX{border-color:#3d4a44}
body.dark #histBox .hmHd,body.dark #histBox .hmGo small{color:#9fb0a6}
body.dark #panel #histBox .hmFoot button{color:#7bd389}
body.dark #panel #histBox .hmFoot .hmClr{color:#ff8a7a}`;
  document.head.appendChild(st);
})();

// 起動時と、控えの読み込みなどで家・お気に入りが変わったとき
renderFavs();
setInterval(() => {
  const k = (getLS('walk_home') || '') + '|' + favs.length;
  if (k !== HM.key) { HM.key = k; renderFavs(); } else hmBackUpd();
}, 3000);
HM.key = (getLS('walk_home') || '') + '|' + favs.length;
