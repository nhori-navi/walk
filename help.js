// MichiMiru の使い方（版8、版9で下のタブに合わせて直した）：はじめての紹介・使い方ナビ（レクチャー）・ヘルプ（「？ 使い方」と各欄の「？」）
// app.js のあとに読む。ほかのファイルの変数（pos・dest・route・walk・pickMode・mapMode など）をそのまま使う
// SoraMiru の help.js（v34）と同じ作り。進み具合は walk_help_v1 に覚える（端末ごと。書き出しには入れない）
(function () {
  const H = loadJSON('walk_help_v1', '{}') || {};
  H.done = H.done || {}; H.ev = H.ev || {};
  if (H.on == null) H.on = true;
  const hSave = () => lsSet('walk_help_v1', JSON.stringify(H));

  // ---------- 見た目 ----------
  const st = document.createElement('style');
  st.textContent = `
#helpRow{display:flex;align-items:center;gap:6px;margin:0 0 4px}
#helpRow label{font-size:13px;margin:0}
#helpAll{font-size:13px;padding:3px 10px;margin:0;background:#1e7e34;color:#fff;border:none;border-radius:12px}
#tip{display:none;position:sticky;top:-8px;z-index:6;margin:0 -10px 6px;padding:8px 34px 8px 10px;background:#fff4c2;border-bottom:2px solid #f0c419;font-size:14px;line-height:1.5;box-shadow:0 2px 6px rgba(0,0,0,.15)}
#tip b{color:#7a5a00}
#tipX{position:absolute;top:4px;right:4px;border:none;background:none;font-size:18px;padding:2px 8px;margin:0}
.hl{outline:3px solid #f0c419 !important;outline-offset:2px;animation:hlp 1.2s ease-in-out infinite}
@keyframes hlp{0%,100%{outline-color:#f0c419}50%{outline-color:rgba(240,196,25,.25)}}
.qb{display:inline-block;width:22px;height:22px;line-height:20px;padding:0;margin:0 0 0 4px;font-size:13px;font-weight:bold;text-align:center;border:1px solid #1e7e34;color:#1e7e34;background:#fff;border-radius:50%;vertical-align:middle}
#helpBox,#intro{display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:45;background:#fff;overflow:auto;padding:12px;line-height:1.7;font-size:15px}
#helpBox details{border-bottom:1px solid #e3e3e3;padding:4px 0;margin:0;background:none;border-radius:0;border-left:none;border-right:none;border-top:none}
#helpBox summary{font-weight:bold;color:#1e5631;padding:6px 0;cursor:pointer}
#helpBox details[open] summary{color:#c0392b}
#helpBox .hb{padding:0 4px 8px}
#helpBox ul{margin:4px 0;padding-left:20px}
#helpBox .tag{display:inline-block;font-size:12px;font-weight:bold;padding:0 6px;border-radius:10px;color:#fff}
#intro{background:linear-gradient(#1e5631,#4caf7a);color:#fff;display:none;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:24px}
#intro .ic{font-size:64px;line-height:1.2}
#intro h2{margin:12px 0 8px;font-size:22px}
#intro p{max-width:460px;margin:0 auto;font-size:16px;line-height:1.8}
#intro .dots{margin:18px 0}
#intro .dots span{display:inline-block;width:9px;height:9px;margin:0 4px;border-radius:50%;background:rgba(255,255,255,.35)}
#intro .dots span.on{background:#fff}
#intro button{font-size:16px;padding:8px 18px;margin:4px;border-radius:20px;border:none}
#introNext{background:#ffd54f;color:#333;font-weight:bold}
#introSkip,#introPrev{background:rgba(255,255,255,.2);color:#fff}`;
  document.head.appendChild(st);

  // ---------- 使い方ナビの行と吹き出し（パネルのいちばん上） ----------
  const row = document.createElement('div'); row.id = 'helpRow';
  row.innerHTML = '<label><input type="checkbox" id="helpChk">使い方ナビ</label><button id="helpAll">？ 使い方</button>';
  const tip = document.createElement('div'); tip.id = 'tip';
  tip.innerHTML = '<div id="tipText"></div><button id="tipX" aria-label="閉じる">×</button>';
  $('panel').prepend(tip);
  if ($('helpSlot')) $('helpSlot').appendChild(row); else $('panel').prepend(row); // 版9：設定タブの「使い方」の中
  $('helpChk').checked = !!H.on;
  $('helpChk').onchange = () => { H.on = $('helpChk').checked; if (H.on && H.done.finish) { H.done = {}; } hSave(); tipKey = ''; closedKey = ''; helpTick(); };

  // ---------- ヘルプの中身（13項目。版14で片道散歩を電車をはさむに替えた） ----------
  const tag = (t, c) => `<span class="tag" style="background:${c}">${t}</span>`;
  const line = c => `<span style="display:inline-block;width:18px;height:4px;vertical-align:middle;background:${c}"></span>`;
  const SEC = [
    ['about', 'MichiMiru とは', `<p>自分の好みで道を選んで歩く、徒歩のナビです。最短の道だけでなく、まだ歩いていない道、坂の少ない道、遊歩道、神社・寺・公園への寄り道を選べます。</p>
<p>歩いた道は記録に残り、踏破マス・スタンプ帳・バーチャル東海道・旅の地図で、歩いた分が少しずつ形になっていきます。</p>`],
    ['screen', '画面の見方', `<ul><li>上は地図、下はタブの中身です（パソコンでは地図の右）。いちばん下のタブで切り替えます：<b>🧭ルート</b>（目的地・周回・道の好み）、<b>🟧あそぶ</b>（踏破マス・東海道・スタンプ帳）、<b>🗾記録</b>（今日・旅の地図・記録の保存・お気に入り）、<b>⚙️設定</b>（地図に出すもの・使い方など）。真ん中の丸い<b>🚶</b>で歩き始めます。</li>
<li>地図の右の丸いボタン：<b>◎</b>＝現在地に追従（青いときは追従中。地図を動かすと切れます）、<b>N</b>／<b>⬆</b>＝地図の向き（北が上／進む方向が上）。</li>
<li>地図の線：${line('#1f6fd1')} 青＝これから歩くルート（白い矢印が進む向き）、${line('#2ecc71')} 緑＝歩いた道、灰色の点線＝比較用の Mapbox の最短ルート（設定で入にしたとき）。</li>
<li>青い点が現在地です。まわりの円は位置のずれの目安で、灰色の円と点は「ずれが大きい」しるしです。</li>
<li><b>境目のつまみ</b>（スマホだけ）：地図と下の境目にある横棒を上下に動かすと、地図の広さが変わります（画面の20%〜75%）。2回タップで半分に戻ります。次に開いたときも同じ広さです。</li>
<li><b>画面の明るさ</b>（設定タブ）：自動（夜は暗く）／いつも明るい／いつも暗い。自動は、今いる場所の日の入りから日の出まで、画面と地図を暗くします。暗い画面のときは、ルートと歩いた道の線を太く、現在地の点を大きくします。</li>
<li><b>夜の地図</b>（設定タブ）：夕方くらい（初め。道や建物の形が見える明るさまで）／真っ暗な夜（街の明かりが映えるが、道は見えにくい）／明るいまま。</li>
<li><b>ホーム画面のアプリ</b>（設定タブ）：「📲 ホーム画面に追加」で、アイコンから開けるようにできます。アドレスの帯のない画面になり、電波の弱い所でも画面は開きます（地図と道のデータは通信で取ります）。Android ではブラウザとホーム画面のアプリで記録は共通、iPhone では別なので書き出し→読み込みで移します。</li>
<li><b>文字の大きさ</b>（設定タブ）：標準／大きめ／特大。タブの中身・歩行中の左上の案内・下の帯の文字が大きくなります。</li>
</ul>`],
    ['dest', '目的地・経由地・出発地', `<ul><li><b>目的地</b>：駅名・施設名・住所で検索するか、「地図で指定」を押して地図をタップします。歩くルートは直線で5kmまでです。もっと遠いときは「電車をはさむ」を使います。</li>
<li><b>経由地を追加</b>：通りたい場所を5か所までタップした順に通ります。「1つ戻す」「全部消す」で直せます。</li>
<li><b>出発地を地図で選ぶ</b>：現在地が取れないときや、別の場所から計画したいときに使います。「現在地から出発に戻す」で戻ります。</li>
<li><b>★登録</b>：目的地をお気に入りにします。次からはボタン1つで目的地にできます。</li></ul>`],
    ['route', '道選びの条件', `<ul><li><b>延長</b>：わざと遠回りして、指定の距離だけ長く歩きます。</li>
<li><b>未踏破を優先</b>：まだ歩いていない道を選びやすくします（なし・弱・強・最強）。</li>
<li><b>坂</b>：「なるべく避ける」は坂と階段を避け、「あえて選ぶ」は上り坂を選びます。上り下りの高さはルートのカードのグラフに出ます。</li>
<li><b>寄り道</b>：名前のある神社・寺・公園に1〜3か所寄るルートにします。寄り道できる遠回りの上限は「延長」の距離です。</li>
<li><b>遊歩道を優先</b>：車道より、歩行者用の道や緑道を選びやすくします。</li>
<li>選んでいるものが緑になります。「道の好み」を閉じても、今の選択が見出しの横に1行で出ます。条件を変えると、その場でルートを計算し直します。</li></ul>`],
    ['loop', '周回コースと別の案', `<ul><li><b>周回コースを作る</b>：今いる場所（または地図で選んだ出発地）から出て戻ってくる、指定した距離（1〜5km）のコースを作ります。矢印の向きに歩いてください。</li>
<li><b>向き</b>：おまかせ・時計回り・反時計回りから選べます（同じ道を逆にたどるだけなので、どちらでも作れます）。結果のカードに向きが出ます。</li>
<li>行きに使った道は帰りで使いにくくしてあるので、同じ道を往復する案は出にくくなっています。</li>
<li>経由地を加えると、その場所を通る周回になります。</li>
<li><b>別の案</b>：候補がいくつかあるときに押せます。押すたびに次の案に替わります。</li>
<li><b>ルートを消す</b>：目的地・経由地・出発地もまとめて消します。</li></ul>`],
    ['train', '電車をはさむ（遠くの目的地）', `<ul><li>現在地 →（歩く）→ <b>①乗る駅</b> →（電車）→ <b>②降りる駅</b> →（歩く）→ 目的地、の形のルートにします。目的地を決めたあと、ルートのカードの「🚃 電車をはさむ」を押します。目的地が直線で5kmより遠いときは、自動で開きます。</li>
<li><b>①乗る駅</b>：現在地のまわりの駅を近い順に3つ出します（初めは最寄り）。押して選びます。</li>
<li><b>降りてから歩く距離</b>：最寄り（初め）／1km／2km／3km。1km以上にすると、目的地からその距離くらいの駅を探し、目的地までのルートで<b>未踏破の長い順</b>に3つ出します。わざと手前で降りて、まだ歩いていない道を歩けます。</li>
<li><b>このルートにする</b>：まず「①乗る駅まで」のルートを出します。電車に乗ったら画面を消してかまいません。<b>電車を降りたら画面をつけてください</b>。②降りる駅の300m以内なら、聞かずに「②降りる駅から目的地まで」のルートに切り替わります（歩いている途中なら記録もそのまま続きます）。ルートのカードのボタンで、手で切り替えることもできます。</li>
<li>画面を消している間はアプリが止まるので、降りたことを画面を消したまま知らせることはできません。</li>
<li><b>乗換を調べる</b>：①乗る駅から②降りる駅までを Google マップの経路（電車）で開きます。電車の時刻・運賃・乗り換えは、このアプリでは出しません。</li>
<li>この計画は6時間覚えているので、途中でページが閉じても開き直せば続きからです。電車の区間は記録に入りません（歩く速さを超えるため）。</li>
<li>駅のデータは、国土数値情報（鉄道、国土交通省。全国約9,000駅）をこのサイトに置いたものを初回だけ読み込み、端末に保存します。年に1回の更新なので、できたばかりの駅は出ないことがあります。読み込めないときは OpenStreetMap に聞きます。</li></ul>`],
    ['walk', '歩く（記録・案内・画面ON・ロック）', `<ul><li>真ん中の丸い<b>🚶</b>（ルートがあるときは「歩き始める」、ないときは「記録だけ」）か、ルートのカードの<b>歩き始める</b>を押すと、記録が始まり、地図が大きくなります。</li>
<li>左上に、次の曲がり角などの案内（150m手前から大きな矢印、20m手前で赤く塗ります）、残りの距離、到着の時刻、速さ、カロリーが出ます。曲がり角の40m手前で振動します（Android だけ。設定で入・切）。</li>
<li>下の帯：<b>▲メニュー</b>＝タブの中身を出す、<b>画面ON</b>＝画面を消さない（記録を始めると入になります）、<b>🔒ロック</b>＝ポケットでの誤操作を防ぐ（バッジの長押しで解除）、<b>■ 終了</b>（赤）＝記録を終える。押し間違いを防ぐため、「もう一度で終了」に変わってから3秒以内にもう一度押すと終わります。</li>
<li><b>道を外れたら</b>：ルートから40m以上離れて15秒たつと、今いる場所から組み直します（設定タブで「自動で組み直す／聞いてから／しない」）。未踏破・坂・遊歩道の好みはそのまま、経由地・寄り道先はまだ通っていない所だけ通り、延長や周回の距離は最初の予定の全長に合わせます（余計に歩いた分は延長に数えます）。たった今歩いてきた道は戻りにくくします。▲メニューのルートのカードの「🔄 組み直す」でも組み直せます。</li>
<li><b>途中でルートを変える</b>：▲メニューのルートのタブで、経由地を足す・目的地を変える・別の案・道の好みを変えると、今いる場所から計算し直します。もう通った経由地は外します。</li>
<li>途中でページを閉じても、30分以内に開き直せば続きから再開します。</li>
<li>歩きながら画面を見続けるのは危ないので、立ち止まってから操作してください。</li></ul>`],
    ['today', '今日の合計とカロリー', `<ul><li>記録タブの「今日」に、0時からの距離・時間・カロリーが出ます。日付をまたいだ記録は、始めた日に入ります。乗り物の区間は入れません。</li>
<li>カロリーは、歩く速さと時間、上った高さ、体重（設定）からの目安です。</li>
<li><b>未踏破</b>：今日初めて歩いた道の長さです（今日より前の記録で歩いたことのない道）。道のデータを読み込んだ範囲だけで数えます。</li>
<li>道から30m以上外れた記録（GPS のずれなど）は、距離や合計に入れません。設定で、灰色の点線として表示もできます。</li></ul>`],
    ['play', 'あそぶ（踏破マス・完全制覇・スタンプ・東海道）', `<ul><li><b>踏破マス</b>：約125m四方のマス（国の地域メッシュ）を、歩いて通ると数えます。「地図に踏破マスを表示」で塗られたマスが見えます。</li>
<li><b>完全制覇</b>：マスの中の道を全部（残り30m未満まで）歩くと${tag('金色', '#d4ac0d')}になります。残り200m以下は濃いオレンジ。表示中にマスをタップすると、残りの長さと、まだ歩いていない道（赤い点線）が半透明の吹き出しで出ます（ほかの場所をタップすると消えます）。道のデータがまだないマスでは「この辺りの道のデータを読み込む」を押すと、現在地に関係なくそのまわりを読み込みます。車道沿いの別線の歩道・横断歩道・駐車場の通路は数えません。</li>
<li><b>スタンプ帳</b>：名前のある神社・寺・公園の50m以内を通ると押されます。</li>
<li><b>バーチャル東海道</b>：歩いた距離で、日本橋から京都三条大橋（約495km）を進みます。「地図で見る」で、旧東海道の道筋の上の今の位置が出ます。下の帯の ⓘ で詳しく、✕ で戻ります。</li></ul>`],
    ['tabi', '旅の地図', `<ul><li>徒歩・電車・車の記録で、全国1,741の市区町村を塗ります。歩いた所は濃い色、乗り物で通っただけの所は薄い色です。</li>
<li>線の色：${line('#27ae60')} 徒歩、${line('#8e44ad')} 電車、${line('#e67e22')} 車。点線は、記録が途切れて直線でつないだ区間です（線の上の市区町村は数えません）。</li>
<li>電車か車かは、線路に沿っているかで自動で決めます。違っていたら線をタップして「電車にする／車にする」で直せます。</li>
<li>電車や車の記録は、OpenTracks の GPX を記録タブの「記録を読み込む」から読み込みます（このアプリは歩く速さを超えた点を記録しません）。</li>
<li>下の帯の ⓘ で、都道府県ごとの数と手段ごとの距離が出ます。✕ で戻ります。</li></ul>`],
    ['rec', '記録の保存（書き出し・読み込み・GPX）', `<ul><li>記録はこの端末のこのブラウザの中にあります。パソコンとスマホでは別々です。ブラウザの「サイトデータを削除」で消えます。</li>
<li><b>全部まとめて書き出す</b>：歩いた記録・スタンプ帳・完全制覇・お気に入り・体重・設定・東海道を1つのファイルにします。機種変更の前や、ときどきの控えに使ってください。ファイルには歩いた日時と道がすべて入っているので、人に渡さないでください。</li>
<li><b>記録を読み込む</b>：書き出したファイルは、中身を確かめてから今の記録に足し合わせます（今の記録は消えません）。OpenTracks の GPX も読み込めます。歩きと乗り物は速さで分けます。</li>
<li>iPhone の Safari は、7日使わないとサイトの記録を消すことがあります。</li></ul>`],
    ['loc', '現在地と精度、パソコンで使うとき', `<ul><li>ルートタブのいちばん下の「現在地：精度 約○m」が、位置のずれの目安です。100mより大きいときは「ずれが大きい」として、ルートの出発地や到着の判定に使いません。「出発地を地図で選ぶ」で選び直すか、精度がよくなるのを待ってください。</li>
<li>歩いた記録には、精度50m以内の位置だけを使います。</li>
<li>パソコンでは、地図・ルートの計算・記録の表示・あそぶ・旅の地図・書き出しが使えます。歩いた記録、向き（進行方向）、振動、ロックはスマホで使ってください。</li>
<li>位置情報は、ルートを作るためと歩いた記録のためだけに使います。運営者には何も送りません（詳しくは設定タブの「この端末の外へ送る情報」）。</li></ul>`],
    ['trouble', 'うまくいかないとき', `<ul><li><b>「道のデータを取得できませんでした」</b>：OpenStreetMap の公開サーバーが混んでいます。道のデータは約2km四方のマスごとに取り、取れなかったマスは20秒後に1回だけ自動でやり直します。それでもだめなときは、ルートのカードの「もう一度計算する」を押してください。取れたマスは端末に30日保存するので、次からは速くなります。</li>
<li><b>ルートが出ない</b>：ルートのカードに理由が出ます（現在地のずれが大きい、道のデータが取れない、など）。真ん中の🚶が「計算待ち」のときに押すと、理由のところが光ります。</li>
<li><b>「ルートを作れませんでした」</b>：近くに歩ける道がない場所です。場所を少しずらしてください。目的地が遠い（直線5km超）ときは「電車をはさむ」を使ってください。</li>
<li><b>記録が残らない</b>：位置のずれが大きい（屋内・パソコン）と記録しません。画面を消すと記録が途切れることがあるので、長く歩くときは OpenTracks で記録して GPX を読み込むのが確実です。</li>
<li><b>道が実際と違う</b>：OpenStreetMap を書き足したあとは、設定タブの「道のデータを取り直す」を押してください（確かめてから消します）。</li>
<li>タブの中身のいちばん上の赤い文字に、エラーの理由が出ます。</li></ul>
<p class="small">地図：Mapbox／道路・名称検索・旧東海道の道筋：© OpenStreetMap contributors／標高・住所検索：国土地理院／東海道の宿場間の距離：川口市の資料／市区町村の境目：国土数値情報（行政区域）国土交通省を加工／線路：地球地図日本（国土地理院）を加工／駅：国土数値情報（鉄道）国土交通省を加工</p>`]];
  const box = document.createElement('div'); box.id = 'helpBox';
  box.innerHTML = '<button id="helpClose">閉じる</button> <b>MichiMiru の使い方</b>' +
    SEC.map(s => `<details id="h-${s[0]}"><summary>${s[1]}</summary><div class="hb">${s[2]}</div></details>`).join('') +
    '<div style="margin:14px 0"><button id="helpIntro">はじめての紹介をもう一度</button><button id="helpRestart">使い方ナビを最初から</button></div>';
  document.body.appendChild(box);
  const helpOpen = () => box.style.display === 'block';
  // スマホの「戻る」でヘルプを閉じる（ページから出ないように）
  function helpHide(fromBack) {
    if (!helpOpen()) return;
    box.style.display = 'none';
    if (!fromBack && history.state && history.state.mmHelp) { try { history.back(); } catch (e) {} }
  }
  window.addEventListener('popstate', () => { if (helpOpen()) helpHide(true); });
  window.openHelp = function (id) {
    box.querySelectorAll('details').forEach(d => { d.open = !!id && d.id === 'h-' + id; });
    if (!helpOpen()) { box.style.display = 'block'; try { history.pushState({mmHelp: 1}, ''); } catch (e) {} }
    const d = id && $('h-' + id);
    if (d) setTimeout(() => d.scrollIntoView({block: 'start'}), 0); else box.scrollTop = 0;
  };
  $('helpAll').onclick = () => openHelp(null);
  $('helpClose').onclick = () => helpHide(false);
  $('helpRestart').onclick = () => { H.done = {}; H.ev = {}; H.on = true; $('helpChk').checked = true; hSave(); helpHide(false); tipKey = ''; closedKey = ''; helpTick(); };
  $('helpIntro').onclick = () => { helpHide(false); setTimeout(() => showIntro(0), 50); };

  // ---------- 各欄の「？」 ----------
  const qb = (el, sec, place) => {
    if (typeof el === 'string') el = $(el);
    if (!el) return;
    const b = document.createElement('button'); b.className = 'qb'; b.textContent = '？'; b.title = '説明';
    b.onclick = e => { e.preventDefault(); e.stopPropagation(); openHelp(sec); };
    if (place === 'in') el.appendChild(b); else el.after(b);
  };
  qb('pickBtn', 'dest');
  qb($('prefs').querySelector('summary'), 'route', 'in');
  qb('loopBtn', 'loop');
  qb('trHead', 'train', 'in');
  qb('themeHead', 'screen', 'in');
  qb('appHead', 'screen', 'in');
  qb('walkBtn', 'walk');
  qb($('today').parentNode, 'today', 'in');
  qb($('loc').parentNode, 'loc', 'in');
  qb($('playSum').parentNode, 'play', 'in');
  qb('tkHead', 'play', 'in');
  qb('tabiHead', 'tabi', 'in');
  qb('recHead', 'rec', 'in');
  qb('viewHead', 'screen', 'in');
  qb('setHead', 'trouble', 'in');
  // 東海道・旅の地図の帯：いま開いている地図の説明
  const mq = document.createElement('button'); mq.className = 'qb'; mq.textContent = '？'; mq.title = '説明';
  mq.style.margin = '0';
  mq.onclick = e => { e.stopPropagation(); openHelp(mapMode === 'tabi' ? 'tabi' : 'play'); };
  $('mbInfo').before(mq);

  // ---------- はじめての紹介（5枚） ----------
  const CARDS = [
    ['🚶', '自分の基準で道を選ぶ', 'まだ歩いていない道、坂の少ない道、遊歩道、神社・寺・公園への寄り道。最短だけでない「歩きたい道」を選べます。周回コースも作れます。'],
    ['🧭', '歩くと記録が残る', '曲がり角の手前で案内と振動（Android）。歩いた道は緑の線で残り、今日の距離・時間・カロリーが分かります。'],
    ['🟧', 'あそぶ：マス・スタンプ・東海道', '約125m四方の踏破マスを広げ、マスの道を全部歩けば金色の完全制覇。神社・寺・公園のスタンプ帳、歩いた距離で進むバーチャル東海道も。'],
    ['🗾', '旅の地図', '電車や車で出かけた記録（OpenTracks の GPX）も読み込むと、全国の行った市区町村が塗られていきます。'],
    ['📍', '位置情報と記録の置き場所', '現在地は、ルートを作るためと歩いた記録のためだけに使います。記録はこの端末の中だけにあるので、ときどき「全部まとめて書き出す」で控えを取ってください。']];
  const intro = document.createElement('div'); intro.id = 'intro';
  document.body.appendChild(intro);
  function showIntro(i) {
    const c = CARDS[i], last = i === CARDS.length - 1;
    intro.innerHTML = `<div class="ic">${c[0]}</div><h2>${esc(c[1])}</h2><p>${esc(c[2])}</p>` +
      `<div class="dots">${CARDS.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>` +
      `<div>${i ? '<button id="introPrev">戻る</button>' : ''}<button id="introNext">${last ? 'はじめる' : '次へ'}</button></div>` +
      (last ? '' : '<div><button id="introSkip">飛ばす</button></div>');
    intro.style.display = 'flex';
    $('introNext').onclick = () => { if (last) endIntro(); else showIntro(i + 1); };
    if ($('introPrev')) $('introPrev').onclick = () => showIntro(i - 1);
    if ($('introSkip')) $('introSkip').onclick = endIntro;
  }
  function endIntro() { intro.style.display = 'none'; H.intro = 1; hSave(); helpTick(); }
  if (!H.intro) showIntro(0);

  // ---------- 終わった印（押した・開いた） ----------
  const mark = k => { if (!H.done[k]) { H.done[k] = 1; hSave(); } };
  ['ext', 'unexp', 'slope', 'foot', 'poiShrine', 'poiTemple', 'poiPark'].forEach(id => $(id).addEventListener('change', () => { if (route || dest) mark('cond'); }));
  $('endBtn').addEventListener('click', () => mark('walk'));
  $('routeClear').addEventListener('click', () => mark('clear'));
  // 初めて歩き始めたときだけ、左上に下の帯の説明を出す（歩きながら読ませないよう1回だけ）
  $('walkBtn').addEventListener('click', () => {
    if (!walk || H.ev.walkNote || !H.on) return;
    H.ev.walkNote = 1; hSave();
    walk.note = '下の帯：▲メニュー＝パネル／画面ON／🔒ロック（長押しで解除）／終了＝記録を終える';
    walk.noteUntil = Date.now() + 20000; renderHud();
  });

  // ---------- 使い方ナビ（レクチャー） ----------
  const vis = el => el && el.offsetParent !== null;
  // 折りたたみの中のものは、閉じていたら見出しを光らせる
  const inFold = el => { const d = el && el.closest('details'); return d && !d.open ? d.querySelector('summary') : el; };
  // 手順（上から順に、まだ終わっていない最初のものを出す）。t：文、el：光らせる場所、ok：終わった印を付ける条件、on：出してよい条件
  const STEPS = [
    {id:'dest', t:'まず<b>目的地</b>を決めましょう。駅名や施設名で<b>検索</b>するか、<b>「地図で指定」</b>を押して地図をタップします。', el:() => $('search'), ok:() => !!dest, on:() => true},
    {id:'cond', t:'ルートが出ました。<b>「道の好み」</b>の<b>「未踏破を優先」</b>や<b>「坂」</b>を押して変えると、その場で道が選び直されます。1つ変えてみましょう。', el:() => inFold(chipOf('unexp')), ok:() => H.done.cond, on:() => !!route},
    {id:'loop', t:'目的地がなくても歩けます。<b>「周回コースを作る」</b>で、ここから出て戻ってくるコースを作ってみましょう。', el:() => $('loopBtn'), ok:() => !!(route && route.loop), on:() => true},
    {id:'walk', t:'<b>「歩き始める」</b>（真ん中の丸い🚶でも）を押すと記録が始まり、曲がり角の案内が出ます。歩き終わったら下の帯の<b>「終了」</b>を押します。', el:() => vis($('walkBtn')) ? $('walkBtn') : $('walkFab'), ok:() => H.done.walk, on:() => !noSensor()},
    {id:'mesh', t:'下の<b>「あそぶ」</b>タブで、<b>「地図に踏破マスを表示」</b>にしてみましょう。歩いたマスが塗られ、マスをタップすると残りの道が分かります。', el:() => inFold($('meshChk')), ok:() => $('meshChk').checked, on:() => true},
    {id:'tk', t:'<b>「あそぶ」</b>タブのバーチャル東海道の<b>「地図で見る」</b>で、歩いた距離で進んだ旧東海道の今の位置が見られます。', el:() => inFold($('tkMapBtn')), ok:() => H.done.tk, on:() => true},
    {id:'tabi', t:'<b>「記録」</b>タブの<b>「旅の地図を見る」</b>で、行った市区町村が全国の地図に塗られます。', el:() => inFold($('tabiBtn')), ok:() => H.done.tabi, on:() => true},
    {id:'rec', t:'記録はこの端末の中だけにあります。<b>「記録」</b>タブの<b>「全部まとめて書き出す」</b>で、ときどき控えを取りましょう（ここに数秒表示すると次へ進みます）。', el:() => $('recExport'), ok:() => H.done.rec, on:() => true},
    {id:'clear', t:'最後に<b>「ルートを消す」</b>で、地図をすっきりさせられます。', el:() => $('routeClear'), ok:() => H.done.clear, on:() => !!(route || dest)}];
  let tipKey = '', closedKey = '', hlEl = null, finishAt = 0;
  function setTip(key, html, el) {
    if (el && window.uiReach) el = uiReach(el);
    if (hlEl && hlEl !== el) { hlEl.classList.remove('hl'); hlEl = null; }
    if (!key || key === closedKey) { tip.style.display = 'none'; tipKey = key || ''; return; }
    if (key !== tipKey) { $('tipText').innerHTML = html; tipKey = key; if (el && vis(el) && el.closest && el.closest('#panel')) el.scrollIntoView({block: 'nearest'}); }
    tip.style.display = 'block';
    if (el && vis(el)) { el.classList.add('hl'); hlEl = el; }
  }
  $('tipX').onclick = () => { closedKey = tipKey; setTip('', ''); };
  const PICK = {dest: '<b>地図をタップ</b>して、目的地を選んでください。拡大してから選ぶと正確です。',
    via: '<b>地図をタップ</b>して、通りたい場所（経由地）を選んでください。タップした順に通ります。',
    from: '<b>地図をタップ</b>して、出発地を選んでください。'};
  function helpTick() {
    if (intro.style.display === 'flex' || helpOpen()) return;
    // いつでも出すもの（ナビ OFF でも）：地図で場所を選んでいる間
    if (pickMode && PICK[pickMode]) return setTip('pick:' + pickMode, PICK[pickMode], $('map'));
    if (!H.on || walk) return setTip('', ''); // 歩いている間は吹き出しを出さない
    if (mapMode === 'tk') H.done.tk = 1;
    if (mapMode === 'tabi') H.done.tabi = 1;
    if (mapMode) return setTip('mode:' + mapMode, '地図の下の帯に、いまの状況が出ています。<b>ⓘ</b> で詳しく、<b>？</b> で説明、<b>✕</b> でいつもの地図に戻ります。', $('mbar'));
    // 現在地
    if (!pos && !startPt) {
      if (geoErr !== null) return setTip('geo', '現在地が取れません。<b>「出発地を地図で選ぶ」</b>を押すと、選んだ場所からルートを作れます。', $('fromBtn'));
      return setTip('pos', '現在地を探しています。位置情報の確認が出たら<b>「許可」</b>を選んでください（ルートと歩いた記録のためだけに使います）。', $('loc'));
    }
    if ($('warn').style.display === 'block') return setTip('warn', '現在地のずれが大きいため、出発地に使っていません。<b>「出発地を地図で選ぶ」</b>で選ぶか、少し待ってください。', $('warnPick'));
    // その場の出来事：あと少しのマス（踏破マスを覚えたあとに1回だけ、8秒）
    const near = $('nearList').querySelector('[data-i]');
    if (near && !H.ev.near && H.done.mesh) {
      if (!H.ev.nearAt) H.ev.nearAt = Date.now();
      if (Date.now() - H.ev.nearAt > 8000) { H.ev.near = 1; hSave(); }
      return setTip('near', '<b>「あと少しのマス」</b>は、残りの道が200m以下のマスです。押すとその場所へ移り、まだ歩いていない道が赤い点線で出ます。', inFold(near));
    }
    // レクチャー
    let step = null;
    for (const s of STEPS) {
      if (H.done[s.id]) continue;
      if (s.ok()) { H.done[s.id] = 1; hSave(); continue; }
      if (s.on()) { step = s; break; }
    }
    if (step) {
      // 記録の管理：「全部まとめて書き出す」が5秒見えたら済み
      if (step.id === 'rec' && vis($('recExport'))) { if (!H.ev.recAt) H.ev.recAt = Date.now(); if (Date.now() - H.ev.recAt > 5000) mark('rec'); } else if (step.id === 'rec') H.ev.recAt = 0;
      return setTip('s:' + step.id, step.t, step.el());
    }
    // 全部終わった（パソコンでは「歩き始める」がなくても完了）
    const must = s => !(noSensor() && s.id === 'walk');
    if (!H.done.finish && STEPS.every(s => H.done[s.id] || !must(s))) {
      if (!finishAt) finishAt = Date.now();
      if (Date.now() - finishAt > 10000) { H.done.finish = 1; H.on = false; $('helpChk').checked = false; hSave(); return setTip('', ''); }
      return setTip('finish', '<b>レクチャー完了！</b> いつでも「設定」タブの「？ 使い方」で説明を見られます。使い方ナビはまもなく自動で OFF になります。', $('helpAll'));
    }
    setTip('', '');
  }
  setInterval(() => { if (!document.hidden) helpTick(); }, 1000);
  helpTick();
})();
