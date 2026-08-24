// One round of thinking, in the order a person would do it.
//
//   1. Read every tab: its title, its address, and its summary when one was fetched.
//   2. Recall the groups you have now, and the ones you had before.
//   3. Put each tab in a group it clearly belongs to.
//   4. Look at what is left over and see which of those belong together.
//   5. A topic with only one tab does not become a group.
//   6. Name each new group.
//   7. When a new group turns out to be one you already have, use that group instead.
//
// Nothing here has a threshold you set. Step 3 and step 4 both ask the same question,
// "is this well above how similar two of my tabs usually are", and that is measured
// from your tabs each time.
import { clusterInto, similarity, whatCountsAsRelated } from "./cluster.js";
import { middleOf } from "./memory.js";
import { wordsFor } from "./summary.js";

export const FEWEST_TABS = 2;

const bestMatch = (vector, known) => known
  .map((group) => ({ group, score: similarity(vector, group.centre) }))
  .sort((a, b) => b.score - a.score)[0];

// Step 3. A tab joins a group it clearly belongs to, and otherwise waits for step 4.
function placeInKnownGroups(vectors, known, clearly) {
  const placed = new Map();
  if (!known.length) return placed;

  vectors.forEach((vector, index) => {
    const match = bestMatch(vector, known);
    if (match && match.score >= clearly) placed.set(index, match.group.name);
  });

  return placed;
}

// Step 4 and 5. What is left over is grouped by meaning, and lone tabs stay loose.
function discoverGroups(leftover, vectors, related) {
  const theirVectors = leftover.map((index) => vectors[index]);

  return clusterInto(theirVectors, related)
    .filter((cluster) => cluster.length >= FEWEST_TABS)
    .map((cluster) => cluster.map((where) => leftover[where]));
}

// Step 7. A group of tabs is a much better clue than a single tab, so a whole cluster
// is checked against the groups you already have. When it fits one, it joins that group
// rather than becoming a second group about the same thing.
//
// Every tab in the cluster is scored against the group, and the average has to clear the
// same bar a single tab does. Comparing the two middles instead would be wrong: an
// average points at what a set has in common, and every set of web pages has a good deal
// in common, so any two middles look alike.
function groupItBelongsTo(members, vectors, known, clearly) {
  if (!known.length) return null;

  const fit = (group) => members.reduce((sum, index) => sum + similarity(vectors[index], group.centre), 0) / members.length;
  const best = known.map((group) => ({ group, score: fit(group) })).sort((a, b) => b.score - a.score)[0];

  return best.score >= clearly ? best.group.name : null;
}

// known is [{ name, centre }] for the groups open now and the ones remembered.
// embed and name are passed in so this can be checked without a model.
export async function organise({ tabs, known, settings, embed, name }) {
  if (!tabs.length) return { groups: [], scale: null };

  const vectors = await embed(tabs.map(wordsFor));
  const scale = whatCountsAsRelated(vectors);

  const placed = placeInKnownGroups(vectors, known, scale.clearly);
  const leftover = tabs.map((_, index) => index).filter((index) => !placed.has(index));
  const discovered = discoverGroups(leftover, vectors, scale.related);

  const everyTitle = tabs.map((tab) => tab.title);
  const named = [];
  for (const members of discovered) {
    const belongsTo = groupItBelongsTo(members, vectors, known, scale.clearly);
    const titles = members.map((index) => tabs[index].title);
    const chosen = belongsTo ?? await name(titles, everyTitle, settings);
    named.push({ name: chosen, members, isNew: !belongsTo });
  }

  // Two groups discovered in the same round are different groups, whatever they ended up
  // being called. Only a group you already had may take in more than one of them.
  for (const group of named) {
    if (group.isNew) group.name = notTakenYet(group.name, named, group);
  }

  const groups = gatherUp(placed, named);
  return { groups: groups.map((group) => withTabs(group, tabs, vectors)), scale };
}

// Tabs that joined a group they already belonged to, plus the groups just discovered.
function gatherUp(placed, discovered) {
  const byName = new Map();

  for (const [index, name] of placed) {
    const already = byName.get(name.toLowerCase());
    if (already) already.members.push(index);
    else byName.set(name.toLowerCase(), { name, members: [index], isNew: false });
  }

  for (const group of discovered) {
    const already = byName.get(group.name.toLowerCase());
    if (already) already.members.push(...group.members);
    else byName.set(group.name.toLowerCase(), group);
  }

  return [...byName.values()];
}

// Adds a word from the group's own tabs when the name is already spoken for.
function notTakenYet(wanted, named, mine) {
  const taken = new Set(named.filter((group) => group !== mine).map((group) => group.name.toLowerCase()));
  if (!taken.has(wanted.toLowerCase())) return wanted;

  for (let count = 2; count < 20; count++) {
    const tried = `${wanted} ${count}`;
    if (!taken.has(tried.toLowerCase())) return tried;
  }

  return wanted;
}

function withTabs(group, tabs, vectors) {
  return {
    name: group.name,
    isNew: group.isNew,
    tabIds: group.members.map((index) => tabs[index].id),
    count: group.members.length,
    centre: middleOf(group.members.map((index) => vectors[index]))
  };
}
