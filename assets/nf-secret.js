// 404 ページのイースターエッグ（_build/pages/404.html だけで読み込む。ほかのページにはない）
//   ・隠しコマンド … キーボードで s → k（スマホは「404」を 5 回タップ）で紙吹雪。ターミナルのヒントを出す
//   ・ひみつのターミナル（assets/terminal.js。開くときに読み込む）… 開き方は 3 つ
//       「`」キー（日本語キーボードは Shift + @）/ いちばん下の大きな「SK」を押す（スマホでも開ける）/ URL の最後に #terminal
//   ・開発者ツールのコンソールに、SK のアスキーアートとあいさつ
// 外部のライブラリは読み込まず、何も送信しない。
(function () {
  "use strict";

  var t = window.SKI18N ? window.SKI18N.t : function (s, p) {
    return p ? s.replace(/\{(\w+)\}/g, function (m, k) { return p[k] != null ? p[k] : m; }) : s;
  };

  function injectStyle() {
    if (document.getElementById("nfs-style")) return;
    var st = document.createElement("style");
    st.id = "nfs-style";
    st.textContent =
      ".nfs-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:1700;padding:12px 18px;border-radius:14px;background:var(--ink);color:#fff;" +
      "font-size:14px;font-weight:700;box-shadow:0 10px 30px rgba(13,16,20,.25);animation:nfs-toast 3.6s ease forwards;text-align:center;max-width:calc(100% - 32px)}" +
      "@keyframes nfs-toast{0%{opacity:0;transform:translate(-50%,12px)}10%,85%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,0)}}" +
      ".nfs-confetti{position:fixed;inset:0;z-index:1650;pointer-events:none}";
    document.head.appendChild(st);
  }

  function toast(text) {
    var old = document.querySelector(".nfs-toast");
    if (old) old.remove();
    var el = document.createElement("div");
    el.className = "nfs-toast";
    el.setAttribute("role", "status");
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3800);
  }

  function confetti() {
    injectStyle();
    var canvas = document.createElement("canvas");
    canvas.className = "nfs-confetti";
    var dpr = window.devicePixelRatio || 1;
    var W = window.innerWidth, H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    document.body.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    var colors = ["#2563eb", "#5a5fe0", "#ffc83d", "#16a34a", "#db2777", "#0d9488"];
    var parts = [];
    for (var i = 0; i < 160; i++) {
      var angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      var speed = 700 + Math.random() * 700;
      parts.push({
        x: W / 2 + (Math.random() - 0.5) * 80, y: H * 0.62,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 12,
        c: colors[i % colors.length]
      });
    }
    var start = performance.now(), last = start;
    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, W, H);
      parts.forEach(function (p) {
        p.vy += 1500 * dt;
        p.vx *= 0.99;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.r += p.vr * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
        ctx.restore();
      });
      if (now - start < 3200) requestAnimationFrame(frame);
      else canvas.remove();
    }
    requestAnimationFrame(frame);
    toast(t("見つけたね！ いちばん下の「SK」か、「`」キーも押してみて。"));
  }

  var keyBuffer = "";
  var keyTimer = null;
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target && e.target.tagName) || "";
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.target && e.target.isContentEditable)) return;
    var k = String(e.key || "").toLowerCase();
    if (k.length !== 1) return;
    keyBuffer = (keyBuffer + k).slice(-2);
    clearTimeout(keyTimer);
    keyTimer = setTimeout(function () { keyBuffer = ""; }, 1200);
    if (keyBuffer === "sk") {
      keyBuffer = "";
      confetti();
    }
  }

  var taps = [];
  function onCodeTap() {
    var now = Date.now();
    taps = taps.filter(function (x) { return now - x < 2000; });
    taps.push(now);
    if (taps.length >= 5) {
      taps = [];
      confetti();
    }
  }

  // ---------- ひみつのターミナル ----------
  function toggleTerminal() {
    if (window.SKTerminal) { window.SKTerminal.toggle(); return; }
    if (document.querySelector("script[data-sk-terminal]")) return;
    var s = document.createElement("script");
    s.src = "/assets/terminal.js";
    s.setAttribute("data-sk-terminal", "");
    s.onload = function () { if (window.SKTerminal) window.SKTerminal.open(); };
    document.head.appendChild(s);
  }

  // 日本語入力がオンのときは e.key が "Process" になるので、キーの位置（e.code）でも見分ける
  //   US 配列: Backquote（Shift なし）/ JIS 配列: BracketLeft（@ のキー）+ Shift
  function isTerminalKey(e) {
    if (e.key === "`") return true;
    if (e.key !== "Process" && e.key !== "Dead") return false;
    return (e.code === "Backquote" && !e.shiftKey) || (e.code === "BracketLeft" && e.shiftKey);
  }

  function onTerminalKey(e) {
    if (!isTerminalKey(e) || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    var target = e.target;
    if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
    e.preventDefault();
    toggleTerminal();
  }

  // ---------- 開発者ツールのあいさつ ----------
  // アクセスチェック（frameworks/check.js）などのログに埋もれないよう、読み込みが終わってから最後に出す
  // 開発者ツールにはページの Web フォントが届かないので、見ている人のパソコンに入っている等幅のフォントを順に指定する
  // （M PLUS 1 Code を入れている人 → Windows 11 の BIZ UDゴシック → Mac の Osaka−等幅 → 等幅）
  var CONSOLE_FONT = "font-family:'M PLUS 1 Code','BIZ UDGothic','Osaka-Mono',ui-monospace,Menlo,Consolas,monospace;";
  function greetDevelopers() {
    var art = [
      "  ____  _  __",
      " / ___|| |/ /",
      " \\___ \\| ' / ",
      "  ___) | . \\ ",
      " |____/|_|\\_\\"
    ].join("\n");
    console.log("%c" + art, CONSOLE_FONT + "color:#2563eb;font-weight:700;line-height:1.15");
    console.log("%c" + t("コードを見てくれてありがとう！"), CONSOLE_FONT + "font-size:14px;font-weight:700");
    console.log("%c" + t("このサイトのコードは GitHub にあります: {url}", { url: "https://github.com/sy9-k/sk-hub.jp" }), CONSOLE_FONT);
    console.log("%c" + t("ヒント: ページで「`」キーを押すか、いちばん下の「SK」を押してみて。"), CONSOLE_FONT + "color:#5a6371");
    console.log("%c" + t("ヒント: このコンソールで SK と打ってみて。"), CONSOLE_FONT + "color:#5a6371");
  }

  // ---------- コンソールで「SK」と打ったとき ----------
  // 最初に SK を使ったときだけ、使い方を出す（SK.help() でいつでも出せる）
  var helped = false;
  function printHelp() {
    console.log("%c" + t("こんにちは！ SK です。見つけてくれてありがとう。"), CONSOLE_FONT + "font-size:14px;font-weight:700;color:#2563eb");
    console.log("%cSK.terminal()  … " + t("ターミナルを開く"), CONSOLE_FONT);
    console.log("%cSK.confetti()  … " + t("紙吹雪"), CONSOLE_FONT);
    console.log("%cSK.help()      … " + t("この説明をもう一度出す"), CONSOLE_FONT);
  }
  var api = Object.freeze({
    help: function () { printHelp(); return "👋"; },
    terminal: function () { toggleTerminal(); return t("ターミナルを開きました"); },
    confetti: function () { confetti(); return "🎉"; }
  });
  Object.defineProperty(window, "SK", {
    configurable: true,
    get: function () {
      if (!helped) { helped = true; printHelp(); }
      return api;
    }
  });

  function init() {
    var code = document.querySelector(".nf-code");
    if (code) code.addEventListener("click", onCodeTap);
    document.addEventListener("keydown", onKey);
    document.addEventListener("keydown", onTerminalKey);
    // いちばん下の大きな「SK」を押すと、ターミナルが開く（目立たせない。見た目は site.css の .wordmark[role="button"]）
    document.querySelectorAll(".site-footer .wordmark").forEach(function (mark) {
      mark.removeAttribute("aria-hidden");
      mark.setAttribute("role", "button");
      mark.setAttribute("tabindex", "0");
      mark.setAttribute("aria-label", t("ターミナル"));
      mark.addEventListener("click", toggleTerminal);
      mark.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleTerminal(); }
      });
    });
    if (location.hash === "#terminal") toggleTerminal();
    if (document.readyState === "complete") setTimeout(greetDevelopers, 1500);
    else window.addEventListener("load", function () { setTimeout(greetDevelopers, 1500); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
