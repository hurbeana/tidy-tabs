// Tries the grouping logic against a pretend browser. Run it with: node test/run.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { makeBrowser, reset, state, fakeReader } from "./mock.mjs";

globalThis.browser = globalThis.chrome = makeBrowser();
const { groupWindow } = await import("../src/lib/group.js");
const { DEFAULTS } = await import("../src/lib/settings.js");
const { builtinClose } = await import("../src/lib/builtin.js");
const { readableUrl } = await import("../src/lib/summary.js");
const { firstWords, sharedWords } = await import("../src/lib/naming.js");
const { tidyName } = await import("../src/lib/text.js");
const { whatCountsAsRelated, clusterInto } = await import("../src/lib/cluster.js");
const { middleOf, remember, recall, forget } = await import("../src/lib/memory.js");

let passed = 0;
const check = (name, run) => run().then(
  () => { passed++; console.log(`  ok  ${name}`); },
  (e) => { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
);

const load = (setup) => { builtinClose(); return reset(setup); };

// The theme of a tab is written into its address, so the pretend model can find it.
// The last marker wins, because a page summary is added after the address, and reading
// the page is exactly what should change the model's mind about a tab.
const themeOf = (text) => [...String(text).matchAll(/theme(\w+)/g)].at(-1)?.[1] ?? "none";
const tab = (title, theme, extra = {}) => ({ title, url: `https://example.com/theme${theme}/${title.replace(/\W+/g, "-")}`, ...extra });

const CODE_AND_SHOPPING = [
  tab("Pull request 12", "code"),
  tab("Array prototype map", "code"),
  tab("Best headphones 2026", "shop"),
  tab("Sony WH-1000XM6 review", "shop")
];

const settings = (extra = {}) => ({ ...DEFAULTS, naming: "auto", ...extra });

// ---- Grouping ------------------------------------------------------------------------

await check("puts tabs that belong together into groups", async () => {
  load({ tabs: CODE_AND_SHOPPING, reply: fakeReader(themeOf) });
  const report = await groupWindow(1, settings());
  assert.equal(report.groups, 2, `expected 2 groups, got ${report.groups}: ${report.note}`);
  assert.equal(report.tabs, 4);
});

await check("leaves a lone tab loose rather than making a group of one", async () => {
  load({ tabs: [...CODE_AND_SHOPPING, tab("A recipe for risotto", "food")], reply: fakeReader(themeOf) });
  const report = await groupWindow(1, settings());
  assert.equal(report.groups, 2, `expected 2 groups, got ${report.groups}`);
  assert.deepEqual(report.loose, ["A recipe for risotto"]);
});

await check("a new tab joins a group that is already open", async () => {
  load({
    tabs: [tab("Pull request 12", "code", { groupId: 100 }), tab("Array prototype map", "code", { groupId: 100 }), tab("Another code page", "code")],
    groups: [{ id: 100, title: "Code", color: "blue", windowId: 1 }],
    reply: fakeReader(themeOf)
  });
  const report = await groupWindow(1, settings());
  assert.deepEqual(report.made.map((g) => g.name), ["Code"], report.note);
  assert.equal(state.tabs.filter((t) => t.groupId === 100).length, 3);
});

await check("your own rules win over the model", async () => {
  load({ tabs: CODE_AND_SHOPPING, reply: fakeReader(themeOf) });
  const report = await groupWindow(1, settings({ rules: [{ match: "example.com", category: "Mine" }] }));
  assert.deepEqual(report.made.map((g) => g.name), ["Mine"], report.note);
  assert.equal(report.tabs, 4);
});

await check("tabs on your skip list are never touched", async () => {
  load({ tabs: CODE_AND_SHOPPING, reply: fakeReader(themeOf) });
  const report = await groupWindow(1, settings({ skipList: ["example.com"] }));
  assert.equal(report.considered, 0);
  assert.match(report.note, /skip list/i);
});

await check("pinned tabs are left alone", async () => {
  const tabs = CODE_AND_SHOPPING.map((t, i) => (i === 0 ? { ...t, pinned: true } : t));
  load({ tabs, reply: fakeReader(themeOf) });
  const report = await groupWindow(1, settings());
  assert.equal(report.skipped.pinned, 1);
  assert.equal(state.tabs[0].groupId, -1);
});

await check("makes no more groups than you allow", async () => {
  const many = ["a", "b", "c", "d"].flatMap((theme) => [tab(`${theme} one`, theme), tab(`${theme} two`, theme)]);
  load({ tabs: many, reply: fakeReader(themeOf) });
  const report = await groupWindow(1, settings({ maxGroups: 2 }));
  assert.equal(report.groups, 2, `expected 2, got ${report.groups}`);
  assert.equal(report.trimmed.length, 2);
  assert.match(report.note, /dropped because you allow at most 2/);
});

// ---- Memory --------------------------------------------------------------------------

await check("a tab rejoins a group it only remembers", async () => {
  load({ tabs: CODE_AND_SHOPPING, reply: fakeReader(themeOf) });
  await groupWindow(1, settings());
  const learnt = await recall(DEFAULTS.readerModel || "Xenova/all-MiniLM-L6-v2");
  assert.equal(learnt.length, 2, `expected 2 remembered groups, got ${learnt.length}`);

  // The same two shopping tabs come back in a window with nothing else in it.
  const groups = state.groups.map((g) => g.title);
  load({ tabs: [tab("Best headphones 2026", "shop"), tab("Sony WH-1000XM6 review", "shop")], reply: fakeReader(themeOf) });
  const again = await groupWindow(1, settings());
  assert.ok(groups.includes(again.made[0].name), `expected one of ${groups}, got ${again.made[0]?.name}`);
});

await check("forgetting really forgets", async () => {
  load({ tabs: CODE_AND_SHOPPING, reply: fakeReader(themeOf) });
  await groupWindow(1, settings());
  await forget();
  assert.deepEqual(await recall("Xenova/all-MiniLM-L6-v2"), []);
});

await check("a memory written by one model is not read by another", async () => {
  load({});
  await remember("model-one", [{ name: "Code", centre: middleOf([[1, 0, 0]]), tabs: 2 }], 1);
  assert.equal((await recall("model-one")).length, 1);
  assert.deepEqual(await recall("model-two"), []);
});

await check("memory keeps only the most recent groups", async () => {
  load({});
  const lots = Array.from({ length: 60 }, (_, i) => ({ name: `Group ${i}`, centre: middleOf([[1, 0, 0]]), tabs: 2 }));
  const kept = await remember("model-one", lots, 1);
  assert.equal(kept, 40, `expected 40 kept, got ${kept}`);
});

// ---- Reading pages --------------------------------------------------------------------

await check("pages are read only when titles were not enough", async () => {
  load({ tabs: CODE_AND_SHOPPING, reply: fakeReader(themeOf), allowPageReading: true, pageText: "" });
  const report = await groupWindow(1, settings({ readPages: true }));
  assert.equal(report.read, 0, "nothing was loose, so no page should have been read");
});

await check("a page summary can rescue tabs the titles could not place", async () => {
  const loose = [tab("Untitled", "x"), tab("Untitled 2", "y")];
  load({ tabs: [...CODE_AND_SHOPPING, ...loose], reply: fakeReader(themeOf), allowPageReading: true, pageText: "a page about themerescued things" });
  const report = await groupWindow(1, settings({ readPages: true }));
  assert.equal(report.read, 2, `expected 2 pages read, got ${report.read}`);
  assert.equal(report.groups, 3, `expected 3 groups, got ${report.groups}: ${report.note}`);
});

// ---- Saying what happened --------------------------------------------------------------

await check("says plainly when there was nothing to sort", async () => {
  load({ tabs: [], reply: fakeReader(themeOf) });
  const report = await groupWindow(1, settings());
  assert.match(report.note, /no tabs in this window/i);
});

await check("says plainly when nothing belonged together", async () => {
  load({ tabs: [tab("One", "a"), tab("Two", "b"), tab("Three", "c")], reply: fakeReader(themeOf) });
  const report = await groupWindow(1, settings({ readPages: false }));
  assert.equal(report.groups, 0);
  assert.match(report.note, /nothing that belongs together/i);
  assert.match(report.note, /Read a little of a page/);
});

await check("a round that breaks says why", async () => {
  load({ tabs: CODE_AND_SHOPPING, reply: () => { throw new Error("the model fell over"); } });
  const report = await groupWindow(1, settings());
  assert.match(report.note, /could not finish.*fell over/i);
});

// ---- The parts on their own -------------------------------------------------------------

await check("an address is turned into words worth reading", async () => {
  assert.equal(readableUrl("https://docs.docker.com/reference/compose-file/"), "docs.docker.com reference compose file");
  assert.equal(readableUrl("https://www.amazon.de/s?k=noise+cancelling"), "amazon.de s noise cancelling");
  assert.equal(readableUrl("https://youtube.com/watch?v=dQw4w9WgXcQ"), "youtube.com watch");
  assert.equal(readableUrl("not a url"), "");
});

await check("a name is pulled out of whatever a model says", async () => {
  assert.equal(firstWords("Here is the name: Travel Planning"), "Travel Planning");
  assert.equal(firstWords("**Web Development**"), "Web Development");
  assert.equal(firstWords(""), "");
});

await check("a name is never cut in the middle of a word", async () => {
  assert.equal(tidyName("Preisvergleich QuietComfort"), "Preisvergleich");
});

await check("the words a group shares become its name", async () => {
  const all = ["Lisbon flights", "Lisbon hotels", "Lisbon walks", "Docker compose", "Docker volumes"];
  assert.equal(sharedWords(all.slice(0, 3), all), "Lisbon");
});

await check("a two word name reads the way a person wrote it", async () => {
  const titles = ["Pull request 1 tidy tabs", "Pull request 2 tidy tabs"];
  assert.equal(sharedWords(titles, titles), "Pull request");
});

await check("how alike counts as related is worked out from the tabs", async () => {
  const apart = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]];
  const scale = whatCountsAsRelated(apart);
  assert.ok(scale.related > scale.ordinary, "related must be above ordinary");
  assert.ok(scale.clearly >= scale.related, "clearly must be at least related");
});

await check("clustering keeps things that differ apart", async () => {
  const vectors = [[1, 0], [1, 0], [0, 1], [0, 1]];
  const groups = clusterInto(vectors, 0.5).map((g) => g.sort()).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(groups, [[0, 1], [2, 3]]);
});

// ---- The settings page -------------------------------------------------------------------

await check("every setting has a control, and every control a setting", async () => {
  const html = readFileSync(new URL("../src/options.html", import.meta.url), "utf8");
  const onThePage = new Set([...html.matchAll(/data-key="(\w+)"/g)].map((m) => m[1]));
  const inTheCode = new Set(Object.keys(DEFAULTS));

  const missing = [...inTheCode].filter((key) => !onThePage.has(key));
  const extra = [...onThePage].filter((key) => !inTheCode.has(key));
  assert.deepEqual(missing, [], `settings with no control: ${missing}`);
  assert.deepEqual(extra, [], `controls with no setting: ${extra}`);
});

await check("settings from an older version are repaired, not obeyed", async () => {
  const { repair } = await import("../src/lib/settings.js");
  const old = { confidence: 45, categories: "Work\nCode", skipList: "a.com\nb.com", enabled: 1 };
  const fixed = repair(old);
  assert.ok(!("confidence" in fixed), "a setting that no longer exists must be dropped");
  assert.deepEqual(fixed.skipList, ["a.com", "b.com"]);
  assert.strictEqual(fixed.enabled, true);
});

console.log(`\n${passed} checks passed.`);
