# What Tidy Tabs does with your data

Short answer: it keeps everything on your computer.

## What it reads

- The address of your open tabs. It always needs this.
- The title of your open tabs, unless you set it to read page text only.
- A short piece of text from the page, but only if you choose one of the two
  settings that ask for it. When you install the add-on it reads titles only,
  and your browser asks your permission before it reads any page.

## Where that goes

Into a language model that runs on your own computer, and nowhere else.

Tidy Tabs has no server. It has no account. It collects no statistics and
sends no reports.

## What it stores

Your settings. They live in your browser's own storage. If you have browser
sync switched on, your browser may copy them between your own devices. Tidy
Tabs never sees them.

Downloaded models are cached by your browser so they are only fetched once.

## The one network request

If you pick a model that needs downloading, your browser fetches the model
files from Hugging Face. This happens once per model. The request contains the
model name and nothing about you or your tabs.

Pick the built-in browser model and Tidy Tabs makes no network requests at all.

You can delete downloaded models at any time from the settings page.

## Permissions and why they are needed

| Permission | Why |
| --- | --- |
| `tabs` | To read tab titles and addresses. |
| `tabGroups` | To make and name the groups. |
| `storage` | To remember your settings. |
| `alarms` | To tidy on a timer. |
| `scripting` | To read page text, only when you choose a setting that needs it. |
| `offscreen` | Chrome needs a hidden page to run a model. |
| Access to all sites | Only asked for when you choose to read page text. |
| `trialML` | Firefox needs this before it may run a local model. |

## Questions

Open an issue on the project page.
