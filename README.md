# Tidy Tabs — an AI tab grouper that stays on your computer

Tidy Tabs sorts your open tabs into named groups. It works out what each tab is
about and puts the related ones together.

You choose what it reads: just the title, just the text on the page, or both.
Titles alone are fast and usually enough. Adding the page text gives better
groups and takes a little longer.

A language model does the thinking. That model runs on your own computer. Your
tabs are never sent anywhere.

![The Tidy Tabs icon](src/icons/icon-128.png)

## What it does

- It groups your tabs when a new page loads, on a timer, or when you press a key.
- It names each group in one or two words.
- It reuses a group you already have open instead of making a near copy.
- It follows your own rules first, so you always keep the last word.
- It works in Chrome, Edge, Brave, and Firefox.

## How to install it

### From the stores

The store links go here once the add-on is published.

### From this repository

**Chrome, Edge, or Brave**

1. Download or clone this repository.
2. Run `./vendor.sh`. It fetches the two libraries that run downloaded models.
   Skip this if you only ever want Chrome's built-in model.
3. Open `chrome://extensions`.
4. Turn on **Developer mode**.
5. Choose **Load unpacked** and pick the `src` folder.

**Firefox**

1. Run `./build.sh`. It writes a Firefox package into `dist`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on** and pick the built zip file.

## How to use it

Click the toolbar icon and press **Group my tabs now**. That is the whole thing.

If nothing moves, read the sentence in the popup. It tells you why, and which
setting to change.

Press **Alt+Shift+G** to do the same without opening the popup.

Open the settings page to change how it behaves.

## Which model does the thinking

You choose. Every option runs on your machine and needs no account and no key.

| Choice | What it does | Download |
| --- | --- | --- |
| Built-in browser model | Uses the model your browser already has. In Chrome this is Gemini Nano. | None in Chrome |
| Tiny | Compares the meaning of your tabs and puts close ones together. | About 25 MB |
| Small | Picks the best name from your topic list. | About 70 MB |
| Medium | Writes its own group names. | About 200 MB |
| Large | Writes the best group names, and takes the longest. | About 600 MB |
| Your own model | Any model from Hugging Face that Transformers.js can run. | Varies |
| No model | Groups tabs by website. No AI at all. | None |

Chrome runs downloaded models in a hidden page, because a background worker
cannot use a graphics card. Firefox runs them through its own local AI runtime,
so Firefox asks you for the `trialML` permission the first time.

Only the two big generators use a graphics card. The small models are quick on
the processor, and running them there avoids a whole class of driver trouble.
You can force either under **Advanced**.

If your browser has no built-in model, Tidy Tabs falls back to the choice you
set under **If the built-in model is missing**.

## What you can change

The settings page holds every option. The main ones are:

- **When it runs.** After a page loads, on a timer, or only when you ask.
- **How it names groups.** Only your topics, your topics plus new ones, or
  whatever the model thinks of.
- **How much it leans on groups you already have.** The model is told which
  groups are open and is asked to prefer them. The smaller models get the same
  push as a score bonus, which you can turn up or down.
- **Which tabs it touches.** One window or all of them, pinned tabs or not,
  and a list of tabs to leave alone.
- **How groups look.** Smallest group size, most groups at once, folded or
  open, sorted or not, and your own colours.
- **Your own rules.** Write `github.com = Code` and every GitHub tab lands in
  **Code**. Wrap a rule in slashes, like `/invoice|receipt/ = Money`, to match
  a pattern.
- **What it reads.** The title and web address, the page text and web address,
  or all three. Titles only is the starting choice, because it is fastest and
  needs no extra permission. The other two ask your permission to look at
  pages. A page that cannot be read keeps its title, so no tab is left out.
- **Fewest tabs a group may have.** Set this to 1 if Tidy Tabs keeps telling
  you every topic was too small.

You can copy your settings out as text and paste them back in later.

## What it sends to other people

Nothing. There is no server, no account, and no tracking.

Tidy Tabs makes one kind of network request: if you pick a model that needs a
download, it fetches that model from Hugging Face once and keeps it on your
computer. Pick the built-in model in Chrome and it makes no requests at all.

See [PRIVACY.md](PRIVACY.md) for the full statement.

## For developers

```sh
./vendor.sh          # fetches the libraries into src/vendor
./build.sh           # builds dist/tidy-tabs-chrome-*.zip and dist/tidy-tabs-firefox-*.zip
./build.sh 1.3.0     # sets the version in both manifests, then builds
node test/run.mjs    # checks the grouping against a pretend browser
node test/wiring.mjs # checks the wiring a real browser would only show at run time
```

The code has no build step and no package manager. `src` is the extension.

Three libraries are not kept in this repository, because they are large and are
not our code. `vendor.sh` fetches Transformers.js, ONNX Runtime, and Pico.css,
each pinned to an exact version and checked against a SHA-256 sum. `build.sh`
runs it for you.

Take the `transformers.min.js` build, not `transformers.web.min.js`. The `.web.`
builds are made for bundlers and leave ONNX Runtime as a bare import, which no
browser can resolve. `test/wiring.mjs` checks this, and `build.sh` refuses to
build if it fails.

The settings page shows six things and hides the rest behind expanders. When
Tidy Tabs does nothing, it says why: which tabs it skipped, which topics were
too small, or what the model complained about. `src/lib/report.js` writes those
sentences.

| File | What it does |
| --- | --- |
| `src/background.js` | Decides when to tidy, and answers the two pages. |
| `src/lib/group.js` | Runs one round: collect, name, build, report. |
| `src/lib/tabs.js` | Picks the tabs worth sorting, and counts the rest. |
| `src/lib/label.js` | Gets a name for each tab out of the model. |
| `src/lib/prompt.js` | Writes the question, and reads the answer back. |
| `src/lib/apply.js` | Turns names and tabs into real tab groups. |
| `src/lib/report.js` | Says in plain words what a round did. |
| `src/lib/text.js` | Small shared helpers for text and names. |
| `src/lib/models.js` | The list of models you can pick. |
| `src/lib/runtime.js` | Runs a model in Chrome or in Firefox. |
| `src/lib/builtin.js` | Talks to the model your browser ships with. |
| `src/lib/rules.js` | Your own rules and your skip list. |
| `src/lib/settings.js` | Reads and writes your settings. |
| `src/offscreen.js` | The hidden page where Chrome runs a model. |
| `src/vendor/` | Transformers.js, ONNX Runtime, and Pico.css, fetched by `vendor.sh`. |

The store rules say an add-on may not fetch code from the internet, so the
runtime ships inside the package. That is why the Chrome build is about 6 MB.
The Firefox build leaves it out, because Firefox supplies its own runtime.

## Licence

MIT. See [LICENSE](LICENSE).
