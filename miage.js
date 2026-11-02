// miage.js：版44 見上げカード（native.js のあと。mirutoko.js のあと、seiri.js の前に読み込む）
// ・散歩中の上空の見張り（native.js の skyCheck）で「まもなく真上付近」「軍用機が近く」の通知を押すと、TenMiru を待たずにすぐ出す
// ・通知に入れた飛行機の位置・高さ・向き・速さから、いまの位置を計算して見せる（1秒ごと）。10秒ごとに中継から取り直してずれを直す
// ・大きな矢印：スマホの向き（方位磁石）に合わせて飛行機のいる方を指す。方位磁石が使えないときは「北が上」
// ・［TenMiru でくわしく］で TenMiru を重ねて開く。スマホの「戻る」・［閉じる］で閉じる。遠くへ行ったら（30km より先）・5分たったら自動で閉じる
const MG = {on: false, d: null, tk: 0, ftk: 0, head: null, t0: 0, busy: false};
const MG_DIR = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
const mgDir8 = d => MG_DIR[Math.round((((d % 360) + 360) % 360) / 45) % 8];

function mgStyle() {
  if ($('mgStyle')) return;
  const st = document.createElement('style'); st.id = 'mgStyle';
  st.textContent = '#mgCard{position:fixed;inset:0;z-index:9500;display:none;background:rgba(8,18,30,.55);align-items:flex-end;justify-content:center}#mgCard.on{display:flex}' +
    '#mgCard .bx{width:100%;max-width:520px;background:#fff;color:#1d2b22;border-radius:22px 22px 0 0;padding:14px 18px max(18px,env(safe-area-inset-bottom));box-shadow:0 -4px 20px rgba(0,0,0,.3);text-align:center}' +
    '#mgCard .hd{font-size:15px;font-weight:bold;color:#1f6fd1}#mgCard .hd.mil{color:#c0392b}' +
    '#mgCard .ar{position:relative;width:min(56vw,220px);height:min(56vw,220px);margin:8px auto 4px;border-radius:50%;background:radial-gradient(circle,#eef5fd 0,#dbe9f8 70%,#c9ddf3 100%);box-shadow:inset 0 0 0 2px #b9d0ec}' +
    '#mgCard .ar svg{position:absolute;inset:0;width:100%;height:100%;transition:transform .25s linear}' +
    '#mgCard .ar .nn{position:absolute;left:50%;top:6px;transform:translateX(-50%);font-size:12px;color:#5b6b61}' +
    '#mgCard .big{font-size:24px;font-weight:bold;margin:4px 0 0;line-height:1.35}#mgCard .cd{font-size:20px;font-weight:bold;color:#d35400;margin:6px 0 0;font-variant-numeric:tabular-nums}' +
    '#mgCard .pl{font-size:14px;color:#3b4a42;margin:6px 0 0;line-height:1.5}#mgCard .sub{font-size:12px;color:#6b7a70;margin:4px 0 0}' +
    '#mgCard .ac{display:flex;gap:10px;justify-content:center;margin-top:12px}#mgCard .ac button{margin:0;min-height:46px;padding:8px 18px;border-radius:14px;font-size:15px;border:1px solid #1f6fd1;background:#fff;color:#1f6fd1}' +
    '#mgCard .ac button.pr{background:#1f6fd1;color:#fff;font-weight:bold}' +
    'body.dark #mgCard .bx{background:#28322e;color:#f1f5f2}body.dark #mgCard .pl{color:#d5ded8}body.dark #mgCard .sub,body.dark #mgCard .ar .nn{color:#b9c5bd}' +
    'body.dark #mgCard .ar{background:radial-gradient(circle,#2a3a4c 0,#22303f 70%,#1c2836 100%);box-shadow:inset 0 0 0 2px #3a5068}body.dark #mgCard .ac button{background:#22302a;color:#9cc4f5;border-color:#5b8fd6}body.dark #mgCard .ac button.pr{background:#1f6fd1;color:#fff}';
  document.head.appendChild(st);
}
function mgEl() {
  let c = $('mgCard'); if (c) return c;
  mgStyle();
  c = document.createElement('div'); c.id = 'mgCard'; c.setAttribute('role', 'dialog'); c.setAttribute('aria-label', '見上げカード');
  c.innerHTML = '<div class="bx"><div class="hd" id="mgHd"></div>' +
    '<div class="ar"><span class="nn" id="mgN"></span><svg viewBox="0 0 100 100" id="mgArrow"><path d="M50 10 L66 46 L55 42 L55 84 L45 84 L45 42 L34 46 Z" fill="#1f6fd1"/><circle cx="50" cy="50" r="4" fill="#fff" stroke="#1f6fd1" stroke-width="2"/></svg></div>' +
    '<div class="big" id="mgBig"></div><div class="cd" id="mgCd"></div><div class="pl" id="mgPl"></div><div class="sub" id="mgSub"></div>' +
    '<div class="ac"><button type="button" class="pr" id="mgTen">TenMiru でくわしく</button><button type="button" id="mgX">閉じる</button></div></div>';
  document.body.appendChild(c);
  $('mgX').onclick = () => miageClose(false);
  $('mgTen').onclick = () => { miageClose(false); setTimeout(() => { if (typeof ovOpen === 'function') ovOpen('sora'); }, 60); };
  c.addEventListener('click', e => { if (e.target === c) miageClose(false); });
  return c;
}
// 方位磁石（Android の Chrome・アプリは deviceorientationabsolute）
function mgOri(e) {
  let h = null;
  if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
  else if (e.absolute !== false && typeof e.alpha === 'number') h = 360 - e.alpha;
  if (h == null) return;
  const so = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  MG.head = (((h + so) % 360) + 360) % 360;
}
// 飛行機のいまの位置（通知のときの位置から、向きと速さで進める）
function mgNow() {
  const d = MG.d, here = (typeof pos !== 'undefined' && pos) || null; if (!d || !here) return null;
  const dtS = (Date.now() - d.t) / 1000, tr = (d.trk || 0) * Math.PI / 180, km = (d.gs || 0) * 1.852 / 3600 * dtS;
  const lat = d.lat + km * Math.cos(tr) / 110.57, lon = d.lon + km * Math.sin(tr) / (111.32 * Math.cos(d.lat * Math.PI / 180));
  const kx = 111.32 * Math.cos(here[1] * Math.PI / 180), e = (lon - here[0]) * kx, n = (lat - here[1]) * 110.57, dist = Math.hypot(e, n);
  const brg = (Math.atan2(e, n) * 180 / Math.PI + 360) % 360;
  const elev = d.alt ? Math.atan2(d.alt, dist * 1000) * 180 / Math.PI : null;
  // いちばん近づくまでの時間（秒）
  const v = (d.gs || 0) * 1.852 / 3600; let cpa = null, cpaKm = null;
  if (v > 0.01) { const ve = v * Math.sin(tr), vn = v * Math.cos(tr), t = -(e * ve + n * vn) / (v * v); cpa = t; const tt = Math.max(0, t); cpaKm = Math.hypot(e + ve * tt, n + vn * tt); }
  return {dist, brg, elev, cpa, cpaKm};
}
function mgDraw() {
  const r = mgNow(), d = MG.d; if (!r || !d) return;
  const hd = $('mgHd');
  hd.textContent = d.k === 'mil' ? '🛩 軍用機が近くにいます' : '✈ 見上げてみて！'; hd.classList.toggle('mil', d.k === 'mil');
  const rot = MG.head == null ? r.brg : r.brg - MG.head;
  $('mgArrow').style.transform = `rotate(${rot}deg)`;
  $('mgN').textContent = MG.head == null ? '↑ 北' : '';
  $('mgBig').textContent = `${mgDir8(r.brg)}の空${r.elev != null ? `・見上げる角度 ${Math.round(r.elev)}°` : ''}`;
  let cd = '';
  if (r.cpa != null && r.cpa > 3 && r.cpaKm != null && r.cpaKm <= 5) { const s = Math.round(r.cpa); cd = `真上付近まで あと ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  else if (r.dist <= 3) cd = 'いま、このあたりの空';
  else if (r.cpa != null && r.cpa <= 0) cd = `遠ざかっています（${r.dist.toFixed(1)}km）`;
  $('mgCd').textContent = cd;
  $('mgPl').textContent = [d.cs, d.type].filter(Boolean).join('・') + (d.alt ? `・高さ ${d.alt.toLocaleString()}m` : '');
  $('mgSub').textContent = `いま ${r.dist.toFixed(1)}km 先` + (MG.head == null ? '・矢印は北が上（方位磁石が使えないとき）' : '・矢印はスマホの向きに合わせています');
  if (r.dist > 30 || Date.now() - MG.t0 > 300000) miageClose(false);
}
// 10秒ごとに中継から取り直す（同じ機体 hex を探す）
async function mgFetch() {
  if (!MG.on || MG.busy || typeof skyCfg !== 'function' || !pos) return;
  MG.busy = true;
  try {
    const c = await skyCfg(); if (!c.relays.length) return;
    const km = 40, nm = Math.ceil(km / 1.852) + 1, la = pos[1].toFixed(2), lo = pos[0].toFixed(2);
    for (const r of c.relays) {
      const gas = r.includes('script.google.com');
      try {
        const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
        const res = await fetch(gas ? `${r}?lat=${la}&lon=${lo}&nm=${nm}` : `${r}/ac/${la}/${lo}/${nm}`, {signal: ctl.signal}).finally(() => clearTimeout(tm));
        if (!res.ok) continue;
        const o = await res.json(); if (!o || o.error) continue;
        const a = (o.ac || o.aircraft || []).find(x => x && x.hex === MG.d.hex && x.lat != null);
        if (a && MG.d) {
          const dt = Math.min(60, Math.max(0, a.seen_pos || 0));
          Object.assign(MG.d, {lat: a.lat, lon: a.lon, t: Date.now() - dt * 1000, trk: a.track ?? a.true_heading ?? MG.d.trk, gs: a.gs ?? MG.d.gs,
            alt: typeof a.alt_baro === 'number' ? Math.round(a.alt_baro * 0.3048) : MG.d.alt});
        }
        break;
      } catch (e) {}
    }
  } finally { MG.busy = false; }
}
window.miageOpen = function (d) {
  if (!d || d.lat == null) return;
  MG.d = Object.assign({}, d); MG.t0 = Date.now();
  const c = mgEl();
  if (!MG.on) {
    MG.on = true; c.classList.add('on');
    try { history.pushState({mmMiage: 1}, ''); } catch (e) {}
    window.addEventListener('deviceorientationabsolute', mgOri, true);
    window.addEventListener('deviceorientation', mgOri, true);
  }
  mgDraw();
  clearInterval(MG.tk); clearInterval(MG.ftk);
  MG.tk = setInterval(mgDraw, 1000);
  MG.ftk = setInterval(mgFetch, 10000); mgFetch();
};
function miageClose(fromPop) {
  if (!MG.on) return;
  MG.on = false; clearInterval(MG.tk); clearInterval(MG.ftk);
  const c = $('mgCard'); if (c) c.classList.remove('on');
  window.removeEventListener('deviceorientationabsolute', mgOri, true);
  window.removeEventListener('deviceorientation', mgOri, true);
  MG.head = null;
  if (!fromPop && history.state && history.state.mmMiage) { try { history.back(); } catch (e) {} }
}
window.addEventListener('popstate', () => { if (MG.on && !(history.state && history.state.mmMiage)) miageClose(true); });
