import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { createRequire } from "module";
import path from "path";

const require = createRequire(import.meta.url);

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  // The versions an Image's footer names (ADR-0002 decision 64, rule 4), read
  // from the two package files when the app is built or tested.
  define: {
    __APP_VERSION__: JSON.stringify(require("./package.json").version),
    __LIBRARY_VERSION__: JSON.stringify(require("jsthermalcomfort/package.json").version),
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
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          return id.includes("plotly.js-cartesian-dist-min") ? "plotly" : undefined;
        },
      },
    },
  },
});
