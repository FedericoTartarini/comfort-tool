import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import svelte from "eslint-plugin-svelte";

// Flat config REPLACES a same-named rule when a later block matches the same
// file — it does not merge. `no-restricted-imports` and `no-restricted-syntax`
// are therefore composed from these fragments, and every block that narrows one
// of them has to repeat the fragments it still wants.

// ADR §4.7: model functions run in the worker. The io/reference/charts/
// psychrometrics subpaths are declarative metadata and geometry, cheap enough
// for the main thread — hence a subpath split rather than a blanket ban.
const libraryModelImports = {
  paths: [
    {
      name: "jsthermalcomfort",
      message:
        "Model functions belong in src/workers/. Import jsthermalcomfort/io, /psychrometrics, /reference or /charts for metadata and geometry.",
    },
    { name: "jsthermalcomfort/models", message: "Model functions belong in src/workers/." },
  ],
};

// ADR §5: core/ is plain TypeScript, runnable under node, so the pure logic
// (units, share codec, chart geometry) is testable without a DOM or a session.
const coreBoundary = {
  group: ["svelte", "svelte/*", "**/state/**", "**/ui/**", "**/routes/**"],
  message: "core/ is plain TypeScript: no svelte, state, ui or routes.",
};

// ADR §4.4: the moment the chart component knows what a model is, every new
// model starts needing an edit here.
const chartBoundary = {
  group: ["**/models/**", "**/state/**", "jsthermalcomfort", "jsthermalcomfort/**"],
  message: "Chart components consume a ChartSpec and nothing else.",
};

// ADR §6: Svelte 4 syntax an LLM reaches for by habit. The autofixer catches
// most of it; this makes the rest a build failure rather than a review comment.
const legacySvelteSyntax = [
  { selector: "SvelteElement[name.name='slot']", message: "Use {@render children()}, not <slot>." },
  {
    selector: "SvelteElement[name.name='svelte:component']",
    message: "Svelte 5 renders components dynamically without <svelte:component>.",
  },
];

// ADR §4.0: wire strings live in the library and in shareLink. Everywhere else
// holds object references, so renaming a quantity is one edit.
const wireStringSyntax = [
  {
    selector:
      "Literal[value=/^(tdb|tr|vr|v|rh|hr|met|clo|wme|t_running_mean|pmv|ppd|set|tmp_cmf)$/]",
    message:
      "Reference the Quantity object from jsthermalcomfort, not its wire string. Wire strings belong in core/shareLink.ts.",
  },
];

// ADR §2: utility classes stay in the generated primitives and the layout
// wrappers; business components take spacing from layout props.
const tailwindSyntax = [
  {
    selector:
      "SvelteAttribute[key.name='class'] SvelteLiteral[value=/(^|\\s)-?(p|m|w|h|gap|flex|grid|space|text|bg|border|rounded|shadow|items|justify)[xytrbl]?-/]",
    message:
      "Tailwind utilities belong in ui/primitives/ or ui/layout/. Compose with Stack/Grid/Inline instead.",
  },
];

export default [
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "playwright-report/**", "test-results/**"],
  },
  {
    ...js.configs.recommended,
    files: ["src/**/*.js"],
  },

  // ---- baseline -----------------------------------------------------------
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      ...tsPlugin.configs["flat/recommended"][2].rules,
      "no-undef": "off",
      "no-redeclare": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": "off",
      "no-restricted-imports": ["error", libraryModelImports],
      "no-restricted-syntax": ["error", ...wireStringSyntax],
    },
  },
  ...svelte.configs["flat/recommended"].map((config) => ({
    ...config,
    files: ["src/**/*.svelte"],
  })),
  {
    files: ["src/**/*.svelte"],
    plugins: { "@typescript-eslint": tsPlugin },
    languageOptions: { parserOptions: { parser: tsParser } },
    rules: {
      "no-undef": "off",
      "no-redeclare": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-imports": ["error", libraryModelImports],
      "no-restricted-syntax": [
        "error",
        ...legacySvelteSyntax,
        ...wireStringSyntax,
        ...tailwindSyntax,
      ],
    },
  },

  // ---- narrowed layers ----------------------------------------------------
  {
    files: ["src/core/**/*.ts"],
    ignores: ["src/core/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { ...libraryModelImports, patterns: [coreBoundary] }],
    },
  },
  {
    files: ["src/ui/charts/**/*.{ts,svelte}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [chartBoundary] }],
    },
  },
  {
    // Generated primitives and the layout wrappers are where Tailwind lives.
    files: ["src/ui/primitives/**/*.svelte", "src/ui/layout/**/*.svelte"],
    rules: {
      "no-restricted-syntax": ["error", ...legacySvelteSyntax, ...wireStringSyntax],
    },
  },
  {
    // The worker is the one place library model functions may be imported.
    files: ["src/workers/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // The share codec is the one place wire strings may be written.
    files: ["src/core/shareLink.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  {
    files: ["src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": "off",
      "no-restricted-syntax": "off",
    },
  },
];
