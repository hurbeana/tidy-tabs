// Your own rules only. Nothing here is guessed for you.

// A rule wrapped in slashes is a pattern. Anything else is plain text to look for.
function matches(pattern, tab) {
  const wanted = (pattern ?? "").trim().toLowerCase();
  if (!wanted) return false;

  if (wanted.startsWith("/") && wanted.endsWith("/")) return matchesPattern(wanted.slice(1, -1), tab);

  return tab.host.includes(wanted)
    || tab.url.toLowerCase().includes(wanted)
    || tab.title.toLowerCase().includes(wanted);
}

// A pattern you typed by hand can be nonsense, so a bad one simply never matches.
function matchesPattern(source, tab) {
  try {
    return new RegExp(source, "i").test(`${tab.url} ${tab.title}`);
  } catch {
    return false;
  }
}

export function isSkipped(tab, skipList = []) {
  return skipList.some((pattern) => matches(pattern, tab));
}

export function ruleCategory(tab, rules = []) {
  return rules.find((rule) => matches(rule.match, tab))?.category ?? null;
}

const capitalise = (word) => word.replace(/^./, (first) => first.toUpperCase());

// The last resort, used when you turn every model off.
//
// An address such as 127.0.0.1 has no name, so it is used whole. A domain like
// bbc.co.uk would otherwise be called "Co", so a short second-to-last part is skipped.
export function siteName(tab) {
  const host = (tab.host ?? "").replace(/^www\./, "");
  if (!host) return "Other";

  const isAnAddress = /^[\d.]+$/.test(host) || host.includes(":");
  if (isAnAddress) return host;

  const bits = host.split(".");
  if (bits.length < 2) return capitalise(host);

  const secondToLast = bits.length - 2;
  const tooShortToBeAName = bits[secondToLast].length <= 3 && bits.length > 2;
  return capitalise(tooShortToBeAName ? bits[secondToLast - 1] : bits[secondToLast]);
}
