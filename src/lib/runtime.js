// Runs a model on your device. Firefox has its own runtime. Chrome uses a hidden page.
import { api } from "./settings.js";

const OFFSCREEN_PAGE = "offscreen.html";

// Firefox add-on pages have their own address scheme, which is the surest way to tell.
export function kind() {
  return api.runtime.getURL("").startsWith("moz-extension") ? "firefox" : "chrome";
}

export async function needsPermission() {
  if (kind() !== "firefox") return false;
  const granted = await api.permissions.contains({ permissions: ["trialML"] }).catch(() => true);
  return !granted;
}

// Only the background worker may open the hidden page, so other pages ask it to.
export async function openRuntime() {
  if (!api.offscreen) return api.runtime.sendMessage({ type: "open-runtime" });
  if (await api.offscreen.hasDocument?.()) return true;

  try {
    await api.offscreen.createDocument({
      url: OFFSCREEN_PAGE,
      reasons: ["WORKERS"],
      justification: "Runs the local language model that names your tab groups."
    });
  } catch (error) {
    // Two pages racing to open it is fine. Anything else is not.
    if (!/single offscreen/i.test(String(error))) throw error;
  }

  return true;
}

const sendOffscreen = (message) => api.runtime.sendMessage({ target: "tidy-offscreen", ...message });

let loaded = null;

async function firefoxRun(spec, task, args, options) {
  const wanted = `${task}:${spec.id}`;

  if (loaded !== wanted) {
    await api.trial.ml.createEngine({
      taskName: task,
      modelHub: "huggingface",
      modelId: spec.id,
      device: spec.device ?? "wasm",
      dtype: spec.dtype
    });
    loaded = wanted;
  }

  return api.trial.ml.runEngine({ args, options });
}

async function chromeRun(spec, task, args, options) {
  await openRuntime();
  const reply = await sendOffscreen({ kind: "run", task, modelId: spec.id, dtype: spec.dtype, device: spec.device, args, options });
  if (!reply?.ok) throw new Error(reply?.error ?? "The model did not answer.");
  return reply.result;
}

// task is a Transformers.js pipeline name, such as feature-extraction or text-generation.
export function run(spec, task, args, options = {}) {
  return kind() === "firefox" ? firefoxRun(spec, task, args, options) : chromeRun(spec, task, args, options);
}

// The smallest job each kind of model can do, used to prove it works.
function warmUpJob(task) {
  if (task === "zero-shot-classification") return { args: ["a warm up", ["one", "two"]], options: {} };
  if (task === "feature-extraction") return { args: [["warm up"]], options: {} };
  return { args: ["Say ok."], options: { max_new_tokens: 1 } };
}

// Loads the model and runs that job, so a broken setup fails here and not later.
export async function warmUp(spec, task) {
  const { args, options } = warmUpJob(task);
  await run(spec, task, args, options);
  return true;
}

// Asks the hidden page what this computer can actually do.
export async function probe() {
  if (kind() !== "chrome") return {};
  await openRuntime();
  const reply = await sendOffscreen({ kind: "info" }).catch(() => null);
  return reply?.result ?? {};
}

export async function forget() {
  loaded = null;
  if (kind() === "firefox") await api.trial.ml.deleteCachedModels?.();
  else await sendOffscreen({ kind: "forget" }).catch(() => {});
}
