# CBE Thermal Comfort Tool

Svelte 5 frontend for thermal-comfort calculations and visualizations. The active application lives at the repository root and calculates locally through `jsthermalcomfort`; this repository does not require a backend runtime.

## Development

```bash
npm install
npm run dev
```

Run the full validation suite before merging:

```bash
npm test
npm run check
npm run lint
npm run build
npm run test:visual
```

Install the bundled browser once before the visual suite:

```bash
npx playwright install chromium
```

The 18 approved visual baselines live beside the Playwright tests. Update them only for an intentional visual change, using `npm run test:visual:update`, and inspect every expected/actual/diff image before committing.

## Architecture

- `src/comfortModels/` owns model identity, inputs, strict options, request mapping, calculations, result rows, charts, zones, capabilities, and modifiers.
- `src/services/comfort/` owns reusable comfort, psychrometric, control, modifier, and chart-engine behavior.
- `src/services/units/` is the only unit-conversion family. Shared inputs, modifier values, and editable chart bands remain canonical SI.
- `src/state/comfortTool/` owns generic orchestration, keyed model memory, calculation caches, and strict version-1 share snapshots.
- `src/components/` renders and handles interaction; `src/views/` composes pages.

Important invariants:

- `canonicalInputFieldOrder` is the exact persisted input-key set. Derived/chart-only fields remain `FieldKey` values but never enter canonical records.
- Model options are complete and exact. Parsers reject missing, extra, or illegal values; internal invalid state throws.
- Each model owns its `setCharts({ defaultId, entries })` declaration. There is no global chart metadata registry.
- Compliance and Explore use the same field-chart engine. Presentation-only changes never stale calculation caches.
- Base inputs and modifier configuration are stored separately; effective SI inputs are derived through the declared modifier chain.
- Direct `jsthermalcomfort` imports stay under `src/comfortModels/` or `src/services/comfort/`.

See [Frontend architecture](docs/architecture/frontend.md) and [Adding a thermal model](docs/contributing/adding-a-thermal-model.md) for the implementation contracts. Repository execution rules are in [AGENTS.md](AGENTS.md).

## Documentation

GitBook syncs the Markdown under `docs/` using `.gitbook.yaml` and `docs/SUMMARY.md`. The public documentation URL remains [center-for-the-built-environment.gitbook.io/thermal-comfort-tool](https://center-for-the-built-environment.gitbook.io/thermal-comfort-tool).
