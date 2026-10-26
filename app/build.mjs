// MichiMiru の Android アプリ版を作るための下ごしらえ（GitHub Actions の中で動く）
//   node build.mjs setup   … 部品の一覧（package.json）・アプリの設定・つながらないときの画面を作る
//   node build.mjs android … アイコン・通知の絵・起動時の画面・番号を Android のひな形に入れる
// アプリの画面そのものは https://nhori-navi.github.io/walk/ を読みに行くので、
// 画面やボタンの修正はいつも通り GitHub に上げるだけで反映される（このファイルを変えたときだけ APK を作り直す）
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const SITE = 'https://nhori-navi.github.io/walk/';   // 引っ越ししたら、ここを新しいアドレスにして作り直す
const APP_ID = 'io.github.nhorinavi.michimiru';
const GREEN = '#2fbf71';


function setup() {
  const pkg = {
    name: 'michimiru-app', private: true, version: '1.0.0', type: 'module',
    dependencies: {
      '@capacitor/android': '8.5.3', '@capacitor/cli': '8.5.3', '@capacitor/core': '8.5.3',
      '@capacitor/filesystem': '8.1.5', '@capacitor/local-notifications': '8.3.1',
      '@capacitor-community/background-geolocation': '1.3.1', 'sharp': '0.34.5'
    }
  };
  fs.writeFileSync(path.join(HERE, 'package.json'), JSON.stringify(pkg, null, 2));
  const cfg = {
    appId: APP_ID, appName: 'MichiMiru', webDir: 'www',
    server: { url: SITE, cleartext: false, errorPath: 'error.html' },
    // useLegacyBridge：画面を消して5分たつと位置が止まるのを防ぐ（裏の記録の部品の説明どおり）
    // appendUserAgent：画面側が「アプリ版で開いている」と分かるための目印
    android: { useLegacyBridge: true, appendUserAgent: 'MichiMiruApp', resolveServiceWorkerRequests: false }
  };
  fs.writeFileSync(path.join(HERE, 'capacitor.config.json'), JSON.stringify(cfg, null, 2));
  fs.mkdirSync(path.join(HERE, 'www'), { recursive: true });
  fs.writeFileSync(path.join(HERE, 'www', 'index.html'), '<!doctype html><meta charset="utf-8"><title>MichiMiru</title>');
  fs.writeFileSync(path.join(HERE, 'www', 'error.html'), `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>MichiMiru</title>
<style>body{margin:0;font-family:sans-serif;background:#f2f5f3;color:#1d2b22;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
.b{padding:24px}h1{color:#1e7e34;font-size:22px}button{margin-top:16px;font-size:17px;padding:12px 22px;border:0;border-radius:10px;background:#1e7e34;color:#fff}</style></head>
<body><div class="b"><h1>MichiMiru</h1><p>画面を読み込めませんでした。<br>電波のよい所で、もう一度開いてください。</p>
<p style="font-size:14px;color:#555">記録中だった場合、歩いた記録は消えていません。</p>
<button onclick="location.href='${SITE}'">もう一度読み込む</button></div></body></html>`);
  console.log('setup：package.json・capacitor.config.json・www を作りました');
}

// ---------- アイコンの絵（版16の案B「踏破マス」） ----------
const TILES = `
  <rect x="96" y="96" width="100" height="100" rx="18" fill="#ffffff" opacity=".22"/>
  <rect x="206" y="96" width="100" height="100" rx="18" fill="#ffd23f"/>
  <rect x="316" y="96" width="100" height="100" rx="18" fill="#ffffff" opacity=".22"/>
  <rect x="96" y="206" width="100" height="100" rx="18" fill="#ffb347"/>
  <rect x="206" y="206" width="100" height="100" rx="18" fill="#ffb347"/>
  <rect x="316" y="206" width="100" height="100" rx="18" fill="#ffffff" opacity=".22"/>
  <rect x="96" y="316" width="100" height="100" rx="18" fill="#ffb347"/>
  <rect x="206" y="316" width="100" height="100" rx="18" fill="#ffffff" opacity=".22"/>
  <rect x="316" y="316" width="100" height="100" rx="18" fill="#ffffff" opacity=".22"/>
  <path d="M 146 470 L 146 256 L 256 256 L 256 146 L 366 146" fill="none" stroke="#ffffff" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="366" cy="146" r="34" fill="#ff5e5b" stroke="#ffffff" stroke-width="12"/>`;
// full：緑の地つき（512）／fg：地なしの中身だけを、108 の枠の真ん中に 72 の大きさで（Android の丸や角丸で切られても欠けない）
const svgFull = (round) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${round ? `<circle cx="256" cy="256" r="256" fill="${GREEN}"/>` : `<rect width="512" height="512" fill="${GREEN}"/>`}<g transform="translate(256 256) scale(${round ? 0.86 : 1}) translate(-256 -256)">${TILES}</g></svg>`;
const svgFg = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><g transform="translate(18 18) scale(${72 / 512})">${TILES}</g></svg>`;
// 通知の小さな絵：白一色・地は透明（Android の決まり）
const svgNote = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <path d="M 146 470 L 146 256 L 256 256 L 256 146 L 330 146" fill="none" stroke="#fff" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="380" cy="146" r="70" fill="#fff"/></svg>`;
const svgSplash = (w, h) => {
  const s = Math.min(w, h) * 0.34;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${GREEN}"/>
  <g transform="translate(${(w - s) / 2} ${(h - s) / 2}) scale(${s / 512})">${TILES}</g></svg>`;
};

async function android() {
  const sharp = (await import('sharp')).default;
  const RES = path.join(HERE, 'android', 'app', 'src', 'main', 'res');
  if (!fs.existsSync(RES)) throw new Error('android のひな形がありません（先に npx cap add android）');
  const png = (svg, size, file) => sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toFile(file);
  const D = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(D)) {
    const dir = path.join(RES, 'mipmap-' + d);
    fs.mkdirSync(dir, { recursive: true });
    await png(svgFull(false), Math.round(48 * k), path.join(dir, 'ic_launcher.png'));
    await png(svgFull(true), Math.round(48 * k), path.join(dir, 'ic_launcher_round.png'));
    await png(svgFg(), Math.round(108 * k), path.join(dir, 'ic_launcher_foreground.png'));
    const nd = path.join(RES, 'drawable-' + d);
    fs.mkdirSync(nd, { recursive: true });
    await png(svgNote(), Math.round(24 * k), path.join(nd, 'ic_tracking.png'));
  }
  fs.writeFileSync(path.join(RES, 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${GREEN}</color>\n</resources>\n`);
  // 起動したときの画面（Capacitor の青い絵を、MichiMiru の緑とアイコンに）
  for (const dir of fs.readdirSync(RES).filter(n => n.startsWith('drawable'))) {
    const f = path.join(RES, dir, 'splash.png');
    if (!fs.existsSync(f)) continue;
    const m = await sharp(f).metadata();
    const buf = await sharp(Buffer.from(svgSplash(m.width, m.height))).png().toBuffer();
    fs.writeFileSync(f, buf);
  }
  // 通知の名前・絵・色（裏の記録の部品が読む）
  const sx = path.join(RES, 'values', 'strings.xml');
  let s = fs.readFileSync(sx, 'utf8');
  if (!s.includes('capacitor_background_geolocation')) {
    s = s.replace('</resources>',
      '    <string name="capacitor_background_geolocation_notification_channel_name">歩いた道の記録</string>\n' +
      '    <string name="capacitor_background_geolocation_notification_icon">drawable/ic_tracking</string>\n' +
      `    <string name="capacitor_background_geolocation_notification_color">${GREEN}</string>\n</resources>`);
    fs.writeFileSync(sx, s);
  }
  // アプリの番号：作るたびに1つ上げる（同じ番号だと上書きで入れられない）
  const run = Number(process.env.RUN_NO || 1);
  const bg = path.join(HERE, 'android', 'app', 'build.gradle');
  let g = fs.readFileSync(bg, 'utf8');
  g = g.replace(/versionCode \d+/, 'versionCode ' + run).replace(/versionName "[^"]*"/, `versionName "1.${run}"`);
  fs.writeFileSync(bg, g);
  console.log('android：アイコン・通知の絵・起動画面・番号（' + run + '）を入れました');
}

const step = process.argv[2];
if (step === 'setup') setup();
else if (step === 'android') await android();
else { console.error('使い方：node build.mjs setup | android'); process.exit(1); }
