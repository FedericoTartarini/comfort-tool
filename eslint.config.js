import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import svelte from "eslint-plugin-svelte";
import { io } from "jsthermalcomfort";

// Flat config REPLACES a same-named rule when a later block matches the same
// file — it does not merge. `no-restricted-imports` and `no-restricted-syntax`
// are therefore composed from these fragments, and every block that narrows one
// of them has to repeat the fragments it still wants.

// ADR §3 / §4.7: model functions are called in the worker and referenced only
// by the model declarations (which bind `run` and read label/limits off them).
// The io subpath stays importable everywhere because `io.quantities` is the
// one definition of every physical quantity; that its model wrappers are only
// *called* in the worker is a convention lint cannot check.
const libraryModelImports = {
  paths: [
    {
      name: "jsthermalcomfort",
      message:
        "Library model functions are referenced only in src/models/ and called only in src/workers/. Import jsthermalcomfort/io, /psychrometrics, /reference or /charts elsewhere.",
    },
    { name: "jsthermalcomfort/models", message: "Library model functions belong in src/models/ or src/workers/." },
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
// holds object references, so renaming a quantity is one edit. The key list is
// read from the library so adding a quantity there never touches this file.
// A unit symbol can spell the same as a key (`met`, `clo`); `symbol:` properties
// in core/units.ts are display text, not identifiers, so they are exempt.
const wireStringSyntax = [
  {
    selector: `Literal[value=/^(${Object.keys(io.quantities).join("|")})$/]:not(Property[key.name='symbol'] > Literal)`,
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
    // Model declarations bind `run: io.<model>` and read label/limits off the
    // library model function; the worker is the one place that calls them.
    files: ["src/models/**/*.ts", "src/workers/**/*.ts"],
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
