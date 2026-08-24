// Says in plain words what a round of tidying did, and what to change when it did nothing.
import { listOf } from "./text.js";

function count(howMany, one, many) {
  return `${howMany} ${howMany === 1 ? one : many}`;
}

const tabs = (howMany) => count(howMany, "tab", "tabs");

const totalTabs = (groups) => groups.reduce((sum, group) => sum + group.count, 0);

// Why nothing was left to sort, and what to change to include those tabs.
function reasonsForSkipping(report) {
  const { grouped, pinned, listed, other } = report.skipped;
  const reasons = [];

  if (grouped) reasons.push(`${tabs(grouped)} already sit in a group. Turn on “Also move tabs that are already in a group” to include them.`);
  if (pinned) reasons.push(`${tabs(pinned)} are pinned. Turn off “Leave pinned tabs alone” to include them.`);
  if (listed) reasons.push(`${tabs(listed)} match your skip list.`);
  if (other) reasons.push(`${tabs(other)} are browser pages, which cannot be grouped.`);

  return reasons;
}

function whatWasMade(report) {
  const reused = report.made.filter((group) => group.reused);
  const sentences = [`Made ${count(report.made.length, "group", "groups")} from ${tabs(totalTabs(report.made))}: ${listOf(report.made)}.`];

  if (reused.length) sentences.push(`${count(reused.length, "group was", "groups were")} one you already had.`);
  if (report.lined) sentences.push("This browser has no tab groups, so matching tabs were parked side by side instead.");

  return sentences.join(" ");
}

// Nothing was grouped, which after reading every tab means they had nothing in common.
function whyNothingWasMade(report, settings) {
  const looked = `Read ${tabs(report.considered)} and found nothing that belongs together.`;

  if (report.considered < 2) return "There is only one tab to sort, and a group needs at least two.";
  if (!settings.readPages) return `${looked} Turn on “Read a little of each page, not just its title” to give it more to go on.`;

  return `${looked} They may simply be about different things. Open a few more tabs on a topic and try again.`;
}

// Anything worth adding after the main sentence.
function asides(report, settings) {
  const extra = [];

  if (report.made.length && report.loose.length) {
    extra.push(`${count(report.loose.length, "tab was", "tabs were")} left loose, because nothing else was about the same thing.`);
  }
  if (report.read) {
    extra.push(`${count(report.read, "page was", "pages were")} read to work that out.`);
  }
  if (report.trimmed?.length) {
    extra.push(`${count(report.trimmed.length, "more group was", "more groups were")} dropped because you allow at most ${settings.maxGroups}: ${listOf(report.trimmed)}.`);
  }

  return extra;
}

export function explain(report, settings) {
  if (report.error) return `Tidying could not finish: ${report.error}`;
  if (!report.total) return "There are no tabs in this window.";

  if (!report.considered) {
    const reasons = reasonsForSkipping(report);
    return `Nothing was left to sort. ${reasons.length ? reasons.join(" ") : "Every tab was skipped."}`;
  }

  const main = report.made.length ? whatWasMade(report) : whyNothingWasMade(report, settings);
  return [main, ...asides(report, settings)].join(" ");
}

// A short version for the console.
export function shortly(report) {
  if (report.error) return "failed";
  if (!report.made.length) return "nothing moved";
  return `${report.made.length} group(s), ${totalTabs(report.made)} tab(s)`;
}
