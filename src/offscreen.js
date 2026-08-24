// Chrome cannot run a model in its background worker, so it runs here instead.
import { pipeline, env } from "./vendor/transformers.js";

env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("vendor/");
env.backends.onnx.wasm.numThreads = 1;

const pipes = new Map();

// A graphics card that never answers must not hang the whole job.
const soon = (promise, ms, instead) => Promise.race([promise, new Promise((done) => setTimeout(() => done(instead), ms))]);

const adapter = async () => soon(navigator.gpu?.requestAdapter().catch(() => null) ?? Promise.resolve(null), 4000, null);

// Only the big generators are worth a graphics card. The small models are quick on the
// processor, and running them there avoids a whole class of graphics driver trouble.
const bestDevice = async (task) => (task === "text-generation" && (await adapter()) ? "webgpu" : "wasm");

// Small quantised weights often misbehave on a graphics card, so only generators use them there.
const defaultDtype = (task, device) => (task === "text-generation" ? (device === "webgpu" ? "q4f16" : "q4") : device === "webgpu" ? "fp32" : "q8");

const tell = (message) => chrome.runtime.sendMessage({ target: "tidy-progress", ...message }).catch(() => {});

// Everything the model download tells us goes straight to the settings page.
const watch = (modelId) => (event) => tell({ modelId, phase: event.status, file: event.file ?? event.name ?? "", percent: Math.round(event.progress ?? 0), loaded: event.loaded ?? 0, total: event.total ?? 0 });

const getPipe = async (task, modelId, dtype, device) => {
  tell({ modelId, phase: "picking" });
  const useDevice = device ?? (await bestDevice(task));
  const useDtype = dtype || defaultDtype(task, useDevice);
  const key = `${task}|${modelId}|${useDtype}|${useDevice}`;
  if (!pipes.has(key)) { tell({ modelId, phase: "starting", device: useDevice, dtype: useDtype }); pipes.set(key, pipeline(task, modelId, { dtype: useDtype, device: useDevice, progress_callback: watch(modelId) })); }
  try { return await pipes.get(key); } catch (error) { pipes.delete(key); throw error; }
};

const plain = (task, out) => {
  if (task === "feature-extraction") return out.tolist ? out.tolist() : out;
  if (task === "text-generation") { const text = out?.[0]?.generated_text; return Array.isArray(text) ? text.at(-1)?.content ?? "" : String(text ?? ""); }
  return JSON.parse(JSON.stringify(out));
};

const attempt = async (message, device) => { const pipe = await getPipe(message.task, message.modelId, message.dtype, device); return plain(message.task, await pipe(...message.args, message.options ?? {})); };

// If the graphics card refuses, drop to the processor and try once more.
const run = async (message) => {
  if (message.device) return attempt(message, message.device);
  const first = await bestDevice(message.task);
  try { return await attempt(message, first); }
  catch (error) {
    if (first === "wasm") throw error;
    tell({ modelId: message.modelId, phase: "retrying", note: "The graphics card would not run this model, so the processor is taking over." });
    return attempt(message, "wasm");
  }
};

const info = async () => { const gpu = await adapter(); return { gpu: !!gpu, adapter: gpu?.info?.description || gpu?.info?.vendor || (gpu ? "unnamed" : ""), loaded: [...pipes.keys()] }; };

const handle = async (message) => (message.kind === "forget" ? pipes.clear() ?? true : message.kind === "info" ? info() : run(message));

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.target !== "tidy-offscreen") return false;
  tell({ phase: "heard", modelId: message.modelId ?? "" });
  handle(message).then((result) => reply({ ok: true, result }), (error) => { tell({ phase: "failed", note: String(error?.message ?? error) }); reply({ ok: false, error: String(error?.message ?? error) }); });
  return true;
});

tell({ phase: "ready" });
