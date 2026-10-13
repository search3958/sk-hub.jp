// LINE in SK's Toolbox（LINE ミニアプリ。LINE Developers の「SK's Toolbox」チャネル）
//   ・LINE のミニアプリとして開いたとき（エンドポイント https://sk-hub.jp/toolbox/?line=dev など）だけ、LIFF の SDK を読み込む
//       ?line=dev … 開発用・?line=review … 審査用・?line=1 … 本番用。最初のページで覚えて（sessionStorage の sk_line）、ほかのページでも同じ ID を使う
//   ・<html class="in-line"> … LINE の中。アプリとして入れるボタンやサイトのヘッダーを隠す（/toolbox/shared/m3.css）
//   ・window.SKLine
//       inLine            … LINE のミニアプリの中か
//       ready             … Promise（LINE の中: 初期化が終わったら。プロフィールを読めたら name・picture が入る）
//       name / picture    … LINE の名前とアイコン（画面に出すだけ。保存も送信もしない）
//       card(o)           … カード（Flex Message）を作る { alt, kicker, title, sub, rows: [[左, 右]], color, url, button }
//       share(card, text) … LINE の友だち・グループに送る。LINE の外（ふつうのブラウザ）では、text を LINE の共有のリンクで送る
//                            LINE の中では、カードのボタンの URL（/toolbox/ のページ）を、LINE のミニアプリで開くリンク（パーマネントリンク）に変える
//       openExternal(url) … ふつうのブラウザで開く（LINE の中ではできないこと: ログイン・オンライン同期・招待コードでの参加）
//       recommend()       … SK's Toolbox を友だちにすすめるカード
//   ・LINE の名前・アイコンは画面に出すだけで、どこにも保存・送信しない。カードは、利用者が選んだ相手に、利用者の操作で送る
(function () {
  "use strict";
  if (window.SKLine || /[?&]embed\b/.test(location.search)) return;
  var I18N = window.SKI18N;
  function t(s, p) { return I18N ? I18N.t(s, p) : s.replace(/\{(\w+)\}/g, function (m, k) { return p && k in p ? p[k] : m; }); }

  var LIFF_IDS = { dev: "2011967990-MpCNyAJD", review: "2011967991-7CejXF81", prod: "2011967992-h4iZeucd" };
  var SDK = "https://static.line-scdn.net/liff/edge/2/sdk.js";
  var q = new URLSearchParams(location.search);
  var env = null;
  try {
    var p = q.get("line");
    if (p) sessionStorage.setItem("sk_line", p === "dev" || p === "review" ? p : "prod");
    env = sessionStorage.getItem("sk_line");
  } catch (e) { /* 使えない */ }
  // LINE のミニアプリから来たとき（LIFF が付けるパラメーター）も
  if (!env && (q.has("liff.state") || q.has("liff.referrer"))) env = "prod";

  var api = { inLine: !!env, ready: Promise.resolve(null), name: "", picture: "" };
  window.SKLine = api;
  if (api.inLine) document.documentElement.classList.add("in-line");

  // ---- カード（Flex Message の bubble）----
  api.card = function (o) {
    var color = /^#[0-9a-f]{6}$/i.test(o.color || "") ? o.color : "#2563eb";
    var body = [];
    if (o.kicker) body.push({ type: "text", text: String(o.kicker).slice(0, 60), size: "xs", color: "#8a8f98", weight: "bold", wrap: true });
    body.push({ type: "text", text: String(o.title || "SK's Toolbox").slice(0, 100), size: "xl", weight: "bold", wrap: true, color: color });
    if (o.sub) body.push({ type: "text", text: String(o.sub).slice(0, 300), size: "sm", color: "#5f6368", wrap: true });
    (o.rows || []).slice(0, 12).forEach(function (r) {
      body.push({ type: "box", layout: "baseline", spacing: "md", contents: [
        { type: "text", text: String(r[0] || " ").slice(0, 30), size: "sm", color: "#8a8f98", flex: 3 },
        { type: "text", text: String(r[1] || " ").slice(0, 80), size: "sm", color: "#202124", wrap: true, flex: 7 }
      ] });
    });
    var bubble = { type: "bubble", size: "kilo", body: { type: "box", layout: "vertical", spacing: "sm", contents: body } };
    if (o.url) bubble.footer = { type: "box", layout: "vertical", contents: [
      { type: "button", style: "primary", height: "sm", color: color, action: { type: "uri", label: String(o.button || t("SK's Toolbox で開く")).slice(0, 40), uri: o.url } }
    ] };
    return { type: "flex", altText: String(o.alt || o.title || "SK's Toolbox").slice(0, 400), contents: bubble };
  };

  // ---- 「LINE で送る」のボタン（.line-btn。見た目は /toolbox/shared/m3.css）----
  var GLYPH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3.2c-5 0-9 3.3-9 7.4 0 3.7 3.2 6.7 7.6 7.3.3.1.7.2.8.5.1.2.1.6 0 .8l-.1.8c0 .2-.2.9.8.5 1-.4 5.4-3.2 7.4-5.4 1.4-1.5 2-3 2-4.5 0-4.1-4-7.4-9-7.4z"/></svg>';
  api.button = function (label) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "line-btn";
    b.innerHTML = GLYPH;
    var s = document.createElement("span");
    s.textContent = label || t("LINE で送る");
    b.appendChild(s);
    return b;
  };

  // ---- 送る ----
  function shareLink(text) {
    var url = "https://line.me/R/share?text=" + encodeURIComponent(text);
    var w = window.open(url, "_blank", "noopener");
    if (!w) location.href = url;
    return Promise.resolve("link");
  }
  // LINE の中: カードのボタンを、ミニアプリで開くリンクに（できなければ、そのままの URL）
  function toLineLink(card) {
    var btn = card.contents && card.contents.footer && card.contents.footer.contents[0];
    var uri = btn && btn.action && btn.action.uri;
    var liff = window.liff;
    if (!uri || uri.indexOf("https://sk-hub.jp/toolbox/") !== 0 || !liff || !liff.permanentLink || !liff.permanentLink.createUrlBy) return Promise.resolve(card);
    return liff.permanentLink.createUrlBy(uri).then(function (u) { if (u) btn.action.uri = u; return card; }, function () { return card; });
  }
  api.share = function (card, text) {
    if (!api.inLine) return shareLink(text);
    return api.ready.then(function () {
      var liff = window.liff;
      if (!liff || !liff.isApiAvailable || !liff.isApiAvailable("shareTargetPicker")) return shareLink(text);
      return toLineLink(card).then(function (c) { return liff.shareTargetPicker([c], { isMultiple: true }); }).then(function (res) { return res ? "sent" : "cancel"; });
    });
  };
  api.openExternal = function (url) {
    var full = new URL(url, location.href).href;
    if (api.inLine && window.liff && window.liff.openWindow) { try { window.liff.openWindow({ url: full, external: true }); return; } catch (e) { /* 下へ */ } }
    location.href = full;
  };
  api.recommend = function () {
    var url = "https://sk-hub.jp/toolbox/";
    return api.share(api.card({
      alt: t("SK's Toolbox をすすめます"), kicker: t("おすすめ"), title: "SK's Toolbox",
      sub: t("時計・Todo・時間割・Countdown・ルーレットが、LINE の中ですぐ使えます。結果や時間割を友だちにカードで送れます。"), color: "#2563eb", url: url, button: t("開いてみる")
    }), t("SK's Toolbox（時計・Todo・時間割・ルーレットなど）") + "\n" + url);
  };

  if (!api.inLine) return;

  // ---- LINE の中: SDK を読み込んで初期化 ----
  api.ready = new Promise(function (resolve) {
    var s = document.createElement("script");
    s.src = SDK;
    s.onload = function () {
      window.liff.init({ liffId: LIFF_IDS[env] || LIFF_IDS.prod }).then(function () {
        if (!window.liff.isLoggedIn()) return null;
        return window.liff.getProfile().catch(function () { return null; });
      }).then(function (prof) {
        if (prof) { api.name = String(prof.displayName || "").slice(0, 40); api.picture = /^https:\/\//.test(prof.pictureUrl || "") ? prof.pictureUrl : ""; }
        document.dispatchEvent(new CustomEvent("sk-line-ready", { detail: { name: api.name, picture: api.picture } }));
        resolve(api);
      }).catch(function (e) { console.warn("[LINE]", e); resolve(null); });
    };
    s.onerror = function () { resolve(null); };
    document.head.appendChild(s);
  });
})();
