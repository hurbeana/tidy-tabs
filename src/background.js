// Decides when to tidy your tabs, and answers the popup and the settings page.
import { api, getSettings, onSettingsChanged } from "./lib/settings.js";
import { groupAll, hasTabGroups } from "./lib/group.js";
import { builtinStatus } from "./lib/builtin.js";
import { kind, needsPermission, forget, probe, openRuntime } from "./lib/runtime.js";
import { forget as forgetMemory } from "./lib/memory.js";
import { readerSpec, whatIsNeeded } from "./lib/models.js";
import { shortly } from "./lib/report.js";

const ALARM = "tidy-tabs";
const BADGE_SECONDS = 4;
const HEARTBEAT_SECONDS = 20;
const LONGEST_WAIT = 30;

let waiting = null;
let busy = false;
let last = null;

async function flash(text, settings) {
  if (!settings.showBadge) return;

  await api.action.setBadgeBackgroundColor({ color: "#2f6f52" }).catch(() => {});
  await api.action.setBadgeText({ text }).catch(() => {});

  setTimeout(() => {
    try {
      api.action.setBadgeText({ text: "" }).catch(() => {});
    } catch { /* the browser is closing */ }
  }, BADGE_SECONDS * 1000);
}

// A worker that falls asleep mid-round would leave the popup waiting for ever.
function keepAwake() {
  const beat = setInterval(() => {
    try {
      api.runtime.getPlatformInfo().catch(() => {});
    } catch { /* the browser is closing */ }
  }, HEARTBEAT_SECONDS * 1000);

  return () => clearInterval(beat);
}

async function tidy(windowId, why) {
  const settings = await getSettings();
  if (busy) return null;
  if (!settings.enabled && why !== "manual") return null;

  busy = true;
  const rest = keepAwake();

  try {
    last = { at: Date.now(), why, ...(await groupAll(settings, windowId)) };
    if (last.groups) await flash(String(last.groups), settings);
    if (settings.debug) console.log(`Tidy Tabs (${why}): ${shortly(last)} — ${last.note}`);
    return last;
  } catch (error) {
    const trouble = String(error?.message ?? error);
    last = { at: Date.now(), why, groups: 0, tabs: 0, error: trouble, note: `Something went wrong: ${trouble}` };
    if (settings.debug) console.warn("Tidy Tabs failed.", error);
    return last;
  } finally {
    busy = false;
    rest();
  }
}

// Pages arrive in bursts, so hold off until they stop for a moment.
async function soon(windowId) {
  const { waitSeconds } = await getSettings();
  const seconds = Math.min(Math.max(waitSeconds, 1), LONGEST_WAIT);

  clearTimeout(waiting);
  waiting = setTimeout(() => tidy(windowId, "a page loaded"), seconds * 1000);
}

async function setAlarm() {
  const settings = await getSettings();
  await api.alarms.clear(ALARM);
  if (settings.enabled && settings.trigger === "interval") {
    await api.alarms.create(ALARM, { periodInMinutes: Math.max(settings.intervalMinutes, 1) });
  }
}

api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) tidy(undefined, "the timer");
});

api.tabs.onUpdated.addListener(async (_tabId, change, tab) => {
  const settings = await getSettings();
  const worthTidying = settings.enabled && settings.trigger === "load" && change.status === "complete";
  if (worthTidying && tab.url?.startsWith("http")) soon(tab.windowId);
});

api.commands?.onCommand.addListener((name) => {
  if (name === "group-now") tidy(undefined, "manual");
});

api.runtime.onInstalled.addListener(async (details) => {
  await setAlarm();
  if (details.reason === "install") await api.runtime.openOptionsPage();
});

api.runtime.onStartup?.addListener(setAlarm);

onSettingsChanged(setAlarm);

async function status() {
  const settings = await getSettings();
  return {
    builtin: await builtinStatus(),
    runtime: kind(),
    needsPermission: await needsPermission(),
    hasTabGroups: hasTabGroups(),
    reader: readerSpec(settings),
    needs: whatIsNeeded(settings),
    naming: settings.naming,
    busy,
    last
  };
}

const ANSWERS = {
  status,
  probe,
  forget,
  "open-runtime": openRuntime,
  "forget-memory": forgetMemory,
  "group-now": (message) => tidy(message.windowId, "manual")
};

api.runtime.onMessage.addListener((message, _sender, reply) => {
  // Messages with a target belong to the hidden page, not here.
  if (!message?.type || message.target) return false;

  const answer = ANSWERS[message.type];
  if (!answer) return false;

  Promise.resolve(answer(message)).then(
    (result) => reply({ ok: true, result }),
    (error) => reply({ ok: false, error: String(error?.message ?? error) })
  );

  return true;
});

setAlarm();
