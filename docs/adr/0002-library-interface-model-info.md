# ADR-0002 · Library interface: the jsthermalcomfort main repository's `ModelInfo` replaces the fork contract

- Status: accepted (2026-09-13, decision taken with the project lead; details settled the same day); amended 2026-09-15 after the migration landed (decision 9 revised; decisions 15–19 recorded from the migration spec)
- Supersedes, in [ADR-0001](0001-architecture.md): §3 (the library column of the boundary table), §4.0 rule 1 (quantities), §4.1 in full, §4.3 (declaration shape), §4.4 (axis ranges), §5 (`core/compute` and the `standard.ts` / `modelDeclaration.ts` lines), §6 ("quantities, models and standards are all imported from the library"), §7 (v1 scope and acceptance criterion 1), §8 (the interface-drift row). ADR-0001 stays as the pre-meeting baseline; it carries "superseded by ADR-0002" markers and is not otherwise edited.
- Chinese copy: `local-docs/adr/0002-library-interface-model-info.md` (this file is authoritative).

## Context

On 2026-09-13 the project lead settled that the app consumes the metadata interface the main
`jsthermalcomfort` repository (`../jsthermalcomfort`, branch `feat/v2-typescript-setup`) is building for
front ends — issue #184 as landed in 89f5d59 and extended by #193 in 12bf404:

- `ModelInfo` / `VariableInfo` / `Bound`, string-keyed records; `inputs` lists physical quantities only,
  `outputs` and `derived` are separate; `applicability` is a gate, not a clamp.
- One deep-frozen `<MODEL>_INFO` beside each model function, plus the `ClassifierBins` constants it
  references and `classifyFromBins`. Today: `PMV_PPD_ISO_INFO`, `HEAT_INDEX_ROTHFUSZ_INFO`.
- Versioned `Standard` identifiers (`Standard.iso_7730_2005 === "7730-2005"`), `LimitSet`, `is_iso_7730`;
  `pmv_ppd_iso` takes a `model` argument, defaulting to `iso_7730_2025`.
- Root-only imports; there is no `exports` map. The fork's `jsthermalcomfort/io`, `/reference` and
  `/charts` subpaths no longer exist.
- The rule: **numbers come from the package, presentation stays in the front end.** The package
  explicitly does not cover input defaults, which inputs are required, dependencies between inputs
  (`vr` from `v`), unit conversion, error wording, or translations.
- The interface is `@internal Experimental`; its shape may move before release.

The fork (`../../forked repo/jsthermalcomfort`, branch `typescript`) is abandoned. Its `io` /
`reference` / `charts` layers were ADR-0001 §4.1's contract; what the app still needs from them is
either upstreamed to the main repository or moved into the app, per the decisions below. The two
repositories share history (merge-base 35ca0ce), but the fork's commits are TypeScript rewrites of
files the main repository still holds as JavaScript, so nothing is cherry-picked; the fork is a reference.

## Decisions

1. **Library boundary.** The app reads applicability bounds, classifier bins and standard identifiers
   from the package and never transcribes a number. Defaults, input order, entry-group dependencies
   (`v → vr`, operative temperature), unit conversion, warning copy, display names and route segments
   are the app's. Anything a main-repository issue already promises (#199 violations, adaptive
   offsets per #184 §6) may live in the app temporarily and is deleted when the library ships it.
2. **Quantities are an app table.** `core/quantities.ts` holds `{ key, kind, label }` per quantity.
   `key` is the `ModelInfo` key and remains one of the two permitted boundary strings (ADR-0001 §4.0
   rule 2); `kind` keys the display-unit table as before (it is unrelated to the `Bound.kind` that
   #186 dropped). A test checks the table and every registered model's `_INFO` agree in both
   directions. No dependency is added: no package ships this table, and unit conversion is the few
   lines the app already has. ADR-0001 §4.0 rule 1 (one definition, dot access, `===`) is unchanged;
   only the owner of the definition moves.
3. **Declaration shape.** A model is
   `{ info, standard, run, pathSegment, inputs, relativeAirSpeed, axisRanges, table, charts } satisfies RegisteredModel`.
   `inputs` is `{ quantity, value }[]` and `axisRanges` is `{ quantity, min, max }[]` — named fields,
   not tuples, and arrays rather than `Record`s (a string-keyed record would lose identity and trip
   the wire-string lint rule). `run` is the model's positional call, written in the declaration file;
   it takes `Record<key, number>` (assembled by `core/libraryInputs.ts` from the resolved `Map`) and
   returns the model's own result object. `defineModel` and the `LibraryModel` interface are gone.
   Adding a model = the library's `_INFO` + one declaration file + one registry line.
4. **Applicability is evaluated in the app.** `core/applicability.ts` reads `info.inputs` /
   `derived` / `outputs`: entered rows against their bound, `pa` computed as `rh / 100 × p_sat(tdb)`,
   `pmv` from the result. The entered `v` is gated through the derived `vr` and reported on the `v`
   row. A test pins the app's `pa` against the kernel at the 2700 Pa edge; if they disagree, this
   decision reverts to waiting for #199. When #199 lands, its rows replace this module.
5. **Axis ranges: declared, else applicability, else error.** A declared range wins; an undeclared
   quantity falls back to `info.inputs[key].applicability` when both `min` and `max` exist; a quantity
   with neither cannot carry an axis and `requireAxisRange` throws. `axisRangeFor` is kept as the one
   place this rule lives. Risk accepted with eyes open: a missing declaration silently clips a chart to
   the standard's range — the failure ADR-0001 §4.4 avoided by declaring everything; for `pmvIso` six
   of eight quantities still need a declaration (`tdb`, `operative_tmp`, `hr`, `v`, `rh`, `met`).
6. **Standards.** Membership is the declaration's `standard: Standard.<id>`, the same constant passed
   as the model argument, so there is one copy. `ModelInfo` has no membership field and the ASHRAE
   model functions take no standard argument, so the declaration line is what supplies it. Display
   name ("ISO 7730") and route segment (`iso-7730`) are generated in `core/standard.ts` from the
   `Standard` key name by reverse lookup of the value; nothing is written per standard. Reading
   `Object.keys(Standard)` is a boundary-string read under §4.0 rule 2. The ISO edition stays pinned to
   `iso_7730_2005`: both kernels use the pre-2025 `t_cla` form, so the reasoning in the rewrite plan
   (Phase 3.6 item 3) still holds.
7. **Classification** uses `ClassifierBins` + `classifyFromBins`; `core/bandPalette.ts` indexes
   `labels`; Explore thresholds default from `edges`.
8. **Results** are the model's own return object; the table reads `result[key]` for each `table`
   entry; an output whose `VariableInfo` carries a `classifier` reports its category in that result
   field (`tsv` for PMV). There is no `Measure` / `Outcome` layer.
9. **Comfort-zone geometry moves into the app** (`core/compute/`), ported from the fork as pure
   functions: `psychrometricZone` with `trFollowsDb` and the bisect / secant root finders, together
   with their existing oracle tests. It is chart *algorithm*, not a chart; it may be extracted
   upstream when a second consumer appears. ADR-0001 §5's `core/compute/zoneBoundary.ts` returns; the
   rewrite plan's "do not write your own root finder" becomes "port the fork's, do not rewrite it".
   **Revised 2026-09-15:** the adaptive bands are *not* ported with the migration. Porting them now
   would transcribe the fork's offset labels and its 25 °C cooling-effect threshold into the app, and
   nothing in v1 consumes them. They arrive in Phase 4b with `ADAPTIVE_ASHRAE_INFO`, reading labels
   and offsets from it, and the fork's adaptive `describe` blocks are ported with them.
10. **Fork features that are numbers go upstream first.** The four humidity inverse functions
    (`hr_to_rh`, `rh_from_dew_point`, `rh_from_wet_bulb`, `rh_from_vapour_pressure`; fork 43d7e92) are
    a PR to the main repository and a prerequisite for the switch. Not migrated, because nothing reads
    them: `Quantity.siUnit` / `ipUnit`, `unitFor`, `quantityFor`, `Outcome.warnings` / `inputs`,
    `Measure.unit`, `model.description`, `model.editions`, `enCategoryPmvLimits`. Warning copy is
    templated in the app from the `_INFO` numbers.
11. **Thin-wrapper rule.** A function is deleted only when both hold: it carries no app decision
    (no rule, invariant, error or derivation), and its removal scatters no rule and no lint boundary.
    Deleted: `defineModel`, `LibraryModel`, `limitFor` (absorbed by `core/applicability.ts`).
    Kept: `requireAxisRange`, `axisRangeFor` (decision 5), `hasHumidityGroup`, `hasTemperatureGroup`
    (the 2026-09-08 entry-group rule's only home), `core/libraryInputs.ts`, `core/units.ts`,
    `core/chartType.ts`, `core/entryModes.ts`. `core/standard.ts` is rewritten per decision 6.
12. **Lint.** Root-only imports make the subpath rule meaningless. The model-function boundary is
    enforced with `no-restricted-imports` `importNames` listing the model functions, so `Standard`,
    `classifyFromBins` and the psychrometrics remain importable anywhere. The wire-string rule reads
    its keys from `core/quantities.ts`. The `src/ui/charts` boundary is unchanged.
13. **v1 scope** is the models whose `_INFO` the main repository ships at release. The second-model
    acceptance runs on `heat_index_rothfusz`, whose `_INFO` exists today and which exercises the
    humidity group without the temperature group, a classifier, and Explore-only navigation (no
    standard). PMV (ASHRAE 55) and Adaptive (ASHRAE 55) wait for their `_INFO` as Phase 4b. #182
    (shared `limits.json`) is invisible to the app: `_INFO` is the contract, how its constants are
    generated is not.
14. **Linking.** `file:../jsthermalcomfort` to a local checkout of the main repository during the
    migration (on the branch carrying the decision-10 PR until it merges), then `jsthermalcomfort@next`
    pinned once the lead publishes it. The `.d.ts` bugs of #196 only surface against an installed
    package, so the published form is the final one.

## Amendments (2026-09-15)

Decisions taken while writing and executing the migration spec (`.scratch/adr-0002-migration/spec.md`,
commits `bf95aac` … `9c6df55`) that go beyond the fourteen above. The fourteen are left as written.

15. **Drift test, direction 2, checks every exported `_INFO`.** Decision 2's "every registered model's
    `_INFO`" is widened: every table key must appear in some `_INFO` the package root exports, registered
    or not. So the `hi` and `stress_category` rows pre-exist their model and Phase 4 stays a two-file change.
16. **The vapour-pressure entry quantity is keyed `pa`**, the ISO derived key, and is one quantity. The
    entered vapour pressure is `rh / 100 × p_sat(tdb)` by construction (`rh_from_vapour_pressure` is its
    inverse) and decision 4 defines the derived `pa` with the same formula. The fork's `p_vap` key is gone.
17. **The dynamic chart's `output` names the classified output** (`tsv` for PMV, `stress_category` for
    Heat Index). Its band list is `classifier.labels` in order; each grid cell's band is
    `labels.indexOf(result[output])`, `null` when NaN. The grid does not call `classifyFromBins`: the kernel
    already classified the unrounded value, and re-classifying a rounded output would disagree at the
    edges. `classifyFromBins` is for a number the model did not classify (Explore thresholds).
18. **The zone solver's model argument is a PMV closure** `(tdb, tr, vr, rh, met, clo) => number`,
    written in the declaration file beside `run` and binding the same standard constant, so the zone and
    the table cannot run different kernels.
19. **A `category` kind** in `core/quantities.ts` for classified outputs (`tsv`, `stress_category`): no
    unit symbol, no step. `pmv` keeps `thermalSensation`.

## Consequences

- ADR-0001 §4.1.2's "the app never evaluates a row" is reversed until #199 lands.
- The ASHRAE cross-field air-speed rule has no `_INFO` row; it is decided in Phase 4b with the model
  on screen, as before.
- The experimental shape can move. Every read of `_INFO` goes through `core/quantities.ts`,
  `core/applicability.ts` and the declaration files, so a shape change is confined to those.
- Phases 1 and 2b of the rewrite plan were done in the fork and are superseded; Phase 3.7 is blocked
  on an upstream `PMV_PPD_ASHRAE_INFO`; Phase 4's model changes (decision 13).
- The `ClassifierBins.right: boolean` shape contradicts #186's own "`closed: left | right`, never
  `right: boolean`"; the app consumes what ships and does not raise it (lead's call, 2026-09-13).
- The fork's "writes nothing to the console" test was dropped with the migration: the main repository's
  `cooling_effect` still logs, and v1 calls no ASHRAE model. `suppressWarnings` is raised in the main
  repository, not the fork, before the Phase 4b grid scan (rewrite plan, Phase 4b).
