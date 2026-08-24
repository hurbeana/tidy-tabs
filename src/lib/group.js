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
const decide = async (tabs, settings, openGroups) => {
  const named = tabs.map((tab) => ruleCategory(tab, settings.rules));
  const rest = tabs.map((tab, i) => (named[i] ? null : { ...tab, at: i })).filter(Boolean);
  const answer = rest.length ? await labelTabs(rest, settings, openGroups) : { using: "your own rules", names: [] };
  rest.forEach((tab, i) => { named[tab.at] = answer.names?.[i] ?? null; });
  return { names: named.map((name) => (name ? tidyName(name) : null)), using: answer.using, error: answer.error };
};

const share = (tabs, names, name) => tabs.filter((_, i) => names[i] === name).map((tab) => tab.id);

const finish = (report, settings) => ({ ...report, note: explain(report, settings) });

export const groupWindow = async (windowId, settings) => {
  const { total, skipped, chosen } = await collect(windowId, settings);
  const blank = { total, skipped, considered: chosen.length, using: null, error: null, made: [], tooSmall: [], trimmed: [], lined: false, groups: 0, tabs: 0 };
  if (!chosen.length) return finish(blank, settings);

  const openGroups = await openGroupNames(windowId, settings);
  const { names, using, error } = await decide(chosen, settings, openGroups);
  if (error) return finish({ ...blank, using, error }, settings);

  const open = new Set(openGroups.map((name) => name.toLowerCase()));
  const all = countBy(names);
  const big = all.filter(({ name, count }) => count >= settings.minTabsPerGroup || open.has(name.toLowerCase()));
  const [keep, trimmed] = [big.slice(0, settings.maxGroups), big.slice(settings.maxGroups)];
  const tooSmall = all.filter((topic) => !big.includes(topic));
  const pairs = keep.map(({ name }) => [name, share(chosen, names, name)]);

  if (!hasTabGroups()) { await lineUp(pairs); return finish({ ...blank, using, tooSmall, trimmed, lined: true, made: keep, groups: keep.length, tabs: keep.reduce((n, g) => n + g.count, 0) }, settings); }
  const made = await applyAll(windowId, pairs, settings);
  return finish({ ...blank, using, tooSmall, trimmed, made, groups: made.length, tabs: made.reduce((n, g) => n + g.count, 0) }, settings);
};

export const groupAll = async (settings, windowId) => {
  const ids = settings.scope === "all" || windowId === undefined ? (await api.windows.getAll({ windowTypes: ["normal"] })).map((w) => w.id) : [windowId];
  const reports = [];
  for (const id of ids) reports.push(await groupWindow(id, settings));
  return reports.length === 1 ? reports[0] : { ...reports[0], groups: reports.reduce((n, r) => n + r.groups, 0), tabs: reports.reduce((n, r) => n + r.tabs, 0), note: reports.map((r) => r.note).join(" ") };
};
