// データの引っ越し（sy9-k.github.io → sk-hub.jp）で使う、データを集める・書き込む部品
//   古いアドレスの /move/（送る側）と、新しいアドレスの /move/（受け取る側）の両方で使う。
//   sy9-k/sy9-k.github.io と sy9-k/sk-hub.jp の 2 つのリポジトリに、同じファイルを置く（直すときは両方を同じに）
//
//   ・移すもの: アプリごと（GROUPS）の localStorage と IndexedDB。Blob（Memo の画像・QR Drop のファイル）もそのまま
//   ・移さないもの: ログインの状態（Firebase）・アカウントの同期の記録（skhub_account・skhub_sync_*・sk_toolbox_sync）・
//     お知らせの既読・Service Worker のキャッシュ。ログインと同期は、新しいアドレスでやり直す
//   ・受け渡しは postMessage（古いアドレスのページが新しいアドレスのページを別のタブで開く）。
//     iframe で開くと、ブラウザがストレージをサイトごとに分けるので、新しいアドレスを直接開いたときに見えない
//   ・タブで渡せないとき（ホーム画面のアプリなど）のために、ファイルに書き出して読み込む方法もある（toFile / fromFile）
(function () {
  "use strict";
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  // 手元で確かめるとき: 古いアドレス = localhost:8765、新しいアドレス = localhost:8766（.claude/launch.json の site と sk-hub）
  var OLD = LOCAL ? "http://localhost:8765" : "https://sy9-k.github.io";
  var NEW = LOCAL ? "http://localhost:8766" : "https://sk-hub.jp";
  var LAUNCH = Date.UTC(2026, 9, 14, 3, 0, 0); // sk-hub.jp の公開（2026-10-14 12:00 日本時間）

  // ls: 移すキー、user: 「もうデータがある」と見なすキー（開いただけで保存される表示の設定などは入れない。サイトの設定は聞かずに置きかえる）
  var GROUPS = [
    { id: "toolbox", ls: [/^sk_toolbox(_(?!sync$)[a-z_]+)?$/, /^sk_(clock|calc|memo|todo|countdown|timetable|roulette)(_[a-z_]+)?$/], idb: ["sk_toolbox_memo"], user: [/^sk_(todo|memo|countdown|timetable|roulette|calc)$/], href: "/toolbox/" },
    { id: "nagi", ls: [/^nagi_[a-z_]+$/], user: [/^nagi_sessions$/], href: "/nagi/" },
    { id: "malu", ls: [/^(dictionarySettings|searchHistory)$/, /^malu_[a-z_]+$/], user: [/^searchHistory$/], href: "/dictionary/" },
    { id: "lab", ls: [/^(qr-drop-settings|smart_dashboard_config_v2)$/], idb: ["qr-drop-history"], user: [], href: "/lab/" },
    { id: "site", ls: [/^sk_(theme|lang|analytics|terminal_window)$/, /^skhub_(terms_accepted|terms_notice_shown|uuid)$/], user: [], href: "/" }
  ];
  function group(id) { for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].id === id) return GROUPS[i]; return null; }
  function keysOf(g, res) {
    var out = [];
    res = res || g.ls;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (res.some(function (re) { return re.test(k); })) out.push(k);
      }
    } catch (e) { /* 読めないときは空 */ }
    return out;
  }

  // ---- IndexedDB ----
  function req(r) { return new Promise(function (ok, ng) { r.onsuccess = function () { ok(r.result); }; r.onerror = function () { ng(r.error); }; }); }
  // ないデータベースは作らずに null（onupgradeneeded が来たら、なかったということ）
  function openExisting(name) {
    return new Promise(function (resolve) {
      if (!window.indexedDB) return resolve(null);
      var fresh = false, r;
      try { r = indexedDB.open(name); } catch (e) { return resolve(null); }
      r.onupgradeneeded = function () { fresh = true; r.transaction.abort(); };
      r.onsuccess = function () { if (fresh) { r.result.close(); resolve(null); } else resolve(r.result); };
      r.onerror = function () { resolve(null); };
    });
  }
  function dumpDb(name) {
    return openExisting(name).then(function (db) {
      if (!db) return null;
      var names = Array.prototype.slice.call(db.objectStoreNames);
      if (!names.length) { db.close(); return null; }
      var tx = db.transaction(names, "readonly");
      return Promise.all(names.map(function (n) {
        var st = tx.objectStore(n);
        var meta = { name: n, keyPath: st.keyPath, autoIncrement: st.autoIncrement, indexes: [] };
        Array.prototype.forEach.call(st.indexNames, function (i) { var ix = st.index(i); meta.indexes.push({ name: i, keyPath: ix.keyPath, unique: ix.unique, multiEntry: ix.multiEntry }); });
        return Promise.all([req(st.getAllKeys()), req(st.getAll())]).then(function (r) { meta.keys = r[0]; meta.values = r[1]; return meta; });
      })).then(function (stores) {
        var out = { name: name, version: db.version, stores: stores };
        db.close();
        return out;
      }, function () { db.close(); return null; });
    });
  }
  function dbCount(d) { return d ? d.stores.reduce(function (s, st) { return s + st.keys.length; }, 0) : 0; }
  function deleteDb(name) {
    return new Promise(function (resolve) { var r = indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = function () { resolve(); }; });
  }
  function restoreDb(d) {
    return deleteDb(d.name).then(function () {
      return new Promise(function (resolve, reject) {
        var r = indexedDB.open(d.name, d.version || 1);
        r.onupgradeneeded = function () {
          d.stores.forEach(function (s) {
            var o = {};
            if (s.keyPath != null) o.keyPath = s.keyPath;
            if (s.autoIncrement) o.autoIncrement = true;
            var st = r.result.createObjectStore(s.name, o);
            (s.indexes || []).forEach(function (i) { st.createIndex(i.name, i.keyPath, { unique: !!i.unique, multiEntry: !!i.multiEntry }); });
          });
        };
        r.onerror = function () { reject(r.error); };
        r.onsuccess = function () {
          var db = r.result, names = d.stores.map(function (s) { return s.name; });
          if (!names.length) { db.close(); return resolve(); }
          var tx = db.transaction(names, "readwrite");
          d.stores.forEach(function (s) {
            var st = tx.objectStore(s.name);
            s.values.forEach(function (v, i) { if (s.keyPath != null) st.put(v); else st.put(v, s.keys[i]); });
          });
          tx.oncomplete = function () { db.close(); resolve(); };
          tx.onerror = tx.onabort = function () { db.close(); reject(tx.error); };
        };
      });
    });
  }

  // ---- 集める・数える・書き込む ----
  // { v, from, at, groups: { toolbox: { ls: {key: 文字列}, idb: [データベース] }, … } }
  function collect(ids) {
    var out = { v: 1, from: location.origin, at: Date.now(), groups: {} };
    return Promise.all(ids.map(function (id) {
      var g = group(id);
      if (!g) return null;
      var ls = {};
      keysOf(g).forEach(function (k) { try { ls[k] = localStorage.getItem(k); } catch (e) { /* 読めないものは入れない */ } });
      return Promise.all((g.idb || []).map(dumpDb)).then(function (dbs) {
        out.groups[id] = { ls: ls, idb: dbs.filter(function (d) { return d && dbCount(d); }) };
      });
    })).then(function () { return out; });
  }
  // 件数（localStorage のキーの数 + IndexedDB の中身の数）
  function count(gp) { return gp ? Object.keys(gp.ls || {}).length + (gp.idb || []).reduce(function (s, d) { return s + dbCount(d); }, 0) : 0; }
  // この端末（このアドレス）に、そのアプリで使う人が作ったデータ（Todo・記録・履歴など）がもうあるか
  function hasData(id) {
    var g = group(id);
    if (!g) return Promise.resolve(false);
    if (keysOf(g, g.user).length) return Promise.resolve(true);
    return Promise.all((g.idb || []).map(dumpDb)).then(function (dbs) { return dbs.some(function (d) { return dbCount(d) > 0; }); });
  }
  // 書き込む。いまあるデータ（同じアプリの分）は消してから置きかえる
  function apply(id, gp) {
    var g = group(id);
    if (!g || !gp) return Promise.reject(new Error("unknown group"));
    keysOf(g).forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { /* そのまま */ } });
    Object.keys(gp.ls || {}).forEach(function (k) {
      // 決まったキーだけ（ほかのキーは書かない）
      if (typeof gp.ls[k] === "string" && g.ls.some(function (re) { return re.test(k); })) localStorage.setItem(k, gp.ls[k]);
    });
    var dbs = (gp.idb || []).filter(function (d) { return d && (g.idb || []).indexOf(d.name) >= 0 && Array.isArray(d.stores); });
    var chain = Promise.resolve();
    (g.idb || []).forEach(function (name) {
      var d = dbs.filter(function (x) { return x.name === name; })[0];
      chain = chain.then(function () { return d ? restoreDb(d) : deleteDb(name); });
    });
    return chain;
  }

  // ---- ファイル（タブで渡せないとき）----
  // Blob は data: URL にして JSON に入れる
  function blobToUrl(b) { return new Promise(function (ok) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = function () { ok(null); }; r.readAsDataURL(b); }); }
  function walk(v, fn) {
    if (v instanceof Blob) return fn(v);
    if (Array.isArray(v)) return Promise.all(v.map(function (x) { return walk(x, fn); }));
    if (v && typeof v === "object" && !(v instanceof Date) && !(v instanceof ArrayBuffer)) {
      var o = {}, ks = Object.keys(v);
      return Promise.all(ks.map(function (k) { return walk(v[k], fn).then(function (x) { o[k] = x; }); })).then(function () { return o; });
    }
    return Promise.resolve(v);
  }
  function toFile(payload) {
    return walk(payload, function (b) { return blobToUrl(b).then(function (u) { return { $blob: u, type: b.type }; }); }).then(function (p) {
      p.app = "sk-move";
      return new Blob([JSON.stringify(p)], { type: "application/json" });
    });
  }
  function unwalk(v) {
    if (Array.isArray(v)) return Promise.all(v.map(unwalk));
    if (v && typeof v === "object") {
      if (typeof v.$blob === "string" && /^data:/.test(v.$blob)) return fetch(v.$blob).then(function (r) { return r.blob(); });
      var o = {}, ks = Object.keys(v);
      return Promise.all(ks.map(function (k) { return unwalk(v[k]).then(function (x) { o[k] = x; }); })).then(function () { return o; });
    }
    return Promise.resolve(v);
  }
  function fromFile(file) {
    return file.text().then(function (text) {
      var p = JSON.parse(text);
      if (!p || p.app !== "sk-move" || !p.groups) throw new Error("not a move file");
      return unwalk(p);
    });
  }
  function valid(p) { return !!(p && p.v === 1 && p.groups && typeof p.groups === "object"); }

  window.SKMove = { OLD: OLD, NEW: NEW, LAUNCH: LAUNCH, GROUPS: GROUPS, group: group, collect: collect, count: count, hasData: hasData, apply: apply, toFile: toFile, fromFile: fromFile, valid: valid };
})();
