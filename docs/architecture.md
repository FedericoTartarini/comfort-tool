# Architecture

Frontend for thermal-comfort calculation and visualization, replacing
[comfort.cbe.berkeley.edu](https://comfort.cbe.berkeley.edu/). The product
runs entirely in the browser. Canonical shared state is SI. Authoring a model
is [adding-a-model.md](adding-a-model.md). Execution rules live in
[AGENTS.md](../AGENTS.md).

## Product surfaces and sessions

Surfaces are the user-facing page families (`SurfaceId`):

| Surface | Route | Session |
| ------- | ----- | ------- |
| Standard | `/standard/{standard}/{model}/` | Point session |
| Explore | `/explore/{model}/` | Point session |
| Time-series | `/time-series/{model}/` | Time-series session (PHS) |

Compare is a three-slot switch inside the point session, not a fourth surface.

`App.svelte` creates two sessions once: `PointSession` (Standard + Explore)
and `TimeSeriesSession`. Switching model or Standard↔Explore does not
construct a new session. The sessions stay separate: Time-series is outside
point-session caches and share snapshots. The model registry
(`src/state/modelRegistry/`) is shared by both and is not session state.

A new Humidex-class model does not edit input rows, chart panels, or either
session. Globe temperature, local discomfort, barometric pressure, and
CBE-style CSV exceedance are tools or a later surface, not `ModelId` entries.

## Source tree

```text
src/
  App.svelte
  catalog/         closed IDs and metadata (quantities, ChartType, zone tokens,
                   fieldChartProfile.ts, resultSections.ts at catalog root)
  charts/          ChartType figure geometry, assemble, draw/clone, chartTheme,
                   plotlyExport; isolines.ts; psychrometric/
  declarations/    one entry per model (Heat Index–class: one file, three
                   zones). Family folders: pmv/, adaptive/, phs/. UTCI is
                   `utci/utci.ts`. PHS Worker/Time-series stay separate.
  engines/
    comfort/       leftover shared comfort helpers, adapters, modifiers,
                   field-chart bind, ChartBuildResult
    units/         SI ↔ display conversion
  state/
    modelRegistry/ defineModel, ComfortModelBuilder, registered configs
    pointSession/  Standard+Explore: input/chart/setting/output buckets, actions, $derived
                   view-models, share snapshot/codec/url
    timeSeries/    Time-series session (PHS)
    app/           route identity, navigation, AppContext
  ui/
    components/    rendering and interaction
    routes/        client router and page composition
    utils/         UI actions (`clickOutside`)
  testSupport/     Compare helper; golden inputs from the registry
```

Entry files:

```text
src/App.svelte
src/ui/routes/ComfortDashboard.svelte
src/state/pointSession/createPointSession.svelte.ts
src/state/pointSession/types.ts
```

## Import lanes

- `ui/routes` → `ui/components`, `state`
- `ui/components` → `state`, `catalog`, lightweight `engines`
- `state` → `catalog`, `engines`; `state/modelRegistry` imports registered
  configs from `declarations`
- `declarations` → `catalog`, `engines`, builder helpers from
  `state/modelRegistry`, and `charts/<ChartType>` geometry helpers (not Plotly
  assemble)
- `engines` → `catalog`
- `charts` geometry helpers do not import models, quantities, or declarations

Direct `jsthermalcomfort` imports stay in `src/declarations/**`, remaining
`src/engines/comfort/**`, or `src/charts/psychrometric/humidity.ts` (humidity
ratio only).

## Catalogs

Quantities and ChartTypes are closed frontend catalogs. Models select ids;
they do not own, extend, or invent them. There is no table-type catalog.

- Quantities: `src/catalog/quantities.ts` for inputs and outputs.
  TypeScript keys are PascalCase physical names; wire strings match
  jsthermalcomfort fields. Catalog rows hold `label`, `siUnit`, optional
  `step`, and optional `category: Humidity`. SI/IP pairing is
  `ipUnitForSi` / `unitLabel`. Session state is one sparse `QuantityState`
  bag per Compare slot. Derived humidity (`derivedHumidityQuantityIds`)
  may live in memory and is omitted from share. PHS weight/height use the
  same bag and stay off Analysis `inputFields`. Ranges live on model
  `inputFields` (required min/max) and chart `rangeSi`. Display labels
  live on `siUnitLabel` / `ipUnitLabel`. Map JS names with
  `defineLibraryQuantityMapping`.
- ChartTypes: `src/catalog/chartTypes.ts`. Eight product names. One model
  registers each ChartType at most once. Dropdown labels are
  `chartTypeLabel[type]`. Selection key is `ChartType` (`selectedChartType`);
  `instanceId` equals the ChartType. Declarations do not write chart ids.
- Tables: slots `results` (every point-session model) and optional
  `timeSeries` (PHS). Time-series surface membership is that slot.
- Zones: models select a `ZoneToken`; screen, publication, and colour-blind
  hex live in `src/catalog/zoneTokens.ts`.
- Model labels/descriptions: `defineModel({ library })` reads string
  `library.label` / `library.description` (JS `@docname` / leading
  JSDoc). Catalog does not import `jsthermalcomfort`.
  Science categories come from pythermalcomfort via JS bins: Humidex
  `mapping` + bins, UTCI `mapping.bins`, Heat Index `mapping.bins`, ASHRAE
  `compliance.bounds`, `tsv.bins`, and `COMPLIANCE_LIMIT`, ISO `tsv.bins`,
  Adaptive `offsets` and result `tmp_cmf_*` / `acceptability_*` fields.
  Comfort Tool maps those library label strings (or, when JS has no
  label, library ids / result field names such as `cat_i` / `wct`) to
  `ZoneToken` colours. It does not invent classifier copy. Interval
  membership follows the library digitize closedness (`minInclusive` /
  `maxInclusive` on `NumericBand`), not a local scan. Explore defaults copy
  Standard. PPD 10% is an editable Explore chart preset, not a library
  classifier. Wind Chill has no Python category, so it has no default
  frostbite bands; WCT is the library result with no local applicability
  gate. EN Adaptive outdoor chart 10–30 °C is an axis, not
  `adaptive_en.t_running_mean_limits`. PHS Standard uses library `d_lim_*`
  vs the 8 h horizon
  and `phs.RECTAL_TEMPERATURE_LIMIT` / water-loss fractions; Explore t_re /
  water-loss fills are product presets.

`defineModel` is the public authoring API. Family modules (PMV, Adaptive)
may assemble with `ComfortModelBuilder` internally. Derived-humidity or
modifier-extra `kind: "quantity"` fields, unknown ChartTypes,
duplicate ChartType on one model, or a Time-series table without Time-series
capability fail `defineModel` / `assembleCatalogs`. Every input field must
declare SI min/max.

## Point session

Svelte 5 class in `createPointSession.svelte.ts`. Four buckets plus a
sibling calculation cache:

| Bucket | Holds |
| ------ | ----- |
| input | sparse `quantitiesByInput`, options, modifiers, Compare, unit system |
| chart | per-model ChartType, axes, baseline, Explore bands |
| setting | selected model, active surface, allowed models, pending model switch |
| output | loading / error |

Calculation cache belongs to the output bucket but is stored as `$state.raw`
on the class so Plotly-sized objects are not deeply proxied. Writes go
through `session.actions.*`. Pages consume `$derived` projections
(`inputPanel`, `chartBuild`, `chartControls`, `resultSections`, `isLoading`,
…) and do not read SI buckets.

`setting.allowedModelIds` is written by navigation from the current route. It
is not in the share snapshot. The route binds `onSelectModel` to the session;
the handler forwards to navigation (strip `?state=`, pending model switch).

`calculate` writes a per-model cache. Axis, band, unit, chart, and Explore
output changes rebuild from a ready cache.

## Charts

```text
calculate() once
  → resultsByInput (scalars) + small chartSource
        ↓
  Chart geometry in src/charts/ (or a remaining field-chart bind)
    declarations pass evaluate / bands / arrays
        ↓
  compact ChartPayload (generic arrays + axis titles)
        ↓
        ├─ assembleChart + prepareFigure(screen)      → Plotly.react
        └─ assembleChart + prepareFigure(publication) → Plotly.toImage
```

`src/charts/draw.ts` clones Plotly-owned arrays, remaps zone fills, and
applies screen vs publication theme. Export builds a separate publication
figure (explicit mm/pt/dpi); it does not capture the on-screen plot.

2-D Dynamic charts fill bands with isoline polygons from
`src/charts/isolines.ts`. Psychrometric humidity curves and isoline geometry
live in `src/charts/psychrometric/`. Declarations wire `evaluate` and band
thresholds; they do not solve isoline roots. Hover is Plotly closest on
Compare markers and data lines. 2-D field charts add one Plotly probe
scatter from `ChartBuildResult.hoverProbe` (not `ChartPayload`); the probe
follows the pointer and does not snap to Compare markers. Publication
export omits the probe. Do not add a 100² hover grid.

New reusable ChartType geometry goes under `src/charts/`, not
`src/engines/comfort/charts/`.

## Share

UTF-8 JSON → Base64URL → `?state=`. Pathname is identity (surface + standard
+ model). The query encodes **input + chart only** (`ShareStateSnapshot`
version 1). `output`, `selectedModel`, `activeSurface`, `allowedModelIds`,
`pendingModelSwitch`, derived humidity keys, and Time-series are not in the URL.

- Serialize sparsely: omit default model slices; omit unset quantity keys.
- Parse: missing known model → seed defaults; unknown key → reject.
- `quantitiesByInput` is a sparse map of known `PhysicalQuantityId` values;
  derived humidity keys are rejected and re-derived from `tdb`+`rh`.
- Adding a model does not require every existing URL to list that model.
- Wire model ids are kebab-case (`"pmv-ashrae"`).

Export Link copies on demand via `session.actions.exportShareUrl()`. The
address bar is not a live store. Changing model strips `?state=`.

## Authoring constraints

A Heat Index–class model is a `defineModel` declaration, one `ModelId`
member, and one registry line. Copy `heatIndex.ts`. The authoring unit is
one file with identity/inputs, calculation, and chart **parameters** (`type`
+ data spec). Do not write `spec.build`, Plotly, chart ids, or
`instanceId`. Selection key is `ChartType` (`selectedChartType`).
`library.label` / `library.description` fill metadata. `inputFields`
list quantities with required SI `minValue`/`maxValue` (optional `widget`);
default widgets come from `defaultFieldWidgetByQuantity`. Chart axes must
declare `rangeSi`. Classifier edges come from JS
`mapping.bins` / `compliance.bounds` via `bandsFromJsBins` /
`bandsFromJsBounds`, plus a token map — do not scan.

These are frontend catalog work, not declaration-only work:

- new ChartType
- new `PhysicalQuantityId` (and `SiUnit` if a new dimension)
- new modifier
- new Time-series session

Declarations do not import Plotly. UI, share, Compare, and the point session
do not branch on the new model id.

PMV ASHRAE and PMV ISO stay separate registered models. Adaptive ASHRAE and
EN stay separate. Family modules may keep calculation/zones/series `_core`
files; they do not own Plotly `build()`. PHS Worker and Time-series stay
out of the point-session declaration. Do not merge standards behind a runtime toggle.
