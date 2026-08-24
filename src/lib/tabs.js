// Collects the tabs worth sorting, and counts the ones it left behind.
import { api } from "./settings.js";
import { isSkipped } from "./rules.js";

export const NONE = -1;

const hostOf = (url) => { try { return new URL(url).hostname; } catch { return ""; } };

const asTab = (tab) => ({ id: tab.id, title: tab.title ?? "", url: tab.url ?? "", host: hostOf(tab.url ?? ""), groupId: tab.groupId ?? NONE, pinned: tab.pinned, index: tab.index });

const readPage = async (tabId, chars) => api.scripting.executeScript({ target: { tabId }, func: (max) => `${document.querySelector('meta[name="description"]')?.content ?? ""} ${document.querySelector("h1")?.innerText ?? ""} ${document.body?.innerText ?? ""}`.replace(/\s+/g, " ").trim().slice(0, max), args: [chars] }).then((r) => r[0]?.result ?? "").catch(() => "");

export const mayReadPages = async () => api.permissions.contains({ origins: ["<all_urls>"] }).catch(() => false);

const addText = async (tabs, settings) => { if (settings.readMode === "title" || !(await mayReadPages())) return tabs; const texts = await Promise.all(tabs.map((tab) => readPage(tab.id, settings.pageTextChars))); return tabs.map((tab, i) => ({ ...tab, text: texts[i] })); };

// Why a tab was left out, or null when it was kept.
const reasonToSkip = (tab, settings) =>
  !/^https?:/.test(tab.url) ? "other"
    : settings.skipPinned && tab.pinned ? "pinned"
      : !settings.regroupExisting && tab.groupId !== NONE ? "grouped"
        : isSkipped(tab, settings.skipList) ? "listed"
          : null;

export const collect = async (windowId, settings) => {
  const all = (await api.tabs.query({ windowId })).map(asTab);
  const skipped = { pinned: 0, grouped: 0, listed: 0, other: 0 };
  const kept = all.filter((tab) => { const why = reasonToSkip(tab, settings); if (why) skipped[why]++; return !why; });
  return { total: all.length, skipped, chosen: await addText(kept, settings) };
};
