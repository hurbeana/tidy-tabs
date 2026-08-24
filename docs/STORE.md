# How to publish Tidy Tabs

You need a developer account for each store. Both accounts are tied to a
person, so you have to do this part yourself. Everything you upload is already
built for you.

Run `./build.sh` first. It fetches the vendored libraries if they are missing,
then writes two files into `dist`:

- `tidy-tabs-chrome-<version>.zip` — for the Chrome Web Store and Edge Add-ons
- `tidy-tabs-firefox-<version>.zip` — for Firefox Add-ons

## Chrome Web Store

1. Pay the one-off developer fee at
   <https://chrome.google.com/webstore/devconsole>. It is 5 US dollars.
2. Choose **Add new item** and upload the Chrome zip.
3. Fill in the listing with the text further down this page.
4. Add at least one screenshot, sized 1280 by 800 or 640 by 400.
5. Under **Privacy**, tick the single purpose box and paste the justification
   text below.
6. Submit. A first review usually takes a few days.

## Edge Add-ons

1. Register at <https://partner.microsoft.com/dashboard/microsoftedge>. It is free.
2. Upload the same Chrome zip.
3. Reuse the same listing text.

## Firefox Add-ons

1. Sign in at <https://addons.mozilla.org/developers/>. It is free.
2. Choose **Submit a New Add-on** and upload the Firefox zip.
3. Mozilla reviews the source. This add-on has no build step, so tick
   **No, my add-on does not require a build step**.
4. Point out in the reviewer notes that the Firefox build contains only our own
   source, and that `src/vendor` is fetched by `vendor.sh` from npm at pinned
   versions with SHA-256 checks. That directory is left out of the Firefox
   package, because Firefox supplies its own runtime.

## Listing text you can paste in

**Name**

Tidy Tabs — AI Tab Grouper

**Short description, 132 characters or fewer**

Sorts your open tabs into named groups with a language model that runs on your own computer. Nothing is sent anywhere.

**Full description**

Too many tabs? Tidy Tabs reads their titles, works out what each one is about,
and puts related tabs into named groups.

A language model does the thinking, and it runs on your own computer. There is
no server, no account, and no key. Your tabs are never sent anywhere.

What it does:

- Groups your tabs when a page loads, on a timer, or when you press Alt+Shift+G.
- Names each group in one or two words.
- Reuses a group you already have open instead of making a near copy.
- Follows your own rules first, so you keep the last word.

You choose which model thinks about your tabs. In Chrome you can use the model
the browser already ships with, so there is nothing to download. You can also
pick a small, medium, or large model, or name your own model from Hugging Face.

You can change nearly everything: when it runs, how it names groups, which tabs
it touches, how many tabs a group needs, which colours to use, and more.

Free and open source. The code is on GitHub.

**Category**: Productivity

**Single purpose**

Tidy Tabs groups the user's open browser tabs by topic.

**Why each permission is needed**

- `tabs`: to read tab titles and addresses so the model can sort them.
- `tabGroups`: to create and name the tab groups.
- `storage`: to save the user's settings.
- `alarms`: to run the grouping on a timer the user sets.
- `scripting`: to read a short piece of page text, only if the user turns that on.
- `offscreen`: Chrome cannot run a language model in a service worker, so the
  model runs in a hidden extension page.
- Host permission for all sites: only requested at the moment the user turns on
  page reading. The add-on works without it.
- Host permission for huggingface.co: only requested when the user picks a
  model that has to be downloaded.

**Remote code**

None. Transformers.js and ONNX Runtime ship inside the package. Only model
weights are downloaded, and only when the user asks for a model.

**Data use**

Tidy Tabs collects nothing and sends nothing. See PRIVACY.md.

## Screenshots to take

1. A browser window with about a dozen tabs, before and after grouping.
2. The settings page, showing the model list.
3. The popup.
