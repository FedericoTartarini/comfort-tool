import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import svelte from "eslint-plugin-svelte";

// Must match primaryInputOrder values in src/catalog/quantities.ts
// Guarded by src/catalog/catalogWireIds.test.ts
const restrictedWireStringSelectors = [
  "tdb",
  "tr",
  "vr",
  "v",
  "rh",
  "met",
  "clo",
  "wme",
  "trm",
].map((value) => ({
  selector: `Literal[value='${value}']`,
  message: `Use PhysicalQuantityId instead of the wire string "${value}".`,
}));

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    ...js.configs.recommended,
    files: ["src/**/*.js"],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs["flat/recommended"][2].rules,
      "no-undef": "off",
      "no-redeclare": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  ...svelte.configs["flat/recommended"].map((config) => ({
    ...config,
    files: ["src/**/*.svelte"],
  })),
  {
    files: ["src/**/*.svelte"],
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    languageOptions: {
      parserOptions: {
        parser: tsParser,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: [
      "src/App.svelte",
      "src/components/**/*.{ts,svelte}",
      "src/views/**/*.{ts,svelte}",
    ],
    rules: {
      "no-undef": "off",
      "no-redeclare": "off",
      "no-unused-vars": "off",
      "svelte/prefer-svelte-reactivity": "off",
      "svelte/require-each-key": "off",
    },
  },
  {
    files: ["src/**/*.{js,ts,svelte}"],
    ignores: ["src/declarations/**", "src/services/comfort/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{
            group: ["jsthermalcomfort", "jsthermalcomfort/**"],
            message: "jsthermalcomfort belongs in declarations or services/comfort.",
          }],
        },
      ],
    },
  },
  {
    files: ["src/views/**/*.{ts,svelte}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/catalog/**", "**/services/**", "**/declarations/**"],
              message: "Views may compose components and state, but may not own domain or service logic.",
            },
            {
              group: ["jsthermalcomfort", "jsthermalcomfort/**"],
              message: "jsthermalcomfort belongs in declarations or services/comfort.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/**/*.{ts,svelte}"],
    ignores: ["src/components/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/views/**", "**/declarations/**"],
              message: "Components may not depend on views or model implementations.",
            },
            {
              group: ["jsthermalcomfort", "jsthermalcomfort/**"],
              message: "jsthermalcomfort belongs in declarations or services/comfort.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/services/**/*.{ts,svelte}"],
    ignores: ["src/services/**/*.test.ts", "src/services/comfort/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/state/**",
                "**/components/**",
                "**/views/**",
                "**/declarations/**",
              ],
              message: "Services may depend on catalog and other services, not higher application layers.",
            },
            {
              group: ["jsthermalcomfort", "jsthermalcomfort/**"],
              message: "jsthermalcomfort belongs in services/comfort or declarations.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/services/comfort/**/*.{ts,svelte}"],
    ignores: ["src/services/comfort/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{
            group: [
              "**/state/**",
              "**/components/**",
              "**/views/**",
              "**/declarations/**",
            ],
            message: "Services may depend on catalog and other services, not higher application layers.",
          }],
        },
      ],
    },
  },
  {
    files: ["src/declarations/**/*.ts"],
    ignores: ["src/declarations/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/components/**", "**/views/**"],
              message: "Comfort models may not depend on presentation layers.",
            },
            {
              regex: "^(?:\\.\\./)+state/(?!analysis/modelConfigs(?:/|$))",
              message: "Comfort models may only use builder helpers from state/analysis/modelConfigs.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/catalog/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/declarations/**",
                "**/engines/**",
                "**/state/**",
                "**/ui/**",
              ],
              message: "catalog/ must not import from declarations/, engines/, state/, or ui/.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/state/analysis/modelConfigs/index.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/components/**", "**/views/**"],
              message: "State may not depend on presentation layers.",
            },
            {
              group: ["jsthermalcomfort", "jsthermalcomfort/**"],
              message: "jsthermalcomfort belongs in declarations or services/comfort.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/state/**/*.{ts,svelte}"],
    ignores: [
      "src/state/**/*.test.ts",
      "src/state/analysis/modelConfigs/index.ts",
      "src/state/timeSeries/modelConfigs.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/components/**", "**/views/**"],
              message: "State may not depend on presentation layers.",
            },
            {
              group: ["**/declarations/**"],
              message: "Only the model registry may import comfort-model implementations.",
            },
            {
              group: ["jsthermalcomfort", "jsthermalcomfort/**"],
              message: "jsthermalcomfort belongs in declarations or services/comfort.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/state/**/*.{ts,svelte}",
      "src/components/**/*.{ts,svelte}",
      "src/views/**/*.{ts,svelte}",
    ],
    ignores: [
      "**/*.test.ts",
      "src/catalog/quantities.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...restrictedWireStringSelectors,
      ],
    },
  },
];
