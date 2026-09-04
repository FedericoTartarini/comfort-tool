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
| Scope review (2026-09-04, after Phase 3) | PMV (ASHRAE 55) joins v1 — it is the deployed tool's main screen and was missing from every list by oversight; input calculators become Phase 5b, narrowed to custom ensemble + dynamic predictive clothing + solar gain; the ES5 summary page is downgraded to a static notice; the site shell joins Phase 6; `suppressWarnings` goes into the library; chart axis ranges and the dynamic zone source move into the model declaration; field charts never snap on hover; local discomfort is deferred with its direction recorded (standalone models under the ASHRAE tab, not the legacy button panel) |
| Visual design (2026-09-04) | It had no phase at all, and ADR §7.4 referred to a design mock-up no phase produced. Split in two: token and primitive groundwork in Phase 3.6, the design itself in a new Phase 5c after Compare / Explore settle the layout. The site shell moves from Phase 6 into 5c. Deferring is safe because ADR §2's utility-class ban keeps appearance out of business components |
| Code quality (2026-09-04) | Two audit passes against `docs/code-quality-checklist.md` — full before the Phase 4 acceptance, narrow after it. Anything mechanically checkable becomes a lint rule with a probe. *Clean Code* / *Clean Architecture* are not acceptance criteria; the verified sources are Svelte Best practices, the TypeScript handbook's Do's and Don'ts, the Google TypeScript Style Guide, and DRY as Hunt & Thomas state it |

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
| Raw material for input calculators | `clo_dynamic_ashrae` / `clo_dynamic_iso`, `v_relative`, `running_mean_outdoor_temperature`, `met_typical_tasks`, `clo_individual_garments` |

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

**Model and effort.** Set once with `/model` at the start of each chat; do not change it mid-Phase
(switching models invalidates the prompt cache).

| Phase | Model | Effort |
|---|---|---|
| 0, 1, 4, 6 — execute a written checklist | Opus 5 | `high` |
| 2, 3, 5 — write new code | Opus 5 | `xhigh` |
| Plan mode, Phase 2 and Phase 5 only | Opus 5 | `max` |
| Read-only investigation subagents | Opus 5 | `low` |

Only Phases 2 and 5 repay plan mode — 2 because its ten steps are coupled and a wrong
`defineModel` field invalidates the Phase 4 acceptance, 5 because its five sub-features need an
order and a moment to freeze the share schema. Phase 4 must be executed directly: planning it
invites discovering "a third file also needs to change" and quietly changing it, which is exactly
what the acceptance exists to catch.

Escalate to Fable 5.1 (2x the token price) only if the Phase 4 acceptance fails. Reasoning backwards
from a third touched file to the wrong field in `defineModel` is the one piece of work in this plan
with no checklist to follow; everything else is execution precision, which Opus 5 at `xhigh` covers.

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

1. `src/core/` closed sets (ADR §4.2): `workspace.ts`, `chartType.ts` (both deferred to their first consumer, Phase 5 / Phase 3), `unitSystem.ts`,
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
6. `src/core/libraryInputs.ts`: `toLibraryInputs(slot, model)` — converts the representations
   (Phase 2: relative humidity only — the other four need library-side inverses, see Phase 2b; operative mode) into the SI inputs the library wants, `Map<Quantity, number>` → library init
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

### Executed 2026-09-04 ✅

All done criteria met (`npm test` 21 tests, `check` / `lint` / `build` clean; verified in the browser against `io.pmvPpdIso` called directly). Decisions and findings made while executing:

| Item | Decision / finding |
|---|---|
| v → vr | **`v_relative(v, met)` is applied** (`relativeAirSpeed: true` in `models/pmvIso.ts`), matching the deployed CBE tool. `comfort-tool-old` passed the entered value straight through; enter `v_relative(v, met)` there when comparing numbers |
| Humidity | **RH only.** The library has no inverse conversions and no `hr` / `t_dp` / `t_wb` / `p_vap` quantities; `core/entryModes.ts` declares `humidityMode.rh` alone, `libraryInputs.ts` sets `rh` directly. The other four arrive with Phase 2b below |
| Compliance colour | `category` is drawn as a swatch coloured by **band position** from `core/bandPalette.ts` (the seven CBE fills `#0571b0 #4c78a8 #92c5de #f2f2f2 #f4a582 #e15759 #cc79a7`); `intervals` colour pass / fail. No label-string comparison anywhere |
| `limit_inputs` | Called with `false`: the app gates entered values against `model.limits` (red outline, no recompute, last valid result kept); the library then always returns numbers, as the deployed tool does |
| Range check | On the **entered** quantity only (`outOfRangeInputs`): `v` against its own row, not the derived `vr`; an operative `t_o` entry against the intersection of the `tdb` and `tr` rows |
| `$state.raw` | Identity-compared objects (model, unit system, entry modes, measures) must be `$state.raw`; a deep `$state` proxy made `session.unitSystem === unitSystem.si` false and the table show `—`. Now in ADR §6 / CLAUDE.md |
| Lint | `symbol:` properties are exempt from the wire-string rule (`met` / `clo` are unit symbols as well as keys); probe verified |
| Deferred | `workspace.ts`, `chartType.ts`, `xxxFromId()` wait for their first consumer (Phase 3 / Phase 5 shareLink); `environment` parameter of `toLibraryInputs` arrives with the humidity-ratio conversion |
| Library issue | `quantities.p_atm.siUnit` is `"kPa"` but `psy_ta_rh` and `psychrometricZone.p_atm` take Pa — resolve in the library before Phase 5 "Set pressure" (folded into Phase 2b) |
| Open | `rh` has no applicability row, so 0..100 is not enforced. Decide with Phase 2b whether a physical range belongs on `Quantity` or in `core/units.ts` by kind |

---

## Phase 2b · Library: humidity representations (fork repository)

**Goal**: the four remaining humidity representations, so `humidityMode` can grow to five and `toLibraryInputs` can convert them without the app writing a formula or a root finder (ADR §3).
**Prerequisites**: none on the app side; run in a separate chat with cwd set to the fork. Afterwards `npm run build` in the fork, then in the app: add the four modes to `core/entryModes.ts`, the four conversions to `core/libraryInputs.ts`, a mode selector row to `ui/inputs/InputPanel.svelte`, and the `pressure` / `humidityRatio` display units in `core/units.ts` (the `satisfies Record<QuantityKind, …>` will demand them).

> **Library side done** (fork `43d7e92`). **App side outstanding**: Phase 3 added only the `humidityRatio` display unit,
> because without it `core/units.ts` no longer compiled — the `satisfies Record<QuantityKind, …>` did exactly its job. The
> other three items move to **Phase 3.6**.

````text
Repository: /Users/yehuihuang/SoftwareProjects/USYD/forked repo/jsthermalcomfort, branch typescript (HEAD 1f4df79)
Reference: comfort-tool/docs/adr-0001-architecture.md §3 / §4.1

Test as always: "would pythermalcomfort ship it?" Inverse psychrometric conversions are general-purpose; UI copy, steps and defaults are not.

1. Add four quantities to src/io/quantity.ts:
   hr    kind "humidityRatio" (new QuantityKind member), label "Humidity ratio", siUnit "kg/kg", ipUnit "kg/kg"
   t_dp  kind "temperature", label "Dew-point temperature", °C / °F
   t_wb  kind "temperature", label "Wet-bulb temperature", °C / °F
   p_vap kind "pressure", label "Water vapour partial pressure" — unit must match what the functions return/accept (see 3)
2. Add to src/psychrometrics/ (each a pure function, SI only, no rounding beyond what p_sat already does):
   rh_from_humidity_ratio(hr, tdb, p_atm)   inverse of psy_ta_rh().hr  (p_vap = hr·p_atm / (0.62198 + hr); rh = 100·p_vap / p_sat(tdb))
   rh_from_dew_point(t_dp, tdb)             rh = 100·p_sat(t_dp) / p_sat(tdb); t_dp ≥ tdb → 100
   rh_from_wet_bulb(t_wb, tdb, p_atm)       numeric inverse of psy_ta_rh().t_wb using the existing bisect in src/charts/root_finding.ts (move it to a shared internal module if importing across layers is awkward)
   rh_from_vapour_pressure(p_vap, tdb)      rh = 100·p_vap / p_sat(tdb)
   Clamp to [0, 100]. Export from src/psychrometrics/index.ts (named + default object).
3. Resolve the pressure unit inconsistency: quantities.p_atm.siUnit is "kPa" but psy_ta_rh and PsychrometricZoneOptions.p_atm take Pa. Pick one (recommend siUnit "Pa" so quantity and function agree) and apply it to p_vap too.
4. Tests (tests/psychrometrics.test.ts): for a grid of (tdb, rh, p_atm) round-trip every inverse through psy_ta_rh to within the precision p_sat's 1-dp rounding allows; document that bound.
5. Do not add: steps, defaults, labels for UI modes, anything keyed by string.
Done: npm run typecheck / lint / test / build pass; tests/baseline.test.ts unchanged.
````

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
- The PMV psychrometric chart's comfort-zone vertices differ from the old tool (`../comfort-tool-old/`) by ≤ 0.01 °C under the same inputs (the app applies `v_relative(v, met)`; enter that `vr` in the old tool first)
- Any chart has exactly one legend, below the chart; Plotly's built-in legend never appears
- Zoom/pan work; when the grid calculation takes > 300 ms, show "computing" and keep the old chart

### Executed 2026-09-04 ✅

Both charts render; `npm test` 43 tests, `check` / `lint` / `build` clean. Decisions and findings:

| Item | Decision / finding |
|---|---|
| Worker | **Skipped, as this phase's own step 6 instructs.** Measured: zone 1.7 ms, 100×100 ISO grid 21 ms, and 26–31 ms end to end in the browser from an input change to the redraw. Far under the 300 ms threshold, so the "computing" indicator never fires either. Both are reinstated in Phase 3.7 — see the ASHRAE measurement there |
| Vertex accuracy | Verified against an **independent bisection oracle written in the test**, not against the running old tool: every one of the 21 cool-edge vertices is within 0.01 °C, separate and operative alike. Running `comfort-tool-old` side by side is still outstanding and moves to Phase 3.5 |
| Oracle rounding | The first oracle used `io.pmvPpdIso`'s default `round_output: true` and reported 0.030 °C. A rounded PMV is a staircase of 0.01 steps ≈ a 0.03 °C plateau, so any point in it looks like a root. The library's solver calls with `round_output: false`; the oracle now does too. The result table shows the rounded PMV, the zone is solved unrounded — as the deployed tool does |
| Operative mode bug | A remembered `tdb` axis survived the switch to operative entry, where the slot only holds `t_o`: the axis select went blank and the whole field collapsed to one band. Fixed with `underTemperatureMode(quantity, mode)` in `core/entryModes.ts`, plus a regression test |
| Viewport | `layout.uirevision` keyed on axis titles and ranges: an input change redraws inside the zoom the user set, a unit or axis change resets it |
| Image export | Plotly's `toImage` button removed — its PNG would come out without the legend, which lives below the chart. Proper export is Phase 5 |
| Rendering | Shipped as a `heatmap`. **Wrong** — ADR §4.4 says contour, and it is why the bands look stepped. Corrected in Phase 3.5 |
| Axis ranges | Taken from `model.limits`, which clipped the ISO chart to 10–30 °C and left `rh` unable to carry an axis. **Wrong** — corrected in Phase 3.5 |

---

## Phases 3.5 – 3.7 · Contract freeze before the Phase 4 acceptance

Inserted 2026-09-04 after the post-Phase-3 scope review. The reasoning is one sentence: **Phase 4's acceptance asserts
that adding a model touches two files, which only means something once the contracts have stopped moving.** Every known
change to the shape of `RegisteredModel`, `ChartDeclaration` or `ChartSpec` therefore lands here, before the acceptance —
and after it, none should be needed. The three phases are split by the files they touch, so they barely overlap.

### Phase 3.5 · Chart contract and rendering

Everything in `core/charts/` and `ui/charts/`.

1. Axis ranges move into the model declaration, defaulting to the ranges the deployed tool draws; `model.limits` goes back
   to validating input only (ADR §4.4). The psychrometric viewport becomes 10–40 °C at 121 samples, matching
   `comfort-tool-old`'s `charts/psychrometric/humidity.ts:18`.
2. A `zones` source on the dynamic declaration, so a model can supply exact polygons. **This is the one field added before
   its consumer exists** — Phase 4's Adaptive is that consumer, and adding it here is what keeps Phase 4 at two files.
3. `ChartSpec` gains a per-trace hover mode and `annotations`; hover stops snapping (ADR §4.4), and the RH isolines get
   their 10 %–100 % labels back.
4. `heatmap` → `contour`.
5. Both axis selects offer every entered quantity and exclude the one the other holds.
6. Then run the deferred behaviour comparison: `cd ../comfort-tool-old && npm i && npm run dev`, and compare the result
   table, the zone vertices and an SI/IP round trip item by item. This is the moment for it — the geometry has just settled.

### Executed 2026-09-05 ✅

All six steps landed; `npm test` 49 tests, `check` / `lint` / `build` clean. Decisions and findings:

| Item | Decision / finding |
|---|---|
| Axis ranges | Moved to the model declaration, then **moved again to model level**: `RegisteredModel.axisRanges` is one `[quantity, min, max]` table both charts read. Per-chart ranges were implemented first, exactly as ADR §4.4 specified, and produced `10, 40` four times in one file for a flexibility nothing in v1 or in the deployed tool uses — `comfort-tool-old` feeds one `pmvIndoorTemperatureRangeSi` constant to the psychrometric chart, the field chart and the operative axis alike. Model level also makes the psychrometric x range follow the entry mode for free. ADR §4.4 was corrected to match |
| Viewport | 10–40 °C at 121 isoline samples, humidity ratio 0–0.03, matching `comfort-tool-old`'s `charts/psychrometric/humidity.ts:18`. `model.limits` no longer touches any chart |
| `zones` | `(request: ZoneRequest) => ZonePolygon[]` on the dynamic declaration, handed the slot's resolved SI values and the drawn x extent so Phase 4's Adaptive can call `charts.adaptiveAshraeZone({ v, trmRange })` without new plumbing. The one field added before its consumer exists; a synthetic declaration in `dynamicChart.test.ts` stands in for that consumer until Phase 4 |
| Hover | Per-trace `hover: "off" \| "field"` on `ChartSpec`. Chrome — isolines, zone outline, slot markers — stops capturing the pointer; the contour answers per cell and a zone polygon answers anywhere inside its fill (`hoveron: "fills"`). **The transparent probe layer ADR §4.4 asks for is deferred to Phase 5**, so the psychrometric chart currently has no cursor readout at all. Decided rather than drifted: the deployed tool's readout box is a Phase 5c interface concern |
| Annotations | `ChartSpec.annotations`; the RH isolines are labelled 10 %–100 % where each curve leaves the top of the viewport. The `%` comes from the display unit, not from a literal |
| `heatmap` → `contour` | Done, with `contours: { start: -0.5, end: n - 0.5, size: 1 }` so band index *k* owns its own step |
| Axis selects | Both offer every entered quantity (`rh` included, which the limits-derived version could not) and each excludes the quantity the other holds. A second collision path was found and fixed: the entry mode maps both `tdb` and `tr` onto `operative_tmp`, so a `tdb × tr` chart collapsed onto one quantity. `resolvedAxes()` is now the single place both the chart and the select resolve axes through |
| Step 6, the deferred comparison | **`comfort-tool-old` cannot run.** It resolves `jsthermalcomfort` through the same symlink as this app, and the fork's `typescript` branch no longer exports what it imports (`clo_tout`); the published 1.4.0 does not have what it needs either (`pmv_ppd_iso.tsv.bins`). Running it would mean rebuilding the fork on an older branch, which breaks this app. Compared against **the deployed tool's own `comfort-models.js`** instead — the draft was only ever its replica — with these results |
| Result table parity | `comf.pmvEN` vs `io.pmvPpdIso` over eight input sets including the app's defaults: worst \|Δpmv\| **2.6e-14**, worst \|Δppd\| **8.1e-13** |
| Zone parity | Every one of the 42 cool/warm-edge vertices, fed back through the deployed tool's own PMV: worst \|PMV − target\| **4.6e-4**, against the library's 1e-3 solver residual |
| SI/IP round trip | `units.test.ts` plus a browser pass: 25 °C → 77 °F, 0.1 m/s → 19.69 fpm, viewport 50–104 °F, ISO input range 50–86 °F |

---

## Library alignment with pythermalcomfort · 2026-09-05

Unplanned, inserted between 3.5 and 3.6. It began as one question about a single field and ended as the first full audit
of the fork against upstream.

**How it started.** Phase 3.5's psychrometric declaration carried `pmvVariant: "ISO"`, the string
`charts.psychrometricZone` needs to pick a PMV formulation. The question "why does the app have to say that, when
`pmv_ppd_iso` already hard-codes it?" traced back to upstream commit `61de959`, which **deleted** the combined
`pmv_ppd(…, standard)` and replaced the switch with two functions. The fork had followed that in its `io` layer and not
in `models/` or `charts/`, so `pmvVariant` was a legacy switch surfacing two layers up. The string
`standard: "ISO" | "ASHRAE"` turned out to be the probe: everywhere it survived, the same migration was unfinished.

**What the audit covered.** The fork's whole public surface — 8 models, 12 psychrometrics, 13 utilities, plus
`reference` / `io` / `charts` — compared against upstream on equations, parameters, applicability and naming. Confirmed
identical and not touched: `adaptive_ashrae` and `adaptive_en` (slopes, offsets, cooling effect, acceptability),
`cooling_effect` (brent 0–40, still-air 0.1), the three `airspeed_control` conditions, `v_relative`, `f_svv`,
`body_surface_area`, `running_mean_outdoor_temperature`, `units_converter`, and every psychrometric equation.

**What was wrong (fork commit `3292f0b`).**

| Finding | Fix |
|---|---|
| `clo_dynamic(clo, met, "ISO")` applied the ASHRAE formula with the threshold moved to met > 1. Upstream's `clo_dynamic_iso` is the ISO 9920:2007 Annex C correction and takes `v` and `i_a` — a different equation, not a different threshold | Split into `clo_dynamic_ashrae` / `clo_dynamic_iso` |
| ISO `met` lower limit was `0`; jsthermalcomfort 1.4.0 checked `value < 0` while printing "between 0.8 and 4.0", so it never fired | `0.8`, as upstream. The app's input panel now shows the real range |
| ISO applicability also bounds the **derived** `p_vap ≤ 2700 Pa` and the **output** `pmv ∈ [−2, 2]`. The library enforced both internally but `.limits` — the table every consumer reads — did not carry them | Both are rows now, and `io.quantities` gained `p_vap`. **The app still ignores them**: `outOfRangeInputs` only walks entered quantities. Carried into Phase 3.6 below |
| `ashraeThermalSensation` was right-closed while ISO's was left-closed, so the two standards would label PMV = −0.5 differently. Upstream publishes no ASHRAE sensation scale at all | Left-closed, with the reasoning recorded in the library |
| `pmv_ppd` still publicly exported; `psychrometricZone` still took a `standard` string defaulting to `"ASHRAE"` | `pmv_ppd` is internal; the zone takes the model function, required, no default. `pmvVariant` disappeared from the app |
| No edition concept. Upstream's `pmv_ppd_iso` defaults to **7730-2025** and also accepts 7730-2005 | Added as `edition` — not upstream's `model`, which already means something else here. Verified: upstream runs both editions through the same kernel, so no number moves |
| `two_nodes`, and the psychrometric function names, were 1.4.0's vocabulary tracking an older upstream | Renamed to `two_nodes_gagge`, `operative_tmp`, `mean_radiant_tmp`, `wet_bulb_tmp`, `dew_point_tmp`, `enthalpy_air`, `hr_to_rh`, occurrence by occurrence, and followed through this app |
| Only 2 of the shared `validation-data-comfort-models` fixtures were subscribed, for 8 shipped models; `set_tmp` and `two_nodes` had no upstream conformance check at all | Six fixtures now, `VALIDATION_DATA_REF` pinned to `v1.0.0`. 192 model tests pass |
| `set_tmp` carried a `units` parameter upstream had removed; `two_nodes` computed a percent-satisfied value it never returned; `psy_ta_rh`'s doc example showed a negative humidity ratio and a negative enthalpy | All three corrected |

**The rule this produced**, now ADR §3: the fork follows upstream's logic *and* naming by default, and deviates only
where TypeScript requires it, with the reason at the site. Kept deliberately: the kwargs object (TS has no keyword
arguments), `reference/` as public data, the `io` layer, `charts/`, and `psychrometrics/` as its own module.

Fork: 633 tests. App: 49 tests, `check` / `lint` / `build` clean, and the working brief is kept at the fork's
`ALIGNMENT-BRIEF.md`.

---

### Phase 3.6 · Input contract and panel

Everything in `core/entryModes.ts`, `core/libraryInputs.ts`, `core/modelDeclaration.ts`, `ui/inputs/`.

1. `entryGroups` as a closed set plus `RegisteredModel.entryGroups`. Today `libraryInputs.ts` injects `rh` unconditionally,
   which would hand Adaptive — whose inputs are `tdb / tr / t_running_mean / v` — a quantity it does not take.
2. The four remaining humidity entry modes, finishing Phase 2b's app side.
3. `OptionSpec` / `OptionValue`, `RegisteredModel.options`, `InputSlot.options`. Two consumers now, which is what makes
   the contract worth having: Phase 3.7's ASHRAE `airspeed_control`, and the ISO **edition** the library gained on
   2026-09-05 (`"7730-2005"` / `"7730-2025"`, published as data so the option's choices are read, never written). The app
   currently takes the library's default silently — decide there whether the result table names the edition, since
   `model.label` does not.
4. **The three kinds of applicability** (handed over by the library alignment). `pmv_ppd_iso.limits` now carries rows for
   the derived `p_vap ≤ 2700 Pa` and the output `pmv ∈ [−2, 2]` beside the entered quantities, and `outOfRangeInputs`
   walks entered quantities only, so both are silently ignored — the same hole the library just closed. They cannot
   simply join the existing gate either: its semantics are "input out of range → do not calculate, keep the last valid
   result", which is wrong for an output bound. A PMV of 2.4 must be *shown*, flagged as outside ISO 7730's
   applicability. So: entered → correctable, blocks calculation; derived → reported against the inputs that produced it;
   output → shown with a caveat. This is the Compliance column's business as much as the input panel's.
5. `presets` on the declaration + a free-entry input that also offers a searchable preset list, fed by the library's
   `met_typical_tasks` and `clo_individual_garments`.
6. A model dropdown at the top of the input panel, listing only the models of the standard the page is on, sharing
   `navigateTo(model)` with the left navigation, which stays.
7. **Visual groundwork — not the design itself.** `app.css` gains the project's own tokens (a type scale, a spacing
   scale, a brand colour) instead of the shadcn neutral base it ships with today, and the primitives the app actually
   needs are generated: `select` (which replaces the native one Phase 3 hand-rolled in `ChartControls.svelte`), `card`,
   `separator`. Layout structure is deliberately untouched. Doing this here is what stops every later phase from
   improvising its own CSS: Phase 3 already had to, twice.

### Phase 3.7 · PMV (ASHRAE 55) + the Worker

1. `src/models/pmvAshrae.ts` + one registry line — **the first architecture acceptance**, and the thing that proves the
   `options` contract carries a real model.
2. The Worker becomes mandatory here. Measured 2026-09-04, 100×100 grid: ISO 21 ms, **ASHRAE 340 ms** — the cooling effect
   costs 16× per point. So this phase delivers ADR §4.7 in full: `workers/compute.worker.ts`, Comlink, the stale-result
   stamp, and the "computing" indicator past 300 ms.
3. `state/compute.svelte.ts` is rewritten in the same pass. It currently assigns to state inside an `$effect` and reaches
   for `untrack` to break the loop it thereby creates — the exact pattern Svelte's Best practices names ("avoid updating
   state inside effects"), and a violation of the ADR's own §6. Going async is the natural moment to fix it. Keeping the
   last valid result across an out-of-range input is genuinely stateful, so this is a redesign, not a substitution.
4. Library side, in the fork: `suppressWarnings` on `BaseInputsInit`. **Still outstanding** — the 2026-09-05 alignment
   round did not cover it; `charts.psychrometricZone` has `suppressModelWarnings`, the `io` inputs do not. One ASHRAE grid scan logs 300 "Assuming cooling
   effect = 0" lines; `charts.psychrometricZone` already silences its own trace and any field-drawing consumer needs the
   same (ADR §3).

### Done criteria for 3.5 – 3.7

- The four scripts pass after each phase.
- After 3.7, a full pass over [code-quality-checklist.md](code-quality-checklist.md) — the last point at which a contract
  may still change shape.
- `RegisteredModel`, `ChartDeclaration` and `ChartSpec` are not expected to change again until Phase 5.

---

## Phase 4 · Second model ← architecture acceptance, do not proceed if it fails

**Goal**: add Adaptive (ASHRAE 55).
**Prerequisites**: Phase 3. On the library side this needs `adaptive_ashrae.limits` / `.standard` and `io.quantities.operative_tmp` (added in Phase 1 as `t_o`, renamed 2026-09-05).

Only two files may be touched: create `src/models/adaptiveAshrae.ts`, and add one line to `src/models/index.ts`.
Adaptive renders for real with `chartType.dynamic`, with the axes locked to
`t_running_mean × operative_tmp` (axis labels from `Quantity.label`), and the output is the acceptability-class bands
(`charts.adaptiveAshraeZone`).

**Prerequisites**: Phases 3.5 – 3.7. The `zones` source exists by then, so Adaptive's exact
`charts.adaptiveAshraeZone` polygons need no new plumbing, and `entryGroups` keeps `rh` out of its inputs.

**Done criteria (the hardest one in the whole plan)**
`git diff --stat` shows only `src/models/adaptiveAshrae.ts` and `src/models/index.ts`.
**The moment a third file is touched, stop and fix the architecture** — fixing it in week four is an order of magnitude cheaper than in week ten.

Then a narrow pass over [code-quality-checklist.md](code-quality-checklist.md) covering **only those two files**: names,
declaration shape, no new mirrored value. Nothing in `core/` changes at this point — needing to change it means the
acceptance did not really pass.

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
5. Export Link + image export: editable title + input summary + tool name/version/date footer, PNG + SVG. The same
   `ChartSpec.legend` generates Plotly's horizontal bottom legend in the export layout, so screen and file agree — the
   modebar's own PNG button was removed in Phase 3 precisely because it could not do this.
6. `RegisteredModel.timeSeries` lands with `workspace.ts`, which is its first consumer.
7. The `Proxy`-less fallback is a static notice in `index.html` naming the required browser versions (ADR §2 / §7.5,
   decided 2026-09-04). No second ES5 code path, no share decoding.

**Done criteria**
- From any state, Export Link → open in a new tab → the state is identical (three slots, units, chart type, thresholds, numbers)
- Opening a share link in an environment with `Proxy` disabled does not crash

---

## Phase 5b · Input calculators

**Goal**: the calculator buttons of the old tool's input panel, with the semantics ADR §4.1.5 already fixed — a one-shot
Apply that writes into a target input, never entering the session or the share link.
**Prerequisites**: Phase 5 (they write into slots, and Compare decides which slot).

Scope was narrowed on 2026-09-04 to exactly three; `Globe temp` is explicitly out:

1. **Custom clothing ensemble** — build a garment list from the library's `clo_individual_garments`, Apply writes `clo`.
2. **Dynamic predictive clothing** — `clo_dynamic_ashrae` / `clo_dynamic_iso` (split 2026-09-05; the ISO one also takes `v` and `i_a`), Apply writes `clo`.
3. **Solar gain on occupants** — confirm first whether the fork already ports it; if not, that is a library task, since
   the formula is general (ADR §3).

The declaration field that says which model offers which calculator is added here, not earlier: Phase 4's acceptance is
already past, and an optional field with no consumer would be exactly the speculative abstraction the ADR forbids.

---

## Phase 5c · The interface, designed

**Goal**: stop looking like a wireframe. Everything before this phase was correctness; this one is the product.
**Prerequisites**: Phase 5. That is the point — Compare's three slots, the Explore workspace and the threshold editor
all change the layout, so a design drawn before them would be redrawn after them.

1. The three columns as designed rather than as stacked: real proportions, real density, a considered
   information hierarchy. The architecture is fixed (ADR §1), the execution is not.
2. Header and footer — title, unit switch, Documentation link, version / date / licence, Reset. **Moved here from
   Phase 6** on 2026-09-04: they are design work, not wrap-up chores.
3. One palette across UI and charts. `core/bandPalette.ts`'s `chartInk` is currently hand-picked hex against the CBE
   fills; it becomes part of the design system rather than a chart-local constant.
4. Responsive behaviour, and the result table's horizontal overflow — legible since Phase 2, never designed.
5. The model-switch dialog mock-up ADR §7.4 refers to. It is produced here; until then that criterion is judged on
   content, not appearance.

**Why not earlier**: the lint rule that bans Tailwind utilities outside `ui/primitives/` and `ui/layout/` (ADR §2) is
what makes deferring safe. Visual change reaches the app through tokens, primitives and the three layout components —
business components never encode appearance, so redesigning them is not a rewrite of them.

**Done criteria**
- No hand-written CSS left in business components that a token or a primitive should be carrying.
- The four scripts still pass, and no business component's logic changed to accommodate the design.

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

The site shell (header, footer, Reset) was briefly assigned here on 2026-09-04 and moved to Phase 5c the same day:
it is design work, and doing it apart from the design would mean doing it twice. `Save` / `Reload` are not built at
all — Export Link covers them.

**After v1**: local discomfort (ankle draft, vertical air temperature difference) as standalone models under the ASHRAE tab; the remaining 5 models (heat_index / humidex / wind_chill / PHS / adaptive_en,
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
