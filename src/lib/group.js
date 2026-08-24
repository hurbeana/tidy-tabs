// Collects your tabs, decides a topic for each one, then builds the groups.
import { api } from "./settings.js";
import { labelTabs, tidyName } from "./label.js";
import { isSkipped, ruleCategory } from "./rules.js";

const COLORS = ["blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange", "grey"];
const NONE = -1;

export const hasTabGroups = () => !!(api.tabs.group && api.tabGroups);

const colorFor = (name, colors) => colors[name] ?? COLORS[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORS.length];

const hostOf = (url) => { try { return new URL(url).hostname; } catch { return ""; } };

const readable = (tab) => /^https?:/.test(tab.url ?? "");

const asTab = (tab) => ({ id: tab.id, title: tab.title ?? "", url: tab.url ?? "", host: hostOf(tab.url ?? ""), groupId: tab.groupId ?? NONE, pinned: tab.pinned, index: tab.index });

const pageText = async (tabId, chars) => api.scripting.executeScript({ target: { tabId }, func: (max) => `${document.querySelector('meta[name="description"]')?.content ?? ""} ${document.querySelector("h1")?.innerText ?? ""} ${document.body?.innerText ?? ""}`.replace(/\s+/g, " ").trim().slice(0, max), args: [chars] }).then((r) => r[0]?.result ?? "").catch(() => "");

const mayReadPages = async () => api.permissions.contains({ origins: ["<all_urls>"] }).catch(() => false);

const pickTabs = (tabs, settings) => tabs.map(asTab).filter((t) => readable(t) && !(settings.skipPinned && t.pinned) && (settings.regroupExisting || t.groupId === NONE) && !isSkipped(t, settings.skipList));

const addText = async (tabs, settings) => { if (!settings.readPageText || !(await mayReadPages())) return tabs; const texts = await Promise.all(tabs.map((t) => pageText(t.id, settings.pageTextChars))); return tabs.map((t, i) => ({ ...t, text: texts[i] })); };

const decide = async (tabs, settings, openGroups) => {
  const named = tabs.map((t) => ruleCategory(t, settings.rules));
  const rest = tabs.map((t, i) => (named[i] ? null : { ...t, at: i })).filter(Boolean);
  const fromModel = rest.length ? await labelTabs(rest, settings, openGroups) : [];
  rest.forEach((t, i) => { named[t.at] = fromModel?.[i] ?? null; });
  return named.map((name) => (name ? tidyName(name) : null));
};

// A name that already has a group open is always allowed, however few tabs join it.
const buckets = (tabs, names, settings, openGroups) => {
  const open = new Set(openGroups.map((name) => name.toLowerCase()));
  const map = new Map();
  names.forEach((name, i) => name && map.set(name, [...(map.get(name) ?? []), tabs[i].id]));
  return [...map].filter(([name, ids]) => ids.length >= settings.minTabsPerGroup || open.has(name.toLowerCase())).sort((a, b) => b[1].length - a[1].length).slice(0, settings.maxGroups);
};

const existingGroups = async (windowId) => new Map((await api.tabGroups.query({ windowId })).map((g) => [(g.title ?? "").toLowerCase(), g.id]));

const openGroupNames = async (windowId, settings) => (hasTabGroups() && settings.reuseExisting ? (await api.tabGroups.query({ windowId })).map((g) => g.title).filter(Boolean) : []);

const applyGroup = async (name, tabIds, windowId, known, settings) => {
  const groupId = known.get(name.toLowerCase());
  const id = await api.tabs.group(groupId === undefined ? { tabIds, createProperties: { windowId } } : { tabIds, groupId });
  known.set(name.toLowerCase(), id);
  await api.tabGroups.update(id, { title: name, color: colorFor(name, settings.colors), ...(groupId === undefined && settings.collapseNewGroups ? { collapsed: true } : {}) });
  if (settings.sortInGroups) await sortGroup(id);
  return id;
};

const sortGroup = async (groupId) => { const tabs = (await api.tabs.query({ groupId })).sort((a, b) => (a.title ?? "").localeCompare(b.title ?? "")); await api.tabs.move(tabs.map((t) => t.id), { index: Math.min(...tabs.map((t) => t.index)) }); };

// Only looks at groups this round built. Groups you made yourself are left alone.
const dropSingles = async (touched, settings) => { if (!settings.ungroupSingles) return; for (const id of touched) { const tabs = await api.tabs.query({ groupId: id }); if (tabs.length && tabs.length < settings.minTabsPerGroup) await api.tabs.ungroup(tabs.map((t) => t.id)); } };

// Falls back to simply parking same-topic tabs side by side when the browser has no tab groups.
const lineUp = async (pairs) => { let index = 0; for (const [, ids] of pairs) { await api.tabs.move(ids, { index }); index += ids.length; } };

export const groupWindow = async (windowId, settings) => {
  const tabs = await addText(pickTabs(await api.tabs.query({ windowId }), settings), settings);
  if (!tabs.length) return { groups: 0, tabs: 0 };
  const openGroups = await openGroupNames(windowId, settings);
  const pairs = buckets(tabs, await decide(tabs, settings, openGroups), settings, openGroups);
  const moved = pairs.reduce((n, [, ids]) => n + ids.length, 0);
  if (!hasTabGroups()) { await lineUp(pairs); return { groups: pairs.length, tabs: moved, lined: true }; }
  const known = await existingGroups(windowId);
  const touched = new Set();
  for (const [name, ids] of pairs) await applyGroup(name, ids, windowId, known, settings).then((id) => touched.add(id), (e) => settings.debug && console.warn("Tidy Tabs: could not build the group.", name, e));
  await dropSingles(touched, settings);
  return { groups: pairs.length, tabs: moved };
};

export const groupAll = async (settings, windowId) => {
  const ids = settings.scope === "all" || windowId === undefined ? (await api.windows.getAll({ windowTypes: ["normal"] })).map((w) => w.id) : [windowId];
  const results = [];
  for (const id of ids) results.push(await groupWindow(id, settings));
  return results.reduce((sum, r) => ({ groups: sum.groups + r.groups, tabs: sum.tabs + r.tabs, lined: sum.lined || r.lined }), { groups: 0, tabs: 0, lined: false });
};
