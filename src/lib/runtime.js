// Runs a model on your device. Firefox has its own runtime. Chrome uses a hidden page.
import { api } from "./settings.js";

export const kind = () => (api.trial?.ml ? "firefox" : api.offscreen ? "chrome" : "none");

export const needsPermission = async () => kind() === "firefox" && !(await api.permissions.contains({ permissions: ["trialML"] }).catch(() => true));

let ready = null;
const OFFSCREEN = "offscreen.html";

const openOffscreen = async () => { if (await api.offscreen.hasDocument?.()) return; await api.offscreen.createDocument({ url: OFFSCREEN, reasons: ["WORKERS"], justification: "Runs the local language model that names your tab groups." }).catch((e) => { if (!/single offscreen/i.test(String(e))) throw e; }); };

const sendOffscreen = (message) => api.runtime.sendMessage({ target: "tidy-offscreen", ...message });

const firefoxRun = async (spec, task, args, options) => {
  if (ready !== `${task}:${spec.id}`) { await api.trial.ml.createEngine({ taskName: task, modelHub: "huggingface", modelId: spec.id, device: spec.device ?? "wasm", dtype: spec.dtype }); ready = `${task}:${spec.id}`; }
  return api.trial.ml.runEngine({ args, options });
};

const chromeRun = async (spec, task, args, options) => { await openOffscreen(); const reply = await sendOffscreen({ kind: "run", task, modelId: spec.id, dtype: spec.dtype, device: spec.device, args, options }); if (!reply?.ok) throw new Error(reply?.error ?? "The model did not answer."); return reply.result; };

// task is a Transformers.js pipeline name, such as feature-extraction or text-generation.
export const run = async (spec, task, args, options = {}) => (kind() === "firefox" ? firefoxRun(spec, task, args, options) : chromeRun(spec, task, args, options));

// Loads the model and runs one tiny job, so a broken setup fails here and not later.
export const warmUp = async (spec, task) => { await run(spec, task, task === "zero-shot-classification" ? ["a warm up", ["one", "two"]] : [task === "feature-extraction" ? ["warm up"] : "Say ok."], task === "text-generation" ? { max_new_tokens: 1 } : {}); return true; };

// Asks the hidden page what this computer can actually do.
export const probe = async () => { if (kind() !== "chrome") return {}; await openOffscreen(); return sendOffscreen({ kind: "info" }).then((r) => r?.result ?? {}).catch(() => ({})); };

export const forget = async () => { ready = null; if (kind() === "firefox") await api.trial.ml.deleteCachedModels?.(); else await sendOffscreen({ kind: "forget" }).catch(() => {}); };
