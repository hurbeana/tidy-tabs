// Gives a group a name.
//
// A generator is asked one short question per group, which is a job even a small model
// does well. Asking one to label every tab in a strict format is not, and that is what
// used to fail. When no generator is available, the name is taken from the words the
// group's own tabs share.
import { run } from "./runtime.js";
import { namerSpec } from "./models.js";
import { builtinGenerate, builtinStatus } from "./builtin.js";
import { tidyName } from "./text.js";

const MOST_TITLES = 8;

function question(titles) {
  return "These browser tabs are open together:\n"
    + titles.slice(0, MOST_TITLES).map((title) => `- ${title}`).join("\n")
    + "\n\nGive this group of tabs a short name of one or two words. Answer with the name only.";
}

// A model that has been asked for two words may still write a sentence.
export function firstWords(said) {
  const firstLine = String(said ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "";

  // Models often lead in, as in "Here is the name: Travel". The name follows the colon.
  const afterLeadIn = firstLine.includes(":") ? firstLine.slice(firstLine.lastIndexOf(":") + 1) : firstLine;
  const withoutPunctuation = afterLeadIn.replace(/^["'*#\s]+|["'*.\s]+$/g, "");

  return tidyName(withoutPunctuation.split(/\s+/).slice(0, 2).join(" "));
}

// Words that stand out in this group because they hardly appear in your other tabs.
export function sharedWords(titles, everyTitle) {
  const wordsIn = (text) => text.toLowerCase().match(/\p{L}{3,}/gu) ?? [];

  const hereCount = new Map();
  for (const title of titles) {
    for (const word of new Set(wordsIn(title))) hereCount.set(word, (hereCount.get(word) ?? 0) + 1);
  }

  const elsewhereCount = new Map();
  for (const title of everyTitle) {
    for (const word of new Set(wordsIn(title))) elsewhereCount.set(word, (elsewhereCount.get(word) ?? 0) + 1);
  }

  // A word earns its place by being common here and rare everywhere else. Where no word
  // repeats within the group, the most distinctive single word is still better than
  // nothing, so the filter is a preference and not a requirement.
  const standsOut = ([word, here]) => here / (elsewhereCount.get(word) ?? here);
  const ranked = [...hereCount].sort((a, b) =>
    standsOut(b) - standsOut(a) || b[1] - a[1] || b[0].length - a[0].length);

  const repeated = ranked.filter(([, here]) => here > 1);
  const best = (repeated.length ? repeated : ranked).slice(0, 2).map(([word]) => word);

  return best.length ? tidyName(inReadingOrder(best, titles).join(" ")) : "";
}

// Two words read better in the order a person wrote them: "pull request", not
// "request pull". Where the words first appear in the titles decides.
function inReadingOrder(words, titles) {
  if (words.length < 2) return words;

  const spoken = titles.join(" ").toLowerCase();
  const firstAt = (word) => {
    const at = spoken.indexOf(word);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };

  return [...words].sort((a, b) => firstAt(a) - firstAt(b));
}

// Whichever model is available answers, or none of them does.
async function askAModel(titles, settings) {
  const asked = question(titles);

  if (settings.naming === "download") {
    const messages = [{ role: "user", content: asked }];
    return run(namerSpec(settings), "text-generation", [messages], { max_new_tokens: 10, do_sample: false });
  }

  if ((await builtinStatus()) === "available") return builtinGenerate(asked);
  return "";
}

// A model is a bonus here, never a requirement. When none can answer, the words the
// group's own tabs share still make a name, so a group is never left without one.
export async function nameGroup(titles, everyTitle, settings) {
  const fromTheTabs = sharedWords(titles, everyTitle) || tidyName(titles[0].split(/[|\u2014\u2013-]/)[0]);

  try {
    return firstWords(await askAModel(titles, settings)) || fromTheTabs;
  } catch {
    return fromTheTabs;
  }
}
