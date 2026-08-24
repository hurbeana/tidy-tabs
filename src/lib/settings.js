// Reads and writes your settings. One storage key holds them all.
export const api = globalThis.browser ?? globalThis.chrome;

const store = api.storage.sync ?? api.storage.local;

// Tidy Tabs works out for itself how alike two tabs have to be, so there is nothing
// here to tune. What is left is what only you can answer: when to tidy, how much of a
// page it may read, and what to leave alone.
export const DEFAULTS = {
  enabled: true,
  trigger: "load",
  intervalMinutes: 15,
  waitSeconds: 3,
  readPages: true,
  naming: "auto",
  remember: true,

  scope: "window",
  skipPinned: true,
  regroupExisting: false,
  maxGroups: 10,
  collapseNewGroups: false,
  sortInGroups: false,
  rules: [],
  skipList: [],
  colors: {},
  readerModel: "",
  namerModel: "",
  showBadge: true,
  debug: false
};

const LIST_KEYS = ["skipList"];
const MAP_KEYS = ["colors"];

function asList(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function asMap(value) {
  const looksLikeAMap = value && typeof value === "object" && !Array.isArray(value);
  return looksLikeAMap ? value : {};
}

function asRules(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((rule) => rule && typeof rule.match === "string" && rule.category);
}

function asNumber(value, fallback) {
  if (value === "" || value === null || value === undefined) return fallback;
  const asANumber = Number(value);
  return Number.isFinite(asANumber) ? asANumber : fallback;
}

const keysWhereDefaultIs = (type) => Object.keys(DEFAULTS).filter((key) => typeof DEFAULTS[key] === type);

// Settings saved by an older version, or edited by hand, must never break the add-on.
// Everything is put back into the shape the rest of the code expects, and anything the
// add-on no longer uses is quietly left behind.
export function repair(raw) {
  const settings = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (raw && raw[key] !== undefined) settings[key] = raw[key];
  }

  for (const key of LIST_KEYS) settings[key] = asList(settings[key]);
  for (const key of MAP_KEYS) settings[key] = asMap(settings[key]);
  settings.rules = asRules(settings.rules);

  for (const key of keysWhereDefaultIs("number")) settings[key] = asNumber(settings[key], DEFAULTS[key]);
  for (const key of keysWhereDefaultIs("boolean")) settings[key] = Boolean(settings[key]);

  return settings;
}

export async function getSettings() {
  const saved = await store.get("settings");
  return repair(saved.settings ?? {});
}

export function saveSettings(settings) {
  return store.set({ settings: repair(settings) });
}

export async function patchSettings(patch) {
  const now = await getSettings();
  return saveSettings({ ...now, ...patch });
}

export function onSettingsChanged(run) {
  api.storage.onChanged.addListener((changes) => {
    if (changes.settings) run();
  });
}
