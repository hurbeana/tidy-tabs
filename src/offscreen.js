// Chrome cannot run a model in its background worker, so it runs here instead.
import { pipeline, env } from "./vendor/transformers.js";

env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("vendor/");
env.backends.onnx.wasm.numThreads = 1;

const pipes = new Map();

const bestDevice = async () => ((await navigator.gpu?.requestAdapter().catch(() => null)) ? "webgpu" : "wasm");

// Small quantised weights often misbehave on a graphics card, so only generators use them there.
const defaultDtype = (task, device) => (task === "text-generation" ? (device === "webgpu" ? "q4f16" : "q4") : device === "webgpu" ? "fp32" : "q8");

const tell = (message) => chrome.runtime.sendMessage({ target: "tidy-progress", ...message }).catch(() => {});

const getPipe = async (task, modelId, dtype, device) => {
  const useDevice = device ?? (await bestDevice());
  const useDtype = dtype ?? defaultDtype(task, useDevice);
  const key = `${task}|${modelId}|${useDtype}|${useDevice}`;
  pipes.set(key, pipes.get(key) ?? pipeline(task, modelId, { dtype: useDtype, device: useDevice, progress_callback: (p) => p.status === "progress" && tell({ modelId, percent: Math.round(p.progress ?? 0), file: p.file }) }));
  return pipes.get(key);
};

const plain = (task, out) => {
  if (task === "feature-extraction") return out.tolist ? out.tolist() : out;
  if (task === "text-generation") { const text = out?.[0]?.generated_text; return Array.isArray(text) ? text.at(-1)?.content ?? "" : String(text ?? ""); }
  return JSON.parse(JSON.stringify(out));
};

const attempt = async (message, device) => { const pipe = await getPipe(message.task, message.modelId, message.dtype, device); return plain(message.task, await pipe(...message.args, message.options ?? {})); };

// If the graphics card refuses, drop to the processor and try once more.
const handle = async (message) => {
  if (message.kind === "forget") return pipes.clear() ?? true;
  if (message.device) return attempt(message, message.device);
  try { return await attempt(message, await bestDevice()); }
  catch (error) { if ((await bestDevice()) === "wasm") throw error; console.warn("Tidy Tabs: the graphics card would not run this model, using the processor instead.", error); return attempt(message, "wasm"); }
};

chrome.runtime.onMessage.addListener((message, _sender, reply) => { if (message?.target !== "tidy-offscreen") return false; handle(message).then((result) => reply({ ok: true, result }), (error) => reply({ ok: false, error: String(error?.message ?? error) })); return true; });

tell({ ready: true });
