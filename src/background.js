// Decides when to tidy your tabs and keeps the popup and settings page in the loop.
import { api, getSettings, onSettingsChanged } from "./lib/settings.js";
import { groupAll, hasTabGroups } from "./lib/group.js";
import { builtinStatus, builtinDownload } from "./lib/builtin.js";
import { kind, needsPermission, warmUp, forget } from "./lib/runtime.js";
import { modelSpec } from "./lib/models.js";

const ALARM = "tidy-tabs";
let waiting = null;
let busy = false;
let last = null;

const flash = async (text, settings) => { if (!settings.showBadge) return; await api.action.setBadgeBackgroundColor({ color: "#3a7d5d" }).catch(() => {}); await api.action.setBadgeText({ text }).catch(() => {}); setTimeout(() => api.action.setBadgeText({ text: "" }).catch(() => {}), 4000); };

const tidy = async (windowId, why) => {
  const settings = await getSettings();
  if (busy || (!settings.enabled && why !== "manual")) return null;
  busy = true;
  try {
    const result = await groupAll(settings, windowId);
    last = { at: Date.now(), why, ...result };
    if (result.groups) await flash(String(result.groups), settings);
    if (settings.debug) console.log("Tidy Tabs:", why, result);
    return result;
  } catch (error) { last = { at: Date.now(), why, error: String(error?.message ?? error) }; if (settings.debug) console.warn("Tidy Tabs failed.", error); return last; }
  finally { busy = false; }
};

const soon = async (windowId) => { const { waitSeconds } = await getSettings(); clearTimeout(waiting); waiting = setTimeout(() => tidy(windowId, "new tab"), Math.min(Math.max(waitSeconds, 1), 30) * 1000); };

const setAlarm = async () => { const s = await getSettings(); await api.alarms.clear(ALARM); if (s.enabled && s.groupOnInterval) await api.alarms.create(ALARM, { periodInMinutes: Math.max(s.intervalMinutes, 1) }); };

api.alarms.onAlarm.addListener((alarm) => alarm.name === ALARM && tidy(undefined, "timer"));

api.tabs.onUpdated.addListener(async (_id, change, tab) => { const s = await getSettings(); if (s.enabled && s.groupOnNewTab && change.status === "complete" && tab.url?.startsWith("http")) soon(tab.windowId); });

api.commands?.onCommand.addListener((name) => name === "group-now" && tidy(undefined, "manual"));

api.runtime.onInstalled.addListener(async (details) => { await setAlarm(); if (details.reason === "install") await api.runtime.openOptionsPage(); });

api.runtime.onStartup?.addListener(setAlarm);

onSettingsChanged(setAlarm);

const status = async () => { const settings = await getSettings(); return { builtin: await builtinStatus(), runtime: kind(), needsPermission: await needsPermission(), hasTabGroups: hasTabGroups(), model: modelSpec(settings), busy, last }; };

const answer = async (message) => ({
  "group-now": () => tidy(message.windowId, "manual"),
  status: status,
  download: async () => (message.model === "builtin" ? builtinDownload() : message.task === "none" ? true : warmUp(modelSpec(await getSettings(), message.model), message.task)),
  forget: forget
})[message.type]?.();

api.runtime.onMessage.addListener((message, _sender, reply) => { if (!message?.type || message.target) return false; answer(message).then((result) => reply({ ok: true, result }), (error) => reply({ ok: false, error: String(error?.message ?? error) })); return true; });

setAlarm();
