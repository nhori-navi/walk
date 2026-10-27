// MichiMiru：設定（トークンと各種の値）
// 読み込み順：config → base → road → poi → walk → play → tokaido → tabi → app → train → ui → help → native → hikae → matome → nikki（index.html の <script> の順番）
// ▼▼▼ トークン ▼▼▼
const TOKEN = 'pk.eyJ1IjoiaG9yaWhha28iLCJhIjoiY211djd0ejljMDA5ZjMycHYxaTY3M3BsdSJ9.a1yefJYynC4k_YvllM5DVw';
// ▲▲▲▲▲▲▲▲▲▲▲▲

const MAX_M = 5000;   // 徒歩で計算する上限（直線距離）
const MARGIN = 500;   // 周りに取る余白（m）
const VIA_MAX = 5;    // 経由地の最大数
const SPEED = 80;     // 分速80m
const VEH_MS = 2.78;  // これより速い区間（時速10km超）は乗り物とみなす
const CACHE_DAYS = 30, CACHE_MAX = 10; // 道のデータの保存日数と保存する範囲の数
// OpenStreetMapのデータを取るサーバー（上から順に頼む。6秒返事がなければ次にも頼み、同時は2か所まで）
const OVERPASS = [['https://overpass-api.de/api/interpreter', '本家'],
  ['https://overpass.private.coffee/api/interpreter', 'coffee'],
  ['https://overpass.kumi.systems/api/interpreter', 'kumi']];
const ROUGH_M = 100;  // 現在地の精度がこれより悪い（m）と「粗い位置」とみなす
const REC_M = 50;     // 歩いた記録に使う精度（m）
const JAPAN = [137.5, 37.0], JAPAN_Z = 4.3; // 現在地も前回の場所もないときの地図（日本全体）
const HW = '^(footway|path|pedestrian|steps|corridor|living_street|residential|service|unclassified|road|track|cycleway|tertiary|tertiary_link|secondary|secondary_link|primary|primary_link|trunk|trunk_link)$';
const NET_COLOR = {ok:'#8a9a9a', steps:'#f39c12', iso:'#9b59b6', ng:'#e74c3c'};
// 遊歩道を優先するときの重み（[歩行者の道, 住宅街などの道, 大きな道]の順。なし／弱／強）
const FOOT_F = [[1, 1, 1], [1, 1.1, 1.3], [1, 1.25, 1.6]];
const POI = {shrine: {ic: '⛩', nm: '神社', col: '#c0392b'}, temple: {ic: '卍', nm: '寺', col: '#8e44ad'}, park: {ic: '🌳', nm: '公園', col: '#27ae60'}};
const APP_VER = 29; // index.html の ?v= と同じ番号にする
