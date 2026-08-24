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
    Contribute model-scoped quantities, named chart types, table row configs
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

One chart-type catalog with two layers. Only one engine set exists.

| Layer    | Who writes it                       | What it is                                                                 |
| -------- | ----------------------------------- | -------------------------------------------------------------------------- |
| Engine   | Frontend, closed                    | How geometry is built (`DynamicField`, `BoundaryRegion`, …)                |
| Type     | System seeds + file A               | `{ id, engine, spec }` — data spec for that engine, never a Plotly builder |
| Instance | File A only (`charts` on the model) | This model’s use of a type; instance id lives only on the declaration      |

Rules:

- File A configures built-in engines (axes, bands, titles).
- File A may register an **extended type** that names an existing engine.
- File A must not add a ChartEngine, must not use `Custom spec.build`, and
  must not teach Plotly.
- Heat Index / Humidex fixed-axis maps are `DynamicField` types, not `Custom`.
- `Custom` remains frontend-only for PMV psychrometric non-grid geometry.
- `ParametricLine` is implemented or absent. Do not keep an empty stub kind.
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
    use: [Quantity.AirTemperature, Quantity.RelativeHumidity],
    extend: [], // or model-scoped contributions
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

Adding a Heat Index–class model: declaration file + `ModelId` constant + one
registry line. Copy `heatIndex.ts` as a full declaration, not a factory call.

`defineModel` is the only assembly function. Do not add `defineIndexModel()`.

## 4. Target tree and names

Rename toward this layout. Current `src/models` vs `src/comfortModels` overlap
goes away.

```text
src/
  catalog/         Unique registry seeds (frontend-owned)
    quantities.ts
    chartEngines.ts
    tableTypes.ts
    modelIds.ts
  declarations/    One entry file per model (file A)
    heatIndex.ts
    humidex.ts
    pmv/           ashrae.ts, iso.ts, calculation.ts, charts.ts
    adaptive/
    utci/
    phs/
  engines/         Chart geometry, units, modifiers, psychrometrics
  state/
    analysis/      today’s comfortTool
    timeSeries/    separate controller (keep)
    workspace/
  ui/              components, routes, views
```

PMV and Adaptive keep a family split (declaration per standard, shared
calculation/charts). Rename files to match the tree; do not merge ASHRAE/ISO
behind a runtime flag.

| Today                                                     | Target                                                |
| --------------------------------------------------------- | ----------------------------------------------------- |
| `ComfortModel` / `PMV_ASHRAE`                             | `ModelId.PmvAshrae`, wire `"pmv-ashrae"`              |
| `ChartKind` + `ChartInstanceId` tree                      | `ChartEngine` (closed) + declaration `charts[].id`    |
| `TableLayout.CompareMatrix`                               | `TableType.Analysis`                                  |
| `TableLayout.MetricSummary`                               | `TableType.TimeSeries`                                |
| `WorkspaceCapability` clone                               | `WorkspaceId[]` on the declaration                    |
| `createComfortToolState`                                  | `createAnalysisState`                                 |
| `setOutputCharts` / `setOutputTable` / `setSimulation`    | `charts` + `tables` + optional PHS `simulation`       |
| `*Dto` on app types                                       | Drop the suffix. Library boundary may keep `tdb`/`rh` |
| `src/models/comfortDtos.ts` Plotly bags                   | Geometry types, then a small Plotly adapter           |
| `src/comfortModels/presets/`                              | **Delete**                                            |
| `src/models/output/chartInstances.ts` id tree             | **Delete**; derive from declarations                  |
| `state/timeSeries/modelConfigs.ts` as a second model list | Same PHS declaration; controller stays separate       |

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
  Chart geometry (Plotly-agnostic)
    polygons / polylines / ≤3 Compare markers
    interaction: coarse 2-D grid (cap ~100²) or evaluate-on-hover
        ↓
        ├─ screen theme      → small Plotly DTO → Plotly.react
        └─ publication theme → explicit mm/pt/dpi → separate figure
```

| Chart class       | Interchange                                             |
| ----------------- | ------------------------------------------------------- |
| Dynamic 2-D field | Interactive grid capped near 100². No 450² in the DTO.  |
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
| 3n  | Finish tree/name migration in §4 if anything still uses old paths     |

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
    → remaining renames, tooling, CBE accessories
```

| Action                                                                     | Earliest                |
| -------------------------------------------------------------------------- | ----------------------- |
| Heat Index–class model (built-in quantities, existing engines)             | After Phase 0 and 0′    |
| Model with `quantities.extend` or a named chart type on an existing engine | After Phase 0 and 0′    |
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
| `src/comfortModels/presets/`                    | 0p     | Delete as authoring API                                             |
| `src/models/output/chartInstances.ts`           | 0c     | Delete id tree; derive from declarations                            |
| `src/models/physicalQuantities.ts`              | 0q, 3n | System seed only; model quantities move to declarations             |
| `src/models/output/tableLayouts.ts`             | 0t, 3n | Become `TableType.Analysis` / `TimeSeries`                          |
| `src/models/output/workspaceCapabilities.ts`    | 3n     | Fold into `WorkspaceId`                                             |
| `src/state/comfortTool/`                        | 3n     | `src/state/analysis/`                                               |
| `src/state/comfortTool/shareState.ts`           | 0b     | Sparse codec                                                        |
| `src/state/comfortTool/modelConfigs/builder.ts` | 0p, 0a | `defineModel` + discriminated chart spec                            |
| `src/state/timeSeries/modelConfigs.ts`          | 0t     | Stop being a second product registry; read PHS declaration          |
| `docs/adding-a-model.md`                        | 0d     | Single authoring guide (replaced the two prior adding-a-model docs) |
| `src/services/comfort/charts/kinds/`            | 0f, 1a | Slim geometry; implement ParametricLine                             |
| `src/services/plotlyFigure.ts`                  | 0g     | Clone boundary                                                      |
| `src/comfortModels/utci/`                       | 0f     | Drop 450² Dynamic grid                                              |
| `src/components/chart/PlotlyCanvas.svelte`      | 0h, 2a | Export from a dedicated figure                                      |

**Do not casually rewrite:** Compare UI layout, calculation scheduling vs
presentation rebuild, Time-series controller lifetime. Control widgets stay
generic; their unit conversion must start reading the quantity catalog (0q/3d).

## 11. Success criteria

| Lens         | Criterion                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Declaration  | File A selects built-ins and can contribute extended quantities, named chart types, and table forms. |
| Registries   | One quantity catalog, one chart-type catalog, one table-type catalog. Assemble fails on collisions.  |
| Authoring    | Copy `heatIndex.ts`; add `ModelId`; register once. No preset factory. Compare helper green.          |
| Compare      | Every Analysis model runs the helper; three inputs do not fail silently.                             |
| CBE Analysis | PMV: psychrometric + heat-loss + SET curves + SET/CE rows. Adaptive boundary remains.                |
| Interaction  | Dynamic 2-D path does not stringify a 450² figure.                                                   |
| Publication  | Width and DPI chosen; Compare’s three points stay distinct; export is not a DOM screenshot.          |
| UI           | No model names in `src/ui` / `src/components`. No `spec: unknown` on the chart engine path.          |
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
