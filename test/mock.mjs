// A pretend browser, so the grouping logic can be tried out without Chrome or Firefox.
export const state = { tabs: [], groups: [], settings: {}, saved: {}, nextGroup: 100, pageText: "", allowPageReading: false, reply: null };

export const reset = ({ tabs = [], groups = [], pageText = "", allowPageReading = false, reply = null } = {}) => Object.assign(state, { pageText, allowPageReading, reply, tabs: tabs.map((t, i) => ({ id: i + 1, index: i, groupId: -1, pinned: false, windowId: 1, status: "complete", ...t })), groups: [...groups], settings: {}, saved: {}, nextGroup: 100 });

// A plain key and value store, the way the real one behaves.
const keyValueStore = () => ({
  get: async (key) => (key === "settings" ? { settings: state.settings } : (key in state.saved ? { [key]: state.saved[key] } : {})),
  set: async (pairs) => {
    if ("settings" in pairs) state.settings = pairs.settings;
    for (const [key, value] of Object.entries(pairs)) if (key !== "settings") state.saved[key] = value;
  },
  remove: async (key) => { delete state.saved[key]; }
});

export const makeBrowser = () => {
  const browser = {
    storage: { local: keyValueStore(), onChanged: { addListener: () => {} } },
    windows: { getAll: async () => [{ id: 1 }], getCurrent: async () => ({ id: 1 }), getLastFocused: async () => ({ id: 1 }) },
    tabs: {
      query: async (q) => state.tabs.filter((t) => (q.windowId === undefined || t.windowId === q.windowId) && (q.groupId === undefined || t.groupId === q.groupId)),
      group: async ({ tabIds, groupId, createProperties }) => { const id = groupId ?? state.nextGroup++; if (!state.groups.find((g) => g.id === id)) state.groups.push({ id, title: "", color: "grey", windowId: createProperties?.windowId ?? 1 }); tabIds.forEach((tid) => (state.tabs.find((t) => t.id === tid).groupId = id)); return id; },
      ungroup: async (ids) => ids.forEach((tid) => (state.tabs.find((t) => t.id === tid).groupId = -1)),
      move: async () => {},
      onUpdated: { addListener: () => {} }
    },
    tabGroups: { query: async ({ windowId }) => state.groups.filter((g) => g.windowId === windowId), update: async (id, props) => Object.assign(state.groups.find((g) => g.id === id), props), TAB_GROUP_ID_NONE: -1 },
    scripting: {
      executeScript: async ({ target }) => {
        const tab = state.tabs.find((t) => t.id === target.tabId);
        return [{ result: typeof state.pageText === "function" ? state.pageText(tab) : state.pageText }];
      }
    },
    permissions: { contains: async () => state.allowPageReading, request: async () => true },
    alarms: { create: async () => {}, clear: async () => {}, onAlarm: { addListener: () => {} } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    offscreen: { hasDocument: async () => true, createDocument: async () => {}, closeDocument: async () => {} },
    runtime: { sendMessage: async (m) => (m?.target === "tidy-offscreen" && state.reply ? { ok: true, result: state.reply(m) } : undefined), onMessage: { addListener: () => {} }, onInstalled: { addListener: () => {} }, getURL: (p) => `chrome-extension://test/${p}`, openOptionsPage: async () => {} },
    commands: { onCommand: { addListener: () => {} } }
  };
  return browser;
};

// A pretend built-in model.
export const fakeLanguageModel = (answer) => ({
  availability: async () => "available",
  create: async () => ({ prompt: async (text) => answer(text), destroy: () => {} })
});

// A pretend model that reads tabs. Every text is given a theme by the test, and texts
// with the same theme come back close together, exactly as a real model would do.
export const fakeReader = (themeOf, nameOf = null) => {
  const themes = [];
  const indexOf = (theme) => {
    if (!themes.includes(theme)) themes.push(theme);
    return themes.indexOf(theme);
  };

  const vectorFor = (text) => {
    const spot = indexOf(themeOf(text));
    const raw = Array.from({ length: 12 }, (_, i) => (i === spot ? 1 : 0));
    raw[11] = 0.3;
    const length = Math.hypot(...raw);
    return raw.map((v) => v / length);
  };

  return (message) => {
    if (message.task === "feature-extraction") return message.args[0].map(vectorFor);
    if (message.task === "text-generation") return nameOf ? nameOf(message.args[0]) : "";
    return null;
  };
};
