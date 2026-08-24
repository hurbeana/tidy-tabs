// Small helpers for turning tabs into text and text into group names.

const NAME_LIMIT = 24;
const MAX_WORDS = 3;
const ALLOWED = /[^\p{L}\p{N} .&+/-]/gu;

// Trims a name down to something that fits on a tab group.
export function tidyName(name) {
  const withoutQuotes = String(name ?? "").replace(/["'`]/g, "");
  const words = withoutQuotes.replace(ALLOWED, " ").trim().split(/\s+/);
  const short = words.slice(0, MAX_WORDS).join(" ").slice(0, NAME_LIMIT);
  return short.replace(/^./, (first) => first.toUpperCase());
}

// What the model gets to see about one tab.
//
// The web address is always included: it costs nothing and it helps a lot. The title
// is left out only when you asked to read page text instead, and even then it comes
// back if the page had no text, so no tab is ever described by nothing.
export function parts(tab, readMode) {
  const titleWouldBeSkipped = readMode === "content" && tab.text;
  return [titleWouldBeSkipped ? null : tab.title, tab.host, tab.text].filter(Boolean);
}

export function describe(tab, index, readMode) {
  return `${index}. ${parts(tab, readMode).join(" — ")}`;
}

const COMPARE_LIMIT = 500;

export function textOf(tab, readMode) {
  return parts(tab, readMode).join(" ").slice(0, COMPARE_LIMIT);
}

export function chunks(list, size) {
  const howMany = Math.ceil(list.length / size);
  return Array.from({ length: howMany }, (_, i) => list.slice(i * size, i * size + size));
}

// Both vectors are already unit length, so the dot product is the cosine.
export function cosine(a, b) {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += a[i] * b[i];
  return total;
}

const STOP_WORDS = new Set(
  "the a an and or of for to in on at is are with your you my how what why new home page site com www online free best top guide 2024 2025 2026".split(" ")
);

// Names a cluster after the word its tabs share most often.
export function commonWord(titles) {
  const words = titles.flatMap((title) => title.toLowerCase().split(/[^\p{L}\p{N}]+/u));
  const worthCounting = words.filter((word) => word.length > 3 && !STOP_WORDS.has(word));

  const seen = new Map();
  for (const word of worthCounting) seen.set(word, (seen.get(word) ?? 0) + 1);

  const byCount = [...seen].sort((a, b) => b[1] - a[1]);
  return byCount[0]?.[0] ?? null;
}

// Turns ["Code", "Code", "News"] into [{name: "Code", count: 2}, {name: "News", count: 1}].
export function countBy(names) {
  const counts = new Map();
  for (const name of names) {
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

// Turns those counts back into "Code (2), News (1)".
export function listOf(topics) {
  return topics.map(({ name, count }) => `${name} (${count})`).join(", ");
}
