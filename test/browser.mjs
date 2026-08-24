// Drives a real browser with the add-on loaded. This is the only check that can catch
// a broken module, a missing wasm file, or a hidden page that never wakes up.
//
// Run it with:  . ./.tools/env.sh && node test/browser.mjs
// Add --quick to skip the model download.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = fileURLToPath(new URL("..", import.meta.url));

// A headless browser shows the optional-permission bubble and then waits for a click
// that can never happen. So the copy under test asks for those hosts up front instead.
// The shipped add-on still asks only when you pick a model, which is checked below.
const HOSTS = ["https://*.huggingface.co/*", "https://*.hf.co/*"];
const testCopy = () => {
  const dir = `${root}.tools/ext`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(`${root}src`, dir, { recursive: true });
  const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8"));
  manifest.host_permissions = HOSTS;
  manifest.optional_host_permissions = manifest.optional_host_permissions.filter((h) => !HOSTS.includes(h));
  writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2));
  return dir;
};
const quick = process.argv.includes("--quick");
const browserPath = process.env.CHROME || "/usr/bin/chromium";

let failures = 0;
const must = (name, ok, detail = "") => { console.log(`${ok ? "  ok " : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${detail}`}`); if (!ok) failures++; };
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const PAGE_COUNT = 6;

// Every line the add-on prints, from every one of its pages.
const said = [];
// The last few lines always come from the browser closing, which is our doing, not a fault.
const trouble = () => said.filter((line) => /error|failed|cannot|unable|no available backend|resolve module/i.test(line) && !/browser is shutting down/i.test(line));

const listen = async (target) => {
  const label = target.url().split("/").pop() || target.type();
  const cdp = await target.createCDPSession().catch(() => null);
  if (!cdp) return;
  await cdp.send("Runtime.enable").catch(() => {});
  await cdp.send("Log.enable").catch(() => {});
  const note = (text) => said.push(`[${label}] ${text}`);
  cdp.on("Runtime.consoleAPICalled", (e) => note(e.args.map((a) => a.value ?? a.description ?? a.type).join(" ")));
  cdp.on("Runtime.exceptionThrown", (e) => note(`EXCEPTION ${e.exceptionDetails.exception?.description ?? e.exceptionDetails.text}`));
  cdp.on("Log.entryAdded", (e) => e.entry.level === "error" && note(`LOG ${e.entry.text}`));
};

// Some pages to sort. They must be real web pages, so a small server hands them out.
const PAGES = [
  ["/pull/1", "Pull request 1 · tidy/tabs"], ["/pull/2", "Pull request 2 · tidy/tabs"],
  ["/docs/array", "Array.prototype.map — reference"], ["/docs/string", "String.prototype.trim — reference"],
  ["/shop/a", "Noise cancelling headphones, best price"], ["/shop/b", "Headphone reviews for 2026"]
];

const serve = () => new Promise((done) => {
  const server = createServer((req, res) => {
    const title = PAGES.find(([path]) => path === req.url)?.[1] ?? "Nothing here";
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><meta charset="utf-8"><title>${title}</title><h1>${title}</h1><p>A page for the checks.</p>`);
  });
  server.listen(0, "127.0.0.1", () => done({ server, base: `http://127.0.0.1:${server.address().port}` }));
});

const setSettings = (page, patch) => page.evaluate(async (p) => { const store = chrome.storage.sync ?? chrome.storage.local; const now = (await store.get("settings")).settings ?? {}; await store.set({ settings: { ...now, ...p } }); }, patch);

const textOf = (page, id) => page.$eval(`#${id}`, (el) => el.textContent.trim());

const until = async (check, ms, every = 500) => { for (let waited = 0; waited < ms; waited += every) { if (await check()) return true; await wait(every); } return false; };

console.log(`Using ${browserPath}\n`);

const shipped = JSON.parse(readFileSync(`${root}src/manifest.json`, "utf8"));
must("the add-on you ship asks for no host up front", !shipped.host_permissions?.length);
must("the add-on you ship asks for the model hosts only when needed", HOSTS.every((h) => shipped.optional_host_permissions.includes(h)));

const extensionDir = testCopy();
const { server, base } = await serve();
const browser = await puppeteer.launch({
  executablePath: browserPath,
  headless: true,
  userDataDir: `${root}.tools/profile`,
  args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, "--no-sandbox", "--no-first-run"]
});

try {
  browser.on("targetcreated", listen);
  for (const target of browser.targets()) await listen(target);

  console.log("The add-on starts up");
  const workerTarget = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().includes("background.js"), { timeout: 20000 }).catch(() => null);
  must("the background worker starts", !!workerTarget);
  if (!workerTarget) throw new Error("no background worker, so nothing else can be checked");
  const id = new URL(workerTarget.url()).host;
  await listen(workerTarget);
  console.log(`  the add-on is ${id}`);

  const options = await browser.newPage();
  await options.goto(`chrome-extension://${id}/options.html`, { waitUntil: "domcontentloaded" });
  await wait(1500);
  must("the settings page opens without an error", !trouble().length, trouble().join("\n        "));
  must("the settings page knows what the browser can do", !(await textOf(options, "modelState")).startsWith("Checking"));

  console.log("\nThe settings page saves the right shapes");
  await options.evaluate(() => {
    const fill = (key, text) => { const el = document.querySelector(`[data-key="${key}"]`); el.value = text; el.dispatchEvent(new Event("change", { bubbles: true })); };
    fill("skipList", "example.com\nsecond.test");
    fill("rules", "github.com = Code");
    fill("colors", "Code = blue");
  });
  await wait(800);
  const saved = await options.evaluate(async () => ((await (chrome.storage.sync ?? chrome.storage.local).get("settings")).settings));
  must("a list of lines is saved as a list", Array.isArray(saved.skipList) && saved.skipList.length === 2, JSON.stringify(saved.skipList));
  must("your topics are saved as a list", Array.isArray(saved.categories), JSON.stringify(saved.categories)?.slice(0, 60));
  must("your rules are saved as rules", Array.isArray(saved.rules) && saved.rules[0]?.category === "Code", JSON.stringify(saved.rules));
  must("your colours are saved as pairs", saved.colors?.Code === "blue", JSON.stringify(saved.colors));

  console.log("\nThe hidden page that runs the model");
  await options.click("#checkup");
  must("the setup check answers", await until(async () => (await textOf(options, "progressLine")).includes("Runtime"), 20000), await textOf(options, "progressLine"));
  console.log(`  ${await textOf(options, "progressLine")}`);
  const offscreen = browser.targets().find((t) => t.url().endsWith("offscreen.html"));
  must("the hidden page is open", !!offscreen);
  must("nothing failed to load", !said.some((l) => /resolve module|Failed to fetch dynamically/i.test(l)), said.filter((l) => /resolve module|Failed to fetch/i.test(l)).join("\n        "));

  if (!quick) {
    console.log("\nGetting a model ready, which downloads it the first time");
    await options.select("#model", "tiny");
    await setSettings(options, { model: "tiny" });
    await options.click("#get");
    const done = await until(async () => /ready|did not work|needs permission/.test(await textOf(options, "modelState")), 600000, 2000);
    console.log(`  ${await textOf(options, "progressLine")}`);
    must("the model becomes ready", done && (await textOf(options, "modelState")).includes("ready"), await textOf(options, "modelState"));
    must("no backend was missing", !said.some((l) => /no available backend/i.test(l)), said.filter((l) => /no available backend/i.test(l)).join("\n        "));
  }

  console.log("\nSorting real tabs");
  await setSettings(options, { model: "site", minTabsPerGroup: 2, enabled: true, trigger: "manual", readMode: "title" });
  for (const [path] of PAGES) await (await browser.newPage()).goto(base + path, { waitUntil: "domcontentloaded" });
  await wait(500);

  const popup = await browser.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`, { waitUntil: "domcontentloaded" });
  await popup.click("#now");
  await until(async () => !(await textOf(popup, "result")).includes("Working"), 60000);
  const said_it = await textOf(popup, "result");
  console.log(`  the popup says: ${said_it}`);
  must("the popup explains what happened", said_it.length > 10 && !said_it.includes("Nothing happened"), said_it);

  const groups = await options.evaluate(() => chrome.tabGroups.query({}));
  console.log(`  groups now open: ${groups.map((g) => g.title).join(", ") || "none"}`);
  must("real tab groups were made", groups.length > 0, said_it);
  must("the groups have sensible names", groups.every((g) => g.title && !/^[\d\s]+$/.test(g.title)), `got: ${groups.map((g) => g.title).join(", ")}`);
  const inGroups = await options.evaluate(() => chrome.tabs.query({}).then((all) => all.filter((t) => t.groupId !== -1).length));
  must("the tabs really moved into them", inGroups >= PAGE_COUNT, `${inGroups} tabs are in a group`);
} catch (error) {
  must("the checks ran to the end", false, String(error?.message ?? error));
} finally {
  await browser.close();
  server.close();
}

if (trouble().length) { console.log("\nEverything the add-on complained about:"); trouble().forEach((line) => console.log(`  ${line}`)); }
console.log(`\n${failures ? `${failures} check(s) failed.` : "Every check passed."}`);
process.exit(failures ? 1 : 0);
