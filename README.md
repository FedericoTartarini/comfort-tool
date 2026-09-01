# CBE Thermal Comfort Tool

Svelte 5 frontend for thermal-comfort calculations and visualizations. The active application lives at the repository root, runs entirely in the browser, and computes locally through [`jsthermalcomfort`](https://github.com/CenterForTheBuiltEnvironment/comfort.js); no backend runtime is required.

- **Live tool:** [comfort.cbe.berkeley.edu](https://comfort.cbe.berkeley.edu/)
- **User documentation:** [Thermal Comfort Tool (GitBook)](https://center-for-the-built-environment.gitbook.io/thermal-comfort-tool)
- **Source:** [github.com/FedericoTartarini/comfort-tool](https://github.com/FedericoTartarini/comfort-tool)

## Features

The app is organized into three surfaces. Point session (Standard + Explore)
and Time-series are two session classes, created once in `App.svelte`:

| Workspace       | Route                                                     | Purpose                                                                                         |
| --------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Standard**    | `/standard/{standard}/{model}/`                           | Compliance-oriented field charts with fixed bands, captions, and pass/fail feedback             |
| **Explore**     | `/explore/{model}/`                                       | Interactive field charts with selectable axes, editable bands, and multiple outputs per model   |
| **Time-series** | `/time-series/{model}/`                                   | Segment-based exposure simulation (currently PHS) with rectal-temperature and water-loss charts |

`{standard}` is a `StandardId` (`ashrae-55`, `iso-7730`, `en-16798-1`, `iso-7933`); `{model}` is a `ModelId`.

Across Standard and Explore:

- Up to three input slots with optional **compare mode**
- **SI / IP** unit switching with canonical SI state
- **Input modifiers** (Measured Air Speed, Morning Clothing Estimate, Dynamic Clothing, Solar Gain) where declared by the model
- **URL share snapshots** (strict version-1 JSON → Base64URL → `?state=`; input + chart only) for Standard and Explore routes
- Result tables, psychrometric and dynamic charts, and chart export

## Supported models

| Model                           | Standard | Explore | Time-series |
| ------------------------------- | :----------------: | :-----: | :---------: |
| PMV / PPD (ASHRAE 55)           |         ✓          |    ✓    |             |
| PMV / PPD (ISO 7730 Category B) |         ✓          |    ✓    |             |
| Adaptive comfort (ASHRAE 55)    |         ✓          |         |             |
| Adaptive comfort (EN 16798-1)   |         ✓          |         |             |
| UTCI                            |                    |    ✓    |             |
| Heat Index                      |                    |    ✓    |             |
| Humidex                         |                    |    ✓    |             |
| Wind Chill                      |                    |    ✓    |             |
| PHS (ISO 7933:2023)             |         ✓          |    ✓    |      ✓      |

## Prerequisites

- **Node.js** ≥ 22 (`engines` in `package.json`)
- **npm** (ships with Node)

## Development

```bash
npm install
npm run dev
```

Preview a production build locally:

```bash
npm run build
npm run preview
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

The 20 approved visual baselines live beside the Playwright tests. Update them only for an intentional visual change, using `npm run test:visual:update`, and inspect every expected/actual/diff image before committing.

## Tech stack

- **Svelte 5** (runes) + **TypeScript** + **Vite 8**
- **Tailwind CSS 4** + **Flowbite Svelte** for UI
- **Plotly.js** for charts
- **`jsthermalcomfort`** for thermal-comfort calculations
- **`sv-router`** (Browser History) for client-side routing
- **Vitest** for unit tests, **Playwright** for visual regression

## Source layout

```text
src/
  catalog/         closed IDs, quantities, typed SI/IP units, field-chart profile,
                   and result-section types
  charts/          ChartType figure geometry, draw/clone/export, chartTheme,
                   plotlyExport
  declarations/    model declarations, calculations, charts, and modifier definitions
  engines/
    comfort/       shared comfort helpers, adapters, modifiers, and chart binds
    units/         SI <-> display conversion
  state/
    modelRegistry/ defineModel, ComfortModelBuilder, registered runtime configs
    pointSession/  PointSession: input/chart/setting/output buckets, actions, $derived view-models,
                   share snapshot/codec/url (JSON + Base64URL + ?state=)
    timeSeries/    independent Time-series session (PHS)
    app/           route identity, navigation, AppContext
  ui/
    components/    rendering and interaction
    routes/        client router and page composition
    utils/         UI actions (`clickOutside`)
  testSupport/     Compare helper; golden inputs/control counts from the registry
```

## Architecture

- `src/declarations/` owns model identity, inputs, strict options, declaration-local zones, calculations, result rows, charts, capabilities, and executable modifier declarations. Shared PMV and Adaptive assembly is separated from their calculation and chart modules.
- `src/engines/comfort/` owns reusable comfort, psychrometric, control, modifier, canonical request/axis-adapter, and chart-engine behavior.
- `src/engines/units/` is the only unit-conversion family. Shared inputs, modifier values, and editable chart bands remain canonical SI.
- `src/state/pointSession/` owns the Standard+Explore session: input/chart/setting/output buckets, `actions` writes, `$derived` view-model projections, and strict version-1 share snapshots.
- `src/state/timeSeries/` owns an independent keyed scenario state and simulation lifecycle for the Time-series surface.
- `src/state/app/` coordinates pathname identity, optional `?state=` hydrate, and model-switch intercept without treating the address bar as a live store.
- `src/state/modelRegistry/` registers built runtime definitions; it is not session state.
- `src/ui/components/` renders and handles interaction; `src/ui/routes/` composes pages.

Important invariants:

- Each registered model has one focused declaration entry. Stable IDs, explicit registry entries, shared metadata, and tests remain separate concerns.
- Each Compare slot stores one sparse `QuantityState` (`PhysicalQuantityId` → SI). TypeScript quantity keys are PascalCase physical names; wire strings match jsthermalcomfort fields. Share serializes that bag minus derived humidity (`t_dp`, `hr`, `t_wb`, `p_vap`). Ranges live on model `inputFields` and chart `rangeSi`, not the catalog.
- Model options are complete and exact. Parsers reject missing, extra, or illegal values; internal invalid state throws.
- Each model declares charts via `defineModel` `charts` with ids that live only on the declaration. Family modules may still use `ComfortModelBuilder.setCharts()` internally. The registry derives those ids; there is no parallel `ChartInstanceId` tree.
- Compliance and Explore use the same field-chart engine. Presentation-only changes never stale calculation caches.
- Base inputs (`quantitiesByInput`) and modifier configuration are stored separately; effective SI inputs are derived through Measured Air Speed, Morning Clothing Estimate, Dynamic Clothing, and Solar Gain in that fixed order when declared by the model, then exposed as `effectiveQuantitiesByInput` in `ModelCalculationContext`.
- `defineLibraryQuantityMapping()` is the per-model JS-name ↔ catalog-quantity table. `createRequestAxisAdapter()` extends that map with field aliases and explicit operative-temperature behavior instead of duplicating chart-axis switches.
- Direct `jsthermalcomfort` imports stay under `src/declarations/`, remaining `src/engines/comfort/`, or `src/charts/psychrometric/humidity.ts` (humidity ratio only).

### Static hosting

Public paths use clean trailing-slash URLs. Production static hosting must return `index.html` for non-asset application paths so direct visits and refreshes reach the client router.

See [Architecture](docs/architecture.md) and [Adding a model](docs/adding-a-model.md). Repository execution rules are in [AGENTS.md](AGENTS.md).

## Documentation

The Markdown under `docs/` is an internal developer reference. It is maintained directly in the repository and is not generated, linked from the product UI, or included in the production build.

## Citation

If you use this tool in published work, please cite:

> Tartarini, F., Schiavon, S., Cheung, T., Hoyt, T., 2020. CBE Thermal Comfort Tool: online tool for thermal comfort calculations and visualizations. SoftwareX 12, 100563. https://doi.org/10.1016/j.softx.2020.100563
