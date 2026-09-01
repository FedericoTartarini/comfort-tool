# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Commands

```bash
npm run dev         # Start the application dev server
npm test            # Run Vitest tests
npm run check       # Run Svelte and TypeScript checks
npm run lint        # Run ESLint
npm run build       # Build the application
npm run test:visual # Run Playwright visual tests
npm run preview     # Preview the application build
```

To run a single test file:

```bash
npx vitest run src/engines/comfort/comfort.test.ts
```

## Stack

Svelte 5 (runes), TypeScript, Vite 5, Tailwind CSS + Flowbite Svelte, Plotly.js, `jsthermalcomfort` (thermal comfort engine), Vitest.

Frontend-only — no backend in this repo.

## Architecture

See [docs/architecture.md](docs/architecture.md) for product surfaces, sessions, catalogs, import lanes, charts, and share. Execution rules are in [AGENTS.md](AGENTS.md). Authoring a model is [docs/adding-a-model.md](docs/adding-a-model.md).

## Source Layout

```
src/
  App.svelte        root component
  declarations/    Heat Index–class one file; family folders pmv/, adaptive/, phs/; UTCI is utci/utci.ts
  ui/
    components/     rendering and interaction (input-panel/, chart/, shared UI);
                    site shell branding/links (`siteShellConfig.ts`)
    routes/         client router and page composition (ComfortDashboard, TimeSeriesPage)
    utils/          UI actions (`clickOutside`)
  catalog/          closed domain constants (quantities, zone tokens, model IDs, units);
                    fieldChartProfile.ts and resultSections.ts at catalog root
  charts/           ChartType figure functions, draw/clone/export (native Plotly);
                    chartTheme.ts, plotlyExport.ts;
                    isolines.ts; psychrometric/ (assemble only stacks traces)
  engines/
    comfort/        leftover shared comfort helpers, adapters, chart binds, modifiers
    units/          SI <-> IP conversion helpers
  state/
    modelRegistry/  defineModel, ComfortModelBuilder, registered runtime configs
    pointSession/   Standard+Explore session: input/chart/setting/output buckets, actions, $derived
                    view-models, share snapshot/codec/url
    timeSeries/     Time-series session (PHS); editor/chart view models
    app/            route identity, navigation, AppContext
  testSupport/      Compare helper; golden inputs/control counts from the registry
```

Canonical Standard URLs are `/standard/{standard}/{model}/` (for example `/standard/ashrae-55/pmv-ashrae/`). Explore is `/explore/{model}/`. Time-series is `/time-series/{model}/`. Mixed-case and surface-only aliases replace-redirect to that path.

## Architecture Rules

**Import direction**

- `ui/routes` → `ui/components`, `state`
- `ui/components` → `state`, `catalog`, lightweight `engines`
- `state` → `catalog`, `engines`; `state/modelRegistry` imports registered configs from `declarations`
- `declarations` → `catalog`, `engines`, builder helpers from `state/modelRegistry`, and `charts/<ChartType>` geometry helpers (not Plotly assemble)
- `engines` → `catalog`
- `charts` geometry helpers must not import models, quantities, or declarations

**Canonical state is always SI.** User input converts to SI on entry; calculations run in SI; display converts from SI via `src/engines/units/`.

**Calculation ownership:** Model-specific thermal-comfort logic belongs in `src/declarations/**`. Reusable ChartType geometry belongs in `src/charts/`. Remaining shared comfort helpers live in `src/engines/comfort/**`. Shared Cartesian isoline root-finding lives in `src/charts/isolines.ts`. Psychrometric isoline geometry lives in `src/charts/psychrometric/`. Declarations wire `evaluate` and bands; they do not solve isoline roots. 2-D field hover uses a Plotly probe on `ChartBuildResult.hoverProbe` (not `ChartPayload`); the probe follows the pointer and does not snap to Compare markers. State and components must not contain raw formula implementations.

**`jsthermalcomfort` imports** stay in `src/declarations/**`, remaining `src/engines/comfort/**`, and `src/charts/psychrometric/humidity.ts` (humidity ratio only). Model labels/descriptions come from string `library.label` / `library.description` (JS `@docname` / leading JSDoc first sentence). Call JS classifiers and bins (`humidex.mapping`, UTCI `mapping`, Heat Index `mapping`, ASHRAE `tsv`/`compliance`/`COMPLIANCE_LIMIT`, ISO `tsv`, adaptive `offsets` / `t_running_mean_limits`, `get_ce`) instead of copying or scanning them. Comfort Tool maps library labels to `ZoneToken`. All-lowercase classifier labels are title-cased for display; calculation identity stays the JS/Python string. Adaptive display labels are generated from `offsets.id` in the Adaptive declaration layer. PPD 10% and PHS Explore t_re/water-loss fills are product chart presets. Wind Chill has no library classifier, so it has no default frostbite bands; WCT is the library result with no local applicability gate. EN Adaptive outdoor chart 10–30 °C is an axis, not `adaptive_en.t_running_mean_limits`. PHS rectal and water-loss fractions come from `phs.*`.

**Unit conversion** belongs in `src/engines/units/`. Quantity conversion reads `siUnit` from the closed quantity catalog. Display labels live on the SI/IP unit tables. Canonical state remains SI.

## State Shape

The session is `PointSession` (`createPointSession` in `createPointSession.svelte.ts`). State is four buckets on the class (`session.input` / `session.chart` / `session.setting` / `session.output`). Writes go through `session.actions.*`. View-models (`inputPanel`, `chartBuild`, `chartControls`, …) are `$derived` projections, not a second store.

- `input` — sparse `quantitiesByInput` (`QuantityState` per Compare slot), options, modifiers, Compare, unit system
- `chart` — per-model ChartType, axes, baseline, Explore bands
- `setting` — path identity: selected model, active surface, allowed models, pending model switch
- `output` — `{ isLoading, errorMessage }`; calculation cache belongs to this bucket but is stored as `calculationCacheByModel = $state.raw(...)` so Plotly-sized objects are not deeply proxied

Share is UTF-8 JSON → Base64URL → `?state=` of **input + chart only** (sparse quantities minus derived humidity). Pathname is identity (surface + standard + model). Time-series is a separate session. The model registry is not session state.

## Model Configuration

Model declarations live in `src/declarations/`. `defineModel` is the assembly function; it uses `ComfortModelBuilder` internally. Copy `heatIndex.ts` for a new model (one file, three zones). Family modules (PMV, Adaptive) may still assemble with `ComfortModelBuilder`. PHS Worker/Time-series stay separate.

Use constants from `src/catalog/` for `ModelId`, `PhysicalQuantityId`, `ChartType`, `SurfaceId`, and `ZoneToken`. Charts are `type` + data spec; session/share select `selectedChartType`. `library.label` / `library.description` fill metadata. Input widgets come from `defaultFieldWidgetByQuantity`. Every `inputFields` entry must declare SI min/max. The quantity catalog has no ranges. Modifier input ranges live on `modifierInputRangeSi`. Derived-humidity widget min/max map the model RH range at current `tdb`. Dynamic charts inherit `inputFields`; chart-only axes declare `rangeSi` / `axisRanges` on the spec. The Psychrometric ChartType viewport is `DEFAULT_PSYCHROMETRIC_VIEW` (`tdb` 10–40 °C, `hr` 0–0.03 kg/kg); CBE `psychchart.js` uses 10–36 °C and 0–30 g/kg. Classifier edges come from JS `bins`. Catalog TypeScript keys are PascalCase physical names; wire strings match jsthermalcomfort fields. Map those with `defineLibraryQuantityMapping`.

## UI Conventions

- Use Flowbite Svelte components first; Tailwind utilities for layout/spacing/styling.
- Analysis input-panel components consume `InputPanelViewModel` the same way chart controls consume `ChartControlsViewModel`.
- Declare component props using a named `interface Props` above `$props()` destructuring.
- Complex `{#if}` conditions belong in a `$derived` variable.

## Done Criteria

A change is complete when `npm test`, `npm run check`, `npm run lint`, and `npm run build` pass; SI remains canonical shared state; `jsthermalcomfort` stays behind the allowed import lanes; conversion stays in `src/engines/units/`; and `docs/architecture.md` still matches the live tree.
