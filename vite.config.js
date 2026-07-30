import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    conditions: ["browser"],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
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
