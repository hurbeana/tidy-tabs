// Says in plain words what a round of tidying did, and what to change when it did nothing.
import { listOf } from "./text.js";

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const tabs = (n) => count(n, "tab", "tabs");

const leftOut = (r, settings) => [
  r.skipped.grouped && `${tabs(r.skipped.grouped)} already sit in a group. Turn on “Also move tabs that are already in a group” to include them.`,
  r.skipped.pinned && `${tabs(r.skipped.pinned)} are pinned. Turn off “Leave pinned tabs alone” to include them.`,
  r.skipped.listed && `${tabs(r.skipped.listed)} match your skip list.`,
  r.skipped.other && `${tabs(r.skipped.other)} are browser pages, which cannot be grouped.`
].filter(Boolean);

const madeStory = (r) => {
  const joined = r.made.filter((g) => g.reused);
  return [
    `Made ${count(r.made.length, "group", "groups")} from ${tabs(r.made.reduce((n, g) => n + g.count, 0))}: ${listOf(r.made)}.`,
    joined.length ? `${count(joined.length, "group was", "groups were")} one you already had open.` : "",
    r.lined ? "This browser has no tab groups, so matching tabs were parked side by side instead." : ""
  ].filter(Boolean).join(" ");
};

const nothingStory = (r, settings) => {
  if (r.tooSmall.length) return `Every topic was too small to become a group: ${listOf(r.tooSmall)}. Lower “Fewest tabs a group may have”, which is set to ${settings.minTabsPerGroup}.`;
  return `${r.using ?? "The model"} looked at ${tabs(r.considered)} and named none of them. Open the settings page and press “Get this model ready”.`;
};

export const explain = (r, settings) => {
  if (r.error) return `The model could not answer: ${r.error}`;
  if (!r.total) return "There are no tabs in this window.";
  if (!r.considered) return `Nothing was left to sort. ${leftOut(r, settings).join(" ") || "Every tab was skipped."}`;
  const main = r.made.length ? madeStory(r) : nothingStory(r, settings);
  const extra = [
    r.made.length && r.tooSmall.length ? `${count(r.tooSmall.length, "topic was", "topics were")} too small to bother with: ${listOf(r.tooSmall)}.` : "",
    r.trimmed?.length ? `${count(r.trimmed.length, "more topic was", "more topics were")} dropped because you allow at most ${settings.maxGroups} groups: ${listOf(r.trimmed)}.` : ""
  ].filter(Boolean);
  return [main, ...extra].join(" ");
};

// A one-line version for the toolbar badge and the console.
export const shortly = (r) => (r.error ? "failed" : r.made.length ? `${r.made.length} group(s), ${r.made.reduce((n, g) => n + g.count, 0)} tab(s)` : "nothing moved");
