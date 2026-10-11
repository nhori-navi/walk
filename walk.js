// 徒歩ナビ：歩行中の記録・案内表示・記録の保護・画面ON・タッチロック・歩いた記録・GPX

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
function walkStep(c) {
  const now = Date.now(), p = [c.longitude, c.latitude];
  if (c.accuracy <= 50) {
    if (!walk.last) { walk.last = {p, t: now}; walk.track.pts.push(roundP(p)); }
    else {
      const d = distM(walk.last.p, p), dt = (now - walk.last.t) / 1000;
      if (d >= Math.max(8, c.accuracy * 0.5)) {
        const v = d / Math.max(dt, 1);
        if (v <= 4) {
          walk.dist += d;
          walk.kcal += mets(v * 3.6) * weight() * dt / 3600 * 1.05;
          walk.track.pts.push(roundP(p));
          // 上った分のカロリー（標高タイルの高さで2m以上変わったら数える。体重1kgを1m持ち上げる≒0.0094kcal）
          const eh = elevSync(p);
          if (!isNaN(eh)) {
            if (walk.eRef === null) walk.eRef = eh;
            else if (eh - walk.eRef >= 2) { walk.up += eh - walk.eRef; walk.kcal += weight() * (eh - walk.eRef) * 0.0094; walk.eRef = eh; }
            else if (walk.eRef - eh >= 2) walk.eRef = eh;
          }
        }
        walk.last = {p, t: now};
      }
    }
  }
  walk.hist.push({t: now, d: walk.dist});
  while (walk.hist.length && walk.hist[0].t < now - 120000) walk.hist.shift();
  renderHud();
}
// 次の案内（曲がり角・階段・急な上り坂）と、そこまでの距離
function nextTurn() {
  if (!route || !route.turns || !route.turns.length || route.off > 60) return null;
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
  if (n.dist <= 20) return `<div class="turn">${ar} まもなく ${tx}</div>`;
  if (n.dist <= 150) return `<div class="turn">${ar} ${fmtDist(n.dist)}先 ${tx}</div>`;
  return `<div class="small" style="margin:0">次の案内まで ${fmtDist(n.dist)}</div>`;
}
// 案内の40m手前で一度だけ振動する
function maybeVibrate() {
  if (!walk || !$('vibChk').checked || !navigator.vibrate) return;
  const n = nextTurn();
  if (n && n.dist <= 40 && !route.vib[n.t.d]) { route.vib[n.t.d] = 1; try { navigator.vibrate([200, 100, 200]); } catch (e) {} }
}
function renderHud() {
  if (!walk) return;
  const now = Date.now(), el = (now - walk.t0) / 1000;
  let v = null;
  const e = walk.hist.find(x => x.t >= now - 60000);
  if (e && now - e.t >= 15000) v = (walk.dist - e.d) / ((now - e.t) / 1000);
  else if (!e && el > 60) v = 0;
  const pace = (el < 120 || walk.dist < 100) ? SPEED / 60 : Math.max(0.3, walk.dist / el);
  let top = '';
  if (lastRemain === null) top = '<div class="big">記録中（ルートなし）</div>';
  else if (lastRemain < 20) top = `<div class="big">${route && route.loop ? '出発点に戻りました' : '到着しました'}</div>`;
  else top = turnHtml() + `<div class="big">残り ${fmtDist(lastRemain)}</div><div class="big">到着 ${hm(new Date(now + lastRemain / pace * 1000))}</div>`;
  $('hud').innerHTML = top +
    (route && route.prof && lastRemain >= 20 ? `<div>残りの上り ${Math.round(route.remUp)}m</div>` : '') +
    `<div>${v === null ? '—' : (v * 3.6).toFixed(1)} km/h　${Math.round(walk.kcal)} kcal</div>` +
    `<div class="small" style="margin:0">歩行 ${fmtTime(el)}・${fmtDist(walk.dist)}</div>` +
    (walk.note && now < walk.noteUntil ? `<div class="small" style="margin:0;color:#1f6fd1">${walk.note}</div>` : '') +
    (walk.msg && now < walk.msgUntil ? `<div class="small" style="margin:0;max-width:240px;color:${walk.msgErr ? '#c00' : '#555'}">${esc(walk.msg)}</div>` : '');
}
function resizeSoon() { setTimeout(() => map.resize(), 60); }
$('vibTest').onclick = () => {
  if (!navigator.vibrate) { $('vibMsg').textContent = 'この端末・ブラウザは振動に対応していません'; return; }
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
    localStorage.setItem('walk_session', JSON.stringify({t0: walk.t0, dist: walk.dist, kcal: walk.kcal, up: walk.up,
      saved: Date.now(), dest, destName, mode, route: r}));
  } catch (e) {}
}
function saveNow() { if (walk) { saveTracks(); saveSession(); } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); else applyWake(); });
window.addEventListener('pagehide', saveNow);
// 歩行中にページを閉じたり戻ったりしようとしたら確認を出す
window.addEventListener('beforeunload', e => { if (walk) { saveNow(); e.preventDefault(); e.returnValue = ''; } });
function startWalk(prev) {
  walk = Object.assign({t0: Date.now(), dist: 0, kcal: 0, up: 0, track: null}, prev || {}, {eRef: null, last: null, hist: []});
  if (!walk.track) { walk.track = {k: 'walk', t0: walk.t0, pts: []}; tracks.push(walk.track); }
  document.body.classList.add('walking'); document.body.classList.remove('menu');
  $('menuBtn').textContent = '▲メニュー';
  $('result').textContent = '';
  resizeSoon(); setFollow(true);
  clearInterval(hudTimer);
  let n = 0;
  hudTimer = setInterval(() => { renderHud(); if (++n % 6 === 0) { saveTracks(); saveSession(); } }, 5000);
  saveSession();
  renderHud();
}
$('walkBtn').onclick = () => { if (!walk) startWalk(); };
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
  if (!track) { track = {k: 'walk', t0: s.t0, pts: []}; tracks.push(track); }
  startWalk({t0: s.t0, dist: s.dist, kcal: s.kcal, up: s.up || 0, track, note: '前回の歩行を続きから再開しました', noteUntil: Date.now() + 20000});
  status('前回の歩行を続きから再開しました');
}

// ---------- 画面をつけたままにする（手動） ----------
let wakeOn = false, wakeLock = null;
async function applyWake() {
  if (wakeOn && document.visibilityState === 'visible' && !wakeLock) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) { wakeOn = false; showErr('画面をつけたままにできませんでした（' + e.message + '）'); }
  } else if (!wakeOn && wakeLock) {
    try { await wakeLock.release(); } catch (e) {}
    wakeLock = null;
  }
  $('wakeBtn').textContent = '画面ON：' + (wakeOn ? '入' : '切');
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
  if (walk.track.pts.length < 2) tracks = tracks.filter(t => t !== walk.track);
  saveTracks();
  clearInterval(hudTimer); clearTimeout(followTimer); walk = null;
  saveSession();
  setLock(false); wakeOn = false; applyWake();
  document.body.classList.remove('walking', 'menu');
  resizeSoon();
  afterTracksChanged();
};

// ---------- 歩いた記録（保存・表示） ----------
function saveTracks() {
  try { localStorage.setItem('walk_tracks', JSON.stringify(tracks)); return true; }
  catch (e) { showErr('記録の保存に失敗しました。容量不足の可能性があります。「記録を書き出す」で控えを取ってください'); return false; }
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
function drawTracks() {
  const fw = [], fv = []; let lw = 0, lv = 0;
  tracks.forEach(t => {
    if (!t.pts || t.pts.length < 2) return;
    const veh = t.k === 'veh';
    // 乗り物の区間は、記録が途切れた地点どうしを直線で結ぶこともあるので分けない
    splitLines(t.pts, veh ? Infinity : 80).forEach(c => {
      const L = cumOf(c)[c.length - 1];
      if (veh) { lv += L; fv.push(line(c)[0]); } else { lw += L; fw.push(line(c)[0]); }
    });
  });
  setData('walked', $('walkedChk').checked ? fw : []);
  setData('veh', $('vehChk').checked ? fv : []);
  const pct = Math.round(JSON.stringify(tracks).length / 5000000 * 100);
  $('recStat').textContent = `保存済み：歩行 ${(lw / 1000).toFixed(1)}km・乗り物 ${(lv / 1000).toFixed(1)}km（保存容量の約${pct}%）`;
  if (pct >= 80) showErr('記録の保存容量が残り少なくなっています。「記録を書き出す」で控えを取ってください');
}
function afterTracksChanged() {
  drawTracks();
  if (graph) markWalked(graph);
  if (route && cands[candIdx] && cands[candIdx].idx && graph) { route.ur = unexpRatio(graph, cands[candIdx].idx); showSummary(); }
}
$('walkedChk').onchange = drawTracks;
$('vehChk').onchange = drawTracks;

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
        out.push({k: 'veh', t0: a.t, src, pts: [roundP(a.p), roundP(x.p)]});
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
        if (part.length >= 2) out.push({k: cls[s], t0: isFinite(part[0].t) ? part[0].t : Date.now(), src, pts: thin(part.map(x => x.p), cls[s] === 'veh' ? 50 : 15)});
        s = i;
      }
    }
  });
  return out;
}
function importBackup(txt) {
  const o = JSON.parse(txt), arr = Array.isArray(o) ? o : (o.tracks || []);
  const key = t => `${t.t0}|${t.k || 'walk'}|${t.pts[0]}`;
  const have = new Set(tracks.filter(t => t.pts && t.pts.length).map(key));
  let n = 0;
  arr.forEach(t => {
    if (!t || !Array.isArray(t.pts) || t.pts.length < 2) return;
    if (have.has(key(t))) return;
    tracks.push({k: t.k === 'veh' ? 'veh' : 'walk', t0: t.t0, src: t.src, pts: t.pts}); have.add(key(t)); n++;
  });
  return n;
}
$('recImport').onclick = () => $('recFile').click();
$('recFile').onchange = async () => {
  const files = [...$('recFile').files]; $('recFile').value = '';
  if (!files.length) return;
  status('記録を読み込み中…'); await pause();
  let added = 0, replaced = 0, bad = 0;
  for (const f of files) {
    try {
      const txt = await f.text();
      if (/^\s*[\[{]/.test(txt)) { added += importBackup(txt); continue; }
      const segs = parseGpx(txt);
      const before = tracks.length;
      tracks = tracks.filter(t => t.src !== f.name);
      if (tracks.length < before) replaced++;
      // OpenTracksはGPSが途切れると区切り（trkseg）を分けるので、1本につなげてから判定する
      const all = segs.flat();
      if (all.length >= 2) { const o = processSeg(all, f.name); tracks.push(...o); added += o.length; }
    } catch (e) { bad++; showErr(`${f.name}：${e.message}`); }
  }
  saveTracks(); afterTracksChanged();
  status(`読み込み完了：${files.length - bad}ファイル（区間 ${added}件${replaced ? `、${replaced}ファイルは前回分を置き換え` : ''}）`);
};
$('recExport').onclick = () => {
  const d = new Date(), ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const blob = new Blob([JSON.stringify({app: 'walk', v: 1, tracks})], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `walk-records-${ymd}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  status('記録を書き出しました（ダウンロードフォルダを確認してください）');
};
twoStep($('recClear'), '記録をすべて消す', () => {
  tracks = []; saveTracks(); afterTracksChanged(); status('記録をすべて消しました');
});
