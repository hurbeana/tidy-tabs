// Gives every tab a group name. The model does the thinking; this file only asks the questions.
import { modelSpec, MODELS } from "./models.js";
import { builtinStatus, builtinGenerate } from "./builtin.js";
import { run } from "./runtime.js";
import { siteName } from "./rules.js";
import { chunks, commonWord, cosine, textOf, tidyName } from "./text.js";
import { allowedNames, parseAnswer, promptFor, schemaFor, spread } from "./prompt.js";

// How much a group you already have open is favoured over a fresh name.
const leaning = (openGroups, settings) => { const open = new Set((settings.reuseExisting ? openGroups : []).map((name) => name.toLowerCase())); return (label) => (open.has(String(label).toLowerCase()) ? settings.preferOpen / 100 : 0); };

const candidates = (settings, openGroups, includeCategories = true) => [...new Set([...(settings.reuseExisting ? openGroups : []), ...(includeCategories ? settings.categories : [])])];

const byGenerate = async (tabs, settings, openGroups, useBuiltin) => {
  const out = new Array(tabs.length).fill(null);
  for (let start = 0; start < tabs.length; start += settings.batchSize) {
    const slice = tabs.slice(start, start + settings.batchSize);
    const prompt = promptFor(slice, settings, openGroups);
    const raw = useBuiltin
      ? await builtinGenerate(prompt, schemaFor(allowedNames(settings, openGroups)))
      : await run(modelSpec(settings), "text-generation", [[{ role: "system", content: "You sort browser tabs. You answer only with JSON." }, { role: "user", content: prompt }]], { max_new_tokens: 20 * slice.length + 40, do_sample: false, return_full_text: false });
    spread(out, start, parseAnswer(raw), slice.length);
  }
  return out;
};

const byZeroShot = async (tabs, settings, openGroups) => {
  const labels = candidates(settings, openGroups).slice(0, 40);
  if (!labels.length) return new Array(tabs.length).fill(null);
  const texts = tabs.map((tab) => textOf(tab, settings.readMode));
  const answers = [].concat(...(await Promise.all(chunks(texts, settings.batchSize).map((batch) => run(modelSpec(settings), "zero-shot-classification", [batch, labels], { multi_label: false })))));
  const lean = leaning(openGroups, settings);
  return answers.map((answer) => { const best = answer.labels.map((label, i) => ({ label, score: answer.scores[i] + lean(label) })).sort((a, b) => b.score - a.score)[0]; return best.score >= settings.confidence / 100 ? tidyName(best.label) : null; });
};

const byEmbedding = async (tabs, settings, openGroups) => {
  const labels = candidates(settings, openGroups, settings.categoryMode !== "free");
  const texts = tabs.map((tab) => textOf(tab, settings.readMode));
  const vectors = await run(modelSpec(settings), "feature-extraction", [[...labels, ...texts]], { pooling: "mean", normalize: true });
  const [labelVectors, tabVectors] = [vectors.slice(0, labels.length), vectors.slice(labels.length)];
  const lean = leaning(openGroups, settings);
  const out = tabVectors.map((vector) => { const scores = labelVectors.map((l, i) => cosine(vector, l) + lean(labels[i])); const best = scores.indexOf(Math.max(...scores)); return best >= 0 && scores[best] >= settings.confidence / 100 ? tidyName(labels[best]) : null; });
  return settings.categoryMode === "fixed" ? out : cluster(out, tabVectors, tabs, settings);
};

// Groups the leftovers by how close their meaning is, then names each cluster after the word they share.
const cluster = (out, vectors, tabs, settings) => {
  const loose = out.map((name, i) => (name ? null : i)).filter((i) => i !== null);
  const taken = new Set();
  for (const i of loose) {
    if (taken.has(i)) continue;
    const mates = loose.filter((j) => j !== i && !taken.has(j) && cosine(vectors[i], vectors[j]) >= settings.clusterThreshold / 100);
    if (mates.length + 1 < settings.minTabsPerGroup) continue;
    const members = [i, ...mates];
    const name = tidyName(commonWord(members.map((j) => tabs[j].title)) ?? siteName(tabs[i]));
    members.forEach((j) => { out[j] = name; taken.add(j); });
  }
  return out;
};

const bySite = (tabs) => tabs.map((tab) => tidyName(siteName(tab)));

// Which model will actually answer, given what this browser can do.
export const chooseModel = async (settings) => {
  if (modelSpec(settings).task === "none") return { key: settings.model, builtin: false };
  const ready = settings.model === "builtin" && (await builtinStatus()) === "available";
  if (ready) return { key: "builtin", builtin: true };
  if (settings.model !== "builtin") return { key: settings.model, builtin: false };
  return { key: settings.fallbackModel || null, builtin: false, steppedDown: true };
};

const strategy = { generate: byGenerate, zeroshot: byZeroShot, embed: byEmbedding };

// Returns a name for each tab, plus which model answered and what went wrong.
export const labelTabs = async (tabs, settings, openGroups = []) => {
  const choice = await chooseModel(settings);
  if (!choice.key) return { names: [], using: null, error: "This browser has no built-in model, and no stand-in is set." };
  const use = { ...settings, model: choice.key };
  const spec = modelSpec(use);
  const using = choice.builtin ? MODELS.builtin.label : `${MODELS[choice.key]?.label ?? choice.key}${choice.steppedDown ? ", standing in for the built-in model" : ""}`;
  try {
    if (spec.task === "none") return { names: bySite(tabs), using };
    if (choice.builtin) return { names: await byGenerate(tabs, use, openGroups, true), using };
    return { names: await strategy[spec.task](tabs, use, openGroups), using };
  } catch (error) {
    if (settings.debug) console.warn("Tidy Tabs: the model could not answer.", error);
    const why = String(error?.message ?? error);
    return settings.fallbackToSite ? { names: bySite(tabs), using: "the website name, because the model failed" } : { names: [], using, error: why };
  }
};
