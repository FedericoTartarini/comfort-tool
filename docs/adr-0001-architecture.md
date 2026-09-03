# ADR-0001 · CBE Thermal Comfort Tool rewrite: stack and architecture baseline

- Status: consensus reached (2026-09-03)
- Scope: v1 (target 2026-10-01), and long-term maintenance thereafter
- Supersedes: the prototype repository `main repo/comfort-tool` (Svelte 5, about 49k lines). The prototype is unmaintainable because of excessive layering; **no code is reused, only verified behaviour is borrowed**.
- Companion: the `typescript` branch of the `jsthermalcomfort` fork (the calculation library; TypeScript, its build output consumed through a symlink, developed in parallel with this project). Section 4 also gives the library's public interface contract.
- Revision 2026-09-03: narrowed the library / app boundary per the test in §3 (§3, §4.1, §4.3, §5); `epsilon` changed to PMV residual (§1, §2, §4.7). Second round: limits are a source in the library, not a mirror; standard membership moves into the library (§4.1.2); closed sets become `as const` object collections (§4.0, §4.2); operative mode uses the `t_o` quantity and `psychrometricZone.trFollowsDb` (§4.1.4, §4.4, §4.5); quantity names come only from `Quantity.label` (§6).

---

## 1. Background and constraints

| Item | Fact |
|---|---|
| Team | v1 is built by 1 person (equally familiar with React 19 / Svelte 5); 1 researcher with a strong Python background does review; the maintainer three years from now is most likely a Python-background researcher plus the open-source community |
| Way of working | AI writes most of the code; humans only do architecture and review |
| Time | Deliver v1 before 2026-10-01; v1 is the full feature set, implemented in phases, not scheduled by week |
| Backend | None. Pure static SPA, deployed to Netlify first |
| Calculation library | Fork of the `typescript` branch of `jsthermalcomfort`, ported from `pythermalcomfort`; the library contains only models and their **generic** properties (name, description, classification scale, applicability limits), and no field that exists only for this tool; the app calls the library in SI only; **no adapter layer**: the frontend is developed directly against the interface in section 4 |
| Interaction | Change one input and the chart follows immediately; Standard / Explore have no calculate button; Time-series does |
| Reference precision | The old tool's comfort zone is boundary root-finding: one line per 10% RH, PMV residual 0.001 (the comment in `static/js/psychchart.js` says "ta precision", but it is actually a PMV residual) |
| Browsers | Full experience in modern browsers; **very old browsers must still be able to open a link and see the prefilled inputs** |
| Visuals | Redesign is allowed; keep the three-column information architecture (left navigation / centre inputs / right results + chart); no dark mode in v1 |
| Testing | Before v1, unit tests for pure functions only; UI / e2e / visual tests after v1 |
| Analytics | One-line Google Analytics script, recorded by path |
| Open source | Public, MIT, PRs accepted |
| Precision display | Uniform across the project: at most two decimals, trailing zeros not shown |

---

## 2. Decision summary

| Area | Decision | Main reason | Rejected alternatives |
|---|---|---|---|
| Framework | **Svelte 5 (runes only) + Vite 8 + TypeScript 6** | Single developer equally familiar with both frameworks, so React's only decisive advantage (the reviewer knowing only React) does not hold; less code, and `$state / $derived` naturally fit live updating; the prototype can serve as a reference for hard spots; the official Svelte MCP + autofixer are already available | React 19; SvelteKit (no backend, and Kit 3 is mid-migration in RC) |
| Routing | **sv-router 0.18**, all usage wrapped in `routes/navigation.ts` | Typed routes, maintained, already used by the prototype; the 0.x risk is isolated to one place | Hand-written; `@keenmate/svelte-spa-router` |
| UI | **shadcn-svelte + Bits UI + Tailwind 4**; utility classes are allowed **only** in `ui/primitives/` (CLI-generated, never hand-edited) and `ui/layout/` (`Stack / Grid / Inline`, gap becomes props); a utility class in any other directory is a lint error | Ready-made controls + consistent spacing (Mantine feel), the most stable AI output, and the code belongs to the project | Carbon Components Svelte (IBM visuals, 0.x); Bits UI + hand-written CSS |
| State | Runes classes in `.svelte.ts`, **no state library**; the address bar reflects only the path, the share payload is generated only on Export Link | Simple and readable; the prototype's approach | Live address-bar sync |
| Charts | **plotly.js 4.0** (`plotly.js-cartesian-dist-min`, dynamically imported on demand; native TS types); our own `PlotlyChart.svelte` using `{@attach}`; chart components receive only a "chart spec" and know nothing about models | Zoom and similar interactions; 4.0 exports types natively | 3.x; `svelte-plotly.js` (no Svelte 5 version) |
| Computation | A single Web Worker + **Comlink**; the main thread discards stale results by sequence number; library model functions are called only inside the Worker | Readability first | Hand-written postMessage protocol; Worker pool |
| Precision | Standard compliance zone: **boundary root-finding** (RH every 5%, PMV residual 0.001, secant method falling back to bisection, saturation line every 0.5 °C); Explore field chart: **100×100 grid**, the same for all models | Same origin as the old tool and finer; keep the old chart while PHS takes about 2.4 s | Grid everywhere; adaptive refinement |
| Forms | No form library, no Zod; `bind:value` + the range validation the library provides | The library already provides hard ranges | — |
| Validation | Outside the hard range: mark red, do not compute, keep the previous valid value | The library provides only this one set of ranges | Two-level ranges |
| Links | **`?share=v1.<Base64URL(JSON)>`**; Time-series is `?share=v1z.<Base64URL(deflate)>` (`fflate`); version prefix + `migrate()`; on parse failure fall back to defaults and notify | Not compressing keeps it decodable by the ES5 summary page | `?s=` (abbreviation violates the naming rules); `#share=`; compatibility with old Berkeley links (not needed) |
| Browsers | Full app floor Chrome 87 / Firefox 83 / Safari 14 (Svelte 5's hard floor); `index.html` embeds an ES5 feature check, older browsers render a **read-only summary page**; Tailwind 4's floor is 2023, 2020–2023 browsers are "usable but imperfectly styled" | Satisfies "very old browsers can open and see prefilled inputs" | Tailwind 3.4; polyfill plugin |
| Analytics | One line of gtag; send `page_view` manually on path change; `page_location` strips the query string | Do not send the share payload to Google | Consent banner |
| Engineering | pnpm, TS `strict` + `erasableSyntaxOnly` + `verbatimModuleSyntax`, ESLint flat + Prettier, Node 24, GitHub Actions (typecheck + lint + build), Netlify PR previews, UI copy centralised in one dictionary module (English only in v1) | — | TypeScript `enum` (non-erasable syntax) |

### 2.1 plotly.js 4.0 changes to watch

- The colour library is now culori: fractional `rgb()` and `hsv()` are no longer accepted; the fourth argument of `rgb()` is now alpha. The project uses hex colours + `rgba()` throughout.
- Chart Studio related `config` properties are removed, and the "Upload to Cloud" button is shown by default: set `config.showSendToCloud = false` and trim the modebar.
- MathJax v2 is no longer supported (not used in this project).
- hover / click events return real data values.
- 4.0 exports TypeScript types natively; `@types/plotly.js` is no longer installed.

---

## 3. System boundary: library vs app

**The test (consensus 2026-09-03): would pythermalcomfort ship it?** `jsthermalcomfort` is its port, and its audience is researchers and arbitrary tools. Anything where "another tool with a completely different design would need exactly the same value for the same model" belongs to the library; anything that might differ from one tool to the next belongs to the app.

| Library (`jsthermalcomfort`, fork `typescript` branch) | App |
|---|---|
| Quantity definitions `io.quantities`: key, kind, label, SI/IP unit **symbols** | Display units and SI↔IP conversion (°C↔°F, m/s↔fpm), input step, display formatting (two decimals, trailing zeros stripped) |
| Model functions and `io` wrappers; the name, description, **standard membership** (`model.standard`), classification scale (`tsv`, `offsets`) and **applicability limits** (min/max prescribed by the standard, `reference/` data, the single source) attached to the model function | Input order, default values, options and their copy, result table columns (`table`), the state and switching of entry groups (humidity / temperature) |
| Unified output `Measure { quantity, value, unit, category, intervals }` (§4.1.3) | Compliance decision = interpretation of `Measure.category` / `intervals`; Explore's editable Bands |
| Comfort-zone geometry: `charts.psychrometricZone` (boundary root-finding, including `trFollowsDb` for operative mode), `charts.adaptiveAshraeZone` | Grid scan, `ChartSpec`, legend, colours, viewport clipping, all Plotly specs |
| The formulas behind input calculators (`clo_dynamic`, `v_relative`, `running_mean_outdoor_temperature`, solar gain, globe temperature…) | Which model offers which calculator button (declaration file) |
| Psychrometric functions (dew point / wet bulb / humidity ratio / vapour pressure ↔ RH, operative temperature) | Path segments for standards (`core/standard.ts`, keyed by the library's `reference.standards` objects), model-switching rules, share links, unit switching, UI |
| Sequential simulation of stateful models (PHS, after v1) | Time-series row editor and session |
| Out-of-range inputs return results + warnings instead of throwing; no DOM / `node-fetch` dependency, runs in a Worker | — |

Two explicitly stated exceptions:

- **Unit conversion lives in the app.** "The app never implements a formula" is about comfort formulas and thresholds; display conversions such as °C↔°F are a presentation concern, and the app's IP display unit (fpm) differs from the library's IP call unit (fps) anyway. The app calls the library in SI only; the library's `ipUnit` strings and `units_converter` are its own calling convention, which the app does not read.
- **The library carries no field that "exists only for this tool".** No `step`, `defaultValue`, `OptionSpec`, route path segments, or `ModelDefinition` registry. Those all belong to the app's declaration files or `core/` (§4.2 / §4.3).

Convention: the library's **model functions** (the `jsthermalcomfort` root, `jsthermalcomfort/models`) are imported only in `src/models/` (binding `run`, reading metadata) and `src/workers/` (the actual call); lint blocks anything else. The `io` / `psychrometrics` / `reference` / `charts` subpaths can be imported anywhere, because `io.quantities` is the single definition of the quantities; the model wrappers in `io` are **called** only in the worker, and this rule relies on convention rather than lint.

---

## 4. Core contracts

### 4.0 Three rules that run through the whole project

1. **One definition, referenced everywhere.** Quantities, models, workspaces, chart types, unit systems and so on are objects; code references them with dot access (`io.quantities.tdb`, `workspace.explore`), not string keys and not `Record<string, …>` dictionaries. `Quantity.kind` is a string union type exported by the library; the app treats it as a typed discriminant (`core/units.ts` looks up the display-unit table by kind, and `satisfies Record<QuantityKind, …>` guarantees exhaustiveness), which does not count as a string key.
2. **Strings appear only at two boundaries.** The library-internal `Quantity.key` (such as `"tdb"`) and share-link serialisation. The former is read only by the library, by `core/libraryInputs.ts` (which assembles the library's init object from `Quantity.key`, and is the library boundary) and by `shareLink.ts`; the latter is confined to `shareLink.ts`.
3. **Erasable syntax.** No `enum`, `namespace`, or constructor parameter properties. Closed sets are plain `as const` object collections plus a union type derived from them, the same style as the library's `quantities`; behaviour is written as plain functions, with no class hierarchies and no `switch` scattered everywhere.

### 4.1 The library's public interface (contract)

The library already has four layers: `models` / `reference` / `io` / `charts`. Only the parts the app depends on are listed below. **Phase 1 adds four things: applicability-limit data (source, not mirror), standard membership, the two missing quantities, and `trFollowsDb` on `psychrometricZone`.** Everything else already exists.

#### 4.1.1 Quantities (`jsthermalcomfort/io`, existing)

```ts
export type QuantityKind = "temperature" | "airSpeed" | "percentage" | "metabolicRate"
                         | "clothingInsulation" | "thermalSensation" | "pressure";   // pressure is new, for p_atm
export interface Quantity { readonly key: string; readonly kind: QuantityKind; readonly label: string;
                            readonly siUnit: string; readonly ipUnit: string; }        // units are just symbol strings
export const quantities = { tdb, tr, v, vr, rh, met, clo, wme, t_running_mean, pmv, ppd, tmp_cmf,
                            /* added in Phase 1 */ t_o, p_atm } as const;
```

The app **does not redeclare quantities**; after `import { io } from 'jsthermalcomfort'` it references `io.quantities.tdb` with dot access. `siUnit` / `ipUnit` are the library's own calling convention; the app reads only `label` and `kind`, and display units are looked up by kind in `core/units.ts`. Whenever a model is added, any missing quantity is one added line in the library.

#### 4.1.2 Reference data (`jsthermalcomfort/reference`)

- Classification scales, existing: `isoThermalSensation` / `ashraeThermalSensation` (`IntervalScale`, `classify()` / `labelFor()`), `adaptiveAshraeOffsets` / `adaptiveEnOffsets`, `enCategoryPmvLimits`.
- **Applicability limits, new in Phase 1**: one table per standard, keyed by `Quantity` objects, `readonly { quantity, min, max }[]`. **The table is the single source**: compliance functions read min/max from the table, and warning copy is templated from the table, with no separate copies. Attached to the model function: `pmv_ppd_iso.limits`, `adaptive_ashrae.limits` (including `t_running_mean` 10..33.5), the same pattern as `label` / `tsv`.
- **Standard membership, new in Phase 1**: `reference.standards = { iso7730, ashrae55, en16798 }`, each a plain `{ id, name }` object; `pmv_ppd_iso.standard = standards.iso7730`. Models without a `standard` (UTCI) appear only in Explore. The existing `utilities.Standard` in the library is the compliance dispatch key (including `FAN_HEATWAVES`, `ANKLE_DRAFT`), which is not this; the names must stay distinct.

#### 4.1.3 Unified inputs and outputs (`jsthermalcomfort/io`, existing)

```ts
io.pmvPpdIso({ tdb, tr, vr, rh, met, clo, units: "SI" })   // → PmvPpdIsoOutputs
  .toMeasures()   // Measure[]: { quantity, value, unit, category?, intervals }
  .warnings       // readonly string[]
```

- The field names of the input object are exactly `Quantity.key`, so `Map<Quantity, number>` → init is a one-line `Object.fromEntries`, done in the app's `core/libraryInputs.ts`.
- Classification is not a separate output: `Measure.category` is the scale label the value falls into (PMV's tsv), and `Measure.intervals` are the evaluated comfort intervals and whether each is satisfied (Adaptive's 80% / 90%). **Compliance decision = the app's interpretation of these two fields**; the Compliance column of the result table displays them directly.
- The model function carries `label` / `description` / `standard` / `tsv` or `offsets` / `limits`; declaration files read from here and never write copy or transcribe numbers.

#### 4.1.4 Chart geometry (`jsthermalcomfort/charts`, existing)

`psychrometricZone({ tr, vr, met, clo, pmvLimit, rhStep, saturationStep, epsilon, correctKnownDefects, trFollowsDb })` returns the `polygon` vertices; `adaptiveAshraeZone()` returns the upper and lower boundaries for each acceptability level. All SI, unclipped, uncoloured. `epsilon` is the PMV residual, not a temperature tolerance. `trFollowsDb` (new in Phase 1) makes `tr = db` follow along the x axis while solving; this is the geometry of the operative-mode psychrometric chart, and it is exactly how the old tool's psychtop chart was computed. Without it, the compliance zone in operative mode is wrong.

#### 4.1.5 Things the library does not have and should not have

`Unit` / `step` / `toSi` / `fromSi`, `defaultValue`, `OptionSpec` / `OptionValue`, route path segments for standards, `InputSpec` / `OutputSpec` / `Band`, `ModelDefinition` and the `models` registry, `QuantityValues`, `InputCalculator` applicability, `evaluateMany`. They are either presentation-layer decisions (§4.2 / §4.3) or duplicates of types the library already has.

Where the old tool's input-panel button group belongs: `Create custom ensemble / Dynamic predictive clothing / Solar gain / Globe temp / Set pressure` → app-side input calculators whose formulas call the library; `Relative air speed / Local control` → options in the declaration file; `Local discomfort` (ankle draft, vertical temperature difference) only produces outputs and does not change inputs → enters the library as an ordinary small model, available in Explore; `Reset / Save / Reload / Share / SI-IP / Documentation` → app actions. The semantics of an input calculator are a **one-shot Apply**: the user fills in the calculator's own small inputs, clicks Apply, and the result is written into the target input; calculators do not enter the session state or the share link.

### 4.2 App-side closed sets

The same style as the library's `quantities`: `as const` object collections + derived union types + plain functions. No classes.

```ts
// src/core/workspace.ts
export interface Workspace { readonly id: string; readonly pathSegment: string; readonly title: string; }
export const workspace = {
  standard:   { id: 'standard',    pathSegment: 'standard',    title: 'Standard' },
  explore:    { id: 'explore',     pathSegment: 'explore',     title: 'Explore' },
  timeSeries: { id: 'time-series', pathSegment: 'time-series', title: 'Time-series' },
} as const satisfies Record<string, Workspace>;
export function isWorkspaceAvailable(target: Workspace, model: RegisteredModel): boolean {
  if (target === workspace.explore) return true;                            // every model has Explore (at least the dynamic chart)
  if (target === workspace.standard) return model.model.standard !== undefined;   // the library's model.standard
  return model.timeSeries;
}
export function workspaceFromId(id: string): Workspace | undefined;        // used only by shareLink / navigation
// Same style: chartType.psychrometric / .dynamic; humidityMode.rh / .humidityRatio / .dewPoint / .wetBulb / .vaporPressure;
//          unitSystem.si / .ip; entryGroup.humidity / .temperature

// src/core/entryModes.ts — the temperature representation decides which quantities the panel shows and which one is the temperature axis; labels always come from Quantity.label
const q = io.quantities;
export const temperatureMode = {
  separate:  { id: 'separate',  panel: [q.tdb, q.tr], axis: q.tdb },
  operative: { id: 'operative', panel: [q.t_o],       axis: q.t_o },
} as const;

// src/core/standard.ts — adds only the app-specific path segment; the standard itself is the library's reference.standards object
export const standardPath = [
  { standard: reference.standards.ashrae55, pathSegment: 'ashrae-55' },
  { standard: reference.standards.iso7730,  pathSegment: 'iso-7730' },
  { standard: reference.standards.en16798,  pathSegment: 'en-16798' },
] as const;
export function pathSegmentFor(standard: StandardRef): string;
export function standardFromPath(segment: string): StandardRef | undefined;

// src/core/units.ts — display units. Conversion formulas live here (the §3 exception); looked up by Quantity.kind, satisfies Record<QuantityKind, …> guarantees exhaustiveness
export interface DisplayUnit { readonly symbol: string; readonly step: number; toSi(v: number): number; fromSi(v: number): number; }
export function displayUnitFor(quantity: Quantity, unitSystem: UnitSystem): DisplayUnit;
// temperature → °C 0.1 / °F 0.1; airSpeed → m/s 0.05 / fpm 10; percentage → % 1; metabolicRate → met 0.1;
// clothingInsulation → clo 0.1; thermalSensation → unitless 0.1; pressure → kPa 0.1 / inHg 0.01
```

### 4.3 Model declaration (app side, one object literal, one file)

```ts
// src/models/pmvIso.ts
import { io, pmv_ppd_iso } from 'jsthermalcomfort';   // a declaration file may reference library models: to bind run and read metadata. Calls happen only in the worker
const q = io.quantities;
export const pmvIso = defineModel({
  run: io.pmvPpdIso,                                   // the library's io wrapper; the worker calls it
  model: pmv_ppd_iso,                                  // label / description / standard / tsv / limits are read from here
  inputs: [                                            // order + default values (the starting values of the old CBE tool), one table
    [q.tdb, 25], [q.tr, 25], [q.v, 0.1], [q.rh, 50], [q.met, 1.1], [q.clo, 0.5],
  ],
  entryGroups: [EntryGroup.humidity, EntryGroup.temperature],
  charts: [
    DynamicChart.withDefaultAxes(q.tdb, q.v),          // every model has this
    PsychrometricChart.withZone(q.pmv),
  ],
  table: [q.pmv, q.ppd],                               // required: result table columns, also the selectable outputs in Explore
  timeSeries: true,
});
// src/models/index.ts
export const registeredModels = [pmvIso, adaptiveAshrae, utci] as const;   // registration is this one line only
```

Rules: every model has the Explore capability by default; the Standard capability is decided by whether the library's `model.standard` exists, and the app no longer declares it; the Time-series capability is decided by `timeSeries`. **Adding a model = the library fills in that model's quantities / limits / standard + one declaration file + one registry line, zero other files change.** Options (such as `airspeed_control`) are added to the declaration file when needed; the two v1 models have no options. Panel labels, table headers and axis labels always come from `Quantity.label`; the declaration file contains no quantity names at all.

Result table (`table`):

- There is only one table style (the prototype's design): uppercase small-font header; horizontal scroll when there are many columns; with Compare on, one row per slot, and Baseline decides which row the difference highlighting is relative to.
- The columns are fixed in three sections: **Input** (slot name, coloured with the slot colour, always the first column) → **Compliance** (appears only when the model's `Measure` carries `category` or `intervals`; shows the label the value falls into, coloured as pass / fail) → **the library outputs listed in the model file's `table`**, in declaration order, values formatted per §4.6 and following the unit system.
- `table` is required; outputs not listed are not shown and are not offered in Explore's output selection.

### 4.4 Chart types (closed set, v1)

| Type | Definition |
|---|---|
| `chartType.psychrometric` | x = `temperatureMode.axis` (`tdb` under separate, `t_o` under operative), axis label from `Quantity.label`; y = humidity ratio; RH isolines; compliance-zone polygon (`psychrometricZone`, with `trFollowsDb: true` under operative); marker points for the three slots |
| `chartType.dynamic` | x / y are selectable quantities (under operative, `t_o` is offered and `tdb` / `tr` are not); banded contour surface (100×100 grid); marker points; **every model gets it by default**. Adaptive renders with it: locked axes `t_running_mean × t_o`, output is the interval of the acceptability level |

Parametric curve charts (SET outputs, heat loss) and time-series line charts are added to the chart library first and then referenced by models, when needed. `PlotlyChart.svelte` receives only a `ChartSpec` (a restricted subset of traces / layout / shapes) and imports no model.

Legend rules:

- **There is exactly one legend per chart, always placed below the chart.** Plotly's built-in legend is off (`layout.showlegend = false`); the prototype's two sets of legends, "one inside the chart, one below it", are not allowed.
- Legend entries are part of the `ChartSpec`: `ChartSpec.legend: readonly LegendEntry[]`, `LegendEntry { label, swatch: Swatch.fill | Swatch.line | Swatch.marker, color }`. They are produced by the chart type's spec-generating function; `ChartLegend.svelte` only renders them and knows nothing about models.
- When exporting an image, the same `legend` entries generate Plotly's horizontal bottom legend (enabled only in the export layout), so that the screen and the export match.

### 4.5 Session state

```ts
class Session {                                        // shared by Standard + Explore; Time-series has its own separate session
  workspace: Workspace; standard?: StandardRef; model: RegisteredModel;   // StandardRef is a member of the library's reference.standards
  unitSystem: UnitSystem;                              // display layer only
  compare: { enabled: boolean; activeSlot: Slot; baselineSlot: Slot };
  slots: readonly [InputSlot, InputSlot, InputSlot];
  chartByModel: Map<RegisteredModel, ChartState>;      // each model remembers its own chart settings
  environment: { atmosphericPressure: number };        // "Set pressure"; affects humidity conversion
}
class InputSlot {
  values: SvelteMap<Quantity, number>;                 // canonical SI; cross-model superset bag (restored automatically on switching back); excludes rh; stores t_o under operative, tdb / tr under separate
  humidity: { mode: HumidityMode; value: number };     // the quantity the user entered is the truth
  temperature: { mode: TemperatureMode };
  options: SvelteMap<OptionSpec, OptionValue>;         // OptionSpec is an app type, supplied by the declaration file; the two v1 models have no options
}
class ChartState {
  type: ChartType; axes: { x: Quantity; y: Quantity }; output: Quantity;
  bandsByOutput: Map<Quantity, Band[]>;                // Explore thresholds; defaults derived from the library's IntervalScale (e.g. pmv's tsv); outputs without a scale get default Bands from the declaration file
}                                                      // no "show zones" toggle: compliance zones and bands are always drawn
class Outputs { perSlot: readonly (ModelResult | null)[]; grid: GridResult | null; stamp: number; }   // derived, never persisted
```

Rules:

- **The quantity the user entered is the truth.** Humidity is stored as the original value in `humidity`; `rh` is derived by the pure function `toLibraryInputs(slot, model, environment)` from the current `tdb` and atmospheric pressure before sending to the Worker (changing `tdb` keeps the dew point and changes RH, consistent with the old tool); when switching representation, the current value is converted into the new representation. Under `temperatureMode.operative` the slot stores `t_o`, and `toLibraryInputs` expands it to `tdb = tr = t_o`; on a mode switch the value is converted: separate → operative uses the library's `psychrometrics.t_o(tdb, tr, v)`, operative → separate sets `tdb = tr = t_o`.
- `toLibraryInputs` also handles `v → vr`: the PMV panel shows `v`, the library needs `vr`. Whether `v_relative(v, met)` is applied is model behaviour, specified by the declaration file and determined by checking against the old tool.
- Outputs are derived entirely from Inputs + Chart, observed and written by `state/compute.svelte.ts`; transient UI state does not enter the Session.
- Switching models: parameters for the same quantity are kept; parameters outside the new model's hard range open a dialog (title "Boundary Range Warning", a table Input / Current / Allowed range, buttons "Yes, switch and adjust" / "No, stay here"); no dialog when nothing is out of range; all three slots are handled the same way.
- Explore thresholds: an ordered list of `Band`s, lower bound inclusive, upper bound exclusive, gaps uncoloured; the editor has Add band / Reset / delete; saved per (model, output) and included in the link; colours are assigned by the app from a fixed palette by interval position, and are editable.

### 4.6 Units and number display

- **Canonical stored state is always SI**, and the library is always called in SI (even though the library supports IP, that path is not taken, guaranteeing a single path).
- Switching to IP: the input box shows `displayUnitFor(quantity, unitSystem.ip).fromSi(si)`; when the user edits in IP: parse → `toSi` → store. The stored value keeps full precision and only the display text is formatted; therefore switching SI ↔ IP back and forth does not drift.
- Ranges, default values and chart axis labels are likewise converted at the display boundary.
- The step comes from the `DisplayUnit.step` of the **currently displayed unit**.
- Conversion formulas live in `core/units.ts`, the exception explicitly stated in §3; the library's `units_converter` is not used.
- One formatting function for the whole project: at most two decimals, trailing zeros stripped (`26.0 → 26`, `0.51 → 0.51`, `78.80 → 78.8`).

### 4.7 Computation pipeline

`Session change → toLibraryInputs → compute.worker (Comlink) → model.run / charts.psychrometricZone / grid scan → Outputs (with stamp, stale ones discarded) → ChartSpec → PlotlyChart`

- Zone boundary: one line per 5% RH (21 lines), PMV residual `epsilon` 0.001, secant method falling back to bisection on failure, saturation line every 0.5 °C.
- Grid: 100×100; cache key = model + output + non-axis parameters (dragging an axis parameter does not recompute); keep the old chart while computing, show "computing" after >300 ms.
- Library benchmarks (prototype fork, V8): PMV in still air 1.7 µs per call; PMV with cooling effect 43 µs; UTCI 0.5 µs; PHS (480 min) 244 µs → 100×100 about 20 ms / 0.43 s / 5 ms / 2.4 s respectively.

### 4.8 Share link schema v1

`?share=v1.<Base64URL(JSON)>`

```json
{ "workspace": "explore", "standard": null, "model": "pmv_ppd_iso",
  "unitSystem": "SI",
  "compare": { "enabled": true, "active": 0, "baseline": 0 },
  "environment": { "p_atm": 101.325 },
  "slots": [
    { "values": { "tdb": 26, "tr": 25, "v": 0.1, "met": 1.0, "clo": 0.51 },
      "humidity": { "mode": "rh", "value": 50 }, "temperature": { "mode": "separate" },
      "options": { "airspeed_control": "with_local_control" } },
    null, null ],
  "chart": { "type": "dynamic", "axes": { "x": "tdb", "y": "v" }, "output": "pmv",
             "bands": [ { "label": "Cold", "min": null, "max": -2.5, "color": "#1f5fa8" } ] } }
```

- Carries only the current model's chart settings and the quantities declared by the current model; all ids come from each collection object's `.id` / `Quantity.key`, and decoding goes through each collection's `xxxFromId()` function; this is the only file in the app that turns objects into strings and back.
- The Time-series route uses `?share=v1z.<Base64URL(deflate(JSON))>` and includes `rows`; the ES5 summary page decodes only `v1.`, and shows "time-series data omitted" for `v1z.`.
- On parse failure fall back to defaults and notify, never a blank page; when the schema changes, write `migrate(v_old → v_new)`.

### 4.9 Time-series (not phase one)

The input is a table editor of "segment N + duration in minutes" (rows added one at a time), isolated from the Compare slot concept; stateless models are evaluated row by row, stateful models (PHS) call the library's `sequentialSimulation`; upper limit 200 rows; an explicit "Calculate" button; a separate session.

---

## 5. Directory layout and boundaries

```
src/
  core/                 plain TS; ESLint forbids importing svelte / state / ui
    workspace.ts  chartType.ts  unitSystem.ts  entryModes.ts   closed sets (as const objects + plain functions)
    standard.ts           library reference.standards object → path segment
    modelDeclaration.ts   defineModel + RegisteredModel
    libraryInputs.ts      toLibraryInputs(slot, model, environment): entry groups → library inputs (Map → init, v → vr, t_o → tdb = tr)
    numberFormat.ts       two decimals, trailing zeros stripped
    units.ts              display units: symbol, step, SI↔IP conversion (§3 exception)
    shareLink.ts          encode / decode (migrate arrives with v2)
    charts/   chartSpec.ts (includes LegendEntry)  psychrometricChart.ts (calls charts.psychrometricZone)  dynamicChart.ts (100×100 grid)
  models/               one declaration file per model + index.ts; the only directory on the main thread that may reference library model functions
  state/                session.svelte.ts  compute.svelte.ts  timeSeriesSession.svelte.ts
  workers/              compute.worker.ts (the only place that calls library model functions)
  ui/
    primitives/         shadcn-svelte generated; Tailwind allowed; never hand-edited
    layout/             Stack.svelte  Grid.svelte  Inline.svelte; Tailwind allowed
    inputs/  outputs/ (ResultTable.svelte)  charts/ (PlotlyChart.svelte  ChartLegend.svelte)  dialogs/   business components; utility classes forbidden
  routes/               page composition; navigation.ts (the only place sv-router is used)
  text/                 UI copy dictionary (English only in v1)
  app.css               Tailwind @theme tokens (a limited spacing / font scale)
index.html              embedded ES5 feature check + read-only summary page
```

---

## 6. Coding conventions

- **Naming**: components `PascalCase.svelte`; modules `camelCase.ts`; functions start with a verb; consistent vocabulary `dynamic chart`, `chart type`, `model`, `session`, `slot`, `workspace`; `engine / manager / helper / utils` are forbidden as file names; quantity keys use the library's naming verbatim, no other abbreviations. **The display name of a quantity always comes from `Quantity.label`**; the app never writes one. The old tool's "Air temperature" is the wrong term and is not carried over; the correct one is the library's "Dry-bulb air temperature", and changing the spelling means changing the library in one place only.
- **Types first**: closed sets are `as const` object collections; quantities, models and standards are all imported from the library and referenced with dot access; types are derived from data (`as const`, `satisfies`); no magic strings and no loose dictionaries; renaming something changes one place only.
- **Granularity**: one concept per file, 100–400 lines is normal; plain functions + data objects over class hierarchies; no abstractions reserved for "maybe later"; do not split logic into a large number of tiny methods.
- **Svelte guardrails**: runes only; ESLint forbids `export let`, `$:`, `on:`, `<slot>`, `<svelte:component>`; third-party library integration uses `{@attach}`; cross-component shared state is a class with `$state` fields; `$effect` is for external synchronisation only.
- **TypeScript guardrails**: `strict`, `erasableSyntaxOnly`, `verbatimModuleSyntax`; no `enum`, `namespace`, or constructor parameter properties.
- **AI workflow**: enable the Svelte MCP in every session; generated `.svelte` files must pass `svelte-autofixer`; PRs must pass typecheck + lint + build.

---

## 7. Phase-one scope and acceptance criteria

Scope: the two models **PMV (ISO 7730)** and **Adaptive (ASHRAE 55)**; Standard + Explore; Compare with three slots; SI/IP; model-switch dialog; Explore threshold editor; Export Link; simple export (editable title + input summary + tool name/version/date footer, PNG + SVG).

Acceptance:

1. Add **UTCI** as the third model: only one new declaration file + one registry line, zero changes to other files, and it appears only in the Explore navigation (no `standard` attached in the library).
2. Export Link from any state → open in a new tab → the state is fully identical (three slots, units, chart type, thresholds, atmospheric pressure).
3. The vertices of the PMV psychrometric-chart compliance zone differ from the old tool's vertices for the same inputs by ≤ 0.01 °C.
4. Switching to a model with incompatible ranges shows a dialog whose content matches the design mock-up; no dialog when nothing is out of range.
5. Opening a share link in an environment with `Proxy` disabled, the summary page lists all input values.
6. After switching SI → IP → SI, the stored values are unchanged; every displayed number has at most two decimals and no trailing zeros.
7. The result table columns are determined entirely by the model's declared `table` (`table` is required, and UTCI declares it too); any chart has exactly one legend, below the chart, and Plotly's built-in legend never appears.
8. Lint passes: no utility classes out of bounds, no legacy syntax, no out-of-bounds imports in `core/`, no `enum`.
9. Unit test coverage: `shareLink` encode/decode and migration, `toLibraryInputs` (5 humidity representations, operative mode), `numberFormat` and unit conversion, model-switch inheritance and clamping rules.

---

## 8. Known risks and mitigations

| Risk | Mitigation |
|---|---|
| Library and app developed in parallel, interface drift | Section 4.1 is the contract; the library ships rolling `0.x` releases and the app pins the version; interface changes go into this document first |
| sv-router 0.x API changes | All usage wrapped in `routes/navigation.ts` |
| Tailwind 4 styling imperfect in 2020–2023 browsers | Accepted; functionality is complete; older browsers get the summary page |
| plotly 4.0 just released | Only the cartesian subset is used; colours are uniformly hex + `rgba()`; cloud button turned off |
| PHS grid about 2.4 s | Keep the old chart + "computing" indicator |
| LLM output for Svelte 5 regresses to Svelte 4 syntax | Lint forbids it + autofixer enforces it |
| Single developer | Architecture first; phase one uses two models + the UTCI acceptance test to prove "adding a model changes one place" |

---

## 9. References

- Svelte 5 browser support floor: https://svelte.dev/docs/svelte/browser-support
- Tailwind 4 compatibility: https://tailwindcss.com/docs/compatibility
- shadcn-svelte with Tailwind 4 / Svelte 5: https://shadcn-svelte.com/docs/migration/tailwind-v4
- SvelteKit 3 RC (the basis for not choosing Kit): https://svelte.dev/blog/sveltekit-3-release-candidate
- plotly.js 4.0 migration guide: https://plotly.com/javascript/guides/migrating-to-v4/
- TypeScript `erasableSyntaxOnly`: https://www.totaltypescript.com/erasable-syntax-only
- Existing calculation library (benchmark subject): https://www.npmjs.com/package/jsthermalcomfort
- Old tool source (origin of the boundary root-finding precision, `static/js/psychchart.js`): https://github.com/CenterForTheBuiltEnvironment/comfort_tool
- Bits UI: https://www.npmjs.com/package/bits-ui · sv-router: https://www.npmjs.com/package/sv-router · Comlink: https://www.npmjs.com/package/comlink · plotly cartesian bundle: https://www.npmjs.com/package/plotly.js-cartesian-dist-min
