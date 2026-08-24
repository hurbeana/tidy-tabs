// Gives every tab a group name. The model does the thinking; this file only asks the questions.
import { modelSpec, MODELS } from "./models.js";
import { builtinStatus, builtinGenerate } from "./builtin.js";
import { run } from "./runtime.js";
import { siteName } from "./rules.js";
import { chunks, commonWord, cosine, textOf, tidyName } from "./text.js";
import { allowedNames, parseAnswer, promptFor, schemaFor, spread } from "./prompt.js";

const SYSTEM = "You sort browser tabs. You answer only with JSON.";
const MOST_LABELS = 40;

// How much a group you already have open is favoured over a fresh name.
function leaning(openGroups, settings) {
  const open = new Set((settings.reuseExisting ? openGroups : []).map((name) => name.toLowerCase()));
  const bonus = settings.preferOpen / 100;
  return (label) => (open.has(String(label).toLowerCase()) ? bonus : 0);
}

// The names a model is allowed to choose from: your open groups first, then your topics.
function candidates(settings, openGroups, includeCategories = true) {
  const open = settings.reuseExisting ? openGroups : [];
  const topics = includeCategories ? settings.categories : [];
  return [...new Set([...open, ...topics])];
}

// A model that writes names of its own, asked one batch of tabs at a time.
async function byGenerate(tabs, settings, openGroups, useBuiltin) {
  const names = new Array(tabs.length).fill(null);

  for (let start = 0; start < tabs.length; start += settings.batchSize) {
    const batch = tabs.slice(start, start + settings.batchSize);
    const prompt = promptFor(batch, settings, openGroups);
    const raw = useBuiltin
      ? await builtinGenerate(prompt, schemaFor(allowedNames(settings, openGroups)))
      : await generateHere(prompt, batch.length, settings);

    spread(names, start, parseAnswer(raw), batch.length);
  }

  return names;
}

function generateHere(prompt, howManyTabs, settings) {
  const messages = [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }];
  const options = { max_new_tokens: 20 * howManyTabs + 40, do_sample: false, return_full_text: false };
  return run(modelSpec(settings), "text-generation", [messages], options);
}

// A model that picks the best fit from a list of names.
async function byZeroShot(tabs, settings, openGroups) {
  const labels = candidates(settings, openGroups).slice(0, MOST_LABELS);
  if (!labels.length) return new Array(tabs.length).fill(null);

  const texts = tabs.map((tab) => textOf(tab, settings.readMode));
  const batches = chunks(texts, settings.batchSize);
  const answered = await Promise.all(
    batches.map((batch) => run(modelSpec(settings), "zero-shot-classification", [batch, labels], { multi_label: false }))
  );

  const lean = leaning(openGroups, settings);
  const needed = settings.confidence / 100;

  return answered.flat().map((answer) => {
    const scored = answer.labels.map((label, i) => ({ label, score: answer.scores[i] + lean(label) }));
    const best = scored.sort((a, b) => b.score - a.score)[0];
    return best.score >= needed ? tidyName(best.label) : null;
  });
}

// A model that compares meaning. Every name and every tab becomes a vector.
async function byEmbedding(tabs, settings, openGroups) {
  const labels = candidates(settings, openGroups, settings.categoryMode !== "free");
  const texts = tabs.map((tab) => textOf(tab, settings.readMode));

  const vectors = await run(modelSpec(settings), "feature-extraction", [[...labels, ...texts]], { pooling: "mean", normalize: true });
  const labelVectors = vectors.slice(0, labels.length);
  const tabVectors = vectors.slice(labels.length);

  const lean = leaning(openGroups, settings);
  const needed = settings.confidence / 100;

  const names = tabVectors.map((tabVector) => {
    const scores = labelVectors.map((labelVector, i) => cosine(tabVector, labelVector) + lean(labels[i]));
    const best = scores.indexOf(Math.max(...scores));
    return best >= 0 && scores[best] >= needed ? tidyName(labels[best]) : null;
  });

  if (settings.categoryMode === "fixed") return names;
  return cluster(names, tabVectors, tabs, settings);
}

// Groups the leftovers by how close their meaning is, then names each cluster
// after the word its tabs share.
function cluster(names, vectors, tabs, settings) {
  const unnamed = names.map((name, i) => (name ? null : i)).filter((i) => i !== null);
  const alike = settings.clusterThreshold / 100;
  const taken = new Set();

  for (const one of unnamed) {
    if (taken.has(one)) continue;

    const mates = unnamed.filter((other) => other !== one && !taken.has(other) && cosine(vectors[one], vectors[other]) >= alike);
    if (mates.length + 1 < settings.minTabsPerGroup) continue;

    const members = [one, ...mates];
    const shared = commonWord(members.map((i) => tabs[i].title));
    const name = tidyName(shared ?? siteName(tabs[one]));

    for (const member of members) {
      names[member] = name;
      taken.add(member);
    }
  }

  return names;
}

const bySite = (tabs) => tabs.map((tab) => tidyName(siteName(tab)));

// Which model will actually answer, given what this browser can do.
export async function chooseModel(settings) {
  if (modelSpec(settings).task === "none") return { key: settings.model, builtin: false };

  const builtinIsReady = settings.model === "builtin" && (await builtinStatus()) === "available";
  if (builtinIsReady) return { key: "builtin", builtin: true };
  if (settings.model !== "builtin") return { key: settings.model, builtin: false };

  return { key: settings.fallbackModel || null, builtin: false, steppedDown: true };
}

function describeChoice(choice) {
  if (choice.builtin) return MODELS.builtin.label;
  const label = MODELS[choice.key]?.label ?? choice.key;
  return choice.steppedDown ? `${label}, standing in for the built-in model` : label;
}

const STRATEGIES = { generate: byGenerate, zeroshot: byZeroShot, embed: byEmbedding };

// Returns a name for each tab, plus which model answered and what went wrong.
export async function labelTabs(tabs, settings, openGroups = []) {
  const choice = await chooseModel(settings);
  if (!choice.key) return { names: [], using: null, error: "This browser has no built-in model, and no stand-in is set." };

  const use = { ...settings, model: choice.key };
  const task = modelSpec(use).task;
  const using = describeChoice(choice);

  try {
    if (task === "none") return { names: bySite(tabs), using };
    if (choice.builtin) return { names: await byGenerate(tabs, use, openGroups, true), using };
    return { names: await STRATEGIES[task](tabs, use, openGroups), using };
  } catch (error) {
    if (settings.debug) console.warn("Tidy Tabs: the model could not answer.", error);
    if (settings.fallbackToSite) return { names: bySite(tabs), using: "the website name, because the model failed" };
    return { names: [], using, error: String(error?.message ?? error) };
  }
}
