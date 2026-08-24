// The small window behind the toolbar button.
import { api, getSettings, patchSettings } from "./lib/settings.js";
import { MODELS } from "./lib/models.js";

const $ = (id) => document.getElementById(id);
const ask = (message) => api.runtime.sendMessage(message);

const BUILTIN_WORDS = {
  available: "ready",
  downloadable: "needs a one-time download",
  downloading: "downloading now",
  unavailable: "not available in this browser"
};

function describeModel(settings, status) {
  if (settings.model !== "builtin") {
    return { line: `Using ${MODELS[settings.model]?.label ?? settings.model}.`, needsSetup: false };
  }

  const state = BUILTIN_WORDS[status.builtin] ?? status.builtin;
  if (status.builtin === "available") return { line: `Built-in model: ${state}.`, needsSetup: false };

  const standIn = MODELS[settings.fallbackModel]?.label ?? "nothing";
  return { line: `Built-in model: ${state}. Falling back to ${standIn}.`, needsSetup: true };
}

async function show() {
  const [{ result: status }, settings] = await Promise.all([ask({ type: "status" }), getSettings()]);
  const { line, needsSetup } = describeModel(settings, status);

  $("enabled").checked = settings.enabled;
  $("setup").hidden = !needsSetup;
  $("state").textContent = status.hasTabGroups
    ? line
    : `${line} This browser has no tab groups, so tabs are lined up side by side instead.`;
}

async function groupNow() {
  $("now").setAttribute("aria-busy", "true");
  $("result").textContent = "Working…";

  const { id } = await api.windows.getCurrent();
  const { result, error } = await ask({ type: "group-now", windowId: id });

  $("now").removeAttribute("aria-busy");
  $("result").textContent = error ?? result?.note ?? "Nothing happened.";
  $("result").className = `result ${result?.groups ? "good" : error || result?.error ? "bad" : ""}`;
}

$("now").addEventListener("click", groupNow);
$("enabled").addEventListener("change", (event) => patchSettings({ enabled: event.target.checked }));
$("setup").addEventListener("click", () => api.runtime.openOptionsPage());
$("settings").addEventListener("click", (event) => {
  event.preventDefault();
  api.runtime.openOptionsPage();
});

show();
