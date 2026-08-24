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
- **One-liners where they still read clearly.** Most helpers are a single line.
- **No hardcoded lookup tables.** Do not solve sorting with a list of domains or
  keywords. The model decides. Rules the user writes are fine, because the user
  wrote them. This was asked for in strong terms.

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
3. Put it behind a `<details>` unless most people will change it. The front page
   holds six things, and the owner has already said it was too crowded once.
4. `test/run.mjs` fails if a setting has no control, or a control has no setting.

## Adding a model

`src/lib/models.js` holds the list. A model needs a `task` of `generate`,
`zeroshot`, `embed`, or `none`. `label.js` maps the task to a strategy. Every
strategy gets the names of groups the user already has open, and must prefer
them: the generator is told to in words, the others get a score bonus.

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
