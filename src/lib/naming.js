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
const MOST_LETTERS = 160;

// A small model follows an example far better than it follows an instruction, so it is
// shown two groups already named before being asked about yours. Both examples were kept
// short on purpose: a model that is shown long answers writes long answers.
const SHOWN = [
  ["- Cheap flights to Lisbon in March\n- Hotels in Alfama, Lisbon\n- Lisbon tram 28 route map", "Lisbon trip"],
  ["- Array.prototype.map() | MDN\n- How to center a div - Stack Overflow\n- hurbeana/tidy-tabs: AI tab grouper", "Web development"]
];

const ORDERS = "You give a group of browser tabs a short name. One or two words. Reply with the name only, in the language of the tabs.";

// What the tabs are, as the model sees them. The summary is included because it says what
// a title often does not, and cut short because only the first line of it ever matters.
function listOf(texts) {
  return texts.slice(0, MOST_TITLES).map((text) => `- ${text.slice(0, MOST_LETTERS)}`).join("\n");
}

function question(texts) {
  return `${ORDERS}\n\nThese browser tabs are open together:\n${listOf(texts)}`;
}

function conversation(texts) {
  return [
    { role: "system", content: ORDERS },
    ...SHOWN.flatMap(([asked, answered]) => [{ role: "user", content: asked }, { role: "assistant", content: answered }]),
    { role: "user", content: listOf(texts) }
  ];
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
//
// Two things make a word worth using. It has to be shared, so more than one tab in the
// group uses it, and it has to be unusual, so the rest of your tabs mostly do not. The
// second part is why no list of words to ignore is needed: "and" turns up in nearly every
// tab, so it is worth nothing here, and so is "und" without anyone saying so.
export function sharedWords(texts, everyText) {
  const wordsIn = (text) => text.toLowerCase().match(/\p{L}{3,}/gu) ?? [];

  const usedHere = new Map();
  const tabsHereUsingIt = new Map();
  let wordsHere = 0;
  for (const text of texts) {
    const words = wordsIn(text);
    for (const word of words) {
      usedHere.set(word, (usedHere.get(word) ?? 0) + 1);
      wordsHere++;
    }
    for (const word of new Set(words)) tabsHereUsingIt.set(word, (tabsHereUsingIt.get(word) ?? 0) + 1);
  }

  const tabsUsingIt = new Map();
  for (const text of everyText) {
    for (const word of new Set(wordsIn(text))) tabsUsingIt.set(word, (tabsUsingIt.get(word) ?? 0) + 1);
  }

  // How much of this group's writing the word makes up, times how unusual it is elsewhere.
  // A word that every tab you have open uses scores nothing, because the second part is zero.
  const worth = (word) => {
    const howRare = Math.log(everyText.length / (tabsUsingIt.get(word) ?? 1));
    return (usedHere.get(word) / wordsHere) * howRare;
  };

  const byWorth = (a, b) => worth(b) - worth(a) || usedHere.get(b) - usedHere.get(a);
  const words = [...usedHere.keys()];

  // A word only one tab uses is not shared, so it only gets a turn when nothing is shared.
  const shared = words.filter((word) => tabsHereUsingIt.get(word) > 1);
  const worthSaying = (shared.length ? shared : words).filter((word) => worth(word) > 0);
  const best = (worthSaying.length ? worthSaying : (shared.length ? shared : words)).sort(byWorth).slice(0, 2);

  return best.length ? tidyName(inReadingOrder(best, texts).join(" ")) : "";
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
async function askAModel(texts, settings) {
  if (settings.naming === "download") {
    return run(namerSpec(settings), "text-generation", [conversation(texts)], { max_new_tokens: 12, do_sample: false });
  }

  if ((await builtinStatus()) === "available") return builtinGenerate(question(texts));
  return "";
}

// A model is a bonus here, never a requirement. When none can answer, the words the
// group's own tabs share still make a name, so a group is never left without one.
//
// The model is shown the titles, because a list of titles reads like something a person
// would answer. The words are counted over the fuller text, summary and all, because that
// is where the telling words are: a title says "Noitool", the page says "the game Noita".
export async function nameGroup({ titles, texts, everyText }, settings) {
  const fromTheTabs = sharedWords(texts, everyText) || tidyName(titles[0].split(/[|\u2014\u2013-]/)[0]);

  try {
    return firstWords(await askAModel(texts, settings)) || fromTheTabs;
  } catch {
    return fromTheTabs;
  }
}
