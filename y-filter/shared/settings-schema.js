// Newtab のバージョン（モード）。normal は最新版（v7 / SaeTab 7）
export const NEWTAB_MODES = Object.freeze([
  "normal", "beta", "lite",
  "v6.5", "v6.4", "v6.3", "v6.2", "v6.1", "v6",
  "v5.3", "v5.2", "v5.1", "v5",
  "v4.1", "v4", "v3.6", "v3.5", "v3", "v2.1", "v2", "old"
]);

export const REMOTE_SETTING_KEYS = Object.freeze([
  "blockRules",
  "blockKeywords",
  "enabledCategories",
  "timeConfig",
  "allowList",
  "uiMode",
  "adBlockEnabled",
  "adBlockLevel",
  "blockAllDownloads",
  "blockAllUploads",
  "downloadExtensions",
  "uploadExtensions",
  "downloadBlockedDomains",
  "systemEnabled",
  "learningModeUntil",
  "chromeOsLiteMode",
  "chromeOsOfflineScreen",
  "chromeOsReportHardwareStats",
  "safeSearchEnabled",
  "accessCodeHash",
  "accessMode",
  "blockedExtensions",
  "newTabConfig",
  "blockPageStyle",
  "adBlockBadge",
  "dailyLimit",
  "timeSchedule"
]);

// 曜日・時間帯のルールの最大数
export const TIME_SCHEDULE_MAX_RULES = 10;

// 1 日の利用時間の上限（分）。平日と土日で分けられる
export const DAILY_LIMIT_MAX_MINUTES = 24 * 60;

export const DEFAULT_SETTINGS = Object.freeze({
  blockRules: [],
  blockKeywords: [],
  enabledCategories: [],
  timeConfig: { enabled: false, start: "21:00", end: "07:00" },
  allowList: ["search3958.github.io", "sk-hub.jp", "sy9-k.github.io"],
  uiMode: "admin",
  adBlockEnabled: true,
  adBlockLevel: "medium",
  blockAllDownloads: false,
  blockAllUploads: false,
  downloadExtensions: ["exe", "msi"],
  uploadExtensions: [],
  downloadBlockedDomains: [],
  systemEnabled: true,
  learningModeUntil: 0,
  chromeOsLiteMode: false,
  chromeOsOfflineScreen: false,
  chromeOsReportHardwareStats: false,
  safeSearchEnabled: false,
  accessCodeHash: null,
  accessMode: 0,
  blockedExtensions: ["exe", "msi"],
  newTabConfig: { enabled: false, agreed: false, mode: "normal" },
  blockPageStyle: "modern",
  adBlockBadge: false,
  dailyLimit: { enabled: false, weekday: 120, weekend: 180, extra: { date: "", minutes: 0 } },
  timeSchedule: { enabled: false, rules: [] }
});

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function normalizeStringArray(value, { lower = false } = {}) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    let next = normalizeString(String(item || ""));
    if (!next) continue;
    if (lower) next = next.toLowerCase();
    if (seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}

function normalizeRuleList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    if (!isObject(item)) continue;
    const pattern = normalizeString(String(item.pattern || ""));
    if (!pattern) continue;
    const category = normalizeString(String(item.category || "未分類")) || "未分類";
    out.push({ pattern, category });
  }
  return out;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
  }
  return fallback;
}

function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function normalizeTime(value, fallback) {
  const s = normalizeString(String(value || ""));
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : fallback;
}

function normalizeAccessMode(value) {
  const mode = normalizeNumber(value, 0);
  if (mode === 1 || mode === 2) return mode;
  return 0;
}

function normalizeAdBlockLevel(value) {
  const level = normalizeString(String(value || "")).toLowerCase();
  if (level === "low" || level === "high") return level;
  return "medium";
}

function normalizeUiMode(value) {
  const mode = normalizeString(String(value || "")).toLowerCase();
  return mode === "user" ? "user" : "admin";
}

function normalizeTimeConfig(value) {
  const src = isObject(value) ? value : {};
  return {
    enabled: normalizeBoolean(src.enabled, false),
    start: normalizeTime(src.start, "21:00"),
    end: normalizeTime(src.end, "07:00")
  };
}

function normalizeLimitMinutes(value, fallback) {
  const n = normalizeNumber(value, fallback);
  return Math.min(DAILY_LIMIT_MAX_MINUTES, Math.max(0, n));
}

export function localDateKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// extra … その日だけの延長（「あと○分」のリクエストを許可したとき）。date が今日のときだけ上限に足す
export function normalizeDailyLimit(value) {
  const src = isObject(value) ? value : {};
  const extra = isObject(src.extra) ? src.extra : {};
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(extra.date || "")) ? String(extra.date) : "";
  return {
    enabled: normalizeBoolean(src.enabled, false),
    weekday: normalizeLimitMinutes(src.weekday, 120),
    weekend: normalizeLimitMinutes(src.weekend, 180),
    extra: { date, minutes: date ? normalizeLimitMinutes(extra.minutes, 0) : 0 }
  };
}

// 今日の上限（分）。土日は weekend、それ以外は weekday。今日の延長があれば足す
export function dailyLimitMinutesFor(limit, date = new Date()) {
  const cfg = normalizeDailyLimit(limit);
  const day = date.getDay();
  const base = day === 0 || day === 6 ? cfg.weekend : cfg.weekday;
  const extra = cfg.extra.date === localDateKey(date) ? cfg.extra.minutes : 0;
  return Math.min(DAILY_LIMIT_MAX_MINUTES, base + extra);
}

// 曜日・時間帯のルール。days は 0（日）〜6（土）。start > end は日をまたぐ（start の曜日で判定）
export function normalizeTimeSchedule(value) {
  const src = isObject(value) ? value : {};
  const rules = [];
  for (const rule of Array.isArray(src.rules) ? src.rules : []) {
    if (!isObject(rule)) continue;
    const days = [...new Set((Array.isArray(rule.days) ? rule.days : [])
      .map((d) => normalizeNumber(d, -1)).filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
    const start = normalizeTime(rule.start, "");
    const end = normalizeTime(rule.end, "");
    if (!days.length || !start || !end) continue;
    rules.push({ days, start, end });
    if (rules.length >= TIME_SCHEDULE_MAX_RULES) break;
  }
  return { enabled: normalizeBoolean(src.enabled, false), rules };
}

// アクセスコードのハッシュ（access-code.js）。形が正しくなければ null
function normalizeAccessCodeHash(value) {
  if (!isObject(value)) return null;
  const { alg, iter, salt, hash, updatedAt } = value;
  if (alg !== "PBKDF2-SHA256" || !Number.isInteger(iter) || iter <= 0) return null;
  if (typeof salt !== "string" || !salt || typeof hash !== "string" || !hash) return null;
  return { alg, iter, salt, hash, updatedAt: normalizeNumber(updatedAt, 0) };
}

function normalizeNewTabConfig(value) {
  const src = isObject(value) ? value : {};
  const rawMode = normalizeString(String(src.mode || "")).toLowerCase();
  const allowedModes = new Set(NEWTAB_MODES);
  const mode = allowedModes.has(rawMode) ? rawMode : "normal";
  return {
    enabled: normalizeBoolean(src.enabled, false),
    agreed: normalizeBoolean(src.agreed, false),
    mode
  };
}

export function buildDefaultSettings() {
  return {
    blockRules: [],
    blockKeywords: [],
    enabledCategories: [],
    timeConfig: { enabled: false, start: "21:00", end: "07:00" },
    allowList: ["search3958.github.io", "sk-hub.jp", "sy9-k.github.io"],
    uiMode: "admin",
    adBlockEnabled: true,
    adBlockLevel: "medium",
    blockAllDownloads: false,
    blockAllUploads: false,
    downloadExtensions: ["exe", "msi"],
    uploadExtensions: [],
    downloadBlockedDomains: [],
    systemEnabled: true,
    learningModeUntil: 0,
    chromeOsLiteMode: false,
    chromeOsOfflineScreen: false,
    chromeOsReportHardwareStats: false,
    safeSearchEnabled: false,
    accessCodeHash: null,
    accessMode: 0,
    blockedExtensions: ["exe", "msi"],
    newTabConfig: { enabled: false, agreed: false, mode: "normal" },
    blockPageStyle: "modern",
    adBlockBadge: false,
    dailyLimit: { enabled: false, weekday: 120, weekend: 180, extra: { date: "", minutes: 0 } },
    timeSchedule: { enabled: false, rules: [] }
  };
}

export function normalizeSettings(raw = {}) {
  const src = isObject(raw) ? raw : {};
  const out = buildDefaultSettings();

  out.blockRules = normalizeRuleList(src.blockRules);
  out.blockKeywords = normalizeStringArray(src.blockKeywords);
  out.enabledCategories = normalizeStringArray(src.enabledCategories);
  out.timeConfig = normalizeTimeConfig(src.timeConfig);
  out.allowList = normalizeStringArray(src.allowList, { lower: true });
  out.uiMode = normalizeUiMode(src.uiMode);
  out.adBlockEnabled = normalizeBoolean(src.adBlockEnabled, true);
  out.adBlockLevel = normalizeAdBlockLevel(src.adBlockLevel);
  out.blockAllDownloads = normalizeBoolean(src.blockAllDownloads, false);
  out.blockAllUploads = normalizeBoolean(src.blockAllUploads, false);
  out.downloadExtensions = normalizeStringArray(src.downloadExtensions, { lower: true });
  out.uploadExtensions = normalizeStringArray(src.uploadExtensions, { lower: true });
  out.downloadBlockedDomains = normalizeStringArray(src.downloadBlockedDomains, { lower: true });
  out.systemEnabled = normalizeBoolean(src.systemEnabled, true);
  out.learningModeUntil = Math.max(0, normalizeNumber(src.learningModeUntil, 0));
  out.chromeOsLiteMode = normalizeBoolean(src.chromeOsLiteMode, false);
  out.chromeOsOfflineScreen = normalizeBoolean(src.chromeOsOfflineScreen, false);
  out.chromeOsReportHardwareStats = normalizeBoolean(src.chromeOsReportHardwareStats, false);
  out.safeSearchEnabled = normalizeBoolean(src.safeSearchEnabled, false);
  out.accessCodeHash = normalizeAccessCodeHash(src.accessCodeHash);
  out.accessMode = normalizeAccessMode(src.accessMode);
  out.blockedExtensions = normalizeStringArray(src.blockedExtensions, { lower: true });
  out.newTabConfig = normalizeNewTabConfig(src.newTabConfig);
  out.blockPageStyle = ["modern", "classic", "kids"].includes(src.blockPageStyle) ? src.blockPageStyle : "modern";
  out.adBlockBadge = normalizeBoolean(src.adBlockBadge, false);
  out.dailyLimit = normalizeDailyLimit(src.dailyLimit);
  out.timeSchedule = normalizeTimeSchedule(src.timeSchedule);

  return out;
}
