// MichiMiru：画面の骨組み（版9。版12で境目のつまみ・画面の明るさ・歩行中の画面。版13で夜の見やすさ・文字の大きさ。版14で電車をはさむ。版16でホーム画面のアプリ。版17でルートタブの切り替え・スイッチ・お知らせの整理。版18で長押しの枠・🗂 表示の切り替え・あそぶのまとめ。版19でおまかせ散歩・案の一覧）。下のタブ、地図の丸いボタン、ルートの結果のカード、道の好みの「押して選ぶ並び」、見た目
// app.js のあと・help.js の前に読む。部品の id と動きは変えず、見せ方だけを変える
(function () {
  const st = document.createElement('style');
  st.textContent = `
:root{--g:#1e7e34;--g2:#27ae60;--gl:#e8f5ec;--line:#d5ddd8;--ink:#23322a}
body{background:#f2f5f3;color:var(--ink)}
#map{height:var(--split,50%)}
#panel{top:var(--split,50%);bottom:64px;background:#f2f5f3;padding:8px 10px 14px;border-top:1px solid var(--line)}
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
body.walking.menu #tabbar{display:flex;bottom:64px}
body.walking.menu #tabbar .fab{visibility:hidden}
body.walking.menu #panel{bottom:128px}
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

/* 版12：境目のつまみ（スマホだけ。地図の高さ＝--split） */
body.walking.menu #map{height:var(--split,50%)}
body.walking.menu #panel{top:var(--split,50%)}
#grip{position:fixed;left:50%;top:var(--split,50%);transform:translate(-50%,-50%);z-index:9;width:120px;height:30px;display:flex;align-items:center;justify-content:center;touch-action:none;cursor:ns-resize;-webkit-user-select:none;user-select:none}
#grip::before{content:'';display:block;width:64px;height:6px;border-radius:3px;background:#8a9a91;box-shadow:0 0 0 3px rgba(255,255,255,.85),0 1px 4px rgba(0,0,0,.35)}
#grip.drag::before{background:var(--g);width:84px}
body.walking:not(.menu) #grip{display:none}
@media (min-width:900px){#grip{display:none}}
/* 版12：歩行中の下の帯（大きなボタン・終了は赤） */
#tab{height:64px;gap:6px;padding:6px 8px;background:#fff;border-top:1px solid var(--line);box-shadow:0 -1px 4px rgba(0,0,0,.08)}
#tab button{flex:1;min-width:0;height:52px;margin:0;padding:2px 4px;border-radius:12px;border:1px solid var(--line);background:#fff;color:var(--ink);font-size:14px;font-weight:bold;white-space:nowrap;line-height:1.2}
#tab #endBtn{white-space:normal}
body.walking #walkBtn,body.walking #walkBtn + .qb{display:none}
#tab #endBtn{background:#c0392b;border-color:#c0392b;color:#fff}
#tab #endBtn.arm{background:#7b1d14;border-color:#7b1d14;animation:arm .6s ease-in-out infinite alternate}
@keyframes arm{to{background:#e74c3c}}
body.walking #map{bottom:64px}
/* 版12：歩行中の案内（矢印を大きく） */
#hud{max-width:calc(100% - 76px)}
#hud.mini{padding:4px 8px}#hud .mid{font-size:16px;font-weight:bold;white-space:nowrap}#hud .mid .more{font-size:11px;color:#888;margin-left:6px;font-weight:normal}
body.dark #hud .mid .more{color:#aab6af}
#hud .turn{display:flex;align-items:center;gap:8px;margin:0 0 4px;padding:3px 10px 3px 4px;border-radius:10px;background:#fdecea;color:#c0392b;font-size:15px;font-weight:normal}
#hud .turn .tar{font-size:48px;line-height:1;min-width:54px;text-align:center;font-weight:bold}
#hud .turn .ttx{line-height:1.25}
#hud .turn .ttx b{display:block;font-size:24px}
#hud .turn.now{background:#c0392b;color:#fff}
/* 版17：何をしたいかの切り替え（目的地へ／周回／電車をはさむ） */
#rmodeBar{margin:0 0 6px}
#rmodeBar .chips{display:flex;gap:4px;width:100%}
#panel #rmodeBar .chips button{flex:1;min-height:46px;border-radius:12px;padding:4px 2px;font-size:14px;font-weight:bold;white-space:nowrap}
#tab-route [data-rm]{display:none}
body.rm-to #tab-route [data-rm~="to"],body.rm-loop #tab-route [data-rm~="loop"],body.rm-train #tab-route [data-rm~="train"]{display:block}
#rhint{display:none;margin:2px 4px 8px;font-size:15px;color:#1e5631;font-weight:bold}
body:not(.rc-on) #rhint{display:block}
body:not(.rc-on) #routeCard{display:none}
#calcNote:empty{display:none}
#calcNote{margin:4px 0 0}
/* 版17：大きな切り替えスイッチ（行全体を押せる） */
label.sw{display:flex;align-items:center;gap:10px;min-height:44px;padding:4px 0;border-bottom:1px solid #eef2ef;cursor:pointer;font-size:15px;color:var(--ink)}
label.sw:last-of-type{border-bottom:none}
label.sw .swt{flex:1;line-height:1.35}
label.sw .swt small{display:block;font-size:12px;color:#5d6b63;margin-top:1px}
label.sw input{appearance:none;-webkit-appearance:none;flex:0 0 52px;width:52px;height:30px;margin:0;border-radius:15px;background:#c9d3cd;position:relative;transition:background .15s;cursor:pointer}
label.sw input::before{content:'';position:absolute;left:3px;top:3px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);transition:left .15s}
label.sw input:checked{background:var(--g)}
label.sw input:checked::before{left:25px}
label.sw input:disabled{opacity:.45}
/* 版19：おまかせ散歩のボタン・案の一覧 */
#panel #omBtn{display:none;width:100%;min-height:58px;margin:0 0 8px;border-radius:14px;border:none;background:linear-gradient(135deg,#2fbf71,#1e7e34);color:#fff;font-size:18px;font-weight:bold;text-align:center;line-height:1.25;box-shadow:0 2px 6px rgba(30,126,52,.35)}
#panel #omBtn small{display:block;font-size:12px;font-weight:normal;opacity:.9}
body:not(.has-route):not(.walking) #panel #omBtn{display:block}
#candList{display:flex;flex-direction:column;gap:4px;margin:6px 0 0}
#candList:empty{display:none}
#panel #candList .cand{text-align:left;min-height:38px;padding:4px 12px;font-size:14px}
#panel #candList .cand.on{background:var(--gl);border-color:var(--g);color:var(--g);font-weight:bold}
.csort{font-size:13px;color:#5d6b63;display:flex;align-items:center;gap:4px;flex-wrap:wrap}
#panel .csort button{min-height:30px;padding:2px 10px;border-radius:15px;font-size:13px}
#panel .csort button.on{background:var(--g);border-color:var(--g);color:#fff}
/* 版18：地図の長押しの枠（画面の下から） */
#lpBox{display:none;position:fixed;left:8px;right:8px;bottom:72px;z-index:40;background:#fff;border-radius:16px;padding:10px 12px 12px;box-shadow:0 4px 18px rgba(0,0,0,.35)}
body.lp #lpBox{display:block}
body.walking #lpBox{bottom:72px}
@media (min-width:900px){#lpBox{left:auto;right:396px;width:340px}}
.lpH{font-weight:bold;color:#1e5631;margin:0 0 6px;font-size:15px}
#lpBox .lpB{display:block;width:100%;min-height:46px;margin:0 0 6px;border-radius:12px;border:1px solid var(--line);background:#fff;color:var(--ink);font-size:15px;text-align:left;padding:6px 14px}
#lpBox .lpB.primary{background:var(--g);border-color:var(--g);color:#fff;font-weight:bold}
#lpBox #lpNo{margin:0;text-align:center}
.lpMk{width:22px;height:22px;border-radius:50%;background:#ff5e5b;border:3px solid #fff;box-shadow:0 0 0 6px rgba(255,94,91,.3),0 1px 4px rgba(0,0,0,.4)}
/* 版18：🗂 地図の表示の切り替え */
#layerBox{display:none;position:absolute;right:62px;top:116px;z-index:5;width:236px;background:#fff;border-radius:14px;padding:4px 12px;box-shadow:0 2px 12px rgba(0,0,0,.3)}
#layerBox.on{display:block}
body.mode-tk #layerBox,body.mode-tabi #layerBox{display:none}
/* 版18：あそぶのまとめ */
#ptiles{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0 0 8px}
@media (min-width:600px) and (max-width:899px){#ptiles{grid-template-columns:repeat(4,1fr)}}
#panel #ptiles .pt{position:relative;display:flex;flex-direction:column;align-items:flex-start;min-height:0;padding:6px 12px 6px;border-radius:14px;border:1px solid #e1e8e3;background:#fff;text-align:left;line-height:1.15}
#ptiles .pi{position:absolute;right:10px;top:8px;font-size:20px}
#ptiles b{font-size:26px;color:#1e5631}
#ptiles .pl{font-size:13px;color:#5d6b63;font-weight:bold}
#ptiles .ps{font-size:12px;color:#d35400;min-height:14px}
.tkbl{display:flex;justify-content:space-between;font-size:13px;font-weight:bold;color:#6e2c00;margin:6px 2px 2px}
.tkbar{background:#e8ece9;border-radius:8px;height:16px;margin:0 0 6px;overflow:hidden}
#tkBar{background:#e67e22;height:16px;border-radius:8px;width:0}
/* 版17：歩行中の「画面ON」は入のとき黄色 */
#tab #wakeBtn.on{background:#ffd23f;border-color:#e0b400;color:#3a2e00}
/* 版14：電車をはさむ（駅の候補は押して選ぶ） */
#trainBox{display:none;border-top:1px dashed var(--line);margin:8px 0 0;padding:6px 0 0}
#trainBox.on{display:block}
.trList{display:flex;flex-direction:column;gap:4px;margin:4px 0}
#panel .trList button{text-align:left;min-height:40px;line-height:1.4;padding:5px 10px}
#panel .trList button.on{background:var(--gl);border-color:var(--g);color:var(--g);font-weight:bold}
.trList .sm{display:block;font-size:13px;font-weight:normal;color:#5d6b63}
.trList .ln{font-size:12px;font-weight:normal;color:#5d6b63;margin-left:6px}
.trT{font-size:14px;color:#1f6fd1;margin-left:4px}
/* 版13：文字の大きさ（--fz＝1／1.15／1.3）。タブの中身・左上の案内・吹き出しは丸ごと拡大、下の帯とタブは文字だけ */
.pane,#warn,#status,#err,#hud,#tip{zoom:var(--fz,1)}
#tab button{font-size:min(16px,calc(14px * var(--fz,1)));white-space:normal}
#tabbar .tb{font-size:min(15px,calc(12px * var(--fz,1)))}
#mbar{font-size:calc(14px * var(--fz,1))}
.mapboxgl-popup-content{font-size:calc(13px * var(--fz,1))}
.pmk{font-size:calc(12px * var(--fz,1))}
#helpBox{font-size:calc(15px * var(--fz,1))}
/* 版12：暗い画面（版13：背景を少し明るく、文字はくっきり〔コントラスト比7以上〕） */
body.dark{--ink:#f1f5f2;--line:#4a5852;--gl:#1f4a2c;background:#1e2522;color:var(--ink);color-scheme:dark}
body.dark #panel{background:#1e2522;border-color:#3a4641}
body.dark .card,body.dark details{background:#28322e;border-color:#3d4a45;box-shadow:none}
body.dark .ch,body.dark summary{color:#a8e0b4}
body.dark #prefSum{color:#c9d3cd}
body.dark #panel button,body.dark #panel input[type=number],body.dark #panel input:not([type]),body.dark #search,body.dark select{background:#34403b;color:var(--ink);border-color:var(--line)}
body.dark #panel button.primary{background:#1e7e34;border-color:#3aa85a;color:#fff}
body.dark #panel button.danger{color:#ffb3a8;border-color:#8a4a44}
body.dark #panel .chips button.on{background:#1e7e34;border-color:#3aa85a;color:#fff}
body.dark .tg label{background:#34403b;border-color:var(--line)}
body.dark .tg label:has(input:checked){background:var(--gl);border-color:#3aa85a;color:#c4f0cf}
body.dark .small{color:#c9d3cd}
body.dark .row{color:#e6ece8}
body.dark #sub{color:#dbe3de}
body.dark #result{color:#a9c8ff}
body.dark a,body.dark .trT{color:#a9c8ff}
body.dark #panel .trList button.on{background:var(--gl);border-color:#3aa85a;color:#c4f0cf}
body.dark .trList .sm,body.dark .trList .ln{color:#c9d3cd}
body.dark .hit{background:#28322e;border-color:#3d4a45}
body.dark .lst{border-color:#3d4a45}
body.dark #prof{filter:invert(.88) hue-rotate(180deg);border-color:#3d4a45}
body.dark [style*="color:#333"]{color:#e6ece8!important}
body.dark [style*="color:#1e7e34"]{color:#8fe3a3!important}
body.dark [style*="color:#c0392b"],body.dark [style*="color:#c00"]{color:#ffb3a8!important}
body.dark [style*="background:#e8ece9"]{background:#3d4a45!important}
body.dark .fav,body.dark #warn,body.dark #impBox,body.dark #favForm,body.dark #routeWhy{background:#3a321c;border-color:#a8862a;color:#f7ebc4}
body.dark .ask{background:#45231f;border-color:#8a4a44;color:#ffd6cf}
body.dark #tabbar{background:#242c29;border-color:#3a4641}
body.dark #tabbar .tb{color:#cdd6d1}
body.dark #tabbar .tb .ic{filter:none;opacity:.9}
body.dark #tabbar .tb.on{color:#8fe3a3}
body.dark #tabbar .tb.on::after{background:#8fe3a3}
body.dark #tabbar .fab{border-color:#242c29}
body.dark #tab{background:#242c29;border-color:#3a4641}
body.dark #tab button{background:#34403b;color:var(--ink);border-color:var(--line)}
body.dark #tab #endBtn{background:#c0392b;border-color:#c0392b;color:#fff}
body.dark #hud{background:rgba(36,44,41,.95);color:#f6f8f7;box-shadow:0 1px 6px rgba(0,0,0,.6)}
body.dark #hud .turn{background:#5a2620;color:#ffc2b8}
body.dark #hud .turn.now{background:#c0392b;color:#fff}
body.dark #hud [style*="color:#555"]{color:#d4ddd8!important}
body.dark #hud [style*="color:#1f6fd1"]{color:#a9c8ff!important}
body.dark #hud [style*="color:#b9770e"]{color:#ffd27a!important}
body.dark #hud [style*="background:#fdecea"]{background:#5a2620!important;color:#ffc2b8!important}
body.dark #mapBtns button{background:#34403b;color:#a9c8ff;box-shadow:0 1px 5px rgba(0,0,0,.6)}
body.dark #mapBtns button.on{background:#1f6fd1;color:#fff}
body.dark #grip::before{background:#c9d3cd;box-shadow:0 0 0 3px rgba(36,44,41,.9),0 1px 4px rgba(0,0,0,.5)}
body.dark #mbar{background:rgba(48,43,30,.94);color:#f6f8f7;border-color:#a8862a}
body.dark #mbar button{color:#f6f8f7;border-color:#6a6a6a}
body.dark #mbMore{border-color:#6a5a28}
body.dark .mapboxgl-popup-content,body.dark .meshPop .mapboxgl-popup-content{background:rgba(36,44,41,.92);color:#f1f5f2}
body.dark .mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip{border-top-color:rgba(36,44,41,.92)!important}
body.dark .mapboxgl-popup-anchor-top .mapboxgl-popup-tip{border-bottom-color:rgba(36,44,41,.92)!important}
body.dark .mapboxgl-popup-close-button{color:#f1f5f2}
body.dark .pmk{background:#28322e;color:#f1f5f2;border-color:#c9d3cd}
body.dark #tip{background:#3a321c;color:#f7ebc4;border-color:#a8862a}
body.dark #tip b{color:#ffe082}
body.dark #tipX{color:#f7ebc4}
body.dark #helpBox{background:#1e2522;color:var(--ink)}
body.dark #helpBox details{background:none;border-color:#3d4a45}
body.dark #helpBox summary{color:#a8e0b4}
body.dark #helpBox details[open] summary{color:#ffb3a8}
body.dark label.sw{border-color:#3d4a45}
body.dark label.sw .swt small{color:#c9d3cd}
body.dark label.sw input{background:#4a5852}
body.dark label.sw input:checked{background:#2e9e4c}
body.dark #rhint{color:#a8e0b4}
body.dark #panel #candList .cand.on{background:var(--gl);border-color:#3aa85a;color:#c4f0cf}
body.dark .csort{color:#c9d3cd}
body.dark #panel .csort button.on{background:#1e7e34;border-color:#3aa85a;color:#fff}
body.dark #lpBox,body.dark #layerBox{background:#28322e;color:var(--ink);box-shadow:0 4px 18px rgba(0,0,0,.6)}
body.dark .lpH{color:#a8e0b4}
body.dark #lpBox .lpB{background:#34403b;color:var(--ink);border-color:var(--line)}
body.dark #lpBox .lpB.primary{background:#1e7e34;border-color:#3aa85a;color:#fff}
body.dark #panel #ptiles .pt{background:#28322e;border-color:#3d4a45}
body.dark #ptiles b{color:#a8e0b4}
body.dark #ptiles .pl{color:#c9d3cd}
body.dark #ptiles .ps{color:#ffd27a}
body.dark .tkbl{color:#ffd27a}
body.dark .tkbar{background:#3d4a45}
body.dark #tab #wakeBtn.on{background:#ffd23f;border-color:#e0b400;color:#3a2e00}
body.dark .qb,body.dark #panel .qb{background:#34403b;color:#8fe3a3;border-color:#8fe3a3}
/* 版13：夜は現在地の点を大きく */
body.dark .me .dot{left:5px;top:5px;width:24px;height:24px;border-width:3px;box-shadow:0 0 0 3px rgba(30,144,255,.35),0 0 8px rgba(0,0,0,.7)}
`;
  document.head.appendChild(st);

  // ---------- 下のタブ ----------
  const TABS = [['route', '🧭', 'ルート'], ['play', '🟧', 'あそぶ'], ['walk'], ['rec', '🗾', '記録'], ['set', '⚙️', '設定']];
  const bar = document.createElement('nav'); bar.id = 'tabbar';
  bar.innerHTML = TABS.map(([k, ic, nm]) => k === 'walk'
    ? '<button id="walkFab" class="fab"><span class="ic">🚶</span><span id="walkFabTx">記録開始</span></button>'
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
  const waitingRoute = () => !route && !walk && calcState.k !== 'far' && ((mode === 'to' && !!dest) || (mode === 'loop' && calcState.k !== 'idle' && calcState.k !== 'ok'));
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
    // 版17：切り替えで隠れているカードの中なら、その切り替えのボタンを光らせる
    const rc = el && el.closest && el.closest('[data-rm]');
    if (rc && !rc.dataset.rm.split(' ').includes($('rmode').value)) {
      const want = rc.dataset.rm.split(' ')[0], cb = chipOf('rmode');
      return (cb && cb.querySelector(`button[data-v="${want}"]`)) || el;
    }
    return el;
  };

  // ---------- 地図の右の丸いボタン（追従・向き） ----------
  const mb = document.createElement('div'); mb.id = 'mapBtns';
  mb.innerHTML = '<button id="mFollow" title="現在地に追従">◎</button><button id="mHead" title="地図の向き">N</button><button id="mLayer" title="地図に出すもの">🗂</button>';
  $('map').appendChild(mb);
  // 版18：🗂 地図に出すもの（設定・あそぶのスイッチと同じもの。こちらを押すと元のスイッチを入切する）
  const LAYERS = [['meshChk', '🟧 踏破マス'], ['poiShow', '⛩ 神社・寺・公園'], ['walkedChk', '🟢 歩いた道']];
  const lb = document.createElement('div'); lb.id = 'layerBox';
  lb.innerHTML = LAYERS.map(([id, t]) => `<label class="sw"><span class="swt">${t}</span><input type="checkbox" data-for="${id}"></label>`).join('');
  $('map').appendChild(lb);
  const layerSync = () => lb.querySelectorAll('input').forEach(i => { i.checked = $(i.dataset.for).checked; });
  lb.querySelectorAll('input').forEach(i => i.addEventListener('change', () => {
    const r = $(i.dataset.for); if (r.checked === i.checked) return;
    r.checked = i.checked; r.dispatchEvent(new Event('change'));
  }));
  $('mLayer').onclick = e => { e.stopPropagation(); layerSync(); lb.classList.toggle('on'); $('mLayer').classList.toggle('on', lb.classList.contains('on')); };
  // 枠の外を押したら閉じる
  document.addEventListener('pointerdown', e => {
    if (!lb.classList.contains('on') || lb.contains(e.target) || e.target === $('mLayer')) return;
    lb.classList.remove('on'); $('mLayer').classList.remove('on');
  }, true);
  window.layerSync = layerSync;
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
  chips('loopKm', ['約1km', '約2km', '約3km', '約5km']); // 版19：ぴったりでなくてよい（±35%くらいまでの案を出す）
  chips('loopDir', ['おまかせ', '時計回り', '反時計回り']);
  chips('rrMode', ['自動', '聞いてから', 'しない']);
  chips('trKm', ['最寄り', '1km', '2km', '3km']);
  chips('rmode', ['📍 目的地へ', '🔁 ぐるっと周回', '🚃 電車をはさむ']);
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


  // ---------- 版12：境目のつまみ（地図と下の境目を指で上下に。20%〜75%、2回タップで50%） ----------
  const SPLIT0 = 50;
  const grip = document.createElement('div'); grip.id = 'grip'; grip.title = '上下に動かすと地図の広さが変わります（2回タップで半分に戻る）';
  document.body.appendChild(grip);
  function setSplit(v, save) {
    v = Math.max(20, Math.min(75, v));
    document.documentElement.style.setProperty('--split', v.toFixed(1) + '%');
    if (save) lsSet('walk_split', v.toFixed(1));
    return v;
  }
  setSplit(Number(getLS('walk_split')) || SPLIT0);
  let gd = null, gTap = 0, gRaf = 0;
  const resizeMap = () => { if (gRaf) return; gRaf = requestAnimationFrame(() => { gRaf = 0; map.resize(); }); };
  grip.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { grip.setPointerCapture(e.pointerId); } catch (x) {}
    gd = {y: e.clientY, moved: false}; grip.classList.add('drag');
  });
  grip.addEventListener('pointermove', e => {
    if (!gd) return;
    if (Math.abs(e.clientY - gd.y) > 4) gd.moved = true;
    if (!gd.moved) return;
    gd.v = setSplit(e.clientY / window.innerHeight * 100); resizeMap();
  });
  function gripUp() {
    if (!gd) return;
    grip.classList.remove('drag');
    if (gd.moved) { setSplit(gd.v, true); gTap = 0; }
    else if (Date.now() - gTap < 400) { setSplit(SPLIT0, true); gTap = 0; }   // 2回タップで半分に戻す
    else gTap = Date.now();
    gd = null; setTimeout(() => map.resize(), 30);
  }
  grip.addEventListener('pointerup', gripUp);
  grip.addEventListener('pointercancel', gripUp);
  grip.addEventListener('dblclick', e => e.preventDefault());

  // ---------- 版12：画面の明るさ（自動／いつも明るい／いつも暗い）。地図は Mapbox の明るさの切り替え（夕方・明け方・夜） ----------
  // 版13：夜の地図の明るさの上限（夕方くらい〔初め〕／真っ暗な夜／明るいまま）。暗い画面のときはルート・歩いた道の線を太く・濃く
  $('themeSel').value = getLS('walk_theme') || 'auto';
  chips('themeSel', ['自動（夜は暗く）', 'いつも明るい', 'いつも暗い']);
  $('nightSel').value = nightMap();
  chips('nightSel', ['夕方くらい', '真っ暗な夜', '明るいまま']);
  let presetNow = themeState().preset, linesDark = null;
  function nightLines(d) {
    if (linesDark === d || !map.getLayer || !map.getLayer('route')) return;
    linesDark = d;
    const set = (id, k, v) => { try { map.setPaintProperty(id, k, v); } catch (e) {} };
    set('route', 'line-width', d ? 7 : 5);
    set('routeCasing', 'line-width', d ? 12 : 9);
    set('walked', 'line-opacity', d ? 0.85 : 0.55);
    set('walked', 'line-width', d ? ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 12] : ['interpolate', ['linear'], ['zoom'], 12, 3, 17, 10]);
    set('meshRem', 'line-width', d ? 5 : 4);
  }
  function applyTheme() {
    const t = themeState();
    document.body.classList.toggle('dark', t.dark);
    if (t.preset !== presetNow) {
      try { map.setConfigProperty('basemap', 'lightPreset', t.preset); presetNow = t.preset; } catch (e) {}  // 地図の準備がまだなら、次の判定でやり直す
    }
    nightLines(t.dark);
    const tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.setAttribute('content', t.dark ? '#1e2522' : '#1e7e34'); // 版16：画面の上の帯の色
  }
  window.applyTheme = applyTheme;
  $('themeSel').addEventListener('change', () => { lsSet('walk_theme', $('themeSel').value); applyTheme(); syncChips(); });
  $('nightSel').addEventListener('change', () => { lsSet('walk_nightmap', $('nightSel').value); applyTheme(); syncChips(); });
  map.on('style.load', () => { presetNow = ''; applyTheme(); });
  map.on('load', () => { linesDark = null; applyTheme(); });
  applyTheme();
  setInterval(applyTheme, 60000);

  // ---------- 版13：文字の大きさ（標準／大きめ／特大）。CSS の --fz で拡大する ----------
  const FZ = ['1', '1.15', '1.3'];
  $('fontSel').value = FZ.includes(getLS('walk_font')) ? getLS('walk_font') : '1';
  chips('fontSel', ['標準', '大きめ', '特大']);
  function applyFont() {
    document.documentElement.style.setProperty('--fz', $('fontSel').value);
    if (route) setTimeout(() => drawProf(route.a), 50);
  }
  $('fontSel').addEventListener('change', () => { lsSet('walk_font', $('fontSel').value); applyFont(); syncChips(); });
  applyFont();

  // ---------- 版17：何をしたいかの切り替え（目的地へ／周回／電車をはさむ） ----------
  // 見せるカードを変えるだけ。電車をはさむのときは、目的地を決めると歩くルートは計算せず、乗る駅と降りる駅の欄を開く（app.js の calcTo）
  const RHINT = {to: '行き先を検索するか、「📍 地図で指定」を押して地図をタップしてください',
    loop: '距離と向きを選んで「🔁 周回コースを作る」を押してください',
    train: 'まず行き先を検索してください。決めると、乗る駅と降りる駅を選べます'};
  // ルートのカードは、ルート・目的地・計算待ち・電車の欄があるときだけ。ないときは案内の1行
  function updRc() {
    const rcOn = !!route || !!dest || waitingRoute() || $('trainBox').classList.contains('on');
    document.body.classList.toggle('rc-on', rcOn);
    if (!rcOn) $('rhint').textContent = RHINT[$('rmode').value] || RHINT.to;
  }
  window.updRc = updRc;
  const RM = ['to', 'loop', 'train'];
  const rmInit = trip ? 'train' : (mode === 'loop' && route) ? 'loop' : getLS('walk_rmode');
  $('rmode').value = RM.includes(rmInit) ? rmInit : 'to';
  function rmApply() { RM.forEach(k => document.body.classList.toggle('rm-' + k, $('rmode').value === k)); updRc(); }
  $('rmode').addEventListener('change', () => {
    const v = $('rmode').value; lsSet('walk_rmode', v); rmApply(); syncChips();
    if (v === 'train') { if (dest && mode === 'to' && !trip && !$('trainBox').classList.contains('on')) trainOpen(); }
    else if ($('trainBox').classList.contains('on') && !trip) { trainClose(); if (dest && mode === 'to' && !route) calc('to'); }
  });
  rmApply();
  window.rmSet = v => { if ($('rmode').value !== v) { $('rmode').value = v; lsSet('walk_rmode', v); rmApply(); syncChips(); } };
  // ---------- 版16：ホーム画面のアプリ（PWA） ----------
  // サービスワーカー（sw.js）は /walk/ の中のファイルだけを扱う。登録できなくても普通に使える
  // 版20：Android アプリ版（目印 MichiMiruApp）では登録しない（アプリが毎回サイトを読みに行くため）
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !/MichiMiruApp/.test(navigator.userAgent)) navigator.serviceWorker.register('sw.js').catch(() => {});
  const isApp = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  let installEv = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEv = e; appUi(); });
  window.addEventListener('appinstalled', () => { installEv = null; appUi(); status('ホーム画面に MichiMiru を追加しました'); });
  function appUi() {
    const st = $('appState'), btn = $('appAdd'), how = $('appHow');
    if (/MichiMiruApp/.test(navigator.userAgent)) { if (typeof appCard === 'function') appCard(); return; } // 版20：アプリ版の表示は native.js
    if (isApp()) { st.textContent = '📱 ホーム画面のアプリとして起動中'; btn.style.display = 'none'; how.style.display = 'none'; return; }
    st.textContent = 'いまはブラウザで開いています';
    btn.style.display = '';
    how.innerHTML = IOS
      ? 'iPhone：Safari の下の<b>共有ボタン</b>（四角から上向きの矢印）→<b>「ホーム画面に追加」</b>。※iPhone ではホーム画面のアプリと Safari で記録の置き場所が別です。Safari で記録タブの「全部まとめて書き出す」→ アプリで「記録を読み込む」で移せます'
      : installEv ? '' : 'ボタンで出ないときは、Chrome の右上の<b>︙</b>→<b>「ホーム画面に追加」</b>（または「アプリをインストール」）。Android では、ブラウザとホーム画面のアプリで記録は共通です';
  }
  $('appAdd').onclick = async () => {
    if (installEv) { installEv.prompt(); try { await installEv.userChoice; } catch (e) {} installEv = null; appUi(); return; }
    $('appHow').style.display = 'block';
  };
  appUi();

  // ---------- 版12：歩行中の「終了」は2回押し（3秒以内にもう一度で終わる。ポケットの中などでの押し間違いを防ぐ） ----------
  let endArm = 0, endTm = 0;
  function endDisarm() { endArm = 0; clearTimeout(endTm); $('endBtn').classList.remove('arm'); $('endBtn').textContent = '■ 終了'; }
  $('endBtn').textContent = '■ 終了';
  $('endBtn').addEventListener('click', e => {
    if (!walk || window.__noEndConfirm) { endDisarm(); return; }
    if (endArm && Date.now() - endArm < 3000) { endDisarm(); return; }   // 2回目：そのまま終了へ
    e.stopImmediatePropagation();
    endArm = Date.now(); $('endBtn').classList.add('arm'); $('endBtn').textContent = 'もう一度で終了';
    clearTimeout(endTm); endTm = setTimeout(endDisarm, 3000);
  }, true);

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
    updRc(); // 版17
    if (trip && $('rmode').value !== 'train') rmSet('train');
    $('walkFabTx').textContent = route ? '歩き始める' : wr ? (calcState.k === 'calc' ? '計算中…' : '計算待ち') : '記録開始';
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
