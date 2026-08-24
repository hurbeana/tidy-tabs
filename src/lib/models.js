// The models you can pick from. All of them run on your own device.
export const MODELS = {
  builtin: { label: "Built-in browser model", task: "generate", id: null, mb: 0, blurb: "Uses the model your browser already ships with. Nothing to download in Chrome." },
  tiny: { label: "Tiny — sorts by meaning", task: "embed", id: "Xenova/all-MiniLM-L6-v2", mb: 25, blurb: "Fast and small. Puts similar pages together and reuses your group names." },
  small: { label: "Small — picks from your list", task: "zeroshot", id: "Xenova/nli-deberta-v3-xsmall", mb: 70, blurb: "Chooses the best fit from your topic list and your open groups." },
  medium: { label: "Medium — writes its own names", task: "generate", id: "onnx-community/gemma-3-270m-it-ONNX", mb: 200, blurb: "Invents short group names. A good balance of speed and quality." },
  large: { label: "Large — best names", task: "generate", id: "onnx-community/Qwen3-0.6B-ONNX", mb: 600, blurb: "Slowest and heaviest, and the best at naming. Needs a decent computer." },
  custom: { label: "Your own model", task: "generate", id: "", mb: 0, blurb: "Any model from Hugging Face that works with Transformers.js." },
  site: { label: "No model — group by website", task: "none", id: null, mb: 0, blurb: "No AI at all. Tabs from the same website land together." }
};

export const modelSpec = (settings, key = settings.model) => { const base = MODELS[key] ?? MODELS.builtin; return key === "custom" ? { ...base, id: settings.customModelId, task: settings.customModelTask ?? "generate" } : base; };

export const DTYPES = ["q4", "q4f16", "q8", "fp16", "fp32"];
