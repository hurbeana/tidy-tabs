// Collects the tabs worth sorting, and counts the ones it left behind.
import { api } from "./settings.js";
import { isSkipped } from "./rules.js";
import { readSummary } from "./summary.js";

export const NONE = -1;

const PAGE_LIMIT = 500;

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function asTab(tab) {
  return {
    id: tab.id,
    title: tab.title ?? "",
    url: tab.url ?? "",
    host: hostOf(tab.url ?? ""),
    groupId: tab.groupId ?? NONE,
    pinned: tab.pinned,
    index: tab.index,
    text: ""
  };
}

export function mayReadPages() {
  return api.permissions.contains({ origins: ["<all_urls>"] }).catch(() => false);
}

// A sleeping tab, a PDF, or a page you have not allowed all give nothing back.
async function readOne(tabId) {
  try {
    const results = await api.scripting.executeScript({ target: { tabId }, func: readSummary, args: [PAGE_LIMIT] });
    return results[0]?.result ?? "";
  } catch {
    return "";
  }
}

// Every tab is read now, so a window with a hundred tabs open would ask the browser to
// run a hundred scripts at once. A few at a time is just as quick in practice and leaves
// the rest of the computer alone.
const AT_ONCE = 8;

export async function readPages(tabs) {
  if (!(await mayReadPages())) return tabs;

  const summaries = [];
  for (let start = 0; start < tabs.length; start += AT_ONCE) {
    const batch = tabs.slice(start, start + AT_ONCE);
    summaries.push(...await Promise.all(batch.map((tab) => readOne(tab.id))));
  }

  return tabs.map((tab, i) => ({ ...tab, text: summaries[i] }));
}

// Why a tab was left out, or null when it was kept.
function reasonToSkip(tab, settings) {
  if (!/^https?:/.test(tab.url)) return "other";
  if (settings.skipPinned && tab.pinned) return "pinned";
  if (!settings.regroupExisting && tab.groupId !== NONE) return "grouped";
  if (isSkipped(tab, settings.skipList)) return "listed";
  return null;
}

export async function collect(windowId, settings) {
  const all = (await api.tabs.query({ windowId })).map(asTab);
  const skipped = { pinned: 0, grouped: 0, listed: 0, other: 0 };
  const chosen = [];

  for (const tab of all) {
    const why = reasonToSkip(tab, settings);
    if (why) skipped[why]++;
    else chosen.push(tab);
  }

  // Tabs already in a group are not moved, but they are still read. They are the best
  // evidence of what each of your groups is actually about.
  const inGroups = all.filter((tab) => tab.groupId !== NONE && /^https?:/.test(tab.url));

  return { total: all.length, skipped, chosen, inGroups };
}
