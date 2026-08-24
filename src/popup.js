// The small window behind the toolbar button.
import { api, getSettings, patchSettings } from "./lib/settings.js";

const $ = (id) => document.getElementById(id);
const ask = (message) => api.runtime.sendMessage(message);

// The popup says only what you would want to know at a glance: whether it is ready,
// and where the names will come from.
function describeModel(settings, status) {
  if (settings.naming === "download") return { line: "Names are written by a downloaded model.", needsSetup: false };
  if (status.builtin === "available") return { line: "Names are written by your browser's own model.", needsSetup: false };

  return { line: "Names come from the words your tabs share.", needsSetup: false };
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
