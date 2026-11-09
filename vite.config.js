import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "fs";
import path from "path";

/** The version in the package file at `file`, read by its path, so a package's `exports` map has no say. */
const versionAt = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8")).version;

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  // The versions an Image's footer names (ADR-0002 decision 64, rule 4), read
  // from the two package files when the app is built or tested.
  define: {
    __APP_VERSION__: JSON.stringify(versionAt("./package.json")),
    __LIBRARY_VERSION__: JSON.stringify(versionAt("./node_modules/jsthermalcomfort/package.json")),
  },
  resolve: {
    conditions: ["browser"],
    alias: {
      $lib: path.resolve("./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // .scratch/ holds evidence scripts, not the suite; one runs alone with
    // `npx vitest run --dir .scratch <path>`.
    exclude: [...configDefaults.exclude, ".scratch/**"],
  },
  build: {
    // The tool's floor (ADR-0001 §2): Vite 8's default baseline with Firefox
    // raised to 115 for sv-router's Array toSorted. index.html's
    // unsupported-browser message names its Chrome, Firefox and Safari
    // versions.
    target: ["chrome111", "edge111", "firefox115", "safari16.4", "ios16.4"],
    rollupOptions: {
      output: {
        manualChunks(id) {
          return id.includes("plotly.js-cartesian-dist-min") ? "plotly" : undefined;
        },
      },
    },
  },
});
