// The small window behind the toolbar button.
import { api, getSettings, patchSettings } from "./lib/settings.js";

const $ = (id) => document.getElementById(id);
const ask = (message) => api.runtime.sendMessage(message);

const words = { available: "Ready", downloadable: "Needs a one-time download", downloading: "Downloading the model…", unavailable: "Not available in this browser" };

const show = async () => {
  const [{ result: status }, settings] = await Promise.all([ask({ type: "status" }), getSettings()]);
  $("enabled").checked = settings.enabled;
  $("state").textContent = settings.model === "builtin" ? `Built-in model: ${words[status.builtin] ?? status.builtin}` : `Model: ${status.model.label}`;
  if (!status.hasTabGroups) $("state").textContent += " — this browser has no tab groups, so tabs are lined up side by side instead.";
};

$("now").addEventListener("click", async () => {
  $("result").textContent = "Working…";
  const windowId = (await api.windows.getCurrent()).id;
  const { result, error } = await ask({ type: "group-now", windowId });
  $("result").textContent = error ?? result?.note ?? (result?.groups ? `Made ${result.groups} group(s) from ${result.tabs} tab(s).` : "Nothing to group right now.");
});

$("enabled").addEventListener("change", (e) => patchSettings({ enabled: e.target.checked }));
$("settings").addEventListener("click", (e) => { e.preventDefault(); api.runtime.openOptionsPage(); });

show();
