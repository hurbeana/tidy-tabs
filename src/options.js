// The settings page. Every control carries the name of the setting it changes.
import { api, DEFAULTS, getSettings, saveSettings } from "./lib/settings.js";
import { MODELS, modelSpec } from "./lib/models.js";
import { builtinDownload } from "./lib/builtin.js";
import { warmUp } from "./lib/runtime.js";

const PIPELINE = { generate: "text-generation", zeroshot: "zero-shot-classification", embed: "feature-extraction" };
const MODEL_HOSTS = ["https://*.huggingface.co/*", "https://*.hf.co/*"];
const SILENCE_LIMIT = 30000;

const $ = (id) => document.getElementById(id);
const fields = () => [...document.querySelectorAll("[data-key]")];
const ask = (message) => api.runtime.sendMessage(message);

function say(id, text, tone = "") {
  $(id).textContent = text;
  $(id).className = tone;
}

// ---- Reading and writing the form -------------------------------------------------

const lines = (text) => text.split("\n").map((line) => line.trim()).filter(Boolean);

const pairs = (text) => lines(text)
  .map((line) => line.split("="))
  .filter((bits) => bits.length > 1)
  .map(([left, ...right]) => [left.trim(), right.join("=").trim()]);

const asText = {
  list: (value) => (Array.isArray(value) ? value : typeof value === "string" ? [value] : []).join("\n"),
  map: (value) => Object.entries(value ?? {}).map(([key, colour]) => `${key} = ${colour}`).join("\n"),
  rules: (value) => (Array.isArray(value) ? value : []).map((rule) => `${rule.match} = ${rule.category}`).join("\n")
};

const asValue = {
  list: (text) => lines(text),
  map: (text) => Object.fromEntries(pairs(text)),
  rules: (text) => pairs(text).map(([match, category]) => ({ match, category }))
};

function toText(el, value) {
  const kind = asText[el.dataset.kind];
  return kind ? kind(value) : value ?? "";
}

function fromText(el) {
  const kind = asValue[el.dataset.kind];
  if (kind) return kind(el.value);
  return el.type === "number" ? Number(el.value) : el.value;
}

function put(settings) {
  for (const el of fields()) {
    if (el.type === "checkbox") el.checked = Boolean(settings[el.dataset.key]);
    else el.value = toText(el, settings[el.dataset.key]);
  }
}

function collect() {
  const entries = fields().map((el) => [el.dataset.key, el.type === "checkbox" ? el.checked : fromText(el)]);
  return Object.fromEntries(entries);
}

async function save() {
  const now = await getSettings();
  await saveSettings({ ...now, ...collect() });

  say("save", "Saved.");
  setTimeout(() => say("save", "Changes save as you make them."), 1500);
}

// ---- What the page shows -----------------------------------------------------------

function fillModels() {
  for (const select of [$("model"), $("fallbackModel")]) {
    for (const [key, model] of Object.entries(MODELS)) {
      const label = model.mb ? `${model.label} — about ${model.mb} MB to download` : model.label;
      select.append(Object.assign(document.createElement("option"), { value: key, textContent: label }));
    }
  }
}

// Only show the field the chosen trigger actually uses.
function showRelevant() {
  $("waitRow").hidden = $("trigger").value !== "load";
  $("everyRow").hidden = $("trigger").value !== "timer";
  $("blurb").textContent = MODELS[$("model").value]?.blurb ?? "";
}

const BUILTIN_WORDS = {
  available: "The built-in model is ready to use.",
  downloadable: "The built-in model needs a one-time download. Press the button below.",
  downloading: "The built-in model is downloading now.",
  unavailable: "This browser has no built-in model, so pick another one above."
};

const RUNTIME_WORDS = {
  firefox: " Firefox runs downloaded models through its own local AI runtime.",
  chrome: "",
  none: " This browser cannot run a downloaded model at all."
};

async function describeState() {
  const { result: status } = await ask({ type: "status" });

  const parts = [BUILTIN_WORDS[status.builtin], RUNTIME_WORDS[status.runtime] ?? ""];
  if (status.needsPermission) parts.push(" Firefox needs your permission before it may run a model. Press the button below.");
  if (!status.hasTabGroups) parts.push(" This browser cannot make tab groups, so matching tabs are parked side by side instead.");

  say("modelState", parts.join(""), status.builtin === "available" ? "good" : "");

  const mayRead = await api.permissions.contains({ origins: ["<all_urls>"] }).catch(() => false);
  say("permState", mayRead ? "You have given permission to read pages." : "You have not given permission to read pages yet.");
}

const size = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);

// ---- Getting a model ready ---------------------------------------------------------

async function grant(model) {
  if (model === "builtin" || MODELS[model]?.task === "none") return true;

  const mayFetch = await api.permissions.request({ origins: MODEL_HOSTS }).catch(() => false);
  if (!mayFetch) {
    say("modelState", "Tidy Tabs needs permission to fetch the model files.", "bad");
    return false;
  }

  if (api.trial?.ml) {
    const mayRun = await api.permissions.request({ permissions: ["trialML"] }).catch(() => false);
    if (!mayRun) {
      say("modelState", "Firefox needs the trialML permission before it may run a model.", "bad");
      return false;
    }
  }

  return true;
}

let stall = null;

// If nothing is heard for a while, say so rather than looking frozen.
function heard() {
  clearTimeout(stall);
  stall = setTimeout(() => {
    say("progressLine", "No word from the model for half a minute. Press “Check my setup”, or try “Where the model runs: Processor” under Advanced.", "bad");
  }, SILENCE_LIMIT);
}

const quiet = () => clearTimeout(stall);

async function getReady(key, settings) {
  if (key === "builtin") {
    const state = await builtinDownload((percent) => say("progressLine", `Downloading the built-in model — ${percent}%`));
    return state === "available" ? "ready" : `Your browser says the built-in model is ${state}.`;
  }

  const spec = modelSpec(settings, key);
  if (spec.task === "none") return "This choice uses no model, so there is nothing to fetch.";
  if (!spec.id) return "That model has no name. Fill one in under Advanced.";

  await warmUp({ ...spec, dtype: settings.dtype || undefined, device: settings.device || undefined }, PIPELINE[spec.task]);
  return "ready";
}

// This page does the work itself. The background worker falls asleep during a long
// download, which used to leave this page waiting for ever.
async function onGetReady() {
  const model = $("model").value;
  if (!(await grant(model))) return;

  $("get").setAttribute("aria-busy", "true");
  say("modelState", "Getting the model ready. The first time can take a while.");
  say("progressLine", "Waking the hidden page…");
  heard();

  try {
    const result = await getReady(model, await getSettings());
    say("modelState", result === "ready" ? "The model is ready." : result, "good");
    say("progressLine", "");
  } catch (error) {
    say("modelState", `That did not work: ${error?.message ?? error}`, "bad");
  } finally {
    quiet();
    $("get").removeAttribute("aria-busy");
    $("bar").hidden = true;
    describeState();
  }
}

const RUNTIME_NAMES = { chrome: "a hidden page", firefox: "the Firefox AI runtime", none: "none" };

async function onCheckup() {
  const [{ result: status }, { result: machine }] = await Promise.all([ask({ type: "status" }), ask({ type: "probe" })]);
  const mayFetch = await api.permissions.contains({ origins: [MODEL_HOSTS[0]] }).catch(() => false);

  const findings = [
    `Runtime for downloaded models: ${RUNTIME_NAMES[status.runtime]}.`,
    `Built-in model: ${status.builtin}.`,
    machine?.gpu === undefined ? "" : `Graphics card: ${machine.gpu ? machine.adapter || "found" : "not usable, so the processor will do the work"}.`,
    `Tab groups: ${status.hasTabGroups ? "supported" : "not supported"}.`,
    `Permission to fetch models: ${mayFetch ? "given" : "not given yet"}.`,
    machine?.loaded?.length ? `Loaded now: ${machine.loaded.join(", ")}.` : "No model is loaded at the moment."
  ];

  say("progressLine", findings.filter(Boolean).join(" "));
}

// ---- The live word from a download --------------------------------------------------

function onProgress(message) {
  if (message?.target !== "tidy-progress") return;
  heard();

  const bar = $("bar");
  const { phase, file, percent, loaded, total } = message;

  if (phase === "heard") return say("progressLine", "The hidden page is awake. Choosing where to run…");
  if (phase === "picking") return say("progressLine", "Looking for a graphics card…");
  if (phase === "failed") {
    quiet();
    return say("progressLine", message.note, "bad");
  }
  if (phase === "starting") {
    const where = message.device === "webgpu" ? "graphics card" : "processor";
    return say("progressLine", `Loading the model on the ${where}, using ${message.dtype} weights.`);
  }
  if (phase === "progress") {
    bar.hidden = false;
    bar.max = 100;
    bar.value = percent;
    const howMuch = total ? ` (${size(loaded)} of ${size(total)})` : "";
    return say("progressLine", `Downloading ${file} — ${percent}%${howMuch}`);
  }
  if (phase === "initiate" || phase === "download") {
    bar.hidden = false;
    bar.removeAttribute("value");
    return say("progressLine", `Fetching ${file}…`);
  }
  if (phase === "done") return say("progressLine", `Finished ${file}.`);
}

// ---- Wiring --------------------------------------------------------------------------

$("get").addEventListener("click", onGetReady);
$("checkup").addEventListener("click", onCheckup);

$("drop").addEventListener("click", async () => {
  await ask({ type: "forget" });
  say("progressLine", "Downloaded models are gone. They will be fetched again when you need them.");
});

$("allow").addEventListener("click", async () => {
  await api.permissions.request({ origins: ["<all_urls>"] }).catch(() => false);
  describeState();
});

$("export").addEventListener("click", async () => {
  $("json").value = JSON.stringify(await getSettings(), null, 2);
});

$("import").addEventListener("click", async () => {
  try {
    const settings = { ...DEFAULTS, ...JSON.parse($("json").value) };
    await saveSettings(settings);
    put(settings);
    showRelevant();
    say("save", "Settings loaded.");
  } catch {
    say("save", "That text is not valid settings.", "bad");
  }
});

$("reset").addEventListener("click", async () => {
  await saveSettings(DEFAULTS);
  put(DEFAULTS);
  showRelevant();
  say("save", "Back to the starting settings.");
});

document.addEventListener("change", (event) => {
  if (!event.target.dataset?.key) return;
  save();
  showRelevant();
});

document.addEventListener("input", (event) => {
  if (event.target.dataset?.key && event.target.tagName === "TEXTAREA") save();
});

api.runtime.onMessage.addListener(onProgress);

fillModels();
getSettings().then((settings) => {
  put(settings);
  showRelevant();
  describeState();
});
