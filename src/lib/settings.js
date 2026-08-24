// Reads and writes your settings. One storage key holds them all.
export const api = globalThis.browser ?? globalThis.chrome;

const store = api.storage.sync ?? api.storage.local;

export const DEFAULTS = {
  enabled: true,
  groupOnNewTab: true,
  groupOnInterval: false,
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

export const getSettings = async () => ({ ...DEFAULTS, ...((await store.get("settings")).settings ?? {}) });

export const saveSettings = async (settings) => store.set({ settings: { ...DEFAULTS, ...settings } });

export const patchSettings = async (patch) => saveSettings({ ...(await getSettings()), ...patch });

export const onSettingsChanged = (run) => api.storage.onChanged.addListener((changes) => changes.settings && run());
