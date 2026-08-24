// Small helpers for turning tabs into text and text into group names.
export const tidyName = (name) => String(name ?? "").replace(/["'`]/g, "").replace(/[^\p{L}\p{N} &+/-]/gu, " ").trim().replace(/\s+/g, " ").split(" ").slice(0, 3).join(" ").slice(0, 24).replace(/^./, (c) => c.toUpperCase());

// What the model gets to see. The web address is always there; it is free and it helps.
// A tab with no page text keeps its title, so nothing is ever left unlabelled.
export const parts = (tab, readMode) => [readMode === "content" && tab.text ? null : tab.title, tab.host, tab.text].filter(Boolean);

export const describe = (tab, i, readMode) => `${i}. ${parts(tab, readMode).join(" — ")}`;

export const textOf = (tab, readMode) => parts(tab, readMode).join(" ").slice(0, 500);

export const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

export const cosine = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);

const STOP = new Set("the a an and or of for to in on at is are with your you my how what why new home page site com www online free best top guide 2024 2025 2026".split(" "));

// Names a cluster after the word its tabs share most often.
export const commonWord = (titles) => { const count = new Map(); titles.flatMap((t) => t.toLowerCase().split(/[^\p{L}\p{N}]+/u)).filter((w) => w.length > 3 && !STOP.has(w)).forEach((w) => count.set(w, (count.get(w) ?? 0) + 1)); return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; };

export const countBy = (names) => [...names.filter(Boolean).reduce((map, name) => map.set(name, (map.get(name) ?? 0) + 1), new Map())].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

export const listOf = (items) => items.map(({ name, count }) => `${name} (${count})`).join(", ");
