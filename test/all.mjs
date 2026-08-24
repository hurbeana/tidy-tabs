// Runs every check, from the quickest to the slowest.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const parts = [
  ["The grouping logic, against a pretend browser", "run.mjs", []],
  ["The wiring a browser only shows at run time", "wiring.mjs", []],
  ["The add-on in a real browser", "browser.mjs", process.argv.slice(2)]
];

let failed = 0;
for (const [title, file, args] of parts) {
  console.log(`\n── ${title}\n`);
  if (spawnSync(process.execPath, [here + file, ...args], { stdio: "inherit" }).status) failed++;
}
console.log(failed ? `\n${failed} group(s) of checks failed.` : "\nEverything passed.");
process.exit(failed ? 1 : 0);
