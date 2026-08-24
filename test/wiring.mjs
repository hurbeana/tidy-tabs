// A quick sanity pass over things the browser would only tell us at run time.
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
let bad = 0;
const must = (name, ok) => { console.log(`${ok ? "  ok " : "FAIL"}  ${name}`); if (!ok) bad++; };

const options = read("options.js"), offscreen = read("offscreen.js"), runtime = read("lib/runtime.js"), background = read("background.js");
must("the settings page no longer waits on the background worker for downloads", !/type: "ready"/.test(options));
must("the background answers open-runtime", /"open-runtime": openRuntime/.test(background));
must("the graphics card probe is time-boxed", /soon\(navigator\.gpu/.test(offscreen));
must("the hidden page acknowledges every message", /phase: "heard"/.test(offscreen));
must("the hidden page reports its own failures", /phase: "failed"/.test(offscreen));
must("a page without the offscreen API asks the worker", /!api\.offscreen.*open-runtime/s.test(runtime));
must("the worker stays awake while it works", /keepAwake/.test(background));
must("the settings page warns when nothing is heard", /No word from the model/.test(options));
process.exit(bad ? 1 : 0);
