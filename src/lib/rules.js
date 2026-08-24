// Your own rules only. Nothing here is guessed for you.
const matches = (pattern, tab) => { const p = (pattern ?? "").trim().toLowerCase(); return !!p && (p.startsWith("/") && p.endsWith("/") ? safeRegex(p.slice(1, -1), tab) : tab.host.includes(p) || tab.url.toLowerCase().includes(p) || tab.title.toLowerCase().includes(p)); };

const safeRegex = (source, tab) => { try { return new RegExp(source, "i").test(`${tab.url} ${tab.title}`); } catch { return false; } };

export const isSkipped = (tab, skipList = []) => skipList.some((p) => matches(p, tab));

export const ruleCategory = (tab, rules = []) => rules.find((r) => matches(r.match, tab))?.category ?? null;

// Last resort when you turn every model off: the website name.
export const siteName = (tab) => { const parts = tab.host.replace(/^www\./, "").split("."); return parts.length > 1 ? parts[parts.length - 2].replace(/^./, (c) => c.toUpperCase()) : tab.host || "Other"; };
