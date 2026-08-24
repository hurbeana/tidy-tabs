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


console.log(`\n${passed} check(s) passed.`);
