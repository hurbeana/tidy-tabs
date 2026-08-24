// Scores a grouping against the answers a person would give.
// Reads test/models/vectors.json, so it runs in a second with no browser.
//
// precision is what matters most: a wrong group is more annoying than a missing one.
import { readFileSync } from "node:fs";

const { tabs, models } = JSON.parse(readFileSync(new URL("./vectors.json", import.meta.url)));
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);

// Two tabs from the same site are usually about the same thing, even when their
// words are not. This is not a list of known sites: it only notices that two of
// YOUR tabs came from one place.
const BONUS = Number(process.env.HOST_BONUS ?? 0);
const sim = (a, b) => dot(vectors[a], vectors[b]) + (BONUS && tabs[a].host === tabs[b].host ? BONUS : 0);
let vectors = [];

const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];

// What "unrelated" looks like for this model and this set of tabs. Every pair is scored,
// and the middle of that spread is the baseline. Nothing here is a number someone chose.
function baseline(vectors) {
  const pairs = [];
  for (let a = 0; a < vectors.length; a++) {
    for (let b = a + 1; b < vectors.length; b++) pairs.push(dot(vectors[a], vectors[b]));
  }
  const middle = median(pairs);
  const spread = median(pairs.map((score) => Math.abs(score - middle)));
  return { middle, spread, pairs };
}

// Average-link: join the two closest groups until the closest pair is no longer related.
function cluster(vs, related) {
  let groups = vs.map((_, i) => [i]);
  const closeness = (a, b) => a.reduce((sum, i) => sum + b.reduce((s, j) => s + sim(i, j), 0), 0) / (a.length * b.length);
  for (;;) {
    let best = null;
    for (let a = 0; a < groups.length; a++) {
      for (let b = a + 1; b < groups.length; b++) {
        const score = closeness(groups[a], groups[b]);
        if (!best || score > best.score) best = { a, b, score };
      }
    }
    if (!best || best.score < related) return groups;
    groups = groups.filter((_, i) => i !== best.a && i !== best.b).concat([[...groups[best.a], ...groups[best.b]]]);
  }
}

// Counts pairs of tabs that belong together and were put together.
function score(groups) {
  const together = new Set();
  for (const group of groups) {
    for (const a of group) for (const b of group) if (a < b) together.add(`${a},${b}`);
  }
  let right = 0, wrong = 0, missed = 0;
  for (let a = 0; a < tabs.length; a++) {
    for (let b = a + 1; b < tabs.length; b++) {
      const same = tabs[a].theme === tabs[b].theme;
      const joined = together.has(`${a},${b}`);
      if (same && joined) right++;
      else if (!same && joined) wrong++;
      else if (same && !joined) missed++;
    }
  }
  const precision = right / (right + wrong || 1);
  const recall = right / (right + missed || 1);
  return { precision, recall, f1: (2 * precision * recall) / (precision + recall || 1) };
}

for (const [id, result] of Object.entries(models)) {
  if (result.error) { console.log(`\n=== ${id}\n  ERROR ${result.error}`); continue; }
  vectors = result.vectors;
  const { middle, spread } = baseline(result.vectors);
  console.log(`\n=== ${id}`);
  console.log(`  unrelated pairs sit around ${middle.toFixed(3)}, spread ${spread.toFixed(3)}`);

  let bestK = null;
  for (const k of [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6]) {
    const related = middle + k * spread;
    const groups = cluster(result.vectors, related).filter((g) => g.length > 1);
    const marks = score(groups);
    const line = `  k=${k} (cut ${related.toFixed(3)}): ${groups.length} groups, precision ${marks.precision.toFixed(2)} recall ${marks.recall.toFixed(2)} f1 ${marks.f1.toFixed(2)}`;
    console.log(line);
    if (!bestK || marks.f1 > bestK.f1) bestK = { k, f1: marks.f1, groups };
  }
  console.log(`  best at k=${bestK.k}:`);
  for (const group of bestK.groups) console.log("     * " + group.map((i) => tabs[i].text.split(" — ")[0]).join(" | "));
}
