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
git diff --check
```

Install the bundled browser once before the visual suite:

```bash
npx playwright install chromium
```

The 18 approved visual baselines live beside the Playwright tests. Update them only for an intentional visual change, using `npm run test:visual:update`, and inspect every expected/actual/diff image before committing.

## Architecture

- `src/comfortModels/` owns model identity, inputs, strict options, declaration-local zones, calculations, result rows, charts, capabilities, and executable modifier declarations. Shared PMV and Adaptive assembly is separated from their calculation and chart modules.
- `src/services/comfort/` owns reusable comfort, psychrometric, control, modifier, canonical request/axis-adapter, and chart-engine behavior.
- `src/services/units/` is the only unit-conversion family. Shared inputs, modifier values, and editable chart bands remain canonical SI.
- `src/state/comfortTool/` owns generic orchestration, keyed model memory, calculation caches, pure chart/modifier/model-switch projections, and strict version-1 share snapshots.
- `src/components/` renders and handles interaction; `src/views/` composes pages.

Important invariants:

- Each registered model has one focused declaration entry. Stable IDs, explicit registry entries, shared metadata, and tests remain separate concerns.
- `canonicalInputFieldOrder` is the exact persisted input-key set. Derived/chart-only fields remain `FieldKey` values but never enter canonical records.
- Model options are complete and exact. Parsers reject missing, extra, or illegal values; internal invalid state throws.
- Each model owns its `setCharts({ defaultId, entries })` declaration. There is no global chart metadata registry.
- Compliance and Explore use the same field-chart engine. Presentation-only changes never stale calculation caches.
- Base inputs and modifier configuration are stored separately; effective SI inputs are derived through Measured Air Speed, Morning Clothing Estimate, Dynamic Clothing, and Solar Gain in that fixed order when declared by the model.
- `createRequestAxisAdapter()` extends one canonical request map with field aliases and explicit operative-temperature behavior instead of duplicating chart-axis switches.
- Direct `jsthermalcomfort` imports stay under `src/comfortModels/` or `src/services/comfort/`.

See [Frontend structure summary](docs/frontend-structure-summary.md) and [Adding a thermal model](docs/adding-a-thermal-model.md) for the implementation contracts. Repository execution rules are in [AGENTS.md](AGENTS.md).

## Documentation

The Markdown under `docs/` is an internal developer reference. It is maintained directly in the repository and is not generated, linked from the product UI, or included in the production build.
