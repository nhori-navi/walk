// hikae.js：版24（版25：散歩のまとめも入れる）4つのアプリ（MichiMiru・MeguMiru・TenMiru・YamaMiru）の控えを1つのファイルで（native.js のあとに読み込む）
// ・書き出し：4つの記録を miru-hikae-日付.json に。中身はそれぞれのアプリの書き出しと同じ形＋紹介を見た印など
// ・自動の控え（アプリ版だけ）：前の控えから7日たっていたら、開いたときに Documents/MiruHikae に。自動の分は新しい4つだけ残す
// ・読み込み：MichiMiru の分はその場で足し合わせる。MeguMiru の分は MeguMiru（版18〜）が次に開いたときに自分で足し合わせる
//   （MeguMiru の入れ物 megu／kv の 'pending_import' に置く）。TenMiru・YamaMiru の分は、記録がなければ入れ、あれば選んだときだけ置き換える
// 同じアドレス（nhori-navi.github.io）の下にあるので、ほかのアプリの置き場も読める・書ける
const HK = {DAYS: 7, KEEP: 4, DIR: 'MiruHikae', busy: false, plan: null};
const SORA_SKIP = ['sora_routes_v1', 'sora_tle', 'sora_bk_last', 'sora_iss_v1']; // TenMiru の書き出しと同じ（取り直せる一時保存など）
const YAMA_BK = ['yama_zukan_v1', 'yama_quest_v1', 'yama_seen_v1', 'yama_fav_v1']; // YamaMiru の書き出しと同じ
const YAMA_LS = ['yama_help_v1', 'yama_offset', 'yama_cam', 'yama_astro'];       // 足りないときだけ入れる設定
const lsKeys = pre => { const a = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(pre)) a.push(k); } } catch (e) {} return a; };
const pad2h = n => String(n).padStart(2, '0');
const hkStamp = (d = new Date()) => `${d.getFullYear()}${pad2h(d.getMonth() + 1)}${pad2h(d.getDate())}`;

// MeguMiru の入れ物（megu／kv）。make=false なら、まだないときは作らない
function meguDb(make) {
  return new Promise(res => {
    let r;
    try { r = make ? indexedDB.open('megu', 1) : indexedDB.open('megu'); } catch (e) { res(null); return; }
    r.onupgradeneeded = () => { if (make) r.result.createObjectStore('kv'); else { try { r.transaction.abort(); } catch (e) {} } };
    r.onerror = () => res(null); r.onblocked = () => res(null);
    r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains('kv')) { db.close(); res(null); } else res(db); };
  });
}
const kvGet = (db, k) => new Promise(res => { try { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); } catch (e) { res(undefined); } });
const kvPut = (db, k, v) => new Promise((ok, ng) => { try { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => ok(); tx.onerror = () => ng(tx.error); } catch (e) { ng(e); } });

// 4つの記録を集める
async function hkBuild() {
  if (typeof saveNow === 'function') saveNow();
  const t = Date.now(), apps = {};
  const w = bkObj(); w.ls = {}; ['walk_help_v1'].forEach(k => { const v = getLS(k); if (v !== null) w.ls[k] = v; });
  apps.walk = w;
  if (typeof sumLoad === 'function') { const ws = await sumLoad(); if (ws.length) w.walks = ws; } // 版25：散歩のまとめ
  const db = await meguDb(false);
  if (db) {
    const rec = await kvGet(db, 'rec');
    if (rec && Object.keys(rec).length) {
      apps.megu = {app: 'MeguMiru', kind: 'all', v: 1, t, rec, log: (await kvGet(db, 'log')) || [], seg: (await kvGet(db, 'seg')) || {}, plans: (await kvGet(db, 'plans')) || [], ls: {}};
      lsKeys('megu_').forEach(k => { apps.megu.ls[k] = localStorage.getItem(k); });
    }
    db.close();
  }
  const sk = lsKeys('sora_').filter(k => !SORA_SKIP.includes(k));
  if (sk.length) { const data = {}; sk.forEach(k => { data[k] = localStorage.getItem(k); }); apps.sora = {app: 'SoraMiru', kind: 'kiroku', v: 1, t, data}; }
  const yd = {}; YAMA_BK.forEach(k => { try { const v = localStorage.getItem(k); if (v) yd[k] = JSON.parse(v); } catch (e) {} });
  if (yd.yama_zukan_v1) {
    apps.yama = {app: 'YamaMiru', ver: 1, t, data: yd, ls: {}};
    YAMA_LS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) apps.yama.ls[k] = v; });
  }
  return {app: 'MiruSet', kind: 'hikae', v: 1, t, apps};
}
function hkCounts(o) {
  const a = o.apps || {}, out = [];
  if (a.walk) out.push(`MichiMiru 歩いた記録 ${((a.walk.data || {}).tracks || []).length}本`);
  if (a.megu) out.push(`MeguMiru 行った場所 ${Object.keys(a.megu.rec || {}).length}か所`);
  if (a.sora) { let n = 0; try { n = (JSON.parse(a.sora.data.sora_catch_v1 || '{}').total) || 0; } catch (e) {} out.push(`TenMiru キャッチ通算 ${n}機`); }
  if (a.yama) out.push(`YamaMiru 見つけた山 ${Object.keys(((a.yama.data || {}).yama_zukan_v1 || {}).peaks || {}).length}座`);
  return out.join('・');
}

// ---------- 書き出し ----------
async function hkExport() {
  if (HK.busy) return; HK.busy = true;
  try {
    const o = await hkBuild(), txt = JSON.stringify(o), d = new Date();
    const name = `miru-hikae-${hkStamp(d)}-${pad2h(d.getHours())}${pad2h(d.getMinutes())}.json`;
    const done = (ok, m) => { if (ok) { hkMark('手動'); status(`4つのアプリの控えを${m.replace(/^書き出しました/, '書き出しました')}（${hkCounts(o)}）`); } else showErr(m); hkCard(); };
    if (typeof nativeSaveFile === 'function' && nativeSaveFile(name, txt, done)) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], {type: 'application/json'})); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    hkMark('手動'); status(`4つのアプリの控えを書き出しました（ダウンロードフォルダ・${hkCounts(o)}）`); hkCard();
  } catch (e) { showErr('控えを作れませんでした（' + jaErr(e) + '）'); }
  finally { HK.busy = false; }
}
function hkMark(kind) { lsSet('walk_hk_last', String(Date.now())); lsSet('walk_hk_kind', kind); try { localStorage.removeItem('walk_hk_err'); } catch (e) {} }

// ---------- 自動の控え（アプリ版だけ） ----------
const hkAutoOk = () => typeof NATIVE !== 'undefined' && NATIVE && typeof capHas === 'function' && capHas('Filesystem');
async function hkAuto(force) {
  if (!hkAutoOk() || HK.busy) return;
  if (!force && Date.now() - (Number(getLS('walk_hk_last')) || 0) < HK.DAYS * 864e5) return;
  if (typeof TRK !== 'undefined' && !TRK.ready) return; // 記録を読み終えてから
  HK.busy = true;
  try {
    const o = await hkBuild();
    await CAP.nativePromise('Filesystem', 'writeFile', {path: `${HK.DIR}/miru-hikae-auto-${hkStamp()}.json`, data: JSON.stringify(o), directory: 'DOCUMENTS', encoding: 'utf8', recursive: true});
    hkMark('自動');
    // 自動の分は新しい4つだけ残す（手で書き出したものには触らない）
    try {
      const r = await CAP.nativePromise('Filesystem', 'readdir', {path: HK.DIR, directory: 'DOCUMENTS'});
      const names = ((r && r.files) || []).map(f => typeof f === 'string' ? f : f.name).filter(n => /^miru-hikae-auto-\d{8}\.json$/.test(n)).sort().reverse();
      for (const n of names.slice(HK.KEEP)) { try { await CAP.nativePromise('Filesystem', 'deleteFile', {path: `${HK.DIR}/${n}`, directory: 'DOCUMENTS'}); } catch (e) {} }
    } catch (e) {}
  } catch (e) { lsSet('walk_hk_err', jaErr(e)); }
  finally { HK.busy = false; hkCard(); }
}

// ---------- 読み込み ----------
function hkPlan(o, name) {
  const a = o.apps || {}, p = {o, name, lines: [], sw: []};
  if (a.walk) {
    const b = Object.assign({t: a.walk.t}, a.walk.data || {});
    p.walk = b;
    p.lines.push('🚶 MichiMiru：' + backupPlan(b, name).replace(/^「[^」]*」(（[^）]*）)?：/, ''));
  }
  if (a.megu && a.megu.rec) p.lines.push(`🗾 MeguMiru：行った場所 ${Object.keys(a.megu.rec).length}か所。今の記録に足し合わせます（MeguMiru を次に開いたときに入ります）`);
  const soraHave = lsKeys('sora_').some(k => /^sora_(zukan|catch|day|cities|yoso)_v1$/.test(k));
  if (a.sora && a.sora.data) {
    if (soraHave) p.sw.push({id: 'sora', label: 'TenMiru の今の記録を、控えで置き換える', note: 'この端末にも TenMiru の記録があります。入にしたときだけ置き換えます'});
    else p.lines.push('✈️ TenMiru：この端末に記録がないので、控えの記録を入れます');
  }
  const yamaHave = (() => { try { return Object.keys((JSON.parse(localStorage.getItem('yama_zukan_v1') || '{}').peaks) || {}).length > 0; } catch (e) { return false; } })();
  if (a.yama && a.yama.data && a.yama.data.yama_zukan_v1) {
    if (yamaHave) p.sw.push({id: 'yama', label: 'YamaMiru の今の記録を、控えで置き換える', note: 'この端末にも YamaMiru の記録があります。入にしたときだけ置き換えます'});
    else p.lines.push('🏔 YamaMiru：この端末に記録がないので、控えの記録を入れます');
  }
  p.soraNew = !soraHave; p.yamaNew = !yamaHave;
  return p;
}
async function hkApply(p, rep) {
  const a = p.o.apps || {}, done = [];
  const fill = ls => Object.entries(ls || {}).forEach(([k, v]) => { try { if (localStorage.getItem(k) === null && typeof v === 'string') localStorage.setItem(k, v); } catch (e) {} });
  if (p.walk) {
    const n = applyBackup(p.walk); saveTracks(); afterTracksChanged(); fill(a.walk.ls);
    if (Array.isArray(a.walk.walks) && typeof sumLoad === 'function') { // 版25：散歩のまとめ（始めた時刻で1つ）
      try { const have = await sumLoad(), ks = new Set(have.map(x => x.t0)); a.walk.walks.forEach(x => { if (x && x.t0 && !ks.has(x.t0)) have.push(x); }); have.sort((x, y) => x.t0 - y.t0); await trkDo('readwrite', st => st.put(have, 'walks')); } catch (e) {}
    }
    done.push(`MichiMiru 新しい記録 ${n}本`);
  }
  if (a.megu && a.megu.rec) {
    try {
      const db = await meguDb(true);
      const m = Object.assign({}, a.megu); delete m.ls;
      await kvPut(db, 'pending_import', m); db.close();
      fill(a.megu.ls);
      // MeguMiru を開いていれば（アプリ版で閉じても残している）、すぐ足し合わせてもらう
      let now = false;
      try { const f = typeof ovFrames !== 'undefined' && ovFrames.megu; if (f && f.contentWindow && typeof f.contentWindow.meguPending === 'function') { await f.contentWindow.meguPending(); now = true; } } catch (e) {}
      done.push(now ? 'MeguMiru 足し合わせました' : 'MeguMiru は次に開いたときに入ります');
    } catch (e) { showErr('MeguMiru の分を置けませんでした（' + jaErr(e) + '）'); }
  }
  if (a.sora && a.sora.data && (p.soraNew || rep.sora)) {
    const old = {}; lsKeys('sora_').filter(k => !SORA_SKIP.includes(k)).forEach(k => { old[k] = localStorage.getItem(k); });
    try {
      Object.keys(old).forEach(k => localStorage.removeItem(k));
      Object.entries(a.sora.data).forEach(([k, v]) => { if (k.startsWith('sora_') && !SORA_SKIP.includes(k) && typeof v === 'string') localStorage.setItem(k, v); });
      done.push('TenMiru 入れました');
    } catch (e) {
      try { lsKeys('sora_').filter(k => !SORA_SKIP.includes(k)).forEach(k => localStorage.removeItem(k)); Object.entries(old).forEach(([k, v]) => localStorage.setItem(k, v)); } catch (e2) {}
      showErr('TenMiru の分は、保存場所が足りず入れられませんでした（今の記録はそのままです）');
    }
  }
  if (a.yama && a.yama.data && a.yama.data.yama_zukan_v1 && (p.yamaNew || rep.yama)) {
    try {
      YAMA_BK.forEach(k => { if (a.yama.data[k]) localStorage.setItem(k, JSON.stringify(a.yama.data[k])); else localStorage.removeItem(k); });
      fill(a.yama.ls);
      done.push('YamaMiru 入れました');
    } catch (e) { showErr('YamaMiru の分を入れられませんでした（' + jaErr(e) + '）'); }
  }
  status(`控え「${p.name}」を読み込みました（${done.join('・') || '入れるものはありませんでした'}）`);
}

// ---------- 設定タブの欄 ----------
function hkCard() {
  const box = $('hkState'); if (!box) return;
  const t = Number(getLS('walk_hk_last')) || 0, kind = getLS('walk_hk_kind') || '', err = getLS('walk_hk_err');
  const days = t ? Math.floor((Date.now() - t) / 864e5) : 0;
  box.innerHTML = (t ? `最後に控えた日：${ymd(t).replace(/-/g, '/')} ${pad2h(new Date(t).getHours())}:${pad2h(new Date(t).getMinutes())}（${days ? days + '日前' : '今日'}${kind ? '・' + kind : ''}）` : 'まだ控えていません') +
    (err ? `<br><span style="color:#c0392b">自動の控えに失敗しました（${esc(err)}）</span>` : '');
  box.style.color = t && days >= 30 ? '#c0392b' : '';
}
function hkShow() {
  const p = HK.plan, bx = $('hkBox'); if (!bx) return;
  if (!p) { bx.style.display = 'none'; return; }
  bx.innerHTML = `<div class="small" style="margin-bottom:6px">「${esc(p.name)}」（${p.o.t ? ymd(p.o.t).replace(/-/g, '/') : '?'} の控え）</div>` +
    p.lines.map(l => `<div class="small" style="margin:4px 0">${esc(l)}</div>`).join('') +
    p.sw.map(s => `<label class="sw"><span class="swt">${esc(s.label)}<small>${esc(s.note)}</small></span><input type="checkbox" data-hk="${s.id}"></label>`).join('') +
    '<div class="acts"><button id="hkOk" class="primary">読み込む</button><button id="hkNo">やめる</button></div>';
  bx.style.display = 'block';
  $('hkOk').onclick = async () => {
    const rep = {}; bx.querySelectorAll('input[data-hk]').forEach(i => { rep[i.dataset.hk] = i.checked; });
    const q = HK.plan; HK.plan = null; hkShow();
    await hkApply(q, rep);
  };
  $('hkNo').onclick = () => { HK.plan = null; hkShow(); status('控えの読み込みをやめました'); };
}
function hkSetup() {
  const after = $('appHead') && $('appHead').closest('.card');
  if (!after || $('hkHead')) return;
  const c = document.createElement('div'); c.className = 'card';
  c.innerHTML = '<div class="ch" id="hkHead">💾 4つのアプリの控え</div>' +
    '<div class="small">MichiMiru・MeguMiru・TenMiru・YamaMiru の記録を、1つのファイルにまとめて書き出し・読み込みします</div>' +
    '<div class="acts"><button id="hkExp" class="primary">まとめて書き出す</button><button id="hkImp">控えを読み込む</button></div>' +
    '<div id="hkState" class="small"></div>' +
    (hkAutoOk() ? `<div class="small">アプリ版は、${HK.DAYS}日ごとに自動で「Documents」の「${HK.DIR}」フォルダーに控えます（自動の分は新しい${HK.KEEP}つを残します）</div>` : '<div class="small">Chrome では自動の控えはありません。ときどき「まとめて書き出す」を押してください</div>') +
    '<div class="small" style="color:#c0392b">控えには、歩いた日時と道がすべて入っています。人に渡さないでください。</div>' +
    '<input type="file" id="hkFile" accept=".json,application/json" style="display:none"><div id="hkBox" style="display:none;margin-top:8px"></div>';
  after.after(c);
  $('hkExp').onclick = hkExport;
  $('hkImp').onclick = () => $('hkFile').click();
  $('hkFile').onchange = async () => {
    const f = $('hkFile').files[0]; $('hkFile').value = '';
    if (!f) return;
    try {
      const o = JSON.parse(await f.text());
      if (!o || o.app !== 'MiruSet' || !o.apps) throw new Error('4つのアプリの控えのファイルではありません（MichiMiru だけの書き出しは、記録タブの「記録を読み込む」から）');
      HK.plan = hkPlan(o, f.name); hkShow();
      status('控えの中身を確かめて、「読み込む」を押してください');
    } catch (e) { showErr(e instanceof SyntaxError ? '読み込めない形式です' : jaErr(e)); }
  };
  hkCard();
}
hkSetup();
// 自動の控え：記録を読み終えてから（開いて20秒後と、そのあと1時間ごとに確かめる）
if (hkAutoOk()) { setTimeout(() => hkAuto(), 20000); setInterval(() => hkAuto(), 3600000); }
