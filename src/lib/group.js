// Runs one round of tidying: collect the tabs, name them, build the groups, report back.
import { api } from "./settings.js";
import { collect } from "./tabs.js";
import { applyAll, hasTabGroups, lineUp, openGroupNames } from "./apply.js";
import { labelTabs } from "./label.js";
import { ruleCategory } from "./rules.js";
import { countBy, tidyName } from "./text.js";
import { explain } from "./report.js";

export { hasTabGroups };

// Your own rules answer first. The model only sees what is left.
async function decide(tabs, settings, openGroups) {
  const names = tabs.map((tab) => ruleCategory(tab, settings.rules));
  const forTheModel = tabs
    .map((tab, index) => ({ ...tab, index }))
    .filter((tab) => !names[tab.index]);

  if (!forTheModel.length) return { names: names.map((name) => tidyName(name)), using: "your own rules" };

  const answer = await labelTabs(forTheModel, settings, openGroups);
  forTheModel.forEach((tab, i) => {
    names[tab.index] = answer.names?.[i] ?? null;
  });

  return {
    names: names.map((name) => (name ? tidyName(name) : null)),
    using: answer.using,
    error: answer.error
  };
}

const idsNamed = (tabs, names, wanted) => tabs.filter((_, i) => names[i] === wanted).map((tab) => tab.id);

// A topic becomes a group if enough tabs share it, or if that group is already open.
function sortTopics(names, openGroups, settings) {
  const open = new Set(openGroups.map((name) => name.toLowerCase()));
  const everyTopic = countBy(names);

  const bigEnough = everyTopic.filter(({ name, count }) => count >= settings.minTabsPerGroup || open.has(name.toLowerCase()));

  return {
    keep: bigEnough.slice(0, settings.maxGroups),
    trimmed: bigEnough.slice(settings.maxGroups),
    tooSmall: everyTopic.filter((topic) => !bigEnough.includes(topic))
  };
}

const withNote = (report, settings) => ({ ...report, note: explain(report, settings) });

const countTabs = (topics) => topics.reduce((sum, topic) => sum + topic.count, 0);

export async function groupWindow(windowId, settings) {
  const { total, skipped, chosen } = await collect(windowId, settings);
  const blank = {
    total, skipped, considered: chosen.length,
    using: null, error: null,
    made: [], tooSmall: [], trimmed: [], lined: false,
    groups: 0, tabs: 0
  };

  if (!chosen.length) return withNote(blank, settings);

  const openGroups = await openGroupNames(windowId, settings);
  const { names, using, error } = await decide(chosen, settings, openGroups);
  if (error) return withNote({ ...blank, using, error }, settings);

  const { keep, trimmed, tooSmall } = sortTopics(names, openGroups, settings);
  const pairs = keep.map(({ name }) => [name, idsNamed(chosen, names, name)]);
  const partial = { ...blank, using, tooSmall, trimmed };

  if (!hasTabGroups()) {
    await lineUp(pairs);
    return withNote({ ...partial, lined: true, made: keep, groups: keep.length, tabs: countTabs(keep) }, settings);
  }

  const made = await applyAll(windowId, pairs, settings);
  return withNote({ ...partial, made, groups: made.length, tabs: countTabs(made) }, settings);
}

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
