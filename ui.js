// MichiMiru：画面の骨組み（版9）。下のタブ、地図の丸いボタン、ルートの結果のカード、道の好みの「押して選ぶ並び」、見た目
// app.js のあと・help.js の前に読む。部品の id と動きは変えず、見せ方だけを変える
(function () {
  const st = document.createElement('style');
  st.textContent = `
:root{--g:#1e7e34;--g2:#27ae60;--gl:#e8f5ec;--line:#d5ddd8;--ink:#23322a}
body{background:#f2f5f3;color:var(--ink)}
#map{height:50%}
#panel{top:50%;bottom:64px;background:#f2f5f3;padding:8px 10px 14px;border-top:1px solid var(--line)}
@media (min-width:900px){
  #map{height:auto;bottom:0;right:380px}
  #panel{top:0;bottom:64px;left:auto;width:380px;border-top:none;border-left:1px solid var(--line)}
  #tabbar{left:auto!important;width:380px;border-left:1px solid var(--line)}
}
/* 下のタブ */
#tabbar{position:fixed;left:0;right:0;bottom:0;height:64px;z-index:8;display:flex;align-items:stretch;background:#fff;border-top:1px solid var(--line);box-shadow:0 -1px 4px rgba(0,0,0,.06)}
#tabbar .tb{flex:1;margin:0;padding:6px 0 4px;border:none;background:none;border-radius:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font-size:12px;color:#5d6b63;min-height:0}
#tabbar .tb .ic{font-size:21px;line-height:1;filter:grayscale(.6);opacity:.75}
#tabbar .tb.on{color:var(--g);font-weight:bold}
#tabbar .tb.on .ic{filter:none;opacity:1}
#tabbar .tb.on::after{content:'';display:block;width:24px;height:3px;border-radius:2px;background:var(--g);margin-top:2px}
#tabbar .fab{flex:0 0 76px;margin:-18px 2px 6px;padding:0;border:4px solid #fff;border-radius:38px;background:var(--g);color:#fff;font-size:12px;font-weight:bold;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.3);min-height:0}
#tabbar .fab .ic{font-size:24px;line-height:1.1}
body.walking #tabbar{display:none}
body.walking.menu #tabbar{display:flex;bottom:52px}
body.walking.menu #tabbar .fab{visibility:hidden}
body.walking.menu #panel{bottom:116px}
/* タブの中身 */
.pane{display:none}
.pane.on{display:block}
.card{display:block;background:#fff;border:1px solid #e1e8e3;border-radius:12px;padding:8px 10px;margin:0 0 8px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
details.card{padding:8px 10px}
.ch{font-weight:bold;color:#1e5631;margin:0 0 4px;font-size:15px}
summary.ch{cursor:pointer;margin:0}
details.card[open] > summary.ch{margin-bottom:6px}
#prefSum{font-weight:normal;color:#5d6b63;font-size:13px;margin-left:6px}
.acts{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0 2px}
body:not(.has-route) #walkBtn + .qb{display:none}
.srow{display:flex;gap:6px}
.srow input{flex:1;min-width:0}
#panel button,#panel input[type=number],#panel input:not([type]),#search{min-height:40px;border-radius:9px;border:1px solid var(--line);background:#fff;color:var(--ink);margin:0;padding:6px 12px}
#panel button.primary{background:var(--g);border-color:var(--g);color:#fff;font-weight:bold}
#panel button.danger{color:#c0392b;border-color:#e6b0aa}
#panel .acts button:disabled{display:none}
#panel .qb{min-height:0;width:22px;height:22px;padding:0;border-radius:50%;border:1px solid var(--g);color:var(--g)}
#walkBtn{font-size:16px}
body:not(.has-route) #walkBtn{display:none}
body:not(.has-plan) #routeClear{display:none}
#rem{font-size:22px}
.row{margin:4px 0}
.lst{border:1px solid #eef2ef;border-radius:8px}
.hit{border-radius:8px}
#favBar{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 0}
#favBar .fav{min-height:34px}
/* 押して選ぶ並び */
.chips{display:inline-flex;flex-wrap:wrap;gap:4px;vertical-align:middle}
#panel .chips button{min-height:34px;padding:4px 11px;border-radius:17px;font-size:14px}
#panel .chips button.on{background:var(--g);border-color:var(--g);color:#fff;font-weight:bold}
.tg{display:inline-flex;flex-wrap:wrap;gap:4px;vertical-align:middle}
.tg label{display:inline-flex;align-items:center;min-height:34px;padding:2px 11px;border:1px solid var(--line);border-radius:17px;background:#fff;font-size:14px}
.tg label:has(input:checked){background:var(--gl);border-color:var(--g);color:var(--g);font-weight:bold}
.tg input{margin:0 4px 0 0}
/* 地図の右の丸いボタン（追従・向き） */
#mapBtns{position:absolute;right:10px;top:116px;z-index:4;display:flex;flex-direction:column;gap:8px}
#mapBtns button{width:44px;height:44px;margin:0;padding:0;border-radius:22px;border:none;background:#fff;color:#1f6fd1;font-size:20px;font-weight:bold;box-shadow:0 1px 5px rgba(0,0,0,.35)}
#mapBtns button.on{background:#1f6fd1;color:#fff}
#reBtn{display:none!important}
body.mode-tk #mapBtns,body.mode-tabi #mapBtns{display:none}
#status:empty,#err:empty{display:none}
/* 版10：ルートが出ないときの理由、確認の枠、マスの吹き出し（半透明） */
#routeWhy{display:none;background:#fff8e1;border:1px solid #f0c419;border-radius:10px;padding:6px 9px;margin:6px 0 2px;font-size:14px;line-height:1.5}
#routeWhy.on{display:block}
#routeWhy.flash{animation:whyf 1s ease-in-out 2}
@keyframes whyf{50%{background:#ffe082}}
.ask{display:none;background:#fdecea;border:1px solid #e6b0aa;border-radius:10px;padding:6px 9px;margin:6px 0;font-size:14px}
.meshPop .mapboxgl-popup-content{background:rgba(255,255,255,.78);padding:6px 9px;font-size:13px;line-height:1.5;box-shadow:0 1px 4px rgba(0,0,0,.25)}
.meshPop.mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip{border-top-color:rgba(255,255,255,.78)}
.meshPop.mapboxgl-popup-anchor-top .mapboxgl-popup-tip{border-bottom-color:rgba(255,255,255,.78)}
.meshPop .meshLoad{margin:4px 0 0;padding:4px 10px;min-height:32px;border-radius:8px;border:1px solid #1e7e34;background:#1e7e34;color:#fff;font-size:13px}
#status{margin:0 0 6px}
`;
  document.head.appendChild(st);

  // ---------- 下のタブ ----------
  const TABS = [['route', '🧭', 'ルート'], ['play', '🟧', 'あそぶ'], ['walk'], ['rec', '🗾', '記録'], ['set', '⚙️', '設定']];
  const bar = document.createElement('nav'); bar.id = 'tabbar';
  bar.innerHTML = TABS.map(([k, ic, nm]) => k === 'walk'
    ? '<button id="walkFab" class="fab"><span class="ic">🚶</span><span id="walkFabTx">記録だけ</span></button>'
    : `<button class="tb" data-tab="${k}"><span class="ic">${ic}</span><span>${nm}</span></button>`).join('');
  document.body.appendChild(bar);
  let cur = getLS('walk_tab') || 'route';
  if (!$('tab-' + cur)) cur = 'route';
  function showTab(k) {
    cur = k; lsSet('walk_tab', k);
    document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === 'tab-' + k));
    bar.querySelectorAll('.tb').forEach(b => b.classList.toggle('on', b.dataset.tab === k));
    $('panel').scrollTop = 0;
  }
  window.showTab = showTab;
  window.curTab = () => cur;
  bar.querySelectorAll('.tb').forEach(b => b.onclick = () => { showTab(b.dataset.tab); if (walk && !document.body.classList.contains('menu')) $('menuBtn').click(); });
  // 版10：目的地を決めたのにルートがまだないときは「計算待ち」。押すとルートのタブの理由のところを光らせる
  const waitingRoute = () => !route && !walk && ((mode === 'to' && !!dest) || (mode === 'loop' && calcState.k !== 'idle' && calcState.k !== 'ok'));
  $('walkFab').onclick = () => {
    if (waitingRoute()) {
      showTab('route'); const w = $('routeWhy');
      w.classList.remove('flash'); void w.offsetWidth; w.classList.add('flash'); w.scrollIntoView({block: 'nearest'});
      return;
    }
    $('walkBtn').click();
  };
  showTab(cur);
  // 使い方ナビ：見えていないタブの中の部品なら、そのタブのボタンを光らせる
  window.uiReach = el => {
    const p = el && el.closest && el.closest('.pane');
    if (p && !p.classList.contains('on')) return bar.querySelector(`.tb[data-tab="${p.id.slice(4)}"]`);
    return el;
  };

  // ---------- 地図の右の丸いボタン（追従・向き） ----------
  const mb = document.createElement('div'); mb.id = 'mapBtns';
  mb.innerHTML = '<button id="mFollow" title="現在地に追従">◎</button><button id="mHead" title="地図の向き">N</button>';
  $('map').appendChild(mb);
  $('mFollow').onclick = () => $('followBtn').click();
  $('mHead').onclick = () => $('headBtn').click();

  // ---------- 押して選ぶ並び（プルダウンの代わり。元のプルダウンは隠して値だけ使う） ----------
  const chipSets = [];
  function chips(id, labels) {
    const sel = $(id), w = document.createElement('span'); w.className = 'chips';
    [...sel.options].forEach((o, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = labels ? labels[i] : o.text; b.dataset.v = o.value;
      b.onclick = () => { if (sel.value === o.value) return; sel.value = o.value; sel.dispatchEvent(new Event('change')); syncChips(); };
      w.appendChild(b);
    });
    sel.style.display = 'none'; sel.after(w); chipSets.push([sel, w]);
  }
  chips('ext', ['なし', '+300m', '+500m', '+1km', '+2km']);
  chips('unexp');
  chips('slope', ['気にしない', '避ける', 'あえて選ぶ']);
  chips('foot');
  chips('poiN', ['1か所', '2か所', '3か所']);
  chips('loopKm', ['1km', '2km', '3km', '5km']);
  chips('loopDir', ['おまかせ', '時計回り', '反時計回り']);
  chips('rrMode', ['自動', '聞いてから', 'しない']);
  function syncChips() { chipSets.forEach(([sel, w]) => w.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === sel.value))); }
  window.chipOf = id => { const s = chipSets.find(([sel]) => sel.id === id); return s ? s[1] : $(id); };
  // 道の好みの開け閉めを覚える（初めは開いておく）
  $('prefs').open = getLS('walk_prefs') !== '0';
  $('prefs').addEventListener('toggle', () => lsSet('walk_prefs', $('prefs').open ? '1' : '0'));
  // 閉じていても今の選択が分かるように1行で
  function prefText() {
    const t = [], v = id => $(id).value, nm = id => { const o = $(id).selectedOptions[0]; return o ? o.text : ''; };
    if (v('unexp') !== '1') t.push('未踏破 ' + nm('unexp'));
    if (v('slope') !== '0') t.push(v('slope') === '1' ? '坂を避ける' : '坂を選ぶ');
    if (v('foot') !== '0') t.push('遊歩道 ' + nm('foot'));
    const poi = [['poiShrine', '⛩'], ['poiTemple', '卍'], ['poiPark', '🌳']].filter(([id]) => $(id).checked).map(([, ic]) => ic).join('');
    if (poi) t.push('寄り道 ' + poi + '×' + v('poiN'));
    if (v('ext') !== '0') t.push('延長 ' + nm('ext'));
    return t.length ? '：' + t.join('・') : '：ふつう（最短）';
  }

  // ---------- 版10：ルートが出ないときの理由とボタン ----------
  let whyKey = '';
  function showWhy(on) {
    const w = $('routeWhy');
    w.classList.toggle('on', on);
    if (!on) { whyKey = ''; return; }
    if (mode === 'to' && dest) $('rem').textContent = '目的地：' + (destName || '地図で選んだ場所');
    const k = calcState.k, key = k + '|' + calcState.msg + '|' + !!pos;
    if (key === whyKey) return;
    whyKey = key;
    if (k === 'calc' || k === 'idle') { w.innerHTML = '⏳ ルートを計算中です…'; return; }
    if (k === 'wait') {
      w.innerHTML = '📍 ルートはまだ出ていません。' + esc(calcState.msg) +
        '<div class="acts"><button id="whyPick">出発地を地図で選ぶ</button>' + (pos ? '<button id="whyForce">それでもこの位置で計算</button>' : '') + '</div>';
      $('whyPick').onclick = () => $('warnPick').click();
      if ($('whyForce')) $('whyForce').onclick = () => $('warnForce').click();
      return;
    }
    w.innerHTML = '⚠️ ルートを作れませんでした：' + esc(calcState.msg) +
      '<div class="acts"><button id="whyRetry" class="primary">もう一度計算する</button></div>';
    $('whyRetry').onclick = () => { calcState = {k: 'calc', msg: ''}; calc(); };
  }

  // ---------- 状態に合わせて見せ方を変える（0.4秒ごと） ----------
  let lastDest = dest, wasWalk = !!walk;
  function tick() {
    const b = document.body.classList;
    b.toggle('has-route', !!route);
    b.toggle('has-plan', !!(route || dest || vias.length || startPt));
    const wr = waitingRoute();
    $('walkFabTx').textContent = route ? '歩き始める' : wr ? (calcState.k === 'calc' ? '計算中…' : '計算待ち') : '記録だけ';
    $('recalcBtn').textContent = walk && route ? '🔄 組み直す' : '再計算';
    showWhy(wr);
    $('mFollow').classList.toggle('on', !!follow);
    $('mFollow').title = follow ? '現在地に追従しています（押すと止める）' : '現在地に戻る';
    $('mHead').textContent = headingUp ? '⬆' : 'N';
    $('mHead').classList.toggle('on', !!headingUp);
    $('mHead').title = headingUp ? '進む方向が上（押すと北が上）' : '北が上（押すと進む方向が上）';
    $('prefSum').textContent = prefText();
    syncChips();
    // 目的地を決めた・地図で場所を選んでいる・歩き終えたときは、ルートのタブへ
    if ((dest && dest !== lastDest) || (wasWalk && !walk) || (pickMode && cur !== 'route')) showTab('route');
    lastDest = dest; wasWalk = !!walk;
  }
  setInterval(tick, 400);
  tick();
  map.on('load', () => setTimeout(() => map.resize(), 50));
})();
