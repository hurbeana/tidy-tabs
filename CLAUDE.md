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

1. Read each tab: title, address, and a page summary if one was fetched.
2. Turn each into numbers with a small model (`Xenova/all-MiniLM-L6-v2`, 25 MB).
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
   card. This is why there is no downloaded generator in the default path.
9. **A small model cannot fill in a strict format.** Asking a 270M model for a JSON
   array of twelve labels returned the same sentence fourteen times. Asking for two
   words works. Keep every question to one short answer.

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

To judge a reader, do not guess. `test/models/tabset.json` holds 24 tabs in two languages
with the answers a person would give; `test/models/dump-vectors.mjs` saves what a model makes
of them and `test/models/score.mjs` grades it in a second, with no browser. MiniLM-L6 scores
0.94 precision on that set. Including the address is worth about 0.15 of F1 over the
title alone, and a same-site bonus was measured and made things worse.

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
