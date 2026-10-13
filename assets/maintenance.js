// メンテナンス・障害のお知らせの帯（ページのいちばん上）
//   中身は SK Hub Systems の config/maintenance（管理画面 /admin/maintenance/ で変える。だれでも読める）
//     { active, level: info|warning|maintenance, message, services: [], startsAt, endsAt, updatedAt, updatedBy }
//     services が空ならすべてのページ。指定があれば、そのサービスのページと、ホーム・稼働状況・サポートにだけ出す
//   読み込みはログインなしの REST（support/articles.js と同じ）。結果は 5 分だけ sessionStorage に取っておく
//   読めない・ない・期間の外・閉じた（同じお知らせはこのタブでは出さない）ときは、何もしない
//   sy9-k/sy9-k.github.io と sy9-k/sk-hub.jp の 2 つのリポジトリに、同じファイルを置く（直すときは両方を同じに）
//   管理画面のプレビュー: <script src="/assets/maintenance.js" data-manual> で読み込むと自分では出さず、window.SKMaintenance.render(data) を使える
(function () {
  "use strict";
  var HUB = { projectId: "y-filter-systems", apiKey: "AIzaSyB4gqzPEPyP0NrEJw33-OTAxUrF48MmiuI" }; // frameworks/check.js と同じ
  var URL_ = "https://firestore.googleapis.com/v1/projects/" + HUB.projectId + "/databases/(default)/documents/config/maintenance?key=" + HUB.apiKey;
  var CACHE_KEY = "sk_maintenance";
  var CLOSED_KEY = "sk_maintenance_closed";
  var CACHE_MS = 5 * 60 * 1000;
  var SERVICE_PATHS = {
    "y-filter": ["/y-filter/", "/products/y-filter/"],
    malu: ["/dictionary/", "/products/malu/"],
    nagi: ["/nagi/", "/products/nagi/"],
    toolbox: ["/toolbox/"],
    account: ["/account/", "/sk-hub-systems/"],
    lab: ["/lab/", "/qr-prj/", "/smart-dash/"],
    view: ["/view/"]
  };
  var ALWAYS = /^\/(status\/|support\/)?$/; // ホーム・稼働状況・サポートには、いつも出す
  var LEVEL = {
    info: { label: "お知らせ", icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z" },
    warning: { label: "障害", icon: "M1 21h22L12 2 1 21Zm12-3h-2v-2h2v2Zm0-4h-2v-4h2v4Z" },
    maintenance: { label: "メンテナンス", icon: "M22.7 19 13.6 9.9c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4Z" }
  };
  var t = function (s) { return window.SKI18N ? window.SKI18N.t(s) : s; };

  // REST の値（{ stringValue } など）をふつうの値に
  function plain(v) {
    if (!v) return null;
    if ("stringValue" in v) return v.stringValue;
    if ("booleanValue" in v) return v.booleanValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("timestampValue" in v) return Date.parse(v.timestampValue);
    if ("nullValue" in v) return null;
    if ("arrayValue" in v) return (v.arrayValue.values || []).map(plain);
    return null;
  }
  function fromRest(doc) {
    var f = (doc && doc.fields) || {};
    var out = {};
    Object.keys(f).forEach(function (k) { out[k] = plain(f[k]); });
    return out;
  }
  function ms(v) { return v == null ? null : typeof v === "number" ? v : v.toMillis ? v.toMillis() : Date.parse(v); }

  function live(m, now) {
    if (!m || !m.active || !m.message) return false;
    var start = ms(m.startsAt), end = ms(m.endsAt);
    return (!start || start <= now) && (!end || end > now);
  }
  function forThisPage(m, path) {
    var services = m.services || [];
    if (!services.length || ALWAYS.test(path)) return true;
    return services.some(function (s) { return (SERVICE_PATHS[s] || []).some(function (p) { return path.indexOf(p) === 0; }); });
  }

  var STYLE = ".skm{position:relative;z-index:60;display:flex;align-items:flex-start;gap:10px;margin:0;padding:10px max(16px,env(safe-area-inset-right)) 10px max(16px,env(safe-area-inset-left));font:500 14px/1.6 system-ui,-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif;color:#1b1b1f;background:#dbe4ff}" +
    ".skm--warning{background:#ffe2a8}.skm--maintenance{background:#ffd8c2}" +
    ".skm svg{flex:none;width:20px;height:20px;margin-top:1px;fill:currentColor}" +
    ".skm p{flex:1;min-width:0;margin:0;white-space:pre-wrap;overflow-wrap:anywhere}" +
    ".skm strong{margin-right:8px}.skm small{display:block;font-size:12.5px;opacity:.8}" +
    ".skm button{flex:none;width:32px;height:32px;margin:-4px -6px -4px 0;border:0;border-radius:16px;background:none;color:inherit;font-size:20px;line-height:1;cursor:pointer}" +
    ".skm button:hover{background:rgba(0,0,0,.08)}" +
    "@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .skm{color:#e4e1e6;background:#24365e}:root:not([data-theme=light]) .skm--warning{background:#5a4300}:root:not([data-theme=light]) .skm--maintenance{background:#6a2f12}}" +
    ":root[data-theme=dark] .skm{color:#e4e1e6;background:#24365e}:root[data-theme=dark] .skm--warning{background:#5a4300}:root[data-theme=dark] .skm--maintenance{background:#6a2f12}";

  function fmt(v) {
    var d = new Date(ms(v));
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  // 帯を作る（closable: 閉じるボタンを出すか）
  function render(m, closable) {
    if (!document.getElementById("skm-style")) {
      var st = document.createElement("style");
      st.id = "skm-style";
      st.textContent = STYLE;
      document.head.appendChild(st);
    }
    var level = LEVEL[m.level] ? m.level : "info";
    var box = document.createElement("div");
    box.className = "skm skm--" + level;
    box.setAttribute("role", level === "info" ? "status" : "alert");
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", LEVEL[level].icon);
    svg.appendChild(path);
    var p = document.createElement("p");
    var strong = document.createElement("strong");
    strong.textContent = t(LEVEL[level].label);
    p.appendChild(strong);
    p.appendChild(document.createTextNode(m.message || ""));
    if (m.startsAt || m.endsAt) {
      var when = document.createElement("small");
      when.textContent = (m.startsAt ? fmt(m.startsAt) : "") + " 〜 " + (m.endsAt ? fmt(m.endsAt) : "");
      p.appendChild(when);
    }
    box.appendChild(svg);
    box.appendChild(p);
    if (closable) {
      var close = document.createElement("button");
      close.type = "button";
      close.setAttribute("aria-label", t("閉じる"));
      close.textContent = "×";
      close.addEventListener("click", function () {
        box.remove();
        try { sessionStorage.setItem(CLOSED_KEY, String(ms(m.updatedAt) || m.message)); } catch (e) { /* 何もしない */ }
      });
      box.appendChild(close);
    }
    return box;
  }

  function load() {
    try {
      var cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.data);
    } catch (e) { /* 読み直す */ }
    return fetch(URL_, { cache: "no-store", credentials: "omit" })
      .then(function (res) { return res.ok ? res.json().then(fromRest) : null; })
      .catch(function () { return null; })
      .then(function (data) {
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: data })); } catch (e) { /* 何もしない */ }
        return data;
      });
  }

  function show(m) {
    if (!live(m, Date.now()) || !forThisPage(m, location.pathname)) return;
    try { if (sessionStorage.getItem(CLOSED_KEY) === String(ms(m.updatedAt) || m.message)) return; } catch (e) { /* 出す */ }
    if (document.querySelector(".skm")) return;
    document.body.insertBefore(render(m, true), document.body.firstChild);
  }

  window.SKMaintenance = { render: render, live: live, SERVICE_PATHS: SERVICE_PATHS };
  var me = document.currentScript;
  if (me && me.hasAttribute("data-manual")) return;
  // LINE のミニアプリ・埋め込みでは出さない
  if (/[?&](embed|line)\b/.test(location.search)) return;
  var start = function () { load().then(show); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
