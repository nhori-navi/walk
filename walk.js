// MichiMiru：歩行中の記録・案内表示・記録の保護・画面ON・タッチロック・歩いた記録・GPX

// ---------- 歩行中の記録（距離・速度・カロリー） ----------
const METS = [[1.5, 1.3], [3.2, 2.8], [4.0, 3.0], [4.8, 3.5], [5.6, 4.3], [6.4, 5.0], [7.2, 7.0]];
function mets(kmh) {
  if (kmh <= METS[0][0]) return METS[0][1];
  for (let i = 1; i < METS.length; i++) if (kmh <= METS[i][0]) {
    const [a, x] = METS[i - 1], [b, y] = METS[i];
    return x + (y - x) * (kmh - a) / (b - a);
  }
  return METS[METS.length - 1][1];
}
// 版21：記録に点を足す。各点の時刻（記録の始まりからの秒）も ts に並べて残す（MeguMiru が使う）
function pushPt(t, p, now) {
  t.pts.push(roundP(p));
  if (Array.isArray(t.ts)) {
    if (t.ts.length === t.pts.length - 1) t.ts.push(Math.max(0, Math.round((now - t.t0) / 1000)));
    else delete t.ts; // 数が合わなくなったら時刻は使わない（点の位置はそのまま）
  }
}
// 歩いた1区間を足す（距離・カロリー・上り）
function walkAdd(a, p, now) {
  const d = distM(a.p, p), dt = Math.max((now - a.t) / 1000, 1), v = d / dt;
  walk.dist += d;
  walk.kcal += mets(v * 3.6) * weight() * dt / 3600 * 1.05;
  pushPt(walk.track, p, now);
  // 上った分のカロリー（標高タイルの高さで2m以上変わったら数える。体重1kgを1m持ち上げる≒0.0094kcal）
  const eh = elevSync(p);
  if (!isNaN(eh)) {
    if (walk.eRef === null) walk.eRef = eh;
    else if (eh - walk.eRef >= 2) { walk.up += eh - walk.eRef; walk.kcal += weight() * (eh - walk.eRef) * 0.0094; walk.eRef = eh; }
    else if (walk.eRef - eh >= 2) walk.eRef = eh;
  }
}
// ---------- 版21：乗り物の区間 ----------
// 秒速4mより速い移動が3回（または合わせて150m）続いたら「乗り物」。乗り物の区間は別の記録（k:'veh'・src:'app'）に50mごとの点で残す
// 遅い状態が2分続いたら歩きに戻し、遅くなってからの分はさかのぼって歩きに入れる（駅での停車で途切れないように）
const VEH_V = 4, VEH_ON_N = 3, VEH_ON_M = 150, VEH_OFF_MS = 120000, VEH_PT_M = 50, GAP_S = 60, GAP_M = 300;
function vehOpen() {
  const a = walk.pendFrom, list = walk.pend, last = list[list.length - 1];
  const vt = {k: 'veh', t0: a.t, t1: last.t, pts: [], ts: [], src: 'app', ses: walk.t0};
  pushPt(vt, a.p, a.t); let lp = a.p;
  list.forEach((x, i) => { if (distM(lp, x.p) >= VEH_PT_M || i === list.length - 1) { pushPt(vt, x.p, x.t); lp = x.p; } });
  tracks.push(vt);
  walk.vt = vt; walk.vLast = lp; walk.vFast = {p: last.p, t: last.t}; walk.sbuf = []; walk.pend = []; walk.pendFrom = null;
  walk.note = '🚃 乗り物の区間として記録しています（歩いた距離には入れません）'; walk.noteUntil = last.t + 15000;
}
function vehStep(p, now, acc) {
  const vt = walk.vt, d = distM(walk.last.p, p), dt = Math.max((now - walk.last.t) / 1000, 1);
  if (d >= Math.max(8, acc * 0.5)) {
    if (d / dt > VEH_V) {
      walk.vFast = {p, t: now}; walk.sbuf = [];
      if (distM(walk.vLast, p) >= VEH_PT_M) { pushPt(vt, p, now); walk.vLast = p; }
      vt.t1 = now;
    } else walk.sbuf.push({p, t: now});
    walk.last = {p, t: now};
  }
  if (now - walk.vFast.t >= VEH_OFF_MS) { vehClose(); return true; }
  return false;
}
function vehClose() {
  const vt = walk.vt, f = walk.vFast; if (!vt) return;
  if (f && distM(walk.vLast, f.p) > 1) pushPt(vt, f.p, f.t);
  if (f) vt.t1 = f.t;
  if (vt.pts.length < 2) tracks = tracks.filter(t => t !== vt);
  walk.vt = null; walk.eRef = null;
  // 遅くなってからの分は歩きに入れる（最初の1点は乗り物の区間とつながないので、距離に入れない）
  let prev = null;
  (walk.sbuf || []).forEach(x => { if (prev) walkAdd(prev, x.p, x.t); else pushPt(walk.track, x.p, x.t); prev = x; });
  walk.sbuf = [];
  walk.note = '🚶 歩きの記録に戻りました'; walk.noteUntil = Date.now() + 10000;
  saveTracks(); afterTracksChanged();
}
function walkStep(c, t) {
  // 版20：アプリ版の裏の記録は、位置を取った時刻 t を使う（画面を消している間にまとめて届いても速さを正しく計算するため）
  const now = t || Date.now(), p = [c.longitude, c.latitude];
  // 精度50m超が10秒以上続いたら、記録を止めていることを知らせる
  if (c.accuracy > REC_M) { if (!walk.badSince) walk.badSince = now; }
  else walk.badSince = 0;
  walk.acc = c.accuracy;
  let onFoot = false; // 歩いている（スタンプを調べてよい）
  if (c.accuracy <= REC_M) {
    if (!walk.last) { walk.last = {p, t: now}; pushPt(walk.track, p, now); onFoot = true; }
    else if (walk.vt) onFoot = vehStep(p, now, c.accuracy);
    else {
      const d = distM(walk.last.p, p), dt = (now - walk.last.t) / 1000;
      if (d >= Math.max(8, c.accuracy * 0.5)) {
        const v = d / Math.max(dt, 1);
        if (typeof BG !== 'undefined' && BG.on && dt > GAP_S && d > GAP_M) {
          // 版21：裏の記録で位置が途切れていた（地下・トンネル）：線は引かず、距離にも入れない
          walk.pend = []; pushPt(walk.track, p, now); walk.eRef = null;
        } else if (v <= VEH_V) {
          walk.pend = []; walkAdd(walk.last, p, now); onFoot = true;
        } else {
          // 速い：続いたら乗り物（それまでは記録に入れない）
          if (!walk.pend || !walk.pend.length) { walk.pend = []; walk.pendFrom = walk.last; }
          walk.pend.push({p, t: now});
          let pd = 0, q = walk.pendFrom.p; walk.pend.forEach(x => { pd += distM(q, x.p); q = x.p; });
          if (walk.pend.length >= VEH_ON_N || pd >= VEH_ON_M) vehOpen();
        }
        walk.last = {p, t: now};
      } else onFoot = !(walk.pend && walk.pend.length);
    }
  }
  if (c.accuracy <= REC_M && onFoot) stampLive(p); // 版21：乗り物で通っただけの神社などはスタンプにしない
  walk.hist.push({t: now, d: walk.dist});
  while (walk.hist.length && walk.hist[0].t < now - 120000) walk.hist.shift();
  renderHud();
}
// 次の案内（曲がり角・階段・急な上り坂）と、そこまでの距離
function nextTurn() {
  if (!route || !route.turns || !route.turns.length || route.off > 60 || route.rough) return null;
  const t = route.turns.find(x => x.d > route.a - 10);
  return t ? {t, dist: Math.max(0, t.d - route.a)} : null;
}
function turnText(t) {
  if (t.kind === 'steps') return {ar: t.up === true ? '⤴' : t.up === false ? '⤵' : '⇅', tx: '階段' + (t.up === true ? '（上り）' : t.up === false ? '（下り）' : '')};
  if (t.kind === 'slope') return {ar: '⤴', tx: '急な上り坂'};
  if (t.kind === 'poi') return {ar: '', tx: t.label};
  const a = Math.abs(t.ang), L = t.ang < 0;
  if (a < 60) return {ar: L ? '↖' : '↗', tx: L ? '斜め左へ' : '斜め右へ'};
  if (a < 150) return {ar: L ? '↰' : '↱', tx: L ? '左へ' : '右へ'};
  return {ar: L ? '↶' : '↷', tx: L ? '大きく左へ' : '大きく右へ'};
}
function turnHtml() {
  const n = nextTurn(); if (!n) return '';
  const {ar, tx} = turnText(n.t);
  if (n.dist > 150) return `<div class="small" style="margin:0">次の案内まで ${fmtDist(n.dist)}</div>`;
  // 版12：矢印を大きく。20m以内は赤く塗って目立たせる
  const near = n.dist <= 20;
  return `<div class="turn${near ? ' now' : ''}">${ar ? `<span class="tar">${ar}</span>` : ''}<span class="ttx">${near ? 'まもなく' : fmtDist(n.dist) + '先'} <b>${tx}</b></span></div>`;
}
// 案内の40m手前で一度だけ振動する
function maybeVibrate() {
  if (!walk || !$('vibChk').checked || !CAN_VIB) return;
  const n = nextTurn();
  if (n && n.dist <= 40 && !route.vib[n.t.d]) { route.vib[n.t.d] = 1; try { navigator.vibrate([200, 100, 200]); } catch (e) {} }
}
function renderHud() {
  if (!walk) return;
  const now = Date.now(), el = (now - walk.t0) / 1000;
  // 記録に「終わった時刻」とカロリーを書き込んでおく（同じ時間のGPXとの重複判定・今日の合計に使う）
  walk.track.t1 = now; walk.track.kcal = Math.round(walk.kcal * 10) / 10;
  let v = null;
  const e = walk.hist.find(x => x.t >= now - 60000);
  if (e && now - e.t >= 15000) v = (walk.dist - e.d) / ((now - e.t) / 1000);
  else if (!e && el > 60) v = 0;
  const pace = (el < 120 || walk.dist < 100) ? SPEED / 60 : Math.max(0.3, walk.dist / el);
  let top = '';
  // 版25：ふだんは小さく（残りと到着の1行＋曲がり角の案内＋注意）。カードを押すと詳しく（もう一度で小さく）
  const full = getLS('walk_hudfull') === '1', alerts = hudAlerts(now);
  if (!full) {
    let line;
    if (lastRemain === null) line = `● 記録中 ${fmtDist(walk.dist)}・${fmtTime(el)}`;
    else if (route && route.rough) line = `残り 約${fmtDist(lastRemain)}（目安）`;
    else if (lastRemain < 20) line = route && route.loop ? '出発点に戻りました' : '到着しました';
    else line = `残り ${fmtDist(lastRemain)}・${hm(new Date(now + lastRemain / pace * 1000))}着`;
    const n = lastRemain !== null && lastRemain >= 20 && !(route && route.rough) ? nextTurn() : null;
    $('hud').classList.add('mini');
    $('hud').innerHTML = (n && n.dist <= 150 ? turnHtml() : '') + `<div class="mid">${line}<span class="more">▾</span></div>` + alerts;
    return;
  }
  $('hud').classList.remove('mini');
  if (lastRemain === null) top = '<div class="big">記録中（ルートなし）</div>';
  else if (route && route.rough) top = `<div class="big">残り 約${fmtDist(lastRemain)}</div><div class="small" style="margin:0">位置が粗いため目安です</div>`;
  else if (lastRemain < 20) top = `<div class="big">${route && route.loop ? '出発点に戻りました' : '到着しました'}</div>`;
  else top = turnHtml() + `<div class="big">残り ${fmtDist(lastRemain)}</div><div class="big">到着 ${hm(new Date(now + lastRemain / pace * 1000))}</div>`;
  $('hud').innerHTML = top +
    (route && route.prof && lastRemain >= 20 ? `<div>残りの上り ${Math.round(route.remUp)}m</div>` : '') +
    `<div>${v === null ? '—' : (v * 3.6).toFixed(1)} km/h　${Math.round(walk.kcal)} kcal</div>` +
    `<div class="small" style="margin:0">歩行 ${fmtTime(el)}・${fmtDist(walk.dist)}</div>` +
    (meshHud() ? `<div class="small" style="margin:0;color:#b9770e">${meshHud()}</div>` : '') + alerts +
    '<div class="small" style="margin:0;text-align:right;color:#777">押すと小さく ▴</div>';
}
// 版25：小さくしているときも出す注意（乗り物・ルートを外れた・位置が粗い・知らせ）
function hudAlerts(now) {
  return (walk.vt ? '<div class="small" style="margin:0;color:#7a5c8e">🚃 乗り物で移動中（歩いた距離に入れていません）</div>' : '') +
    (walk.askRR ? '<div style="margin:2px 0;padding:3px 6px;border-radius:6px;background:#fdecea;color:#c0392b;font-weight:bold">⚠ ルートを外れました。ここをタップして組み直す</div>' : '') +
    (walk.badSince && now - walk.badSince >= 10000 ? `<div class="small" style="margin:0;color:#c00">位置が粗いので記録を止めています（精度 約${fmtAcc(walk.acc)}）</div>` : '') +
    (walk.note && now < walk.noteUntil ? `<div class="small" style="margin:0;color:#1f6fd1">${walk.note}</div>` : '') +
    (walk.msg && now < walk.msgUntil ? `<div class="small" style="margin:0;max-width:240px;color:${walk.msgErr ? '#c00' : '#555'}">${esc(walk.msg)}</div>` : '');
}
function resizeSoon() { setTimeout(() => map.resize(), 60); }
// 振動できない端末（パソコン・iPhone）では、振動の設定を押せなくする
if (!CAN_VIB) { $('vibChk').checked = false; $('vibChk').disabled = true; $('vibTest').disabled = true; $('vibMsg').textContent = 'この端末は振動に対応していません'; }
if (IOS) $('iosNote').style.display = '';
// パソコンでは、歩行中の下の帯のロックを出さない
if (PC_LIKE) $('lockBtn').style.display = 'none';
$('vibTest').onclick = () => {
  if (!CAN_VIB) { $('vibMsg').textContent = 'この端末は振動に対応していません'; return; }
  const ok = navigator.vibrate([300, 150, 300]);
  $('vibMsg').textContent = ok ? '振動の命令を送りました。震えなければ、スマホのマナーモード・バイブの強さ・省電力モードを確認してください'
    : 'ブラウザが振動を止めました（画面を一度タップしてから試してください）';
};
function updWalkBtn() { $('walkBtn').textContent = route ? '歩き始める' : '記録だけ始める'; }

// ---------- 歩行中の記録を守る（すぐ保存・続きから再開） ----------
function saveSession() {
  try {
    if (!walk) { localStorage.removeItem('walk_session'); return; }
    const r = route && {coords: route.coords, pts: route.pts, baseTotal: route.baseTotal, loop: route.loop, ur: route.ur,
      prof: route.prof, turns: route.turns, prog: route.prog};
    lsSet('walk_session', JSON.stringify({t0: walk.t0, dist: walk.dist, kcal: walk.kcal, up: walk.up, s0: walk.s0,
      saved: Date.now(), dest, destName, mode, route: r}));
  } catch (e) {}
}
function saveNow() { if (walk) { saveTracks(); saveSession(); } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); else { applyWake(); updToday(); } });
window.addEventListener('pagehide', saveNow);
// 歩行中にページを閉じたり戻ったりしようとしたら確認を出す
window.addEventListener('beforeunload', e => { if (walk) { saveNow(); e.preventDefault(); e.returnValue = ''; } });
function startWalk(prev) {
  walk = Object.assign({t0: Date.now(), dist: 0, kcal: 0, up: 0, track: null}, prev || {}, {eRef: null, last: null, hist: [], badSince: 0, acc: null});
  // 版21：ts＝各点の時刻（秒）、ses＝この歩行の始まり（MeguMiru が歩いている途中の記録を見分ける）
  walk.vt = null; walk.pend = []; walk.sbuf = [];
  if (!walk.track) { walk.track = {k: 'walk', t0: walk.t0, t1: walk.t0, kcal: 0, pts: [], ts: [], ses: walk.t0}; tracks.push(walk.track); }
  document.body.classList.add('walking'); document.body.classList.remove('menu');
  $('menuBtn').textContent = '▲メニュー';
  $('result').textContent = '';
  resizeSoon(); setFollow(true);
  clearInterval(hudTimer);
  let n = 0;
  hudTimer = setInterval(() => { renderHud(); if (++n % 6 === 0) { saveTracks(); saveSession(); updToday(); playLive(); } }, 5000);
  // 記録を始めたら画面ONを「入」にする（版20：アプリ版で画面ONの仕組みがないときは入れない。画面を消しても記録が続くため）
  wakeOn = !(/MichiMiruApp/.test(navigator.userAgent) && !('wakeLock' in navigator)); applyWake();
  if (typeof sumClose === 'function') sumClose(); // 版25：前の散歩のまとめを閉じる
  if (typeof sumStart === 'function') sumStart(); // 版25：まとめのための控え（スタンプ・東海道）
  saveSession();
  renderHud(); updToday();
  if (typeof bgStart === 'function') bgStart(); // 版20：アプリ版なら、画面を消しても記録を続ける
}
$('walkBtn').onclick = () => {
  if (walk) return;
  // パソコンなど向きのセンサーがない端末は位置が粗く、記録がほとんど残らないので始めない
  if (noSensor()) { status('歩いた記録はスマホで取れます。この端末は位置が粗く、記録がほとんど残りません（ルートの計算や記録の表示は使えます）'); return; }
  startWalk();
};
// 30分以内に開き直したら、歩行を続きから再開する
function restoreSession() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem('walk_session') || 'null'); } catch (e) {}
  if (!s) return;
  if (!(Date.now() - s.saved <= 30 * 60000)) { try { localStorage.removeItem('walk_session'); } catch (e) {} return; }
  if (s.dest) {
    dest = s.dest; destName = s.destName || '';
    destMarker = new mapboxgl.Marker({color: '#c0392b'}).setLngLat(dest).addTo(map);
    $('favAdd').disabled = false;
  }
  mode = s.mode || 'to'; $('recalcBtn').disabled = false;
  if (s.route) {
    const r = s.route;
    route = {coords: r.coords, cum: cumOf(r.coords), pts: r.pts, baseTotal: r.baseTotal, loop: r.loop, ur: r.ur, off: 0, prog: r.prog || 0,
      prof: r.prof, turns: r.turns || [], vib: {}, a: 0, remUp: r.prof ? r.prof.up : 0};
    setData('route', line(route.coords)); updWalkBtn();
  }
  let track = tracks.find(t => t.k === 'walk' && t.t0 === s.t0);
  if (!track) { track = {k: 'walk', t0: s.t0, t1: s.t0, kcal: 0, pts: [], ts: [], ses: s.t0}; tracks.push(track); }
  startWalk({t0: s.t0, dist: s.dist, kcal: s.kcal, up: s.up || 0, s0: s.s0, track, note: '前回の歩行を続きから再開しました', noteUntil: Date.now() + 20000});
  status('前回の歩行を続きから再開しました');
}

// ---------- 画面をつけたままにする（手動） ----------
let wakeOn = false, wakeLock = null;
async function applyWake() {
  if (wakeOn && document.visibilityState === 'visible' && !wakeLock) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) { wakeOn = false; showErr('画面をつけたままにできませんでした（' + (e.name === 'NotAllowedError' ? '画面を表示している間だけ使えます' : jaErr(e)) + '）'); }
  } else if (!wakeOn && wakeLock) {
    try { await wakeLock.release(); } catch (e) {}
    wakeLock = null;
  }
  $('wakeBtn').textContent = '☀️ 画面ON'; $('wakeBtn').classList.toggle('on', wakeOn); // 版17：入のときは黄色
  $('wakeBtn').title = wakeOn ? '画面を消さない：入（押すと切）' : '画面を消さない：切（押すと入）';
}
$('wakeBtn').onclick = () => {
  if (!('wakeLock' in navigator)) { $('wakeBtn').textContent = '使えません'; setTimeout(applyWake, 3000); return; }
  wakeOn = !wakeOn; applyWake();
};

// ---------- タッチロック（ポケットの中での誤操作を防ぐ。長押しで解除） ----------
let lockRaf = null;
function setLock(v) { $('lock').style.display = v ? 'block' : 'none'; cancelHold(); }
function cancelHold() { if (lockRaf) cancelAnimationFrame(lockRaf); lockRaf = null; $('lockBar').style.width = '0'; }
$('lockBtn').onclick = () => setLock(true);
$('lockBadge').addEventListener('pointerdown', e => {
  e.preventDefault();
  const t0 = Date.now();
  const tick = () => {
    const r = (Date.now() - t0) / 1500;
    $('lockBar').style.width = Math.min(100, r * 100) + '%';
    if (r >= 1) setLock(false); else lockRaf = requestAnimationFrame(tick);
  };
  cancelHold(); lockRaf = requestAnimationFrame(tick);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => $('lockBadge').addEventListener(ev, cancelHold));
$('lock').addEventListener('contextmenu', e => e.preventDefault());

$('menuBtn').onclick = () => {
  const open = document.body.classList.toggle('menu');
  $('menuBtn').textContent = open ? '▼閉じる' : '▲メニュー';
  resizeSoon();
};
$('endBtn').onclick = () => {
  if (!walk) return;
  const el = (Date.now() - walk.t0) / 1000;
  const avg = el > 0 ? walk.dist / el * 3.6 : 0;
  $('result').textContent = `今回の歩行：${fmtTime(el)}・${fmtDist(walk.dist)}・平均${avg.toFixed(1)}km/h・${walk.up >= 1 ? `上り約${Math.round(walk.up)}m・` : ''}${Math.round(walk.kcal)}kcal`;
  // 最後の書き出しから30日以上なら、控えを勧める
  const bk = Number(getLS('walk_bk_last')) || 0;
  if (Date.now() - bk >= 30 * 864e5) $('result').textContent += `　※${bk ? '最後の書き出しから30日以上たっています' : 'まだ記録を書き出していません'}。「歩いた記録の管理」の「全部まとめて書き出す」で控えを取りましょう`;
  if (walk.vt) vehClose(); // 版21：乗り物の区間の途中で終わったら、そこで閉じる
  walk.track.t1 = Date.now(); walk.track.kcal = Math.round(walk.kcal * 10) / 10;
  if (walk.track.pts.length < 2) tracks = tracks.filter(t => t !== walk.track);
  saveTracks();
  const ended = walk; // 版25：散歩のまとめに使う
  clearInterval(hudTimer); clearTimeout(followTimer); walk = null;
  if (typeof bgStop === 'function') bgStop(); // 版20：裏の記録を止める（通知も消える）
  saveSession();
  setLock(false); wakeOn = false; applyWake();
  document.body.classList.remove('walking', 'menu');
  resizeSoon();
  afterTracksChanged();
  if (typeof sumEnd === 'function') sumEnd(ended); // 版25：散歩のまとめ
};

// ---------- 歩いた記録（保存・表示） ----------
// 版21：歩いた記録は大きな置き場（IndexedDB の 'michimiru' → 'kv' → 'tracks'）に置く
// ・前の版までの localStorage 'walk_tracks' は、起動したときに一度だけ移して消す（移し終わったのを確かめてから）
// ・保存したら localStorage 'walk_trk_rev' に時刻を書く（MeguMiru が「変わった」と気づくため）
// ・IndexedDB が使えない端末では、今まで通り localStorage に置く
const TRK = {idb: typeof indexedDB !== 'undefined', ready: false, saving: false, again: false, errAt: 0};
function trkDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('michimiru', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
  });
}
async function trkDo(mode, fn) {
  const db = await trkDb();
  return new Promise((res, rej) => {
    const tx = db.transaction('kv', mode), q = fn(tx.objectStore('kv'));
    tx.oncomplete = () => { db.close(); res(q && q.result); };
    tx.onerror = tx.onabort = () => { db.close(); rej(tx.error || new Error('abort')); };
  });
}
function trkRev() { try { localStorage.setItem('walk_trk_rev', String(Date.now())); } catch (e) {} }
// 同じ記録（始めた時刻・種類・最初の点）は1つに。点の多い方を残す（歩いている途中の記録はそのもの）
function trkMerge(base, more) {
  const map = new Map(); base.forEach(t => { if (t && Array.isArray(t.pts)) map.set(trackKey(t), t); });
  (more || []).forEach(t => {
    if (!t || !Array.isArray(t.pts)) return;
    const k = trackKey(t), o = map.get(k);
    if (!o) map.set(k, t);
    else if (t.pts.length > o.pts.length && !(walk && (o === walk.track || o === walk.vt))) map.set(k, t);
  });
  return [...map.values()].sort((a, b) => (a.t0 || 0) - (b.t0 || 0));
}
async function trkLoad() {
  if (!TRK.idb) { TRK.ready = true; return; }
  let lsRaw = null, fromDb = null;
  try { lsRaw = localStorage.getItem('walk_tracks'); } catch (e) {}
  try { fromDb = await trkDo('readonly', st => st.get('tracks')); }
  catch (e) { TRK.idb = false; TRK.ready = true; return; } // 使えない：今まで通り localStorage
  const dbList = Array.isArray(fromDb) ? fromDb : [];
  // tracks には、base.js が localStorage から読んだ分と、読み込みを待つ間に足した分が入っている
  tracks = trkMerge(tracks, dbList);
  TRK.ready = true;
  if (lsRaw !== null || TRK.again || tracks.length !== dbList.length) {
    try {
      await trkDo('readwrite', st => st.put(tracks, 'tracks'));
      const back = await trkDo('readonly', st => st.get('tracks'));
      if (Array.isArray(back) && back.length === tracks.length && lsRaw !== null) {
        try { localStorage.removeItem('walk_tracks'); } catch (e) {}
        status(`歩いた記録 ${tracks.length}本を、大きな置き場に移しました`);
      }
      trkRev();
    } catch (e) { TRK.idb = false; showErr('記録を大きな置き場に移せませんでした（' + jaErr(e) + '）。今まで通りの置き場を使います'); }
  }
  TRK.again = false;
  // この記録を、端末の空きが少なくなっても消さないよう頼む（ブラウザが決める。断られても普通に使える）
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(p => p || navigator.storage.persist()).catch(() => {}); } catch (e) {}
  afterTracksChanged();
}
async function trkWrite() {
  if (TRK.saving) { TRK.again = true; return; }
  TRK.saving = true;
  try {
    do { TRK.again = false; await trkDo('readwrite', st => st.put(tracks, 'tracks')); } while (TRK.again);
    trkRev();
  } catch (e) {
    if (Date.now() - TRK.errAt > 600000) { TRK.errAt = Date.now(); showErr('記録の保存に失敗しました（' + jaErr(e) + '）。「全部まとめて書き出す」で控えを取ってください'); }
  } finally { TRK.saving = false; }
}
function saveTracks() {
  if (!TRK.idb) {
    try { localStorage.setItem('walk_tracks', JSON.stringify(tracks)); trkRev(); return true; }
    catch (e) { showErr('記録の保存に失敗しました。容量不足の可能性があります。「全部まとめて書き出す」で控えを取ってください'); return false; }
  }
  if (!TRK.ready) { TRK.again = true; return true; } // 読み込みが終わってからまとめて保存する（空の記録で上書きしない）
  trkWrite(); return true;
}
function splitLines(pts, gap) {
  const out = []; let cur = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (distM(pts[i - 1], pts[i]) > gap) { if (cur.length > 1) out.push(cur); cur = []; }
    cur.push(pts[i]);
  }
  if (cur.length > 1) out.push(cur);
  return out;
}
// ---------- 記録の整理（元の記録はそのまま。表示と集計だけ整理する） ----------
const OFF_M = 30;
// 点ごとの状態：0＝道のデータの範囲外、1＝歩いた道の上、2＝道の近くだが歩いた道とは重ならない、3＝道から30m以上外れた
function ptState(pts) {
  const g = graph;
  return pts.map(p => {
    if (!g || !judgeable(g, p)) return 0;
    if (!roadIdx(g).near(p, OFF_M)) return 3;
    return walkedIdx(g).near(p, 20) ? 1 : 2;
  });
}
// 1本の歩行記録を整理する：そのまま描く線・外れた線・整理後の距離・数える線分
function cleanTrack(t) {
  const pts = t.pts, st = ptState(pts), raw = [], off = [], segs = [];
  let cur = null, curO = null, dist = 0, rawDist = 0, offDist = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = distM(a, b);
    let kind;
    if (d > 80) kind = 'gap';                                   // 記録が途切れた所は線を引かない
    else if (st[i - 1] === 3 || st[i] === 3) kind = 'off';     // 道から外れた
    else if (st[i - 1] === 1 && st[i] === 1) kind = 'edge';    // 歩いた道として1本で描くので、記録の線は描かない
    else kind = 'raw';
    if (kind !== 'gap') rawDist += d;
    if (kind === 'off') offDist += d; else if (kind !== 'gap') { dist += d; segs.push([a, b]); }
    if (kind === 'raw') { if (!cur) { cur = [a]; raw.push(cur); } cur.push(b); } else cur = null;
    if (kind === 'off') { if (!curO) { curO = [a]; off.push(curO); } curO.push(b); } else curO = null;
  }
  return {raw, off, dist, rawDist, offDist, segs};
}
function drawTracks() {
  const fw = [], fv = [], fo = [], cleaned = []; let lw = 0, lv = 0, lo = 0, lu = 0;
  tracks.forEach(t => {
    if (!t.pts || t.pts.length < 2) return;
    // 乗り物の区間は、記録が途切れた地点どうしを直線で結ぶこともあるので、そのまま描く
    if (t.k === 'veh') { lv += cumOf(t.pts)[t.pts.length - 1]; fv.push(line(t.pts)[0]); return; }
    const c = cleanTrack(t); cleaned.push({t, c});
    lw += c.dist; lo += c.offDist;
    c.raw.forEach(l => fw.push(line(l)[0]));
    c.off.forEach(l => fo.push(line(l)[0]));
  });
  // 道のデータを読み込んだ範囲では、歩いたことのある道を1本ずつ描く（何度歩いても線は1本）
  if (graph) graph.edges.forEach(e => {
    if (!e.k) return;
    lu += e.w;
    fw.push(line([[graph.lon[e.a], graph.lat[e.a]], [graph.lon[e.b], graph.lat[e.b]]])[0]);
  });
  setData('walked', $('walkedChk').checked ? fw : []);
  setData('veh', $('vehChk').checked ? fv : []);
  setData('off', $('walkedChk').checked && $('offChk').checked ? fo : []);
  const u = lsUsage(), pct = Math.round(u.all / LS_CAP * 100), mine = Math.round(u.mine / LS_CAP * 100);
  $('recStat').innerHTML = `保存済み：歩行 ${(lw / 1000).toFixed(1)}km${lo >= 50 ? `（道から外れた${(lo / 1000).toFixed(1)}kmは除く）` : ''}・乗り物 ${(lv / 1000).toFixed(1)}km` +
    (graph ? `<br>いま読み込んでいる範囲で歩いた道の長さ：${(lu / 1000).toFixed(1)}km（同じ道は1回と数える）` : '') +
    (TRK.idb ? `<br>歩いた記録の置き場所：この端末の、たっぷり入る置き場所<span id="trkUse"></span>` : '') +
    `<br>設定などの小さな置き場（同じアドレスのアプリで共有）：約${pct}%使用（うち MichiMiru ${mine}%）`;
  // 版21：大きな置き場の使っている量（ブラウザが答える目安。道のデータなども含む）
  if (TRK.idb && navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => {
    const el = $('trkUse'); if (el && e && e.usage) el.textContent = `・この端末で使っている量 約${(e.usage / 1e6).toFixed(1)}MB`;
  }).catch(() => {});
  if (pct >= 80) showErr('この端末の保存場所が残り少なくなっています。「全部まとめて書き出す」で控えを取ってください');
  updBkLast();
  updPlay(cleaned);
  updToday();
}
// 今日（0時から）の合計。日付をまたいだ記録は始めた日に入れる。乗り物の区間は入れない
function todayStats() {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  let dist = 0, sec = 0, kcal = 0;
  tracks.forEach(t => {
    if (t.k === 'veh' || !t.pts || t.pts.length < 2 || !(t.t0 >= d0.getTime())) return;
    const c = cleanTrack(t), r = c.rawDist > 0 ? c.dist / c.rawDist : 1;
    const end = walk && t === walk.track ? Date.now() : t.t1;
    const s = end > t.t0 ? (end - t.t0) / 1000 : c.rawDist / (SPEED / 60); // 終わった時刻がない古い記録は分速80mで見積もる
    dist += c.dist; sec += s;
    // アプリの記録は歩きながら計算したカロリー（坂の上りも含む）、GPXは平均の速さと時間から計算。どちらも外れた分は差し引く
    if (typeof t.kcal === 'number') kcal += t.kcal * r;
    else kcal += mets(c.rawDist / Math.max(s, 1) * 3.6) * weight() * s / 3600 * 1.05 * r;
  });
  return {dist, sec, kcal};
}
// 版10：今日初めて歩いた道（未踏破）の長さ。道のデータを読み込んだ範囲だけ
function todayNew() {
  if (!graph) return 0;
  let m = 0; graph.edges.forEach(e => { if (e.k && !e.k0) m += e.w; });
  return m;
}
function updToday() {
  const s = todayStats(), nu = todayNew();
  $('today').textContent = s.dist >= 1 ? `今日：${fmtDist(s.dist)}・${fmtTime(s.sec)}・${Math.round(s.kcal)}kcal` + (graph ? `・未踏破 ${fmtDist(nu)}` : '') : '今日：まだ歩いた記録がありません';
}
function afterTracksChanged() {
  if (graph) markWalked(graph);
  drawTracks();
  if (typeof tabiRefresh === 'function') tabiRefresh(); // 旅の地図を開いていれば描き直す
  if (route && cands[candIdx] && cands[candIdx].idx && graph) { route.ur = unexpRatio(graph, cands[candIdx].idx); showSummary(); }
}
$('walkedChk').onchange = drawTracks;
$('vehChk').onchange = drawTracks;
$('offChk').addEventListener('change', drawTracks);
// GPXと同じ時間帯のアプリの記録を消す（OpenTracksは画面を消しても途切れないので、そちらを残す）
function dropDup(parts) {
  const sp = parts.filter(p => p.t1 > p.t0).map(p => [p.t0, p.t1]);
  if (!sp.length) return 0;
  const cur = walk && walk.track, before = tracks.length;
  tracks = tracks.filter(t => {
    // 版21：アプリが記録した乗り物の区間（src:'app'）も、GPX と重なれば消す
    if ((t.src && t.src !== 'app') || (t.k === 'veh' && t.src !== 'app') || t === cur || (walk && t === walk.vt)) return true;
    if (t.t1 > t.t0) { // 時間の半分以上がGPXと重なっていたら同じ散歩とみなす
      const ov = sp.reduce((s, [a, b]) => s + Math.max(0, Math.min(b, t.t1) - Math.max(a, t.t0)), 0);
      return ov < (t.t1 - t.t0) * 0.5;
    }
    return !sp.some(([a, b]) => t.t0 >= a && t.t0 <= b); // 終わった時刻がない古い記録は、始めた時刻で判定
  });
  return before - tracks.length;
}

// ---------- GPXの読み込み ----------
function parseGpx(txt) {
  const doc = new DOMParser().parseFromString(txt, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('GPXとして読めませんでした');
  let segs = [...doc.getElementsByTagName('trkseg')].map(s => [...s.getElementsByTagName('trkpt')]);
  if (!segs.length) segs = [[...doc.getElementsByTagName('trkpt')]];
  return segs.map(s => s.map(el => {
    const te = el.getElementsByTagName('time')[0];
    return {p: [Number(el.getAttribute('lon')), Number(el.getAttribute('lat'))], t: te ? Date.parse(te.textContent) : NaN};
  }).filter(x => isFinite(x.p[0]) && isFinite(x.p[1])));
}
function thin(pts, sp) {
  const o = [roundP(pts[0])]; let last = pts[0];
  for (let i = 1; i < pts.length - 1; i++) if (distM(last, pts[i]) >= sp) { o.push(roundP(pts[i])); last = pts[i]; }
  if (pts.length > 1) o.push(roundP(pts[pts.length - 1]));
  return o;
}
// 各点を「歩行」か「乗り物」に分ける（前後30秒の平均速度で判定）
function classify(r) {
  const n = r.length;
  if (r.some(x => !isFinite(x.t))) return new Array(n).fill('walk');
  const cum = [0]; for (let i = 1; i < n; i++) cum.push(cum[i - 1] + distM(r[i - 1].p, r[i].p));
  const cls = new Array(n); let j = 0;
  for (let i = 0; i < n; i++) {
    if (j < i) j = i;
    while (j < n - 1 && r[j].t - r[i].t < 30000) j++;
    let a = i; while (a > 0 && r[j].t - r[a].t < 30000) a--;
    const dt = (r[j].t - r[a].t) / 1000;
    cls[i] = dt > 0 && (cum[j] - cum[a]) / dt > VEH_MS ? 'veh' : 'walk';
  }
  // 1分未満・200m未満の短い区間だけ、前後に合わせる（駅での短い停車など）
  let s = 0;
  for (let i = 1; i <= n; i++) {
    if (i === n || cls[i] !== cls[s]) {
      if (r[i - 1].t - r[s].t < 60000 && cum[i - 1] - cum[s] < 200 && s > 0 && i < n && cls[s - 1] === cls[i])
        for (let k = s; k < i; k++) cls[k] = cls[i];
      s = i;
    }
  }
  return cls;
}
function processSeg(raw, src) {
  const q = [];
  for (const x of raw) {
    if (!q.length) { q.push(x); continue; }
    const a = q[q.length - 1], dt = (x.t - a.t) / 1000;
    if (isFinite(dt) && dt <= 0) continue;
    if (isFinite(dt) && distM(a.p, x.p) / dt > 100) continue; // 不自然な位置の飛び
    q.push(x);
  }
  // 記録が途切れた区間：300m以上離れていて時速10km超なら「乗り物」として直線で残す
  const runs = [], out = []; let run = [];
  for (const x of q) {
    if (run.length) {
      const a = run[run.length - 1], dt = (x.t - a.t) / 1000, d = distM(a.p, x.p);
      if (isFinite(dt) && d > 300 && d / dt > VEH_MS) {
        runs.push(run); run = [];
        out.push({k: 'veh', t0: a.t, t1: x.t, src, pts: [roundP(a.p), roundP(x.p)]});
      } else if (isFinite(dt) && dt > 300) { runs.push(run); run = []; }
    }
    run.push(x);
  }
  if (run.length) runs.push(run);
  runs.forEach(r => {
    if (r.length < 2) return;
    const cls = classify(r); let s = 0;
    for (let i = 1; i <= r.length; i++) {
      if (i === r.length || cls[i] !== cls[s]) {
        const part = r.slice(s, Math.min(i + 1, r.length));
        const te = part[part.length - 1].t;
        if (part.length >= 2) out.push({k: cls[s], t0: isFinite(part[0].t) ? part[0].t : Date.now(), t1: isFinite(te) ? te : undefined, src, pts: thin(part.map(x => x.p), cls[s] === 'veh' ? 50 : 15)});
        s = i;
      }
    }
  });
  return out;
}
// ---------- 全部まとめて書き出す・読み込む ----------
// 書き出す設定（値は保存している文字のまま）。東海道は起点と進み具合を組で扱う
const BK_SET = ['walk_weight', 'walk_vib', 'walk_autofollow', 'walk_offshow', 'walk_meshshow', 'walk_cmp', 'walk_reroute', 'walk_loopdir', 'walk_theme', 'walk_nightmap', 'walk_font', 'walk_trkm', 'walk_hudfull'];
const BK_TK = ['walk_tokaido_from', 'walk_tokaido_last'];
const ymdNum = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const trackKey = t => `${t.t0}|${t.k || 'walk'}|${t.pts[0]}`;
const favSame = (a, b) => a.name === b.name && distM(a.p, b.p) < 1;
function updBkLast() {
  const t = Number(getLS('walk_bk_last')) || 0;
  if (!t) { $('bkLast').textContent = '最後に書き出した日：まだ書き出していません'; return; }
  const days = Math.floor((Date.now() - t) / 864e5);
  $('bkLast').textContent = `最後に書き出した日：${ymd(t).replace(/-/g, '/')}（${days ? days + '日前' : '今日'}）`;
  $('bkLast').style.color = days >= 30 ? '#c0392b' : '';
}
// 版24：書き出す中身（4つのアプリの控え〔hikae.js〕でも使う）
function bkObj() {
  const set = {};
  BK_SET.concat(BK_TK).forEach(k => { const v = getLS(k); if (v !== null) set[k] = v; });
  return {app: 'MichiMiru', kind: 'all', v: 2, t: Date.now(), data: {tracks, stamps, favs, set, meshdone: meshDone}};
}
$('recExport').onclick = () => {
  saveNow();
  const d = new Date();
  const txt = JSON.stringify(bkObj());
  const name = `michimiru-kiroku-${ymdNum(d)}.json`;
  // 版20：アプリ版はダウンロードが使えないので、Documents フォルダーに保存する
  if (typeof nativeSaveFile === 'function' && nativeSaveFile(name, txt)) { lsSet('walk_bk_last', String(Date.now())); updBkLast(); return; }
  const blob = new Blob([txt], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  lsSet('walk_bk_last', String(Date.now())); updBkLast();
  status('全部まとめて書き出しました（ダウンロードフォルダを確認してください）');
};
// 書き出したファイルを読み解く（版5のまとめた形、版4の {tracks, stamps}、それより前の記録だけの形）
function parseBackup(txt) {
  const o = JSON.parse(txt);
  if (Array.isArray(o)) return {tracks: o};
  if (o && o.app === 'MichiMiru' && o.data) return Object.assign({t: o.t}, o.data);
  if (o && Array.isArray(o.tracks)) return {tracks: o.tracks, stamps: o.stamps};
  throw new Error('MichiMiru の書き出したファイルではありません');
}
// 読み込む前の要約（今の記録は消さずに足し合わせる）
function backupPlan(b, name) {
  const have = new Set(tracks.filter(t => t.pts && t.pts.length).map(trackKey));
  const tr = (b.tracks || []).filter(t => t && Array.isArray(t.pts) && t.pts.length >= 2);
  const newTr = tr.filter(t => !have.has(trackKey(t))).length;
  const st = b.stamps && typeof b.stamps === 'object' ? Object.keys(b.stamps) : [];
  const newSt = st.filter(k => !stamps[k]).length;
  const fv = Array.isArray(b.favs) ? b.favs.filter(x => x && x.name && Array.isArray(x.p)) : [];
  const newFv = fv.filter(x => !favs.some(f => favSame(f, x))).length;
  const md = b.meshdone && typeof b.meshdone === 'object' ? Object.keys(b.meshdone) : [];
  const newMd = md.filter(k => !meshDone[k]).length;
  const set = b.set || {};
  const fill = BK_SET.filter(k => set[k] !== undefined && getLS(k) === null).length + (set.walk_tokaido_from !== undefined && getLS('walk_tokaido_from') === null ? 1 : 0);
  const when = b.t ? `（書き出し ${ymd(b.t).replace(/-/g, '/')}）` : '';
  return `「${name}」${when}：記録 ${tr.length}本（うち新しい分 ${newTr}本）、スタンプ ${st.length}か所（新しい場所 ${newSt}）` +
    (b.favs ? `、お気に入り ${fv.length}件（新しい分 ${newFv}件）` : '') + (md.length ? `、完全制覇のマス ${md.length}個（新しい分 ${newMd}個）` : '') + (b.set ? `、設定 ${fill}項目（この端末でまだ決めていない分だけ）` : '') +
    '。今の記録は消さずに足し合わせます。';
}
function applyBackup(b) {
  const have = new Set(tracks.filter(t => t.pts && t.pts.length).map(trackKey));
  let n = 0;
  (b.tracks || []).forEach(t => {
    if (!t || !Array.isArray(t.pts) || t.pts.length < 2 || have.has(trackKey(t))) return;
    const o = {k: t.k === 'veh' ? 'veh' : 'walk', t0: t.t0, src: t.src, pts: t.pts};
    if (typeof t.t1 === 'number') o.t1 = t.t1;
    if (typeof t.kcal === 'number') o.kcal = t.kcal;
    if (t.mode === 'train' || t.mode === 'car') o.mode = t.mode;
    if (Array.isArray(t.ts) && t.ts.length === t.pts.length) o.ts = t.ts; // 版21：各点の時刻
    if (typeof t.ses === 'number') o.ses = t.ses;
    tracks.push(o); have.add(trackKey(t)); n++;
  });
  // スタンプ帳も合わせる（行った日は両方の分を足す）
  if (b.stamps && typeof b.stamps === 'object') {
    Object.entries(b.stamps).forEach(([k, s]) => {
      if (!s || !Array.isArray(s.days)) return;
      const m = stamps[k];
      if (!m) stamps[k] = s;
      else { m.first = Math.min(m.first, s.first); s.days.forEach(d => { if (!m.days.includes(d)) m.days.push(d); }); }
    });
    saveStamps(); drawStampList();
  }
  // お気に入りは、名前と場所が同じものを除いて足す
  if (Array.isArray(b.favs)) {
    b.favs.forEach(x => { if (x && x.name && Array.isArray(x.p) && !favs.some(f => favSame(f, x))) favs.push({name: x.name, p: x.p}); });
    saveFavs();
  }
  // 完全制覇のマスは、早い日付を残して合わせる
  if (b.meshdone && typeof b.meshdone === 'object') {
    Object.entries(b.meshdone).forEach(([k, t]) => { if (typeof t === 'number' && (!meshDone[k] || t < meshDone[k])) meshDone[k] = t; });
    saveMeshDone();
  }
  // 体重・設定・東海道は、この端末でまだ決めていない項目だけ埋める
  const set = b.set || {};
  BK_SET.forEach(k => { if (set[k] !== undefined && getLS(k) === null) lsSet(k, String(set[k])); });
  if (getLS('walk_tokaido_from') === null) {
    if (set.walk_tokaido_from !== undefined) lsSet('walk_tokaido_from', String(set.walk_tokaido_from));
    // 進み具合は大きいほうに合わせる（読み込んだ記録の分で「宿場に着いた」の知らせが続けて出ないように）
    if (set.walk_tokaido_last !== undefined) lsSet('walk_tokaido_last', String(Math.max(Number(getLS('walk_tokaido_last')) || 0, Number(set.walk_tokaido_last) || 0)));
  }
  $('weight').value = getLS('walk_weight') || '60';
  loadFlags(); if (!CAN_VIB) $('vibChk').checked = false;
  return n;
}
// 書き出したファイルは、要約を見せて「読み込む」を押したら反映する（複数あれば1つずつ）
const impQueue = [];
function showImport() {
  if (!impQueue.length) { $('impBox').style.display = 'none'; return; }
  $('impText').textContent = backupPlan(impQueue[0].b, impQueue[0].name);
  $('impBox').style.display = 'block';
}
$('impOk').onclick = () => {
  const q = impQueue.shift(); if (!q) return;
  const n = applyBackup(q.b);
  saveTracks(); afterTracksChanged();
  status(`「${q.name}」を読み込みました（新しい記録 ${n}本）`);
  showImport();
};
$('impNo').onclick = () => { const q = impQueue.shift(); if (q) status(`「${q.name}」の読み込みをやめました`); showImport(); };
$('recImport').onclick = () => $('recFile').click();
$('recFile').onchange = async () => {
  const files = [...$('recFile').files]; $('recFile').value = '';
  if (!files.length) return;
  status('記録を読み込み中…'); await pause();
  let added = 0, replaced = 0, bad = 0, dup = 0, gpx = 0;
  for (const f of files) {
    try {
      const txt = await f.text();
      if (/^\s*[\[{]/.test(txt)) {
        let b; try { b = parseBackup(txt); } catch (e) { throw new Error(e instanceof SyntaxError ? '読み込めない形式です' : e.message); }
        impQueue.push({b, name: f.name}); continue;
      }
      const segs = parseGpx(txt); gpx++;
      const before = tracks.length;
      // 同じ GPX を読み込み直しても、電車・車を手で直した分は残す
      const kept = new Map(tracks.filter(t => t.src === f.name && t.mode).map(t => [t.t0 + '|' + t.k, t.mode]));
      tracks = tracks.filter(t => t.src !== f.name);
      if (tracks.length < before) replaced++;
      // OpenTracksはGPSが途切れると区切り（trkseg）を分けるので、1本につなげてから判定する
      const all = segs.flat();
      if (all.length >= 2) {
        const o = processSeg(all, f.name);
        o.forEach(t => { const m = kept.get(t.t0 + '|' + t.k); if (m) t.mode = m; });
        dup += dropDup(o); tracks.push(...o); added += o.length;
      }
    } catch (e) { bad++; showErr(`${f.name}：${jaErr(e)}`); }
  }
  if (gpx) {
    saveTracks(); afterTracksChanged();
    status(`読み込み完了：GPX ${gpx}ファイル（区間 ${added}件${replaced ? `、${replaced}ファイルは前回分を置き換え` : ''}${dup ? `、同じ時間のアプリの記録${dup}件を削除` : ''}）`);
  } else if (!impQueue.length) status('読み込めるファイルがありませんでした');
  if (impQueue.length) { status('書き出したファイルの中身を確かめて、「読み込む」を押してください'); showImport(); }
};
twoStep($('recClear'), '記録をすべて消す', () => {
  tracks = []; saveTracks(); afterTracksChanged(); status('記録をすべて消しました');
});
