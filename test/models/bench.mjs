// A bench for trying grouping strategies without a browser.
//
// It scores two things a person cares about:
//   together  - do tabs about one subject end up in one group (pairwise F1)
//   left out  - do tabs about nothing in particular stay out of every group
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";

export function loadSet(name) {
  return JSON.parse(readFileSync(new URL(`./${name}.json`, import.meta.url), "utf8")).tabs;
}

// Embeddings are slow and never change, so they are worked out once and kept.
export async function vectorsFor(texts, modelId, cacheName) {
  const cache = `.tools/bench/${cacheName}.json`;
  if (existsSync(cache)) {
    const saved = JSON.parse(readFileSync(cache, "utf8"));
    if (saved.model === modelId && saved.texts.length === texts.length && saved.texts.every((t, i) => t === texts[i])) return saved.vectors;
  }

  const { pipeline } = await import("@huggingface/transformers");
  const pipe = await pipeline("feature-extraction", modelId, { dtype: "fp32" });
  const out = await pipe(texts, { pooling: "mean", normalize: true });
  const vectors = out.tolist();

  mkdirSync(".tools/bench", { recursive: true });
  writeFileSync(cache, JSON.stringify({ model: modelId, texts, vectors }));
  return vectors;
}

const pairsOf = (n) => { const p = []; for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) p.push([a, b]); return p; };

// groups is an array of arrays of tab indexes. Anything not in one is left out.
export function score(tabs, groups) {
  const groupOf = new Map();
  groups.forEach((members, g) => members.forEach((i) => groupOf.set(i, g)));

  let truePos = 0, falsePos = 0, falseNeg = 0;
  for (const [a, b] of pairsOf(tabs.length)) {
    const shouldPair = Boolean(tabs[a].want) && tabs[a].want === tabs[b].want;
    const didPair = groupOf.has(a) && groupOf.get(a) === groupOf.get(b);
    if (shouldPair && didPair) truePos++;
    else if (didPair) falsePos++;
    else if (shouldPair) falseNeg++;
  }

  const precision = truePos / (truePos + falsePos || 1);
  const recall = truePos / (truePos + falseNeg || 1);
  const f1 = (2 * precision * recall) / (precision + recall || 1);

  const noise = tabs.map((t, i) => i).filter((i) => !tabs[i].want);
  const leftOut = noise.filter((i) => !groupOf.has(i));

  return { precision, recall, f1, noiseKept: leftOut.length, noiseTotal: noise.length, groups: groups.length };
}

export function show(label, result) {
  const pct = (n) => (n * 100).toFixed(0).padStart(3);
  console.log(`${label.padEnd(34)} F1 ${pct(result.f1)}%  (together ${pct(result.recall)}%  clean ${pct(result.precision)}%)  left out ${result.noiseKept}/${result.noiseTotal}  groups ${result.groups}`);
}
