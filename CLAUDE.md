# Tidy Tabs — notes for Claude

Tidy Tabs is a browser add-on that sorts open tabs into named groups. A language
model does the naming, and it runs on the user's own computer. Nothing about
their tabs ever leaves the machine.

Read this before changing anything. It records decisions that cost a release to
learn.

## How the owner wants this written

- **Plain English, ISO 24495.** Short sentences. Active voice. "You" for the
  reader. Common words. One idea per sentence. This applies to comments,
  settings labels, commit messages, and every line the add-on shows a person.
- **YAGNI and KISS.** Do not build for a need nobody has stated.
- **Ordinary, readable code.** An early version squeezed everything onto one line
  and the owner rightly called it out. A one-line helper is fine when it stays
  obvious at a glance. Anything with a nested ternary, a long chain, or more than
  one idea gets a named function, named intermediate values, and room to breathe.
- **No hardcoded lookup tables.** Do not solve sorting with a list of domains or
  keywords. The model decides. Rules the user writes are fine, because the user
  wrote them. This was asked for in strong terms.

## How it works, in order

A round of tidying is one pipeline, and it has no thresholds anyone has to set.

1. Read each tab: title, address, and a summary of the page itself. **Every tab, every
   round.** Reading the page is worth more than any model upgrade, by a wide margin.
2. Turn each into numbers with a small model (`Xenova/gte-small`, 35 MB).
3. Measure how alike two ordinary tabs are **right now**, from the tabs themselves.
   Everything else is judged against that. This is why swapping the model needs no
   retuning: each model scores on its own scale, and the scale is measured, not assumed.
4. Put a tab in a group it clearly belongs to, whether that group is open or remembered.
5. Cluster what is left over, by average linkage.
6. A cluster of one is not a group.
7. Name each new cluster: the browser's own model if it has one, otherwise the words
   those tabs share. **One short question per group, never a strict format per tab.**
8. Remember each group's centre, so a tab can rejoin it next week.

`src/lib/organise.js` is that list in code. `cluster.js` holds the maths, `memory.js` the
store, `naming.js` the names, `summary.js` what a tab is read as.

Measured on `test/models/realtabs.json`, which is the owner's own 54 tabs with the answers
a person would give, and the nine tabs that belong in no group at all:

| what the reader is given | F1 |
| --- | --- |
| Title only | 80% |
| Title and address | 86% |
| **Title, address and page summary** | **99%** |

It degrades gently: with only a quarter of pages readable it still scores 88%, so sleeping
tabs and PDFs cost a little, not everything.

## What runs where

| Where | What it does | Watch out for |
| --- | --- | --- |
| `background.js` | Event handlers only. Decides when to tidy. | A service worker sleeps after about 30 seconds of quiet. Never hold a long job here. |
| `offscreen.js` | Runs a downloaded model in Chrome. | A service worker cannot use WebGPU or a dynamic import, which is the only reason this page exists. |
| `options.js` | The settings page. Owns model downloads. | A page stays awake while the user is looking at it, so long jobs belong here. |
| `popup.js` | The toolbar window. | Short-lived. Ask the worker, do not compute. |
| Firefox | Uses `browser.trial.ml`, its own runtime. | No offscreen page, and the Firefox package leaves `src/vendor` out. |

## Traps that already bit us

Each of these shipped, broke, and is now covered by a check. Do not undo the
check.

1. **The wrong Transformers.js build.** `transformers.web.min.js` is for
   bundlers and leaves ONNX Runtime as a bare import, which no browser can
   resolve. Use `transformers.min.js`. `test/wiring.mjs` loads the vendored file
   in Node, where a bare import fails as `ERR_MODULE_NOT_FOUND`.
2. **Missing wasm files.** The runtime fetches them by name at run time. This
   build names `ort-wasm-simd-threaded.wasm` and the `asyncify` pair, never
   `jsep` or `jspi`. A missing one appears only as "no available backend found".
   `test/wiring.mjs` cross-references the names against what ships.
3. **A bare `data-*` attribute is `""`, which is falsy.** `el.dataset.list` on
   `<textarea data-list>` reads back as an empty string, so every list setting
   was saved as a raw string. Use `data-kind="list"` and look the kind up.
4. **Settings saved by an older version.** `repair()` in `settings.js` coerces
   every stored value to the shape the code expects. Never read a setting
   without going through `getSettings()`.
5. **Silent nothing.** Every round returns a report, and `report.js` turns it
   into a sentence that names the setting to change. Never let an action end
   with no explanation.
6. **Headless browsers never answer a permission bubble.** `permissions.request`
   hangs for ever. `test/browser.mjs` loads a copy whose manifest asks for the
   model hosts up front, and separately checks the shipped manifest does not.
7. **A browser profile keeps a stale copy of the add-on.** `test/browser.mjs` passed
   for several runs against code that no longer existed, and reported worse results
   than the real code produced. The profile is now deleted every run. Never keep it
   to save a download.
8. **The wasm runtime has no `GatherBlockQuantized`.** Every 4-bit export of a modern
   generator (Gemma 3, Qwen3) needs it, so they cannot load at all without a graphics
   card. Some repositories ship `model_int8.onnx` beside `model_quantized.onnx`, and the
   plain `int8` one usually loads where the other does not.
9. **A small model cannot fill in a strict format.** Asking a 270M model for a JSON
   array of twelve labels returned the same sentence fourteen times. Asking for two
   words works. Keep every question to one short answer.
10. **`int8` ruins a generator.** Llama-3.2-1B at `int8` named the Ubisoft group
    "Stocks in the Air: A Tale of Two Cities" and another "assistantassistantassistant".
    The same model at `q4` is fine. Quantise a reader hard; never do it to a generator.
11. **The hidden page ran on one processor thread.** Threads need the page to be
    cross-origin isolated, which the manifest now asks for with
    `cross_origin_embedder_policy` and `cross_origin_opener_policy`. Without them a
    generator looks impossibly slow and gets blamed for it.
12. **A check that asks for too little hides a fault.** `test/browser.mjs` asked for
    "two or more groups" from six tabs that make three clean pairs, so a missing group
    passed. It also granted the test server alone, while `mayReadPages()` asks for
    `<all_urls>`, so no page was ever read and the checks passed on the old behaviour.
    Both are why the round now has to say how many pages it read, and the check reads it.

## The three groups of checks

Run `npm test` for all of them. They get slower down the list.

- `test/run.mjs` — grouping decisions against a pretend browser. No downloads.
- `test/wiring.mjs` — facts a browser only shows at run time.
- `test/browser.mjs` — the add-on in a real Chromium, driven like a person. It
  reads every line the worker, the settings page, and the hidden page print, and
  fails on any of them. **This is the only group that catches a broken module, a
  missing wasm file, or a hidden page that never wakes up. Run it before
  shipping a build.**

`npx eslint .` and `npx web-ext lint --source-dir dist/firefox` both earn their
keep. Between them they have found unused arguments, an undefined variable, and
a manifest key Mozilla now requires.

## Adding a setting

1. Add it to `DEFAULTS` in `src/lib/settings.js`.
2. Add a control to `src/options.html` with `data-key="theName"`. Use
   `data-kind="list" | "map" | "rules"` for a textarea.
3. Put it behind a `<details>` unless most people will change it. The front page holds
   four things. There are no numeric settings for how alike tabs must be, and there
   must never be: those numbers are measured from the tabs. The owner has said twice
   that there were too many options.
4. `test/run.mjs` fails if a setting has no control, or a control has no setting.

## Changing a model

`src/lib/models.js` names two jobs. `READER` turns tabs into numbers and does the
actual grouping; it must run on the processor, so prefer an older int8 export over a
4-bit one. `NAMER` only ever writes two words, and is optional.

To judge a reader, do not guess. `test/models/realtabs.json` is the set that matters, and
`test/models/bench.mjs` scores a strategy against it in seconds with no browser.

What has already been measured, so nobody repeats it:

- **Reading the page beats every model upgrade.** +13 points of F1. No model swap came
  close to that.
- Readers, on title and address alone: gte-small 86%, Qwen3-Embedding-0.6B 87% (629 MB),
  bge-small 85%, all-mpnet-base 84%, embeddinggemma-300m 81%, MiniLM-L6 80%,
  multilingual-e5-small 54%. gte-small is the best value by a distance.
- **A generator must not place tabs.** With Llama-3.2-1B, which answers six sanity
  questions correctly, three separate strategies were tried against an 89% embedding
  control: plain yes/no scored 20%, calibrated yes/no 7%, and paired A-versus-B 71%.
  Every one was worse than plain distance. Models at 0.5B are worse still: Qwen2.5-0.5B
  says Paris is the capital of Japan and that a Lisbon flights tab belongs in a group
  about Noita.
- **A generator is good at naming.** Llama-3.2-1B turns "Random quest" into "Noita guides"
  and "Wischmoprollenfehler" into "Detective Conan".
- An existing group is best described by **the average of its tabs**: that rejoins loose
  tabs at 100%. Its name alone manages 47%, and adding the name to the tabs takes in more
  junk. Do not add it.
- **One model cannot do both jobs.** A generator's own insides are not usable for
  grouping: Llama-3.2-1B scored 1% of F1 that way, putting every tab in one group. A
  generator has to be rebuilt as a reader first, which is what Qwen3-Embedding-0.6B is,
  and that scored worse than gte-small at eighteen times the size.
- **Naming without a model**: counting words beats the alternatives. Naming a group after
  the tab nearest its middle gives "The Ultimate Noita" and "MIT 6.5620". Counting gives
  "Noita wiki" and "Far west". Neither is as good as a generator.
- **German and mixed languages work.** gte-small scores 100% on German tabs alone, 98% on
  English alone, and 99% on the two mixed. It ties a German page about a subject to an
  English one at 0.843, against 0.909 for two German pages, so one subject holds together
  across languages. MiniLM manages only 0.453. Untested and harder: a German subject that
  shares no name with its English counterpart. A model sold as multilingual is not the
  answer, multilingual-e5-small scored 51% overall.

## Releasing

```sh
./build.sh 1.3.0     # sets the version in both manifests, then builds
npm test             # all three groups, including the real browser
git tag v1.3.0 && git push --tags
```

The tag runs `.github/workflows/release.yml`, which builds and attaches both
packages. Store uploads stay manual: they need the owner's developer accounts.
`docs/STORE.md` has the listing copy and the steps.

## What not to do

- Do not add a bundler or a build step. `src` is the extension, as it is.
- Do not fetch code from the internet at run time. Both stores forbid it, which
  is why the runtime is vendored.
- Do not widen permissions. Everything beyond the basics is optional and asked
  for at the moment it is needed.
- Do not add a dependency to the add-on itself. Dev tools are fine.
