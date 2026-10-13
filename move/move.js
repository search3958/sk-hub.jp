// データの引っ越しの受け取り（/move/。sk-hub.jp 側）の動き
//   ・?from=old で古いアドレスのタブ（window.opener）から開かれたら、sk-move:ready を送り続けて、sk-move:data を待つ
//     受け取るのは、古いアドレス（SKMove.OLD）から・開いたタブからのメッセージだけ。返事も SKMove.OLD にだけ送る
//   ・sk-hub.jp に同じアプリのデータがもうあるときは、置きかえるかどうかを聞く（conflict）。古いアドレスのタブには sk-move:conflict で知らせる
//   ・アプリごとに書き込み（SKMove.apply）、sk-move:progress で古いアドレスのタブにも進み具合を知らせる。終わったら sk-move:done
//   ・ファイルから読み込むとき（古いアドレスの「ファイルで移す」で書き出したもの）も、同じ流れ
//   ・?from=old なのに開いたタブが見えないとき（LINE の中のブラウザ・ホーム画面のアプリなどで、同じタブで開いた）は、
//     タブどうしで渡せないので、古いアドレスの /move/?file（ファイルに書き出す）に案内する
//   ・移したら localStorage の sk_moved_in に記録する（このページを直接開いたときに「前に移しました」と出す）
(function () {
  "use strict";
  var M = window.SKMove;
  var I18N = window.SKI18N;
  function t(s, v) { return I18N ? I18N.t(s, v) : s.replace(/\{(\w+)\}/g, function (m, k) { return v && v[k] != null ? v[k] : m; }); }

  var APPS = {
    toolbox: { name: "SK's Toolbox", icon: "home_repair_service" },
    nagi: { name: "Nagi", icon: "timer" },
    malu: { name: "MALU", icon: "menu_book" },
    lab: { name: "SK's Lab", icon: "science" },
    site: { name: "サイトの設定", icon: "tune" }
  };

  var screens = {};
  document.querySelectorAll(".screen").forEach(function (s) { screens[s.dataset.screen] = s; });
  var bar = document.getElementById("bar"), current = "intro";
  var lockUntil = 0;
  document.addEventListener("click", function (e) {
    if (Date.now() < lockUntil) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  function raise() {
    var b = screens[current].querySelector(".bottom");
    if (b) b.classList.toggle("is-raised", document.documentElement.scrollHeight - scrollY - innerHeight > 4);
  }
  addEventListener("scroll", raise, { passive: true });
  addEventListener("resize", raise);
  // この画面では戻らない（移している途中・終わったあとに intro に戻ると、もう一度移せてしまう）
  bar.classList.remove("has-back");
  function show(name) {
    if (!screens[name] || name === current) return;
    lockUntil = Date.now() + 450;
    screens[current].classList.remove("is-on", "in-fwd", "in-back");
    var el = screens[name];
    el.classList.remove("in-fwd", "in-back");
    el.classList.add("is-on", "in-fwd");
    current = name;
    scrollTo(0, 0);
    raise();
    var h = el.querySelector("h1");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
  }
  raise();

  // 古いアドレスへのリンク（手元で確かめるときは localhost:8765）
  document.querySelectorAll('a[href^="https://sy9-k.github.io"]').forEach(function (a) { a.href = a.href.replace("https://sy9-k.github.io", M.OLD); });

  function avatar(id) {
    var a = document.createElement("span");
    a.className = "avatar avatar--" + id;
    var i = document.createElement("span");
    i.className = "msr";
    i.textContent = APPS[id].icon;
    a.appendChild(i);
    return a;
  }
  function row(id, sub, tag) {
    var li = document.createElement(tag || "li");
    li.className = "item";
    li.dataset.group = id;
    li.appendChild(avatar(id));
    var text = document.createElement("span");
    text.className = "item-text";
    var b = document.createElement("b");
    b.textContent = t(APPS[id].name);
    text.appendChild(b);
    if (sub) { var s = document.createElement("small"); s.textContent = sub; text.appendChild(s); }
    li.appendChild(text);
    return li;
  }

  // 前に移したことがあれば
  try {
    var before = JSON.parse(localStorage.getItem("sk_moved_in") || "null");
    if (before && before.at) {
      var d = new Date(before.at);
      document.getElementById("moved-before-text").textContent = t("この端末では、{date} に古いアドレスからデータを移しています。もう一度移すと、そのときの内容に置きかわります。", { date: d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
      document.getElementById("moved-before").hidden = false;
    }
  } catch (e) { /* 記録が読めなければ出さない */ }

  // ---- 古いアドレスのタブとのやりとり ----
  var fromOld = /[?&]from=old\b/.test(location.search);
  var opener = fromOld ? window.opener : null;
  function tell(msg) { if (opener && !opener.closed) { try { opener.postMessage(msg, M.OLD); } catch (e) { /* 古いタブが閉じていれば知らせない */ } } }

  function fail(text) {
    document.getElementById("error-sub").textContent = t(text);
    tell({ type: "sk-move:error" });
    show("error");
  }

  // 受け取ったデータを書き込む
  function receive(p) {
    if (!M.valid(p)) return fail("データの形が正しくありませんでした。");
    var ids = M.GROUPS.map(function (g) { return g.id; }).filter(function (id) { return M.count(p.groups[id]) > 0; });
    if (!ids.length) return fail("移すデータがありませんでした。");
    Promise.all(ids.map(M.hasData)).then(function (has) {
      var clash = ids.filter(function (id, i) { return has[i]; });
      if (!clash.length) return run(p, ids, []);
      var ul = document.getElementById("conflicts");
      ul.innerHTML = "";
      clash.forEach(function (id) { ul.appendChild(row(id, t("sk-hub.jp にデータがあります"))); });
      tell({ type: "sk-move:conflict", ids: clash });
      show("conflict");
      document.getElementById("replace").onclick = function () { run(p, ids, []); };
      document.getElementById("keep").onclick = function () { run(p, ids, clash); };
    });
  }

  function run(p, ids, skip) {
    var list = document.getElementById("progress"), linear = document.getElementById("linear");
    list.innerHTML = "";
    ids.forEach(function (id) {
      var li = row(id);
      var st = document.createElement("span");
      st.className = "status";
      st.innerHTML = '<span class="wait"></span><span class="spin" aria-hidden="true"></span><span class="msr msr--fill">check_circle</span>';
      st.querySelector(".wait").textContent = t("待機中");
      st.querySelector(".msr").setAttribute("aria-label", t("完了"));
      li.appendChild(st);
      list.appendChild(li);
    });
    linear.style.width = "0";
    show("moving");
    var moved = [], i = 0;
    function mark(id, state) {
      var li = list.querySelector('.item[data-group="' + id + '"]');
      li.classList.remove("is-busy");
      li.classList.add("is-" + state);
      if (state === "skip") li.querySelector(".wait").textContent = t("そのまま");
      tell({ type: "sk-move:progress", id: id, state: state });
    }
    (function next() {
      linear.style.width = (i / ids.length * 100) + "%";
      if (i === ids.length) return setTimeout(finish, 450);
      var id = ids[i++];
      if (skip.indexOf(id) >= 0) { mark(id, "skip"); return setTimeout(next, 200); }
      list.querySelector('.item[data-group="' + id + '"]').classList.add("is-busy");
      tell({ type: "sk-move:progress", id: id, state: "busy" });
      // 速すぎると何が起きたか分からないので、1 件ごとに少し待つ
      Promise.all([M.apply(id, p.groups[id]), new Promise(function (r) { setTimeout(r, 500); })]).then(function () {
        moved.push(id);
        mark(id, "done");
        next();
      }, function () { fail("データを書き込めませんでした。ブラウザの空き容量が足りないかもしれません。"); });
    })();

    function finish() {
      try { localStorage.setItem("sk_moved_in", JSON.stringify({ at: Date.now(), from: p.from || M.OLD, groups: moved })); } catch (e) { /* 記録できなくても移せている */ }
      tell({ type: "sk-move:done", count: moved.length, moved: moved });
      // 移したあとの画面: 移したアプリを、すぐ開けるように
      var ul = document.getElementById("moved");
      ul.innerHTML = "";
      moved.forEach(function (id) {
        var li = document.createElement("li");
        var a = row(id, t("{n} 件", { n: M.count(p.groups[id]) }), "a");
        a.removeAttribute("data-group");
        a.className = "item m3-state";
        a.href = M.group(id).href;
        var go = document.createElement("span");
        go.className = "msr";
        go.setAttribute("aria-hidden", "true");
        go.textContent = "chevron_right";
        a.appendChild(go);
        li.appendChild(a);
        ul.appendChild(li);
      });
      skip.forEach(function (id) { ul.appendChild(row(id, t("sk-hub.jp にあったデータをそのまま使います"))); });
      document.getElementById("done-sub").textContent = moved.length
        ? t("{n} 件のデータを移しました。sk-hub.jp で、いつものように使えます。", { n: moved.length })
        : t("sk-hub.jp にあったデータを、そのまま使います。");
      show("done");
    }
  }

  // ファイルから読み込む
  document.getElementById("file").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    M.fromFile(f).then(receive, function () { fail("読み込めませんでした。古いアドレスの「ファイルで移す」で書き出したファイルを選んでください。"); });
  });

  if (opener) {
    show("wait");
    var got = false;
    addEventListener("message", function (e) {
      if (got || e.origin !== M.OLD || e.source !== opener || !e.data || e.data.type !== "sk-move:data") return;
      got = true;
      clearInterval(ping);
      receive(e.data.payload);
    });
    // 古いアドレスのタブが、このタブを開いたあとに聞きはじめても届くよう、来るまで送り続ける
    var ping = setInterval(function () { if (!got) tell({ type: "sk-move:ready" }); }, 500);
    tell({ type: "sk-move:ready" });
    setTimeout(function () { if (!got) { clearInterval(ping); fail("古いアドレスのタブから、データが届きませんでした。"); } }, 30000);
  } else if (fromOld) {
    var again = document.getElementById("to-old-2");
    again.href = M.OLD + "/move/?file";
    again.lastChild.textContent = t("ファイルで移す");
    fail("このブラウザでは、古いアドレスのタブとつながりませんでした。古いアドレスのページで、データをファイルに書き出してから読み込んでください。");
  }
})();
