// Writes the question the model answers, and reads its answer back.
import { describe, tidyName } from "./text.js";

function namingAdvice(settings, openGroups) {
  const advice = [];

  if (openGroups.length) {
    advice.push(
      `These groups are already open: ${openGroups.join(", ")}.\n`
      + "Always prefer an open group. Put the tab in one of them whenever it belongs there, "
      + "even loosely. Only use another name when no open group fits at all."
    );
  }

  if (settings.categoryMode !== "free" && settings.categories.length) {
    advice.push(`You may also use these topics: ${settings.categories.join(", ")}.`);
  }

  advice.push(settings.categoryMode === "fixed"
    ? "Use no other names."
    : "If none of them fits, write your own name of one or two words.");

  return advice;
}

export function promptFor(tabs, settings, openGroups) {
  return [
    "Put each tab in a topic group.",
    ...namingAdvice(settings, openGroups),
    'Answer with a JSON array. One item per tab, like {"i": 0, "c": "Group name"}. Write nothing else.',
    "",
    ...tabs.map((tab, index) => describe(tab, index, settings.readMode))
  ].join("\n");
}

// Chrome's built-in model can be held to a shape, which saves a lot of bad answers.
export function schemaFor(labels) {
  const name = labels ? { type: "string", enum: labels } : { type: "string" };
  return {
    type: "array",
    items: { type: "object", properties: { i: { type: "integer" }, c: name }, required: ["i", "c"] }
  };
}

// Only worth pinning down when the model may not invent names of its own.
export function allowedNames(settings, openGroups) {
  if (settings.categoryMode !== "fixed") return null;
  return [...new Set([...openGroups, ...settings.categories])];
}

// Small models wrap their JSON in chatter, so pull the array out if plain parsing fails.
export function parseAnswer(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return parseArrayInside(String(raw));
  }
}

function parseArrayInside(text) {
  const found = text.match(/\[[\s\S]*\]/);
  if (!found) return [];
  try {
    return JSON.parse(found[0]);
  } catch {
    return [];
  }
}

// Copies one batch of answers into the right places in the full list of names.
export function spread(names, start, answers, batchSize) {
  for (const { i, c } of answers) {
    const inRange = Number.isInteger(i) && i >= 0 && i < batchSize;
    if (inRange && c) names[start + i] = tidyName(c);
  }
}
