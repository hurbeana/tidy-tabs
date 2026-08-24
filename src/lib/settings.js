// Reads and writes your settings. One storage key holds them all.
export const api = globalThis.browser ?? globalThis.chrome;

const store = api.storage.sync ?? api.storage.local;

export const DEFAULTS = {
  enabled: true,
  trigger: "load",
  intervalMinutes: 15,
  waitSeconds: 3,
  scope: "window",
  skipPinned: true,
  regroupExisting: false,
  minTabsPerGroup: 2,
  maxGroups: 8,
  ungroupSingles: false,
  categoryMode: "hybrid",
  categories: ["Work", "Code", "Docs", "News", "Shopping", "Social", "Video", "Music", "Email", "Finance", "Travel", "Learning", "AI", "Health", "Games", "Other"],
  colors: {},
  collapseNewGroups: false,
  sortInGroups: false,
  readMode: "title",
  pageTextChars: 600,
  model: "builtin",
  fallbackModel: "tiny",
  fallbackToSite: false,
  customModelId: "",
  customModelTask: "generate",
  dtype: "",
  device: "",
  confidence: 45,
  clusterThreshold: 55,
  batchSize: 12,
  reuseExisting: true,
  preferOpen: 15,
  rules: [],
  skipList: [],
  showBadge: true,
  debug: false
};

const LISTS = ["categories", "skipList"];
const MAPS = ["colors"];

const asList = (value) => (Array.isArray(value) ? value.map(String) : typeof value === "string" ? value.split("\n").map((line) => line.trim()).filter(Boolean) : []);
const asMap = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const asRules = (value) => (Array.isArray(value) ? value.filter((rule) => rule && typeof rule.match === "string" && rule.category) : []);
const asNumber = (value, fallback) => (value === "" || value === null || !Number.isFinite(Number(value)) ? fallback : Number(value));

// Settings saved by an older version, or by hand, must never break the add-on.
export const repair = (raw) => {
  const settings = { ...DEFAULTS, ...raw };
  LISTS.forEach((key) => (settings[key] = asList(settings[key])));
  MAPS.forEach((key) => (settings[key] = asMap(settings[key])));
  settings.rules = asRules(settings.rules);
  Object.keys(DEFAULTS).filter((key) => typeof DEFAULTS[key] === "number").forEach((key) => (settings[key] = asNumber(settings[key], DEFAULTS[key])));
  Object.keys(DEFAULTS).filter((key) => typeof DEFAULTS[key] === "boolean").forEach((key) => (settings[key] = !!settings[key]));
  return settings;
};

export const getSettings = async () => repair((await store.get("settings")).settings ?? {});

export const saveSettings = async (settings) => store.set({ settings: repair(settings) });

export const patchSettings = async (patch) => saveSettings({ ...(await getSettings()), ...patch });

export const onSettingsChanged = (run) => api.storage.onChanged.addListener((changes) => changes.settings && run());
