// The two jobs a model does here, and the models that do them.
//
// Reading is the important one. Every tab is turned into a list of numbers that says
// what it is about, and tabs whose numbers are close are about the same thing. This is
// what actually groups your tabs, it is small and fast, and it runs on any computer.
//
// Naming is a finishing touch. A group already exists by the time a name is needed, so
// the question is only ever "what should these tabs be called", answered in two words.
// If no model can answer, the name comes from the words those tabs share.

export const READER = {
  id: "Xenova/all-MiniLM-L6-v2",
  task: "feature-extraction",
  mb: 25,
  label: "Reads your tabs"
};

// Chrome and Edge ship a model of their own. Nothing to download, and it writes the
// best names of the three. Brave and most other browsers do not have it.
export const BUILTIN_NAMER = { builtin: true, label: "Your browser's own model", mb: 0 };

export const NAMER = {
  id: "HuggingFaceTB/SmolLM2-360M-Instruct",
  task: "text-generation",
  mb: 380,
  label: "Writes group names"
};

export function readerSpec(settings) {
  return settings.readerModel ? { ...READER, id: settings.readerModel } : READER;
}

export function namerSpec(settings) {
  return settings.namerModel ? { ...NAMER, id: settings.namerModel } : NAMER;
}

// What has to be on this computer before a round can run at all.
export function whatIsNeeded(settings) {
  const needed = [readerSpec(settings)];
  if (settings.naming === "download") needed.push(namerSpec(settings));
  return needed;
}
