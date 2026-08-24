// The settings page. Every control carries the name of the setting it changes.
import { api, DEFAULTS, getSettings, saveSettings } from "./lib/settings.js";
import { MODELS, modelSpec } from "./lib/models.js";
import { builtinDownload } from "./lib/builtin.js";
import { warmUp } from "./lib/runtime.js";

const PIPELINE = { generate: "text-generation", zeroshot: "zero-shot-classification", embed: "feature-extraction" };

const $ = (id) => document.getElementById(id);
const fields = () => [...document.querySelectorAll("[data-key]")];
const ask = (message) => api.runtime.sendMessage(message);
const say = (id, text, tone = "") => Object.assign($(id), { textContent: text, className: tone });

const lines = (text) => text.split("\n").map((line) => line.trim()).filter(Boolean);
const pairs = (text) => lines(text).map((line) => line.split("=")).filter((p) => p.length > 1).map(([a, ...b]) => [a.trim(), b.join("=").trim()]);

const toText = (el, value) => (el.dataset.list ? (value ?? []).join("\n") : el.dataset.map ? Object.entries(value ?? {}).map(([k, v]) => `${k} = ${v}`).join("\n") : el.dataset.rules ? (value ?? []).map((r) => `${r.match} = ${r.category}`).join("\n") : value ?? "");
const fromText = (el) => (el.dataset.list ? lines(el.value) : el.dataset.map ? Object.fromEntries(pairs(el.value)) : el.dataset.rules ? pairs(el.value).map(([match, category]) => ({ match, category })) : el.type === "number" ? Number(el.value) : el.value);

const put = (settings) => fields().forEach((el) => (el.type === "checkbox" ? (el.checked = !!settings[el.dataset.key]) : (el.value = toText(el, settings[el.dataset.key]))));
const collect = () => Object.fromEntries(fields().map((el) => [el.dataset.key, el.type === "checkbox" ? el.checked : fromText(el)]));

const fillModels = () => [$("model"), $("fallbackModel")].forEach((select) => Object.entries(MODELS).forEach(([key, m]) => select.append(Object.assign(document.createElement("option"), { value: key, textContent: m.mb ? `${m.label} — about ${m.mb} MB to download` : m.label }))));

// Only show the field the chosen trigger actually uses.
const showRelevant = () => { $("waitRow").hidden = $("trigger").value !== "load"; $("everyRow").hidden = $("trigger").value !== "timer"; $("blurb").textContent = MODELS[$("model").value]?.blurb ?? ""; };

const save = async () => { await saveSettings({ ...(await getSettings()), ...collect() }); say("save", "Saved."); setTimeout(() => say("save", "Changes save as you make them."), 1500); };

const describeState = async () => {
  const { result: status } = await ask({ type: "status" });
  const builtin = { available: "The built-in model is ready to use.", downloadable: "The built-in model needs a one-time download. Press the button below.", downloading: "The built-in model is downloading now.", unavailable: "This browser has no built-in model, so pick another one above." }[status.builtin];
  const runtime = status.runtime === "firefox" ? " Firefox runs downloaded models through its own local AI runtime." : status.runtime === "none" ? " This browser cannot run a downloaded model at all." : "";
  const trial = status.needsPermission ? " Firefox needs your permission before it may run a model. Press the button below." : "";
  const groups = status.hasTabGroups ? "" : " This browser cannot make tab groups, so matching tabs are parked side by side instead.";
  say("modelState", `${builtin}${runtime}${trial}${groups}`, status.builtin === "available" ? "good" : "");
  say("permState", (await api.permissions.contains({ origins: ["<all_urls>"] }).catch(() => false)) ? "You have given permission to read pages." : "You have not given permission to read pages yet.");
};

const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

const grant = async (model) => {
  if (model === "builtin" || MODELS[model]?.task === "none") return true;
  if (!(await api.permissions.request({ origins: ["https://*.huggingface.co/*", "https://*.hf.co/*"] }).catch(() => false))) return say("modelState", "Tidy Tabs needs permission to fetch the model files.", "bad") ?? false;
  if (api.trial?.ml && !(await api.permissions.request({ permissions: ["trialML"] }).catch(() => false))) return say("modelState", "Firefox needs the trialML permission before it may run a model.", "bad") ?? false;
  return true;
};

// The settings page does this work itself. The background worker falls asleep
// during a long download, which used to leave this page waiting for ever.
let stall = null;
const heard = () => { clearTimeout(stall); stall = setTimeout(() => say("progressLine", "No word from the model for half a minute. Press “Check my setup”, or try “Where the model runs: Processor” under Advanced.", "bad"), 30000); };
const quiet = () => clearTimeout(stall);

const getReady = async (key, settings) => {
  if (key === "builtin") { const state = await builtinDownload((percent) => say("progressLine", `Downloading the built-in model — ${percent}%`)); return state === "available" ? "ready" : `Your browser says the built-in model is ${state}.`; }
  const spec = modelSpec(settings, key);
  if (spec.task === "none") return "This choice uses no model, so there is nothing to fetch.";
  if (!spec.id) return "That model has no name. Fill one in under Advanced.";
  await warmUp({ ...spec, dtype: settings.dtype || undefined, device: settings.device || undefined }, PIPELINE[spec.task]);
  return "ready";
};

$("get").addEventListener("click", async () => {
  const model = $("model").value;
  if (!(await grant(model))) return;
  $("get").setAttribute("aria-busy", "true");
  say("modelState", "Getting the model ready. The first time can take a while.");
  say("progressLine", "Waking the hidden page…");
  heard();
  try {
    const result = await getReady(model, await getSettings());
    say("modelState", typeof result === "string" && result !== "ready" ? result : "The model is ready.", "good");
    say("progressLine", "");
  } catch (error) {
    say("modelState", `That did not work: ${error?.message ?? error}`, "bad");
  } finally {
    quiet();
    $("get").removeAttribute("aria-busy");
    $("bar").hidden = true;
    describeState();
  }
});

$("checkup").addEventListener("click", async () => {
  const [{ result: status }, { result: gpu }] = await Promise.all([ask({ type: "status" }), ask({ type: "probe" })]);
  const hf = await api.permissions.contains({ origins: ["https://*.huggingface.co/*"] }).catch(() => false);
  say("progressLine", [
    `Runtime for downloaded models: ${{ chrome: "a hidden page", firefox: "the Firefox AI runtime", none: "none" }[status.runtime]}.`,
    `Built-in model: ${status.builtin}.`,
    gpu?.gpu === undefined ? "" : `Graphics card: ${gpu.gpu ? gpu.adapter || "found" : "not usable, so the processor will do the work"}.`,
    `Tab groups: ${status.hasTabGroups ? "supported" : "not supported"}.`,
    `Permission to fetch models: ${hf ? "given" : "not given yet"}.`,
    gpu?.loaded?.length ? `Loaded now: ${gpu.loaded.join(", ")}.` : "No model is loaded at the moment."
  ].filter(Boolean).join(" "));
});

$("drop").addEventListener("click", async () => { await ask({ type: "forget" }); say("progressLine", "Downloaded models are gone. They will be fetched again when you need them."); });

$("allow").addEventListener("click", async () => { await api.permissions.request({ origins: ["<all_urls>"] }).catch(() => false); describeState(); });

$("export").addEventListener("click", async () => ($("json").value = JSON.stringify(await getSettings(), null, 2)));
$("import").addEventListener("click", async () => { try { const settings = { ...DEFAULTS, ...JSON.parse($("json").value) }; await saveSettings(settings); put(settings); showRelevant(); say("save", "Settings loaded."); } catch { say("save", "That text is not valid settings.", "bad"); } });
$("reset").addEventListener("click", async () => { await saveSettings(DEFAULTS); put(DEFAULTS); showRelevant(); say("save", "Back to the starting settings."); });

document.addEventListener("change", (e) => { if (e.target.dataset?.key) { save(); showRelevant(); } });
document.addEventListener("input", (e) => e.target.dataset?.key && e.target.tagName === "TEXTAREA" && save());

// Live word from the model download.
api.runtime.onMessage.addListener((m) => {
  if (m?.target !== "tidy-progress") return;
  heard();
  const bar = $("bar");
  if (m.phase === "heard") return say("progressLine", "The hidden page is awake. Choosing where to run…");
  if (m.phase === "picking") return say("progressLine", "Looking for a graphics card…");
  if (m.phase === "failed") { quiet(); return say("progressLine", m.note, "bad"); }
  if (m.phase === "progress") { bar.hidden = false; bar.value = m.percent; bar.max = 100; say("progressLine", `Downloading ${m.file} — ${m.percent}%${m.total ? ` (${size(m.loaded)} of ${size(m.total)})` : ""}`); }
  else if (m.phase === "initiate" || m.phase === "download") { bar.hidden = false; bar.removeAttribute("value"); say("progressLine", `Fetching ${m.file}…`); }
  else if (m.phase === "starting") say("progressLine", `Loading the model on the ${m.device === "webgpu" ? "graphics card" : "processor"}, using ${m.dtype} weights.`);
  else if (m.phase === "done") say("progressLine", `Finished ${m.file}.`);
  else if (m.phase === "retrying") say("progressLine", m.note, "bad");
});

fillModels();
getSettings().then((settings) => { put(settings); showRelevant(); describeState(); });
