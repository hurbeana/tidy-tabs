// A small memory of the groups you have had before.
//
// Each group is remembered as its centre: the average of the tabs that were in it.
// That is what lets a new tab join "Rust learning" next week, even after you closed
// every tab in it. Names alone could not do that, because the name only tells you
// what the group was called, not what it was about.
//
// The store is deliberately tiny. Each centre is kept as one byte per number, so a
// group costs about half a kilobyte and the whole memory stays under 25 KB.
import { api } from "./settings.js";

const store = api.storage.local;
const KEY = "memory";
const MOST_GROUPS = 40;

// Vectors arrive between -1 and 1, so one byte each loses nothing that matters here.
function pack(centre) {
  const bytes = Int8Array.from(centre, (value) => Math.round(value * 127));
  return btoa(String.fromCharCode(...new Uint8Array(bytes.buffer)));
}

function unpack(packed) {
  const characters = atob(packed);
  const bytes = Int8Array.from(characters, (character) => character.charCodeAt(0));
  return Array.from(bytes, (value) => value / 127);
}

export function middleOf(vectors) {
  const total = new Array(vectors[0].length).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < vector.length; i++) total[i] += vector[i];
  }

  const length = Math.hypot(...total) || 1;
  return total.map((value) => value / length);
}

// A memory written one way cannot be read another way, because the numbers mean
// different things. Both the model and whether pages were read decide that, so `how`
// carries both and a change simply starts the memory over.
export async function recall(how) {
  const saved = (await store.get(KEY))[KEY];
  if (!saved || saved.model !== how) return [];

  return saved.groups.map((group) => ({ ...group, centre: unpack(group.centre) }));
}

// Newest first, so the oldest fall off the end when the store is full.
export async function remember(how, groups, now) {
  const older = await recall(how);
  const fresh = new Set(groups.map((group) => group.name.toLowerCase()));
  const kept = older.filter((group) => !fresh.has(group.name.toLowerCase()));

  const all = [...groups.map((group) => ({ ...group, seen: now })), ...kept]
    .sort((a, b) => b.seen - a.seen)
    .slice(0, MOST_GROUPS);

  await store.set({ [KEY]: { model: how, groups: all.map((group) => ({ ...group, centre: pack(group.centre) })) } });
  return all.length;
}

export function forget() {
  return store.remove(KEY);
}
