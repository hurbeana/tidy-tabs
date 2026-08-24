// The small window behind the toolbar button.
import { api, getSettings, patchSettings } from "./lib/settings.js";
import { MODELS } from "./lib/models.js";

const $ = (id) => document.getElementById(id);
const ask = (message) => api.runtime.sendMessage(message);

const builtinWords = { available: "ready", downloadable: "needs a one-time download", downloading: "downloading now", unavailable: "not available in this browser" };

const show = async () => {
  const [{ result: status }, settings] = await Promise.all([ask({ type: "status" }), getSettings()]);
  $("enabled").checked = settings.enabled;
  const chosen = MODELS[settings.model]?.label ?? settings.model;
  const needsSetup = settings.model === "builtin" ? status.builtin !== "available" : false;
  $("state").textContent = settings.model === "builtin" ? `Built-in model: ${builtinWords[status.builtin] ?? status.builtin}.` : `Using ${chosen}.`;
  if (needsSetup) { $("state").textContent += ` Falling back to ${MODELS[settings.fallbackModel]?.label ?? "nothing"}.`; $("setup").hidden = false; }
  if (!status.hasTabGroups) $("state").textContent += " This browser has no tab groups, so tabs are lined up side by side instead.";
};

$("now").addEventListener("click", async () => {
  $("now").setAttribute("aria-busy", "true");
  $("result").textContent = "Working…";
  const windowId = (await api.windows.getCurrent()).id;
  const { result, error } = await ask({ type: "group-now", windowId });
  $("now").removeAttribute("aria-busy");
  $("result").textContent = error ?? result?.note ?? "Nothing happened.";
  $("result").className = `result ${result?.groups ? "good" : error || result?.error ? "bad" : ""}`;
});

$("enabled").addEventListener("change", (e) => patchSettings({ enabled: e.target.checked }));
$("setup").addEventListener("click", () => api.runtime.openOptionsPage());
$("settings").addEventListener("click", (e) => { e.preventDefault(); api.runtime.openOptionsPage(); });

show();
