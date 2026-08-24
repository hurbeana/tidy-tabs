// Your own rules only. Nothing here is guessed for you.
const matches = (pattern, tab) => { const p = (pattern ?? "").trim().toLowerCase(); return !!p && (p.startsWith("/") && p.endsWith("/") ? safeRegex(p.slice(1, -1), tab) : tab.host.includes(p) || tab.url.toLowerCase().includes(p) || tab.title.toLowerCase().includes(p)); };

const safeRegex = (source, tab) => { try { return new RegExp(source, "i").test(`${tab.url} ${tab.title}`); } catch { return false; } };

export const isSkipped = (tab, skipList = []) => skipList.some((p) => matches(p, tab));

export const ruleCategory = (tab, rules = []) => rules.find((r) => matches(r.match, tab))?.category ?? null;

// Last resort when you turn every model off: the website name.
// An address such as 127.0.0.1 has no name, so it is used whole. A domain like
// bbc.co.uk would otherwise be called "Co", so a short second-to-last part is skipped.
export const siteName = (tab) => {
  const host = (tab.host ?? "").replace(/^www\./, "");
  if (!host) return "Other";
  if (/^[\d.]+$/.test(host) || host.includes(":")) return host;
  const bits = host.split(".");
  if (bits.length < 2) return host.replace(/^./, (c) => c.toUpperCase());
  const second = bits.length - 2;
  const pick = bits[second].length <= 3 && bits.length > 2 ? bits[second - 1] : bits[second];
  return pick.replace(/^./, (c) => c.toUpperCase());
};
