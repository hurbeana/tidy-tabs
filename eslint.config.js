// Rules for our own code. The vendored libraries are left alone.
import js from "@eslint/js";
import globals from "globals";
import noUnsanitized from "eslint-plugin-no-unsanitized";

const browserGlobals = { ...globals.browser, ...globals.webextensions, LanguageModel: "readonly", ai: "readonly" };

export default [
  { ignores: ["src/vendor/**", "dist/**", ".tools/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: browserGlobals },
    plugins: { "no-unsanitized": noUnsanitized },
    rules: {
      // Mozilla rejects add-ons that build HTML from strings, so catch it here.
      "no-unsanitized/method": "error",
      "no-unsanitized/property": "error",
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "prefer-const": "error",
      "no-implicit-globals": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
    }
  },
  {
    files: ["test/**/*.mjs", "*.mjs", "*.config.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.node, ...browserGlobals } },
    rules: { "no-unused-vars": ["error", { argsIgnorePattern: "^_" }] }
  }
];
