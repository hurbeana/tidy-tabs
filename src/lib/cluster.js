// Works out which tabs belong together, using nothing but the tabs in front of it.
//
// There are no thresholds to set here. Every model scores similarity on its own scale,
// so a number that suits one model is wrong for the next. Instead this measures how
// similar an ordinary pair of your tabs is right now, and treats anything well above
// that as a real connection.

export function similarity(a, b) {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += a[i] * b[i];
  return total;
}

function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// The score of every possible pair, so the shape of "ordinary" can be measured.
function everyPair(vectors) {
  const scores = [];
  for (let a = 0; a < vectors.length; a++) {
    for (let b = a + 1; b < vectors.length; b++) scores.push(similarity(vectors[a], vectors[b]));
  }
  return scores;
}

// How far above ordinary a pair must be before it counts as related. Two and a half
// spreads was chosen by scoring real tab sets against the groups a person would make.
const RELATED = 2.5;
const CLEARLY_RELATED = 4;

// With one or two tabs there is no spread to measure, so a plain bar is used instead.
// Half is a long way apart for two pieces of text a model has read.
const NOTHING_TO_MEASURE = { ordinary: 0, spread: 0, related: 0.5, clearly: 0.5 };

// When every tab in a window is about the same thing, the pairs all score alike, there is
// almost no spread, and the bar works out higher than any pair can ever reach. That would
// leave a window of plainly related tabs in no group at all. Two tabs that read the same
// are related whatever the sums say, so the bar stops just short of a perfect match.
const SAME_THING = 0.99;

export function whatCountsAsRelated(vectors) {
  if (vectors.length < 3) return NOTHING_TO_MEASURE;

  const scores = everyPair(vectors);
  const ordinary = median(scores);
  const spread = median(scores.map((score) => Math.abs(score - ordinary))) || 0.01;

  return {
    ordinary,
    spread,
    related: Math.min(ordinary + RELATED * spread, SAME_THING),
    clearly: Math.min(ordinary + CLEARLY_RELATED * spread, SAME_THING)
  };
}

// Joins the two closest groups over and over, until the closest pair left is no longer
// related. This is average linkage: a group is as close to another as its members are
// on average, which keeps one odd tab from dragging two groups together.
export function clusterInto(vectors, related) {
  let groups = vectors.map((_, index) => [index]);

  const closeness = (one, other) => {
    let total = 0;
    for (const a of one) for (const b of other) total += similarity(vectors[a], vectors[b]);
    return total / (one.length * other.length);
  };

  for (;;) {
    const best = closestPair(groups, closeness);
    if (!best || best.score < related) return groups;
    groups = joined(groups, best);
  }
}

function closestPair(groups, closeness) {
  let best = null;

  for (let a = 0; a < groups.length; a++) {
    for (let b = a + 1; b < groups.length; b++) {
      const score = closeness(groups[a], groups[b]);
      if (!best || score > best.score) best = { a, b, score };
    }
  }

  return best;
}

function joined(groups, pair) {
  const rest = groups.filter((_, index) => index !== pair.a && index !== pair.b);
  return [...rest, [...groups[pair.a], ...groups[pair.b]]];
}
