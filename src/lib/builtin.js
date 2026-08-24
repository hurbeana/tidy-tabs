// The model Chrome ships with. It answers on your device and never sends your tabs anywhere.
const modelApi = () => globalThis.LanguageModel ?? globalThis.ai?.languageModel ?? null;

const normalise = (state) => ({ readily: "available", "after-download": "downloadable", no: "unavailable" })[state] ?? state ?? "unavailable";

export const builtinStatus = async () => { const m = modelApi(); if (!m) return "unavailable"; try { return normalise(m.availability ? await m.availability() : (await m.capabilities()).available); } catch { return "unavailable"; } };

const SYSTEM = "You sort browser tabs into topic groups. You answer only with JSON.";

let session = null;

const open = async (onProgress) => modelApi().create({ initialPrompts: [{ role: "system", content: SYSTEM }], monitor: (m) => m.addEventListener?.("downloadprogress", (e) => onProgress?.(Math.round((e.loaded ?? 0) * 100))) });

export const builtinDownload = async (onProgress) => { const s = await open(onProgress); s.destroy?.(); return builtinStatus(); };

export const builtinClose = () => { session?.destroy?.(); session = null; };

export const builtinGenerate = async (prompt, schema) => {
  session ??= await open();
  try { return await session.prompt(prompt, schema ? { responseConstraint: schema } : {}); }
  catch (error) { builtinClose(); if (schema) { session = await open(); return session.prompt(prompt); } throw error; }
};
