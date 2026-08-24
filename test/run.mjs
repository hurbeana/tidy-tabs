// Tries the grouping logic against a pretend browser. Run it with: node test/run.mjs
import assert from "node:assert";
import { makeBrowser, reset, state, fakeLanguageModel } from "./mock.mjs";

globalThis.browser = globalThis.chrome = makeBrowser();
const { groupWindow } = await import("../src/lib/group.js");
const { DEFAULTS } = await import("../src/lib/settings.js");
const { builtinClose } = await import("../src/lib/builtin.js");

let passed = 0;
const check = (name, run) => run().then(() => { passed++; console.log(`  ok  ${name}`); }, (e) => { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; });

const load = (setup) => { builtinClose(); return reset(setup); };

const TABS = [
  { title: "Pull request #12 · tidy/tabs", url: "https://github.com/tidy/tabs/pull/12" },
  { title: "Array.prototype.map - JavaScript | MDN", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript" },
  { title: "Best noise cancelling headphones 2026", url: "https://www.example-shop.com/headphones" },
  { title: "Sony WH-1000XM6 review", url: "https://www.example-shop.com/sony-review" }
];

const answerWith = (map) => (prompt) => JSON.stringify(prompt.split("\n").filter((l) => /^\d+\. /.test(l)).map((l) => ({ i: Number(l.split(".")[0]), c: map[Number(l.split(".")[0])] ?? "Other" })));

await check("groups tabs by what the model says", async () => {
  load({ tabs: TABS });
  globalThis.LanguageModel = fakeLanguageModel(answerWith({ 0: "Code", 1: "Code", 2: "Shopping", 3: "Shopping" }));
  const result = await groupWindow(1, { ...DEFAULTS, model: "builtin" });
  assert.equal(result.groups, 2, `expected 2 groups, got ${result.groups}`);
  assert.deepEqual(state.groups.map((g) => g.title).sort(), ["Code", "Shopping"]);
});

await check("reuses a group that is already open", async () => {
  load({ tabs: TABS, groups: [{ id: 7, title: "Code", color: "blue", windowId: 1 }] });
  globalThis.LanguageModel = fakeLanguageModel(answerWith({ 0: "Code", 1: "Code", 2: "Shopping", 3: "Shopping" }));
  await groupWindow(1, { ...DEFAULTS, model: "builtin" });
  assert.equal(state.groups.filter((g) => g.title === "Code").length, 1, "the open Code group should be reused");
  assert.equal(state.tabs.filter((t) => t.groupId === 7).length, 2);
});

await check("tells the model which groups are already open", async () => {
  let seen = "";
  load({ tabs: TABS, groups: [{ id: 7, title: "Reading", color: "blue", windowId: 1 }] });
  globalThis.LanguageModel = fakeLanguageModel((prompt) => { seen = prompt; return answerWith({})(prompt); });
  await groupWindow(1, { ...DEFAULTS, model: "builtin" });
  assert.match(seen, /already open: Reading/);
});

await check("your own rule beats the model", async () => {
  load({ tabs: TABS });
  globalThis.LanguageModel = fakeLanguageModel(answerWith({ 0: "Wrong", 1: "Wrong", 2: "Wrong", 3: "Wrong" }));
  await groupWindow(1, { ...DEFAULTS, model: "builtin", minTabsPerGroup: 1, rules: [{ match: "github.com", category: "Mine" }] });
  assert.ok(state.groups.some((g) => g.title === "Mine"), "the rule should win");
});

await check("keeps small groups out of the way", async () => {
  load({ tabs: TABS });
  globalThis.LanguageModel = fakeLanguageModel(answerWith({ 0: "A", 1: "B", 2: "C", 3: "D" }));
  const result = await groupWindow(1, { ...DEFAULTS, model: "builtin", minTabsPerGroup: 2 });
  assert.equal(result.groups, 0);
});

await check("leaves skipped tabs alone", async () => {
  load({ tabs: TABS });
  globalThis.LanguageModel = fakeLanguageModel(answerWith({ 0: "Code", 1: "Code" }));
  await groupWindow(1, { ...DEFAULTS, model: "builtin", skipList: ["example-shop.com"] });
  assert.equal(state.tabs.filter((t) => t.groupId !== -1).length, 2);
});

await check("falls back to the website name when no model works", async () => {
  load({ tabs: TABS });
  delete globalThis.LanguageModel;
  await groupWindow(1, { ...DEFAULTS, model: "site", minTabsPerGroup: 2 });
  assert.ok(state.groups.some((g) => g.title === "Example-shop"), `got ${state.groups.map((g) => g.title)}`);
});


// The settings page and the settings file must agree with each other.
await check("every control on the settings page changes a real setting", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../src/options.html", import.meta.url), "utf8");
  const keys = [...html.matchAll(/data-key="([^"]+)"/g)].map((m) => m[1]);
  const missing = keys.filter((k) => !(k in DEFAULTS));
  assert.deepEqual(missing, [], `the page names settings that do not exist: ${missing}`);
  const unreachable = Object.keys(DEFAULTS).filter((k) => !keys.includes(k));
  assert.deepEqual(unreachable, [], `these settings have no control: ${unreachable}`);
});


await check("one new tab may still join a group that is already open", async () => {
  load({ tabs: TABS, groups: [{ id: 7, title: "Docs", color: "blue", windowId: 1 }] });
  globalThis.LanguageModel = fakeLanguageModel(answerWith({ 0: "Alone", 1: "Docs", 2: "Shopping", 3: "Shopping" }));
  await groupWindow(1, { ...DEFAULTS, model: "builtin", minTabsPerGroup: 2 });
  assert.equal(state.tabs.filter((t) => t.groupId === 7).length, 1, "the MDN tab should join the open Docs group");
  assert.ok(!state.groups.some((g) => g.title === "Alone"), "a lone tab should not get its own group");
});

await check("leaves groups you made yourself alone", async () => {
  load({ tabs: TABS, groups: [{ id: 9, title: "Mine", color: "red", windowId: 1 }] });
  state.tabs[0].groupId = 9;
  globalThis.LanguageModel = fakeLanguageModel(answerWith({ 1: "Shopping", 2: "Shopping", 3: "Shopping" }));
  await groupWindow(1, { ...DEFAULTS, model: "builtin", ungroupSingles: true, minTabsPerGroup: 2 });
  assert.equal(state.tabs[0].groupId, 9, "your own one-tab group must survive");
});



const promptSeen = async (settings, setup) => {
  let seen = "";
  load(setup);
  globalThis.LanguageModel = fakeLanguageModel((prompt) => { seen = prompt; return answerWith({})(prompt); });
  await groupWindow(1, { ...DEFAULTS, model: "builtin", ...settings });
  return seen;
};

await check("reading titles only leaves the page alone", async () => {
  const prompt = await promptSeen({ readMode: "title" }, { tabs: TABS, pageText: "a long article about headphones", allowPageReading: true });
  assert.match(prompt, /Sony WH-1000XM6 review/);
  assert.doesNotMatch(prompt, /long article/);
});

await check("reading the page only leaves the title out", async () => {
  const prompt = await promptSeen({ readMode: "content" }, { tabs: TABS, pageText: "a long article about headphones", allowPageReading: true });
  assert.match(prompt, /long article/);
  assert.doesNotMatch(prompt, /Sony WH-1000XM6 review/);
});

await check("reading both sends the title and the page", async () => {
  const prompt = await promptSeen({ readMode: "both" }, { tabs: TABS, pageText: "a long article about headphones", allowPageReading: true });
  assert.match(prompt, /Sony WH-1000XM6 review/);
  assert.match(prompt, /long article/);
});

await check("a page it cannot read keeps its title", async () => {
  const prompt = await promptSeen({ readMode: "content" }, { tabs: TABS, pageText: "", allowPageReading: true });
  assert.match(prompt, /Sony WH-1000XM6 review/, "with no page text the title must come back");
});

await check("without permission it never asks a page for text", async () => {
  const prompt = await promptSeen({ readMode: "both" }, { tabs: TABS, pageText: "secret page text", allowPageReading: false });
  assert.doesNotMatch(prompt, /secret page text/);
  assert.match(prompt, /Sony WH-1000XM6 review/);
});


await check("says so when no model is available at all", async () => {
  load({ tabs: TABS });
  delete globalThis.LanguageModel;
  const result = await groupWindow(1, { ...DEFAULTS, model: "builtin", fallbackModel: "", fallbackToSite: false });
  assert.equal(result.groups, 0);
  assert.match(result.note ?? "", /no stand-in is set/);
});

await check("names the groups it made", async () => {
  load({ tabs: TABS });
  globalThis.LanguageModel = fakeLanguageModel(answerWith({ 0: "Code", 1: "Code", 2: "Shopping", 3: "Shopping" }));
  const result = await groupWindow(1, { ...DEFAULTS, model: "builtin" });
  assert.match(result.note, /Made 2 groups from 4 tabs/);
  assert.match(result.note, /Code \(2\)/);
});

await check("explains that every topic was too small", async () => {
  load({ tabs: TABS });
  globalThis.LanguageModel = fakeLanguageModel(answerWith({ 0: "One", 1: "Two", 2: "Three", 3: "Four" }));
  const result = await groupWindow(1, { ...DEFAULTS, model: "builtin", minTabsPerGroup: 2 });
  assert.equal(result.groups, 0);
  assert.match(result.note, /Every topic was too small/);
  assert.match(result.note, /Fewest tabs a group may have/);
  assert.match(result.note, /One \(1\)/);
});

await check("explains that every tab was already in a group", async () => {
  load({ tabs: TABS, groups: [{ id: 9, title: "Mine", color: "red", windowId: 1 }] });
  state.tabs.forEach((t) => (t.groupId = 9));
  const result = await groupWindow(1, { ...DEFAULTS, model: "builtin" });
  assert.match(result.note, /already sit in a group/);
  assert.match(result.note, /Also move tabs that are already in a group/);
});

await check("explains that pinned tabs were left alone", async () => {
  load({ tabs: TABS });
  state.tabs.forEach((t) => (t.pinned = true));
  const result = await groupWindow(1, { ...DEFAULTS, model: "builtin" });
  assert.match(result.note, /are pinned/);
});


// The smallest model compares meaning, so it is checked with made-up vectors.
const unit = ([x, y]) => { const n = Math.hypot(x, y); return [x / n, y / n]; };
const VECTORS = { Reading: unit([1, 0]), News: unit([0.9, 0.44]), tab: unit([0.95, 0.31]) };
const embedReply = (message) => message.args[0].map((text) => VECTORS[text] ?? VECTORS.tab);

const nearestGroup = async (preferOpen) => {
  load({ tabs: TABS, groups: [{ id: 7, title: "Reading", color: "blue", windowId: 1 }], reply: embedReply });
  await groupWindow(1, { ...DEFAULTS, model: "tiny", categories: ["News"], preferOpen });
  return state.groups.find((g) => state.tabs.some((t) => t.groupId === g.id))?.title;
};

await check("leans towards a group that is already open", async () => {
  assert.equal(await nearestGroup(15), "Reading", "the open group should win a close call");
});

await check("the lean can be turned off", async () => {
  assert.equal(await nearestGroup(0), "News", "with no lean the closest name wins on its own");
});

await check("tells the model to prefer an open group", async () => {
  const prompt = await promptSeen({}, { tabs: TABS, groups: [{ id: 7, title: "Reading", color: "blue", windowId: 1 }] });
  assert.match(prompt, /Always prefer an open group/);
});

console.log(`\n${passed} check(s) passed.`);
