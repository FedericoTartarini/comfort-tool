# Comfort Tool — Architecture & Simplification Brief

**Date:** 2026-06-29
**Audience:** the developer who will implement these changes (and the AI assisting them).
**Status:** brainstorm + specification. No code has been changed to produce this document.

This brief supersedes `26-05-11-review-federico-overall.md`. That older review proposed a
"one file per model" refactor — **that refactor is already done** (models live in
`src/comfortModels/`). This document describes what to do *next*. The older file's small
fixes (strict mode, wind-chill formula, etc.) are still valid and are carried forward in
the last section; you can delete the old file once those are addressed.

---

## 1. Goal in one paragraph

Keep the tool simple to maintain and extend. A user picks **one model** (from
`jsthermalcomfort`, which we maintain), enters inputs on the **left**, and sees **results
top-right** and a **chart bottom-right**. Adding a new model should mean writing one
focused file, not wiring code across layers. On top of that, the tool should support
different ways of using a model: **Compliance**, **Explore**, and (later) **Time-series** —
plus optional **input sub-tools** (e.g. solar gain) that adjust inputs for any model that
wants them.

---

## 2. What is already correct — do not "fix" these

These were either already done or already work the way we want. Touching them is wasted
effort and risk.

- **One file per model.** `src/comfortModels/{pmv,adaptive,utci,heatIndex,humidex,windChill}.ts`
  each own their calculation, zones, result rows, charts, and config. Good.
- **Input persistence across model switches.** `inputsByInput` in
  `src/state/comfortTool/createComfortToolState.svelte.ts` is a single canonical store in
  **SI units**, shared by all models. Set temperature = 25 in PMV, switch to Heat Index,
  and the 25 persists; clothing simply stops being *displayed*. This is the exact behaviour
  we want — it already exists.
- **Layout.** `src/views/ComfortDashboard.svelte` is already input-left / results-top-right /
  chart-bottom-right.
- **The builder pattern.** `ComfortModelBuilder` in
  `src/state/comfortTool/modelConfigs/builder.ts` is a reasonable way to register a model.
  Keep it; we will extend what a model declares (§5), not replace it.
- **The simple models are the template.** `heatIndex.ts`, `humidex.ts`, `windChill.ts`
  are all ~250–300 lines and easy to read. They prove the architecture is sound. The goal
  is to make PMV and Adaptive look more like them.

---

## 3. The real problem: PMV (1,254 lines) and Adaptive (1,872 lines) are bloated by duplication

The big files are **not** big because PMV is intrinsically complex. They are big because of
copy-paste. Concretely, inside `pmv.ts`:

- There are **two chart builders** — `buildComparePsychrometricChart` ("static") and
  `buildPmvDynamicChart` ("explore") — that share roughly 30–40% of their code:
  grid iteration, the PMV-at-each-point evaluation, hover-template construction, input
  scatter points, and comfort-zone polygon building are all duplicated with minor
  differences. `adaptive.ts` repeats the same pattern at twice the size.
- `buildPmvResultSections` calls `sections.push(buildResultSection(...))` **six times** with
  near-identical structure (Compliance, Air Speed, PMV, Zone, PPD, Acceptability).
- The hover-template helper takes a pile of optional string parameters and is called ~6
  times with slightly different arguments.

**None of this requires a redesign.** It requires extracting shared functions (§4, §7).

### Secondary problem: DTO ceremony

Decision: **keep the DTO pattern** — it is understandable — but remove the repetition.

- `PlotTraceDto` / `PlotLayoutDto` in `src/models/comfortDtos.ts` are large bags of optional
  `any`-typed fields (`line?: any`, `marker?: any`, `contours?: any`, `colorbar?: any`,
  `xaxis: Record<string, unknown>`, …). They give the *appearance* of typing with none of
  the safety, and are ~half the file. Replace them with real types for the handful of trace
  shapes we use, or with thin `buildTrace()` / `buildLayout()` helpers returning plain
  objects.
- Every model's calculator rebuilds the same chart-source block
  (`{ chartRequest, dynamicXAxis, dynamicYAxis, baselineInputId }`) and its own
  `toXRequest(state, inputId)` mapper. Extract both into shared helpers so a model only
  declares *which fields* it reads, not the plumbing.
- The thin per-model request/response types (e.g. `HeatIndexRequestDto`) are clear and
  cheap — **leave them**.

The test for "simple enough": Federico should be able to read a model file top to bottom and
follow it without cross-referencing five other files. If a piece of ceremony does not pass
that test, remove or share it.

---

## 4. The central insight: Compliance and Explore are ONE chart engine

This is the most important idea in this document. Build it once.

Both modes sweep the model across a 2-D grid of two input variables and present the result.
The only differences are which variable is shown and whether the user can edit the bands:

| Aspect            | Explore                          | Compliance                                   |
|-------------------|----------------------------------|----------------------------------------------|
| x-axis variable   | user picks                       | user picks                                   |
| y-axis variable   | user picks                       | user picks                                   |
| z (displayed var) | **user picks** (e.g. PMV or PPD) | **locked** to the standard's metric          |
| band thresholds   | **user edits** (add/remove/edit) | **locked** to the standard (e.g. PMV ±0.5)   |
| what's drawn      | full coloured surface, bands     | the acceptable region shaded, point pass/fail|

So **Compliance is a constrained instance of Explore.** Do not write a second chart
pipeline for it. One engine takes a configuration:

```ts
interface FieldChartConfig {
  xField: FieldKey;            // selectable in both modes
  yField: FieldKey;            // selectable in both modes
  zOutput: ModelOutputKey;     // selectable in Explore; fixed by the standard in Compliance
  bands: Band[];               // editable in Explore; fixed by the standard in Compliance
  mode: "compliance" | "explore";  // controls control-visibility and shading style
}

interface Band { min: number; max: number; label: string; color: string; }
```

### Two rendering strategies, shared scaffolding

The engine provides all the common scaffolding — axis setup and padding, the user's input
point(s), hover, layout, unit conversion — and plugs in one of two "what to draw" strategies
that a model supplies:

1. **Grid/contour** — evaluate `zOutput` at each grid point, colour by `bands`. Used by PMV
   (ASHRAE and ISO) and the index models.
2. **Boundary/region** — draw boundary curves and shade between them. Used by Adaptive
   (two straight lines as a function of outdoor running-mean temperature) and by PMV's
   comfort-zone polygon overlay.

This is why a `Band`'s edges may be **constants** (PMV: −0.5/+0.5) *or* **functions of the
x-axis** (Adaptive: upper/lower limit as a function of outdoor temperature). Supporting both
keeps Adaptive a ~100-line file instead of forcing it through a grid it does not need, while
still sharing every piece of scaffolding with the grid strategy.

> **Why this matters for maintenance:** today, to change how PMV is plotted you edit two
> functions and hope they stay consistent. After this, you edit the engine once, and every
> model and both modes inherit the change.

---

## 5. What each model declares (the single source of truth per model)

Extend the builder so a model declares the following. This is where all the resolved
decisions live.

```ts
// Which lenses this model offers. Default chosen automatically (see §6).
modes: ("compliance" | "explore")[];

// The outputs this model can DISPLAY on the chart as z. Federico's answer (3):
// for multi-output models we explicitly choose which outputs are chartable.
chartableOutputs: ModelOutput[];

// Only for models that are part of a standard. Omit for models with no standard.
complianceSpec?: {
  output: ModelOutputKey;   // which output the standard judges
  bands: Band[];            // the standard's FIXED bands (constants or x-axis functions)
};

interface ModelOutput {
  key: ModelOutputKey;      // a constant from src/models/ — never an inline string
  label: string;            // "PMV", "PPD (%)", "Core temperature (°C)"
  unit?: string;
  defaultBands: Band[];     // the preset for Explore (see below)
}
```

Resolved decisions baked into this shape:

1. **ISO and ASHRAE PMV are two separate models** (answer 1). Two entries in the registry,
   each with its own `complianceSpec.bands`. No standard-toggle inside one model.
2. **Each model gets one preset, but the user can add / remove / edit thresholds** (answer 2).
   `defaultBands` is the preset; in Explore the user edits a working copy of it. Compliance
   ignores the working copy and always uses `complianceSpec.bands`.
3. **Models declare which outputs are chartable** (answer 3). Single-output models list one;
   PMV lists `[PMV, PPD]`; a future PHS lists core temperature, water loss, etc. The Explore
   "Display" picker is populated from `chartableOutputs`.
4. **Adaptive is compliance-only** (answer 4): `modes: ["compliance"]`, no `chartableOutputs`
   for Explore, `complianceSpec` with x-axis-function bands. It uses the boundary/region
   strategy from §4.
5. Models with **no standard** (Heat Index, Humidex, Wind Chill): `modes: ["explore"]`,
   no `complianceSpec`.

The existing `zones` (`ThermalZone[]`) are the natural source for an output's `defaultBands`
— a band is a zone with editable edges. Reuse, don't duplicate.

---

## 6. Top-level structure and mode UX

Decision taken: **hybrid**.

- **Analysis** (the page that exists today). Inputs left; results top-right; chart
  bottom-right. The chart header carries a **mode control** offering the modes the current
  model declares.
- **Time-series** — a **separate top-level section**, deferred (§8).

### Default mode and clarity (validated with Federico)

- **Default to Compliance when the model supports it, else Explore.** PMV opens on
  Compliance; Heat Index opens on Explore; Adaptive only ever shows Compliance.
- **When both modes exist, use a visible segmented toggle** ("Compliance | Explore"), not a
  hidden dropdown — the two lenses must be obviously co-equal and discoverable.
- **One-line caption per mode**, e.g. *"Shaded = conditions where PMV stays within ASHRAE 55
  limits (−0.5 to +0.5). Your input: ✓ compliant."* This is what stops a new user from
  seeing an unexplained shaded blob.
- **Keep each mode's controls minimal.** Compliance shows only the x/y axis pickers (z and
  thresholds are locked → hide those controls entirely). Explore adds the z "Display" picker
  and the threshold editor. Sub-tools (§7) live in the input panel, never the chart header.
- **Remember selection per model** (extend the existing `selectedChartByModel` idea to store
  mode + axes + chosen z + edited bands per model), so switching models and back is
  predictable. Shared *inputs* still persist globally (§2).

Keep shared input state across Analysis and Time-series, the same way it persists across
models today.

---

## 7. Input sub-tools (e.g. solar gain) — generic input modifiers

Some `jsthermalcomfort` helpers exist only to **adjust an input** before the main
calculation. Today PMV has a few of these tweaks baked in. Generalize them: a sub-tool is an
**optional input modifier** that is not specific to one model.

Key property (Federico's framing): *these tools only ever change inputs.* Solar gain adjusts
mean radiant temperature; dynamic clothing adjusts clo. The downstream model never needs to
know the tool ran — it just reads the adjusted SI input.

```ts
interface InputModifier {
  id: ModifierId;                 // constant from src/models/
  label: string;                  // "Solar gain on occupant"
  extraInputs: FieldKey[];        // its own inputs (sun position, etc.), persisted like main inputs
  // pure function: produces an SI patch to the canonical input store
  apply(baseInputs: InputState, extraInputs: Record<FieldKey, number>): Partial<InputState>;
}
```

Rules:

- **Store base input + active modifiers separately; effective input = base passed through the
  active modifier chain.** Toggling a modifier off must restore the original value — never
  overwrite the user's base input in place. This keeps it reversible and predictable.
- **Each model declares which modifiers it offers** (PMV offers solar gain because it uses
  MRT; Heat Index does not). A modifier appears in the input panel only when the active model
  declares it.
- **UI:** an optional, collapsed section / "+ Add solar gain" affordance in the input panel —
  not a separate page. Expanding it reveals the modifier's `extraInputs`.
- Keep them small and pure. A modifier is data + one `apply` function; do not let it grow
  into a parallel calculation pipeline.

This reuses the SI-canonical rule cleanly: modifiers compute in SI and patch the SI store;
the chart engine and result panel are unaffected.

---

## 8. Time-series (deferred)

A separate top-level section, deferred / out of scope for now. Its inputs differ
fundamentally (durations, sequences of conditions) and only a subset of models support it
(e.g. PHS). Design Analysis so it does not preclude Time-series: the `chartableOutputs`
declaration from §5 is exactly what a time-series view needs (plot a chosen output against
time), so the work done now is forward-compatible.

---

## 9. Recommended implementation sequence

Each step is shippable and testable. `npm test` and `npm run build` must pass at every step
(per `CLAUDE.md` Done Criteria).

1. **Extract the shared chart engine** (§4): pull duplicated grid/evaluate/hover/scatter/
   polygon logic out of `pmv.ts` and `adaptive.ts` into `src/services/comfort/charts/`
   (build on existing `sharedCharts.ts` / `plotlyBuilders.ts`). Make current charts call it.
   **No behaviour change** — verify charts render identically before/after.
2. **Declarative result rows:** replace the six `sections.push(...)` calls with a data array
   mapped over `buildResultSection`. Do PMV and Adaptive.
3. **Model declaration (§5):** add `modes`, `chartableOutputs`, optional `complianceSpec` to
   the builder; populate per model. Split PMV into ASHRAE and ISO models here.
4. **Explore mode:** drive the engine from `FieldChartConfig` with user-selectable x/y/z and
   an editable working copy of `defaultBands`. Add the "Display" picker and threshold editor
   to `src/components/chart/` (extend `ChartAxisMenu.svelte`).
5. **Compliance mode + segmented toggle (§6):** same engine, z and bands from
   `complianceSpec`, z/threshold controls hidden; default-mode logic; per-model memory of
   mode/axes/z/bands; captions.
6. **Adaptive via boundary strategy:** confirm Adaptive collapses to a small compliance-only
   file using x-axis-function bands.
7. **Input sub-tools (§7):** introduce `InputModifier`, migrate PMV's existing tweaks to it,
   add solar gain as the first generic modifier.
8. **DTO cleanup (§3):** replace the `any`-bag trace/layout types, extract the repeated
   chart-source/request helpers, collapse per-model cache types into one generic.

After steps 1–2, PMV and Adaptive should already be much smaller. Steps 3–7 add capability on
the now-shared engine.

---

## 10. Architectural rules to respect (from `CLAUDE.md`)

Non-negotiable:

- **Canonical state is SI.** Inputs (and the new band thresholds, and modifier outputs)
  convert to SI on entry, calculate in SI, display via `src/services/units/`.
- **`jsthermalcomfort` imports only in `src/services/comfort/**` and `src/comfortModels/**`.**
  Not in state or components.
- **No new raw domain strings.** Model / field / chart / output / modifier IDs are constants
  in `src/models/`. `ModelOutputKey` and `ModifierId` are new constant sets there.
- **No new hardcoded controller branches.** Everything model-specific (modes, outputs,
  compliance spec, bands, modifiers) is declared in the model config, not added as PMV/UTCI
  `if` branches in the controller.
- **Conversions only in `src/services/units/`.**

---

## 11. Tests to add (currently thin — 6 test files for ~74 source files)

All pure functions, cheap to test:

- **Band assignment:** a PMV value maps to the correct band/colour; boundary values land
  per the `>= min && < max` rule.
- **Compliance lock:** in Compliance mode z and bands equal `complianceSpec` regardless of
  any edited Explore working copy.
- **Engine output shape:** grid and boundary strategies each return valid Plotly structures.
- **Input modifiers:** `apply` produces the expected SI patch; toggling off restores base.
- **Result-row formatters:** a given value yields the correct zone label and tone.
- **Share-state round-trip:** URL encode → decode preserves everything, including chosen
  mode, z, and edited thresholds (new serialized state).

---

## 12. Smaller fixes carried over from the three previous review files

The three older review files (`26-05-11-review-federico-overall.md`, `-components.md`,
`-state.md`) have been **superseded by this brief and deleted**. Their items were checked
against the current code on 2026-06-29:

**Already resolved (verified) — no action needed:**

- One-file-per-model refactor; generic `ModelCalculationCache<R, C>`; `ResultTone` removed;
  deduplicated `normalizeCompareInputIds`; `clickOutside` action extracted; named `Props`
  interface adopted across components; zero `as any` in the controller; `ChartLegend` no
  longer hardcodes models; semantic-HTML fixes (no `<section>`/`<article>` shells, no
  `<header>` in footer); Flowbite `DropdownHeader`/`DropdownDivider` in menus; hardcoded
  trigger IDs, dead loops, and `as never` casts gone; `getVisibleInputIds` correctly typed;
  **`strict: true`** in `tsconfig.json`; **Wind Chill uses the library `wc().wci`** (no
  hand-coded formula).

**Still pending — keep on the list:**

- **Psychrometric chart above 100% RH.** Verify the chart does not draw risk categories
  above 100% RH; clamp if it does. (Could not confirm from a quick grep — check during the
  chart-engine extraction in step 1.)
- **`noUnusedLocals` sweep.** Strict mode is on but unused imports may remain; turn on
  `noUnusedLocals` temporarily to surface and remove them.
- **Documentation site.** `docs/` has loose markdown (`adding-a-thermal-model.md`,
  `frontend-structure-summary.md`) but no generator and no link from the app. Restructure
  into modular files (intro, contribution guide, frontend-structure overview), build a
  static site, and link it from the app.

---

## 13. Resolved decisions (for the record)

1. Compliance and Explore share one chart engine; Compliance is the constrained instance.
2. ISO and ASHRAE PMV are **two separate models**.
3. Each model has **one preset** of thresholds; in Explore the user can **add/remove/edit**.
   Compliance thresholds are locked to the standard.
4. Multi-output models **declare which outputs are chartable**; all key outputs may still
   appear in the results panel, but only the selected z colours the chart.
5. **Adaptive is compliance-only** (no Explore), drawn from two boundary lines.
6. Default mode = **Compliance if supported, else Explore**; visible segmented toggle when
   both exist.
7. Sub-tools (solar gain, dynamic clothing, …) are **generic input modifiers** that patch the
   SI input store; declared per model; shown in the input panel.
8. **Keep DTOs** but remove repetition and the `any`-typed trace/layout bags.

---

## 14. Remaining open questions

- **Threshold editor UX details.** Editing raw numeric band edges risks overlapping/invalid
  bands. Recommend: edit edges with validation (sorted, non-overlapping) and an
  "add band / remove band" affordance, seeded from the preset.
- **Results panel for multi-output models.** Confirm: show all key outputs in the results
  table, and let only the chart's z be switched? (Recommended.)
- **Solar gain inputs.** Which exact extra inputs does the solar-gain modifier expose, and
  which `jsthermalcomfort` function backs it? (Implementation detail for step 7.)

---

## Appendix A — Constant scaffolding to add in `src/models/`

These are illustrative; align names/casing with the existing constant files (e.g. the
pattern used for `ComfortModel`, `FieldKey`, `ChartId`). The point is: **every new concept
below is a constant, never an inline string** (per §10).

```ts
// src/models/modelOutputs.ts
// What a model can DISPLAY as the z-variable on a chart, or list in the results panel.
export const ModelOutputKey = {
  Pmv:              "pmv",
  Ppd:              "ppd",
  Utci:             "utci",
  HeatIndex:        "heatIndex",
  Humidex:          "humidex",
  WindChill:        "windChill",
  OperativeTemp:    "operativeTemperature",
  // future PHS:
  CoreTemperature:  "coreTemperature",
  WaterLoss:        "waterLoss",
} as const;
export type ModelOutputKey = (typeof ModelOutputKey)[keyof typeof ModelOutputKey];

// src/models/inputModifiers.ts
// Optional sub-tools that adjust inputs before calculation (§7).
export const ModifierId = {
  SolarGain:        "solarGain",      // adjusts mean radiant temperature
  DynamicClothing:  "dynamicClothing",// adjusts clo for air speed / walking
} as const;
export type ModifierId = (typeof ModifierId)[keyof typeof ModifierId];

// src/models/chartMode.ts
export const ChartMode = {
  Compliance: "compliance",
  Explore:    "explore",
} as const;
export type ChartMode = (typeof ChartMode)[keyof typeof ChartMode];
```

---

## Appendix B — Worked example: the PMV (ASHRAE) model declaration

This is what a model file's exported config should look like *after* the refactor. It is the
target shape, not a description of today's `pmv.ts`. It shows how §4–§7 come together so the
file reads top-to-bottom without cross-referencing. Bodies are elided with `…`; the structure
is the point.

```ts
// src/comfortModels/pmvAshrae.ts
import { pmv_ppd } from "jsthermalcomfort/models";          // jsthermalcomfort only here & in services/comfort
import { ComfortModel } from "../models/comfortModels";
import { FieldKey } from "../models/fieldKeys";
import { ModelOutputKey } from "../models/modelOutputs";
import { ModifierId } from "../models/inputModifiers";
import { ChartMode } from "../models/chartMode";
import { ThermalZone } from "../models/thermalZone";
import { ComfortModelBuilder } from "../state/comfortTool/modelConfigs/builder";
import { gridChartStrategy } from "../services/comfort/charts/engine"; // §4 shared engine

// --- Zones: each boundary number appears exactly once (CLAUDE.md rule) ---
const pmvZones = [
  new ThermalZone("cold",         "Cold",          -Infinity, -2.5, "#0571b0", "text-violet-600"),
  new ThermalZone("cool",         "Cool",          -2.5,      -1.5, "#4c78a8", "text-blue-600"  ),
  new ThermalZone("slightlyCool", "Slightly Cool", -1.5,      -0.5, "#92c5de", "text-blue-400"  ),
  new ThermalZone("neutral",      "Neutral",       -0.5,       0.5, "#f2f2f2", "text-emerald-600"),
  new ThermalZone("slightlyWarm", "Slightly Warm",  0.5,       1.5, "#f4a582", "text-amber-500" ),
  new ThermalZone("warm",         "Warm",           1.5,       2.5, "#e15759", "text-orange-500"),
  new ThermalZone("hot",          "Hot",            2.5,  Infinity, "#cc79a7", "text-red-600"   ),
];

// A Band is a zone with editable edges; default Explore bands come straight from the zones.
const pmvDefaultBands = pmvZones.map((z) => ({ min: z.min, max: z.max, label: z.label, color: z.color }));

// The standard's FIXED acceptable region for ASHRAE 55. Compliance ignores user edits.
const ashraeComplianceBands = [
  { min: -Infinity, max: -0.5, label: "Out of range", color: "#e0e0e0" },
  { min: -0.5,      max:  0.5, label: "Compliant",    color: "#9ed9a6" },
  { min:  0.5,      max:  Infinity, label: "Out of range", color: "#e0e0e0" },
];

// Pure calculation — reads SI, returns SI. One function, both outputs.
function calculatePmv(args): { pmv: number; ppd: number } {           // §3: thin, readable
  const r = pmv_ppd(args.tdb, args.tr, args.vr, args.rh, args.met, args.clo, args.wme, "ASHRAE", { limit_inputs: false });
  return { pmv: r.pmv, ppd: r.ppd };
}

export const pmvAshraeModelConfig = new ComfortModelBuilder(ComfortModel.PmvAshrae)
  .setLabel("PMV / PPD (ASHRAE 55)")
  .addControl(/* temperature */ …)
  .addControl(/* MRT, air speed, humidity, met, clo … */ …)

  // §5 — what this model can display as z, and the Explore preset bands
  .setChartableOutputs([
    { key: ModelOutputKey.Pmv, label: "PMV", defaultBands: pmvDefaultBands },
    { key: ModelOutputKey.Ppd, label: "PPD (%)", unit: "%", defaultBands: /* PPD preset */ … },
  ])

  // §5/§6 — this model offers BOTH lenses; default falls to Compliance (it has a spec)
  .setModes([ChartMode.Compliance, ChartMode.Explore])
  .setComplianceSpec({ output: ModelOutputKey.Pmv, bands: ashraeComplianceBands })

  // §7 — optional input sub-tools this model offers (PMV uses MRT, so solar gain applies)
  .setModifiers([ModifierId.SolarGain, ModifierId.DynamicClothing])

  // §4 — one engine; this model uses the grid/contour strategy and supplies the evaluator
  .setChartStrategy(gridChartStrategy({
    evaluate: (point, zOutput) => {
      const { pmv, ppd } = calculatePmv(point);
      return zOutput === ModelOutputKey.Ppd ? ppd : pmv;
    },
    zones: pmvZones,            // drives the comfort-zone overlay (boundary strategy reused)
  }))

  // §3 — declarative result rows, no repeated sections.push
  .setResultRows([
    { label: "Compliance", value: (r) => (Math.abs(r.pmv) <= 0.5 ? "Compliant" : "Out of range") },
    { label: "PMV", value: (r) => r.pmv },
    { label: "PPD", value: (r) => r.ppd, unit: "%" },
    { label: "Sensation", value: (r) => pmvZones.find((z) => z.contains(r.pmv))?.label },
  ])
  .build();
```

The ISO variant (`pmvIso.ts`) is nearly identical: same zones/outputs/strategy, but
`pmv_ppd(..., "ISO", ...)` and its own `complianceSpec.bands`. That is the entire difference
between the two models (resolved decision 2) — no shared standard-toggle branch.

For contrast, **Adaptive** declares `setModes([ChartMode.Compliance])` only, no chartable
outputs for Explore, and uses the **boundary strategy** with bands whose edges are functions
of the x-axis (outdoor running-mean temperature) — keeping it a small file (§4, decision 5).
