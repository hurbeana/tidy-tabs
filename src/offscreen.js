// Chrome cannot run a model in its background worker, so it runs here instead.
import { pipeline, env } from "./vendor/transformers.js";

env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("vendor/");
env.backends.onnx.wasm.numThreads = 1;

const GPU_PATIENCE = 4000;

const pipes = new Map();

const tell = (message) => chrome.runtime.sendMessage({ target: "tidy-progress", ...message }).catch(() => {});

// A graphics card that never answers must not hang the whole job.
function giveUpAfter(promise, ms, instead) {
  const timeout = new Promise((done) => setTimeout(() => done(instead), ms));
  return Promise.race([promise, timeout]);
}

function adapter() {
  const asked = navigator.gpu?.requestAdapter().catch(() => null) ?? Promise.resolve(null);
  return giveUpAfter(asked, GPU_PATIENCE, null);
}

// Only the big generators are worth a graphics card. The small models are quick on the
// processor, and running them there avoids a whole class of graphics driver trouble.
async function bestDevice(task) {
  if (task !== "text-generation") return "wasm";
  return (await adapter()) ? "webgpu" : "wasm";
}

// Small quantised weights often misbehave on a graphics card, so only generators use them there.
function defaultDtype(task, device) {
  if (task !== "text-generation") return device === "webgpu" ? "fp32" : "q8";
  return device === "webgpu" ? "q4f16" : "q4";
}

// Everything the model download tells us goes straight to the settings page.
const watch = (modelId) => (event) => tell({
  modelId,
  phase: event.status,
  file: event.file ?? event.name ?? "",
  percent: Math.round(event.progress ?? 0),
  loaded: event.loaded ?? 0,
  total: event.total ?? 0
});

async function getPipe(task, modelId, dtype, device) {
  tell({ modelId, phase: "picking" });

  const useDevice = device ?? (await bestDevice(task));
  const useDtype = dtype || defaultDtype(task, useDevice);
  const key = `${task}|${modelId}|${useDtype}|${useDevice}`;

  if (!pipes.has(key)) {
    tell({ modelId, phase: "starting", device: useDevice, dtype: useDtype });
    pipes.set(key, pipeline(task, modelId, { dtype: useDtype, device: useDevice, progress_callback: watch(modelId) }));
  }

  try {
    return await pipes.get(key);
  } catch (error) {
    // A model that failed to load must not be handed out again.
    pipes.delete(key);
    throw error;
  }
}

// Tensors and other model objects do not survive the trip back, so plain data is sent.
function plain(task, out) {
  if (task === "feature-extraction") return out.tolist ? out.tolist() : out;

  if (task === "text-generation") {
    const text = out?.[0]?.generated_text;
    return Array.isArray(text) ? text.at(-1)?.content ?? "" : String(text ?? "");
  }

  return JSON.parse(JSON.stringify(out));
}

async function attempt(message, device) {
  const pipe = await getPipe(message.task, message.modelId, message.dtype, device);
  return plain(message.task, await pipe(...message.args, message.options ?? {}));
}

// If the graphics card refuses, drop to the processor and try once more.
async function runModel(message) {
  if (message.device) return attempt(message, message.device);

  const first = await bestDevice(message.task);
  try {
    return await attempt(message, first);
  } catch (error) {
    if (first === "wasm") throw error;
    tell({ modelId: message.modelId, phase: "retrying", note: "The graphics card would not run this model, so the processor is taking over." });
    return attempt(message, "wasm");
  }
}

async function info() {
  const gpu = await adapter();
  return {
    gpu: Boolean(gpu),
    adapter: gpu?.info?.description || gpu?.info?.vendor || (gpu ? "unnamed" : ""),
    loaded: [...pipes.keys()]
  };
}

function handle(message) {
  if (message.kind === "forget") {
    pipes.clear();
    return Promise.resolve(true);
  }
  if (message.kind === "info") return info();
  return runModel(message);
}

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.target !== "tidy-offscreen") return false;

  // Say something at once, so a slow start never looks like a stall.
  tell({ phase: "heard", modelId: message.modelId ?? "" });

  handle(message).then(
    (result) => reply({ ok: true, result }),
    (error) => {
      const why = String(error?.message ?? error);
      tell({ phase: "failed", note: why });
      reply({ ok: false, error: why });
    }
  );

  return true;
});

tell({ phase: "ready" });
