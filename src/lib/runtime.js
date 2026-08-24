// Runs a model on your device. Firefox has its own runtime. Chrome uses a hidden page.
import { api } from "./settings.js";

export const kind = () => (api.trial?.ml ? "firefox" : api.offscreen ? "chrome" : "none");

export const needsPermission = async () => kind() === "firefox" && !(await api.permissions.contains({ permissions: ["trialML"] }).catch(() => true));

export const askPermission = async () => api.permissions.request({ permissions: ["trialML"] });

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

export const warmUp = async (spec, task) => run(spec, task, task === "feature-extraction" ? ["warm up"] : ["Say ok."], task === "text-generation" ? { max_new_tokens: 1 } : {}).then(() => true).catch(() => false);

export const forget = async () => { ready = null; if (kind() === "firefox") await api.trial.ml.deleteCachedModels?.(); else await sendOffscreen({ kind: "forget" }).catch(() => {}); };

export const closeRuntime = async () => { ready = null; if (kind() === "chrome") await api.offscreen.closeDocument?.().catch(() => {}); };
