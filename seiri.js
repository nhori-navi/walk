// 版36：画面の整理（ルート・あそぶ・記録・設定タブの並べ替えとたたみ）。tsuzuku.js のあと、いちばん最後に読む
// ・ルート：「🎲 おまかせで歩く」をいちばん上に、「☀ 今日のおすすめ」はその下（初めはたたんだ1行）
// ・設定：見出しごとにたたむ（開くのは1つずつ）。「おまかせに混ぜる」は道の好みの中へ
// ・記録：散歩日記をいちばん上に、記録の管理・お気に入りはたたむ。旅の地図は「あそぶ」へ
// 部品の id と動きはそのまま。要素を動かすだけ
(function () {
  const $id = id => document.getElementById(id);
  // 見出しの下に出す小さな説明（たたんでいるときに、中に何があるか分かるように）
  const HINT = {
    '使い方': '使い方ナビ・ヘルプ・はじめの紹介',
    appHead: '画面を消しての記録・ISS・上空の見張り・近くの場所の知らせ',
    hkHead: '4つのアプリをまとめて書き出す・読み込む',
    themeHead: '夜の画面・夜の地図・文字の大きさ',
    viewHead: '歩いた道・乗り物・神社など・比べるルート',
    walkSetHead: '振動・道を外れたとき・体重',
    setHead: '道のデータを取り直す',
    recHead: '書き出し・読み込み・保存の状況・すべて消す',
    favHead: '登録した場所の削除・🏠 家にする'
  };
  // div.card（中に .ch の見出し）→ details.card（見出しは summary）。中身はそのまま移す
  function fold(card, key) {
    if (!card || card.tagName === 'DETAILS') return card;
    const ch = card.querySelector(':scope > .ch');
    if (!ch) return card;
    const d = document.createElement('details');
    d.className = card.className + ' fold'; if (card.id) d.id = card.id;
    const s = document.createElement('summary'); s.className = 'ch';
    if (ch.id) s.id = ch.id;
    while (ch.firstChild) s.appendChild(ch.firstChild);
    let h = HINT[ch.id] || HINT[key] || HINT[(s.textContent || '').trim()];
    if (ch.id === 'appHead' && /ホーム画面/.test(s.textContent)) h = 'ホーム画面に追加して、アイコンから開けるようにする';   // Chrome で開いたとき
    if (h) s.dataset.hint = h;
    ch.remove();
    d.appendChild(s);
    while (card.firstChild) d.appendChild(card.firstChild);
    card.replaceWith(d);
    return d;
  }
  // 同じタブの中では、開くのは1つずつ
  function accordion(pane) {
    pane.querySelectorAll(':scope > details.fold').forEach(d => d.addEventListener('toggle', () => {
      if (!d.open) return;
      pane.querySelectorAll(':scope > details.fold[open]').forEach(o => { if (o !== d) o.open = false; });
      setTimeout(() => d.scrollIntoView({block: 'nearest'}), 0);
    }));
  }

  const st = document.createElement('style');
  st.textContent =
    'details.fold > summary.ch{list-style:none;position:relative;padding:4px 26px 4px 0;line-height:1.35}' +
    'details.fold > summary.ch::-webkit-details-marker{display:none}' +
    'details.fold > summary.ch::before{content:"▸";position:absolute;right:4px;top:4px;color:#1e7e34;font-size:15px}' +
    'details.fold[open] > summary.ch::before{content:"▾"}' +
    'details.fold > summary.ch[data-hint]::after{content:attr(data-hint);display:block;font-weight:normal;font-size:12px;color:#6b7a70;margin-top:2px}' +
    'details.fold[open] > summary.ch[data-hint]::after{display:none}' +
    'body.dark details.fold > summary.ch::before{color:#a8e0b4}body.dark details.fold > summary.ch[data-hint]::after{color:#b9c5bd}' +
    // たたんだおすすめの見出しは1行に（日付は隠して、記号の並びを出す）
    '#osHead .osT{white-space:nowrap;flex:none}#osHead:has(.osMini:not(:empty)) .sub{display:none}#osHead .osMini{min-width:0;flex:1;text-align:right}' +
    '#tab-route > #omBtn{margin-top:2px}#tab-route > #osCard{margin-top:8px}' +
    '#prefs .omMix{margin-top:6px;border-top:1px solid #e3e8e4;padding-top:6px}body.dark #prefs .omMix{border-color:#3d4a45}';
  document.head.appendChild(st);

  // ---------- ルート ----------
  const om = $id('omBtn'), os = $id('osCard');
  if (om && os) om.after(os);
  // 初めて版36 を開いたときは、おすすめをたたんだ1行にする（そのあとは開け閉めを覚える）
  try {
    if (!localStorage.getItem('walk_seiri_v1')) {
      localStorage.setItem('walk_seiri_v1', '1');
      localStorage.setItem('walk_os_open', '0');
      if (typeof OS === 'object') { OS.open = false; if (typeof osRender === 'function') { OS.last = ''; osRender(); } }
    }
  } catch (e) {}
  // 「おまかせに、まだの場所・あと少しのマスを通る案も混ぜる」は、設定タブから道の好みの中へ
  const mix = $id('omMixChk'), prefs = $id('prefs');
  if (mix && prefs) { const lb = mix.closest('label'); if (lb) { lb.classList.add('omMix'); prefs.appendChild(lb); } }

  // ---------- あそぶ・記録 ----------
  const rec = $id('tab-rec'), play = $id('tab-play');
  const tabi = $id('tabiHead') && $id('tabiHead').closest('.card');
  if (tabi && play) play.appendChild(tabi);   // 旅の地図は「あそぶ」へ（東海道・スタンプ帳と並べる）
  if (rec) {
    const fh = [...rec.querySelectorAll(':scope > .card > .ch')].find(c => /お気に入り/.test(c.textContent));
    if (fh && !fh.id) fh.id = 'favHead';
    const rh = $id('recHead');
    if (rh) fold(rh.closest('.card'));
    if (fh) fold(fh.closest('.card'));
    accordion(rec);
  }

  // ---------- 設定 ----------
  const set = $id('tab-set');
  if (set) {
    [...set.querySelectorAll(':scope > .card')].forEach(c => {
      const ch = c.querySelector(':scope > .ch'); if (!ch) return;
      fold(c, (ch.textContent || '').trim());
    });
    accordion(set);
  }
})();
