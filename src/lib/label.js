// Gives every tab a group name. The model does the thinking; this file only asks the questions.
import { modelSpec } from "./models.js";
import { builtinStatus, builtinGenerate } from "./builtin.js";
import { run } from "./runtime.js";
import { siteName } from "./rules.js";

export const tidyName = (name) => String(name ?? "").replace(/["'`]/g, "").replace(/[^\p{L}\p{N} &+/-]/gu, " ").trim().replace(/\s+/g, " ").split(" ").slice(0, 3).join(" ").slice(0, 24).replace(/^./, (c) => c.toUpperCase());

// What the model gets to see. The web address is always there; it is free and it helps.
// A tab with no page text keeps its title, so nothing is ever left unlabelled.
const parts = (tab, readMode) => [readMode === "content" && tab.text ? null : tab.title, tab.host, tab.text].filter(Boolean);

const describe = (tab, i, readMode) => `${i}. ${parts(tab, readMode).join(" — ")}`;

const textOf = (tab, readMode) => parts(tab, readMode).join(" ").slice(0, 500);

const promptFor = (tabs, settings, openGroups) => [
  "Put each tab in a topic group.",
  openGroups.length ? `These groups are already open: ${openGroups.join(", ")}.\nAlways prefer an open group. Put the tab in one of them whenever it belongs there, even loosely. Only use another name when no open group fits at all.` : "",
  settings.categoryMode !== "free" && settings.categories.length ? `You may also use these topics: ${settings.categories.join(", ")}.` : "",
  settings.categoryMode === "fixed" ? "Use no other names." : "If none of them fits, write your own name of one or two words.",
  'Answer with a JSON array. One item per tab, like {"i": 0, "c": "Group name"}. Write nothing else.',
  "",
  ...tabs.map((tab, i) => describe(tab, i, settings.readMode))
].filter(Boolean).join("\n");

const schemaFor = (labels) => ({ type: "array", items: { type: "object", properties: { i: { type: "integer" }, c: labels ? { type: "string", enum: labels } : { type: "string" } }, required: ["i", "c"] } });

const parse = (raw) => { try { return JSON.parse(raw); } catch { const m = String(raw).match(/\[[\s\S]*\]/); try { return m ? JSON.parse(m[0]) : []; } catch { return []; } } };

const allowed = (settings, openGroups) => (settings.categoryMode === "fixed" ? [...new Set([...openGroups, ...settings.categories])] : null);

const spread = (out, start, answers, size) => answers.forEach(({ i, c }) => { if (Number.isInteger(i) && i >= 0 && i < size && c) out[start + i] = tidyName(c); });

const byGenerate = async (tabs, settings, openGroups, useBuiltin) => {
  const out = new Array(tabs.length).fill(null);
  const spec = modelSpec(settings);
  for (let start = 0; start < tabs.length; start += settings.batchSize) {
    const slice = tabs.slice(start, start + settings.batchSize);
    const prompt = promptFor(slice, settings, openGroups);
    const raw = useBuiltin
      ? await builtinGenerate(prompt, schemaFor(allowed(settings, openGroups)))
      : await run(spec, "text-generation", [[{ role: "system", content: "You sort browser tabs. You answer only with JSON." }, { role: "user", content: prompt }]], { max_new_tokens: 20 * slice.length + 40, do_sample: false, return_full_text: false });
    spread(out, start, parse(raw), slice.length);
  }
  return out;
};

const byZeroShot = async (tabs, settings, openGroups) => {
  const labels = [...new Set([...(settings.reuseExisting ? openGroups : []), ...settings.categories])].slice(0, 40);
  if (!labels.length) return new Array(tabs.length).fill(null);
  const texts = tabs.map((t) => textOf(t, settings.readMode));
  const results = [].concat(...(await Promise.all(chunks(texts, settings.batchSize).map((c) => run(modelSpec(settings), "zero-shot-classification", [c, labels], { multi_label: false })))));
  const lean = leaning(openGroups, settings);
  return results.map((r) => { const best = r.labels.map((label, i) => ({ label, score: r.scores[i] + lean(label) })).sort((a, b) => b.score - a.score)[0]; return best.score >= settings.confidence / 100 ? tidyName(best.label) : null; });
};

const leaning = (openGroups, settings) => { const open = new Set((settings.reuseExisting ? openGroups : []).map((name) => name.toLowerCase())); return (label) => (open.has(String(label).toLowerCase()) ? settings.preferOpen / 100 : 0); };

const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

const cosine = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);

const STOP = new Set("the a an and or of for to in on at is are with your you my how what why new home page site com www online free best top guide 2024 2025 2026".split(" "));

const commonWord = (titles) => { const count = new Map(); titles.flatMap((t) => t.toLowerCase().split(/[^\p{L}\p{N}]+/u)).filter((w) => w.length > 3 && !STOP.has(w)).forEach((w) => count.set(w, (count.get(w) ?? 0) + 1)); return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; };

const byEmbedding = async (tabs, settings, openGroups) => {
  const spec = modelSpec(settings);
  const labels = [...new Set([...(settings.reuseExisting ? openGroups : []), ...(settings.categoryMode === "free" ? [] : settings.categories)])];
  const texts = tabs.map((t) => textOf(t, settings.readMode));
  const vectors = await run(spec, "feature-extraction", [[...labels, ...texts]], { pooling: "mean", normalize: true });
  const labelVectors = vectors.slice(0, labels.length);
  const tabVectors = vectors.slice(labels.length);
  const lean = leaning(openGroups, settings);
  const out = tabVectors.map((v) => { const scores = labelVectors.map((l, i) => cosine(v, l) + lean(labels[i])); const best = scores.indexOf(Math.max(...scores)); return best >= 0 && scores[best] >= settings.confidence / 100 ? tidyName(labels[best]) : null; });
  return settings.categoryMode === "fixed" ? out : cluster(out, tabVectors, tabs, settings);
};

// Groups the leftovers by how close their meaning is, then names each cluster after the word they share.
const cluster = (out, vectors, tabs, settings) => {
  const open = out.map((name, i) => (name ? null : i)).filter((i) => i !== null);
  const seen = new Set();
  for (const i of open) {
    if (seen.has(i)) continue;
    const mates = open.filter((j) => j !== i && !seen.has(j) && cosine(vectors[i], vectors[j]) >= settings.clusterThreshold / 100);
    if (mates.length + 1 < settings.minTabsPerGroup) continue;
    const members = [i, ...mates];
    const name = tidyName(commonWord(members.map((j) => tabs[j].title)) ?? siteName(tabs[i]));
    members.forEach((j) => { out[j] = name; seen.add(j); });
  }
  return out;
};

export const engineReady = async (settings) => (settings.model === "builtin" ? (await builtinStatus()) === "available" : !!modelSpec(settings).id);

// Returns one group name for each tab, or null when the tab should stay where it is.
export const labelTabs = async (tabs, settings, openGroups = []) => {
  const spec = modelSpec(settings);
  if (spec.task === "none") return tabs.map((t) => tidyName(siteName(t)));
  const builtinReady = settings.model === "builtin" && (await builtinStatus()) === "available";
  if (settings.model === "builtin" && !builtinReady && !settings.fallbackModel) return null;
  const use = settings.model === "builtin" && !builtinReady ? { ...settings, model: settings.fallbackModel } : settings;
  const task = modelSpec(use).task;
  try {
    if (builtinReady) return await byGenerate(tabs, use, openGroups, true);
    if (task === "none") return tabs.map((t) => tidyName(siteName(t)));
    if (task === "zeroshot") return await byZeroShot(tabs, use, openGroups);
    if (task === "embed") return await byEmbedding(tabs, use, openGroups);
    return await byGenerate(tabs, use, openGroups, false);
  } catch (error) {
    if (use.debug) console.warn("Tidy Tabs: the model could not answer.", error);
    return use.fallbackToSite ? tabs.map((t) => tidyName(siteName(t))) : null;
  }
};
