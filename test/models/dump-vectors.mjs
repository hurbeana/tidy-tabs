// Saves what a model makes of a set of tabs, so the grouping maths can be judged in
// plain Node without launching a browser every time.
//
//   node test/models/dump-vectors.mjs "Xenova/all-MiniLM-L6-v2||text"
//   node test/models/score.mjs
//
// Each argument is  id|prefix|field. The prefix is for models that were trained with
// one, such as E5, which scores far worse without its "query: ".
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dir = `${root}.tools/model-ext`;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
cpSync(`${root}src`, dir, { recursive: true });
const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8"));
manifest.host_permissions = ["https://*.huggingface.co/*", "https://*.hf.co/*"];
writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/bin/chromium",
  headless: true, protocolTimeout: 1800000,
  userDataDir: `${root}.tools/model-profile`,
  args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`, "--no-sandbox", "--no-first-run"]
});
const target = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().includes("background.js"), { timeout: 20000 });
const page = await browser.newPage();
await page.goto(`chrome-extension://${new URL(target.url()).host}/options.html`, { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 1500));

const SET = JSON.parse(readFileSync(fileURLToPath(new URL("./tabset.json", import.meta.url)), "utf8"));
// Each argument is  id|prefix|field  so a model can be tried the way it was trained.
const models = process.argv.slice(2);

const out = {};
for (const spec of models) {
  const [id, prefix = "", field = "text"] = spec.split("|");
  const texts = SET.tabs.map((t) => prefix + (field === "title" ? t.text.split(" — ")[0] : t.text));
  const result = await page.evaluate(async (id, texts) => {
    const { run } = await import("./lib/runtime.js");
    try {
      return { vectors: await run({ id, dtype: "q8", device: "wasm" }, "feature-extraction", [texts], { pooling: "mean", normalize: true }) };
    } catch (error) {
      return { error: String(error?.message ?? error) };
    }
  }, id, texts);
  out[spec] = result;
  console.log(spec, result.error ? `ERROR ${result.error}` : `ok, ${result.vectors.length} vectors of ${result.vectors[0].length}`);
}
writeFileSync(fileURLToPath(new URL("./vectors.json", import.meta.url)), JSON.stringify({ tabs: SET.tabs, models: out }));
console.log("saved test/models/vectors.json");
await browser.close();
