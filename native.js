// MichiMiru：版20〜 Android アプリ版（Capacitor）で開いたときだけ動く部分
// 版21：MeguMiru を重ねて開く・戻るボタン。版22：TenMiru・YamaMiru も重ねて開く、スマホの通知（ISS の予約・散歩中の上空の見張り）
// 版23：重ねて開いている間の「戻る帯」（画面の上）、地図の右の ▦ にまとめた、MeguMiru に MichiMiru の位置を渡す
// 版24：▦ の枠と戻る帯に、それぞれのアプリの版（GitHub に新しい版が出ていれば知らせる）
// 版30：通知の種類（チャンネル）を2つ作る＝「曲がり角の案内」「散歩中の知らせ」（振動あり・目立つ）。画面を消している間の曲がり角は振動つきの通知で
// 版27：散歩中に MeguMiru の「近くのまだ行っていない場所」も通知（meguNearCheck）、版の「今すぐ入れる」
// 版25：散歩中に知らせた飛行機を walk_skylog に残す（散歩のまとめに出す）。版23 の fmtDist（base.js と同じ名前）を外した
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
  // 画面を消している間はタイマーが遅れるので、ここで保存しておく（30秒ごとか50点ごと）
  if (Date.now() - BG.saved > 30000 || BG.n % 50 === 0) { BG.saved = Date.now(); saveTracks(); saveSession(); }
  if (BG.n % 20 === 0 && document.visibilityState === 'visible') appCard();
  skyCheck(); // 版22：散歩中の上空の見張り（間隔は skyEvery）
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
// 版21：done(ok, 文) を渡すと、結果をそちらに知らせる（重ねて開いたアプリの書き出しが使う）
// 版22：data が文字でなく画像などのまとまり（Blob）なら、そのまま（バイナリで）保存する（TenMiru のシェアカードの画像など）
function nativeSaveFile(name, data, done) {
  if (!NATIVE || !capHas('Filesystem')) return false;
  const ok = () => { const m = `書き出しました（スマホの「Documents」フォルダーの ${name}）`; if (done) done(true, m); else status('全部まとめて' + m); };
  const ng = e => { const m = '書き出しに失敗しました（' + jaErr(e) + '）'; if (done) done(false, m); else showErr(m); };
  if (typeof data === 'string') {
    CAP.nativePromise('Filesystem', 'writeFile', {path: name, data, directory: 'DOCUMENTS', encoding: 'utf8', recursive: true}).then(ok, ng);
    return true;
  }
  const rd = new FileReader();
  rd.onload = () => {
    const b64 = String(rd.result).replace(/^data:[^,]*,/, '');
    CAP.nativePromise('Filesystem', 'writeFile', {path: name, data: b64, directory: 'DOCUMENTS', recursive: true}).then(ok, ng);
  };
  rd.onerror = () => ng(rd.error || new Error('読み取れませんでした'));
  try { rd.readAsDataURL(data); } catch (e) { ng(e); }
  return true;
}

// ---------- 版21・22：ほかのアプリを MichiMiru の上に重ねて開く（アプリ版だけ） ----------
// 画面を切り替えると MichiMiru が止まって裏の記録が途切れるので、MichiMiru はそのままで上に重ねる（iframe）。
// 同じアドレス（nhori-navi.github.io）なので、置き場も共通。戻るのは、それぞれの「🚶」かスマホの「戻る」
// keep：閉じても残して裏で動かす（MeguMiru は集め続ける）。TenMiru・YamaMiru は閉じたら止める（カメラ・通信・電池）
const OV = {
  megu: {vf: 'js/base.js', vr: /APP_VER *= *(\d+)/, vv: 'APP_VER', vp: '版', path: '../megu/', btn: 'Megu', icon: '🗾', sub: '行った場所を集める', title: 'MeguMiru', color: '#7a5c8e', bg: '#f6f3f8', keep: true},
  sora: {vf: 'index.html', vr: /SORA_V *= *(\d+)/, vv: 'SORA_V', vp: 'v', path: '../sora/', btn: 'Ten', icon: '✈️', sub: '見上げた空の飛行機・星', title: 'TenMiru', color: '#1f6fd1', bg: '#eef3fb', keep: false},
  yama: {vf: 'index.html', vr: /YAMA_V *= *(\d+)/, vv: 'YAMA_V', vp: '版', path: '../yama/', btn: 'Yama', icon: '🏔', sub: '見えている山の名前', title: 'YamaMiru', color: '#2e7d32', bg: '#f3f7f1', keep: false}
};
const ovFrames = {};
let ovCur = '';
function ovStyle() {
  if ($('ovStyle')) return;
  const st = document.createElement('style'); st.id = 'ovStyle';
  // 版23：重ねたアプリは「戻る帯」（#ovStrip、高さ32px）の下に置く。帯は MichiMiru の部品なので、どのアプリのどのタブでも見える
  st.textContent = ':root{--ovs:calc(32px + env(safe-area-inset-top,0px))}' +
    '.ovFrame{position:fixed;left:0;top:var(--ovs);width:100%;height:calc(100% - var(--ovs));border:0;z-index:9000;display:none}.ovFrame.on{display:block}' +
    '#ovStrip{position:fixed;left:0;right:0;top:0;margin:0;border-radius:0;height:var(--ovs);padding:env(safe-area-inset-top,0px) 10px 0;box-sizing:border-box;z-index:9001;display:none;align-items:center;gap:8px;' +
    'background:#1e7e34;color:#fff;font-size:14px;font-weight:bold;border:0;width:100%;text-align:left;box-shadow:0 1px 4px rgba(0,0,0,.3)}' +
    'body.ov-on #ovStrip{display:flex}#ovStrip .bk{white-space:nowrap}#ovStrip .st{margin-left:auto;font-weight:normal;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#appsBox{display:none;position:absolute;right:62px;z-index:5;width:250px;background:#fff;border-radius:14px;padding:6px;box-shadow:0 2px 12px rgba(0,0,0,.3)}#appsBox.on{display:block}' +
    '#appsBox button{display:flex;align-items:center;gap:10px;width:100%;margin:0;padding:8px 10px;min-height:54px;border:0;border-left:6px solid var(--c);border-radius:10px;background:transparent;text-align:left;color:#1d2b22}' +
    '#appsBox button+button{margin-top:4px}#appsBox .ic{font-size:26px}#appsBox b{display:block;font-size:16px}#appsBox small{display:block;font-size:12px;color:#5b6b61}' +
    'body.dark #appsBox{background:#28322e;box-shadow:0 4px 18px rgba(0,0,0,.6)}body.dark #appsBox button{color:#f1f5f2}body.dark #appsBox small{color:#c9d3cd}' +
    'body.mode-tk #appsBox,body.mode-tabi #appsBox{display:none}' +
    '#appsBox .vr{margin-left:auto;align-self:flex-start;font-size:12px;color:#7a867f;white-space:nowrap;padding-top:3px}#appsBox .nw{display:block;font-size:12px;color:#d35400;font-weight:bold}' +
    '#appsVer{font-size:12px;color:#7a867f;padding:6px 10px 2px;border-top:1px solid #e3e8e5;margin-top:4px}body.dark #appsVer{border-color:#3d4a44;color:#aab6af}body.dark #appsBox .vr{color:#aab6af}body.dark #appsBox .nw{color:#ffb347}' +
    '#ovStrip .sv{font-size:11px;font-weight:normal;opacity:.75;white-space:nowrap}' +
    '#appsBox .vgo{display:inline-block;margin-left:4px;padding:2px 8px;border-radius:10px;background:#d35400;color:#fff;font-size:12px;font-weight:bold}#appsVer .nw2{color:#d35400;font-weight:bold}body.dark #appsVer .nw2{color:#ffb347}';
  document.head.appendChild(st);
}
function ovOpen(id) {
  const o = OV[id]; if (!o) return;
  ovStyle();
  const swap = !!(ovCur && ovCur !== id);
  if (swap) ovClose(false, true);
  let f = ovFrames[id];
  if (!f) {
    f = document.createElement('iframe');
    f.className = 'ovFrame'; f.title = o.title; f.style.background = o.bg;
    f.allow = 'geolocation; camera; screen-wake-lock; accelerometer; gyroscope; magnetometer; fullscreen';
    f.src = new URL(o.path, location.href).href + '?inapp=1' + (VER.bust[id] ? '&r=' + VER.bust[id] : '');
    f.addEventListener('load', () => { verRun(id); setTimeout(() => verRun(id), 3000); });
    document.body.appendChild(f); ovFrames[id] = f;
  }
  if (ovCur === id) return;
  ovCur = id; f.classList.add('on');
  document.body.classList.add('ov-on'); if (id === 'megu') document.body.classList.add('megu-on');
  appsClose(); stripUpd();
  try { if (swap && history.state && history.state.mmOv) history.replaceState({mmOv: id}, ''); else history.pushState({mmOv: id}, ''); } catch (e) {}
  lsSet('walk_ov', id);
}
// fromBack：スマホの「戻る」で閉じた（履歴はもう戻っている）。swap：別のアプリに切り替える途中
function ovClose(fromBack, swap) {
  const id = ovCur; if (!id) return;
  const f = ovFrames[id];
  ovCur = '';
  if (f) {
    f.classList.remove('on');
    if (!OV[id].keep) { try { f.src = 'about:blank'; } catch (e) {} f.remove(); delete ovFrames[id]; } // 止める
  }
  document.body.classList.remove('ov-on', 'megu-on');
  if (!swap) lsSet('walk_ov', '');
  if (!fromBack && !swap && history.state && history.state.mmOv) { try { history.back(); } catch (e) {} }
  try { map.resize(); } catch (e) {}
}
// 重ねたアプリの「🚶」から呼ぶ（MeguMiru 版16 は meguClose を呼ぶ）
window.miruClose = () => ovClose(false);
window.miruOvCur = () => ovCur; // 版27：MeguMiru（版19〜）が、自分が見えているかを知る（見えていないときの近くの知らせは MichiMiru の通知に任せる）
window.meguClose = window.miruClose;

// ---------- 版23：戻る帯（重ねて開いている間だけ、画面のいちばん上） ----------
// 重ねたアプリ（MeguMiru 版17・TenMiru v41・YamaMiru 版13）は miruStrip を見て、自分の 🚶 を出さない
window.miruStrip = true;
function fmtDur(ms) { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? m + '分' : Math.floor(m / 60) + '時間' + (m % 60 ? (m % 60) + '分' : ''); }
function stripUpd() {
  let s = $('ovStrip');
  if (!s) {
    s = document.createElement('button'); s.id = 'ovStrip'; s.type = 'button'; s.title = 'MichiMiru に戻る';
    s.innerHTML = '<span class="bk">◀ MichiMiru に戻る</span><span class="sv"></span><span class="st"></span>';
    s.onclick = () => ovClose(false);
    document.body.appendChild(s);
  }
  const vr = ovCur && verGet()[ovCur]; s.querySelector('.sv').textContent = vr ? verFmt(ovCur, vr) : '';
  s.querySelector('.st').textContent = !walk ? '記録していません'
    : walk.vt ? `🚃 乗り物で移動中・${fmtDur(Date.now() - walk.t0)}`
    : `● 記録中 ${fmtDist(walk.dist || 0)}・${fmtDur(Date.now() - walk.t0)}`;
}
setInterval(() => { if (ovCur) stripUpd(); }, 5000);

// ---------- 版23：重ねたアプリに MichiMiru の位置を渡す（MeguMiru 版17 が使う。GPS を二重に使わない） ----------
// 画面をつけている間はブラウザの位置を渡す。裏の記録の位置（画面を消している間）は、ブラウザの位置が15秒来ていないときだけ渡す（同じ位置を二重に渡さない）
const POSL = []; let posFwdAt = 0;
window.miruPosOn = cb => { if (typeof cb === 'function' && !POSL.includes(cb)) POSL.push(cb); };
function ovPos(p) {
  if (!POSL.length || !p || !p.coords) return;
  const now = Date.now();
  if (p.bg && now - posFwdAt < 15000) return;
  if (!p.bg) posFwdAt = now;
  const c = p.coords;
  const q = {coords: {longitude: c.longitude, latitude: c.latitude, accuracy: c.accuracy, altitude: c.altitude == null ? null : c.altitude,
    heading: c.heading == null ? null : c.heading, speed: c.speed == null ? null : c.speed}, timestamp: p.timestamp || now};
  for (let i = POSL.length - 1; i >= 0; i--) { try { POSL[i](q); } catch (e) { POSL.splice(i, 1); } } // 消えた画面の分は外す
}

// ---------- 版24：それぞれのアプリの版 ----------
// 動いている版：重ねて開いたときに、そのアプリの画面から読み取って walk_appver に覚える（開いたことのないアプリは分からない）
// GitHub の版：▦ を開いたときに（5分に1回まで）それぞれのファイルを取って読む。動いている版より新しければ知らせる
const VER = {latest: {}, at: 0, bust: {}};
const verGet = () => { try { return JSON.parse(getLS('walk_appver') || '{}') || {}; } catch (e) { return {}; } };
const verFmt = (id, n) => (id === 'walk' ? '版' : OV[id].vp) + n;
function verRun(id) {
  try {
    const w = ovFrames[id] && ovFrames[id].contentWindow; if (!w) return;
    const n = Number(w.eval(`typeof ${OV[id].vv} !== 'undefined' ? ${OV[id].vv} : 0`));
    if (n > 0) { const v = verGet(); if (v[id] !== n) { v[id] = n; lsSet('walk_appver', JSON.stringify(v)); } if (ovCur === id) stripUpd(); }
  } catch (e) {}
}
async function verLatest() {
  if (Date.now() - VER.at < 300000) return;
  VER.at = Date.now();
  const get = async (url, re) => { try { const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'vchk=' + Date.now(), {cache: 'no-store'}); if (!r.ok) return 0; const m = re.exec(await r.text()); return m ? Number(m[1]) : 0; } catch (e) { return 0; } };
  const jobs = Object.entries(OV).map(async ([k, o]) => { VER.latest[k] = await get(new URL(o.path + o.vf, location.href).href, o.vr); });
  jobs.push(get(new URL('config.js', location.href).href, /APP_VER *= *(\d+)/).then(n => { VER.latest.walk = n; }));
  await Promise.all(jobs);
}
function verShow() {
  const v = verGet();
  Object.keys(OV).forEach(k => {
    const run = v[k] || 0, lat = VER.latest[k] || 0, e = $('vr_' + k), nw = $('nw_' + k);
    if (e) e.textContent = run ? verFmt(k, run) : lat ? verFmt(k, lat) : '';
    if (nw) {
      nw.innerHTML = run && lat > run ? `${verFmt(k, lat)} が出ています <span class="vgo" data-v="${k}" role="button">今すぐ入れる</span>` : '';
      nw.style.display = nw.innerHTML ? '' : 'none';
    }
  });
  const av = $('appsVer');
  if (av) av.innerHTML = `MichiMiru ${verFmt('walk', APP_VER)}` + ((VER.latest.walk || 0) > APP_VER ? `　<span class="nw2">${verFmt('walk', VER.latest.walk)} が出ています</span> <span class="vgo" data-v="walk" role="button">今すぐ入れる</span>` : '');
  document.querySelectorAll('#appsBox .vgo').forEach(b => b.onclick = e => { e.stopPropagation(); e.preventDefault(); verBust(b.dataset.v); });
}
// 版27：今すぐ入れる。読み込むアドレスに印（r=時刻）を付けて、スマホにしまってある古いファイルを使わずに読み直す
function verBust(id) {
  if (id === 'walk') {
    if (walk) saveNow(); // 歩いている途中でも、開き直すと続きから（30分以内）
    status('新しい版を読み込んでいます…');
    location.replace(location.pathname + '?r=' + Date.now());
    return;
  }
  VER.bust[id] = Date.now(); VER.at = 0;
  const f = ovFrames[id];
  if (f) { if (ovCur === id) ovClose(false, true); try { f.src = 'about:blank'; } catch (e) {} f.remove(); delete ovFrames[id]; }
  ovOpen(id);
}

// ---------- 版23：地図の右の ▦（重ねて開くアプリをまとめた） ----------
function appsClose() { const bx = $('appsBox'); if (bx) bx.classList.remove('on'); const b = $('mApps'); if (b) b.classList.remove('on'); }
function appsSetup() {
  const b = document.createElement('button'); b.id = 'mApps'; b.title = 'ほかのアプリを重ねて開く'; b.textContent = '▦';
  $('mapBtns').appendChild(b);
  const bx = document.createElement('div'); bx.id = 'appsBox';
  bx.innerHTML = Object.entries(OV).map(([k, o]) => `<button id="ov_${k}" type="button" style="--c:${o.color}"><span class="ic">${o.icon}</span><span><b>${o.title}</b><small>${o.sub}</small><span class="nw" id="nw_${k}" style="display:none"></span></span><span class="vr" id="vr_${k}"></span></button>`).join('') +
    '<div id="appsVer"></div>';
  $('mapBtns').parentNode.appendChild(bx);
  Object.keys(OV).forEach(k => { $('ov_' + k).onclick = e => { e.stopPropagation(); ovOpen(k); }; });
  b.onclick = e => {
    e.stopPropagation();
    const open = !bx.classList.contains('on');
    if (open) {
      const lb = $('layerBox'); if (lb) { lb.classList.remove('on'); const ml = $('mLayer'); if (ml) ml.classList.remove('on'); }
    }
    bx.classList.toggle('on', open); b.classList.toggle('on', open);
    // 枠の下の端を ▦ の下の端にそろえて、上に向かって開く（下のパネルに重ならないように）
    const place = () => { bx.style.top = Math.max(8, $('mapBtns').offsetTop + b.offsetTop + b.offsetHeight - bx.offsetHeight) + 'px'; };
    if (open) { verShow(); place(); verLatest().then(() => { verShow(); place(); }); }
  };
  document.addEventListener('pointerdown', e => { if (bx.classList.contains('on') && !bx.contains(e.target) && e.target !== b) appsClose(); }, true);
}
window.addEventListener('popstate', () => { if (ovCur && !(history.state && history.state.mmOv === ovCur)) ovClose(true); });
// スマホの「戻る」（アプリの部品 App があるときだけ。ないときはアプリが裏に回るだけ）
function backSetup() {
  if (!capHas('App')) return;
  try {
    CAP.addListener('App', 'backButton', d => {
      if (d && d.canGoBack) history.back();        // ヘルプ・重ねたアプリの中の画面・重ねたアプリを順に閉じる
      else CAP.nativePromise('App', 'minimizeApp', {}).catch(() => {}); // いちばん上の画面なら、アプリを裏に回す（記録は続く）
    });
  } catch (e) {}
}

// ---------- 版22：スマホの通知（LocalNotifications） ----------
// ・ISS：TenMiru が計算した「見える通過」を、時刻を決めて予約する（アプリを閉じていても、画面を消していても出る）
// ・散歩中（MichiMiru で記録中）は、TenMiru の通知の設定（軍用機・真上通過・範囲）に従って上空を見張り、通知で知らせる
// 通知を押すと、アプリが開いて TenMiru を重ねて開く
const NT = {ok: NATIVE && capHas('LocalNotifications'), seq: 0, exact: null};
const NT_ISS = 7000, NT_ISS_N = 10, NT_NOW = 7100;
const DIR8 = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
const dir8 = d => DIR8[Math.round((((d % 360) + 360) % 360) / 45) % 8];
const hhmm = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const mdw = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`; };
function lsj(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
// いますぐ出す通知（exact の許可は要らないので isExactNotification:false）
// 版30：通知の種類。Android は種類ごとに「振動する・目立つ（画面の上に出る）」を決める（一度作ると、あとはスマホの設定で変えられる）
const NT_CH = {turn: 'miru_turn', walk: 'miru_walk'};
let ntChReady = null;
function ntChannels() {
  if (!NT.ok) return Promise.resolve(false);
  if (!ntChReady) ntChReady = Promise.all([
    CAP.nativePromise('LocalNotifications', 'createChannel', {id: NT_CH.turn, name: '曲がり角の案内', description: '歩いているとき、画面を消していても曲がり角の手前で振動して知らせます', importance: 4, visibility: 1, vibration: true}),
    CAP.nativePromise('LocalNotifications', 'createChannel', {id: NT_CH.walk, name: '散歩中の知らせ', description: '飛行機・宇宙ステーション・近くのまだ行っていない場所', importance: 4, visibility: 1, vibration: true})
  ]).then(() => true, () => false);
  return ntChReady;
}
// ch：'walk'（初め）か 'turn'。id を渡すと、同じ id の前の通知を置き換える
function ntNow(title, body, extra, ch, id) {
  if (!NT.ok) return false;
  id = id || NT_NOW + (NT.seq++ % 800);
  ntChannels().then(ok => CAP.nativePromise('LocalNotifications', 'schedule', {notifications: [Object.assign({id, title, body, smallIcon: 'ic_tracking', iconColor: '#2fbf71',
    isExactNotification: false, extra: extra || {}}, ok ? {channelId: NT_CH[ch || 'walk']} : {})]})).catch(() => {});
  return true;
}
// 版30：曲がり角の案内を通知で（画面を消しているときだけ。walk.js の maybeVibrate から）
const NT_TURN = 7950;
function ntTurn(title, body) { return ntNow(title, body, {}, 'turn', NT_TURN); }
async function ntExact() {
  try { const s = await CAP.nativePromise('LocalNotifications', 'checkExactNotificationSetting', {}); NT.exact = !!(s && s.exact_alarm === 'granted'); }
  catch (e) { NT.exact = false; }
  return NT.exact;
}
// TenMiru から呼ぶ：passes＝[{s:始まり, e:終わり, max:最大の高さ, from:'南西', to:'北東'}]。前の予約を消して入れ直す
let issSig = '';
async function miruIssSchedule(passes) {
  if (!NT.ok || !Array.isArray(passes)) return false;
  const exact = await ntExact(), lead = exact ? 5 : 10;   // 正確な時刻の許可がないときは、ずれてもよいよう10分前
  const now = Date.now();
  const list = passes.filter(p => p && p.s - lead * 60000 > now + 30000).slice(0, NT_ISS_N);
  const sig = exact + '|' + list.map(p => Math.round(p.s / 60000)).join(',');
  if (sig === issSig) return true;
  issSig = sig;
  await bgNotifPerm();
  try { await CAP.nativePromise('LocalNotifications', 'cancel', {notifications: Array.from({length: NT_ISS_N}, (_, i) => ({id: NT_ISS + i}))}); } catch (e) {}
  if (list.length) {
    const chOk = await ntChannels(); // 版30：散歩中の知らせの種類（振動あり）
    try {
      await CAP.nativePromise('LocalNotifications', 'schedule', {notifications: list.map((p, i) => ({
        id: NT_ISS + i, title: `🛰 ${lead}分後に宇宙ステーションが見えます`,
        body: `${hhmm(p.s)}から ${p.from}の空 → ${p.to}へ（最大の高さ ${Math.round(p.max)}°）`,
        schedule: {at: new Date(p.s - lead * 60000).toISOString(), allowWhileIdle: true},
        isExactNotification: exact, smallIcon: 'ic_tracking', iconColor: '#2fbf71', extra: {ov: 'sora'}, ...(chOk ? {channelId: NT_CH.walk} : {})}))});
    } catch (e) { issSig = ''; return false; }
  }
  lsSet('walk_iss_sched', JSON.stringify({t: now, n: list.length, next: list[0] ? list[0].s : 0, exact}));
  appCard();
  return true;
}
window.miruIssSchedule = miruIssSchedule;

// 散歩中の上空の見張り（TenMiru の中継・機種の名前・通知の設定を使う）
const SKY = {cfg: null, busy: false, last: 0, sent: new Set(), day: '', n: 0, err: ''};
const skyEvery = () => { const v = getLS('walk_skywatch'); return v === null ? 120 : Number(v) || 0; }; // 秒。0＝見張らない
async function skyCfg() {
  if (SKY.cfg) return SKY.cfg;
  const base = new URL('../sora/', location.href).href;
  const cfg = {relays: [], TYPE: {}};
  try {
    const t = await (await fetch(base + 'config.js', {cache: 'no-cache'})).text();
    ['RELAY', 'RELAY2'].forEach(k => { const m = t.match(new RegExp('\\b' + k + "\\s*=\\s*'([^']*)'")); if (m && /^https:\/\//.test(m[1].trim()) && !m[1].includes('〇')) cfg.relays.push(m[1].trim().replace(/\/+$/, '')); });
    cfg.relays.sort((a, b) => a.includes('script.google.com') - b.includes('script.google.com')); // Cloudflare を先に
  } catch (e) {}
  try { const t = await (await fetch(base + 'data.js')).text(); cfg.TYPE = new Function(t + '\n;return typeof TYPE === "object" ? TYPE : {};')() || {}; } catch (e) {}
  if (cfg.relays.length) SKY.cfg = cfg;
  return cfg;
}
async function skyCheck() {
  const every = skyEvery();
  if (!NT.ok || !walk || !BG.on || !pos || !every || SKY.busy) return;
  if (Date.now() - SKY.last < every * 1000) return;
  if (ovCur === 'sora' && document.visibilityState === 'visible') return; // TenMiru を開いて見ているときは TenMiru が知らせる
  const wantMil = lsj('sora_ntfMil', true) !== false, wantOver = lsj('sora_ntfOver', true) !== false;
  if (!wantMil && !wantOver) return;
  SKY.busy = true; SKY.last = Date.now();
  try {
    const c = await skyCfg();
    if (!c.relays.length) { SKY.err = 'TenMiru の中継のアドレスが読めませんでした'; return; }
    const km = Number(lsj('sora_rad', 30)) || 30, nm = Math.ceil(km / 1.852) + 1, la = pos[1].toFixed(2), lo = pos[0].toFixed(2);
    let j = null;
    for (const r of c.relays) {
      const gas = r.includes('script.google.com');
      try {
        const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 10000);
        const res = await fetch(gas ? `${r}?lat=${la}&lon=${lo}&nm=${nm}` : `${r}/ac/${la}/${lo}/${nm}`, {signal: ctl.signal}).finally(() => clearTimeout(tm));
        if (!res.ok) continue;
        const o = await res.json(); if (o && !o.error) { j = o; break; }
      } catch (e) {}
    }
    if (!j) { SKY.err = '上空のデータを取れませんでした'; return; }
    SKY.err = '';
    const now = Date.now(), day = ymd(now);
    if (SKY.day !== day) { SKY.day = day; SKY.sent.clear(); }
    const win = every / 60 + 0.5; // 次に確かめるまでの間（分）に真上付近を通るもの
    (j.ac || j.aircraft || []).forEach(a => {
      if (a.lat == null || a.lon == null || a.alt_baro === 'ground') return;
      const dt = Math.min(60, Math.max(0, a.seen_pos || 0)), tr = (a.track ?? a.true_heading ?? 0) * Math.PI / 180, gs = a.gs || 0;
      const dkm = gs * 1.852 / 3600 * dt, lat = a.lat + dkm * Math.cos(tr) / 110.57, lon = a.lon + dkm * Math.sin(tr) / (111.32 * Math.cos(a.lat * Math.PI / 180));
      const kx = 111.32 * Math.cos(pos[1] * Math.PI / 180), e = (lon - pos[0]) * kx, n = (lat - pos[1]) * 110.57, dist = Math.hypot(e, n);
      if (dist > km) return;
      const dir = Math.atan2(e, n) * 180 / Math.PI, v = gs * 1.852 / 60;
      let cpaT = null, cpaKm = null;
      if (v > 1) { const ve = v * Math.sin(tr), vn = v * Math.cos(tr), t = -(e * ve + n * vn) / (v * v), tt = Math.max(0, t); cpaT = t; cpaKm = Math.hypot(e + ve * tt, n + vn * tt); }
      const type = c.TYPE[a.t] || a.t || '機種不明', cs = (a.flight || '').trim();
      if (wantMil && (a.dbFlags & 1) && !SKY.sent.has('m' + a.hex)) {
        SKY.sent.add('m' + a.hex); SKY.n++;
        ntNow('🛩 軍用機が近くにいます', `${type}（${dir8(dir)} ${dist.toFixed(0)}km）`, {ov: 'sora'});
        skyLog('mil', cs, type);
      }
      const over = (cpaT != null && cpaT > 0 && cpaT <= win && cpaKm <= 3) || dist <= 2;
      if (wantOver && over && !SKY.sent.has('o' + a.hex)) {
        SKY.sent.add('o' + a.hex); SKY.n++;
        ntNow('✈ まもなく真上付近を通ります', `${cs ? cs + '・' : ''}${type}（いま${dir8(dir)} ${dist.toFixed(1)}km）`, {ov: 'sora'});
        skyLog('over', cs, type);
      }
    });
  } finally { SKY.busy = false; if (document.visibilityState === 'visible') appCard(); }
}
// ---------- 版27：散歩中に MeguMiru の「近くのまだ行っていない場所」を通知 ----------
// MeguMiru の近づいたら知らせる（near.js）と同じ決まり：400m 以内・ミュージアム・史跡・道の駅（駅は除く）・まだ「訪問」でない・
// 歩く速さ（秒速4m 以下）・位置の精度100m 以内・同じ場所は12時間に1回（megu_nearseen を MeguMiru と分け合う）。
// MeguMiru の置き場（megu／kv の 'pref:都県' と 'rec'）を MichiMiru が読む。MeguMiru を裏で起こさない（地図・電池を使わない）
const MN = {R: 400, SPD: 4, ACC: 100, AGAIN: 12 * 3600000, EVERY: 60000, spots: null, spAt: 0, rec: null, recAt: 0, last: 0, lastP: null, n: 0, day: '', busy: false, none: false};
const MN_IC = {mu: '🏛', hi: '🏯', mi: '🛣'};
const meguLS = (k, d) => { try { const v = localStorage.getItem('megu_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
async function mnLoad() {
  const now = Date.now();
  const spAge = MN.none ? 120000 : 1800000; // データがまだないときは2分ごとに見直す（MeguMiru が都県のデータを読み込むのを待つ）
  if (MN.spots && now - MN.spAt < spAge && MN.rec && now - MN.recAt < 120000) return;
  if (typeof meguDb !== 'function') return;
  const db = await meguDb(false);
  if (!db) { MN.spots = []; MN.none = true; MN.spAt = now; return; }
  try {
    if (!MN.spots || now - MN.spAt >= spAge) {
      const keys = await new Promise(res => { try { const q = db.transaction('kv').objectStore('kv').getAllKeys(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); } catch (e) { res([]); } });
      const list = [];
      for (const k of keys.filter(k => typeof k === 'string' && k.startsWith('pref:'))) {
        const v = await kvGet(db, k);
        ((v && v.list) || []).forEach(s => { if (s && s.sh !== 'st' && MN_IC[s.sh] && s.x != null) list.push(s); });
      }
      MN.spots = list; MN.spAt = now; MN.none = !list.length;
    }
    if (!MN.rec || now - MN.recAt >= 120000) { MN.rec = (await kvGet(db, 'rec')) || {}; MN.recAt = now; }
  } finally { db.close(); }
}
function meguNearOn() { return meguLS('nearon', true) !== false && meguLS('recon', true) !== false; }
async function meguNearCheck(p) {
  if (!NT.ok || !walk || !BG.on || !p || !p.coords || MN.busy || !meguNearOn()) return;
  if (ovCur === 'megu') return; // MeguMiru を見ているときは MeguMiru の帯に任せる
  const now = Date.now(), c = p.coords, here = [c.longitude, c.latitude];
  if (now - MN.last < MN.EVERY || !(c.accuracy <= MN.ACC)) return;
  let spd = c.speed;
  if ((spd == null || isNaN(spd)) && MN.lastP) { const dt = (now - MN.lastP.t) / 1000; spd = dt > 5 ? distM(MN.lastP.p, here) / dt : null; }
  MN.lastP = {p: here, t: now};
  if (spd != null && spd > MN.SPD) return; // 乗り物では知らせない
  MN.last = now; MN.busy = true;
  try {
    await mnLoad();
    if (!MN.spots || !MN.spots.length) return;
    const seen = meguLS('nearseen', {}) || {};
    const cands = [];
    MN.spots.forEach(s => {
      if (Math.abs(s.y - here[1]) > 0.005 || Math.abs(s.x - here[0]) > 0.006) return;
      const r = MN.rec[s.id]; if (r && r.lv >= 2) return;
      if (seen[s.id] && now - seen[s.id] < MN.AGAIN) return;
      const d = distM(here, [s.x, s.y]); if (d <= MN.R) cands.push([s, d]);
    });
    if (!cands.length) return;
    cands.sort((a, b) => a[1] - b[1]);
    const [s, d] = cands[0];
    seen[s.id] = now;
    Object.keys(seen).forEach(k => { if (now - seen[k] > MN.AGAIN) delete seen[k]; });
    try { localStorage.setItem('megu_nearseen', JSON.stringify(seen)); } catch (e) {}
    const dir = dir8(Math.atan2((s.x - here[0]) * Math.cos(here[1] * Math.PI / 180), s.y - here[1]) * 180 / Math.PI);
    const day = new Date().toDateString(); if (MN.day !== day) { MN.day = day; MN.n = 0; }
    MN.n++;
    ntNow(`${MN_IC[s.sh]} 近くにまだ行っていない場所`, `${s.n}（${s.sub || ''}）・${dir}へ約${Math.round(d / 10) * 10}m${cands.length > 1 ? `（ほかに${cands.length - 1}か所）` : ''}`, {ov: 'megu', spot: s.id});
  } catch (e) {} finally { MN.busy = false; if (document.visibilityState === 'visible') appCard(); }
}
// 通知を押して MeguMiru を開いたら、その場所の詳しい画面を出す（MeguMiru が場所を読み終えるまで待つ）
function meguShowSpot(id) {
  let n = 0;
  const tick = () => {
    try {
      const w = ovFrames.megu && ovFrames.megu.contentWindow;
      const ok = w && w.eval('typeof showSpot === "function" && typeof SPOTS !== "undefined" && SPOTS.has(' + JSON.stringify(id) + ')');
      if (ok) { w.eval('showSpot(' + JSON.stringify(id) + ')'); return; }
    } catch (e) {}
    if (++n < 40) setTimeout(tick, 500);
  };
  setTimeout(tick, 800);
}

// 版25：知らせた飛行機を残す（新しい100件。散歩のまとめが時刻で拾う）
function skyLog(k, cs, ty) {
  try {
    const a = JSON.parse(getLS('walk_skylog') || '[]') || [];
    a.push({t: Date.now(), k, cs, ty, p: pos ? [+pos[0].toFixed(5), +pos[1].toFixed(5)] : null});
    lsSet('walk_skylog', JSON.stringify(a.slice(-100)));
  } catch (e) {}
}
// 通知を押してアプリが開いたら、その通知のアプリ（TenMiru）を重ねて開く
function ntTapSetup() {
  if (!NT.ok) return;
  try { CAP.addListener('LocalNotifications', 'localNotificationActionPerformed', a => { const x = a && a.notification && a.notification.extra, ov = x && x.ov; if (OV[ov]) { ovOpen(ov); if (ov === 'megu' && x.spot) meguShowSpot(x.spot); } }); } catch (e) {}
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
  let x = '記録が途中で止まるときは、下のボタンでアプリの設定を開き、<b>「位置情報」を「アプリの使用中のみ許可」以上（正確な位置：オン）</b>、<b>「電池」（バッテリー）を「制限なし」</b>にしてください。' +
    (BG_OK ? '<div class="acts" style="margin-top:6px"><button id="appSet">⚙️ アプリの設定を開く</button></div>' : '');
  if (NT.ok) {
    const iss = lsj('walk_iss_sched', null), ev = skyEvery();
    x += '<div style="margin-top:10px"><b>🛰 宇宙ステーションの知らせ</b>：' +
      (iss && iss.n ? `${iss.n}件を予約（次は ${mdw(iss.next)} ${hhmm(iss.next)} から見える通過）${iss.exact ? '' : '・目安の時刻（10分前ごろ）'}` : iss ? '3日以内に見える通過はありません' : 'まだ予約していません（Ten を開くと予約します）') +
      (iss ? `<br><span class="small">予約した日時：${mdw(iss.t)} ${hhmm(iss.t)}。Ten を開くたびに新しくなります</span>` : '') +
      (NT.exact === false ? '<div class="acts" style="margin-top:4px"><button id="appExact">⏰ 正確な時刻で知らせる（許可の画面を開く）</button></div>' : '') + '</div>' +
      '<div style="margin-top:10px"><b>🛩 散歩中の上空の見張り</b>（記録中は上空を見張り、軍用機や真上を通る飛行機を通知します。何を知らせるか・範囲は TenMiru の設定で）<div class="row">' +
      `<select id="appSky"><option value="60">1分ごと</option><option value="120">2分ごと</option><option value="300">5分ごと</option><option value="0">見張らない</option></select></div>` +
      `<span class="small">${!ev ? '見張っていません' : BG.on ? (SKY.err ? `<span style="color:#c0392b">${esc(SKY.err)}</span>` : SKY.last ? `最後に確かめた時刻 ${hhmm(SKY.last)}・今日の通知 ${SKY.n}件` : '歩き始めると見張ります') : '歩き始めると見張ります（画面を消していても）'}</span></div>`;
  }
  if (NT.ok) x += '<div style="margin-top:10px"><b>🗾 近くのまだ行っていない場所</b>（記録中は、MeguMiru のまだ行っていないミュージアム・史跡・道の駅が400m 以内にあると通知します）<br><span class="small">' +
    (!meguNearOn() ? '知らせていません（MeguMiru の設定の「近くのまだ行っていない場所を知らせる」で入にできます）'
      : MN.none ? 'MeguMiru の場所のデータがまだありません（MeguMiru を一度開くと、まわりの都県の分を読み込みます）'
      : `入（MeguMiru の設定に従います）${MN.n ? `・今日の通知 ${MN.n}件` : ''}`) + '</span></div>';
  how.innerHTML = x;
  const b = $('appSet');
  if (b) b.onclick = () => { try { CAP.nativePromise('BackgroundGeolocation', 'openSettings', {}).catch(() => {}); } catch (e) {} };
  const be = $('appExact');
  if (be) be.onclick = () => { CAP.nativePromise('LocalNotifications', 'changeExactNotificationSetting', {}).then(() => { issSig = ''; ntExact().then(appCard); }).catch(() => {}); };
  const sk = $('appSky');
  if (sk) { sk.value = String(skyEvery()); sk.onchange = () => { lsSet('walk_skywatch', sk.value); SKY.last = 0; appCard(); }; }
}

if (IN_APP) {
  appCard();
  if (walk) bgStart();   // 開き直して歩行を続きから再開したとき
  backSetup(); ntTapSetup(); ntChannels(); // 版30：通知の種類を先に作っておく
  if (NT.ok) ntExact().then(appCard);
  // 地図の右の丸いボタンに ▦（版23。押すと MeguMiru・TenMiru・YamaMiru）を足す。前回見ていたアプリがあれば、それを開いて始める
  if ($('mapBtns')) { ovStyle(); appsSetup(); }
  if (getLS('walk_megu_open') === '1') { lsSet('walk_ov', 'megu'); try { localStorage.removeItem('walk_megu_open'); } catch (e) {} } // 版21 からの引き継ぎ
  const last = getLS('walk_ov');
  if (OV[last]) ovOpen(last);
  setInterval(() => { if (BG.on && document.visibilityState === 'visible') appCard(); }, 10000);
  setInterval(skyCheck, 30000); // 止まっている間（位置が届かない間）も見張る
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') appCard(); });
}
