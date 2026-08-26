# Comfort Tool architecture plan

Target architecture for this frontend while replacing
[comfort.cbe.berkeley.edu](https://comfort.cbe.berkeley.edu/).

The product is not deployed. There is no share compatibility, no migration
reader, and no obligation to preserve today’s file names, folder names, or
parallel registries. This plan **may** rename modules, delete wrapper APIs, and
reassemble catalogs in place.

This file is the target contract. [AGENTS.md](AGENTS.md) and
[CLAUDE.md](CLAUDE.md) describe current code. Authoring a model is
[docs/adding-a-model.md](docs/adding-a-model.md). Those files must not be used
to keep presets, parallel id trees, or `*Dto` naming after this plan lands.

`26-06-29-architecture-brief.md` is historical.
Do not treat it as the next design.

## 1. Goals

| Item            | Decision                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product         | Replace the CBE Thermal Comfort Tool                                                                                                                                |
| Maintainability | One declaration file per model configures and may contribute to three unique registries. Frontend owns engines, Compare, and export. UI never branches on model id. |
| Core Analysis   | Standard, Explore, **Compare with three input slots**                                                                                                               |
| Figures         | Publication export (size, type, Compare markers), not a screenshot of the live plot                                                                                 |
| Time-series     | PHS only. Separate controller. Do not generalize the simulator.                                                                                                     |
| Legacy          | None. Sparse share. Missing known keys seed defaults. Unknown keys are rejected.                                                                                    |
| Authoring       | One `defineModel` assembly. No preset factory. No second index-model API.                                                                                           |

Keep SI as canonical state. Keep `jsthermalcomfort` behind declarations and
engines. Keep calculation caches separate from presentation rebuilds.

Refactoring **is** allowed to be large. It is not a rewrite of the thermal
models or a merge of Analysis and Time-series.

## 2. Product surfaces (frozen)

```text
L3  Product surfaces
    Standard | Explore | Compare(3) | Time-series = PHS only
    Tools (globe, local discomfort, CSV) ≠ models

L2  Engines (frontend, closed)
    ChartEngine: DynamicField | BoundaryRegion | ParametricLine | BandScalar
                 | Custom (PMV psychrometric geometry only) | TimeSeriesLine (PHS)
    TableType:   Analysis | TimeSeries
    Geometry → screen theme | publication theme
    Compare projection | export profile

L1  Declaration (model file A)
    Select built-in catalog entries
    Contribute model-scoped quantities, optional chart semantic tags (type?),
    table row configs
    Zones + calculate + charts + tables
    Forbidden: Plotly, share codec, new ChartEngine, Custom spec.build,
               new primaryInputOrder keys, new modifiers, new Time-series controller
```

Invariants:

- A new Humidex-class model must not edit input rows, chart panels, or the
  Analysis controller.
- Compare remains three slots, a results matrix, overlay markers, and a
  baseline selector.
- `calculate` writes a per-model cache. Axis, band, unit, chart, and Explore
  output changes rebuild from a ready cache.
- Time-series stays outside Analysis caches and Analysis share snapshots.
- Globe temperature, local discomfort, barometric pressure, and CBE-style CSV
  exceedance are tools or a separate product surface, not `ModelId` entries
  and not PHS Time-series.

## 3. Three registries

Runtime state is assembled **once** from frontend seeds plus every registered
declaration. UI and share code read only the assembled catalogs. Duplicate ids,
wrong owners, unknown engines, or a TimeSeries table without Time-series
capability fail `defineModel` / registry assemble.

### 3.1 Physical quantities

One catalog. Built-in (system) quantities are seeded by frontend. Model file A
selects which built-ins it uses and **may declare model-scoped extensions**.

```text
quantityCatalog = system seed  ∪  declarations[].quantities.extend
```

Rules:

- File A configures built-ins (which fields, controls, min/max).
- File A may contribute `{ id, owner: this model, scope: model, SI meta }`.
- Extended quantities **must not** enter `primaryInputOrder` or the global
  share primary record. They live in sparse `modelInputsByModel`.
- New unit dimensions, new modifiers, and new persisted primaries are
  frontend work, not declaration-only work.
- PHS mass/length conversion reads this catalog. No `if (model === Phs)`
  branches in field behaviors.

### 3.2 Charts

One chart catalog with three layers. Only one engine set exists.

| Layer               | Who writes it     | What it is                                                                         |
| ------------------- | ----------------- | ----------------------------------------------------------------------------------- |
| Engine              | Frontend, closed  | How geometry is built (`DynamicField`, `BoundaryRegion`, …)                        |
| Authoring chart     | File A (`charts`) | `{ id, type?, engine, spec }` — data spec for that engine, never a Plotly builder  |
| Runtime projections | Builder-derived   | Chart instance presentation (no spec) + chart engine registration (engine + spec)  |

The authoring entry is the single source. The builder derives both runtime
projections from it; presentation instances do not carry engine spec, and
nobody hand-writes registrations. Do not merge the two projections back into
one structure.

`type?` is a declaration-owned, optional, globally unique semantic tag bound
to that entry’s `{ engine, spec }`. It is **not** a reusable cross-instance
chart-type registry; an independent chart-type catalog is future work that
waits for a real product need.

Rules:

- File A configures built-in engines (axes, bands, titles).
- File A may name an extended `type` on an existing engine.
- File A must not add a ChartEngine and must not teach Plotly. `defineModel`
  declarations must not use `Custom spec.build`; the PMV family's
  frontend-owned psychrometric builder is the standing exception (next
  rule).
- Heat Index / Humidex fixed-axis maps are `DynamicField`, not `Custom`.
- `Custom` remains frontend-only for PMV psychrometric non-grid geometry.
- `ParametricLine` is implemented or absent. Do not keep an empty stub engine.
- Parallel `ChartInstanceId` trees are deleted. The registry derives instance
  ids from declarations. Tests: non-empty per model, unique per model, unique
  globally.

### 3.3 Tables

One table-type catalog with exactly two implementation types:

| TableType    | Engine                       | Product surface              |
| ------------ | ---------------------------- | ---------------------------- |
| `Analysis`   | Compare matrix (three slots) | Standard / Explore / Compare |
| `TimeSeries` | Metric summary               | Time-series (PHS)            |

File A declares which types it needs and configures **form** (rows, groups,
labels, formatters). It does not invent a third table engine.

Rules:

- Every Analysis model declares `tables.analysis`.
- `tables.timeSeries` is allowed only with Time-series capability. Today that
  is PHS. Declaring the table does not create a second simulator.
- Unify today’s split table APIs into `tables: { analysis, timeSeries? }`.
- Do not add `CriteriaMatrix` until a local-discomfort tool exists and
  Analysis rows are proven insufficient.

### 3.4 Authoring: `defineModel`, not presets

Delete `src/comfortModels/presets/` as an authoring API.
`buildPsychrometricIndexModelConfig` and `buildOutdoorWindIndexModelConfig`
go away.

Shared **engines** stay (grid field, Compare row helpers). Shared **family**
modules stay for PMV and Adaptive (two standards, one calculation/chart
core). Those are not presets.

A model is one declaration object assembled by `defineModel`:

```ts
export default defineModel({
  id: ModelId.HeatIndex,
  quantities: {
    extend: [], // model-scoped contributions only
  },
  charts: [
    {
      id: "heat-index-map",
      type: "heat-index-map",
      engine: ChartEngine.DynamicField,
      spec: {
        /* data, not Plotly */
      },
    },
  ],
  defaultChartId: "heat-index-map",
  tables: {
    analysis: {
      type: TableType.Analysis,
      rows: [
        /* … */
      ],
    },
  },
  calculate,
});
```

There is no `quantities.use` list. Which built-in quantities a model uses is
expressed by its `inputFields` (and axis declarations); `quantities.extend`
exists only for model-scoped contributions.

Adding a Heat Index–class model: declaration file + `ModelId` constant + one
registry line. Copy `heatIndex.ts` as a full declaration, not a factory call.

`defineModel` is the only **public authoring API** for adding an ordinary
model. Existing family/frontend modules (PMV, Adaptive, UTCI, PHS) may keep
assembling through `ComfortModelBuilder` internally; do not add a second
preset/index-model API such as `defineIndexModel()`.

## 4. Target tree and names

This layout landed in 3n. The `src/models` vs `src/comfortModels` overlap
is gone.

```text
src/
  catalog/         Frontend-owned constants and metadata
                   (formerly src/models, renamed as one layer)
    quantities.ts    system quantity seed (formerly physicalQuantities.ts)
    chartEngines.ts  closed engine set (formerly output/chartKinds.ts)
    tableTypes.ts    table-type catalog (formerly output/tableLayouts.ts)
    modelIds.ts      ModelId constants (formerly comfortModels.ts)
    ...              every other former src/models module moved with the layer
                     (thermalZone, zoneTokens, inputModifiers, inputSlots,
                      modelCapabilities, units, workspaces, output/, ...)
  declarations/    One entry file per model (file A; formerly src/comfortModels)
    heatIndex.ts
    humidex.ts
    pmv/           ashrae.ts, iso.ts, calculation.ts, charts.ts
    adaptive/
    utci/
    phs/
  engines/         All of former src/services: chart geometry, units,
                   modifiers, psychrometrics, chart theme, Plotly adapter,
                   publication export
  state/
    analysis/      formerly state/comfortTool
    timeSeries/    separate controller (keep)
    workspace/     workspace navigation and routes (keep)
  ui/              formerly components + routes + views (+ UI actions/utils)
```

PMV and Adaptive keep a family split (declaration per standard, shared
calculation/charts). Family files match the tree; do not merge ASHRAE/ISO
behind a runtime flag.

### 4.1 Folder ownership

- `catalog/` is the frontend-owned constants/metadata layer — formerly
  `src/models/`, not a new four-file folder. The four files named in
  the tree are anchors at the catalog root; the remaining former
  `src/models/output/**` metadata keeps a `catalog/output/` subfolder.
  Data-only design-token tables are explicitly catalog content
  (`zoneTokens.ts`, `inputSlotPresentation.ts` stay, Tailwind class strings
  included). Modules that are not frontend-owned constants/metadata moved to
  their true home in 3n instead of riding along:
  - `siteShellConfig.ts` (site branding/links content) → `ui/`
  - the view-model builders and Plotly-typed view models in `timeSeries.ts`
    → `state/timeSeries/` (pure declaration contracts stay)
  - `output/chartBuildResult.ts` and `output/simulationCharts.ts` (they
    carry `PlotlyChartSpec`) → `engines/`
  `catalog/` must not import from `declarations/`, `engines/`, `state/`, or
  `ui/`; an ESLint restriction covers this lane.
  (The `tableLayouts.ts` → `tableTypes.ts` import detour through
  `state/comfortTool/types` was removed in 3n; `tableTypes.ts` imports
  `ResultCellViewModel` from `output/resultSections`.)
- `engines/` is the **whole** of former `src/services/`, including
  `chartTheme.ts`, `plotlyFigure.ts`, `plotlyExport.ts`, `engines/units/`,
  and `engines/comfort/**`. The Plotly adapter and publication export are
  engine-side per the §5.2 pipeline; nothing stays behind in a `services/`
  remnant.
- `ui/` merges former `components/`, `routes/`, `views/`, and UI utilities
  (`clickOutside`) as `ui/components`, `ui/routes`, `ui/views`, `ui/utils`.
  `src/testSupport/` stays where it is.
- Import lanes keep this shape under the new names:
  `ui` → `state`, `catalog`, lightweight `engines`; `state` → `catalog`,
  `engines` (the registry imports registered `declarations`);
  `declarations` → `catalog`, `engines`, builder helpers from
  `state/analysis`; `engines` → `catalog`.

### 4.2 Name decisions

- `PhysicalQuantityId` **stays** — do not rename that identifier in 3n.
- `ChartKind` → `ChartEngine`, with derived names following
  (`MODEL_CHART_KINDS` → `MODEL_CHART_ENGINES`, `chartKindMetaById` →
  `chartEngineMetaById`, `ChartKindRegistration` →
  `ChartEngineRegistration`, guards likewise). Every chart field typed
  `ChartEngine` renames `kind:` → `engine:` so code matches the §3.2
  `{ id, engine, spec }` contract. Non-chart `kind` discriminants (for
  example input-field specs) are unrelated and keep their name.
- Chart naming boundary (A′) — the rename is locked per layer:
  - **Authoring** renames to match §3.4: `ModelDeclaration.outputCharts` →
    `charts`, entry `instanceId` → `id`, `defaultChartInstanceId` →
    `defaultChartId`, builder `setOutputCharts()` → `setCharts()` (its
    `{ defaultInstanceId }` option becomes `{ defaultChartId }`). Family
    authoring contract fields follow the authoring side
    (`psychrometricInstanceId` → `psychrometricChartId`, …), as do
    authoring-input type and helper names (`OutputChartDeclarationInput`,
    `createPmvOutputCharts`). The builder maps `id` → `instanceId` when
    deriving runtime projections.
  - **Runtime keeps the instance vocabulary**: the assembled
    `outputCharts: ModelChartInstances` field renames to `chartInstances`
    and `chartKindRegistrations` renames to `chartEngineRegistrations`, but
    their entries keep `instanceId` / `defaultInstanceId` (including the
    registration join key). The engines side keeps `instanceId` too:
    `GridModelChartSpec.instanceId`, chart memo keys, `buildChart(instanceId)`
    diagnostics, and test fixture / golden `"instanceId"` fields all stay.
    The two projections stay separate (presentation without spec, execution
    with spec); do not merge them.
  - **State/share are wire-stable**: `selectedChartInstanceId` (share key
    and state field), the `chartInstancePresentation.ts` module name, and
    "Chart instance ID …" diagnostics keep their names. Do not run a
    "consistency" sweep across this boundary.
- Collision: the shared field-chart module
  `services/comfort/charts/chartEngine.ts` was renamed to `fieldChartEngine.ts`
  **before** the `ChartEngine` symbol existed, so the closed engine set owns
  that name unambiguously.
- `PlotlyChartResponseDto` → `PlotlyChartSpec`, an engines-side type beside
  the Plotly adapter (see §5.2). It is Plotly-compatible and theme-ready —
  the payload still carries baseline style fields (`paper_bgcolor`, margins,
  annotation fonts) that `toPlotlyFigure` keeps, layering surface-specific
  sizing, typography, and config on top and remapping zone fills; do not
  describe it as theme-neutral or as vendor-neutral geometry.
- `TableType.Analysis` / `TableType.TimeSeries` already landed (0t); the
  file rename `tableLayouts.ts` → `tableTypes.ts` landed in 3n.

### 4.3 Execution notes

- Wire values moved to kebab-case (`"PMV_ASHRAE"` → `"pmv-ashrae"`). That
  changed share-codec output and golden snapshots, so it landed as its own
  reviewed step with intentional snapshot regeneration — never mixed into a
  symbol-rename diff. Route paths (`/ASHRAE-55/`) are route definitions, not
  model wire ids, and are unaffected.
- 3n migrated in small verified rounds, not a one-shot script: symbol renames
  first (compiler-guided), file renames second, folder moves last. Each round
  updated `eslint.config.js` path globs and the docs sentences it invalidated.
  Detailed sequencing:
  [docs/refactor-plan-3n.md](docs/refactor-plan-3n.md).

| Today                                                     | Target                                                | Status    |
| --------------------------------------------------------- | ----------------------------------------------------- | --------- |
| `ComfortModel` / `PMV_ASHRAE`                             | `ModelId.PmvAshrae`, wire `"pmv-ashrae"`              | done (3n) |
| `ChartKind` + `ChartInstanceId` tree                      | `ChartEngine` (closed) + declaration `charts[].id`    | done (3n; id tree deleted in 0c) |
| `TableLayout.CompareMatrix`                               | `TableType.Analysis`                                  | done (0t) |
| `TableLayout.MetricSummary`                               | `TableType.TimeSeries`                                | done (0t) |
| `WorkspaceCapability` clone                               | `WorkspaceId[]` on the declaration                    | done (3n) |
| `createComfortToolState`                                  | `createAnalysisState`                                 | done (3n) |
| `setOutputCharts` / `setOutputTable` / `setSimulation`    | `charts` + `tables` + optional PHS `simulation`       | done (0t/0a/3n) |
| Authoring `outputCharts` / entry `instanceId` / `defaultChartInstanceId` | `charts` / entry `id` / `defaultChartId` (authoring only) | done (3n) |
| Builder `setOutputCharts()`                               | `setCharts()` (maps `id` → runtime `instanceId`)      | done (3n) |
| Runtime `outputCharts: ModelChartInstances` / `chartKindRegistrations` | `chartInstances` / `chartEngineRegistrations`; entries keep `instanceId` | done (3n) |
| `selectedChartInstanceId` (state + share wire key)        | **Keep** — no rename, no wire change                  | decided   |
| `PlotlyChartResponseDto`                                  | `PlotlyChartSpec` (engines-side, Plotly-compatible)   | done (3n) |
| `*Dto` on app types                                       | Drop the suffix. Library boundary may keep `tdb`/`rh` | done (3n) |
| `src/models/comfortDtos.ts` Plotly bags                   | Drop `*Dto`; Plotly-shaped types move beside the Plotly adapter (§5.2, §10) | done (3n) |
| `src/comfortModels/presets/`                              | **Delete**                                            | done (0p) |
| `src/models/output/chartInstances.ts` id tree             | **Delete**; derive from declarations                  | done (0c) |
| `state/timeSeries/modelConfigs.ts` as a second model list | Same PHS declaration; controller stays separate       | done (0t) |
| `src/models/` (whole layer)                               | `src/catalog/`                                        | done (3n) |
| `src/comfortModels/`                                      | `src/declarations/`                                   | done (3n) |
| `src/services/` (whole layer)                             | `src/engines/`                                        | done (3n) |
| `src/components/` + `src/routes/` + `src/views/`          | `src/ui/`                                             | done (3n) |
| `services/comfort/charts/chartEngine.ts`                  | `fieldChartEngine.ts` (frees the `ChartEngine` name)  | done (3n) |
| Chart declaration `kind:` discriminant                    | `engine:`                                             | done (3n) |
| `PhysicalQuantityId`                                      | **Keep** — no rename                                  | decided   |

Components, charts, and controllers still must not branch on model id.

## 5. Chart interchange

### 5.1 Stop this pipeline

```text
calculate cache
  → full Plotly DTO (300² / 450² z + hover)
  → JSON.parse(JSON.stringify(figure))
  → Plotly.react
  → downloadImage of the on-screen DOM
```

Interactive Dynamic charts must not carry a 450×450 matrix. UTCI stress is a
1-D band (high 1-D sampling is fine). UTCI Dynamic is the 450×450 case.

### 5.2 Target pipeline

```text
calculate() once
  → resultsByInput (scalars) + small chartSource
        ↓
  Engine geometry (data-only authoring specs)
    polygons / polylines / ≤3 Compare markers
    interaction: coarse 2-D grid (cap ~100²) or evaluate-on-hover
        ↓
  compact, Plotly-compatible PlotlyChartSpec (toPlotlyFigure owns theming)
        ↓
        ├─ toPlotlyFigure(screen theme)      → Plotly.react
        └─ toPlotlyFigure(publication theme) → explicit mm/pt/dpi → separate figure
```

The interchange object is deliberately **Plotly-compatible, not
vendor-neutral**: engines emit compact Plotly-shaped traces (`scatter`,
`hovertemplate`, `fill`), and `toPlotlyFigure` owns theme application, zone
palette remapping, and the clone boundary. It is theme-ready rather than
strictly theme-neutral — today's payload still carries baseline style fields
(`paper_bgcolor`, `plot_bgcolor`, margins, annotation fonts) and some builders
write literal colours; the adapter keeps those baseline styles, adds
surface-specific sizing, typography, and config on top (publication
mm/pt/dpi), and remaps zone fills per palette.
There is one renderer and no product requirement to swap it; do not open a
geometry-IR slice to make this vendor-neutral. 3n renamed the type
(`PlotlyChartResponseDto` → `PlotlyChartSpec`) and placed it on the engines
side — it did not strip those style fields.

| Chart class       | Interchange                                             |
| ----------------- | ------------------------------------------------------- |
| Dynamic 2-D field | Interactive grid capped near 100². No 450² in the spec. |
| BandScalar / 1-D  | High 1-D sampling allowed (for example 450 x-points).   |
| Psychrometric     | Custom geometry (curves and regions), not a dense grid. |
| ParametricLine    | Polylines and optional limit bands.                     |

NaN-to-gap belongs on `z` (or equivalent), not a full-document JSON clone.
Clone only what Plotly mutates.

`ChartEngine` spec is a discriminated union. Extended types cannot escape that
union. No `spec: unknown`.

## 6. Share

No compatibility with current URLs.

- Serialize sparsely (omit default model slices; omit unset model inputs).
- Parse: missing known model → seed defaults; unknown key → **reject**.
- Extended quantities serialize only under that model’s sparse map.
- Adding a model must not require every existing URL to list that model.

`ModelId` remains an explicit constant. Wire values use kebab-case.

## 7. Phased plan

Work can land as one refactor. Phases are dependencies, not a promise to keep
old names until the last phase.

During the cutover, do not add unrelated new models. Existing-model bug fixes
are allowed.

### Phase 0 — Registries and authoring

| ID  | Work                    | Done when                                                                                                                                                                                       |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0c  | One chart catalog       | `ChartInstanceId` tree deleted. Instance ids derived from declarations. Heat Index / Humidex maps are `DynamicField`. Uniqueness tests pass.                                                    |
| 0q  | Quantity contributions  | System seed vs `quantities.extend`. PHS weight/height move to the PHS declaration. Assemble tests prove one catalog.                                                                            |
| 0t  | `tables` API            | `TableType.Analysis` / `TimeSeries`. Every Analysis model has `tables.analysis`. PHS declares TimeSeries table.                                                                                 |
| 0p  | Delete preset authoring | Preset factories gone. Heat Index, Humidex, Wind Chill are full `defineModel` declarations. Shared grid helpers remain.                                                                         |
| 0b  | Sparse share            | Missing known keys seed. Unknown keys rejected. Test a snapshot that omits a registered model.                                                                                                  |
| 0d  | One authoring doc       | `docs/adding-a-model.md`: copy `heatIndex.ts`, add `ModelId`, register once. Hard stops: new engine, new primary, new modifier, new TS controller. Replace the two current adding-a-model docs. |
| 0e  | Compare helper          | `assertCompareContract`: 1/2/3 inputs, table columns filled, chart markers, baseline change does not invalidate a ready cache.                                                                  |

### Phase 0′ — Chart data (may overlap Phase 0)

| ID  | Work              | Done when                                                                                                                                                                                      |
| --- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0f  | Grid cap          | Dynamic 2-D interactive resolution ≤ ~100² (including UTCI Dynamic). Hover does not attach huge per-cell `customdata`.                                                                         |
| 0g  | Clone boundary    | Plotly adapter does not stringify a 20k–200k-cell figure. NaN→gap is local to grid values.                                                                                                     |
| 0h  | Publication shell | One theme module for screen and export. Export builds a **separate** figure; PNG ~300 DPI equivalent; SVG of the same geometry; no mode bar.                                                   |
| 0a  | Engine/spec union | `defineModel` charts use a discriminated spec. UTCI inline `spec.build` types move into UTCI chart modules. ParametricLine is typed **and implemented**, or the kind is omitted until Phase 1. |

Zone colours may stay hex mapped through theme tokens. Sweeping every zone off
hex is not required for 0′.

**Authoring ready:** a Humidex-class model is a declaration + `ModelId` +
registry line. Compare helper is green. Share does not break when a model is
added. Dynamic charts do not default to 300²/450² DTOs. The three registries
accept declaration contributions.

### Phase 1 — PMV CBE curves (after 0 + 0′, parallel with new index models)

| ID  | Work              | Done when                                                                                                                                     |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | `ParametricLine`  | Heat-loss vs temperature and SET series render. No stub.                                                                                      |
| 1b  | PMV Analysis rows | SET, cooling effect, relative air speed, dynamic clothing are Compare-matrix rows. Add an explore output key only if Explore must colour SET. |
| 1c  | Attach to PMV     | ASHRAE and ISO declarations register the instances in `charts`.                                                                               |

Local discomfort is not a Phase 1 table type.

### Phase 2 — Publication

| ID  | Work             | Done when                                                                               |
| --- | ---------------- | --------------------------------------------------------------------------------------- |
| 2a  | Export profiles  | Extra widths (single/double column) on the same theme. Compare legend remains readable. |
| 2b  | Contour polygons | Only if editable SVG boundaries are required. Coarse grid, not 450².                    |
| 2c  | Zone tokens      | Models select tokens; print and colour-blind updates happen in one place.               |

### Phase 3 — Polish (does not block index models)

| ID  | Work                                                                  |
| --- | --------------------------------------------------------------------- |
| 3a  | Optional `validate:model` on assembled catalogs                       |
| 3b  | Golden inputs / control counts derived from the registry where honest |
| 3c  | Input-panel view models (same projection style as chart controls)     |
| 3d  | All quantity conversion through the assembled catalog (depends on 0q) |
| 3n  | Finish tree/name migration in §4 if anything still uses old paths. Execution plan: [docs/refactor-plan-3n.md](docs/refactor-plan-3n.md). **Done.** |

### Phase 4 — CBE tools (features, not model architecture)

| Item                                     | Placement                                            |
| ---------------------------------------- | ---------------------------------------------------- |
| Globe temperature                        | Modal / helper writing mean radiant temperature      |
| Local discomfort                         | Tool state and pass/fail UI, not a new ChartEngine   |
| CSV exceedance (PMV/PPD/SET over a file) | **New product surface.** Never inside the PHS worker |

## 8. When models may be added

```text
Phase 0 + 0′
    → index models and contribution-based models may be added
        → Phase 1 (PMV curves) can run in parallel
Phase 2
    → safe to promise publication export and heavier field charts
Phase 3–4
    → remaining polish, tooling, CBE accessories
```

| Action                                                                     | Earliest                |
| -------------------------------------------------------------------------- | ----------------------- |
| Heat Index–class model (built-in quantities, existing engines)             | After Phase 0 and 0′    |
| Model with `quantities.extend` or a chart semantic tag (`type?`) on an existing engine | After Phase 0 and 0′ |
| PHS-family TimeSeries table                                                | Already PHS; keep gated |
| New ChartEngine, new primary, new modifier, new TS controller              | Frontend first          |
| Globe / local discomfort / CSV                                             | Phase 4                 |

## 9. Out of scope

- Merging Analysis and Time-series **controllers or pages**
- Merging PMV ASHRAE/ISO or Adaptive ASHRAE/EN behind a runtime flag
- A generic simulator for a second Time-series model that does not exist
- Researcher `Custom spec.build` or inline `import("...")` chart types
- New ChartEngine or third TableType because a tool might need it later
- LRU / faster clone of a 200k-cell DTO instead of shrinking the DTO
- CBE CSV exceedance on the PHS Time-series path
- Keeping presets, `*Dto` app types, or `ChartInstanceId` trees for familiarity
- A documentation site or docs generator

## 10. Module map (current → target)

| Current                                         | Phase  | Change                                                              |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------- |
| `src/comfortModels/presets/`                    | done (0p) | Delete as authoring API                                          |
| `src/models/output/chartInstances.ts`           | done (0c) | Delete id tree; derive from declarations                         |
| `src/models/physicalQuantities.ts`              | done (0q, 3n) | System seed only; model quantities move to declarations      |
| `src/models/output/tableLayouts.ts`             | done (0t, 3n) | Become `TableType.Analysis` / `TimeSeries`                   |
| `src/models/output/workspaceCapabilities.ts`    | done (3n) | Fold into `WorkspaceId`                                          |
| `src/state/comfortTool/`                        | done (3n) | `src/state/analysis/`                                            |
| `src/state/comfortTool/shareState.ts`           | done (0b) | Sparse codec                                                     |
| `src/state/comfortTool/modelConfigs/builder.ts` | done (0p, 0a) | `defineModel` + discriminated chart spec                     |
| `src/state/timeSeries/modelConfigs.ts`          | done (0t) | Stop being a second product registry; read PHS declaration       |
| `docs/adding-a-model.md`                        | done (0d) | Single authoring guide (replaced the two prior adding-a-model docs) |
| `src/services/comfort/charts/kinds/`            | done (0f, 1a) | Slim geometry; implement ParametricLine                      |
| `src/services/plotlyFigure.ts`                  | done (0g) | Clone boundary                                                   |
| `src/comfortModels/utci/`                       | done (0f) | Drop 450² Dynamic grid                                           |
| `src/components/chart/PlotlyCanvas.svelte`      | 0h, 2a | Export from a dedicated figure (0h done; 2a extra widths)           |
| `src/models/` (whole layer)                     | done (3n) | `src/catalog/`; four seed files lift to the catalog root         |
| `src/comfortModels/`                            | done (3n) | `src/declarations/`                                              |
| `src/services/` (whole layer)                   | done (3n) | `src/engines/` (theme, Plotly adapter, export included)          |
| `src/components/`, `src/routes/`, `src/views/`  | done (3n) | `src/ui/` subfolders                                             |
| `src/models/comfortDtos.ts`                     | done (3n) | Drop `*Dto`; `PlotlyChartSpec` + Plotly-shaped types move beside the Plotly adapter |
| `src/services/comfort/charts/chartEngine.ts`    | done (3n) | `fieldChartEngine.ts` (frees the `ChartEngine` name)             |
| `src/models/output/chartBuildResult.ts`, `simulationCharts.ts` | done (3n) | Move to engines side (they carry `PlotlyChartSpec`)     |
| `src/models/timeSeries.ts`                      | done (3n) | View-model builders and Plotly-typed view models → `state/timeSeries/` |
| `src/models/siteShellConfig.ts`                 | done (3n) | Move to `ui/` (site content, not domain metadata)                |

**Do not casually rewrite:** Compare UI layout, calculation scheduling vs
presentation rebuild, Time-series controller lifetime. Control widgets stay
generic; their unit conversion must start reading the quantity catalog (0q/3d).

## 11. Success criteria

| Lens         | Criterion                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Declaration  | File A selects built-ins and can contribute extended quantities, chart semantic tags (`type?`), and table forms. |
| Registries   | One quantity catalog, one chart catalog (closed engines + declaration chart entries), one table-type catalog. Assemble fails on collisions. |
| Authoring    | Copy `heatIndex.ts`; add `ModelId`; register once. No preset factory. Compare helper green.          |
| Compare      | Every Analysis model runs the helper; three inputs do not fail silently.                             |
| CBE Analysis | PMV: psychrometric + heat-loss + SET curves + SET/CE rows. Adaptive boundary remains.                |
| Interaction  | Dynamic 2-D path does not stringify a 450² figure.                                                   |
| Publication  | Width and DPI chosen; Compare’s three points stay distinct; export is not a DOM screenshot.          |
| UI           | No model names in `src/ui`. No `spec: unknown` on the chart engine path.                 |
| Share        | Adding a model does not require every URL to include that model key.                                 |

## 12. Summary

Delete the second authoring stack. Keep the kitchen closed. Open the three
catalogs to declaration contributions.

1. Unique registries + `defineModel` + no presets + sparse share + Compare helper.
2. Honest chart interchange (grid cap, clone, one export theme, typed engines).
3. Add index models by copying a full declaration.
4. Implement ParametricLine and finish PMV’s CBE curves.
5. Richer publication output, then tools on their own surfaces.

Phase 0 + 0′ means the architecture may accept new models that use existing
engines. Phase 2 means it may promise paper figures. Tools never thicken
`defineModel` with a new engine.
