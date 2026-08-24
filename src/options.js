// The settings page. Every control carries the name of the setting it changes.
import { api, DEFAULTS, getSettings, saveSettings } from "./lib/settings.js";
import { MODELS } from "./lib/models.js";

const $ = (id) => document.getElementById(id);
const fields = () => [...document.querySelectorAll("[data-key]")];
const ask = (message) => api.runtime.sendMessage(message);

const toText = (el, value) => (el.dataset.list ? (value ?? []).join("\n") : el.dataset.map ? Object.entries(value ?? {}).map(([k, v]) => `${k} = ${v}`).join("\n") : el.dataset.rules ? (value ?? []).map((r) => `${r.match} = ${r.category}`).join("\n") : value ?? "");

const lines = (text) => text.split("\n").map((l) => l.trim()).filter(Boolean);
const pairs = (text) => lines(text).map((l) => l.split("=")).filter((p) => p.length > 1).map(([a, ...b]) => [a.trim(), b.join("=").trim()]);

const fromText = (el) => (el.dataset.list ? lines(el.value) : el.dataset.map ? Object.fromEntries(pairs(el.value)) : el.dataset.rules ? pairs(el.value).map(([match, category]) => ({ match, category })) : el.type === "number" ? Number(el.value) : el.value);

const put = (settings) => fields().forEach((el) => (el.type === "checkbox" ? (el.checked = !!settings[el.dataset.key]) : (el.value = toText(el, settings[el.dataset.key]))));

const collect = () => Object.fromEntries(fields().map((el) => [el.dataset.key, el.type === "checkbox" ? el.checked : fromText(el)]));

const fillModels = () => [$("model"), $("fallbackModel")].forEach((select) => Object.entries(MODELS).forEach(([key, m]) => select.append(Object.assign(document.createElement("option"), { value: key, textContent: m.mb ? `${m.label} (${m.mb} MB download)` : m.label }))));

const describeModel = () => { const m = MODELS[$("model").value]; $("blurb").textContent = m?.blurb ?? ""; };

const refreshState = async () => {
  const { result: status } = await ask({ type: "status" });
  const builtin = { available: "The built-in model is ready.", downloadable: "The built-in model needs a one-time download. Press the button below.", downloading: "The built-in model is downloading.", unavailable: "This browser has no built-in model. Pick another one above." }[status.builtin];
  const groups = status.hasTabGroups ? "" : " This browser cannot make tab groups, so Tidy Tabs lines matching tabs up side by side instead.";
  const runtime = status.runtime === "firefox" ? " Firefox runs the model through its own local AI runtime." : status.runtime === "none" ? " This browser cannot run a downloaded model." : "";
  const trial = status.needsPermission ? " Firefox needs your permission before it may run a model. Press the button below." : "";
  $("modelState").textContent = `${builtin}${runtime}${trial}${groups}`;
  $("permState").textContent = (await api.permissions.contains({ origins: ["<all_urls>"] }).catch(() => false)) ? "You have already given permission to read pages." : "You have not given permission to read pages yet.";
};

const save = async () => { await saveSettings({ ...(await getSettings()), ...collect() }); $("save").textContent = "Saved."; setTimeout(() => ($("save").textContent = "Your changes save as you make them."), 1500); };

document.addEventListener("change", (e) => { if (e.target.dataset?.key) { save(); describeModel(); } });
document.addEventListener("input", (e) => e.target.dataset?.key && e.target.tagName === "TEXTAREA" && save());

$("get").addEventListener("click", async () => {
  const model = $("model").value;
  if (model === "site") return ($("modelState").textContent = "This choice uses no model, so there is nothing to get ready.");
  if (model !== "builtin" && !(await api.permissions.request({ origins: ["https://*.huggingface.co/*", "https://*.hf.co/*"] }).catch(() => false))) return ($("modelState").textContent = "Tidy Tabs needs permission to fetch the model files.");
  if (api.trial?.ml && !(await api.permissions.request({ permissions: ["trialML"] }).catch(() => false))) return ($("modelState").textContent = "Firefox needs the trialML permission before it may run a model.");
  $("bar").hidden = false; $("modelState").textContent = "Getting the model ready. The first time can take a while.";
  const { error } = await ask({ type: "download", model, task: { generate: "text-generation", zeroshot: "zero-shot-classification", embed: "feature-extraction", none: "none" }[MODELS[model]?.task] });
  $("bar").hidden = true;
  $("modelState").textContent = error ? `That did not work: ${error}` : "The model is ready.";
  refreshState();
});

$("drop").addEventListener("click", async () => { await ask({ type: "forget" }); $("modelState").textContent = "Downloaded models are gone. Tidy Tabs will fetch them again when you need them."; });

$("allow").addEventListener("click", async () => { await api.permissions.request({ origins: ["<all_urls>"] }).catch(() => false); refreshState(); });

$("export").addEventListener("click", async () => ($("json").value = JSON.stringify(await getSettings(), null, 2)));
$("import").addEventListener("click", async () => { try { const settings = { ...DEFAULTS, ...JSON.parse($("json").value) }; await saveSettings(settings); put(settings); $("save").textContent = "Settings loaded."; } catch { $("save").textContent = "That text is not valid settings."; } });
$("reset").addEventListener("click", async () => { await saveSettings(DEFAULTS); put(DEFAULTS); describeModel(); $("save").textContent = "Back to the starting settings."; });

api.runtime.onMessage.addListener((message) => { if (message?.target === "tidy-progress" && message.percent !== undefined) { $("bar").hidden = false; $("bar").value = message.percent; } });

fillModels();
getSettings().then((settings) => { put(settings); describeModel(); refreshState(); });
