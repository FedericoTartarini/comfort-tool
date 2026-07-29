# CBE Thermal Comfort Tool

This repository is maintained as a frontend-first Svelte 5 application for thermal-comfort exploration.

## Current Status

- Active app: repository root
- No active backend runtime in this repository
- Current calculation engine: local `jsthermalcomfort` wrappers in `src/services/comfort/`
- Shared controller: `src/state/comfortTool/`

## Frontend Commands

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Run unit and component tests:

```bash
npm test
```

Run the local Chromium visual-regression suite:

```bash
npx playwright install chromium
npm run test:visual
```

Approved screenshots are committed beside the browser test. When a visual change is intentional, regenerate them with `npm run test:visual:update`, inspect every expected/actual/diff image, and only then commit the updated baselines. Use `npm run test:visual:headed` when diagnosing an interaction locally. The first baselines target bundled Chromium on macOS; baselines for another operating system require separate review.



## Architecture Summary

The frontend is organized around a single comfort-tool controller:

- `src/models/`: domain constants, field metadata, DTOs
- `src/models/inputSlots.ts`: stable `Input 1/2/3` identifiers, defaults, and UI/chart styling
- `src/services/comfort/`: PMV, UTCI, comfort-zone, psychrometric, and chart builders
- `src/services/units/`: canonical SI <-> active unit-system conversion helpers
- `src/state/comfortTool/`: controller composition, model config registry, derived state, and share snapshot logic
- `src/components/input-panel/`: input workflow UI
- `src/components/chart/`: chart rendering and export UI
- `src/views/ComfortDashboard.svelte`: page composition only

Important runtime rules:

- canonical state is SI
- calculations live in `services/comfort/`
- components should not implement formulas
- Flowbite + Tailwind are preferred for UI composition

## Documentation

- Collaboration rules: `AGENTS.md`
