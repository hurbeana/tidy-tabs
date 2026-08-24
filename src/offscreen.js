// Chrome cannot run a model in its background worker, so it runs here instead.
import { pipeline, env } from "./vendor/transformers.js";

env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("vendor/");
env.backends.onnx.wasm.numThreads = 1;

const pipes = new Map();

const bestDevice = async () => ((await navigator.gpu?.requestAdapter().catch(() => null)) ? "webgpu" : "wasm");

const defaultDtype = (task, device) => (task === "text-generation" ? (device === "webgpu" ? "q4f16" : "q4") : "q8");

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

const handle = async (message) => {
  if (message.kind === "forget") return pipes.clear() ?? true;
  const pipe = await getPipe(message.task, message.modelId, message.dtype, message.device);
  return plain(message.task, await pipe(...message.args, message.options ?? {}));
};

chrome.runtime.onMessage.addListener((message, _sender, reply) => { if (message?.target !== "tidy-offscreen") return false; handle(message).then((result) => reply({ ok: true, result }), (error) => reply({ ok: false, error: String(error?.message ?? error) })); return true; });

tell({ ready: true });
