import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  resolve: {
    conditions: ["browser"],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // vendor/jsthermalcomfort is a git submodule with its own Jest suite;
    // run it with `npm test --prefix vendor/jsthermalcomfort`.
    exclude: [...configDefaults.exclude, "vendor/**"],
  },
  build: {
    chunkSizeWarningLimit: 5500,
    rollupOptions: {
      onwarn(warning, warn) {
        const warningId = typeof warning.id === "string" ? warning.id : "";
        const message = typeof warning.message === "string" ? warning.message : "";
        const isFlowbiteDatepickerWarning = warningId.includes("flowbite-svelte/dist/datepicker/Datepicker.svelte")
          || message.includes("flowbite-svelte/dist/datepicker/Datepicker.svelte");
        const isKnownFlowbiteNoise = message.includes("Can't resolve original location of error")
          || message.includes("contains an annotation that Rollup cannot interpret");

        if (isFlowbiteDatepickerWarning && isKnownFlowbiteNoise) {
          return;
        }

        warn(warning);
      },
      output: {
        manualChunks(id) {
          if (id.includes("plotly.js-dist-min")) {
            return "plotly";
          }

          return undefined;
        },
      },
    },
  },
});
