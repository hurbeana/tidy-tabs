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
