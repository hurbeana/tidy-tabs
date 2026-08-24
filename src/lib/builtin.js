// The model Chrome ships with. It answers on your device and never sends your tabs anywhere.

const SYSTEM = "You sort browser tabs into topic groups. You answer only with JSON.";

// The name of this API changed once, so both spellings are accepted.
function modelApi() {
  return globalThis.LanguageModel ?? globalThis.ai?.languageModel ?? null;
}

const OLD_NAMES = { readily: "available", "after-download": "downloadable", no: "unavailable" };

export async function builtinStatus() {
  const model = modelApi();
  if (!model) return "unavailable";

  try {
    const state = model.availability ? await model.availability() : (await model.capabilities()).available;
    return OLD_NAMES[state] ?? state ?? "unavailable";
  } catch {
    return "unavailable";
  }
}

function openSession(onProgress) {
  return modelApi().create({
    initialPrompts: [{ role: "system", content: SYSTEM }],
    monitor: (m) => m.addEventListener?.("downloadprogress", (e) => onProgress?.(Math.round((e.loaded ?? 0) * 100)))
  });
}

// Opening a session is what triggers the one-time download.
export async function builtinDownload(onProgress) {
  const session = await openSession(onProgress);
  session.destroy?.();
  return builtinStatus();
}

let session = null;

export function builtinClose() {
  session?.destroy?.();
  session = null;
}

export async function builtinGenerate(prompt, schema) {
  session ??= await openSession();

  try {
    return await session.prompt(prompt, schema ? { responseConstraint: schema } : {});
  } catch (error) {
    // A session that has failed once cannot be trusted, so it is thrown away.
    builtinClose();
    if (!schema) throw error;

    // The shape may be what it choked on, so try once more without it.
    session = await openSession();
    return session.prompt(prompt);
  }
}
