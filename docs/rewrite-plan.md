# CBE Thermal Comfort Tool — v1 rewrite plan

## Context

The current repository `main repo/comfort-tool` is a Svelte 5 app, 301 files / 49k lines, with too many layers to remain maintainable
(`declarations/` + `catalog/` + `state/modelRegistry/` + `engines/` — four layers referencing each other,
and `state/modelRegistry/builder.ts` alone is 1274 lines). ADR-0001 reached consensus: **reuse no code,
borrow only verified behaviour**, rewrite against the new architecture, targeting delivery of v1 on 2026-10-01.

Calculation logic moves out into the forked `jsthermalcomfort` (`typescript` branch); the app is left with only "declare models + render",
and the one rule is "**adding a model = one declaration file + one registry line, zero other files change**".

The toolchain does not need to be rebuilt: the `refactor-draft` branch is already on the Vite 8 / TS 6 / Svelte 5.56 /
Tailwind 4 / Vitest 4 / sv-router 0.18 the ADR asks for, and `jsthermalcomfort` is already symlinked to the fork via `file:`
(`node_modules/jsthermalcomfort` → `../../forked repo/jsthermalcomfort`).
What is unmaintainable is `src/`, not `package.json`.

### Decided

| Decision | Conclusion |
|---|---|
| Starting point | New branch in the same repository + `git rm -r src tests docs`, keeping build config and brand assets |
| v1 model scope | ADR §7: PMV (ISO 7730) + Adaptive (ASHRAE 55), with UTCI as architecture acceptance |
| Library branch | The fork's `typescript` (`for-new-CBE` and `Feature/export-model-metadata` were both branched from `main` before the TS rewrite and are abandoned) |
| Library / app boundary (2026-09-03) | The test: "would pythermalcomfort ship it?" (ADR §3). Applicability limits → library `reference/`; steps, unit conversion, default values, option copy, route path segments, `ModelDefinition` → app. Library-side work is done in a separate chat using the standalone prompt below |
| Second round (2026-09-03) | Limits are done as source in the library, not mirror; standard membership goes into the library as `reference.standards` + `model.standard`, the app only adds path segments; closed sets become `as const` object collections, not enum classes; operative mode uses the `t_o` quantity + `psychrometricZone.trFollowsDb`; quantity names come only from `Quantity.label` |
| Psychrometric chart geometry | `correctKnownDefects: false` — reproduce the chart already published by the old CBE tool |

### Library inventory (`typescript` @ d57c456, runtime exports verified one by one)

**Already there, directly usable:**

| ADR clause | Implementation in the library |
|---|---|
| §4.1.3 Measure | `io.pmvPpdIso/pmvPpdAshrae/adaptiveAshrae/adaptiveEn` → `.toMeasures()` → `Measure{quantity,value,unit,category,intervals}` |
| §4.1.2 Classification scale | `reference.{isoThermalSensation, ashraeThermalSensation, adaptiveAshraeOffsets, adaptiveEnOffsets, enCategoryPmvLimits}`, `IntervalScale.classify/labelFor` |
| §4.1.1 Quantity | `io.quantities` — 12 quantities, with `key/kind/label/siUnit/ipUnit`. Units are just symbol strings, and that is enough: conversion belongs to the app |
| **§4.7 boundary root-finding + §5 `core/compute/zoneBoundary.ts`** | **`charts.psychrometricZone` (ported from the CBE original, `rhStep`/`saturationStep`/`epsilon`/`correctKnownDefects` configurable) + `bisect`/`secant`** |
| §4.4 Adaptive real rendering | `charts.adaptiveAshraeZone` / `adaptiveEnZone` |
| Model metadata (partial) | `pmv_ppd_iso.{label,description,tsv}`, `pmv_ppd_ashrae.{label,description,tsv,compliance,COMPLIANCE_LIMIT}`, `adaptive_*.{label,description,offsets}` |
| Raw material for input calculators | `clo_dynamic`, `v_relative`, `running_mean_outdoor_temperature`, `met_typical_tasks`, `clo_individual_garments` |

> **Do not write `core/compute/zoneBoundary.ts` (ADR §5)** — the library already has it; just pass `rhStep: 5`.

**Gaps (→ library prompt below):**
Applicability limits are only hard-coded inside the compliance functions, and also embedded in the warning copy, with no data export
(the comment near line 275 of `utilities.ts` already promises that `reference/limits.ts` records the ISO met lower-bound discrepancy,
but that file currently holds only the EN category limits); models do not declare their standard membership, the standard lives only
in the `label` string, the `standard` parameter of `pmv_ppd` is a calculation-variant selector and `utilities.Standard` is a compliance
dispatch key — neither is membership; `quantities` lacks `t_o` (operative temperature, the input quantity and chart axis of
operative mode) and `p_atm` (Phase 5 atmospheric pressure); `psychrometricZone` only accepts a fixed `tr` and cannot express
operative mode's `tr = db` (`psychrometricTrEqualsTdb` in the old prototype's `declarations/pmv/calculation.ts:77`);
the `Standard` constant is placed inside an `export type {}` block, and `valid_range` is not in the barrel.

The other gaps previously assumed (`Unit/toSi/fromSi/step`, the `ModelDefinition` registry, `OptionSpec`,
`defaultValue`, the `inputs/outputs` list, adding `id` to offsets) were all assigned to the app or found unnecessary
in the 2026-09-03 boundary review; see ADR §3 / §4.1.5. The decisive evidence: the library's IP air-speed unit is fps
while the CBE tool displays fpm — display units were never the library's business.

### Two ADR corrections (already applied to the ADR)

1. **`epsilon` is not a temperature tolerance.** `comfort_zone.ts` explicitly comments that it is the **PMV residual**;
   the CBE original's `"ta precision"` comment is wrong. ADR §1 / §2 / §4.7 have been changed.
2. **The §3 vs §4.6 conflict** is resolved: unit conversion belongs to the app's `core/units.ts`, the exception spelled out in ADR §3;
   the app calls the library with SI only.

---

## How to use this plan

Each Phase is designed to be executed in **its own new Claude chat**. When opening a new chat, start with:
"Read `docs/adr-0001-architecture.md` and `CLAUDE.md`, then execute Phase N".

> **The most important step in Phase 0 is rewriting `CLAUDE.md` and `AGENTS.md`.**
> Right now they describe the old architecture item by item (`src/declarations/**`, `PointSession`,
> `defineModel(library, authoring)`, `state/modelRegistry` ...). If they are not changed,
> every subsequent new chat will be pulled off course by the old architecture — this is the most expensive pitfall in the whole process.

---

## Phase 0 · Starting point

**Goal**: an empty shell that starts with `npm run dev`, plus a set of AI context files pointing at the **new** architecture.
**Prerequisites**: none. Can run in parallel with or before/after Phase 1 (library); they do not depend on each other.

### Already done by hand by the user ✅

```bash
git switch -c rewrite/v1                              # now on rewrite/v1
git worktree add ../comfort-tool-old refactor-draft   # old code side by side for reference
git rm -r src tests docs
git rm postcss.config.cjs "CBE Thermal Comfort Tool.iml"
npm rm flowbite flowbite-svelte flowbite-svelte-icons plotly.js-dist-min
npm i plotly.js-cartesian-dist-min@4 comlink@4
npx shadcn-svelte@latest init     # → components.json / src/lib/utils.ts / src/app.css
```

Dependency state confirmed: `plotly.js-cartesian-dist-min@4`, `comlink@4`, `shadcn-svelte@1.6`,
`clsx` / `tailwind-merge` / `tailwind-variants` / `tw-animate-css` /
`@lucide/svelte` / `@fontsource-variable/geist`, `sv-router@0.18`, and
`jsthermalcomfort` still symlinked to the fork. `npm run check` / `npm run lint` currently pass
(check only reports a "no svelte input files" warning, because `src/` has no `.svelte` yet).

> ADR §2 says pnpm. npm already works and the symlink is in effect; pnpm is a preference, not a requirement.
> If you want to switch, switch only at this step (`rm package-lock.json && pnpm import && pnpm i`);
> switching midway touches both the lockfile and the `file:` symlink semantics at once.

### 0.1–0.4 completed ✅

- `svelte.config.js`: removed the SvelteKit fragment appended by init (now identical to HEAD)
- `$lib` uniformly points at `src/` (`tsconfig.json` + `vite.config.js`); in `components.json` the
  `ui` alias is changed to `$lib/ui/primitives` and `utils` to `$lib/ui/primitives/cn`;
  `src/lib/` has been deleted, so there is no second set of aliases
- **`src/app.css` completed**: init only wrote the `@apply` block and was missing `@import "tailwindcss"` and
  all the colour tokens (`shadcn-svelte/tailwind.css` contains only keyframes and the custom variant,
  no tokens), so the build reported `Cannot apply unknown utility class 'border-border'`.
  The full `:root` / `.dark` / `@theme inline` has been generated from the shadcn registry's neutral base color
- `vite.config.js`: removed the dead flowbite code, `manualChunks` now points at `plotly.js-cartesian-dist-min`
- `tsconfig.json`: added `erasableSyntaxOnly` + `verbatimModuleSyntax`
- `.nvmrc` → 24, `engines.node` → `>=24`
- `npm test`: added `--passWithNoTests` (no test files during the skeleton period; once Phase 2 lands real tests the flag has no practical effect)
- `eslint.config.js` rewritten in full as the new architecture boundaries
- `src/main.ts` / `src/App.svelte` / the ADR §5 directory skeleton have been created
- `docs/adr-0001-architecture.md`, `docs/rewrite-plan.md`, `CLAUDE.md`, `AGENTS.md`,
  `README.md` have been changed to point at the new architecture

**ESLint boundary rules have been tested in practice** (verified with deliberately violating probe files, deleted once run):

| Probe | Result |
|---|---|
| `src/core/*.ts` imports `svelte` | ✅ Error |
| `src/core/*.ts` contains the literal `"tdb"` / `"t_running_mean"` | ✅ Error (the key list is read from `io.quantities`; adding a quantity in the library needs no lint change) |
| `src/models/*.ts` imports `jsthermalcomfort/models` | ✅ No error (allowed since 2026-09-03: declaration files bind `run` and read metadata) |
| `src/state/*.ts` imports `jsthermalcomfort/models` | ✅ Error |
| `src/core/*.ts` imports `jsthermalcomfort/io` | ✅ No error (`io.quantities` is usable everywhere) |
| `src/ui/charts/*.svelte` imports a model | ✅ Error |
| `src/ui/outputs/*.svelte` uses `class="p-4 flex"` | ✅ Error |
| `src/ui/layout/*.svelte` uses `class="flex gap-2"` | ✅ No error (allowed) |
| `src/workers/*.ts` imports `jsthermalcomfort/models` | ✅ No error (allowed) |

> **ESLint flat config pitfall (hit once already)**: a rule of the same name in a later matching block **replaces** rather than merges.
> The first version wrote the `core/` boundary and the Tailwind restriction as separate blocks, and they were overwritten wholesale by the
> `no-restricted-imports` / `no-restricted-syntax` of a later block matching `src/**/*.{ts,svelte}`, **silently stopped working**, and the probes
> reported only 3 of 5. Now they are composed from fragment arrays, and every narrowing block repeats the fragments it still needs.
> **From now on, whenever a rule is added, write a probe first to verify it really errors**; do not assume it takes effect.

**Done criteria (met)**: all four of `npm run check` / `lint` / `build` / `test` pass.
`src/App.svelte` currently carries no Tailwind utility classes — it is a business component; spacing and the like
come from `Stack` / `Grid` / `Inline` once Phase 2's `ui/layout/` lands.

**Not yet done**: `git add` + commit (per the repository rules, git write operations are performed by you).

---

## Phase 1 · Library-side gaps (done in the fork repository, decoupled from the app)

**Goal**: fill the four gaps the app depends on: applicability-limit data (source, not mirror), standard membership,
the two missing quantities, and `psychrometricZone`'s operative mode. Only covers `pmv_ppd_iso` and `adaptive_ashrae`.
**Boundary**: the ADR §3 test. The library only adds things that "another tool would also need with exactly the same value"; steps, default values,
option copy, route path segments and `ModelDefinition` do not go into the library.
**Where**: `/Users/yehuihuang/SoftwareProjects/USYD/forked repo/jsthermalcomfort`,
branching `feat/applicability-limits` off `typescript`. The working tree has staged changes across 87 files
(deleting the docs theme, etc.); commit or stash first, then open the branch.
**Note**: the app consumes the build output `lib/esm/`, not `src/` — every library change needs
`npm run build` in the fork before the app sees it.

The whole block below can be pasted directly into a new chat (with cwd set to the fork repository):

````text
Repository: /Users/yehuihuang/SoftwareProjects/USYD/forked repo/jsthermalcomfort
Branch: open feat/applicability-limits from typescript (HEAD d57c456)
Reference: /Users/yehuihuang/SoftwareProjects/USYD/main repo/comfort-tool/docs/adr-0001-architecture.md, sections 3 and 4.1

Background: this library is a TypeScript port of pythermalcomfort and is a general-purpose library; the CBE Thermal
Comfort Tool being rewritten is only one of its consumers. The test: only add things that "another tool with a completely
different design, using the same model, would also need with exactly the same value". UI steps, default values, option copy, navigation grouping and registries do not go into the library.

[Already there, do not rebuild]
- src/io/quantity.ts        quantities (12 quantities, key/kind/label/siUnit/ipUnit), unitFor
- src/io/measure.ts         Measure / ComfortInterval
- src/io/classes_input.ts   BaseInputs / PmvPpdInputs / PmvPpdAshraeInputs / AdaptiveInputs
- src/io/classes_return.ts  *Outputs + .toMeasures()
- src/reference/            isoThermalSensation / ashraeThermalSensation /
                            adaptiveAshraeOffsets / adaptiveEnOffsets /
                            enCategoryPmvLimits / IntervalScale / LabeledInterval
- src/charts/               psychrometricZone / adaptiveAshraeZone / adaptiveEnZone /
                            bisect / secant
- Model function properties pmv_ppd_iso.{label,description,tsv},
                            pmv_ppd_ashrae.{label,description,tsv,compliance,COMPLIANCE_LIMIT},
                            adaptive_{ashrae,en}.{label,description,offsets}

[Five things to do]

1. Export the applicability limits as data, and make it the single source. Put it in src/reference/limits.ts
   (which currently holds only enCategoryPmvLimits).
   - Shape: readonly { quantity: Quantity; min: number; max: number }[],
     where quantity references the object in src/io/quantity.ts. Keyed by Quantity object, not by string.
   - Three tables:
     iso7730PmvLimits        tdb 10..30, tr 10..40, v and vr 0..1, met 0..4, clo 0..2
     ashrae55PmvLimits       tdb and tr 10..40, v and vr 0..2, met 1..4, clo 0..1.5
     ashrae55AdaptiveLimits  tdb and tr, v same as ASHRAE, t_running_mean 10..33.5
     Source of the numbers: _iso_compliance / _ashrae_compliance in src/utilities/utilities.ts,
     src/models/adaptive_ashrae.ts line 200. Do not write them from memory; check each one against the code.
   - Source, not mirror: change _iso_compliance / _ashrae_compliance and adaptive_ashrae line 200
     so they read min/max from the tables, and template the warning copy from the tables as well. Numeric results unchanged.
     First check whether tests/baseline.test.ts and tests/utilities/ pin the warning copy verbatim; if so, make the template
     reproduce it verbatim (the existing copy uses the character "ºC" and spellings like "10.0 and 33.5"; all of that must be preserved).
     This differs from the "Mirror, not source" of offsets.ts: offsets involve the t_cmf ± 3.5 inside the model kernel
     and are not touched this time; the limits live only in the check functions and can be made source.
   - ISO met lower bound: the code says 0, the docs say 0.8, the baseline pins 0. Write 0 in the table and record 0.8 in a comment.
     The comment near line 275 of utilities.ts already promises that limits.ts records this discrepancy; deliver on it this time.
   - Add assertions to tests/reference.test.ts: for every row of every table, feeding min - 0.01 and max + 0.01 to
     check_standard_compliance must produce a warning, and feeding min and max themselves must not.
   - Attach to the model functions: pmv_ppd_iso.limits, pmv_ppd_ashrae.limits, adaptive_ashrae.limits,
     the same pattern as .label / .tsv; the three tables are also exported from src/reference/index.ts.
   - Circular dependencies: models already import reference (bands / offsets), io/classes_return in turn
     imports models, and utilities is imported by models. limits.ts may only import the leaf module "../io/quantity.js",
     not "../io/index.js"; before utilities.ts imports limits.ts, first confirm that
     io/quantity.ts has only a type import of utilities (it does now), otherwise a cycle forms.

2. Export standard membership as data. Create src/reference/standards.ts:
   - export interface StandardRef { readonly id: string; readonly name: string }
   - export const standards = {
       iso7730:  { id: "iso7730",  name: "ISO 7730" },
       ashrae55: { id: "ashrae55", name: "ASHRAE 55" },
       en16798:  { id: "en16798",  name: "EN 16798-1" },
     } as const satisfies Record<string, StandardRef>
   - Attach to the model functions: pmv_ppd_iso.standard = standards.iso7730,
     pmv_ppd_ashrae.standard = standards.ashrae55, adaptive_ashrae.standard = standards.ashrae55,
     adaptive_en.standard = standards.en16798. Do not attach to set_tmp / two_nodes / cooling_effect / pmv_ppd.
   - Do not name it Standard: src/utilities/utilities.ts line 74 already has a Standard, which is
     the dispatch key of check_standard_compliance (including FAN_HEATWAVES, ANKLE_DRAFT); different semantics, do not merge.
   - Export standards and StandardRef from src/reference/index.ts.

3. Add two quantities to quantities in src/io/quantity.ts:
   - t_o: operative temperature, kind "temperature", key name aligned with the t_o of psychrometrics,
     label "Operative temperature", unit the same as tdb.
   - p_atm: atmospheric pressure, new kind "pressure" (add a member to the QuantityKind union type),
     label "Atmospheric pressure", siUnit "kPa"; ipUnit aligned with the existing pressure-branch convention in
     units_converter, or the same as SI if there is none.
   If the quantities count in the README is hard-coded, update it as well.

4. Add an operative mode to psychrometricZone. In src/charts/comfort_zone.ts, add
   readonly trFollowsDb?: boolean (default false) to PsychrometricZoneOptions.
   When true, the solver function calls pmv_ppd(db, db, vr, rh, met, clo, wme, standard, ...),
   i.e. tr follows db along the x axis; options.tr is ignored in that case, and the docs say so.
   This is the geometry of the CBE tool's psychtop chart; the old prototype's
   /Users/yehuihuang/SoftwareProjects/USYD/main repo/comfort-tool-old/src/declarations/pmv/calculation.ts
   line 77, psychrometricTrEqualsTdb, is exactly this switch.
   Add to tests/charts.test.ts: with trFollowsDb: true, recompute every solved vertex of the polygon with
   pmv_ppd(db, db, ...); the difference between |pmv| and pmvLimit must be within the order of epsilon.

5. Two pieces of housekeeping:
   - In src/utilities/index.ts, move Standard from the export type {} block to a value export
     (utilities.ts line 74 is a runtime constant; currently only the type escapes).
   - In src/utilities/index.ts, add the value export of valid_range (exported in the module, missing from the barrel).

[Do not do]
- Unit / step / toSi / fromSi, objectifying QuantityKind, InputSpec / OptionSpec / Band /
  OutputSpec, route path segments, ModelDefinition / models registry / evaluate(Map),
  defaultValue, adding id to offsets. All of these were assigned to the app in the 2026-09-03 boundary review (ADR §3 / §4.1.5).
- Do not change the signature or return value of any model function. tests/baseline.test.ts pins them byte for byte.
- Do not use enum / namespace / constructor parameter properties.

[Done criteria]
- npm run typecheck / lint / test all pass, and tests/baseline.test.ts passes with zero changes
- npm run build succeeds
- The boundary probe assertions in tests/reference.test.ts pass; the trFollowsDb assertion in tests/charts.test.ts passes;
  for every model with a standard attached, its standard is the same object as the member of reference.standards
- A 15-line node script can do: import { pmv_ppd_iso, io, charts } →
  read pmv_ppd_iso.standard.name → take the tdb range from pmv_ppd_iso.limits →
  io.pmvPpdIso({...}).toMeasures() → charts.psychrometricZone({ trFollowsDb: true, ... }),
  without a frontend existing at any point
````

---

## Phase 2 · Skeleton and the first usable screen

**Goal**: the Standard page, single slot, PMV (ISO 7730), input panel → result table, both SI/IP working. No charts.
**Prerequisites**: Phase 0 and Phase 1 both complete, and the fork has been through `npm run build`.

Build in order:

1. `src/core/` closed sets (ADR §4.2): `workspace.ts`, `chartType.ts`, `unitSystem.ts`,
   `entryModes.ts`. All are `as const` object collections + derived union types + plain `xxxFromId()` functions,
   written the same way as the library's `quantities`, with no classes. `temperatureMode` in `entryModes.ts` carries two
   Quantity fields, `panel` and `axis` (separate → `tdb`/`tr` and `tdb`, operative → `t_o` and `t_o`).
   `standard.ts`: a path-segment table keyed by the `reference.standards` objects + `pathSegmentFor` / `standardFromPath`.
2. `src/core/units.ts`: `DisplayUnit { symbol, step, toSi, fromSi }` +
   `displayUnitFor(quantity, unitSystem)`, looked up by `Quantity.kind`: temperature °C 0.1 / °F 0.1,
   airSpeed m/s 0.05 / fpm 10, percentage % 1, metabolicRate met 0.1, clothingInsulation clo 0.1,
   thermalSensation unitless 0.1, pressure kPa 0.1 / inHg 0.01. The conversion formulas are written here (the ADR §3 exception);
   `satisfies Record<QuantityKind, …>` guarantees a compile error here when the library adds a kind. Write the tests first: °C↔°F and m/s↔fpm round trips.
3. `src/core/modelDeclaration.ts`: `defineModel` + `RegisteredModel`. Fields: `run` (the library io wrapper),
   `model` (the library model function; reads label / description / standard / tsv / limits), `inputs` (order + default values),
   `table` (required), `charts`, `timeSeries`. The Standard capability is determined by whether `model.standard` exists.
4. `src/models/pmvIso.ts` (the shape from ADR §4.3) + `src/models/index.ts` (one registry line).
5. `src/core/numberFormat.ts`: at most two decimals, trailing zeros stripped (`26.0→26`, `78.80→78.8`). The only one in the whole project.
6. `src/core/libraryInputs.ts`: `toLibraryInputs(slot, model, environment)` — converts the representations
   (5 kinds of humidity, operative mode) into the SI inputs the library wants, `Map<Quantity, number>` → library init
   (`Object.fromEntries` by `Quantity.key`, the only place in the app apart from shareLink that reads key),
   plus `v → vr` (whether to apply `v_relative`, checked against the old tool) and, under operative, expanding `t_o` into `tdb = tr = t_o`.
   Pure function; write the tests first.
7. `src/state/session.svelte.ts`: `Session` / `InputSlot` from ADR §4.5 (using only slot 0 for now).
8. `src/ui/inputs/` input panel + `src/ui/outputs/ResultTable.svelte` (the three sections of ADR §4.3:
   Input / Compliance / the outputs listed in the model's `table`). The panel shows the temperature rows according to `temperatureMode.panel`;
   labels are always `Quantity.label`, never copy such as "Air temperature".
9. `src/routes/navigation.ts` (the only place sv-router is used) + `/standard/iso-7730/pmv-iso/`.
10. SI/IP switching: the canonical stored state is always SI, only the displayed text is converted, and the step comes from the current display unit's `DisplayUnit.step`.

**Done criteria**
- Changing an input produces numbers immediately; no calculate button
- After an SI → IP → SI round trip the stored value is unchanged; the display shows at most two decimals and no trailing zeros
- Out of the hard range (`model.limits`): outlined in red, not calculated, last valid value kept
- Nothing in `core/` `import`s any `svelte` / `state` / `ui` (blocked by the lint rule)
- `numberFormat`, `units`, `toLibraryInputs` have unit tests

---

## Phase 3 · Charts

**Goal**: both the psychrometric chart and the dynamic chart render, and Explore's 100×100 grid does not freeze the UI.
**Prerequisites**: Phase 2.

1. `src/core/charts/chartSpec.ts`: `ChartSpec { traces, layout, shapes, legend }`,
   `LegendEntry { label, swatch, color }`.
2. `src/ui/charts/PlotlyChart.svelte`: mounted via `{@attach}`, **consumes only a `ChartSpec`, imports no model**.
3. `src/ui/charts/ChartLegend.svelte`: **the whole chart has exactly one legend, always below the chart**;
   Plotly's built-in legend is turned off (`layout.showlegend = false`). When exporting an image, the same `legend` data
   generates a horizontal bottom Plotly legend, so screen and export stay consistent.
4. `src/core/charts/psychrometricChart.ts`: calls `charts.psychrometricZone` with
   `rhStep: 5`, `correctKnownDefects: false` (Decided: reproduce the old chart). The x-axis quantity is taken from
   `temperatureMode.axis`, the axis label is `Quantity.label`; operative mode passes `trFollowsDb: true`.
   **Do not write your own root finder**.
5. `src/core/charts/dynamicChart.ts`: selectable x/y quantities, 100×100 grid.
6. `src/workers/compute.worker.ts` + Comlink; the main thread discards stale results by stamp.
   Trigger point: ADR §4.7's own data says PMV with cooling effect is 43 µs per call → 100×100 = 0.43 s,
   so run synchronously before this step and wire up the Worker only once it measurably stalls — first have a chart that draws, then talk about async.
7. Three things for plotly 4.0: `config.showSendToCloud = false` and a trimmed modebar;
   colours uniformly hex + `rgba()` (culori no longer accepts fractional `rgb()`); do not install `@types/plotly.js`.

**Done criteria**
- The PMV psychrometric chart's comfort-zone vertices differ from the old tool (`../comfort-tool-old/`) by ≤ 0.01 °C under the same inputs
- Any chart has exactly one legend, below the chart; Plotly's built-in legend never appears
- Zoom/pan work; when the grid calculation takes > 300 ms, show "computing" and keep the old chart

---

## Phase 4 · Second model ← architecture acceptance, do not proceed if it fails

**Goal**: add Adaptive (ASHRAE 55).
**Prerequisites**: Phase 3. On the library side this needs `adaptive_ashrae.limits` / `.standard` and `io.quantities.t_o` (already included in Phase 1).

Only two files may be touched: create `src/models/adaptiveAshrae.ts`, and add one line to `src/models/index.ts`.
Adaptive renders for real with `chartType.dynamic`, with the axes locked to
`t_running_mean × t_o` (axis labels from `Quantity.label`), and the output is the acceptability-class bands
(`charts.adaptiveAshraeZone`).

**Done criteria (the hardest one in the whole plan)**
`git diff --stat` shows only `src/models/adaptiveAshrae.ts` and `src/models/index.ts`.
**The moment a third file is touched, stop and fix the architecture** — fixing it in week four is an order of magnitude cheaper than in week ten.

---

## Phase 5 · Compare / Explore / share and export

**Goal**: close out the ADR §7 first-stage feature set.
**Prerequisites**: Phase 4 passed.

1. Compare with three slots + baseline: `ResultTable` has one row per slot, and the baseline determines what the difference highlighting is relative to;
   slot colours run through the input panel, the table and the marker points on the chart.
2. Cross-model switch dialog (ADR §4.5): parameters for the same quantity are kept, and the
   "Boundary Range Warning" only pops up when a value exceeds the new model's hard range (table Input / Current / Allowed range,
   buttons "Yes, switch and adjust" / "No, stay here"); no out-of-range, no dialog.
3. Explore threshold editor: an ordered `Band` list, lower bound inclusive and upper exclusive, gaps uncoloured,
   Add band / Reset / delete, saved per (model, output) and included in the link; colours are assigned by the app
   from a fixed palette by band position, and are editable. **There is no "show zones" toggle** — the compliance zone and the bands are always drawn.
4. `src/core/shareLink.ts`: `?share=v1.<Base64URL(JSON)>`, schema in ADR §4.8.
   **This is the only file in the whole project that reads and writes string ids** (`Quantity.key`, each closed set's `.id` / `xxxFromId()`).
   On a parse failure, fall back to defaults and notify; no blank screen.
   Skipped: `migrate()` (v1 has no source to migrate from; write it in v2) and `v1z.` deflate + `fflate`
   (together with Time-series, see below).
5. Export Link + image export: editable title + input summary + tool name/version/date footer, PNG + SVG.

**Done criteria**
- From any state, Export Link → open in a new tab → the state is identical (three slots, units, chart type, thresholds, numbers)
- Opening a share link in an environment with `Proxy` disabled does not crash

---

## Phase 6 · UTCI acceptance + v1 wrap-up

**Goal**: ADR §7 acceptance #1, then close out.
**Prerequisites**: Phase 5.

1. Library side: port `utci` from the JS on the `main` branch into the TS on `typescript`
   (a polynomial, stateless, the cheapest one outside the 8 already-ported models), add `io.utci`, attach
   `label` / `description` / `limits` / classification scale, and add the missing quantities to `quantities`.
2. App side: **add only `src/models/utci.ts` + one registry line**, zero other files change, and it appears only in the
   Explore navigation (no `standard` attached in the library). `table` is required, so UTCI declares it too.
3. Run all nine ADR §7 acceptance items (item 3 compares vertex geometry).
4. One line of gtag; send `page_view` manually on route change, with the query string stripped from `page_location`
   (do not send the share payload to Google).
5. Merge back into `main`, remove the `git worktree`.

**After v1**: the remaining 5 models (heat_index / humidex / wind_chill / PHS / adaptive_en,
each = library port + one declaration file + one registry line) → Time-series + PHS + `v1z.` compression
→ ES5 summary page (depends on the share schema being frozen, hence last) → UI/e2e/visual tests.

---

## Key constraints (bring these into every new chat)

**Import direction (made into ESLint rules, configured in Phase 0)**
- `src/core/**` must not import `svelte` / `src/state` / `src/ui` — pure TS, runnable under node
- `src/ui/charts/PlotlyChart.svelte` must not import any model; it consumes only a `ChartSpec`
- Tailwind utility classes are **allowed only** in `src/ui/primitives/` (generated by the shadcn CLI, not edited)
  and `src/ui/layout/` (`Stack`/`Grid`/`Inline`, gap via props); their appearance in any other directory is an error

**Single entry points**
- The library's **model functions** (`jsthermalcomfort` root, `/models`) are imported only in `src/models/` (binding `run`,
  reading metadata) and `src/workers/` (the actual call), enforced by lint; `io` / `psychrometrics` /
  `reference` / `charts` can be imported anywhere (`io.quantities` is the single definition of quantities);
  the `io` model wrappers are **called** only in the worker, by convention rather than lint
- String ids appear in only two places: `Quantity.key` inside the library, and `src/core/shareLink.ts`
  (`core/libraryInputs.ts` uses `Quantity.key` to assemble the library's init object; that is the library boundary and does not count as a third place)
- Unit conversion only in `src/core/units.ts`, with the formulas written in the app (the ADR §3 exception); the canonical stored state is always SI
- Number formatting only in `src/core/numberFormat.ts`

**Syntax**
- Runes only; ESLint forbids `export let` / `$:` / `on:` / `<slot>` / `<svelte:component>`
- No `enum` / `namespace` / constructor parameter properties (`erasableSyntaxOnly`)
- Closed sets are `as const` object collections + derived union types; behaviour is written as plain functions, not `switch`ed on everywhere, and no enum classes
- Quantity names come only from `Quantity.label`; hard-coded names such as "Air temperature" do not appear in the app
- Run generated `.svelte` files through `svelte-autofixer` (the Svelte MCP is installed)

**Things not to write** (the library already has them, or they are not needed)
`core/compute/zoneBoundary.ts`, any self-implemented root finder, any transcribed classification threshold numbers,
`InputCalculator`, `sequentialSimulation`, `evaluateMany`, `migrate()`, `fflate`;
on the library side, `Unit` / `InputSpec` / `OptionSpec` / `ModelDefinition` / the `models` registry (they belong to the app);
on the app side, enum classes and app-side `standards` declarations (they belong to the library's `model.standard`).

## Verification

Run at the end of every Phase:

```bash
npm run check && npm run lint && npm run build && npm test
```

Behaviour comparison (from Phase 3 on):

```bash
cd ../comfort-tool-old && npm i && npm run dev   # the old tool runs on another port
```

Compare item by item under the same inputs: result-table values, psychrometric chart comfort-zone vertices (≤ 0.01 °C),
Adaptive band boundaries, SI/IP round trip.

Phase 4's architecture acceptance is judged by `git diff --stat`, and so is Phase 6's UTCI acceptance.
If either fails, stop and fix the architecture; do not work around it.
