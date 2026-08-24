// Decides when to tidy your tabs, and answers the popup and the settings page.
import { api, getSettings, onSettingsChanged } from "./lib/settings.js";
import { groupAll, hasTabGroups } from "./lib/group.js";
import { builtinStatus, builtinDownload } from "./lib/builtin.js";
import { kind, needsPermission, warmUp, forget, probe } from "./lib/runtime.js";
import { modelSpec } from "./lib/models.js";
import { shortly } from "./lib/report.js";

const ALARM = "tidy-tabs";
const PIPELINE = { generate: "text-generation", zeroshot: "zero-shot-classification", embed: "feature-extraction" };

let waiting = null;
let busy = false;
let last = null;

const flash = async (text, settings) => { if (!settings.showBadge) return; await api.action.setBadgeBackgroundColor({ color: "#2f6f52" }).catch(() => {}); await api.action.setBadgeText({ text }).catch(() => {}); setTimeout(() => api.action.setBadgeText({ text: "" }).catch(() => {}), 4000); };

const tidy = async (windowId, why) => {
  const settings = await getSettings();
  if (busy || (!settings.enabled && why !== "manual")) return null;
  busy = true;
  try {
    last = { at: Date.now(), why, ...(await groupAll(settings, windowId)) };
    if (last.groups) await flash(String(last.groups), settings);
    if (settings.debug) console.log(`Tidy Tabs (${why}): ${shortly(last)} — ${last.note}`);
    return last;
  } catch (error) {
    last = { at: Date.now(), why, groups: 0, tabs: 0, error: String(error?.message ?? error), note: `Something went wrong: ${error?.message ?? error}` };
    if (settings.debug) console.warn("Tidy Tabs failed.", error);
    return last;
  } finally { busy = false; }
};

const soon = async (windowId) => { const { waitSeconds } = await getSettings(); clearTimeout(waiting); waiting = setTimeout(() => tidy(windowId, "a page loaded"), Math.min(Math.max(waitSeconds, 1), 30) * 1000); };

const setAlarm = async () => { const s = await getSettings(); await api.alarms.clear(ALARM); if (s.enabled && s.trigger === "timer") await api.alarms.create(ALARM, { periodInMinutes: Math.max(s.intervalMinutes, 1) }); };

api.alarms.onAlarm.addListener((alarm) => alarm.name === ALARM && tidy(undefined, "the timer"));

api.tabs.onUpdated.addListener(async (_id, change, tab) => { const s = await getSettings(); if (s.enabled && s.trigger === "load" && change.status === "complete" && tab.url?.startsWith("http")) soon(tab.windowId); });

api.commands?.onCommand.addListener((name) => name === "group-now" && tidy(undefined, "manual"));

api.runtime.onInstalled.addListener(async (details) => { await setAlarm(); if (details.reason === "install") await api.runtime.openOptionsPage(); });

api.runtime.onStartup?.addListener(setAlarm);

onSettingsChanged(setAlarm);

const status = async () => { const settings = await getSettings(); return { builtin: await builtinStatus(), runtime: kind(), needsPermission: await needsPermission(), hasTabGroups: hasTabGroups(), model: modelSpec(settings), busy, last }; };

const getReady = async (key) => {
  if (key === "builtin") return builtinDownload();
  const settings = await getSettings();
  const spec = modelSpec(settings, key);
  if (spec.task === "none") return "This choice uses no model, so there is nothing to fetch.";
  if (!spec.id) return "That model has no name. Fill one in under Advanced.";
  await warmUp(spec, PIPELINE[spec.task]);
  return "ready";
};

const answer = async (message) => ({ "group-now": () => tidy(message.windowId, "manual"), status, probe, forget, ready: () => getReady(message.model) })[message.type]?.();

api.runtime.onMessage.addListener((message, _sender, reply) => { if (!message?.type || message.target) return false; answer(message).then((result) => reply({ ok: true, result }), (error) => reply({ ok: false, error: String(error?.message ?? error) })); return true; });

setAlarm();
