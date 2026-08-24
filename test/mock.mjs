// A pretend browser, so the grouping logic can be tried out without Chrome or Firefox.
export const state = { tabs: [], groups: [], settings: {}, nextGroup: 100, pageText: "", allowPageReading: false, reply: null };

export const reset = ({ tabs = [], groups = [], pageText = "", allowPageReading = false, reply = null } = {}) => Object.assign(state, { pageText, allowPageReading, reply, tabs: tabs.map((t, i) => ({ id: i + 1, index: i, groupId: -1, pinned: false, windowId: 1, status: "complete", ...t })), groups: [...groups], settings: {}, nextGroup: 100 });

export const makeBrowser = () => {
  const browser = {
    storage: { local: { get: async (k) => (k === "settings" ? { settings: state.settings } : {}), set: async (o) => Object.assign(state, { settings: o.settings }) }, onChanged: { addListener: () => {} } },
    windows: { getAll: async () => [{ id: 1 }], getCurrent: async () => ({ id: 1 }), getLastFocused: async () => ({ id: 1 }) },
    tabs: {
      query: async (q) => state.tabs.filter((t) => (q.windowId === undefined || t.windowId === q.windowId) && (q.groupId === undefined || t.groupId === q.groupId)),
      group: async ({ tabIds, groupId, createProperties }) => { const id = groupId ?? state.nextGroup++; if (!state.groups.find((g) => g.id === id)) state.groups.push({ id, title: "", color: "grey", windowId: createProperties?.windowId ?? 1 }); tabIds.forEach((tid) => (state.tabs.find((t) => t.id === tid).groupId = id)); return id; },
      ungroup: async (ids) => ids.forEach((tid) => (state.tabs.find((t) => t.id === tid).groupId = -1)),
      move: async () => {},
      onUpdated: { addListener: (fn) => listeners.push(fn) }
    },
    tabGroups: { query: async ({ windowId }) => state.groups.filter((g) => g.windowId === windowId), update: async (id, props) => Object.assign(state.groups.find((g) => g.id === id), props), TAB_GROUP_ID_NONE: -1 },
    scripting: { executeScript: async () => [{ result: state.pageText }] },
    permissions: { contains: async () => state.allowPageReading, request: async () => true },
    alarms: { create: async () => {}, clear: async () => {}, onAlarm: { addListener: () => {} } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    offscreen: { hasDocument: async () => true, createDocument: async () => {}, closeDocument: async () => {} },
    runtime: { sendMessage: async (m) => (m?.target === "tidy-offscreen" && state.reply ? { ok: true, result: state.reply(m) } : undefined), onMessage: { addListener: () => {} }, onInstalled: { addListener: () => {} }, getURL: (p) => `chrome-extension://test/${p}`, openOptionsPage: async () => {} },
    commands: { onCommand: { addListener: () => {} } }
  };
  return browser;
};

// A pretend built-in model that answers with plain JSON.
export const fakeLanguageModel = (answer) => ({
  availability: async () => "available",
  create: async () => ({ prompt: async (text) => answer(text), destroy: () => {} })
});
