// MichiMiru：版20 Android アプリ版（Capacitor）で開いたときだけ動く部分
// ・歩いている間は「裏の記録」（BackgroundGeolocation）で位置を受け取り、いつもの記録（walkStep）に入れる
//   → 画面を消してポケットに入れても記録が続く。記録中は通知欄に「MichiMiru 記録中」
// ・書き出しはスマホの「Documents（ドキュメント）」フォルダーに保存（アプリの中ではダウンロードが使えないため）
// ブラウザ（Chrome）で開いたときは何もしない
const CAP = window.Capacitor;
const IN_APP = /MichiMiruApp/.test(navigator.userAgent);   // アプリ版の目印（app/build.mjs の appendUserAgent）
const NATIVE = (() => { try { return !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform()); } catch (e) { return false; } })();
const BG = {id: null, on: false, err: '', n: 0, saved: 0, last: 0, tries: 0, starting: false};
function capHas(name) { try { return !!(CAP && (CAP.PluginHeaders || []).some(h => h.name === name)); } catch (e) { return false; } }
const BG_OK = NATIVE && capHas('BackgroundGeolocation');

// 通知の許可（Android 13 から必要。断られても記録は続くが、「記録中」の通知が見えなくなる）
async function bgNotifPerm() {
  if (!capHas('LocalNotifications')) return;
  try {
    const s = await CAP.nativePromise('LocalNotifications', 'checkPermissions', {});
    if (s && s.display === 'granted') return;
    await CAP.nativePromise('LocalNotifications', 'requestPermissions', {});
  } catch (e) {}
}
async function bgStart() {
  if (!BG_OK || BG.id || BG.starting || !walk) return;
  BG.starting = true;
  await bgNotifPerm();
  BG.starting = false;
  if (!walk || BG.id) return;
  BG.err = ''; BG.tries++; BG.n = 0;
  BG.id = CAP.nativeCallback('BackgroundGeolocation', 'addWatcher', {
    backgroundTitle: 'MichiMiru 記録中',
    backgroundMessage: '画面を消しても、歩いた道を記録しています',
    requestPermissions: true, stale: false, distanceFilter: 10   // 10m 動くごとに1点
  }, bgOnLoc);
  BG.on = !!BG.id;
  if (BG.on && walk) { walk.note = '📡 画面を消しても記録が続きます（通知欄に「記録中」）'; walk.noteUntil = Date.now() + 20000; renderHud(); }
  appCard();
}
function bgStop() {
  const id = BG.id;
  BG.id = null; BG.on = false;
  if (id) { try { CAP.nativePromise('BackgroundGeolocation', 'removeWatcher', {id}).catch(() => {}); } catch (e) {} }
  appCard();
}
function bgOnLoc(loc, err) {
  if (err) {
    const msg = String(err.message || err.code || err);
    const id = BG.id; BG.id = null; BG.on = false;
    if (id) { try { CAP.nativePromise('BackgroundGeolocation', 'removeWatcher', {id}).catch(() => {}); } catch (e) {} }
    // 起動した直後は裏の記録の準備ができていないことがあるので、少し待ってやり直す
    if (/Service not running/i.test(msg) && BG.tries < 6) { setTimeout(bgStart, 1500); return; }
    BG.err = err.code === 'NOT_AUTHORIZED' ? '位置情報が許可されていないため、画面を消すと記録が止まります（設定の「📱 アプリ版」から許可できます）'
      : '裏の記録を始められませんでした（' + msg + '）。画面をつけている間は、いつも通り記録します';
    if (walk) { walk.msg = BG.err; walk.msgErr = true; walk.msgUntil = Date.now() + 30000; renderHud(); }
    appCard();
    return;
  }
  if (!loc || !walk) return;
  BG.n++; BG.last = Date.now();
  // いつもの現在地の流れ（onPos）に渡す。bg の印があるものだけを記録に使う（画面をつけている間の二重を防ぐ）
  onPos({coords: {longitude: loc.longitude, latitude: loc.latitude, accuracy: loc.accuracy == null ? 999 : loc.accuracy,
    heading: loc.bearing, speed: loc.speed == null ? null : loc.speed}, timestamp: loc.time || Date.now(), bg: true});
  // 画面を消している間はタイマーが遅れるので、ここで保存しておく（30秒ごとか20点ごと）
  if (Date.now() - BG.saved > 30000 || BG.n % 20 === 0) { BG.saved = Date.now(); saveTracks(); saveSession(); }
  if (BG.n % 20 === 0 && document.visibilityState === 'visible') appCard();
}

// ---------- 設定タブの「📱」のカード：アプリ版のときは状態と設定へのボタン ----------
function appCard() {
  if (!IN_APP) return;
  const st = $('appState'), btn = $('appAdd'), how = $('appHow');
  $('appHead').firstChild.textContent = '📱 アプリ版（Android）';
  btn.style.display = 'none';
  let h;
  if (!BG_OK) h = '<b style="color:#c0392b">⚠ アプリ版ですが、裏の記録の部品が見つかりません。</b>画面をつけている間だけ記録します。アプリを入れ直してみてください';
  else if (BG.on) h = `📱 アプリ版で起動中・<b style="color:#1e7e34">画面を消しても記録中</b>（受け取った位置 ${BG.n} 回）`;
  else if (BG.err) h = `📱 アプリ版で起動中<br><span style="color:#c0392b">${esc(BG.err)}</span>`;
  else h = '📱 アプリ版で起動中・歩き始めると、画面を消しても記録が続きます';
  st.innerHTML = h;
  how.style.display = 'block';
  how.innerHTML = '記録が途中で止まるときは、下のボタンでアプリの設定を開き、<b>「位置情報」を「アプリの使用中のみ許可」以上（正確な位置：オン）</b>、<b>「電池」（バッテリー）を「制限なし」</b>にしてください。' +
    (BG_OK ? '<div class="acts" style="margin-top:6px"><button id="appSet">⚙️ アプリの設定を開く</button></div>' : '');
  const b = $('appSet');
  if (b) b.onclick = () => { try { CAP.nativePromise('BackgroundGeolocation', 'openSettings', {}).catch(() => {}); } catch (e) {} };
}

// ---------- 書き出し：アプリ版は Documents フォルダーへ ----------
// 成功したら true（walk.js の書き出しから呼ぶ）。ブラウザでは false を返していつものダウンロード
function nativeSaveFile(name, text) {
  if (!NATIVE || !capHas('Filesystem')) return false;
  CAP.nativePromise('Filesystem', 'writeFile', {path: name, data: text, directory: 'DOCUMENTS', encoding: 'utf8', recursive: true})
    .then(() => status(`全部まとめて書き出しました（スマホの「Documents」フォルダーの ${name}）`))
    .catch(e => showErr('書き出しに失敗しました（' + jaErr(e) + '）'));
  return true;
}

if (IN_APP) {
  appCard();
  if (walk) bgStart();   // 開き直して歩行を続きから再開したとき（restoreSession は先に動いている）
  setInterval(() => { if (BG.on && document.visibilityState === 'visible') appCard(); }, 10000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') appCard(); });
}
