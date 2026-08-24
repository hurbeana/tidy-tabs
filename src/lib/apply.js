// Turns a list of names and tabs into real tab groups.
import { api } from "./settings.js";

const COLORS = ["blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange", "grey"];

export function hasTabGroups() {
  return Boolean(api.tabs.group && api.tabGroups);
}

// The same name always gets the same colour, unless you chose one yourself.
function colorFor(name, chosenColors) {
  if (chosenColors[name]) return chosenColors[name];
  const total = [...name].reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
  return COLORS[total % COLORS.length];
}

// The groups open in this window, with the id needed to add tabs to them.
export async function openGroups(windowId) {
  if (!hasTabGroups()) return [];
  const groups = await api.tabGroups.query({ windowId });
  return groups.map((group) => ({ id: group.id, title: group.title ?? "" }));
}

async function groupsByName(windowId) {
  const groups = await api.tabGroups.query({ windowId });
  return new Map(groups.map((group) => [(group.title ?? "").toLowerCase(), group.id]));
}

async function sortGroup(groupId) {
  const tabs = await api.tabs.query({ groupId });
  const firstPlace = Math.min(...tabs.map((tab) => tab.index));
  const byTitle = tabs.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
  await api.tabs.move(byTitle.map((tab) => tab.id), { index: firstPlace });
}

async function buildOne(name, tabIds, windowId, known, settings) {
  const existing = known.get(name.toLowerCase());
  const isNew = existing === undefined;

  const id = await api.tabs.group(isNew ? { tabIds, createProperties: { windowId } } : { tabIds, groupId: existing });
  known.set(name.toLowerCase(), id);

  const look = { title: name, color: colorFor(name, settings.colors) };
  if (isNew && settings.collapseNewGroups) look.collapsed = true;
  await api.tabGroups.update(id, look);

  if (settings.sortInGroups) await sortGroup(id);
  return { id, reused: !isNew };
}

// A browser with no tab groups gets the next best thing: same-topic tabs side by side.
export async function lineUp(pairs) {
  let index = 0;
  for (const [, tabIds] of pairs) {
    await api.tabs.move(tabIds, { index });
    index += tabIds.length;
  }
}

export async function applyAll(windowId, pairs, settings) {
  const known = await groupsByName(windowId);
  const made = [];

  for (const [name, tabIds] of pairs) {
    try {
      const { reused } = await buildOne(name, tabIds, windowId, known, settings);
      made.push({ name, count: tabIds.length, reused });
    } catch (error) {
      // One group failing should not stop the rest.
      if (settings.debug) console.warn("Tidy Tabs: could not build the group.", name, error);
    }
  }

  return made;
}
