// システム稼働状況（/status/）
// このページを開いているブラウザから各システムに接続して、応答と速さを確かめる。
// あわせて、メンテナンス・障害のお知らせ（config/maintenance。assets/maintenance.js と同じもの）が出ているサービスは、
// その行を「メンテナンス中」「障害」にする（行の data-service が、お知らせの services の名前。空ならすべての行）。
(function () {
  "use strict";

  // SK Hub Systems（Firebase プロジェクト）。値は frameworks/check.js の CONFIG.HUB と同じ
  const HUB = {
    projectId: "y-filter-systems",
    apiKey: "AIzaSyB4gqzPEPyP0NrEJw33-OTAxUrF48MmiuI"
  };
  const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${HUB.projectId}/databases/(default)/documents`;
  const TIMEOUT_MS = 10000;
  const SLOW_MS = 2500;
  const INTERVAL_MS = 5 * 60 * 1000;

  const t = window.SKI18N ? window.SKI18N.t : (s) => s;
  const LABELS = { checking: t("確認中"), ok: t("正常"), slow: t("遅延"), down: t("停止"), setup: t("準備中"), unknown: t("確認できません"), maint: t("メンテナンス中"), incident: t("障害") };

  async function timed(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const start = performance.now();
    try {
      const res = await fetch(url, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer-when-downgrade", ...options, signal: controller.signal });
      return { res, ms: Math.round(performance.now() - start) };
    } finally {
      clearTimeout(timer);
    }
  }

  const speed = (ms) => (ms > SLOW_MS ? "slow" : "ok");

  // Firestore のエラーが「API キーの制限」によるものか（その場合はこの環境からは確かめられない）
  async function isKeyRestricted(res) {
    try {
      const body = await res.clone().json();
      return /referer|referrer|API key/i.test(JSON.stringify(body.error || {}));
    } catch (e) {
      return false;
    }
  }

  const CHECKS = {
    // 同じサイトのページが返ってくるか
    async site() { const { res, ms } = await timed("/"); return { state: res.ok ? speed(ms) : "down", ms }; },
    async malu() { const { res, ms } = await timed("/dictionary/"); return { state: res.ok ? speed(ms) : "down", ms }; },
    async nagi() { const { res, ms } = await timed("/nagi/"); return { state: res.ok ? speed(ms) : "down", ms }; },
    async toolbox() { const { res, ms } = await timed("/toolbox/"); return { state: res.ok ? speed(ms) : "down", ms }; },
    async lab() { const { res, ms } = await timed("/lab/"); return { state: res.ok ? speed(ms) : "down", ms }; },
    async view() { const { res, ms } = await timed("/view/"); return { state: res.ok ? speed(ms) : "down", ms }; },
    async console() { const { res, ms } = await timed("/y-filter/"); return { state: res.ok ? speed(ms) : "down", ms }; },
    // 古いアドレス（別のサイトなので中身は読めない。no-cors で接続できたかだけを見る）
    async old() { const { ms } = await timed("https://sy9-k.github.io/move/", { mode: "no-cors" }); return { state: speed(ms), ms }; },

    // Firestore が応答するか（ブロックリストの版番号だけを読む）
    async database() {
      const { res, ms } = await timed(`${FIRESTORE}/config/categories?mask.fieldPaths=version&key=${HUB.apiKey}`);
      if (res.status >= 500) return { state: "down", ms };
      if (res.status === 403 && await isKeyRestricted(res)) return { state: "unknown", ms, note: t("この場所からは確認できません") };
      return { state: speed(ms), ms };
    },
    async blocklist() {
      const { res, ms } = await timed(`${FIRESTORE}/config/categories?mask.fieldPaths=version&key=${HUB.apiKey}`);
      if (res.ok) {
        const doc = await res.json();
        const version = doc.fields?.version?.integerValue;
        return { state: speed(ms), ms, note: version ? t("ブロックリスト 第 {n} 版を配信中", { n: version }) : null };
      }
      if (res.status === 403 && await isKeyRestricted(res)) return { state: "unknown", ms };
      return { state: res.status === 404 ? "setup" : "down", ms };
    },
    // 存在しないサポートIDを問い合わせて、404（＝ルールどおり読めた）が返るか
    async accesscheck() {
      const id = crypto.randomUUID();
      const { res, ms } = await timed(`${FIRESTORE}/hub_blocklist/${id}?key=${HUB.apiKey}`);
      if (res.status === 404 || res.ok) return { state: speed(ms), ms };
      if (res.status === 403) return { state: await isKeyRestricted(res) ? "unknown" : "setup", ms };
      return { state: "down", ms };
    },
    // ログインの仕組み（Firebase Authentication）が応答するか。Firebase の SDK がログインの前に読むプロジェクトの設定を取得する
    async login() {
      const { res, ms } = await timed(`https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=${HUB.apiKey}`);
      if (res.ok) return { state: speed(ms), ms };
      if (res.status === 403 && await isKeyRestricted(res)) return { state: "unknown", ms, note: t("この場所からは確認できません") };
      return { state: res.status >= 500 ? "down" : "unknown", ms };
    },
    // お知らせ・サポート記事（support/articles.js と同じ、公開中の記事だけを探す問い合わせ。1 件だけ読む）
    async articles() {
      const { res, ms } = await timed(`https://firestore.googleapis.com/v1/projects/${HUB.projectId}/databases/(default)/documents:runQuery?key=${HUB.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId: "articles" }],
          where: { fieldFilter: { field: { fieldPath: "published" }, op: "EQUAL", value: { booleanValue: true } } },
          select: { fields: [{ fieldPath: "published" }] },
          limit: 1
        } })
      });
      if (res.ok) return { state: speed(ms), ms };
      if (res.status === 403 && await isKeyRestricted(res)) return { state: "unknown", ms };
      return { state: res.status >= 500 ? "down" : "unknown", ms };
    },
    // お問い合わせの受け付け。中身は読めないルールなので、存在しないものを読んで 403（＝ルールどおり断られた）が返るか
    async contact() {
      const { res, ms } = await timed(`${FIRESTORE}/contacts/${crypto.randomUUID()}?key=${HUB.apiKey}`);
      if (res.status === 403 && !(await isKeyRestricted(res))) return { state: speed(ms), ms };
      if (res.status === 403) return { state: "unknown", ms };
      return { state: res.status >= 500 ? "down" : speed(ms), ms };
    },
    // LINE ミニアプリ（LINE の LIFF の SDK が読めるか。toolbox/shared/line.js と同じ URL）。別のサイトなので接続できたかだけを見る
    async line() { const { ms } = await timed("https://static.line-scdn.net/liff/edge/2/sdk.js", { mode: "no-cors" }); return { state: speed(ms), ms }; },
    // 他のサイトなので中身は読めない（no-cors）。接続できたかだけを見る
    async newtab() {
      const { ms } = await timed("https://search3958.github.io/newtab/", { mode: "no-cors" });
      return { state: speed(ms), ms };
    }
  };

  // いま出ているメンテナンス・障害のお知らせ（なければ null）。読めないときも null（ふつうの確認だけにする）
  async function notice() {
    try {
      const { res } = await timed(`${FIRESTORE}/config/maintenance?key=${HUB.apiKey}`);
      if (!res.ok) return null;
      const f = (await res.json()).fields || {};
      const str = (k) => f[k]?.stringValue || "";
      const time = (k) => (f[k]?.timestampValue ? Date.parse(f[k].timestampValue) : null);
      const start = time("startsAt"), end = time("endsAt"), now = Date.now();
      if (!f.active?.booleanValue || !(str("message") || f.close?.booleanValue)) return null;
      if ((start && start > now) || (end && end <= now)) return null;
      const services = (f.services?.arrayValue?.values || []).map((v) => v.stringValue).filter(Boolean);
      return { level: str("level") || "info", services, end };
    } catch (e) {
      return null;
    }
  }
  function affected(row, n) {
    const svc = row.dataset.service;
    return !!svc && (!n.services.length || n.services.includes(svc));
  }
  const until = (end) => end ? t("{time} まで", { time: new Date(end).toLocaleString(window.SKI18N ? window.SKI18N.locale : "ja-JP", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) }) : null;

  const rows = [...document.querySelectorAll("[data-check]")];
  const summary = document.querySelector("[data-status-summary]");
  const summaryText = document.querySelector("[data-status-summary-text]");
  const checkedAt = document.querySelector("[data-status-checked]");
  const refreshBtn = document.querySelector("[data-status-refresh]");
  const defaultNotes = new Map(rows.map((row) => [row, row.querySelector(".status-name small")?.textContent || null]));
  if (!summary || !rows.length) return;

  function setRow(row, { state, ms, note }) {
    row.dataset.state = state;
    const pill = row.querySelector("[data-pill]");
    const msEl = row.querySelector("[data-ms]");
    pill.textContent = LABELS[state] || state;
    msEl.textContent = typeof ms === "number" && state !== "checking" ? `${ms} ms` : "";
    const noteEl = row.querySelector(".status-name small");
    if (noteEl) noteEl.textContent = note || defaultNotes.get(row);
  }

  async function runAll() {
    refreshBtn.disabled = true;
    summary.dataset.state = "checking";
    summaryText.textContent = t("確認しています…");
    rows.forEach((row) => setRow(row, { state: "checking" }));

    const n = await notice();
    const results = await Promise.all(rows.map(async (row) => {
      let result;
      try {
        result = await CHECKS[row.dataset.check]();
      } catch (e) {
        result = { state: "down" }; // 接続できない・時間切れ
      }
      // お知らせが出ているサービスは、つながっても「メンテナンス中」「障害」にする（info はふつうのお知らせなので変えない）
      if (n && n.level !== "info" && affected(row, n) && result.state !== "down") {
        result = { state: n.level === "warning" ? "incident" : "maint", ms: result.ms, note: until(n.end) };
      }
      setRow(row, result);
      return result.state;
    }));

    const has = (s) => results.includes(s);
    if (has("incident")) { summary.dataset.state = "down"; summaryText.textContent = t("障害が起きているサービスがあります"); }
    else if (has("maint")) { summary.dataset.state = "slow"; summaryText.textContent = t("メンテナンス中のサービスがあります"); }
    else if (has("down")) { summary.dataset.state = "down"; summaryText.textContent = t("一部のシステムで問題が起きています"); }
    else if (has("slow")) { summary.dataset.state = "slow"; summaryText.textContent = t("一部のシステムの応答が遅くなっています"); }
    else if (has("setup") || has("unknown")) { summary.dataset.state = "ok"; summaryText.textContent = t("主なシステムは正常に動いています"); }
    else { summary.dataset.state = "ok"; summaryText.textContent = t("すべてのシステムは正常に動いています"); }
    // 結果の文字をふわっと入れ直す（CSS の .is-in）
    summaryText.classList.remove("is-in");
    void summaryText.offsetWidth;
    summaryText.classList.add("is-in");
    checkedAt.textContent = new Date().toLocaleString(window.SKI18N ? window.SKI18N.locale : "ja-JP");
    refreshBtn.disabled = false;
  }

  refreshBtn.addEventListener("click", runAll);
  runAll();
  setInterval(() => { if (!document.hidden) runAll(); }, INTERVAL_MS);
})();
