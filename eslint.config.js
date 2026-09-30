import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import svelte from "eslint-plugin-svelte";
import jsthermalcomfort from "jsthermalcomfort";
import { quantities } from "./src/core/quantities.ts";

// Flat config REPLACES a same-named rule when a later block matches the same
// file — it does not merge. `no-restricted-imports` and `no-restricted-syntax`
// are therefore composed from these fragments, and every block that narrows one
// of them has to repeat the fragments it still wants.

// ADR-0002 decision 12: root-only imports make a subpath rule meaningless, so
// the boundary is the model-function names themselves, read off the package's
// `models` namespace. `Standard`, `classifyFromBins` and the psychrometrics
// stay importable everywhere; only the model functions are confined to
// src/models/, which binds `run` and reads label/limits off them. A new
// upstream model needs no lint edit.
const libraryModelFunctionNames = Object.entries(jsthermalcomfort.models)
  .filter(([name, value]) => typeof value === "function" && name !== "classifyFromBins")
  .map(([name]) => name);

const libraryModelImports = {
  paths: [
    {
      name: "jsthermalcomfort",
      importNames: libraryModelFunctionNames,
      message: "Library model functions are referenced only in src/models/.",
    },
  ],
};

// ADR §5: core/ is plain TypeScript, runnable under node, so the pure logic
// (units, share codec, chart geometry) is testable without a DOM or a session.
const coreBoundary = {
  group: ["svelte", "svelte/*", "**/state/**", "**/ui/**", "**/routes/**"],
  message: "core/ is plain TypeScript: no svelte, state, ui or routes.",
};

// ADR-0002 decision 24: the temporary library is written so that moving it
// upstream is a file cut, so it may import jsthermalcomfort and its own files
// and nothing else from src/. core/ importing it is fine; the reverse is not.
const temporaryLibraryBoundary = {
  group: ["$lib", "$lib/**", "..", "../**"],
  message: "src/temporary-library/ imports jsthermalcomfort and its own files only (ADR-0002 decision 24).",
};

// ADR-0002 decision 40: a model is added, changed or removed in its own
// declaration file and one registry line, so one declaration importing
// another would make that model's file a dependency of the other's. Two
// declarations that share inputs copy them. A declaration may not import the
// registry either: that makes every other declaration its dependency and
// closes a cycle. The registry imports every declaration by design and is
// exempt below. Patterns see the import string, not the resolved file, so any
// path through a `models` segment is barred, and a file in a subdirectory
// also may not climb one level with `../`, which lands back in src/models/.
const declarationMessage =
  "A declaration never imports another declaration, nor the registry; copy what they share (ADR-0002 decision 40).";
const declarationBoundary = {
  group: [".", "./", "./**", "**/models", "**/models/**"],
  message: declarationMessage,
};
const declarationSubdirectoryBoundary = {
  regex: "^\\.\\.(/([^.]|$)|$)",
  message: declarationMessage,
};

// ADR §4.4: the moment the chart component knows what a model is, every new
// model starts needing an edit here. The chart's request names a model and a
// slot, so it is the builders' and not the component's (ADR-0002 decision 50).
const chartBoundary = {
  group: ["**/models/**", "**/state/**", "jsthermalcomfort", "**/charts/chartRequest"],
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

// ADR §4.0 / ADR-0002 decision 2: wire strings live in core/quantities.ts and
// in shareLink. Everywhere else holds object references, so renaming a
// quantity is one edit. The key list is read from the table so adding a row
// there never touches this file. A unit symbol can spell the same as a key
// (`met`, `clo`); `symbol:` properties in core/units.ts are display text, not
// identifiers, so they are exempt. core/quantities.ts itself, the one place
// the wire string is legitimately written down, gets a file-scoped exemption
// below rather than widening this selector app-wide.
const wireStringSyntax = [
  {
    selector: `Literal[value=/^(${Object.keys(quantities).join("|")})$/]:not(Property[key.name='symbol'] > Literal)`,
    message: "Reference the Quantity object from core/quantities.ts, not its wire string. Wire strings belong in core/shareLink.ts.",
  },
];

// ADR §6: Svelte's own Best practices — "to compute something from state, use
// `$derived` rather than `$effect`" and "avoid updating state inside effects".
// A reach for `untrack` is the symptom of having broken that rule, not a fix,
// so it is banned outright and needs an explicit disable with a reason.
const untrackSyntax = [
  {
    selector: "CallExpression[callee.name='untrack']",
    message:
      "untrack means an $effect is fighting a loop it created. Compute with $derived instead (ADR §6). Disable with a reason only for genuine external synchronisation.",
  },
];

// Narrower than it looks: in state/ an $effect exists to synchronise something
// outside Svelte, and there is nothing outside Svelte in that directory, nor in
// a page, which composes state and components and talks to the router through
// navigation.ts (ADR-0002 decision 43). In ui/ the same assignment is often
// legitimate (writing to a DOM node), so the rule is not applied there. The
// rule is syntactic: it sees an assignment written inside the effect, not one
// made by a function the effect calls, which stays with review.
const effectPuritySyntax = [
  {
    selector: "CallExpression[callee.name='$effect'] AssignmentExpression",
    message:
      "An $effect in state/ or in a page must not assign. Derived values belong in $derived (ADR §6, Svelte Best practices).",
  },
];

// ADR §6: a scalar module constant is CONSTANT_CASE; a closed-set table or
// palette stays camelCase to read like the library's own `io.quantities`. Only
// the first half is mechanical, so only the first half is a rule.
const constantCaseSyntax = [
  {
    selector:
      "Program > VariableDeclaration[kind='const'] > VariableDeclarator[init.type='Literal'][id.name!=/^[A-Z][A-Z0-9_]*$/]",
    message: "A module-level scalar constant is CONSTANT_CASE (ADR §6).",
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
      "no-restricted-syntax": ["error", ...wireStringSyntax, ...untrackSyntax, ...constantCaseSyntax],
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
        ...untrackSyntax,
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
    // state/ holds the runes classes. Nothing there synchronises an external
    // system, so an assignment inside an $effect is always the reactivity
    // anti-pattern rather than a legitimate side effect.
    files: ["src/state/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...wireStringSyntax,
        ...untrackSyntax,
        ...constantCaseSyntax,
        ...effectPuritySyntax,
      ],
    },
  },
  {
    // Pages, like state/, have nothing outside Svelte to synchronise: the
    // address reaches the session through the router's after-load hook, not
    // an $effect (ADR-0002 decision 43). This block catches only an assignment
    // written inside a page's effect, as effectPuritySyntax says.
    files: ["src/routes/**/*.svelte"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...legacySvelteSyntax,
        ...wireStringSyntax,
        ...tailwindSyntax,
        ...untrackSyntax,
        ...effectPuritySyntax,
      ],
    },
  },
  {
    // Model declarations bind `run: io.<model>` and read label/limits off the
    // library model function. Compute is synchronous and calls `run` through
    // the declaration, so no other directory names one (ADR-0002 decision 29).
    // The registry is the one file here that imports declarations.
    files: ["src/models/**/*.ts"],
    ignores: ["src/models/index.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [declarationBoundary] }],
    },
  },
  {
    files: ["src/models/*/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [declarationBoundary, declarationSubdirectoryBoundary] }],
    },
  },
  {
    files: ["src/models/index.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // The share codec and the quantities table are the two places wire
    // strings may be written (ADR §4.0, ADR-0002 decision 2).
    files: ["src/core/shareLink.ts", "src/core/quantities.ts"],
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
  {
    // After the test block on purpose: the fence holds for the directory's
    // tests too, since they move upstream with it. The model-function rule
    // does not: this is library code, and calls a model as the library's own
    // functions do (ADR-0002 decision 24).
    files: ["src/temporary-library/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [temporaryLibraryBoundary] }],
    },
  },
];
