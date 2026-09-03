import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
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
