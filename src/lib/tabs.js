// Collects the tabs worth sorting, and counts the ones it left behind.
import { api } from "./settings.js";
import { isSkipped } from "./rules.js";

export const NONE = -1;

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
    index: tab.index
  };
}

// Runs inside the page itself. Anything it cannot find simply comes back empty.
function grabText(max) {
  const description = document.querySelector('meta[name="description"]')?.content ?? "";
  const heading = document.querySelector("h1")?.innerText ?? "";
  const body = document.body?.innerText ?? "";
  return `${description} ${heading} ${body}`.replace(/\s+/g, " ").trim().slice(0, max);
}

// A sleeping tab, a PDF, or a page you have not allowed all give nothing back.
async function readPage(tabId, chars) {
  try {
    const results = await api.scripting.executeScript({ target: { tabId }, func: grabText, args: [chars] });
    return results[0]?.result ?? "";
  } catch {
    return "";
  }
}

export function mayReadPages() {
  return api.permissions.contains({ origins: ["<all_urls>"] }).catch(() => false);
}

async function addPageText(tabs, settings) {
  if (settings.readMode === "title") return tabs;
  if (!(await mayReadPages())) return tabs;

  const texts = await Promise.all(tabs.map((tab) => readPage(tab.id, settings.pageTextChars)));
  return tabs.map((tab, i) => ({ ...tab, text: texts[i] }));
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
  const kept = [];

  for (const tab of all) {
    const why = reasonToSkip(tab, settings);
    if (why) skipped[why]++;
    else kept.push(tab);
  }

  return { total: all.length, skipped, chosen: await addPageText(kept, settings) };
}
