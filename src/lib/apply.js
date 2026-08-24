// Turns a list of names and tabs into real tab groups.
import { api } from "./settings.js";

const COLORS = ["blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange", "grey"];

export const hasTabGroups = () => !!(api.tabs.group && api.tabGroups);

const colorFor = (name, colors) => colors[name] ?? COLORS[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORS.length];

export const openGroupNames = async (windowId, settings) => (hasTabGroups() && settings.reuseExisting ? (await api.tabGroups.query({ windowId })).map((g) => g.title).filter(Boolean) : []);

const knownGroups = async (windowId) => new Map((await api.tabGroups.query({ windowId })).map((g) => [(g.title ?? "").toLowerCase(), g.id]));

const sortGroup = async (groupId) => { const tabs = (await api.tabs.query({ groupId })).sort((a, b) => (a.title ?? "").localeCompare(b.title ?? "")); await api.tabs.move(tabs.map((t) => t.id), { index: Math.min(...tabs.map((t) => t.index)) }); };

const buildOne = async (name, tabIds, windowId, known, settings) => {
  const existing = known.get(name.toLowerCase());
  const id = await api.tabs.group(existing === undefined ? { tabIds, createProperties: { windowId } } : { tabIds, groupId: existing });
  known.set(name.toLowerCase(), id);
  await api.tabGroups.update(id, { title: name, color: colorFor(name, settings.colors), ...(existing === undefined && settings.collapseNewGroups ? { collapsed: true } : {}) });
  if (settings.sortInGroups) await sortGroup(id);
  return { id, reused: existing !== undefined };
};

// Only looks at groups this round built. Groups you made yourself are left alone.
const dropSingles = async (touched, settings) => { if (!settings.ungroupSingles) return; for (const id of touched) { const tabs = await api.tabs.query({ groupId: id }); if (tabs.length && tabs.length < settings.minTabsPerGroup) await api.tabs.ungroup(tabs.map((t) => t.id)); } };

// A browser with no tab groups gets the next best thing: same-topic tabs side by side.
export const lineUp = async (pairs) => { let index = 0; for (const [, ids] of pairs) { await api.tabs.move(ids, { index }); index += ids.length; } };

export const applyAll = async (windowId, pairs, settings) => {
  const known = await knownGroups(windowId);
  const touched = new Set();
  const made = [];
  for (const [name, ids] of pairs) {
    await buildOne(name, ids, windowId, known, settings).then(({ id, reused }) => { touched.add(id); made.push({ name, count: ids.length, reused }); }, (error) => settings.debug && console.warn("Tidy Tabs: could not build the group.", name, error));
  }
  await dropSingles(touched, settings);
  return made;
};
