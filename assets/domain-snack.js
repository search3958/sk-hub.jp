// sk-hub.jp（新しいアドレス）のお知らせ（アプリ用。SK's Toolbox の各アプリ・Nagi・MALU・SK's Lab）
//   ・アプリにはサイトのヘッダーがないので、ヘッダーの下の帯（index.html の #sk-dn）の代わりに、
//     最初に開いたとき 1 回だけ、画面の下に小さな知らせ（スナックバー）を出す。設定の画面にも同じお知らせを置いている
//   ・アプリの下のボタン（Todo の「新規リマインダー」・Clock のドックなど）にかぶらないよう、下から 88px あける
//   ・1 回出したら、同じ段階（STAGE）のあいだは出さない（localStorage の sk_domain_notice_snack）
//     サイトの帯を閉じた人（sk_domain_notice が同じ段階）にも出さない
//   ・日程が決まった・切り替えたときは、STAGE を index.html の #sk-dn の data-stage とそろえて変える
//     （MALU は Service Worker がこのファイルを保存するので、dictionary/sw.js の CACHE_NAME も上げる）
//   ・出さないところ: iframe の中・LINE のミニアプリ・?embed
(function () {
  "use strict";
  var STAGE = "new";
  if (window.top !== window.self) return;
  if (/[?&](embed|line)\b|[?&]liff\./.test(location.search)) return;
  try {
    if (sessionStorage.getItem("sk_line")) return;
    if (localStorage.getItem("sk_domain_notice") === STAGE || localStorage.getItem("sk_domain_notice_snack") === STAGE) return;
  } catch (e) { return; }

  var I18N = window.SKI18N;
  function t(s) { return I18N && I18N.t ? I18N.t(s) : s; }

  var CSS =
    ".sk-snack{--sk-snack-bg:#303134;--sk-snack-ink:#f1f3f4;--sk-snack-a:#a8c7fa;" +
    "position:fixed;z-index:10001;left:50%;bottom:calc(88px + env(safe-area-inset-bottom, 0px));translate:-50% 0;box-sizing:border-box;" +
    "width:max-content;max-width:min(560px,calc(100vw - 32px));min-height:48px;display:flex;align-items:center;gap:4px;padding:6px 6px 6px 16px;" +
    "border-radius:8px;background:var(--sk-snack-bg);color:var(--sk-snack-ink);box-shadow:0 3px 5px rgba(0,0,0,.2),0 1px 18px rgba(0,0,0,.12);" +
    "font:14px/20px Inter,\"Noto Sans JP\",\"Hiragino Sans\",\"Yu Gothic UI\",Meiryo,system-ui,sans-serif;letter-spacing:.01em;" +
    "animation:sk-snack-in .35s cubic-bezier(.2,0,0,1) both}" +
    ".sk-snack.is-out{animation:sk-snack-out .2s ease both}" +
    ".sk-snack-text{flex:1;min-width:0;padding:4px 8px 4px 0}" +
    ".sk-snack-domain{white-space:nowrap}" +
    ".sk-snack a{flex:none;padding:8px 12px;border-radius:999px;color:var(--sk-snack-a);font-weight:600;text-decoration:none;white-space:nowrap}" +
    ".sk-snack a:hover,.sk-snack button:hover{background:rgba(255,255,255,.1)}" +
    ".sk-snack button{flex:none;display:grid;place-items:center;width:36px;height:36px;margin:0;padding:0;border:0;border-radius:50%;background:transparent;color:inherit;cursor:pointer}" +
    ".sk-snack button svg{width:18px;height:18px}" +
    ".sk-snack a:focus-visible,.sk-snack button:focus-visible{outline:2px solid var(--sk-snack-a);outline-offset:1px}" +
    "@keyframes sk-snack-in{from{opacity:0;transform:translateY(16px)}}" +
    "@keyframes sk-snack-out{to{opacity:0;transform:translateY(16px)}}" +
    "@media (prefers-reduced-motion:reduce){.sk-snack,.sk-snack.is-out{animation:none}}" +
    "@media (prefers-color-scheme:dark){:root:not([data-theme=\"light\"]) .sk-snack{--sk-snack-bg:#e3e3e3;--sk-snack-ink:#1f1f1f;--sk-snack-a:#0b57d0}}" +
    ":root[data-theme=\"dark\"] .sk-snack{--sk-snack-bg:#e3e3e3;--sk-snack-ink:#1f1f1f;--sk-snack-a:#0b57d0}" +
    ":root[data-theme=\"dark\"] .sk-snack a:hover,:root[data-theme=\"dark\"] .sk-snack button:hover{background:rgba(0,0,0,.08)}" +
    "html.in-line .sk-snack{display:none}";

  function show() {
    if (document.querySelector(".sk-snack")) return;
    try { localStorage.setItem("sk_domain_notice_snack", STAGE); } catch (e) { return; }
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    var bar = document.createElement("div");
    bar.className = "sk-snack";
    bar.setAttribute("role", "status");
    var text = document.createElement("span");
    text.className = "sk-snack-text";
    // 「sk-hub.jp」の途中で改行しない
    t("SK の新しいアドレスは sk-hub.jp です").split("sk-hub.jp").forEach(function (part, i) {
      if (i) { var d = document.createElement("span"); d.className = "sk-snack-domain"; d.textContent = "sk-hub.jp"; text.appendChild(d); }
      text.appendChild(document.createTextNode(part));
    });
    var more = document.createElement("a");
    more.href = "/domain/";
    more.textContent = t("詳しく");
    var close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", t("閉じる"));
    close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    bar.appendChild(text);
    bar.appendChild(more);
    bar.appendChild(close);

    var timer = 0;
    function hide() {
      clearTimeout(timer);
      bar.classList.add("is-out");
      setTimeout(function () { bar.remove(); }, 220);
    }
    close.addEventListener("click", hide);
    // 触っているあいだは消さない
    function arm() { clearTimeout(timer); timer = setTimeout(hide, 12000); }
    bar.addEventListener("pointerenter", function () { clearTimeout(timer); });
    bar.addEventListener("pointerleave", arm);
    bar.addEventListener("focusin", function () { clearTimeout(timer); });
    document.body.appendChild(bar);
    arm();
  }

  function later() { setTimeout(show, 1500); }
  if (document.readyState === "complete") later();
  else window.addEventListener("load", later);
})();
