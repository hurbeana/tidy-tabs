// Runs one round of tidying: collect the tabs, work out the groups, build them, report.
import { api } from "./settings.js";
import { collect, readPages } from "./tabs.js";
import { applyAll, hasTabGroups, lineUp, openGroups } from "./apply.js";
import { organise, FEWEST_TABS } from "./organise.js";
import { nameGroup } from "./naming.js";
import { ruleCategory } from "./rules.js";
import { middleOf, recall, remember } from "./memory.js";
import { readerSpec } from "./models.js";
import { run } from "./runtime.js";
import { tidyName } from "./text.js";
import { explain } from "./report.js";

export { hasTabGroups };

// Tabs are read in small batches so a window with a hundred tabs open never asks the
// computer for a hundred tabs' worth of memory at once.
const BATCH = 32;

function reader(settings) {
  const spec = readerSpec(settings);

  return async function embed(texts) {
    const vectors = [];
    for (let start = 0; start < texts.length; start += BATCH) {
      const batch = texts.slice(start, start + BATCH);
      vectors.push(...await run(spec, "feature-extraction", [batch], { pooling: "mean", normalize: true }));
    }
    return vectors;
  };
}

// Everything the round already knows: the groups open in this window, and the ones it
// has seen before. A group that is open wins, because it is the one you can see.
async function whatIsKnown(windowId, inGroups, embed, settings) {
  // The groups open in front of you are always read. Remembering is only about the
  // groups that are no longer here.
  const live = [];
  for (const group of await openGroups(windowId)) {
    const theirTabs = inGroups.filter((tab) => tab.groupId === group.id);
    if (!group.title || !theirTabs.length) continue;

    const vectors = await embed(theirTabs.map((tab) => `${tab.title} ${tab.url}`));
    live.push({ name: group.title, centre: middleOf(vectors) });
  }

  if (!settings.remember) return live;

  const open = new Set(live.map((group) => group.name.toLowerCase()));
  const remembered = (await recall(readerSpec(settings).id)).filter((group) => !open.has(group.name.toLowerCase()));
  return [...live, ...remembered];
}

// Your own rules answer first. The model only ever sees what is left.
function applyRules(tabs, settings) {
  const named = new Map();
  const rest = [];

  for (const tab of tabs) {
    const name = ruleCategory(tab, settings.rules);
    if (name) named.set(tab.id, tidyName(name));
    else rest.push(tab);
  }

  return { named, rest };
}

function fromRules(named) {
  const byName = new Map();
  for (const [tabId, name] of named) {
    const already = byName.get(name.toLowerCase());
    if (already) already.tabIds.push(tabId);
    else byName.set(name.toLowerCase(), { name, tabIds: [tabId], count: 0, isNew: true, centre: null });
  }

  return [...byName.values()].map((group) => ({ ...group, count: group.tabIds.length }));
}

// A tab nobody could place gets a second chance with its page read, but only if you
// allowed that and only for the few tabs it would actually help.
async function secondLook(loose, known, settings, embed) {
  if (!settings.readPages || loose.length < FEWEST_TABS) return { groups: [], stillLoose: loose };

  const withText = await readPages(loose);
  if (withText.every((tab) => !tab.text)) return { groups: [], stillLoose: loose };

  const { groups } = await organise({ tabs: withText, known, settings, embed, name: nameGroup });
  const placed = new Set(groups.flatMap((group) => group.tabIds));
  return { groups, stillLoose: loose.filter((tab) => !placed.has(tab.id)), read: withText.filter((tab) => tab.text).length };
}

const biggestFirst = (groups) => [...groups].sort((a, b) => b.count - a.count);

export async function groupWindow(windowId, settings) {
  const { total, skipped, chosen, inGroups } = await collect(windowId, settings);
  const blank = {
    total, skipped, considered: chosen.length,
    error: null, made: [], loose: [], trimmed: [], lined: false,
    groups: 0, tabs: 0, read: 0, remembered: 0
  };

  if (!chosen.length) return withNote(blank, settings);

  try {
    return withNote(await think(windowId, chosen, inGroups, blank, settings), settings);
  } catch (error) {
    if (settings.debug) console.warn("Tidy Tabs: the round could not finish.", error);
    return withNote({ ...blank, error: String(error?.message ?? error) }, settings);
  }
}

async function think(windowId, chosen, inGroups, blank, settings) {
  const embed = reader(settings);
  const known = await whatIsKnown(windowId, inGroups, embed, settings);

  const { named, rest } = applyRules(chosen, settings);
  const first = await organise({ tabs: rest, known, settings, embed, name: nameGroup });

  const placed = new Set(first.groups.flatMap((group) => group.tabIds));
  const loose = rest.filter((tab) => !placed.has(tab.id));
  const second = await secondLook(loose, [...known, ...first.groups], settings, embed);

  const everything = [...fromRules(named), ...first.groups, ...second.groups];
  const keep = biggestFirst(everything).slice(0, settings.maxGroups);
  const trimmed = biggestFirst(everything).slice(settings.maxGroups);

  const made = await build(windowId, keep, settings);
  const remembered = await keepInMind(keep, settings);

  return {
    ...blank,
    made,
    loose: second.stillLoose.map((tab) => tab.title),
    trimmed: trimmed.map((group) => ({ name: group.name, count: group.count })),
    lined: !hasTabGroups(),
    read: second.read ?? 0,
    remembered,
    groups: made.length,
    tabs: made.reduce((sum, group) => sum + group.count, 0)
  };
}

async function build(windowId, groups, settings) {
  const pairs = groups.map((group) => [group.name, group.tabIds]);

  if (!hasTabGroups()) {
    await lineUp(pairs);
    return groups.map((group) => ({ name: group.name, count: group.count, reused: !group.isNew }));
  }

  return applyAll(windowId, pairs, settings);
}

// Only groups the model worked out are worth remembering. A group from one of your own
// rules is already written down, in the rule.
function keepInMind(groups, settings) {
  if (!settings.remember) return 0;

  const worth = groups.filter((group) => group.centre);
  if (!worth.length) return 0;

  // If this cannot be saved the round says so, rather than quietly forgetting.
  const asMemories = worth.map((group) => ({ name: group.name, centre: group.centre, tabs: group.count }));
  return remember(readerSpec(settings).id, asMemories, Date.now());
}

const withNote = (report, settings) => ({ ...report, note: explain(report, settings) });

async function windowsToTidy(settings, windowId) {
  const everyWindow = settings.scope === "all" || windowId === undefined;
  if (!everyWindow) return [windowId];

  const windows = await api.windows.getAll({ windowTypes: ["normal"] });
  return windows.map((one) => one.id);
}

export async function groupAll(settings, windowId) {
  const reports = [];
  for (const id of await windowsToTidy(settings, windowId)) reports.push(await groupWindow(id, settings));

  if (reports.length === 1) return reports[0];

  return {
    ...reports[0],
    groups: reports.reduce((sum, report) => sum + report.groups, 0),
    tabs: reports.reduce((sum, report) => sum + report.tabs, 0),
    note: reports.map((report) => report.note).join(" ")
  };
}
