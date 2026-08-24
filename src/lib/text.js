// Small helpers for turning tabs into text and text into group names.

const NAME_LIMIT = 24;
const MAX_WORDS = 3;
const ALLOWED = /[^\p{L}\p{N} .&+/-]/gu;

// Trims a name down to something that fits on a tab group.
// A name cut in the middle of a word reads as a mistake, so whole words are dropped
// instead. One very long word is cut, because there is nothing else to do with it.
function trimmedToFit(words) {
  const kept = [...words];
  while (kept.length > 1 && kept.join(" ").length > NAME_LIMIT) kept.pop();
  return kept.join(" ").slice(0, NAME_LIMIT);
}

export function tidyName(name) {
  const withoutQuotes = String(name ?? "").replace(/["'`]/g, "");
  const words = withoutQuotes.replace(ALLOWED, " ").trim().split(/\s+/);
  const short = trimmedToFit(words.slice(0, MAX_WORDS));
  return short.replace(/^./, (first) => first.toUpperCase());
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
