// Writes the question the model answers, and reads its answer back.
import { describe, tidyName } from "./text.js";

export const promptFor = (tabs, settings, openGroups) => [
  "Put each tab in a topic group.",
  openGroups.length ? `These groups are already open: ${openGroups.join(", ")}.\nAlways prefer an open group. Put the tab in one of them whenever it belongs there, even loosely. Only use another name when no open group fits at all.` : "",
  settings.categoryMode !== "free" && settings.categories.length ? `You may also use these topics: ${settings.categories.join(", ")}.` : "",
  settings.categoryMode === "fixed" ? "Use no other names." : "If none of them fits, write your own name of one or two words.",
  'Answer with a JSON array. One item per tab, like {"i": 0, "c": "Group name"}. Write nothing else.',
  "",
  ...tabs.map((tab, i) => describe(tab, i, settings.readMode))
].filter(Boolean).join("\n");

// Chrome's built-in model can be held to a shape, which saves a lot of bad answers.
export const schemaFor = (labels) => ({ type: "array", items: { type: "object", properties: { i: { type: "integer" }, c: labels ? { type: "string", enum: labels } : { type: "string" } }, required: ["i", "c"] } });

export const allowedNames = (settings, openGroups) => (settings.categoryMode === "fixed" ? [...new Set([...openGroups, ...settings.categories])] : null);

// Small models wrap their JSON in chatter, so pull the array out if plain parsing fails.
export const parseAnswer = (raw) => { try { return JSON.parse(raw); } catch { const found = String(raw).match(/\[[\s\S]*\]/); try { return found ? JSON.parse(found[0]) : []; } catch { return []; } } };

export const spread = (out, start, answers, size) => answers.forEach(({ i, c }) => { if (Number.isInteger(i) && i >= 0 && i < size && c) out[start + i] = tidyName(c); });
