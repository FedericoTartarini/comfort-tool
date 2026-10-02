# ADR-0002 · Library interface: the jsthermalcomfort main repository's `ModelInfo` replaces the fork contract

- Status: accepted (2026-09-13, decision taken with the project lead; details settled the same day); amended 2026-09-15 after the migration landed (decision 9 revised; decisions 15–19 recorded from the migration spec); decision 20 added 2026-09-15 while closing Phase 3.6 (presets); decisions 21–26 added 2026-09-17 from the library-boundary audit (`.scratch/library-boundary/spec.md`; 21 restated the same evening when the temporary library was decided); decisions 22 and 23 revised 2026-09-19 (integration branch retired, no PRs; what the `warnings` field shipped as); decisions 27–31 added 2026-09-21 from the grilling session on the Worker boundary and the band editor (`.scratch/numeric-scan-and-model-name/spec.md`); decision 27 revised 2026-09-22 when that spec landed (one constraint contour per Band; how `bands` is spelled); decisions 32–35 added 2026-09-22 from the grilling session on the four tickets that spec's close-out left behind (switching models, what the gate freezes, the shape of `run`, the unrounded `run`), with decisions 3 and 27 revised the same day; decision 32 revised 2026-09-22 when the model-switch feature landed (every in-app way of switching asks, not only the select; where the rehearsal lives); decision 36 added 2026-09-23 from the Phase 4b grilling (`.scratch/phase-4b/spec.md`) when the option contract landed, revising decision 34; decisions 34 and 36 revised 2026-09-25 when the app moved onto the library's params objects (`.scratch/library-v2-migration/`), and decision 30 the same day when it read the model's name from the model info, and decision 24 the same day when the zone solver took one params object, and decisions 8 and 31 the same day when the PMV (ISO 7730) page drew categories A, B and C; decision 35 revised 2026-09-26 at that pass's close-out, when `utci`'s `round_output` closed its upstream gap, and decision 3 the same day to point at decisions 30 and 34's notes; decision 37 added 2026-09-27 when the dynamic chart split into a scanned and a polygons shape, amending decision 27; decision 38 added the same day when the registry-wide tests were restated for a model with no scanned output and gained the silence test, amending decision 35; decision 24 revised the same day when the temporary library drew Adaptive's bands and its fence stopped barring model functions; decision 38 noted the same day at Phase 4b's close-out (the registry it describes); decisions 1, 9 and 13 noted the same day (`ADAPTIVE_ASHRAE_INFO` shipped without `offsets`); decision 39 added 2026-09-28 when the switch into operative entry took the model's standard (Phase 4b ticket 11); decision 37 amended and decision 39 noted the same day when the operative marker took the library's `t_o` (Phase 4b ticket 12); decisions 32 and 33 amended and decision 40 added the same day from the review after Phase 4b (`.scratch/review-after-4b/decisions.md`, Proposals 1 to 3); decisions 10, 31 and 37 noted, decision 29 amended, decisions 41 and 42 added and one Consequences bullet amended and one noted the same day from the same review (Proposals 12 to 23); decision 6 amended the same day when the ISO 7730 pin moved to 2025 (same review, Proposal 27); decision 43 added the same day when the address reached the session through the router's after-load hook (same review, Proposal 26); decision 24 amended the same day when the temporary library's tests took the library's imports and dropped their module mock (same review, Proposal 34); decision 4 noted the same day when the air-speed warning took the relative air speed's label (same review, Proposal 31); decision 8 noted the same day when PMV (ASHRAE 55)'s table took its `compliance` as Yes or No (same review, Proposal 29); decision 7 noted the same day when a classifier longer than the palette started to throw (same review, Proposal 32); decision 8 noted the same day when the stress category's label became "Thermal stress category" (same review, Proposal 33); decision 37 noted the same day when a polygons chart answered hover through a hover grid (same review, ticket 32); decision 44 added the same day when the zone legend's limit took the number formatter (same review, Proposal 25); decision 45 added the same day when humidity ratio took a display unit that tells its values apart (same review, Proposal 24); decision 46 added and decision 32 amended the same day when relative humidity was bounded 0 to 100 by its quantity kind (same review, Proposal 30); decision 41 amended the same day when its spelling was widened to the names the code has (same review, Proposal 36); decision 48 added and decision 3 revised the same day when whether a model takes the relative air speed was read from its model info (same review, round 16); decision 47 added and decisions 32 and 37 noted the same day when the slot took its own module in core (same review, round 16); decision 47 noted 2026-09-29 when the slot's two entries became read-only outside the class, and its module's reach narrowed to what the code holds (`.scratch/slot-shape/` ticket 08); decisions 23 and 32 noted the same day when `outOfRangeInputs` became `outOfRangeQuantities` (review after Phase 4b, round 17); decision 37 noted the same day when `ChartDeclaration` and its members became `DeclaredChart` and `Declared…Chart` (same review, round 17); decision 49 added the same day from the Phase 4c grilling, when atmospheric pressure became session state held in pascals (`.scratch/atmospheric-pressure/spec.md`), and decision 45 amended with it, when the psychrometric chart's humidity-ratio axis followed the pressure; decision 49 noted the same day at Phase 4c's close-out, where two of its sentences said more than the code (`.scratch/atmospheric-pressure/` ticket 05); decisions 50 to 53 added the same day from Compare's grilling, ahead of the code (Compare without a baseline, the session's entry mode, a gate per slot and one question per switch, no pressure-dependent bound at a pressure out of range), amending decisions 32, 33, 46, 47 and 49; decision 29 amended and decision 50 noted 2026-09-30 when three compared slots' scans were measured and v1 stayed synchronous (`.scratch/compare/` ticket 01); decisions 50 to 53 noted the same day at Compare's close-out, for the sentences written ahead of the code that said more than it, or less (`.scratch/compare/` ticket 09); decision 54 added 2026-09-30 from the grilling of `.scratch/activity-adjusted-inputs/` 01 and 02, ahead of the code (an activity-adjusted input is an entry group with two entry modes; the clothing correction is the standard's rule; the library's two clothing corrections first), with decision 48 revised and decision 51 amended (the link writes the entry modes once) the same day; decision 54 revised again 2026-09-30 from the third grilling of that folder, ahead of its tickets 08 and 09 (the ISO clothing correction at every metabolic rate; one converted-bound rule for both activity-adjusted groups; both groups invert on the switch back), with decisions 32 and 46 noted the same day; decision 55 added 2026-10-01 with the user after that folder's ticket 09, ahead of the code (a slot holds the number its row shows, at most two decimals in the displayed unit), amending ADR-0001 §4.6, with decisions 32, 39, 45, 46 and 54 noted the same day; decision 56 added 2026-10-01 with the user, the same day, withdrawing decision 55 before its tickets 03 to 06 landed (two decimals are the app's one precision: state stays full-precision SI, the gate compares at the formatter's precision in the SI display unit, a test of a shown number asserts at it), restoring ADR-0001 §4.6, with decision 55's five notes marked withdrawn the same day; decision 56 revised the same day (rule 3: a range end steps one shown digit inward where typing it back would be stopped) and noted the same day at its close-out (`.scratch/one-precision/` ticket 06), for the sentences written ahead of the code that said more than it, with its last sentence naming that folder's commits, decision 55's five withdrawn notes pointing at the commits that built them, and the first Consequences bullet amended; decisions 32, 48, 51 and 54 noted 2026-10-01 at the close-out of `.scratch/activity-adjusted-inputs/` (ticket 05), for the sentences written ahead of the code that say more or less than it; decisions 57 to 60 added 2026-10-01 from the grilling of Phase 5 item 3, ahead of the code (pages, the page decides what the charts paint, the Band list, the palette table), with decisions 8, 27, 31, 37, 51, 52 and 53 noted, revised or amended the same day; decision 61 added 2026-10-02 from the grilling of `.scratch/explore/` ticket 08's open point 1, ahead of the code (every chart not declared polygons is one scan, contoured; the scanned output is the model's), revised in place the same day before its first ticket landed, with decisions 24, 27, 29, 37, 58 and 59 amended, revised or noted the same day; decisions 7, 31, 53 and 57 to 61 noted and one Consequences bullet amended 2026-10-02 at the close-out of `.scratch/explore/` and `.scratch/one-scan/` (`.scratch/explore/` ticket 09), for the sentences written ahead of the code that say more or other than it; decision 62 added 2026-10-02 from the grilling of three chart changes, ahead of the code (the adaptive chart its own type and builder, the declaration hands limit lines, one drawing order from shared fills and outlines), with decisions 27, 37 and 61 amended the same day
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
   **Noted 2026-09-27 (Phase 4b close-out).** The adaptive offsets never lived in the app, and #184 §6's field did
   not ship; see decision 9's note.
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
   **Revised 2026-09-21:** `pathSegment` is replaced by `name`, the library's function name (decision 30).
   **Revised 2026-09-22:** `run` no longer takes `Record<key, number>`. It stays the positional call written in
   the declaration file, and reads its values by `Quantity` (decision 34).
   **Revised 2026-09-26 (pointing at decisions 30 and 34's notes of 2026-09-25):** `run` is no longer a positional
   call: it passes the model one params object, each key written by name (decision 34). `name` left the declaration
   too; the model's name is read from `info.name` (decision 30).
   **Revised 2026-09-28:** `relativeAirSpeed` left the declaration; whether a model takes the relative air speed is
   read from its model info (decision 48).
4. **Applicability is evaluated in the app.** `core/applicability.ts` reads `info.inputs` /
   `derived` / `outputs`: entered rows against their bound, `pa` computed as `rh / 100 × p_sat(tdb)`,
   `pmv` from the result. The entered `v` is gated through the derived `vr` and reported on the `v`
   row. A test pins the app's `pa` against the kernel at the 2700 Pa edge; if they disagree, this
   decision reverts to waiting for #199. When #199 lands, its rows replace this module.
   **Noted 2026-09-28 (review after Phase 4b, Proposal 31; `P003`).** The row the library reports on `vr` stays on the
   entered `v`, but its sentence names the quantity the bound belongs to: it reads the relative air speed's label and
   display unit, so an entered 0.15 m/s is not told that air speed must be at most 0.2 m/s.
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
   **Amended 2026-09-28 (review after Phase 4b, Proposal 27; `P023`).** The ISO edition is pinned to `iso_7730_2025`.
   The reason above no longer holds: the library's kernel now follows ISO 7730:2025 Annex D, and the library lists 2025
   first, so the 2005 pin captioned numbers computed the 2025 way as 2005.
7. **Classification** uses `ClassifierBins` + `classifyFromBins`; `core/bandPalette.ts` indexes
   `labels`; Explore thresholds default from `edges`.
   **Revised 2026-09-21:** an Explore Band list is the `ClassifierBins` itself plus colours, a copy rather than a
   conversion (decision 31).
   **Noted 2026-09-28 (review after Phase 4b, Proposal 32; `S008`, `ST01`).** Painting by position no longer wraps round
   the seven-colour palette: a classifier with more labels than the palette has colours throws, naming the classifier
   by its first and last labels, where it painted its last bands in the first colours. No registered classifier is
   that long; UTCI's `stress_category`, with ten labels, is. Which palette a classifier gets is decided once, at
   Phase 5 item 3 (the Explore threshold editor), as an ADR-0002 decision of its own
   (`.scratch/review-after-4b/deferred.md`, `P004`). The fill function is `fillAtIndex`, so it no longer shares a name
   with the chart spec's `BandFill`.
   **Noted 2026-10-02 (`.scratch/explore/` ticket 09).** Decided as decision 60 and built as `e39791a`: the
   seven-colour palette and `fillAtIndex` are gone. Colours come from a table keyed by the classifier object
   (`bandColors`, `colorForBand`, `core/bandPalette.ts:84-115`), which throws, naming the classifier, when it has no
   entry or its colour family has no colours at the classifier's band count (`:92`, `:96`).
8. **Results** are the model's own return object; the table reads `result[key]` for each `table`
   entry; an output whose `VariableInfo` carries a `classifier` reports its category in that result
   field (`tsv` for PMV). There is no `Measure` / `Outcome` layer.
   **Revised 2026-09-25 (`.scratch/library-v2-migration/`, ticket 04):** the Compliance column prints each classified
   output as its quantity's `Quantity.label` and its category, `Thermal sensation: Neutral`, `ISO 7730 category: B`,
   each with a swatch from that output's own classifier. It rendered the category alone, so the ISO page's new
   `category` sat unlabelled beside `tsv`. One change to the table component, for every model (Heat Index reads
   `Heat stress category: caution`); ADR-0001 §4.3's Compliance sentence is amended with it.
   **Noted 2026-09-28 (review after Phase 4b, Proposal 29; `P029`).** A yes-or-no output is a column of the model's
   `table`, not a Compliance entry: its heading is its `Quantity.label` and its cell reads Yes or No, uncoloured, as
   Adaptive's `acceptability_80` and `acceptability_90` do. PMV (ASHRAE 55)'s `compliance` is one, listed after `pmv`
   and `ppd` in the library's order. ADR-0001 §4.3's clause colouring an `intervals` entry pass or fail is retired
   with it.
   **Noted 2026-09-28 (review after Phase 4b, Proposal 33; `S009`, `P005`).** `stress_category`'s `Quantity.label` is
   "Thermal stress category", so Heat Index reads `Thermal stress category: caution`. UTCI's `stress_category` shares
   the row and its classifier runs from extreme cold stress to extreme heat stress, which a heat-only label misreads;
   relabelling when UTCI lands would touch a third file.
   **Noted 2026-10-01 (decision 60).** The swatch's colours come from a palette chosen per classifier; ISO's "none" has
   no swatch; and the swatch is not matched to the chart's zone, which is in the slot's hue
   (`.scratch/compliance-column/` 01 and 02 closed).
9. **Comfort-zone geometry moves into the app** (`core/compute/`), ported from the fork as pure
   functions: `psychrometricZone` with `trFollowsDb` and the bisect / secant root finders, together
   with their existing oracle tests. It is chart *algorithm*, not a chart; it may be extracted
   upstream when a second consumer appears. ADR-0001 §5's `core/compute/zoneBoundary.ts` returns; the
   rewrite plan's "do not write your own root finder" becomes "port the fork's, do not rewrite it".
   **Revised 2026-09-15:** the adaptive bands are *not* ported with the migration. Porting them now
   would transcribe the fork's offset labels and its 25 °C cooling-effect threshold into the app, and
   nothing in v1 consumes them. They arrive in Phase 4b with `ADAPTIVE_ASHRAE_INFO`, reading labels
   and offsets from it, and the fork's adaptive `describe` blocks are ported with them.
   **Superseded by decision 24 (2026-09-18):** the zone solver, the root finders and the oracle live in
   `src/temporary-library/`, and `core/compute/` is deleted. The solver is `pmv_psychrometric_zone`, and
   the closure it takes is a `PmvFunction`, built from `run` (decision 18 as revised 2026-09-18).
   **Noted 2026-09-27 (Phase 4b close-out).** The 2026-09-15 revision's "reading labels and offsets from it" did not
   happen: `ADAPTIVE_ASHRAE_INFO` shipped without an `offsets` field, and the app needs none. The bands are
   `adaptive_ashrae_zone` in `src/temporary-library/` (decision 24), which calls `adaptive_ashrae` at chosen points
   and reads only the running-mean bound from `ADAPTIVE_ASHRAE_INFO`. The band labels are the app's quantity labels
   for `acceptability_80` and `acceptability_90` (decision 2). One number is transcribed: the 25 °C cooling-effect
   onset, which the model applies but does not return. The oracle is the deployed chart's vertices, not the fork's
   `describe` blocks.
10. **Fork features that are numbers go upstream first.** The four humidity inverse functions
    (`hr_to_rh`, `rh_from_dew_point`, `rh_from_wet_bulb`, `rh_from_vapour_pressure`; fork 43d7e92) are
    a PR to the main repository and a prerequisite for the switch. Not migrated, because nothing reads
    them: `Quantity.siUnit` / `ipUnit`, `unitFor`, `quantityFor`, `Outcome.warnings` / `inputs`,
    `Measure.unit`, `model.description`, `model.editions`, `enCategoryPmvLimits`. Warning copy is
    templated in the app from the `_INFO` numbers.
    **Noted 2026-09-28 (review after Phase 4b, Proposal 12; `S100`).** `quantityFor` is not in that list any more: the
    app defines its own lookup from an `_INFO` key to its `Quantity`, `quantityFor(key)` in `core/quantities.ts`, added
    with the quantities table the day after this decision (`bf95aac`). It has three readers: `core/applicability.ts`
    twice, mapping a row's key to its quantity, and `classifiedOutputs` in `core/resultCell.ts`, finding a classified
    output's quantity, a read that was `ResultTable.svelte`'s until `284a30e` moved it into core. The rest of the list
    stands.
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
    **Amended 2026-09-27 (decision 24).** The model-function boundary no longer covers `src/temporary-library/`.
13. **v1 scope** is the models whose `_INFO` the main repository ships at release. The second-model
    acceptance runs on `heat_index_rothfusz`, whose `_INFO` exists today and which exercises the
    humidity group without the temperature group, a classifier, and Explore-only navigation (no
    standard). PMV (ASHRAE 55) and Adaptive (ASHRAE 55) wait for their `_INFO` as Phase 4b. #182
    (shared `limits.json`) is invisible to the app: `_INFO` is the contract, how its constants are
    generated is not.
    **Noted 2026-09-27 (Phase 4b close-out).** Both `_INFO` shipped and both models are registered (`58ba1bb`,
    `c1ef5e1`). Neither carries what the Phase 4b prerequisite once asked for: the ±0.5 interval is the library's
    `PMV_COMPLIANCE_INTERVAL_ASHRAE`, and Adaptive's bands come from calling the model (decision 9's note).
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
    **Revised 2026-09-21:** `output` names the numeric output and `bands` its classifier; the grid keeps the number
    (decision 27). The rounding this guarded against ended with decision 18's revision.
18. **The zone solver's model argument is a PMV closure** `(tdb, tr, vr, rh, met, clo) => number`,
    written in the declaration file beside `run` and binding the same standard constant, so the zone and
    the table cannot run different kernels.
    **Revised 2026-09-18:** the declaration no longer writes it. `run` returns unrounded output
    (`round_output: false`; `formatNumber` rounds for display, so PPD shows two decimals), and the
    psychrometric chart builds the closure from `run` at the slot's resolved inputs, reading `pmv` off the
    result. The zone and the table now make the same call by construction, and a model declaring the chart
    must output `pmv`. `applicability.outputViolations` now also tests the unrounded `pmv` against its
    bound, which is the value the kernel's own `pmv` range check tests.
19. **A `category` kind** in `core/quantities.ts` for classified outputs (`tsv`, `stress_category`): no
    unit symbol, no step. `pmv` keeps `thermalSensation`.

Taken after the migration, while closing Phase 3.6 (spec `.scratch/presets-and-model-select/spec.md`):

20. **Presets hang off the Quantity, not the declaration.** ADR-0001 §4.3 made `presets` a declaration field; that
    clause falls with the rest of §4.3. `core/presets.ts` binds `met` to `met_typical_tasks` and `clo` to the library's
    typical ensembles once, and `presetsFor(quantity)` answers for every model, because no model wants a different list
    and a declaration field would be copied verbatim into every PMV declaration. The module reads the tables' keys as the
    list's labels — a §4.0 rule 2 boundary read, like `core/standard.ts` reading `Object.keys(Standard)` — and transcribes
    no label and no number: keys that are not human-readable, and a table published only as a function, are fixed
    upstream. A preset is never state: the slot holds the number a preset commits, and nothing remembers which preset it
    came from. `clo_individual_garments` is not a preset table; it is the Phase 5b custom-ensemble calculator's data.

Taken 2026-09-17, in the library-boundary audit (spec `.scratch/library-boundary/spec.md`), which sorted every export of
`src/core` and `src/models`:

21. **The boundary test, restated as four rules applied in order.** (A) What pythermalcomfort has, jsthermalcomfort
    must have: parity is the lead's roadmap (#203); the app records the gap in `.scratch/library-boundary/spec.md` and
    opens a ticket or PR only when a phase consumes an item, which is then ported upstream first on the integration branch
    and consumed from there, never copied into the app under any name. (B) What jsthermalcomfort has, the app imports.
    (C) A standalone calculation neither has — a pure function from SI numbers to SI numbers or geometry, reading no
    label, display unit, colour, route, slot or `Quantity` — is the app's *temporary library* (decision 24). (D)
    Everything that reads those is app code. Under these rules everything in `src/core` and `src/models` is app code
    except what decisions 22–24 name. Decision 9's "may be extracted upstream when a second consumer appears" is replaced
    by decision 24. ADR-0001 §3 exception 1 (unit conversion in the app) stands: all state is SI, only the UI converts,
    and `units_converter` produces fps and atm where the tool shows fpm, kPa and inHg. The operative split
    `tdb = tr = operative_tmp` is an entry convention, not an equation, and stays in `core/libraryInputs.ts`; the humidity
    modes are pairs of library calls.
22. **Library changes the app needs are made upstream first, on the integration branch.** Decision 14's branch name is
    corrected: the app links `local/comfort-tool-integration` in `../jsthermalcomfort`, a local branch stacked on the tip
    of `feat/v2-typescript-setup` that carries every unmerged change the app consumes. On 2026-09-17: the four humidity
    inverses (`dcca8b9`, merged as PR #207 the same day), the `pmv_ppd_iso` JSDoc fix (`ea4a6f5`, merged as PR #208 the
    same day), the keyed preset tables under pythermalcomfort's three names (`1daa7d9` + `0c1ba4d`, squash-merged as
    PR #210 on 2026-09-18), decision 23, and decision 25 (`ece6dec`, merged as PR #211 on 2026-09-19, so the base is
    now `bd39652`). Each such change is consumed from the rebuilt `lib/esm`, opened as a PR by hand and never by an agent, and its ticket states the fallback if the lead
    declines, so a refusal is a planned move rather than a surprise. Decision 14's `jsthermalcomfort@next` pin applies once
    the lead publishes.
    **Revised 2026-09-19:** `local/comfort-tool-integration` is retired. Library changes the app needs, decision 23's
    and every later one, are committed directly to `feat/v2-typescript-setup`, which `../jsthermalcomfort` has checked
    out and the user pushes; no PR is opened for them, so the per-ticket fallback no longer applies. The app links that
    checkout as before, from its rebuilt `lib/esm`.
23. **Applicability warnings come from the result** (#199 option (a), the lead's own first choice). `pmv_ppd` gains an
    additive `warnings` field, `{ key, role: "input" | "derived" | "output", value, bound }[]`, built from the checks the
    kernel already runs and from the model's `_INFO`: empty when nothing broke, filled whether or not `limit_inputs` is on
    (with `limit_inputs: true` the numbers still become NaN; the rows say why). The `pa` row carries the kernel's own value,
    which ends the disagreement between the kernel's Fanger exponential and `psy_ta_rh`'s `p_sat` that decision 4's test
    tolerated within 0.1 % RH. Decision 4 then shrinks to what the screen owns: the bound shown beside an input (`tdb ∩ tr`
    under operative entry), the row colouring, and the sentence. `vapourPressure`, `boundFor`, `breaksBound`,
    `derivedViolations` and `outputViolations` leave `core/applicability.ts` when the field lands on the integration
    branch. Fallback if the lead declines: the walk returns to `core/applicability.ts` as app code and this decision
    records his reason.
    **Revised 2026-09-19:** landed as `e31a562` on `feat/v2-typescript-setup` (decision 22 as revised), so the fallback
    is moot. The rows' checks and bounds match pythermalcomfort 4.6.0, including ASHRAE 55's airspeed rules when the
    occupant cannot control the airspeed (so `vr` can have more than one row). Filling them whatever `limit_inputs` is
    stays the one deviation from Python, which warns only with `limit_inputs` on; the app needs it because it always
    passes `false`. The `limit_inputs` gate reads the rows, so a NaN and its explanation cannot disagree, and
    `check_standard_compliance` is unchanged. Ticket 05 is unblocked.
    **Revised 2026-09-19 (ticket 05, `faac928`):** `vapourPressure`, `derivedViolations` and `outputViolations` are
    gone. `boundFor` and `breaksBound` stay: the pre-call gate decision 4 keeps (`enteredBound`, `outOfRangeInputs`)
    checks entered values against `info.inputs` with them. No row of a completed run is evaluated in the app.
    **Noted 2026-09-29 (review after Phase 4b, round 17; `S083`).** `outOfRangeInputs` is now `outOfRangeQuantities`.
    What it returns is the quantity of each entered value out of range, which need not be one of a model's inputs: a
    dew-point entry out of range is returned as the dew point, which no model takes.
24. **Temporary library.** `src/temporary-library/` holds rule-C members until jsthermalcomfort ships them. Written to
    the library's conventions — snake_case names, positional SI arguments plus a kwargs object, JSDoc on the function,
    tests in the library's shape — so that a move upstream is a file cut, and lint-restricted to importing
    `jsthermalcomfort` alone, nothing from `src/`. First members: the psychrometric zone solver, the two CBE root finders
    it needs, the oracle fixture `chart-online.json`, and their tests. The root finders move with the zone because the
    chart is meant to reproduce the deployed tool vertex for vertex, defects included (`correctKnownDefects` stays
    opt-in); exporting the library's internal `brent` is not asked. A member may stay for good if the lead keeps the
    library at pythermalcomfort parity: the seam is the point, not the move.
    **Revised 2026-09-25 (`.scratch/library-v2-migration/`, ticket 03):** the library's convention is now one params
    object, and the temporary library's public solver follows it: `pmv_psychrometric_zone` takes `{ tr, vr, met, clo,
    pmv_function, pmv_limit, … }`, with `pmv_limit` required and no default, so every caller names its zone. The PMV
    closure stays positional (decision 18). The root finders stay positional, as the library's internal `brent` is: they
    are the solver's helpers, not models. "`correctKnownDefects` stays opt-in" is retired: the switch, its
    saturation-line `0.5` and the secant's `[0, 100]` clamp are deleted, and the bisection fallback stays. Measured
    2026-09-25 on every fixture zone at its own limit: no solved edge moved and the coolest root was 11.3 °C. The
    fixture's ISO ±0.2 and ±0.7 rows, the only ones the saturation-line defect fitted, were the deployed ASHRAE page's
    tracer run at EN limits, not a published chart, and were removed in ticket 01. Without the clamp the secant is
    started from −50 and 50 °C but not confined to them, so a target the kernel reaches only outside that range comes
    back as a root rather than as an unsolved row.
    **Revised 2026-09-27 (`.scratch/phase-4b/`, ticket 08):** the fence is the `src/` boundary alone. Decision 12's
    model-function rule no longer covers the temporary library: it is library code, and calls a model as the library's
    own functions do. Its second member, `adaptive_ashrae_zone`, draws Adaptive's acceptability bands by calling
    `adaptive_ashrae` at chosen points, so the standard's coefficients stay the library's. The PMV closure is unchanged:
    decision 18 keeps it so the zone and the table run one kernel, not to satisfy the lint. The app's wire-string rule
    still applies to its source, so a band is named by an object key, `acceptability_80`, not by a string literal.
    **Amended 2026-09-28 (review after Phase 4b, Proposal 34; `P022`).** The tests stay on vitest. "Tests in the
    library's shape" means a test moves upstream by its import lines and nothing else: it takes `describe`, `it` and
    `expect` from `vitest` where the library's take them from `@jest/globals`, writes a relative import with the file's
    own extension and a type on its own `import type` line, as the library's TypeScript tests do, and calls no API only
    vitest has, so it mocks no module. A test that needs a stand-in for a model passes it to an underscore-prefixed
    internal that takes the model as a parameter; the public function calls that internal with the library's model.
    **Amended 2026-10-02 (decision 61).** The first members are deleted: the zone solver and the two root finders go
    with the psychrometric chart's contouring, nothing having moved upstream. `chart-online.json` stays, read by the
    app's criterion-3b test. The members are `adaptive_ashrae_zone`, `v_relative_inverse` and `clo_dynamic_inverse`.
25. **`_INFO` carries its standards** (upstream, `.scratch/library-boundary/issues/06`). `ModelInfo` gains
    `standards: readonly Standard[]`: every edition the function accepts, the function's default first; the ASHRAE
    functions get a one-element list. A standard is a property a model declares and several models may share, defined
    once as `Standard` and referenced from `_INFO`; the constant keeps its name (pythermalcomfort's `Models` enum has the
    same keys and values; its `iso_9920_2007`, missing here, is a gap-record entry). The declaration keeps
    `standard: Standard.<id>` as its edition pick, and `core/modelDeclaration.test.ts` asserts the pick is in
    `info.standards`. The field landed as PR #211 on 2026-09-19, so decision 6's "ModelInfo has no membership field" no
    longer holds.
26. **Reference tables carry pythermalcomfort's names** (ticket 03 amended): `met_typical_tasks`,
    `clo_typical_ensembles`, `clo_individual_garments`, all table objects; the `clo_typical_ensembles` lookup function and
    the `clo_typical_ensembles_table` name go. `core/presets.ts` imports those names and stays app code, since
    pythermalcomfort has no preset concept. Fallback if the lead declines: the app keeps importing
    `clo_typical_ensembles_table`.

Taken 2026-09-21, in a grilling session on what the dynamic chart scans and how a model is named (spec and tickets in
`.scratch/numeric-scan-and-model-name/`, the two measurement scripts kept beside them):

27. **The dynamic chart scans the number; the declaration pairs it with its classifier.** Revises decision 17. `output`
    names the numeric output (`pmv`, `hi`), and a new `bands` field holds the `ClassifierBins` that cut it, referenced by
    dot access from the model's `_INFO` (`PMV_PPD_ISO_INFO.outputs.tsv.classifier`). It is an object reference: nothing in
    `_INFO` says which quantity a classifier cuts, and no key string pairs the two. Each grid cell keeps
    `result[output]`, and the surface is contoured at the edges. Decision 17's reason, that re-classifying a rounded
    output would disagree with the kernel at the edges, ended on 2026-09-18 when `run` became unrounded (decision 18 as
    revised): both kernels call `classifyFromBins` on the unrounded SI value, and the app imports the same function and
    the same bins. A drift test pins it for every registered model: `classifyFromBins(result[output], bands)` equals the
    result's own category, the classified output being the `info.outputs` entry whose `classifier === bands`, over a
    sample that includes the edges. Why the number: a band index carries no sub-cell information, so the drawn boundary
    sat half a cell from the true crossing whatever the grid (0.5 % of the axis at 100×100, 2.5 px on a 500 px plot),
    while interpolating the number places it within a pixel on a coarser grid (decision 28); and Explore's editable
    bands re-bin stored numbers instead of re-running the model. The result table is unchanged: it shows the kernel's
    own category (decision 8).
    **Revised 2026-09-22 (ticket 07, `042c0f7`).** "The surface is contoured at the edges" is implemented as **one
    constraint contour per Band, drawn on the model's number itself**. A single Plotly contour trace draws levels at
    one fixed spacing, and a classifier's Edges need not be evenly spaced (Heat Index's are 27, 32, 41, 54, 1000), so
    each Band names its own interval instead: its upper Edge, and its lower Edge except for the first, which is open
    below. Ticket 03's interim remap onto a band-position scale is gone, and with it its closing note that the remap's
    top knot was missing from this decision — there is no remap left to describe. Second: `bands` is written as
    `<MODEL>_INFO.outputs.<key>.classifier` only where that types as defined. `VariableInfo.classifier` is optional,
    so both declarations written so far name the library's exported bins constant instead
    (`PMV_THERMAL_SENSATION_VOTE_BINS_ISO`, `HEAT_INDEX_STRESS_CATEGORY_BINS`) — the same object either way, and
    never a cast or a `!`; the pairing is the object identity, which is what the drift test reads, so which spelling
    reaches it does not matter.
    **Revised 2026-09-22 (decision 35).** The drift test proves the bands are the kernel's. It does not detect a
    `run` that rounds, which this decision leaned on it for; that is pinned by a test of its own.
    **Amended 2026-09-27 (decision 37).** `output` and `bands` are the scanned chart's, one of the dynamic chart's two
    shapes; a polygons chart declares neither.
    **Amended 2026-10-01 (decisions 58 and 59).** "Explore's editable bands re-bin stored numbers" is the Band list of
    `core/bands.ts`, one per model; and on the Explore page the psychrometric chart is a scan of the same `output` too.
    **Amended 2026-10-02 (decision 61).** `output` and `bands` are the model's `scan`, not a chart's, `bands` named
    `classifier` there; both charts scan it, on every page.
    **Amended 2026-10-02 (decision 62).** "One constraint contour per Band" is one `contourFill` per Band, over the
    interval this decision gives it, and one `contourLine` at its upper Edge; the contiguous top is computed in
    `bandsFor`, not the Plotly adapter.
28. **`GRID = 51`.** Amends ADR-0001 §2 "Precision" (100×100). 51 points are 50 intervals, so the SI steps are round
    (0.6 °C, 0.06 met, 2 % rh). One count for every axis rather than a step per quantity: the accuracy that matters is
    on screen and a count gives every axis the same, the cost per chart is fixed (2,601 calls), and no per-quantity
    number has to be maintained. Measured 2026-09-21 on eight charts (ISO and ASHRAE PMV, Heat Index; five axis pairs):
    the error of the drawn boundary between grid lines against a bisected reference, in pixels of a 500 px plot, worst
    chart per row, with the ASHRAE `tdb × v` scan time on the development machine.

    | `GRID` | cell | p95 error | max error | ASHRAE scan |
    |---|---|---|---|---|
    | 21 | 25 px | 3.98 px | 15.6 px | 15 ms |
    | 31 | 16.7 px | 1.49 px | 16.7 px | 32 ms |
    | 41 | 12.5 px | 1.31 px | 9.8 px | 57 ms |
    | **51** | **10 px** | **0.74 px** | 8.6 px | **88 ms** |
    | 61 | 8.3 px | 0.65 px | 9.1 px | 129 ms |
    | 81 | 6.3 px | 0.60 px | 5.6 px | 224 ms |
    | 101 | 5 px | 0.54 px | 4.2 px | 349 ms |

    51 is the smallest grid whose worst chart is sub-pixel at p95. Past it the error floors near 0.5 px, because the
    ASHRAE surface jumps where the cooling effect switches on and no grid locates a jump better than one cell, while the
    cost grows with the square. The max column is pessimistic: it is measured along an axis, so a boundary running
    nearly parallel to that axis turns a small perpendicular error into a large one. A machine three times slower still
    runs 51 inside ADR-0001 §4.7's 300 ms line; 61 would not.
29. **No Worker in v1.** Supersedes ADR-0001 §2 "Computation" and §4.7's Worker, Comlink, stale-result stamp and
    "computing" indicator, and makes moot §6's note that the worker boundary must re-hydrate applicability rows. The
    Worker existed for one measurement, ASHRAE PMV at 340 ms per 100×100 scan; at decision 28's grid that scan is 88 ms.
    Staying synchronous also means no structured-clone boundary has to be designed for `ChartRequest`: the model's
    functions, its `Map<Quantity, number>`, `humidityMode`'s conversions and every identity comparison stay as they are.
    `state/compute.svelte.ts` is still redesigned, since its `$effect` assigns state and reaches for `untrack`, but as
    synchronous derivation; the unused `comlink` dependency is removed. Decision 12's lint boundary stands as written:
    model functions are importable only from `src/models/`. Reopened when a v1 model's 51×51 scan exceeds 300 ms; the
    choice then is between an abortable row-sliced scan on the main thread, which needs no clone boundary, and a Worker,
    and it is measured before it is made.
    **Amended 2026-09-28 (review after Phase 4b, Proposal 16; `P026`).** v1 has no grid cache either. ADR-0001 §4.7's
    cache key, model + output + non-axis parameters so that dragging an axis parameter does not recompute, is dropped
    with the Worker it was written beside: every valid edit is a new snapshot of the slot and a full scan, `GRID²` runs
    whichever quantity changed, which is the scan the 300 ms line above is measured on. A cache is reopened with the
    rest of this decision, and measured before it is made.
    **Amended 2026-09-30 (`.scratch/compare/` ticket 01).** The 300 ms line is one scan, as written above, and it
    stands. Three compared slots of PMV (ASHRAE 55), scanned one after another in the browser, took a median of
    328.3 ms; Input 1 alone took 98.0 ms, and PMV (ISO 7730)'s three took 42.4 ms. The slots with a higher `met` and
    `clo` scanned slower, so three scans are not three times one. v1 stays synchronous whatever three slots cost: no
    Worker, no row-sliced scan and no cache, because v1 puts a simpler app ahead of a faster one.
    **Noted 2026-10-02 (decision 61).** The psychrometric chart is a scan on every page, every cell run: 50.0 ms for
    one slot of PMV (ASHRAE 55) at its defaults and 219.8 ms for three (Chromium 154). The line stands as one scan.
30. **Model name.** Revises decision 3: the declaration's `pathSegment` is replaced by `name`, the library's function
    name for the model (`"pmv_ppd_iso"`), written once. Everything the app calls a model follows it, in three mechanical
    forms: the share link carries the exact name, like a quantity key; the route segment is its kebab-case
    (`pmv-ppd-iso`), generated as a standard's segment is (decision 6); the declaration's file and constant are its
    camelCase (`pmvPpdIso.ts`), by convention. A test proves the name against the package's exports by identity,
    `lib[name]` is a function and `lib[NAME + "_INFO"] === model.info`, and another that names are unique across the
    registry, which routing alone only needed within a standard. Rejected: looking the name up at runtime among the
    package's exports, as `core/standard.ts` does inside `Standard`, because that needs a namespace import and the 93 KB
    bundle is tree-shaken (tests are not bundled, so the drift test may); and an `id` the app invents. `ModelInfo`
    carrying its own name is recorded as an upstream gap, and the field is deleted when it does. `pmvIso` is renamed
    `pmvPpdIso`, and Phase 4's file is `heatIndexRothfusz.ts`.
    **Revised 2026-09-25 (`.scratch/library-v2-migration/`, ticket 02):** `ModelInfo` carries the model's name (library
    `af52abe`), so the declaration's `name` is deleted and every reader takes `model.info.name`: the route segment, the
    lookup by segment, and the share link when it lands. The two halves of the name test that proved it against the
    package's exports are deleted; the library's model-metadata test proves both for every model info. Uniqueness
    across the registry stays. The rejected runtime reverse lookup is moot: nothing is looked up.
31. **A Band list is the library's `ClassifierBins` plus colours, and the workspace decides the colouring.** Revises
    decision 7 and ADR-0001 §4.5's Explore-thresholds rule. The list keeps the library's shape, contiguous `edges`,
    `labels`, and the `right` flag of the classifier it started from, and adds a colour per band, so the default is a
    copy of `bands` rather than a conversion and `classifyFromBins` answers the hover readout on an edited list
    unchanged. The editor moves, adds and removes Edges; removing one merges two bands; a range is left uncoloured by a
    band with no colour; an overlap cannot be expressed. The library's edges are kept exactly, the final one included
    (`10`, `1000`: past it the kernel returns NaN, and an open top would colour a point the kernel's own category calls
    NaN); the first band is open below, as it is in the library. The app has no inclusivity rule of its own: ADR-0001's
    "lower inclusive, upper exclusive" contradicted the `right: true` of Heat Index and ASHRAE PMV. Edited bands colour
    the chart and nothing else; the result table always shows the kernel's category. **Standard draws the comfort zone
    only**, filled as the psychrometric chart fills it and blank outside; **Explore draws the bands**, defaulting to the
    classifier's, which Reset returns to. The comfort limit (|PMV| ≤ 0.5) is not thermal sensation: it coincides with the
    "Neutral" band for ASHRAE 55 and ISO 7730 category B, does not for EN 16798 categories I and III (0.2, 0.7), and is
    never found by matching a label. No `_INFO` publishes it (the deployed CBE tool writes `0.5` at a dozen call sites;
    `PMV_PPD_ASHRAE_INFO` is planned to carry the compliance interval), so under rule C it is one exported constant in
    `src/temporary-library/` beside the zone solver, read by the solver's default and, from Phase 5, by the Standard
    dynamic chart, and deleted when an `_INFO` carries the interval. One `output` per dynamic chart and no output
    selector: PPD is a function of |PMV|, so its contours are the same lines without the sign, and a second surface is a
    second `charts` entry. ADR-0001's `ChartState.output`, `bandsByOutput` and the share link's `"output"` go; bands are
    saved per (model, chart). Sequencing: what fixes the declaration's shape (decisions 27, 28, 30) lands before Phase 4,
    and the Standard page keeps drawing the classifier's bands until Explore exists in Phase 5, when the bands move there
    and Standard switches to the comfort zone, so no rendering code is ever without a caller.
    **Revised 2026-09-25 (`.scratch/library-v2-migration/`, ticket 04):** the comfort limit is no longer an app
    constant. The psychrometric declaration lists its `zones`, each `{ label, limit, inclusive }`, built by
    `core/comfortZones` from a library object: `categoryZones(PMV_CATEGORY_BINS_ISO)` gives ISO 7730's categories A, B
    and C, one zone per bin below the sentinel edge, and since Phase 4b (`58ba1bb`) the ASHRAE declaration has written
    `intervalZone(copy.comfortZone, PMV_COMPLIANCE_INTERVAL_ASHRAE)`. The Standard page draws the declaration's zones,
    nested, largest first, in one hue whose opacity rises inwards. A zone's inclusivity follows its source as
    pythermalcomfort reads it: a classifier's `right`, and strict at both ends for the compliance interval, so the limit
    above reads |PMV| < 0.5 and the deployed tool's `≤` is not ported. The "deleted when an `_INFO` carries the
    interval" trigger is closed by the library's `PMV_COMPLIANCE_INTERVAL_ASHRAE` (`fcd877e`) and
    `PMV_CATEGORY_BINS_ISO` (`ab8f6d5`), and the temporary library holds no limit (decision 24's note of the same
    date). The dynamic chart is unchanged: the category bins cut |PMV|, not the signed `pmv` it scans, so they cannot
    be its bands.
    **Noted 2026-09-28 (review after Phase 4b, Proposal 14; `S105`).** "A second surface is a second `charts` entry"
    holds across chart types only: v1 has one chart per chart type. Every reader finds a model's chart by its
    `ChartType`: `dynamicChartOf` and `psychrometricChartOf` return the first entry of their type, and the chart
    picker keys its entries by type, so a second dynamic entry is a Svelte duplicate-key error. A second surface of one
    type is a change to those readers first. A registry-wide test in `core/modelDeclaration.test.ts` asserts one chart
    per chart type; it was added with `cdff7ca`.
    **Revised 2026-10-01 (decisions 57 to 60, Phase 5 item 3's grilling).** "Standard draws the comfort zone only;
    Explore draws the bands" holds for every chart of a page, the psychrometric chart on Explore being a scan (58).
    "Saved per (model, chart)" is one list per model (59). "The workspace decides" is the page (57). "Colours assigned
    from the fixed palette by band position" is one palette per classifier, by position once at the default (60). The
    on-screen name is "Bands", not "threshold editor".
    **Noted 2026-10-02 (`.scratch/explore/` ticket 09).** The revision above holds as built (`47498cb`, `9f95582`,
    `e39791a`) but for two points. "Holds for every chart of a page" holds for a chart the model scans: Adaptive
    (ASHRAE 55)'s polygons chart draws its Comfort zones on Explore too, since a model without a scan has no Band list
    (decision 37's note of 2026-10-01; `state/session.svelte.ts:148`). And the phrase it quotes, "colours assigned from
    the fixed palette by band position", is the rewrite plan's Phase 5 item 3 (`docs/rewrite-plan.md:955`), rewording ADR-0001 §4.5's "by interval position" (`0001-architecture.md:434`), not this decision's.

Taken 2026-09-22, in a grilling session on the four tickets the numeric-scan close-out left behind (08–11 in
`.scratch/numeric-scan-and-model-name/issues/`), which widened to switching models and to the shape of `run`:

32. **Switching models asks before it adjusts.** Revises ADR-0001 §4.5's "Switching models" rule. The dialog stays as
    specified there (title "Boundary Range Warning", a table Input / Current / Allowed range, "Yes, switch and
    adjust" / "No, stay here"); this settles what it left open. Its "hard range" is the model's Applicability as the
    pre-call gate reads it, so the rows are exactly `outOfRangeInputs(slot, newModel)` and "Allowed range" is
    `enteredBound`: the intersection of the `tdb` and `tr` bounds under operative entry, one-sided where the bound
    is. One definition of out of range, the gate's. A quantity the gate does not bound (the entered `v` of a model
    that takes `vr`, a humidity entered as anything but `rh`) is not listed and surfaces after the switch as a
    violation row. The switch is rehearsed on a copy of the slot, in this order: convert the slot to separate entry
    when the new model has no temperature entry group (`tdb = tr = operative_tmp`, lossy and one-way like
    `setTemperatureMode`); seed every quantity the new model takes and the bag lacks from the new model's declared
    defaults, keeping what is there (§4.5's "superset bag" made explicit: today `setModel` touches no slot, and
    Adaptive's `t_running_mean` would throw); then ask the gate. Nothing out of range: the copy lands and the app
    navigates, with no dialog. "Yes": the same, with each listed value moved to its nearest bound. "No": the slot is
    untouched, entry mode included, and there is no navigation to undo, because the check runs in the model select's
    handler, before it. This is the one place the app adjusts a value, and only on the user's yes; Applicability
    stays a gate (CONTEXT.md, revised the same day). A model reached by URL (typed, the back button, a share link)
    has no "here" to stay at, so it gets the conversion and the seeding but no dialog and no adjustment: it loads,
    the gate flags the entries, and the result is empty (decision 33). Slot 0 only until Compare exists; the
    rehearsal is a function of one slot, which Compare calls for all three as §4.5 says, so this is staging and not
    a deviation. The temperature entry group stays derived from `inputs` (2026-09-08): a declared flag was
    considered and dropped, because the case for it, UTCI, is offered operative entry by the old tool as well.
    Sequencing: the dialog moves from Phase 5 item 2 to a prerequisite of Phase 4b, where two models first share the
    Standard page and a switch that breaks a bound becomes an everyday event. Its look is still Phase 5c's.

    **Revised 2026-09-22 (the feature as built, `.scratch/model-switch/`: 01 `9c67d63`, 02 `0a35e39`, 03 `6e6c36d`,
    04 `2ffddfe`).** Four points this decision did not cover or worded too narrowly.

    **Every in-app way of switching asks, not only the select.** "The check runs in the model select's handler" was
    written when the select was the only control that switched models; the Standard page also has a model link per
    model in its navigation column, and an un-intercepted link would have treated a person who should have been
    asked as if they had arrived from outside. A link stays a link — it keeps its `href`, so a new tab, a copied
    address and assistive technology are untouched — and an ordinary click on it requests the model exactly as the
    select does. A click the browser will act on itself (a modifier key, the middle button, the context menu's "open
    in new tab") is left alone and arrives as an **address arrival**, which by this decision never asks and never
    adjusts: there is no previous page to stay on. So the rule is "every in-app switch asks, every address arrival
    does not", and which control was used does not enter into it.

    **Every in-app switch leaves a history entry.** Following from the above, since both ways of switching now go
    through the same request: `routes/navigation.ts` splits its one navigator in two, `navigateTo` pushing and
    `redirectTo` replacing, with `redirectTo` used only by the unknown-address fallback — an address that named no
    model is not somewhere back should return to. Back therefore returns to the previous model however the person
    switched, and the dialog's "Yes" needs no memory of which control asked.

    **Where the rehearsal landed, and the one definition of out of range.** `core/modelSwitch.ts` — a new file in
    `core/` that ADR-0001 §5's tree does not list, recorded here as decision 6 recorded `core/applicability.ts` —
    holds `rehearseSwitch(slot, model)` and `adjustToBounds(inputs, rows)`, the only place in the app that moves a
    value the person entered. The gate reports rows rather than quantities: `outOfRangeRows(slot, model)` returns
    `{ quantity, value, bound }` and `outOfRangeInputs` is a map over it, so the input panel's red boxes and the
    dialog's table are one list read two ways and cannot disagree. The conversion rule moved out of
    `InputSlot.setTemperatureMode` into `core/libraryInputs.ts`'s `withTemperatureMode`, because `core/` may not
    import `state/` (§5) and both paths must apply one statement of it. The session holds the question as
    `pendingSwitch` and answers it with `acceptSwitch` / `declineSwitch`; a private landing puts the model and the
    slot down together and clears whatever was pending, so no question outlives the act that asked it.

    **The dialog is at `src/ui/inputs/`, not `ui/dialogs/`.** ADR-0001 §5's tree reserves `ui/dialogs/`, and this is
    the app's first dialog. It is placed with the inputs because that is what it is about and where it renders — it
    reads the pending switch's rows and the current unit system and belongs to the input column's exchange, not to
    the page. `ui/dialogs/` stays reserved for a dialog that is not part of a panel. Decided 2026-09-22 with the
    project lead rather than resolved by moving the file.

    **Amended 2026-09-28 (review after Phase 4b, Proposal 1; `S050`, `PT02`).** A humidity entry counts as held only
    when a declaration's default or the user wrote it. A slot opened on a model that takes no humidity holds none, and
    the switch seeds it from the new model's declared default. Before this every slot started at `rh` 50, a value no
    declaration wrote, and the seeding step above kept it as held, so a session opened on Adaptive (ASHRAE 55) handed
    that 50 to every later model; it went unseen only because every declared `rh` is 50. Decided in meaning, open in
    code: how the slot says it holds no humidity, and the one core builder for a starting slot that replaces the
    session's 50 and the test slot's 0, are the slot's shape, which is review item 2's
    (`.scratch/review-after-4b/deferred.md`).
    **Noted 2026-09-28 (decision 47).** What the amendment above left open is settled by decision 47: a slot's
    `humidity` is absent until written, and a starting slot is the empty slot put through the seeding above,
    `seedDeclaredDefaults` in `core/slot.ts`, which `rehearseSwitch` calls. The temperature entry mode's conversion,
    `withTemperatureMode`, which the revision above placed in `core/libraryInputs.ts`, is in `core/slot.ts`, beside
    `withHumidityMode`, the humidity entry mode's, which moved there out of `InputSlot.setHumidityMode`. The adjuster is
    `adjustToBounds(slot, rows)`.

    **Amended 2026-09-28 (review after Phase 4b, Proposal 30; `P030`).** A humidity entered as anything but `rh` is no
    longer, as such, a quantity the gate does not bound. A humidity entry in any mode but wet bulb is held to relative
    humidity's bound, converted into its mode at the slot's dry-bulb temperature (decision 46), so the dialog lists it
    with that converted range and "Yes" moves it to the converted end, in the same mode. The rehearsal takes the
    temperatures first: it checks the humidity entry at the temperature a "Yes" would leave and lists it with the
    range it has there, so a "Yes" leaves nothing out of range. The gate still leaves unbounded the entered `v` of a
    model that takes `vr`, a wet-bulb entry, the humidity entry of a model without the humidity entry group, and a
    humidity entry at a temperature where the converted bound comes out inverted.
    **Noted 2026-09-29 (review after Phase 4b, round 17; `S083`).** `outOfRangeInputs`, named twice above, is now
    `outOfRangeQuantities`, for the reason decision 23's note of the same day gives.
    **Noted 2026-09-30 (the third grilling of `.scratch/activity-adjusted-inputs/`).** "The entered `v` of a model
    that takes `vr`" no longer surfaces after the switch: from ticket 09 of that folder the gate holds it to `vr`'s
    bound converted at the slot's metabolic rate (decision 54, third revision), so the dialog lists it. What still
    surfaces after the switch is only PMV (ASHRAE 55)'s three air-speed limits at the operative temperature, which are
    not in its info.
    **Noted 2026-10-01 (decision 55).** "Yes" moves a listed value to the end of its bound as the row shows it, the
    number of two decimals nearest the end and inside the bound, not to the end itself: a converted end has more
    decimals than a row shows. *Withdrawn the same day by decision 56: a "Yes" moves the value to the end itself,
    and the gate, comparing at the shown precision, passes it.* Built as `56bfbe2` (`.scratch/one-precision/`
    ticket 03).
    **Noted 2026-10-01 (`.scratch/activity-adjusted-inputs/` ticket 05).** "Convert the slot to separate entry when
    the new model has no temperature entry group" holds, since decision 54, for every entry group held among a slot's
    values: a slot bound for a model without a group returns to that group's default mode, each group by its own
    conversion (`convertEntryModes`, `core/modelSwitch.ts:112-117`). Unlike the temperature one, the two
    activity-adjusted conversions invert: the air-speed one inverts `v_relative`, so the model is given the same
    relative air speed on the way back, and the clothing one inverts the rule of the model the slot leaves, which the
    new model, having no clothing group, does not have. So the rehearsal takes that model too:
    `rehearseSwitch(slot, from, model, atmosphericPressure)` (`:49`, `dcc2909`), where the revision of 2026-09-22
    above writes `rehearseSwitch(slot, model)`. Where they do not give the same value back, a relative air speed finer
    than 0.001 m/s and, under ASHRAE 55's rounding, a clothing insulation moved by up to 0.001 clo, is decision 54's
    note of the same day.
    And "the rehearsal takes the temperatures first" (the amendment of 2026-09-28) became a loop: the gate is asked
    again at the slot with the rows so far adjusted until a pass lists what the pass before did (`:52-58`,
    `60f088f`), since an entered air speed's bound reads the metabolic rate and ISO 7730's clothing bound reads both.
33. **The gate freezes the result, not the screen.** Amends ADR-0001 §4.5's "Outputs are derived entirely from
    Inputs + Chart" and the compute contract decision 29 left unchanged. While an entered value is outside
    Applicability the last valid result stays on screen, as before. What is kept is the last valid *inputs* of the
    current model, a snapshot of slot 0, and nothing else: the result, its violation rows and the chart are derived
    from that snapshot and the session's current unit system and chart settings. So a unit switch, a chart-type
    switch and an axis change all take effect while the gate is closed, and the numbers do not move. Before, the
    blocked pass returned before it read any of the three, which left °C axes under an IP panel and chart tabs that
    did nothing. The marker is drawn at the snapshot, the state the kept numbers describe; the out-of-range entry is
    shown by its own input. The snapshot belongs to the model that produced it: a model change drops it, so one
    model's numbers never appear under another's name, and a model reached with an entry out of range shows an empty
    result until it has a valid run of its own. Reachable from Phase 4b, since Phase 4's Heat Index has no standard
    and so no route. No `$effect` and no `untrack`: the snapshot is the derivation's own last value, as the kept
    outputs are today.
    **Amended 2026-09-28 (review after Phase 4b, Proposal 2; `S074`).** The axis picker describes the chart on screen:
    its choices and its selection are resolved from the same snapshot the chart was drawn from, not from the live
    slot. The picker read the live slot's entry mode, so with the gate closed after a switch to operative entry it
    offered operative temperature above a chart still drawn on dry-bulb. Since `9ccbd63` it reads `Outputs.drawnAxes`
    in `state/compute.svelte.ts`, resolved from the same last valid inputs as the chart. Which slot decides the axes
    once Compare has three is Compare's to settle.
34. **`run` stays a function and reads its values by `Quantity`.** Revises decision 3. `run` is
    `(values) => result`, where `values(...quantities)` returns one number per `Quantity` asked for, as a tuple of
    the same length, spread at the head of the library's positional call:
    `pmv_ppd_iso(...values(q.tdb, q.tr, q.vr, q.rh, q.met, q.clo), 0, ISO_EDITION, { … })`. The keyed
    `Record<string, number>` and `core/libraryInputs.ts`'s `keyedInputs` go: `init.tdb` was a wire string as a
    property name in every declaration, and nothing checked its spelling. Three requirements decided the shape. A
    model whose call is shaped differently changes no other file. The compiler and the editor see the library's
    signature: arity, argument types, the spelling of a kwarg (checked: one quantity short, or a misspelt kwarg,
    fails to compile). And the library's coming TypeScript port improves the declarations with no change here. Only
    a direct call meets all three. Rejected: the call as data, either `libraryCall(fn, [...])` typed by `Parameters`
    or `libraryCall(fn, { tdb: q.tdb, … })` with its names proven by a test, because core would interpret it, a new
    kind of argument (Phase 4b's option value inside kwargs) would change core, and the object form loses
    per-argument types; typed destructuring, `({ tdb, tr, … }) => fn(tdb, tr, …)`, the most readable and the best
    end state, because nothing automatic checks positions today; and deriving the call from `_INFO.inputs`, whose key
    order is not the call order (`PMV_PPD_ISO_INFO` lists `met, clo, rh`; the function takes `rh, met, clo`).
    Position is proven by a registry-wide test: the keys of the quantities `values` was asked for equal the leading
    parameter names of the library function, read off its source in the unminified `lib/esm`. Tests only: a
    production build renames them, which is also why `fn.name` cannot replace `name` (decision 30). The spread goes
    first by convention, which the test cannot see. The rounding switch is written by the declaration's author in
    the call, under whatever name the function gives it (`round_output` in kwargs, `round` in options, a positional
    boolean); decision 35 checks the outcome. Upstream gap: an object parameter,
    `pmv_ppd_iso({ tdb, tr, … }, options)`, the faithful translation of pythermalcomfort's keyword call, recorded for
    the TypeScript port. When it lands a declaration writes `tdb: …` by hand, the names become the compiler's to
    check, and the position test is deleted.
    **Revised 2026-09-23:** `run` takes a second reader, for the model's options (decision 36).
    **Revised 2026-09-25 (`.scratch/library-v2-migration/`, ticket 01):** the object parameter landed with the library's
    v1 models (through `ae656a7`). `run` is `(values, options) => result`, where `values` is an object typed off the
    quantity table, `{ readonly [K in keyof typeof quantities]: number }`, whose getters throw naming a quantity the
    slot does not hold. The declaration writes the library's params object, each quantity by name, then the app's fixed
    policy: `wme: 0`, `standard`, `limit_inputs: false`, `round_output: false`, and no `units` (the library's default is
    SI, decision 1). The names are the compiler's: a misspelt key is an excess property and a forgotten quantity a
    missing required one, each pinned by a `@ts-expect-error`. The position test and the source-parsing parameter-name
    reader are deleted, and with them the spread-first convention and the switch written under whatever name the
    function gives it (it is `round_output` in every declaration). What the compiler cannot see, two quantities in each
    other's place, is caught by a registry-wide test on decision 36's recording harness: every quantity key of the
    params object the library received carries the number the values object gave for that quantity. Proven red by
    swapping `tdb` and `tr` in the ISO declaration, which compiles.
35. **An unrounded `run` is pinned by its own test.** Amends decision 27, which retired decision 17's rounding rule
    on the strength of the drift test. Measured in ticket 06: with Heat Index at the library's default rounding the
    whole suite stays green, because the probes bisect on whatever `run` returns and land on the rounding step, where
    both sides agree. The drift test still proves the bands are the kernel's, and its comment is corrected to claim
    only that. That `run` returns the unrounded number (decision 18 as revised) is asserted directly, for every
    registered model, by a test that samples the chart's axis and fails when no output carries more decimals than a
    rounded one would; proven red with a fixture whose `run` rounds. It will fail the day `utci` is registered:
    `utci` rounds to one decimal with no switch. That is recorded as an upstream gap, to close before Phase 6.
    **Revised 2026-09-26 (`.scratch/library-v2-migration/`, ticket 05):** the upstream gap is closed: `utci` gained
    `round_output` with the library's one params object (`41f1348`), so the day it is registered its declaration
    writes `round_output: false` as every declaration does, and this test passes on it with no edit.
    **Amended 2026-09-27 (decision 38).** The test samples the table's first column rather than the chart's output.
36. **A model's options are declared objects, and `run` reads them through a second reader.** Revises decision 34
    and ADR-0001 §4.3's options sentence and §4.5's `InputSlot.options`. An option is `{ key, label, default }`
    (`OptionSpec`), declared in the model's own declaration file and referred to by identity, as a `Quantity` is:
    `key` is what the share link will carry, `label` what the panel shows, `default` what a slot starts from.
    `RegisteredModel.options` lists them, empty for a model with none, and every declaration says so. The slot holds
    `options: Map<OptionSpec, boolean>` beside `values`. `run` is `(values, options) => result`, where
    `options(spec)` answers the boolean the slot holds and throws for one it does not, as `values` does, so the
    declaration writes it into the library's own kwargs: `{ airspeed_control: options(airSpeedControl), … }`. The
    compiler checks the kwarg where the library types it: `pmv_ppd`'s `Pmv_ppdKwargs` types `airspeed_control` as a
    boolean, pinned by a `@ts-expect-error` in the run tests. Checked 2026-09-23: `pmv_ppd_ashrae`'s published
    declaration types its positional parameters `any` and its kwargs `{}`, so that check does not yet hold for the
    function PMV (ASHRAE 55) will call. The option's `key` and the kwarg it feeds are spelled separately, so a
    registry-wide test runs each option on and off with the library's functions wrapped to record their arguments,
    and fails unless the one kwarg that changed is the option's `key`. The `key` is therefore a boundary string of
    ADR-0001 §4.0 rule 2's kind, the library's name for the switch and the share link's, written in the declaration
    beside the option rather than in a table; nothing in the app looks an option up by it. Booleans only: a kind field waits for a second kind of option. Across a
    switch the map is a superset bag like `values`: the rehearsal seeds every option the new model declares and the
    map lacks at its default, keeps everything else and removes nothing. An option has no range, so the gate never
    reads one and the switch dialog never lists one. On screen, one checkbox per declared option under the quantity
    rows, labelled from `label`, always shown and always live, since whether it applies at the entered values is
    the library's to say. Rejected: a string-keyed record, `Record<string, OptionValue>`, as the old draft had it,
    because the key would be a string the declaration, the panel and `run` each spell, with nothing checking they
    agree, where an object is spelt once and passed around; and an option as a new `Quantity` kind, because
    everything that reads a `Quantity` (the axis picker, the gate, the dialog's rows, the display-unit table, the
    quantity table's drift test against `_INFO`) would have to learn to skip it, and it is not in any `_INFO`.
    **Revised 2026-09-25 (decision 34's note of the same date):** an option is written inline under its library
    key, `airspeed_control: options(airSpeedControl)`, never through a spread: a spread into an object literal is
    exempt from the excess-property check, so a misspelt optional key inside one compiles silently (compiler probe,
    2026-09-25). The `@ts-expect-error` now pins `pmv_ppd_ashrae`'s `PmvPpdAshraeParams`, which types
    `airspeed_control` as a boolean, so the 2026-09-23 note that its declaration types its kwargs `{}` is retired.
    `pmv_ppd` is off the library's public surface; the fixtures that called it call `pmv_ppd_ashrae` with
    `suppress_warnings: true`.
37. **The dynamic chart is declared in one of two shapes: scanned, or drawn from polygons on locked axes.** Amends
    ADR-0001 §4.4's `chartType.dynamic` row and decision 27. The dynamic member of `ChartDeclaration` splits in two
    under the same `chartType.dynamic`: a scanned chart declares `axes`, `output` and `bands`, as decision 27 has it; a
    polygons chart declares `axes` and `zones` and nothing else, and `isPolygonsChart` tells the two apart. Each member
    marks the other's fields `never`: the shared `type` discriminates nothing, and an object literal checked against a
    union has only the keys no member knows reported as excess, so without it a polygons chart with an invented
    `output` compiles. A `@ts-expect-error` proof in the declaration tests refuses a scanned chart without `bands` and a
    polygons chart with an `output` or `bands`. A polygons chart locks its axes: the picker offers no quantity for it,
    so the chart controls show none; `ChartState.setAxes` does nothing; and the spec builder draws on the declared
    axes without mapping them to the entry mode, so an operative-temperature axis stays operative under separate
    entry. There the slot is marked at `operativeTemperatureOf(slot)` in `core/libraryInputs.ts`, beside the
    relative-humidity resolution: the entry itself under operative entry, else the plain mean `(tdb + tr) / 2`, and
    `enteredValue` answers `operative_tmp` through it in every mode, as it answers `rh`. It reads a slot, so it is an
    entry-group convention under decision 21's rule 4, like `tdb = tr = operative_tmp`, not a temporary-library
    calculation. The mean is the deployed
    tool's reading and not the library's `t_o`, which weighs the air temperature by air speed (√(10v) under ISO 7726;
    0.5, 0.6 or 0.7 under ASHRAE 55, so the two agree only below 0.2 m/s); the difference is noted at the definition.
    Against decision 27: `output` and `bands` belong to a scanned chart only, so a model whose chart is polygons no
    longer names an output and a classifier the chart never reads. The registry-wide drift and unrounded tests read a
    scanned chart and throw on a polygons one until they are restated for it (Phase 4b ticket 06). Rejected: keeping `zones` optional beside a scan, as Phase 3 left it, because the
    compiler could then refuse neither a polygons chart's invented output nor a scanned chart's forgotten bands.
    **Amended 2026-09-27 (decision 38).** Both tests are restated for a polygons chart: the drift test skips it, and
    the unrounded test reads the table's first column.
    **Amended 2026-09-28 (Phase 4b ticket 12).** Under separate entry the slot is marked at the library's
    `t_o(tdb, tr, v, model.standard)`, not the plain mean: `operativeTemperatureOf` takes the model, and
    `withTemperatureMode` converts through it, so the marker and the switch into operative entry cannot differ
    (decision 39). The marker now sits off the deployed chart's whenever `tdb ≠ tr`, except under ASHRAE 55 below
    0.2 m/s and under ISO 7726 at exactly 0.1 m/s. The app follows the library; what the library has, the app does
    not write again.
    **Noted 2026-09-28 (review after Phase 4b, Proposal 23; `S031`, `PT01`).** Decision 31's one-hue rule covers a
    polygons chart's zones: they are Comfort zones on the Standard page, nested largest first, and are painted as the
    psychrometric chart paints its own, in one hue whose opacity rises inwards, outlined in the same zone line. Adaptive
    (ASHRAE 55)'s 80 % and 90 % acceptability regions were painted in the first two hues of the thermal-sensation
    palette, as if they were two bands. Since `930ca55` they take the one zone hue, `chartInk.zoneFill`, outlined in
    `chartInk.zoneLine`, as the psychrometric chart's zones do (`core/charts/dynamicChart.ts`).
    **Noted 2026-09-28 (review after Phase 4b, ticket 32; `P008`).** A polygons chart answers hover through a hover grid
    its spec builder lays over the locked axes: each GRID×GRID cell reads both axis values and the innermost Comfort zone
    containing it, because Plotly's fill hover reports no pointer position; the zones' own hover is off. Hover text on
    the dynamic chart is written by the spec builder as "Label: value unit" lines (axes, output, band).
    **Noted 2026-09-28 (decision 47).** `operativeTemperatureOf` and the relative-humidity resolution beside it,
    `relativeHumidityOf`, moved with the slot's other readers from `core/libraryInputs.ts` into `core/slot.ts`.
    **Noted 2026-09-29 (review after Phase 4b, round 17; `S079`, `S106`).** `ChartDeclaration`, named above, is now
    `DeclaredChart`, and its members `PsychrometricDeclaration`, `DynamicDeclaration`, `ScannedDeclaration` and
    `PolygonsDeclaration` are `DeclaredPsychrometricChart`, `DeclaredDynamicChart`, `DeclaredScannedChart` and
    `DeclaredPolygonsChart`. A Declaration is the one file that binds a model, so a chart it lists is called a chart,
    as `psychrometricChartOf`, `dynamicChartOf` and `isPolygonsChart` already called it. "Declared" keeps it apart
    from the drawn chart, which is a `ChartSpec`.
    **Noted 2026-10-01 (decisions 58 and 59).** On the Explore page a polygons chart draws its zones as it does on
    Standard and has no Band list and no Bands panel.
    **Amended 2026-10-02 (decision 61).** A scanned chart declares `axes` alone; `output` and `bands` are the model's
    `scan`, `bands` named `classifier` there. The polygons chart's `zones` is named `comfortZones`, since its polygons
    are Comfort zones; the two shapes are still told apart by it, and the `never` marks stay.
    **Amended 2026-10-02 (decision 62).** The polygons chart leaves `chartType.dynamic`: it is `chartType.adaptive`,
    declared with `axes` and `limits`, each Comfort zone's two limit lines, and `dynamic` has one shape again.
    `isPolygonsChart`, `DeclaredPolygonsChart` and the axes lock go; the `never` marks stay, three types being three
    object identities. What this decision says of the locked axes and the marker holds for the adaptive chart.
38. **What the table shows first is what must come back unrounded; the registry-wide tests hold for a polygons chart
    and prove silence.** Amends decision 35, and restates the two tests decision 37 left throwing on a polygons chart.
    The unrounded test samples the table's first column, which every model declares (ADR-0001 §4.3), along the
    dynamic chart's x axis in either shape, rather than a scanned chart's `output`, which a polygons chart does not
    name. A tighter statement of decision 35, not a looser one: what the table shows must be unrounded, and for both
    models registered today the first column is the number their chart scans (`pmv`, `hi`). A first column that is
    not a finite number throws naming it, since a category or a yes-or-no answer has no decimals to check. The ISO
    rounding fixture still fails it; a fixture whose chart is polygons passes it. The drift test (decision 27) skips a
    dynamic chart with no `bands`, proven on a polygons fixture whose `run` throws if called. A third test draws every
    registered model's dynamic chart at `GRID` and its psychrometric chart where it declares one, at the model's
    defaults, with `console.warn`, `console.log` and `console.error` spied, and fails on any write: the deployed front
    end logs nothing, and one line a kernel writes per call is thousands per chart. Proven red by making the ISO
    declaration log above 39 °C (234 writes), and pinned by a fixture whose `run` logs once. Each test loops over the
    registry inside one `it`, so a model's arrival changes no test count.
    **Noted 2026-09-27 (Phase 4b close-out).** "both models registered today" describes the registry the day this
    was written. Four are registered now: PMV (ASHRAE 55)'s first column is `pmv`, the number its chart scans, and
    Adaptive (ASHRAE 55)'s is `tmp_cmf`, which its polygons chart does not scan, the case this decision restated the
    test for. Both arrived with the test unchanged (`58ba1bb`, `c1ef5e1`).
39. **The switch into operative entry weighs by the model's own standard.** `withTemperatureMode` converts separate →
    operative with the library's `t_o(tdb, tr, v, model.standard)`; a model that declares no standard passes none, and
    the library's default decides. The app follows the library, and the library follows pythermalcomfort, whose models
    pass their own standard to `operative_tmp`. Before this no standard was passed, so every page converted by ISO 7726,
    which was right only while PMV (ISO 7730) was the one model with a temperature entry group. On Adaptive (ASHRAE 55)
    the click now leaves the run's answers where they were. The deployed tool converts nothing: its checkbox relabels
    the air-temperature box and copies it into mean radiant, so the comments' "as in the old tool" was wrong. Unchanged:
    the library's air-speed rule without occupant control reads `t_o` at its ISO default, as upstream does.
    **Noted 2026-09-28 (Phase 4b ticket 12).** Decision 37's marker is no longer the plain mean: the conversion is
    `operativeTemperatureOf`'s answer, the one `t_o` call in the app, and the marker is read through the same function,
    so the click no longer moves it.
    **Noted 2026-10-01 (decision 55).** The operative temperature the switch stores is `t_o`'s answer at the two
    decimals the row shows, so the click may move the marker and the run's answers by what those decimals leave out.
    *Withdrawn the same day by decision 56: the switch stores `t_o`'s answer at full precision.* Holds at
    `c59b51b` (`.scratch/one-precision/` ticket 01): decision 55's rounding never reached a write, and the unit
    system `2e45c2b` laid on every writer for it is reverted.
40. **A declaration file never imports another declaration file.** Taken 2026-09-28 in the review after Phase 4b
    (Proposal 3, `ST03`). Two models on the same inputs each write their own `inputs`, `table`, axis ranges and
    params mapping, and that copy is the accepted price of the one rule: a model is added, changed or removed in its
    own declaration file and one registry line, which an import between two declarations would break by making one
    model's file a dependency of another's. PMV (ASHRAE 55) and PMV (ISO 7730) are the case today: `pmvPpdAshrae.ts`
    writes the same inputs, table, dynamic axes and output as `pmvPpdIso.ts`, and the same six quantities at the head
    of its params object. Lint has enforced it on `src/models/` since `f85a69a`, with the registry file,
    `src/models/index.ts`, which imports every declaration by design, outside the rule. Before that it held by
    inspection, as no declaration imported another.
41. **A function starts with a verb, or is an accessor named `…For`, `…Of` or `with…`.** Amends ADR-0001 §6's
    "functions start with a verb", which its own examples break (`pathSegmentFor`, `displayUnitFor`, `axisRangeFor`)
    and which 35 of the 52 functions in `core/` outside `charts/` broke when the review counted. Taken 2026-09-28 in
    the review after Phase 4b (Proposal 17; `S107`, `ST02`). An accessor names what it returns and what it is read
    from: `displayUnitFor(quantity, system)` is the display unit for a quantity, `dynamicChartOf(model)` the dynamic
    chart of a model, `withTemperatureMode(slot, mode, model)` the slot's inputs in another mode. A function that acts
    or answers a question starts with a verb, as before (`rehearseSwitch`, `formatNumber`, `isPolygonsChart`).
    `axisRangeFor` and `hasHumidityGroup`, which decision 11 kept, fit the rule as they are. An accessor's name must not read like the
    language's own: the input panel's `valueOf` did, and was renamed `shownValueFor` with `d03781e`.
    **Amended 2026-09-28 (review after Phase 4b, Proposal 36; `BS09`).** The spelling above is widened to the names
    the code has. A function that acts or answers a question starts with a verb, as before. A function that only
    returns a value is named for what it returns, a noun phrase (`enteredQuantities`, `violationRows`), with a
    preposition where the name must say what the value is read from or made of: `…For`, `…Of` and `with…` as before,
    and any other (`modelBySegment`, `labelWithUnit`, `pathTo`). A conversion is named `to…`, and a callback is named
    `on…` after its event. Counted at the branch review (`.scratch/review-after-4b/branch-review.md`, `BS09`), of the
    118 distinct `function` declarations in production code, with tests, test helpers, generated primitives and the
    temporary library left out, 26 were spelled `…For`, `…Of` or `with…`, 38 started with a verb, five were `to…`
    conversions, one was an `on…` handler, and 48 were a noun phrase or used another preposition. No function is
    renamed. This reverses the answer given in the review's ticket 14 (`.scratch/review-after-4b/issues/14`), "no ADR
    edit", which was given before the count.
42. **Copy inside a generated primitive is the one exception to the one-dictionary rule.** Amends ADR-0001 §2's "UI
    copy centralised in one dictionary module". Taken 2026-09-28 in the review after Phase 4b (Proposal 22, `S091`).
    The shadcn-svelte CLI writes its components' own copy into `ui/primitives/`, which is never hand-edited (ADR-0001
    §2), so that copy stays where the CLI put it. The case today is the dialog's close button, whose screen-reader label
    is `Close` in `dialog-content.svelte`; `ModelSwitchDialog` keeps the button, which story 12 of
    `.scratch/model-switch/spec.md` gives its meaning, "No, stay here". Every string the app writes itself, a
    primitive's props and children included, is still in `text/copy.ts`.
43. **The address reaches the session through the router's after-load hook, never an effect.** Taken 2026-09-28 in
    the review after Phase 4b (Proposal 26; `S044`, `P013`). The Standard page followed the address in an `$effect`
    that called `session.setModel`, which assigns state, the one thing ADR-0001 §6 says an effect never does. Lint
    did not see it, for two reasons: the effect-purity rule covered only `state/`, and it is syntactic, so it sees an
    assignment written inside an effect but not one made through a call, as `setModel` made it.
    `routes/navigation.ts` now gives its routes an `afterLoad` hook, which sv-router runs after every arrival: a
    typed address, back and forward, a link the router follows, and the app's own `navigateTo`. The hook hands the model the address names to each listener
    registered with `followAddress(onModel)`, which returns the way to stop listening. The Standard page registers
    `(model) => session.setModel(model)` in its script and stops in `onDestroy`, so the page has no effect and
    `navigation.ts` imports nothing from `state/`. The address the page opens on is not handed over, because the
    router runs the hook before the page mounts; the page reads it with `modelFromRoute()` when it builds its session,
    as before. An address that names no model is corrected in the same hook with `redirectTo`, which replaces the
    entry as decision 32 says; a `beforeLoad` redirect was not used, because the route's params are not yet set when
    `beforeLoad` runs. The routes also name `/hooks`, on the same page as `*`, only to work around an sv-router
    matcher bug (0.18.1 and 0.19.0): `match-route.js` treats the `hooks` key as a path, so without that entry a typed
    `/hooks` throws and leaves the page blank; with it, `/hooks` is corrected like any address that names no model.
    Decision 32's rule is unchanged: the session hears the address only through `setModel`, the
    address's path, which never asks, and an in-app switch still requests first and navigates after, so the hook
    finds that model already current. The effect-purity lint rule now covers pages, `src/routes/**/*.svelte`, as
    well as `state/`; `ui/` stays outside it, since an effect there may write to what it synchronises, a DOM node for
    one, and the rule's selector matches any assignment written inside an effect. The example it gave went with
    `ac93984`. It is still syntactic: in a page it now catches an assignment written inside an effect, and still not
    one made through a call, so the old effect would pass it. A call that assigns stays with the review, under the
    code-quality checklist's question whether every `$effect` synchronises something external.
44. **The zone legend's `|PMV|` is the one quantity symbol the app writes.** Amends ADR-0001 §6's "the app never
    writes one" for the zone legend alone. Taken 2026-09-28 in the review after Phase 4b (Proposal 25; `S062`,
    `P015`). A Comfort zone's legend is its label and the limit it is drawn at, "Category A (|PMV| < 0.2)". The name
    `Quantity.label` gives `pmv` is "Predicted Mean Vote", not a symbol, and the library publishes no symbol to read,
    so `zoneLegend` in `text/copy.ts` writes `|PMV|` itself. The exception is that one string: every other quantity
    name the app shows, in a legend, an axis, the table or a warning, still comes from `Quantity.label`. The limit in
    it is written by `formatNumber`, as every number on screen is. A symbol on the library's variable info is
    requested in `.scratch/library-boundary/spec.md`; when the library ships one, the legend reads it and this
    exception ends.
45. **Humidity ratio is shown in g/kg in SI and in lb/klb in IP.** Adds the humidity-ratio row that ADR-0001 §4.2's
    list of display units lacks. Taken 2026-09-28 in the review after Phase 4b (Proposal 24; `P001`, `P009`). The
    value is still stored as the library's kg/kg at full precision (ADR-0001 §4.6); only its display unit converts, by
    a factor of 1000 in both systems, with a step of 1, the deployed tool's input step of 0.001 kg/kg. Shown in kg/kg,
    the one formatter's two decimals read 0.01 for 30, 50 and 70 % relative humidity at 25 °C, so the humidity-ratio
    entry mode could not show the value the user entered. The IP unit is the deployed tool's: its psychrometric chart
    plots 1000 times the ratio and labels it "g / kg" in SI and "lb / klb" in IP, on the axis and in the readout box
    (`../comfort_tool/static/js/psychchart.js:53`, `:490-491`, `:505-506`, `:731-737`). Its input box shows kg/kg
    and klb/klb (`static/js/global.js:818-834`), which this decision does not follow: klb/klb is the same number as
    kg/kg, the unit this decision replaces. The psychrometric chart's humidity axis takes the same unit, 0 to 30 in
    either system, and drops its `.3f` tick format, which printed three decimals where §4.6 allows two; with it goes
    `AxisSpec.tickFormat`, which no other axis set.
    **Amended 2026-09-29 (Phase 4c grilling; decision 49).** "0 to 30 in either system" holds at 101 325 Pa. The
    range a declaration writes for humidity ratio is the range at that pressure, and the psychrometric chart draws
    its upper end multiplied by 101 325 / `p_atm`: 101.3 g/kg at 30 000 Pa and 27.6 at 110 000. At 30 000 Pa the
    humidity ratio of 25 °C and 50 % is 34.7 g/kg (`psy_ta_rh(25, 50, 30000).hr`), above a fixed axis, so a pressure
    inside its bound would draw a chart without its marker. The declarations do not change and say nothing of the
    pressure. Rejected: a fixed axis, for that reason; a lower bound of 60 000 Pa, which would narrow a quantity's
    bound to suit one chart.
    **Noted 2026-10-01 (decision 55).** "Stored … at full precision" no longer holds: the stored humidity ratio is
    the kg/kg of the two decimals of g/kg (or lb/klb) the row shows. *Withdrawn the same day by decision 56: "stored
    … at full precision" holds again.* Holds at `c59b51b` (`.scratch/one-precision/` ticket 01), as decision 39's
    note says; and the gate judges a humidity ratio at two decimals of g/kg, this decision's display unit
    (`36573db`; named `gateUnitFor` in `e45c686`).
46. **Relative humidity is bounded 0 to 100 by its quantity kind, and the bound gates the humidity entry.** Closes the
    question the rewrite plan left open at Phase 2b ("`rh` has no applicability row, so 0..100 is not enforced"), and
    amends decision 32. Taken 2026-09-28 in the review after Phase 4b (Proposal 30; `P030`). The library publishes no
    applicability on `rh` for any registered model, so a PMV was shown for 150 % and for −20 % with no warning, and a
    humidity ratio of 0.05 kg/kg at 25 °C resolved to 238 %. 0 to 100 is the definition of the percentage kind, not
    one model's applicability, so the app holds it once, by kind: `kindBounds` in `core/quantities.ts`, beside
    `QuantityKind`, with `percentage` its only entry. It is not a field on `Quantity`, and not in `core/units.ts`,
    which holds display units. The pre-call gate reads it in `core/applicability.ts`: `enteredBound` intersects a
    kind's bound with the model's own row, and only for a quantity the model takes, so a model without the humidity
    entry group (Adaptive (ASHRAE 55)) is not bounded by a humidity it ignores, and a library row on `rh` would narrow
    the bound, never widen it. The humidity entry is held to that bound in the mode it is entered in: each end is
    converted into the mode by the mode's own `fromRelativeHumidity` at the slot's dry-bulb temperature (the operative
    temperature under operative entry, as the entry itself resolves), and an end that comes out non-finite is dropped.
    At 25 °C that is a humidity ratio of 0 to 20.08 g/kg, a dew point of at most 24.8 °C and a vapour pressure of 0 to
    3.17 kPa. The range shown under the box therefore moves with the temperature, and `enteredBound` takes the slot,
    not only its temperature mode. The box, the gate and the switch dialog read that one bound, and the dialog's "Yes"
    moves the entry to its converted end, in the mode it was entered in.

    Three limits. The switch rehearsal takes the temperatures first (decision 32 as amended): it checks the humidity
    entry against the bound at the temperature a "Yes" would leave and lists it with that range, so after a "Yes" the
    gate is open. Where the library's conversion stops rising with relative humidity the converted ends come out
    inverted, and the entry has no bound at that temperature: the humidity ratio of saturated air turns negative from
    100 °C, which Heat Index accepts. A wet-bulb entry is not bounded: `rh_from_wet_bulb` clamps to 0 to 100, so the
    entry cannot resolve outside the range, while the library's `t_wb` at 0 % is approximate (1.9 °C at 10 °C, which
    reads back as 16 %), so a converted bound would stop valid entries.

    The dew point's bound carries two library artefacts, both accepted as the library's answer. `rh_from_dew_point` is
    not clamped, and at 25 °C it reads a 25 °C dew point as 100.95 %, so a dew point equal to the air temperature is
    out of range. And the maximum is `psy_ta_rh`'s dew point of saturated air, which the library rounds to 0.1 °C, so
    an entry at that maximum can resolve slightly above 100 %, up to about 100.3 % between 10 and 40 °C. Two requests
    are recorded in `.scratch/library-boundary/spec.md`: an applicability on `rh`, and `rh_from_dew_point` at
    saturation.
    **Noted 2026-09-30 (the third grilling of `.scratch/activity-adjusted-inputs/`).** `kindBounds` has three entries
    now, not one: `percentage`, `atmosphericPressure` (decision 49) and `airSpeed` (decision 54 as revised). And the
    rule this decision states for the humidity entry, the model's bound converted into the entered quantity at the
    slot's own values, is the rule of the two activity-adjusted entry groups too (decision 54, third revision): an
    entered air speed is held to `vr`'s bound and an entered clothing insulation to the dynamic `clo`'s, each
    converted by the correction's inverse.
    **Noted 2026-10-01 (decision 55).** The converted end a "Yes" moves the entry to is taken as the row shows it,
    inside the bound (decision 32's note), and the range beside the row is written the same way. The library's
    `psy_ta_rh` gives the dew point to 0.1 °C, so the dew-point bound at saturation reads back as 99.7 to 100.3 %;
    accepted. *The first sentence is withdrawn the same day by decision 56: a "Yes" moves the entry to the end
    itself, and the range is the end formatted as any number is. The dew-point sentence stands; it is the library's.*
    Built as `56bfbe2` (the "Yes") and `36573db` (the range; `.scratch/one-precision/` tickets 03 and 02); from
    `2e78fa0` (ticket 05) a range end steps one shown digit inward where typing it back would be stopped (decision
    56, rule 3 as revised).
47. **The slot has its own module in core, may hold no humidity, and is written only through core.** Settles the shape
    that decision 32's amendment of 2026-09-28 left open (`S050`, `PT02`, `ST05`, `S014`, `S053`).
    `core/slot.ts` holds `Slot`, renamed from `SlotInputs`, with every function that reads or writes what the person
    entered; `core/libraryInputs.ts` keeps what turns a slot into the library's params. `InputSlot` keeps its name and
    declares `implements Slot`. A field that holds a slot is named `slot`, so `inputs` never names a slot.
    `humidity` is absent until a declaration's default or the person writes it. A read that has to compute from it
    throws and names it, as `requireValue` does; a read that only asks answers that there is none.
    A starting slot is the empty slot put through the switch's own seeding, so starting and switching are one rule. The
    session's `rh` 50 and the test slot's 0 are gone.
    Every write is a core function from a slot to a slot, and `InputSlot` lands the answer: entering a value, setting an
    option, and changing either entry mode. Its two maps are read-only outside the class. Entering any humidity mode's
    quantity sets the humidity entry in that mode, of which the two earlier branches were cases.
    Built in `.scratch/slot-shape/`: 01 `5ddf4b3` (the module), 02 `0eecf04` (the names), 03 `855e174` (any humidity
    mode's quantity), 04 `c824ce1` (no humidity, and starting as seeding), 05 `ea10260` (the humidity entry mode
    converts in core) and 06 `12c7a1f` (the write path).
    Rejected: a humidity entry that keeps a mode and no value, because no mode can be chosen while the humidity row is
    not shown; a flag beside a placeholder number, because the number no one wrote is what `S050` removes.
    **Noted 2026-09-29 (`.scratch/slot-shape/` ticket 08).** The two entries are read-only outside the class too, as
    the two maps are: `InputSlot` holds `humidity` and `temperature` in private fields behind getters. `replaceWith`
    stays public, because the session lands a rehearsed switch through it and what it lands is a whole slot core
    returned. "Every function that reads or writes what the person entered" above says more than the code does:
    `core/slot.ts` holds every change to a slot and the reads that more than one module shares. The pre-call gate,
    `outOfRangeRows` in `core/applicability.ts`, reads a slot's values and its humidity entry itself, to list what was
    entered. ADR-0001's two markers for this decision already name the changes so, as "the changes a person makes to a
    slot".
48. **Whether a model takes the relative air speed is read from its model info.** Revises decision 3:
    `relativeAirSpeed` leaves the declaration (`ST08`, `S018`). `takesRelativeAirSpeed(model)` in
    `core/modelDeclaration.ts` answers whether the model info's inputs name `vr`, reconciled through `quantityFor`,
    and is the one reader. Checked 2026-09-28 on the library's build output: the four declared values matched. A
    registry-wide test fails for a model whose info names `vr` and whose declaration lacks `v` or `met`, which
    `v_relative` needs.
    Rejected: an optional field that overrides the derivation, because one fact would have two sources. A model that
    takes `vr` and must not derive it from `v` brings the field back, with that model as the case.
    **Revised 2026-09-30 (decision 54):** the derivation applies under the air-speed entry group's first entry mode;
    under the second the person enters `vr` and nothing is derived. What the reader answers, whether the model has
    the group, is unchanged.
    **Noted 2026-10-01 (`.scratch/activity-adjusted-inputs/` ticket 05).** The revision holds as built (`4610891`):
    `relativeAirSpeedOf` (`core/slot.ts:250-255`) derives under the first mode and hands the entered `vr` over under
    the second, and `takesRelativeAirSpeed` is the air-speed group's `appliesTo` (`:143`) and the condition the control
    is shown on (`ui/inputs/EntryModeControls.svelte:28`). The registry-wide test of `v` and `met` stands
    (`core/modelDeclaration.test.ts:154`); `met` is also what the switch back to air speed entry inverts at.
49. **The session holds one atmospheric pressure, in pascals, and no model takes it.** Settles the two conflicts
    ADR-0001 carried into Phase 4c: §4.1.5 lists "Set pressure" among the one-shot input calculators, against §4.5
    and §7.2, and §4.8's example writes `p_atm` in kPa. Decided 2026-09-29 in the Phase 4c grilling
    (`.scratch/atmospheric-pressure/spec.md`), ahead of the code, which that folder's tickets build.
    Atmospheric pressure is session state, one value for every slot, and the share link carries it. It is not a
    calculator: a calculator writes its answer into a target input, and no registered model takes atmospheric
    pressure, so there is no input to write into. The session holds `atmosphericPressure` directly. ADR-0001 §4.5's
    `environment` wrapper is dropped: it would hold one member, and the word also names the air a slot describes.
    It is stored, and written to the link, in Pa, the library's unit. It is shown in Pa in SI and in inHg in IP, in
    steps of 100 Pa and 0.01 inHg. In kPa, the display unit of vapour pressure, the one number formatter would show
    the default as 101.33, and typing that back would store 101 330 Pa. `p_atm` is a quantity in `core/quantities.ts`
    with a kind of its own, `atmosphericPressure`, so its input, its unit and its bound are read as any other
    quantity's are. No model info names it, so the drift test lists it among the app-owned quantities.
    The bound is 30 000 to 110 000 Pa, held by the app in `kindBounds`: neither the library nor pythermalcomfort
    (4.6.0, `a424402`) bounds `p_atm`. It is the range three of the deployed tool's four pages use
    (`static/js/EN/en.js:197-198`, `compare/compare.js:488-489`, `ranges/ranges.js:469-470`, at `e809c96`); its
    ASHRAE page uses 60 000 to 108 000 (`ASHRAE/ashrae.js:298-299`). There is one range for every model, because the
    pressure does not change on a model switch. A pressure outside it is marked and nothing is calculated, as for an
    entered value that is out of range, but it is judged apart from `outOfRangeRows`: that list is what a model
    switch asks about and adjusts in the slot, and the pressure is neither held in a slot nor dependent on the model.
    Every library call that takes `p_atm` reads the session's pressure, which core takes as a parameter: the
    humidity-ratio entry mode's two conversions, the psychrometric chart's relative-humidity curves and its marker,
    and the zone solver. The chart's humidity-ratio axis follows the pressure too, by decision 45 as amended. An
    entry mode's conversions are `(value, tdb, p_atm)`. The entered quantity stays the truth:
    a change of pressure keeps an entered humidity ratio and moves the relative humidity derived from it, and keeps
    an entered relative humidity and moves only the psychrometric chart.
    No model is passed the pressure. None of the four registered models takes `p_atm`, and the library fixes it at
    101 325 Pa inside `cooling_effect`, as pythermalcomfort does (`models/cooling_effect.py:19`). Input resolution
    starts to fill `p_atm` from the session with the first registered model whose info names it.
    Three differences from the deployed tool are recorded, not ported. There a wet-bulb entry moves with the
    pressure (`static/js/psychrometrics.js:145`), and here it does not, because the library's `t_wb` takes no
    pressure, as pythermalcomfort's `wet_bulb_tmp` takes none. There PMV at elevated air speed moves with the
    pressure, through the SET inside its cooling effect (`static/js/comfort-models.js:804`), and here it does not.
    There the pressure is neither saved nor shared (`static/js/global.js:9-18`).
    Two rules wait for their phases: Reset returns the pressure to 101 325 Pa (Phase 5c), and a share link that
    carries no pressure means 101 325 Pa, while one that carries a pressure out of range shows it as out of range
    and does not replace it (Phase 5).
    Rejected: a pressure per slot, because one psychrometric chart has one humidity-ratio axis; a bound per
    standard, because a model switch could then put the pressure out of range; kPa, for the rounding above; the
    pressure as a row of `outOfRangeRows`, because `adjustToBounds` writes to a slot.
    **Noted 2026-09-29 (Phase 4c close-out; `.scratch/atmospheric-pressure/` ticket 05).** Two sentences above were
    written ahead of the code and say more than it does. "Every library call that takes `p_atm` reads the session's
    pressure": the dew-point, wet-bulb and vapour-pressure modes' `fromRelativeHumidity` call `psy_ta_rh` without it.
    They read its `t_dp`, `t_wb` and `p_vap`, which it computes without `p_atm` (the library's
    `src/psychrometrics/psy_ta_rh.js:34-39`, at `cee6893`). Every call whose answer depends on the pressure reads it.
    "An entry mode's conversions are `(value, tdb, p_atm)`": in core the third parameter is `atmosphericPressure`, as
    in every function that takes the pressure, and `fromRelativeHumidity`'s first is the relative humidity
    (`core/entryModes.ts:64-66`). `p_atm` is its name only where core hands it to the library.

Taken 2026-09-29, in Compare's grilling session (review item 4 between Phase 4b and Phase 5), ahead of the code. Its
input was the "Phase 5 item 1" rows of `.scratch/review-after-4b/deferred.md` (`S055`, `S074`, `S036`) and the open
question in the Comments of `.scratch/atmospheric-pressure/issues/04`. The deployed tool is read at `e809c96`, from
the local `../comfort_tool` checkout:

50. **Compare shows up to three slots, and no slot is a baseline.** Revises ADR-0001 §4.3's "Baseline decides which
    row the difference highlighting is relative to", §4.4's "marker points for the three slots", §4.5's
    `compare: { enabled, activeSlot, baselineSlot }` and §4.8's `"compare"` object.
    The session holds whether Compare is on, and whether slot 2 and slot 3 are each enabled. Slot 1 cannot be
    disabled. A slot is compared while Compare is on and it is enabled, and slot 1 always is. The first time Compare
    is switched on, slots 1 and 2 are enabled; after that the session keeps what the person chose, and switching
    Compare off and on changes none of it. There is no active slot, no baseline and no difference highlighting.
    "Difference highlighting" was never defined: ADR-0001 §4.3 and the rewrite plan name it and nothing says what is
    highlighted.
    A slot holds nothing until it is first enabled, when it takes a copy of what slot 1 holds at that moment. After
    that it keeps its own values, enabled or not. Reset (Phase 5c) returns slots 2 and 3 to never enabled.
    The inputs are three columns side by side, one row per quantity. While Compare is on, each slot's column takes a
    third of the width whether it is enabled or not, with the slot's button at its head, so enabling a slot moves no
    other column; a disabled column is empty below its button. While Compare is off, slot 1 takes the whole width and
    there are no slot buttons. How it looks is Phase 5c's. With no active slot, a Phase 5b calculator names the slot
    it writes into when it is applied.
    Both charts draw, for every compared slot, the declaration's comfort zones solved at that slot's own values, and
    one marker. A standard with several zones draws all of them for each slot, nested, in the slot's hue with the
    opacity rising inwards, as the one slot's are drawn today. A slot's name is fixed, "Input 1" to "Input 3", and its
    name and its hue follow its position. Both are given in one place, which the input columns, the table's rows and
    the chart's zones and markers read (`S055`).
    Compare is the Standard page's. Explore draws the bands of slot 1 and has no Compare button; Compare stays as it
    was on the way back to Standard. A band field is scanned at one slot's values, so it cannot be drawn for three, and
    a model with bands and no comfort zone has nothing to draw per slot. A model without a standard is therefore not
    compared.
    `ChartRequest` carries a list, one entry per compared slot with that slot's last valid run, its name and its hue,
    beside the one unit system and the one atmospheric pressure. It moves to `core/charts/chartRequest.ts`, so
    `chartSpec.ts` holds only what the chart component reads (`S036`).
    The share link carries whether Compare is on and which slots are enabled, both, so that it restores a session
    whose Compare is off while slot 2 holds values of its own. A slot never enabled is `null` in the link, as in
    ADR-0001 §4.8's example. `core/shareLink.ts` fixes the schema in Phase 5.
    The dynamic chart's zone is a contour of the scanned number (decision 27), so three compared slots are three
    scans. PMV (ASHRAE 55)'s scan was measured at a median of 90.5 ms (rewrite plan, 2026-09-27); three were not
    measured. Compare's first ticket measures them, and decision 29 reopens by its own terms past 300 ms.
    Three differences from the deployed tool's Compare page are recorded, not ported. There input 1 can be unticked
    as well (`static/js/compare/compare.js:43-73`); the three inputs start at three different sets of values
    (`compare.js:691-753`); and the result table has a column per input (`templates/compare.html:350-490`), where
    ADR-0001 §4.3's one row per slot stands. What is ported is its chart: a zone and a point per input, each at that
    input's own values (`static/js/compare/temphumchart-compare.js:149-208, 230-262`,
    `compare/psychchart-compare.js:569, 600`), with no baseline anywhere on the page.
    Rejected: a baseline that decides what the chart is drawn of, because the other slots' markers would lie on a
    zone solved at another slot's values; one input panel with an active slot, because comparing is reading across a
    row; a set of starting values per slot, because a declaration would write its defaults three times; bands of
    slot 1 in Explore with markers for the others, which is the baseline under another name.
    **Noted 2026-09-30 (`.scratch/compare/` ticket 01).** "Decision 29 reopens by its own terms past 300 ms" held
    three scans to a line decision 29 draws for one. Three were measured at 328.3 ms and Input 1 alone at 98.0 ms, so
    decision 29 did not reopen, and its amendment of the same day keeps v1 synchronous whatever three slots cost.
    **Noted 2026-09-30 (Compare's close-out; `.scratch/compare/` ticket 09).** The sentences above were written ahead
    of the code (`.scratch/compare/` tickets 02 to 07). These are the ones that say more than it does, or less.
    "A slot holds nothing until it is first enabled": nothing is `null`. `Session.slots` is `[InputSlot, InputSlot |
    null, InputSlot | null]` (`state/session.svelte.ts:160`), and the session holds `compare` and an `enabled` per
    slot beside it. No flag records the first switch-on: a switch-on is the first while slots 2 and 3 are both `null`
    (`setCompare`, `:225-230`), so Reset returning them there makes the next one a first again.
    "Slot 1 cannot be disabled": its button is pressed and does nothing when pressed; it is not `disabled`, and stays
    in the tab order (the user, 2026-09-30; `routes/StandardPage.svelte:84-89`).
    "One row per quantity": each column is an `InputPanel` of its own and carries its own labels. Nothing ties a row
    across the columns; they list the same quantities in the same order because the three slots are entered under one
    model and in one entry mode. While Compare is on, the input columns' track of the page widens from 24rem to 40rem.
    The result table's first cell is the slot's name, beside a swatch of its hue while Compare is on; while it is off
    the one row reads "Input 1" with no swatch.
    "Both charts draw, for every compared slot, the declaration's comfort zones ... and one marker": for every
    compared slot that has a last valid run. A slot whose gate has been closed ever since it came under the session's
    model has none: one that reached the model with an entry out of range, or one first enabled as a copy of slot 1
    while slot 1's gate is closed. It has no zone and no marker, and the chart is drawn of the others, whether slot 1
    is among them or not (`state/compute.svelte.ts:109-111`). On the scanned dynamic chart, one drawn slot still draws
    the bands, as before Compare; Phase 5 item 3 takes them to Explore. Two or more draw no bands: each slot's zones
    are contours of its own scan, and one hover grid reads every slot's number
    (`core/charts/dynamicChart.ts:189-229`). Those zones are the ones the declaration's psychrometric chart lists, and
    they are cut only from a scan of `pmv` (`contouredZonesOf`, `:259-264`); a scanned chart of another output would
    draw markers alone, and no model with a standard has one. In the legend a zone is named by its slot, "Input 2 ·
    ...", only while more than one slot is drawn.
    "Both are given in one place": `core/slotBadge.ts`, `slotBadges`, one `{ name, hue }` per position, a file
    ADR-0001 §5's tree does not list. A hue is three inks (marker, zone line, zone fill). Slot 1's are the inks the
    charts had, and slots 2 and 3's are placeholders for Phase 5c.
    "`ChartRequest` carries a list, one entry per compared slot with that slot's last valid run": an entry is a
    `ChartedSlot`, the run's slot with the name and the hue (`core/charts/chartRequest.ts:11-13`). The run's model and
    pressure are not per entry. The request holds the session's model, since a kept run belongs to no other, and one
    pressure, that of the first drawn slot's run. It also holds the session's temperature entry mode (decision 51).
    `chartSpec.ts` imports nothing, and lint bars `ui/charts/` from the request module (`eslint.config.js:72`).
    "Three were not measured": in the running app, an edit to what the three slots share redrew PMV (ASHRAE 55)'s
    dynamic chart in a median of 332.8 ms, beside ticket 01's 328.3 ms, and an edit to one slot's clothing, one scan,
    in 149.0 ms (ticket 05).
    Explore, the share link, Reset and the calculators are not built. Their sentences above are rules for their
    phases, and nothing in the code contradicts them.
51. **An entry mode is the session's, and every slot is entered in it.** Amends decision 47, whose `Slot` keeps its
    shape: each slot still holds its humidity and temperature entry, and the session keeps the three in step.
    Changing an entry mode converts every slot, compared or not, each by the rule `core/slot.ts` states and at its
    own values. The deployed tool's Compare page has one humidity select and one operative switch for its three
    inputs (`templates/compare.html:182-188, 313`). A row of the input columns has one label, so its three inputs are
    one quantity.
    The chart's axes are resolved from the session's entry mode. A slot whose gate is closed keeps its last valid
    inputs in the entry mode they were entered in (decision 52); its marker is converted into the session's entry
    mode by the function the entry-mode change converts with, so the marker and the change cannot differ. This
    settles what decision 33's amendment of 2026-09-28 left to Compare (`S074`): no slot decides the axes.
    Rejected: an entry mode per slot, because three columns could not share a row and the chart's axis would need a
    slot to follow.
    **Noted 2026-09-30 (Compare's close-out; `.scratch/compare/` ticket 09).** "Converts every slot, compared or not":
    every slot that holds values. A slot never enabled is `null` and is not converted; it takes the entry modes when
    it copies slot 1 (`Session.setTemperatureMode` and `setHumidityMode`, `state/session.svelte.ts:270-285`).
    "The session keeps the three in step": the session holds no entry mode of its own. `session.temperatureMode` and
    `session.humidityMode` read slot 1's (`:252-262`), and the second is `undefined` while slot 1 holds no humidity.
    `InputSlot` has no entry-mode setter, and only the session hands `replaceWith` a converted slot (`:272, 283`).
    "A row of the input columns has one label": each column carries its own labels (decision 50's note of the same
    day). What appears once is the pair of entry-mode controls, `ui/inputs/EntryModeControls.svelte`.
    "Its marker is converted": the whole kept slot is, by `withTemperatureMode`, in both builders, so its scan, its
    zones and its marker are all of the converted slot (`core/charts/dynamicChart.ts:73, 157, 233`,
    `psychrometricChart.ts:111`). Only the temperature entry mode moves an axis.
    "The chart's axes are resolved from the session's entry mode" changes a session whose Compare is off as well. With
    the gate closed and the temperature entry mode changed, the chart and the picker move to the new mode's axes,
    where decision 33's amendment of 2026-09-28 kept both on the kept run's (ticket 06).
    **Amended 2026-09-30 (the grilling of `.scratch/activity-adjusted-inputs/`).** The share link writes the entry
    modes once, beside the model, one per entry group, and decoding hands them to every slot; ADR-0001 §4.8's example
    writes them per slot and is noted. The slot keeps its entries, as above: a value is read by the mode it was
    entered in, and a kept run is a whole slot (decision 52), so the mode stays with the value and the session is
    its only writer. The invariant that every held slot is in slot 1's mode is stated at the session's readers and
    pinned by a test, which nothing does today. This is the reading `CONTEXT.md`'s Slot and Session entries give
    every piece of state: a slot holds what describes one air and one occupant, the session what makes three slots
    one table, and the link writes the first per slot and the second once. Checked the same day against everything
    the session and the slot hold, the entry modes were the one row where the decision, the code and the link's
    example disagreed. Rejected: the mode on the session and off the slot, because every core reader of a slot would
    take a mode and a kept run would carry one beside its slot; the mode per slot in the link, because a link could
    then restore three columns in three modes, which the page cannot show.
    **Noted 2026-10-01 (`.scratch/activity-adjusted-inputs/` ticket 05).** "So the marker and the change cannot
    differ" names the marker's agreement with the entry-mode change, not with the kept run. Where the change is lossy
    the drawn slot differs from the run it was kept with: a slot kept in separate entry and drawn on an operative chart
    is drawn at `tdb = tr` = its operative temperature, where its run was given the two temperatures apart
    (`core/charts/comparedSlots.test.ts`, "is drawn on the session's axes, at the temperature the entry-mode change
    converts it to"). The spec of that folder names a kept dynamic clothing entry in a clothing-insulation session as a
    second case; since `dcc2909` the clothing switch back inverts, so that slot is drawn at the dynamic clothing
    insulation its run was given, as a kept relative air speed is since `6267385` (the same file's two "…its run was
    given" tests), but for the cases decision 54's note of the same day names. The two new groups' conversions are
    applied by the builders as the temperature one is, through `withEntryModes` (`core/slot.ts:557-559`), and both
    groups move an axis: the dynamic chart offers the quantity the mode enters.
    The amendment above, as built (`150fae9`, `4610891`, `edcf6f2`): "the share link writes the entry modes once" is a
    rule for Phase 5 item 4, whose link does not exist yet. "The session is its only writer": the session's four
    setters and a switch's landing write a mode, each through `InputSlot.replaceWith`, which stays public; an
    `InputSlot.setEntered` of another humidity mode's quantity would move one slot's humidity mode, which no row
    offers. "Stated at the session's readers and pinned by a test": `Session.entryModes`
    (`state/session.svelte.ts:273-296`), which the four per-group readers point at, and "keeps every slot that holds
    values in slot 1's entry modes after every operation" (`state/sessionCompare.svelte.test.ts:498`), over all four
    groups. It does not hold through a question left standing: a mode changed or a slot first enabled while a switch
    question is pending is not in what a "Yes" lands; the dialog is modal, so no person reaches that, as the reader's
    comment says (`:296-298`).
    **Noted 2026-10-01 (Phase 5 item 3's grilling).** The dynamic chart's humidity axis is the library's `rh` in every
    humidity entry mode, a rule and not an omission (`core/slot.ts`, `panelQuantities`): following the mode would take
    an axis range per humidity quantity in every declaration, a conversion to `rh` at each cell's dry-bulb temperature
    and a rule for the cells above saturation, for a view nobody asked for. Left out of v1; the "Unscheduled" row of
    `.scratch/review-after-4b/deferred.md` is closed by this note.
52. **Each slot has its own gate, and a switch asks once for every compared slot.** Amends decisions 32 and 33, which
    were written for slot 1 alone.
    The gate is asked per slot. A slot with an entry out of range keeps its own last valid run, and its row, its
    zones and its marker are of that run, while the other slots are calculated. An atmospheric pressure out of range
    still stops every slot (decision 49). A kept run belongs to the model that made it, as before.
    A requested switch is rehearsed on every slot. The dialog lists what the gate would flag in the compared slots,
    grouped by slot, with the slot's name in a column of its own. There is one question: a yes adjusts every listed
    value and lands the three slots with the model in one step, and a no leaves all three untouched. A slot that is
    not compared is converted and seeded and lands with the others, but it is not listed and not adjusted; when it is
    next compared the gate flags what it holds. That is the rule decision 32 gives a model reached by the address,
    which converts and seeds all three slots and asks nothing.
    Rejected: a question per slot, because the session has one model and a yes to one slot and a no to another leaves
    none to land; listing a slot that is not compared, because the person would be asked about values they cannot
    see.
    **Noted 2026-09-30 (Compare's close-out; `.scratch/compare/` ticket 09).** "Its row, its zones and its marker are
    of that run": the row is. The zones and the marker are of the run's slot, drawn at the chart's one pressure, the
    first drawn slot's run's, and in the session's entry mode (decision 51). So a slot kept from a run at another
    pressure shows a row calculated at its run's pressure and zones solved at the chart's
    (`state/compute.svelte.ts:75-80`; the user, 2026-09-30: the pressure is global).
    Whether a slot was calculated is said in a caption line under the table, named by the slot while Compare is on,
    not in the slot's row (`ui/outputs/ResultTable.svelte:36-39, 89`).
    "Rehearsed on every slot", "lands the three slots" and "all three slots": every slot that holds values. A slot
    never enabled stays `null` through a switch. The pending question is `{ model, slots }`, one `RehearsedSlot` per
    held slot, whose `listedRows` are empty for a slot not compared (`state/session.svelte.ts:130-151, 348-357`).
    "With the slot's name in a column of its own": while more than one slot is compared. With one, the dialog has no
    such column and reads as it did. The column has no heading: "Input" already heads the quantity's column.
    **Amended 2026-10-01 (decision 57).** On the Explore page the compared slots are slot 1 alone: the dialog lists its
    rows, and slots 2 and 3 are converted and seeded as a slot not compared is.
53. **A bound that depends on the pressure is not taken while the pressure is out of range.** Amends decisions 32, 46
    and 49, and answers the question `.scratch/atmospheric-pressure/issues/04` left open. While the atmospheric
    pressure is outside its bound, a humidity-ratio entry has no bound: it is not marked, a requested switch does not
    list it, and a yes does not move it. Nothing is calculated then in any case, and the gate judges the entry again
    once the pressure is back in range. The other humidity entry modes are judged as before, since their conversions
    do not read the pressure (decision 49's note of 2026-09-29).
    The gate converted the bound at the session's pressure whatever it was, so above 110 000 Pa the bound tightened,
    an entry that was in range was marked, and a yes moved it to a bound taken at a pressure the app calls out of
    range (ticket 04's Comments give `psy_ta_rh(25, 100, p).hr` as 0.01845 at 110 000 Pa and 0.01687 at 120 000;
    not recomputed for this decision). The deployed tool never holds such a pressure: it refuses one at entry
    (`static/js/compare/compare.js:475-500`), where decision 49 marks it and keeps it.
    Decision 32's "a 'Yes' then leaves nothing out of range" (`core/modelSwitch.ts`) does not hold while the
    pressure is out of range: a humidity-ratio entry may be out of range once the pressure returns.
    Rejected: the bound at the nearest pressure in range, because the app would test an entry against a pressure
    nobody entered; refusing a switch while the pressure is out of range, because the pressure does not depend on the
    model.
    **Noted 2026-09-30 (Compare's close-out; `.scratch/compare/` ticket 09).** How the gate knows which entry mode's
    bound depends on the pressure: an identity check on `humidityMode.humidityRatio` in `humidityEntryBoundFor`
    (`core/applicability.ts:124`), the second such check beside wet bulb's, and `HumidityMode` gains no field. Whether
    that reopens `BS04` is deferred to a later grilling (`.scratch/review-after-4b/deferred.md`, "Unscheduled").
    "Not recomputed for this decision": ticket 08 computed `psy_ta_rh(25, 100, p).hr` as 0.018451 at 110 000 Pa and
    0.016872 at 120 000, which agree.
    "The other humidity entry modes are judged as before": a wet-bulb entry had no bound before and has none now.
    "Decision 32's 'a "Yes" then leaves nothing out of range' (`core/modelSwitch.ts`) does not hold while the pressure
    is out of range": the exception is written where the sentence is, in `rehearseSwitch`'s comment
    (`core/modelSwitch.ts:40-43`). Since decision 52 it is also a sentence about the compared slots alone: a slot not
    compared is not adjusted by a yes.
    **Noted 2026-10-01 (`BS04`, Phase 5 item 3's grilling).** The two checks on a humidity mode's identity in
    `humidityEntryBoundFor` (`core/applicability.ts:154-172`) move onto the mode: `HumidityMode` gains `bounded` (false
    for wet bulb) and `readsPressure` (true for humidity ratio), and the gate reads them. The behaviour is unchanged
    (decision 46's bound, this decision's exception); a ticket of its own before Phase 5 item 3's. Closes the
    "Unscheduled" row of `.scratch/review-after-4b/deferred.md`.
    **Noted 2026-10-02 (`.scratch/explore/` ticket 09).** Built as `d71f9a4` (`.scratch/explore/` ticket 01), with no
    test's expected value changed. The flags are `HumidityMode.bounded` and `readsPressure` (`core/entryModes.ts:84,
    86`); the gate reads them in `humidityEntryBoundFor`, now at `core/applicability.ts:156-166`, where the note above
    cites `:154-172` and the note of 2026-09-30 `:124`. The comment on why wet bulb is unbounded sits on its
    `bounded: false` (`core/entryModes.ts:126-129`).
54. **An activity-adjusted input is an entry group with two entry modes.** Taken 2026-09-30 in the grilling of
    `.scratch/activity-adjusted-inputs/` tickets 01 and 02, ahead of the code. Amends ADR-0001 §4.1.5 ("Relative air
    speed → an option"; "Dynamic predictive clothing" as a calculator) and §4.5's `v → vr` rule, revises decision 48
    and settles the rewrite plan's Phase 5b item 2. The deployed tool is read at `e809c96`, the library at `cee6893`,
    pythermalcomfort at its `master` (the local checkout, identical for the files cited).
    Two inputs the library takes are corrected for the occupant's activity, and the library corrects neither:
    `pmv_ppd_ashrae` and `pmv_ppd_iso` hand `vr` and `clo` to the kernel as given
    (`src/models/pmv_ppd_ashrae.ts:181-195`), as pythermalcomfort's do (`models/pmv_ppd_ashrae.py:140-184`), whose
    docstrings say "vr can be calculated using the function `v_relative`" and "The dynamic clothing insulation, clo,
    can be calculated using the function `clo_dynamic_ashrae`" (`:42-51`, `:57-66`; the ISO one points at
    `clo_dynamic_iso`, `models/pmv_ppd_iso.py:55-64`), and whose examples correct both before the call. The app
    derives `vr` (decision 48) and passes `clo` through, so above 1.2 met it runs the models on an intrinsic clo
    where the library's `clo` is the dynamic one, and its clo presets are intrinsic values. That is the misuse the
    docstring names, not a difference between tools.
    Each is an entry group, as temperature and humidity are (decision 51), with two entry modes. The first, the
    default, enters the uncorrected value and the model gets the corrected one: "Air speed", `v`, from which
    `vr = v_relative(v, met)`; "Clothing insulation", the intrinsic `clo`, from which the model's standard's rule
    derives the dynamic one. The second enters the corrected value, which the model gets unchanged: "Relative air
    speed", `vr`; "Dynamic clothing insulation". A model has the air-speed group when its info names `vr`
    (decision 48) and the clothing group when its info names `clo` and its standard has a correction. The
    corrections are the standards' rules, not the models': ASHRAE 55 corrects `clo × (0.6 + 0.4/met)` above 1.2 met
    (`clo_dynamic_ashrae`) and ISO 7730 Annex C by ISO 9920 (`clo_dynamic_iso`, which also takes the air speed and an
    air-layer insulation defaulting to 0.7), and pythermalcomfort names the functions after the standards. So a
    table in core, keyed by `Standard`, holds one row per standard that corrects; a model whose standard has no row
    passes `clo` through; a standard's row lands in core ahead of its first model, as a quantity does. The air-speed
    correction is one equation for both standards (`environment/v_relative.py:9-31`) and needs no table.
    An entry mode is the session's (decision 51): one control per group beside the temperature and humidity
    controls, converting every slot that holds values, and the share link writes it once. Every call of the model
    takes the corrected value, the run, the scan and the zone alike, as `vr` does today. Under the second mode the
    row the library reports on `vr` is the `vr` row, with no mapping to `v` (`core/applicability.ts:238` applies
    under the first mode alone), and the dynamic chart's air-speed axis is the mode's quantity. Switching into the
    corrected mode derives, so the person sees the number the model gets; switching back keeps the number, an entry
    convention of decision 21's kind, not an equation. No output row shows a derived value: the switch is the
    readout, and what the outputs block shows is Phase 5c's.
    The library first (decision 22): the main repository at `cee6893` has neither `clo_dynamic_ashrae` nor
    `clo_dynamic_iso`, only the old `clo_dynamic(clo, met, standard)` whose ISO branch is pythermalcomfort 2.10.0's
    ASHRAE formula at a moved threshold (`src/utilities/utilities.js:589-609`); the rewrite plan's alignment table
    records the split in the fork (`3292f0b`), which the main repository did not take. The feature's first ticket
    ports both from pythermalcomfort (`clothing/clo_dynamic_ashrae.py:8-51`, `clothing/clo_dynamic_iso.py:13-84`)
    and settles there what the ISO correction takes while the app holds `vr`, since the library's signature decides.
    The old `clo_dynamic` is the library's own call.
    The rewrite plan's Phase 5b item 2 named "Dynamic predictive clothing" and wired it to `clo_dynamic_ashrae` /
    `clo_dynamic_iso`. The deployed button of that name predicts the clo from the outdoor temperature at 6 a.m.
    (`comf.schiavonClo`, `static/js/ASHRAE/ashrae.js:384-389`), the library's `clo_tout`; that is the calculator,
    and the item is rewritten to it. The activity correction is not a calculator: its input is its target, so Apply
    would overwrite the intrinsic clo with the dynamic one, and the next change to met would correct a corrected
    value.
    The deployed tool: one flag per page, `comf.useSelfGeneratedAirSpeed` (`static/js/comfort-models.js:9-17`), and
    a checkbox "Include activity-generated air speed" in the "Relative air speed" dialog
    (`templates/ashrae.html:616-634`), on the ASHRAE, EN, Compare and Ranges pages since 2.5.10; Compare's one
    checkbox drives its three inputs (`compare/compare.js:453-464`). Unticked, the entered "Air speed" is passed as
    `vr`: this decision's second mode under the first mode's label. Clothing it corrects unconditionally above 1.2 met
    on the ASHRAE, Compare and Ranges pages (`comfort-models.js:19-25, :95`), for PMV, the cooling effect and every
    zone, not SET, and shows the result on the ASHRAE page alone (`ASHRAE/ashrae.js:569-574`); its EN page corrects
    nothing and takes a "Dynamic clothing insulation" the person computes (`templates/en.html:182-193, 525-536`).
    Its "Relative air speed" dialog is where ADR-0001 §4.1.5 saw an option.
    Four differences are recorded, not ported. There the toggle is neither saved nor shared (`global.js:9-18`,
    `ASHRAE/ashrae.js:215-243`), and here the mode is in the link. There the row stays "Air speed" while the entry is
    `vr`, and here it is named. There the Compare page corrects clothing and shows nothing of it. There ASHRAE 55's
    air-speed limit is checked on the raw `v` where the library checks `vr` (`ashrae.js:699`; `pmv_ppd.ts:399-407`),
    already recorded at `src/models/pmvPpdAshrae.ts:22-28`. The ISO correction exists nowhere in the deployed tool.
    Where it lands: Phase 5 item 9, built before items 3 and 4, so the link's schema is written once.
    Rejected: a boolean on the session, the deployed tool's shape, because the row's label would be wrong while it
    is off and the session would hold a kind of state, a derivation rule, that Slot and Session's entries have no
    place for; an option, because an option's key is a kwarg (decision 36) and neither correction is one; the
    declaration naming the clothing correction, because it would restate its standard's rule; correcting always
    with no second mode, because the two groups would then differ in shape for no reason and the EN page's practice
    would have no equivalent; passing `clo` through under the label "Dynamic clothing insulation", because the
    presets would then be wrong above 1.2 met; inverting on the switch back where an inverse exists, because the
    ISO clothing has none and the two standards would then behave differently on one switch; output rows for the
    derived values, because a row that reads an input back is not a result.
    **Revised 2026-09-30 (the grilling of `.scratch/activity-adjusted-inputs/` ticket 03's open points).** The switch
    back to air speed entry inverts the correction, `v = vr − 0.3·(met − 1)` and `v = vr` at or below 1 met, the
    exact inverse of the library's `v_relative` to its rounding of 0.001; so the model takes the same relative air
    speed before and after a switch either way, and the chart's zones, its result and its band do not move, only the
    axis's quantity. The clothing group keeps the number on the switch back, as above, because the ISO correction has
    no closed inverse; the rule is per group, never per standard, so "switching back keeps the number" is the clothing
    group's. The rejection of "inverting … where an inverse exists" stands as a rejection of an inverse for one
    standard's clothing. An inverse may give a negative air speed, when the entered relative air speed is below the
    activity's share; the air speed is bounded at 0 by its kind (`kindBounds`, decision 46), which the gate reads in
    every model and a switch lists. The mode is the slot's: through a model without the group the slot returns to the
    default mode by the same conversion, as decision 32 says for temperature; through Adaptive the relative air speed
    the model takes comes back unchanged and only the row's label is lost. The second mode's axis quantity has a
    declared axis range, as `operative_tmp` has, and a registry-wide test holds that a model declaring a group's
    default axis declares every mode's; the group itself is still not declared.
    **Revised 2026-09-30 (the third grilling of `.scratch/activity-adjusted-inputs/`: the open points of tickets 04,
    06 and 07, before ticket 05).** Four things change, three are recorded, and four are kept with their reasons.
    *The ISO clothing correction corrects at every metabolic rate.* ISO 7730 Annex C, as ISO 9920 gives it, has no
    threshold: the library's `clo_dynamic_iso` moves 0.5 clo at 1.1 met and 0.1 m/s to 0.424, and 2 clo at 1 met in
    still air to 2.069; only ASHRAE 55's rule is the identity at or below 1.2 met. So "a person below 1.2 met sees
    their numbers as they are today" is true of PMV (ASHRAE 55) alone, and the ISO page's default PMV, −0.24 before
    the clothing group and −0.41 after, is the standard's answer. pythermalcomfort's two docstrings both require the
    dynamic value; its ASHRAE example computes it with `clo_dynamic_ashrae` (`pmv_ppd_ashrae.py:118-121`) and its ISO
    example passes a value named `clo_dynamic` without computing it (`pmv_ppd_iso.py:115-124`), so "whose examples
    correct both before the call" above is true of the ASHRAE one. The deployed EN page treats the default 0.5 as
    the dynamic value; here 0.5 is the intrinsic one.
    *One bound rule for both activity-adjusted groups*, the humidity group's rule (decision 46) applied to them: a
    model info bounds only the quantity the model takes, `vr` and the dynamic `clo`; an entry in the corrected mode
    is held to that bound as it is; an entry in the uncorrected mode is held to that bound converted into the entered
    quantity by the correction's inverse, at the slot's own other values, so the range beside the row, the gate and
    the switch dialog read one bound and a "Yes" moves the entry to its converted end. The air-speed inverse is closed
    (`v = vr − 0.3·(met − 1)`, the revision above). The clothing inverse is a bisection over the standard's own rule
    from the table, so the app transcribes neither standard's formula; the rule is monotone in the clothing insulation
    (checked on a grid of metabolic rates 1 to 4 and relative air speeds 0 to 2). Both inverses are the app's, in
    `src/temporary-library/` by decision 21's rule C. At 1 met in still air an entered 2 clo on PMV (ISO 7730) is
    therefore stopped (the bound is 1.934), where before the run reported it; at 2 met on PMV (ASHRAE 55) an entered
    1.6 clo passes (the bound is 1.875, the model is given 1.28), where before the gate stopped it. PMV (ASHRAE 55)'s
    three air-speed limits at the operative temperature are not in its info and stay reported after the run.
    *Both groups invert on the switch back.* The clothing group no longer keeps the number: with one inverse for any
    rule in the table, the reason the revision above gave, that the ISO correction has no closed inverse and one
    standard's clothing would behave differently, no longer holds, and "into derives, back inverts" is the rule of
    both activity-adjusted groups. The rejection above of "inverting on the switch back where an inverse exists" is
    withdrawn with it. A slot switched to dynamic clothing entry and back gives the model the same dynamic clothing,
    so nothing on the chart moves but the row's quantity, and a round trip no longer ratchets the clothing down
    (1 → 0.84 → 0.71 at 2 met on ISO, as built by ticket 04). Through a model without the group the dynamic clothing
    comes back unchanged too, as the relative air speed does through Adaptive (ASHRAE 55).
    *Recorded:* an entered relative air speed finer than 0.001 m/s (any whole fpm in IP) is given to the model as
    entered and comes back rounded after a round trip, the library's rounding of `v_relative`, below the displayed
    precision; the ISO row of the clothing table is one row per edition the library names, 2005 and 2025, since both
    give the same Annex C; the "≥ 0" every air-speed row shows on the PMV pages since the revision above is the kind
    bound alone, shown until the converted bound replaces it.
    *Kept, with the reasons:* the default air-speed mode enters the air speed, because the deployed tool's default
    page does (its checkbox is on, `comfort-models.js:9`, and the entered 0.1 m/s reaches the model as 0.13 at
    1.1 met) and both of pythermalcomfort's PMV examples compute `vr` from `v`; a relative air speed default would
    either change the default page's PMV (0.1 as `vr`: ISO −0.29, ASHRAE −0.13) or write a met-dependent number into
    a declaration (0.13). The second mode's axis range is declared, not converted from the first's or from the
    applicability: a converted range would move with the metabolic rate and go negative on the air speed, and the
    applicability's would shrink PMV (ISO 7730)'s to 0 – 1, which ticket 06 was opened to stop. Both controls stay:
    the deployed tool's air-speed checkbox is the second mode under the first mode's label, and its EN page is the
    clothing group's second mode alone; among the main models only the two PMV models take the dynamic clothing
    (pythermalcomfort's `set_tmp`, `two_nodes_gagge` and `phs` do not name it), and the table keyed by standard already
    gives it to no other. The clothing stays two quantities, `clo` entered and `clo_dynamic` derived, because the
    entry-group machinery tells modes apart by the quantities they put among the values, as `v`/`vr` and
    `tdb`,`tr`/`operative_tmp` do; one quantity whose label follows the mode would need a clothing-shaped branch at
    every reader of `Quantity.label`. The work is `.scratch/activity-adjusted-inputs/` tickets 08 (the inverses; both groups invert back)
    and 09 (the converted bound), ahead of 05.
    **Noted 2026-10-01 (decision 55).** Three sentences above hold to the precision a row shows and no further: "the
    model takes the same relative air speed before and after a switch either way, and the chart's zones, its result
    and its band do not move", "a slot switched to dynamic clothing entry and back gives the model the same dynamic
    clothing", and "a 'Yes' moves the entry to its converted end". A conversion stores the two decimals the row
    shows, so a switch may move a result in its last shown digit. The *Recorded* relative air speed finer than
    0.001 m/s no longer arises: an entry is held at two decimals from the moment it is committed. As built by ticket
    09 (`60f088f`, `174de5a`) the converted end is what the inverse returns (1.934059254 clo at 1 met in still air
    under ISO 7730, which the rule gives the model as 2.0000000004) and a "Yes" lands on 1.93. *Withdrawn the same
    day by decision 56: the three sentences hold again at full precision, as ticket 09 built them; the finer relative
    air speed arises again and is accepted; a "Yes" lands on 1.934059254, which the gate passes at the shown
    precision, and the library's warning on the 2.0000000004 it then computes is dropped by the same comparison.*
    Built as `36573db` (the dropped warning) and `56bfbe2` (the "Yes"; `.scratch/one-precision/` tickets 02 and
    03), pinned in SI and IP by `state/sessionClothingMode.svelte.test.ts`'s "leaves, on a yes, the converted end
    itself, which ISO 7730's run reports nothing of".
    **Noted 2026-10-01 (`.scratch/activity-adjusted-inputs/` ticket 05).** Read sentence by sentence, with both
    revisions, against the code at `758d272`. Built as `150fae9` (the entry-group table), `4610891` (the air-speed
    group), `6ea791b` (the relative air speed's axis range and the registry-wide axis check), `6267385` (the air-speed
    switch back inverts; `kindBounds.airSpeed`), `a0c7e16` and `edcf6f2` (the `clo_dynamic` quantity; the clothing
    group), `dcc2909` (both inverses in `src/temporary-library/`; the clothing switch back inverts) and `60f088f` (the
    converted bound), on the library's `76a570d` (on `origin/feat/v2-typescript-setup`). A sentence not named here
    stands. Those that say more or less than the code:
    "ISO 7730 Annex C by ISO 9920 (`clo_dynamic_iso`, which also takes the air speed …)": the app calls
    `clo_dynamic_iso_vr(clo, met, vr)` (`core/clothingCorrection.ts:37`), at the relative air speed a slot resolves to
    in either air-speed mode. The port added it, a deviation pythermalcomfort does not have that changes no value:
    `clo_dynamic_iso(clo, met, v)` is it at `v_relative(v, met)`, and handing `clo_dynamic_iso` a `vr` would add the
    activity's share twice. "ASHRAE 55 corrects `clo × (0.6 + 0.4/met)`": rounded to 0.001, as upstream's
    `np.around`, so the rule is a step function (the clothing inverse below). The port also removed the old
    `clo_dynamic`, which answers "the library's own call", and made `v_relative` round half to even, as upstream does.
    "A table in core, keyed by `Standard`, holds one row per standard that corrects": three rows, ASHRAE 55-2023 and
    both ISO 7730 editions (`core/clothingCorrection.ts:39-44`), as the third revision records; the group is read by
    `clothingCorrectionOf` and `hasClothingGroup` (`core/modelDeclaration.ts:338-346`).
    "The share link writes it once", and "here the mode is in the link" among the recorded differences: rules for
    Phase 5 item 4, whose link does not exist yet.
    "(`core/applicability.ts:238` applies under the first mode alone)": the mapping is `reportedRow`
    (`core/applicability.ts:350-355`), which reports a `vr` row on the air-speed quantity the session's mode enters.
    Since `60f088f` the gate holds an entry of either mode to the info's `vr` row, so what reaches it is PMV
    (ASHRAE 55)'s operative-temperature limits alone, and no `clo` row is mapped (`:312-313`). "Already recorded at
    `src/models/pmvPpdAshrae.ts:22-28`": at `:21-27`.
    "Every call of the model takes the corrected value, the run, the scan and the zone alike": through one
    resolution, `resolveQuantities` (`core/libraryInputs.ts:29-51`), which `toLibraryInputs` (the run, the scan, the
    polygons zones) and the psychrometric builder (`core/charts/psychrometricChart.ts:111`) read. Its `clo` is the
    library's key, the dynamic value. So the third revision's "the clothing stays two quantities, `clo` entered and
    `clo_dynamic` derived" is not how the code holds them: both are entries, `clo` the first mode's and `clo_dynamic`
    the second's (`core/entryModes.ts:61-64`), `clo_dynamic` app-owned and listed by the drift test
    (`core/quantities.test.ts:19`); the value the first mode derives is never held, only handed to the model under
    `clo` (ticket 04's Comments).
    The second revision's inverse, "`v = vr − 0.3·(met − 1)` and `v = vr` at or below 1 met": `v_relative_inverse`
    (`src/temporary-library/v_relative_inverse.ts:48-53`) first asks whether still air gives `vr` and answers 0, and
    keeps nine decimals of the subtraction, so still air comes back 0 and not a hair either side (ticket 07's
    Comments). "Which the gate reads in every model and a switch lists": in every model whose declaration enters `v`
    (`everyBoundFor`, `core/applicability.ts:110-115`): both PMV models and Adaptive (ASHRAE 55), not Heat Index. In a
    model with the group the kind's bound is intersected with the converted one, and holds alone where the two leave no
    entry (`correctedEntryBoundFor`, `:187-201`), past 4.3 met on PMV (ISO 7730). An entered `vr` is held to the info's
    row alone, without its kind's bound; both PMV rows start at 0.
    "The clothing inverse is a bisection over the standard's own rule": and then a step neither revision names.
    ASHRAE 55's rule rounds, so the bisection lands on the lower edge of a run of clothing insulations corrected to
    one value, not on the entry; `clo_dynamic_inverse` returns the roundest decimal beside it that the rule corrects
    to exactly the target, and else the search's own answer raised to nine decimals
    (`src/temporary-library/clo_dynamic_inverse.ts:82-88`). So "a slot switched to dynamic clothing entry and back
    gives the model the same dynamic clothing" holds for an entry of two decimals under either rule. Under ASHRAE 55
    an entry of three decimals may come back as its neighbour, with the same dynamic value, and a dynamic value the
    rule never gives comes back as the next one it does, up to 0.001 clo more (ticket 08's open points 2 and 3). The
    second arises from a model switch: 1 clo at 2 met in still air on PMV (ISO 7730) is given as 0.8402 clo; carried in
    dynamic entry to PMV (ASHRAE 55) and through Adaptive (ASHRAE 55), it comes back as 1.050625001 clo, which ASHRAE
    55's rule gives as 0.841 (computed against the library; walked, the PPD read 17.92 % before and 17.95 % after).
    "Through a model without the group the dynamic clothing comes back unchanged too": by the rule of the model the
    slot leaves, which `rehearseSwitch` now takes (decision 32's note of the same day).
    "A 'Yes' moves the entry to its converted end": each bound is read at the values the "Yes" would leave, the gate
    asked again at the adjusted slot until a pass lists what the pass before did (`core/modelSwitch.ts:52-58`).
    *Recorded*'s "the '≥ 0' every air-speed row shows … until the converted bound replaces it": `60f088f` replaced it
    (walked: "0 – 0.97" on PMV (ISO 7730) at 1.1 met, "0 – 2" on Adaptive (ASHRAE 55)). A row shows "≥ 0" again only
    where the kind's bound holds alone, past 4.3 met on PMV (ISO 7730) (`core/applicability.ts:200, 397`), a metabolic
    rate its own row already marks out of range.
    "The work is … tickets 08 … and 09 …, ahead of 05": `dcc2909` and `60f088f`.
    The first paragraph's "switching back keeps the number, an entry convention of decision 21's kind, not an
    equation" is superseded by both revisions: each group inverts (`core/slot.ts:508, 545`).
55. **A slot holds the number its row shows: at most two decimals in the displayed unit.** *Withdrawn 2026-10-01 by
    decision 56, before its tickets 03 to 06 landed; kept as written for the record.* Taken 2026-10-01 with the
    user after `.scratch/activity-adjusted-inputs/` ticket 09, ahead of the code. Amends ADR-0001 §4.6 ("the stored
    value keeps full precision and only the display text is formatted; therefore switching SI ↔ IP back and forth
    does not drift"), and notes decisions 32, 39, 45, 46 and 54.
    Three rules, the user's. The number a row shows and the number the library is given are the same number. Where
    a conversion's answer is finer than a row shows, no exact agreement is sought: the answer is taken at the row's
    precision, inside the bound where there is one. Where a conversion's answer is further outside the bound than
    that, it is left as it is, and the gate marks the row for the person to change.
    So every number written into a slot, and the session's atmospheric pressure, is first taken to two decimals of
    the unit the row is shown in, and stored as the SI of that number; state stays SI and the library is still
    called in SI alone. The writes are the person's entry when committed, a preset, a declared default, each entry
    group's conversion (temperature, humidity, air speed, clothing), a "Yes" on a model switch, and the unit-system
    switch, which rewrites every slot that holds values, compared or not, to two decimals of the new unit. One
    function in `core/` does it for all of them, and the precision is the one constant `core/numberFormat.ts`
    formats by; no second number is written for it. It rounds to the nearest; where the quantity has a bound and
    the nearest lies outside it, it takes the neighbour inside; a value further out is kept and marked.
    The range beside a row and in the switch dialog is written inside-rounded as well ("0 – 1.87" for a bound of
    1.875), so the range a person reads is the range the gate accepts.
    Not covered: a result, which is calculated at full precision and formatted when shown (decision 35), and the
    values a chart sweeps along its axes, which are not entries. `src/temporary-library/`'s inverses are unchanged;
    their nine decimals and their agreement with the library's rounding of 0.001 are that code's own.
    Why: ticket 09 met the difference three times. A bound's converted end was given to the model a hair over the
    bound (2.0000000004 clo), the range read "0 – 1.88" where 1.88 was stopped, and an entry of a fourth decimal
    was stopped though the model would have been given the bound. Each wanted its own rule while a slot held
    digits no row shows. With the slot holding the shown number all three go, and tests of exact restoration across
    a switch give way to tests at the row's precision.
    The deployed tool (live, version 2.5.10, read 2026-10-01; code at `e809c96`): its state is the input box, so
    what is shown is what is calculated (`static/js/global.js:779-783`), and an entry keeps the decimals it was
    typed with (0.6149 clo gives PMV −0.18, 0.61 gives −0.19). What the tool itself writes is rounded by the
    spinner to the box's step: a humidity-mode switch shows 14, 18, 0.01 and 1.6 for 50 %, and a unit switch there
    and back turns 0.15 m/s into 0.1 and 25.3 °C into 25.5. This decision keeps its principle and fixes the
    precision at two decimals for the person's entry and the tool's alike, so a unit switch there and back moves
    a value by no more than the last shown digit.
    Accepted with it: a result may move in its last shown digit on an entry-mode or unit-system switch; a
    vapour-pressure entry is as coarse as its unit, 10 Pa in kPa and about 34 Pa in inHg (0.3 % and 1.1 % of
    relative humidity at 25 °C), as the deployed tool's is (`global.js:610`), and a person who wants finer enters
    the humidity another way; the dew point's 0.1 °C is the library's (decision 46's note).
    Rejected: two decimals shown and three calculated, because the third is a digit the person cannot see that
    moves the result, and the range, a "Yes" and an entry would again differ by half a shown step; keeping full
    precision and making each conversion land inside its bound by its own arithmetic (an end parameter, an
    `at_most` on the inverse, both tried in ticket 09 and taken out), because it is machinery for a difference no
    row shows; rounding in the SI unit whatever the row shows, as `174de5a` does for a "Yes", because in IP the row
    would then show a rounding of another number.
    The work is a spec and tickets to follow; `174de5a` is its first piece.
56. **Two decimals are the app's one precision: for what a row shows, for what the gate judges, and for what a test of
    a shown number asserts.** Taken 2026-10-01 with the user, the same day as decision 55, withdrawing it before its
    tickets 03 to 06 landed (`.scratch/shown-precision/`; ticket 03's abandoned diff is kept there as
    `ticket-03-abandoned.patch`) and restoring ADR-0001 §4.6: a slot holds the full-precision SI number, and only the
    display converts and formats.
    Rules. (1) State stays full-precision SI; nothing written into a slot or the session's atmospheric pressure is
    rounded. (2) The gate compares a value and its bound's ends at the formatter's precision in the quantity's SI
    display unit (`Math.round(unit.fromSi(x) · STEPS_PER_UNIT)`, the unit `displayUnitFor(quantity, unitSystem.si)`,
    g/kg for the humidity ratio and not kg/kg), so a difference no row shows never closes it; `violationRows` drops a
    library warning whose value passes that comparison, since the library judges its bounds exactly, and drops it
    silently: the app's rule is at work, not a fault, and the console stays clean. (3) The range beside a row and in
    the switch dialog is the bound's ends formatted as any number is, nearest: "0 – 1.88" for 1.875, and the gate
    accepts what it reads. Where the unit shown is coarser than the SI display unit the gate judges in (inHg against
    kPa or Pa), the nearest end typed back could be stopped: so each end is asked of the gate's own comparison as if
    typed, and steps one shown digit inward when it would be stopped ("≤ 0.79 inHg" for 2700 Pa, whose nearest 0.8
    is 2709 Pa). One step suffices, since a coarser step crosses the finer one. *(Revised 2026-10-01 with the user
    after ticket 02's open point 1; a gate in the displayed unit was rejected as a parameter on every reader and a
    verdict that changes with the unit system.)* (4) A "Yes" moves a listed entry to the bound's end itself. (5) A test of a number a person
    can see asserts at the shown precision in SI (`toBeCloseTo(x, 2)` or `formatNumber` equality); a test of the
    app's own arithmetic (`core/units.ts`, `src/temporary-library/`) may pin tighter, because it verifies a formula,
    not a precision. The three tests that pin exact restoration across an entry-mode switch are rewritten at the
    shown precision; other tight pins are rewritten when touched.
    Why: decision 55's rule was one sentence but its mechanism was not. Rounding at every write needs the display
    unit and the gate's bound at each write, and the bound lives above the slot in the import graph, so the slot
    module took a callback (`Entry.boundFor`) and a two-pass write, and the unit-system switch became a write over
    every slot, trading zero drift for drift within the last digit. The three symptoms ticket 09 met were one fact:
    the gate compared exactly what a row shows rounded. One rounding in the comparison removes all three where 55
    needed a rounding at ten writes.
    Accepted: shown ≠ held below the shown precision (0.42 shown, 0.4238 given to the model) after a conversion or
    an IP entry, as the deployed tool for a typed entry; the gate's step in IP is the SI display unit's, so an air
    speed shown 394 fpm passes a range reading "0 – 393.7", and a pressure within the last inHg digit below its
    bound shows above a range end that stepped inward (0.8 beside "≤ 0.79"), not marked, reachable by a conversion
    only; a conversion truly outside its bound is marked and left to the person (decision 32). Withdrawn with 55: `shownNumber` and the inside-rounded range text (`11dad2a`,
    `b3abf9e`), the "Yes" on the shown end (`174de5a`), the unit-system parameter `2e45c2b` put on every writer.
    Kept: `formatNumber`, the one formatter, and its one constant.
    The work is `.scratch/one-precision/`, a commit per ticket: 01 `c59b51b` reverts `2e45c2b`, 02 `36573db` the
    gate, the pressure's check and the violation rows judge at the shown precision (`isShownBeyond`) and the range
    reads nearest, 03 `56bfbe2` a "Yes" lands on the end itself and `shownNumber` is removed, 04 `33c17d9` seven
    tests of a bound's end or a restoration assert at two decimals, 05 `2e78fa0` a range end steps inward where
    typing it back would be stopped; then `e45c686` names the gate's unit once and `fda8a9f` rewrites an eighth pin;
    06 read the documents against the code.
    **Noted 2026-10-01 (`.scratch/one-precision/` ticket 06).** Read against the code at `fda8a9f`. Rule 1 holds:
    outside tests and `src/temporary-library/`, `core/numberFormat.ts` is the only file that rounds (`git grep -nE
    "Math\.(round|floor|ceil|trunc)|toFixed|toPrecision" -- src ':!src/temporary-library' ':!*.test.ts'`), and no
    write calls it.
    Rule 2: the unit is named once, `gateUnitFor(quantity)` in `core/applicability.ts` (`e45c686`), and
    `violationRows` asks it of the row's `bounded` quantity, the one the warning's value and bound are of (`vr`
    under air-speed entry; both m/s). Rule 3 said more than the code in two places. The step is not only for a unit
    coarser than the one the gate judges in: rounding twice steps a finer unit's end too, where the end has more
    decimals than its SI display unit shows (a maximum of 10.0049 °C reads 10 in °C, its nearest 50.01 °F is
    10.0056 °C, which reads 10.01, so the range reads "≤ 50"). At each model's starting values the one range text
    the step changes is the water vapour partial pressure's in IP (ticket 05's review); a converted bound that
    moves with the entries, as the air speed's does with the metabolic rate, can land on such an end. And one step
    suffices for any unit, not because a coarser step crosses the finer one: the stepped number lies inside the end
    itself, and every display conversion is increasing, so the gate never shows it beyond the end. The step reaches
    the violation sentence as well, which writes its bound through the same `formatBound`. Rule 4: the end is
    picked by an exact `<` / `>` (`nearestEnd`, `core/modelSwitch.ts`), a direction for a row the gate already
    listed and not a second verdict on in or out of range; since conversions are increasing, a value shown beyond an
    end is beyond it exactly. Rule 5's "three tests" became eight assertions in five files: the three, four pins of
    ISO 7730's converted end at three decimals, and one bound's end at four (`33c17d9`, `fda8a9f`). What pins
    tighter outside `src/temporary-library/` is unit conversion, one humidity-mode conversion and chart geometry:
    23 lines in 5 files by `git grep -nE "toBeCloseTo\(.*, *([3-9]|1[0-9])\)" -- src ':!src/temporary-library'`
    (31 in 10 at `e37b217`), with `core/libraryInputs.test.ts`'s humidity round trip, whose digits are a table. In
    *Accepted*, the pressure is the water vapour partial pressure, and "a conversion" includes a value entered in SI
    and read in IP (walked: at 25 °C, 3.174 kPa typed in SI reads 0.94 inHg beside "0 – 0.93" and passes).

Taken 2026-10-01, in the grilling of Phase 5 item 3 (the Explore page, the Bands panel and the Standard / Explore
split), ahead of the code; it also decided the two "Unscheduled" rows of `.scratch/review-after-4b/deferred.md`, as
notes under decisions 51 and 53:

57. **Pages: Standard, Explore and Time-series are the app's pages, `core/page.ts` is their closed set, and one
    Session serves them all.** Taken 2026-10-01 with the user in the grilling of Phase 5 item 3, ahead of the code;
    renames ADR-0001 §4.2's `workspace.ts` sketch and §4.8's `"workspace"` key, and CONTEXT.md gains **Page**. A fact
    first: the deployed CBE tool has no Explore and no threshold editor. Its `/ranges` page varies one input over a
    min–max range by a step and overlays one fixed PMV ±0.5 zone per step, PMV only, saving nothing (`comfort_tool` at
    `e809c96`: `comfort.py:173-175`, `ranges.js:642-650`, `psychchart-ranges.css:1-17`). The only behaviour reference
    for Explore is the `refactor-draft` prototype's `ChartBandEditor.svelte`
    (`../comfort-tool-old/src/ui/components/chart/`), whose half-open intervals decision 31 already overrules, so
    nothing in this item is owed to parity.
    Rules. (1) `core/page.ts` holds `page.standard`, `page.explore` and `page.timeSeries` in the closed-set style.
    Which pages a model has is read, never declared: Standard needs `model.standard`, Explore every model has, and
    Time-series reads an optional `RegisteredModel.timeSeries?: true`, which no registered model writes, so the four
    declarations do not change. The route `/explore/:model` joins `/standard/:standard/:model`. (2) One `Session`,
    created once in `App.svelte` and handed to every page, so Compare, the three slots, the entry modes and the
    per-model chart settings survive a page change (`.scratch/compare/spec.md`, story 46). (3) Navigation is two
    groups of links, each link a (page, model) address: under Standard one link per standard, opening that standard's
    first registered model; Explore one link, keeping the current model. A link to where the person is does nothing.
    The model select lists the standard's models on Standard and every registered model, flat and in registry order,
    on Explore. There is no page switch apart from the links and no disabled state. (4) The Explore page shows the
    session's controls as Standard does (unit system, atmospheric pressure, the four entry modes), slot 1's input
    panel with no Compare button and no slot columns, the result table with one row, the chart controls with both
    declared charts selectable and the Bands panel (decision 59), and the charts of slot 1 alone. (5) A model switch
    asked for on Explore treats slot 1 as the one compared slot: the dialog lists its rows only, and slots 2 and 3 are
    converted and seeded as decision 52 treats a slot not compared. (6) Time-series is in v1, with PHS, and has no
    phase yet (the user, 2026-10-01: it may be scheduled later); its page, its own session and the PHS declaration
    are a grilling of their own, and the set's member and the optional field are all this decision lands of it.
    Rejected: Explore as a switch on the Standard page, like Compare, because the address must be able to name Heat
    Index, which has no Standard page; a disabled Standard tab for a standard-less model, because every link is an
    address and needs no state; remembering the last model used under a standard, one more table for a small gain.
    Why "page" and not "workspace": the documents already say "the Standard page" (23 times against 24 "workspace"
    by `git grep`), "surface" is the scanned chart's surface in this repository, "mode" is the entry modes' word,
    and "view" reads as a layer.
    **Noted 2026-10-02 (`.scratch/explore/` ticket 09).** Built as `eb9ecd4` (the page set, the Explore route, the
    session created in `App.svelte` and offered through `state/openSession.ts`) and `c6a38ae`, `e2877db`, `2ccbf7c`,
    `5e33d7e` (the navigation and the select), `.scratch/explore/` tickets 02 and 03. Read against the code at
    `3e397c8`, five sentences say more or other than it. Rule 1's "read, never declared" is `pagesOf(model)`
    (`core/page.ts:30`), which nothing outside its test calls: the navigation and the routes read the model's
    standard directly. Rule 2's "survive a page change" holds for a change made in the app, by a link, the select or
    the back and forward buttons; a typed address or a new tab is a document load, which starts a new session, and
    nothing carries one across a load until the share link (Phase 5 item 4). Rule 3's "one link per standard" is one
    link per standard an app table lists, in the table's order: `navigationStandards` (`routes/routeModels.ts:34`)
    names ASHRAE 55, then ISO 7730, the user's order (ticket 03's Comments); a standard it does not list has no link,
    and its models are reached by address and by the select. The table is written per standard, against decision 6's
    "nothing is written per standard", and names editions, so a model moved to another edition drops out of the
    navigation. Rule 3's "a link to where the person is does nothing" holds for a link whose address is the current
    one (`routes/inAppSwitch.ts:38-41`); a standard's link is marked current on any of its models (`isCurrentLink`,
    `routes/routeModels.ts:58`), and followed from one that is not the standard's first, it opens the first. And an
    Explore address naming no model (`/explore/<typo>`) opens the Standard page on the default model, as any address
    naming no model does.
58. **The page decides what the charts paint: Standard paints Comfort zones on every chart, Explore paints Bands on
    every chart, and a spec builder is told which by being given a Band list or not.** Revises decision 31's split,
    extending it to the psychrometric chart, and amends decisions 27 and 37. Rules. (1) On Standard the dynamic
    chart paints its Comfort zones for one drawn slot as it does for two or more, as contours of that slot's scan
    (`contouredZonesOf`); the one-slot band field goes (`core/charts/dynamicChart.ts`, the `request.slots.length ===
    1` branch). The psychrometric chart is unchanged. (2) On Explore the dynamic chart paints the Band list where it
    painted the classifier's bands, and the psychrometric chart becomes a scan: the model's `output` at every cell of
    a `GRID × GRID` field over the chart's temperature axis (`tdb`, or `operative_tmp` under operative entry) and the
    humidity ratio, each cell's `hr` converted to `rh` at the chart's atmospheric pressure, the cells above saturation
    (`rh` > 100) left unpainted, contoured by the same Band list. No Comfort zone is drawn on Explore. (3) The
    mechanism is data, not a flag: `ChartRequest.bands: BandList | null`. A builder given a list paints Bands, given
    none paints Comfort zones, and knows no page; the state layer writes "Explore ⇒ the model's Band list" once.
    (4) Hover: on Explore both charts read the two axis values, the number and the band the library's
    `classifyFromBins` puts it in on the edited list; on Standard the dynamic chart reads the two axis values and
    each slot's number, and the psychrometric chart still reads nothing until Phase 5 item 8. Cost: one scanned spec
    for the psychrometric chart and a saturation mask; the machinery (`scannedField`, `psy_ta_rh`, `BandTrace`) is
    there, and the scan is the dynamic chart's size, about 90 ms for PMV (ASHRAE 55). Rejected: keeping Comfort
    zones on Explore's psychrometric chart, which would make "Explore paints Bands" a sentence about one chart, and
    a `ChartRequest.page`, a branch in core on a word core need not know.
    **Revised 2026-10-02 (decision 61).** Rule 1's "the psychrometric chart is unchanged" and rule 4's "reads nothing
    until Phase 5 item 8" are superseded: on Standard the psychrometric chart paints its Comfort zones as contours of
    each drawn slot's scan and reads the temperature, the humidity ratio and each slot's number. Rule 2's "the cells
    above saturation left unpainted" is a cover over a field that is run everywhere.
    **Noted 2026-10-02 (`.scratch/explore/` ticket 09).** Rule 1 is built as `2a397c4`, rule 2 as `47498cb` (the
    dynamic chart) and `92d5408` (the psychrometric chart), and both are reshaped by decision 61's `d13fe36` and
    `76589c0`. "Explore paints Bands on every chart" and "no Comfort zone is drawn on Explore" hold for a chart the
    model scans: Adaptive (ASHRAE 55)'s polygons chart draws its Comfort zones on Explore as on Standard, since a
    model without a scan has no Band list (decision 37's note of 2026-10-01; pinned in
    `state/sessionPage.svelte.test.ts:143`). The cost paragraph's "one scanned spec for the psychrometric chart and a
    saturation mask" is one painting both builders share and a cover (decision 61, rules 2 and 3); `psy_ta_rh` draws
    the cover and the isolines and is not part of the scan, whose cells take their `rh` from the slot's own
    conversion; and "about 90 ms" measured 33.1 ms while the supersaturated cells were skipped (ticket 08) and 50.5 ms
    with every cell run (`.scratch/one-scan/` ticket 03), for one slot of PMV (ASHRAE 55) in Chromium 154.
59. **A Band list is the library's classifier plus a colour per band, built and changed only in `core/bands.ts`, one
    per model, edited in place in a panel named Bands.** Revises decision 31's "saved per (model, chart)" to one list
    per model, since both charts cut the same `output`, and replaces ADR-0001 §4.5's "Explore thresholds" rule.
    Rules. (1) Shape: `BandList` is a read-only copy of `ClassifierBins` — `edges`, `labels`, `right` — with
    `colors: readonly (string | undefined)[]`, `undefined` a band painted nowhere; the three arrays are of one length,
    pinned by a test; the edited list is handed to `classifyFromBins` as it is, so the app writes no inclusivity rule.
    (2) Home: `core/bands.ts`, pure functions from a list to a list — `bandListOf(bins)` (the default: a copy,
    coloured by position from the classifier's palette, decision 60), `moveEdge`, `addEdge`, `removeEdge`, `setLabel`,
    `setColor` — held by `ChartState.bands`, so it is kept per model across a model switch as the axes are, carried
    by the share link for the current model (Phase 5 item 4), and returned to `bandListOf` by the panel's Reset; the
    page's Reset (Phase 5c) returns it with the rest. (3) The panel: inline beside the chart, every edit effective at
    once (ADR-0001 §2: Standard and Explore have no calculate button; the prototype's modal, Apply and Cancel are not
    ported). One row per band with its label, its colour (a native colour input and a "no colour") and its upper
    Edge; the first band has no lower Edge; the last Edge (10, 1000) is editable and kept by default. Add inserts an
    Edge at the midpoint of the chosen band: the upper half keeps the label and colour, the lower half has an empty
    label and no colour. Remove deletes a band's upper Edge, merging it into the band above; the last band merges
    into the one below. An Edge typed must fall strictly between its neighbours, else it is refused and the old value
    kept, marked as an out-of-range entry is; it is typed in the display unit at two decimals (decision 56). Colours
    are assigned by position once, at the default; after that each band carries its own, so an Add recolours
    nothing. (4) A polygons chart has no Band list and no panel. (5) On screen the panel is "Bands"; the glossary's
    exception for "threshold editor" is removed, and the plan's item title stays as history. Rejected: a record per
    band (`{ label, color, upper }`), more readable but converted back to the library's shape at every
    classification; reassigning colours by position after an edit, which recolours every band on an Add; sorting
    what was typed, as the prototype did.
    **Noted 2026-10-02 (decision 61).** "Both charts cut the same `output`" is now the declaration's shape: the
    classifier the list copies is `model.scan.classifier`.
    **Noted 2026-10-02 (`.scratch/explore/` ticket 09).** Built as `47498cb` (`core/bands.ts`, the list on
    `ChartState`, `ChartRequest.bands`) and `9f95582` (the panel, `ui/inputs/BandsPanel.svelte`), tickets 06 and 07.
    Read against the code at `3e397c8`, these sentences say more or other than it. Rule 2's `addEdge` takes the
    classifier too, for the first band: that band is open below, so the new Edge is the midpoint between its upper
    Edge and the classifier's default Edge next below it, else one unit below its upper Edge (`core/bands.ts:46-63,
    95-98`). It reads the default, not the edited list: Add on PMV's first band splits it at −3.5, and after its upper
    Edge is moved to −2, at −2.25, halfway to the default's −2.5. "Carried by the share link" and "the page's Reset"
    are not built (Phase 5 item 4, Phase 5c). Rule 3's "inline beside the chart": the panel sits under the chart's
    legend (`routes/ExplorePage.svelte:80-84`), where Phase 5c places it. "Refused and the old value kept": the box
    commits at every keystroke (`ui/inputs/NumberInput.svelte:62`), as every number box does, so a typed prefix that
    falls between the neighbours moves the Edge before the whole number is refused; typing 1.6 for Neutral's Edge at
    0.5 moves it to 1, and 1.6 is then refused. "Typed in the display unit at two decimals (decision 56)": the Edge is
    shown and typed through the one formatter, but the refusal is `moveEdge`'s strict comparison at full precision
    (`core/bands.ts:40`), not `isShownBeyond`'s; in IP, 129.2 °F for Heat Index's Edge at 41 °C converts to
    53.99999999999999 °C, under the Edge at 54, so it is accepted and two Edges read 129.2. The user chose to keep the
    full-precision refusal (ticket 07's Comments). Rule 4's "a polygons chart has no Band list and no panel" is read
    off the model: a model with a scan has a list (`state/session.svelte.ts:148`) and the panel shows under both its
    charts, and a model without one offers polygons charts only (decision 61, rule 1).
60. **A classifier's colours come from a palette table keyed by the classifier object, one colour family per
    classifier read at its band count; the colours are ColorBrewer's, copied, not a dependency.** Closes `P004`,
    ticket 17's note on the "none" swatch and `.scratch/compliance-column/` 01 and 02; amends decision 8 and
    ADR-0001 §4.3. Facts: three of `core/bandPalette.ts`'s seven fills (`#0571b0`, `#92c5de`, `#f4a582`) are
    ColorBrewer RdBu's, so the CBE palette already drew on it; the registry's classifiers are the thermal-sensation
    bins (7, shared by both PMV models), Heat Index's (5), ISO 7730's categories A, B, C and none (4, the table's
    swatch only) and, in Phase 6, UTCI's (10), on which the seven-colour palette throws today. Rules. (1)
    `core/bandPalette.ts` holds a table keyed by the library's bins object, by identity as the quantity table is,
    whose entry names a colour family and whose colours are read at `labels.length`: diverging (RdBu) for a scale
    around neutral — thermal sensation, UTCI — and sequential (YlOrRd) for a one-sided one — Heat Index, the ISO
    categories. (2) The ColorBrewer arrays the table needs are copied into the file with their attribution (Apache
    2.0); no `d3-scale-chromatic` (AGENTS.md: no dependency for a few lines). (3) The thermal-sensation entry keeps
    the CBE fills for now; whether it becomes RdBu's seven is Phase 5c item 3's one palette. (4) A classifier not in
    the table throws, naming it, as today; a new classifier lands in the table ahead, its own commit with a test, as
    a new quantity lands in `core/quantities.ts`. (5) ISO's "none" has no swatch: a category past the last Edge is
    unclassified, not neutral. The table's category swatch and the chart's zones, painted in the slot's hue, are not
    made to match; the legend is the key. Rejected: the declaration naming its palette, which puts appearance in the
    one file a model author writes; a ramp interpolated by band count, which cannot say that Heat Index's first band
    is "no risk" and not "neutral".
    **Noted 2026-10-02 (`.scratch/explore/` ticket 09).** Built as `e39791a` (ticket 05). Read against the code at
    `3e397c8`, five sentences say more or other than it. The facts' "the thermal-sensation bins (7, shared by both PMV
    models)" are two library objects, ISO's with `right: false` and ASHRAE's with `right: true`; what they share is
    the table's entry. "On which the seven-colour palette throws today" no longer holds: there is no seven-colour
    palette, and UTCI's bins throw because the table has no entry for them (`core/bandPalette.ts:92`). Rule 1's
    "diverging (RdBu) for … thermal sensation, UTCI" is rule 3's exception and Phase 6's entry: thermal sensation keeps
    the CBE fills (`palettes.cbeSensation`), UTCI is not in the table, so the diverging entry
    (`palettes.diverging`, `:58`) paints no registered classifier yet, only a test's. The ISO categories are read at
    `labels.length`, four, with the fourth, "none", unpainted (`palettes.sequentialCategories`, `:62`), so A, B and
    C are YlOrRd-4's `#ffffb2`, `#fecc5c`, `#fd8d3c`. `bandColors(bins, table)` (`:84`) takes the table as an optional
    parameter, which only the ten-label test passes. And "closes `.scratch/compliance-column/` 02" closes its swatch
    half: a category of `NaN` (|PMV| ≥ 10) still prints "ISO 7730 category: NaN", now with no swatch; whether it
    reads a dash or is left out is undecided.

61. **Every chart that is not declared polygons is one scan, contoured: the psychrometric chart's Comfort zones are
    contours of the same scan its Bands are, the zone solver and the root finders are deleted, and the scanned
    output is declared once, on the model.** Taken 2026-10-02 (`.scratch/explore/` ticket 08's open point 1;
    `.scratch/one-scan/`). Revises decision 58's rule 1 ("the psychrometric chart is unchanged") and rule 4 ("reads
    nothing until Phase 5 item 8"); amends decisions 24, 27, 37 and 59, ADR-0001 §3's boundary table, §4.4, §4.7, §5
    and acceptance criterion 3. Facts. On Explore the psychrometric scan left its supersaturated cells `NaN`, so the
    bands stopped at cell resolution under the saturation line while Standard's solved polygons met it exactly: two
    accuracies for one boundary, and two mechanisms to carry. Measured 2026-10-02 (ticket 08's Comments): a 51×51
    contour of the library's PMV sits within 0.0093 °C of the deployed tool's vertices for every ISO 7730 zone, within
    0.0149 °C for three of the four ASHRAE 55 zones and 0.0228 °C for the fourth, where the two-decimal
    `cooling_effect` makes PMV a staircase (a step of up to 0.0048 PMV, about 0.016 °C) that no grid locates
    (0.0333 / 0.0210 / 0.0169 °C against bisection at 51 / 101 / 201 points); the full scan, supersaturated cells run
    too, is 50.0 ms for one slot of PMV (ASHRAE 55) and 219.8 ms for three (Chromium 154); PMV is finite and smooth
    above 100 % (25 °C: −0.10 at 90 %, 0.74 at 200 %). pythermalcomfort 4.6.0 ships `plots.PsychrometricPlot`, whose
    boundaries are bisected row by row (`plots/matplotlib/_boundaries.py`: "Rasterising the whole plane and
    contouring it makes every edge out of grid cells") and which hides the supersaturated region under a white fill
    from the smooth saturation curve; jsthermalcomfort has no plots module. Rules. (1) The scanned output is the
    model's: `scan: { output, classifier, comfortZones? }` on the declaration, one per model, each field named for the
    CONTEXT.md term it holds and not for the page that paints it, which decision 58 decides. A psychrometric chart
    declares nothing but its type; a scanned dynamic chart its `axes`; a polygons chart `axes` and its
    `comfortZones` function, renamed from `zones` because Adaptive's acceptability zones are Comfort zones drawn as
    polygons. A registry-wide test holds that a model declaring a psychrometric chart has `scan.comfortZones`.
    *(Revised 2026-10-02 with the user before ticket 01 landed: `bands` → `classifier` and `zones` → `comfortZones`,
    on the scan and on the polygons chart; naming the fields for the page, `exploreBands` and `standardZones`, was
    rejected as tying the declaration to the page decision 58 decides, and `complianceZones` as a word CONTEXT.md
    avoids.)*
    `DeclaredScannedChart` goes; `core/bands.ts`, the session's classifier and the Standard page's zones read
    `model.scan`. (2) One `ScanFrame` — the model, the output, the two swept quantities each with its range, the
    entry modes and the pressure — one `scannedField`, and one painting of a field, Bands given a list and else the
    Comfort zones as contours, with its hover grid, that both builders share; a builder adds its axes and its chrome.
    The psychrometric frame locks x to `temperatureMode.axis`, y to `hr` over the range drawn at the pressure, and
    the humidity entry mode to `humidityMode.humidityRatio`, so the slot's own conversion gives each cell its `rh`
    and the scan knows no psychrometrics. The state keeps one frame and one scan per slot; `chartSpecOf`'s
    `scanned` boolean goes. (3) A supersaturated cell is run at its true `rh` above 100. The region above the
    saturation line is covered by one path filled in `chartInk.ground`, with no legend entry and hover off, drawn
    under the saturation line, on both pages; the hover grid reads "—" and no band at `rh` > 100. A zone's outline
    runs on under the cover, so its top edge is the saturation line itself. A model that returns `NaN` above
    saturation falls back to the cell-resolution edge, alone. (4) On Standard the psychrometric chart scans every
    drawn slot and paints each slot's Comfort zones as contours of its own scan, as the dynamic chart does (decision
    50); its hover grid reads the temperature, the humidity ratio and each slot's number, which is Phase 5 item 8,
    landed; where the readout sits stays Phase 5c item 6. On Explore the readout is unchanged. (5)
    `pmv_psychrometric_zone.ts`, `root_finding.ts` and their tests are deleted; `chart-online.json` stays in
    `src/temporary-library/` as the deployed tool's record. The app does not follow pythermalcomfort's `plots`
    here: one app draws one boundary one way, and `plots` is presentation, not a calculation decision 21's test
    would send to the library. (6) ADR-0001 acceptance criterion 3 becomes two. 3a, rendering, against the library:
    on every grid row, the library's PMV at the contour's crossing of a zone's limit differs from the limit by at
    most a bound in PMV, per model — a candidate 0.005 for PMV (ISO 7730), whose kernel is smooth, and 0.01 for PMV
    (ASHRAE 55), one staircase step plus interpolation — measured in the ticket before it is fixed, as the
    2026-09-28 widening was. 3b, oracle, against the fixture: the crossing on each fixture vertex's row differs from
    the deployed tool's vertex by at most 0.02 °C for ISO 7730 and 0.03 °C for ASHRAE 55, a loose bound that holds
    the kernel difference and the rendering together and catches a wrong binding, not a precision. (7) Decisions 28
    and 29 stand: `GRID = 51`, and the 300 ms line is one scan. Rejected: keeping the solver for the Standard page,
    two accuracies for one boundary; clamping supersaturated cells to `rh` = 100 as `plots` does, which needs a hook
    the shared scan has no place for; a top edge in the zone's own line along the saturation line, which needs the
    crossings, which is root finding again; `GRID = 101`, which halves nothing on the staircase; an `output` on the
    psychrometric chart, a field with one legal value; a scan per chart with the psychrometric frame borrowing the
    dynamic chart's `output`, which keeps three cross-reads between the two chart declarations where the glossary
    says a Band list and a Comfort zone are the model's.
    **Noted 2026-10-02 (`.scratch/explore/` ticket 09).** Built as `.scratch/one-scan/` tickets 01 to 04: `c5bcbf0`,
    `bbc7c08`, `21edd69` and `c6acfbc` (the scan on the model), `d13fe36` (one frame, one scan per slot, the cover),
    `76589c0` (Standard's psychrometric zones as contours, its hover grid) and `3e397c8` (the solver deleted, criterion
    3 as two tests). Read against the code at `3e397c8`, these sentences say more or other than it. The facts' "PMV is
    finite and smooth above 100 %" holds for PMV (ISO 7730) only. PMV (ASHRAE 55) is finite there but not smooth: its
    two-decimal `cooling_effect` returns 0, 0.01, 0.05, 0.02 and 0.07 across 0.3 °C at 30 g/kg, and the step in PMV per
    0.01 °C departs from its neighbours' by at most 0.0005 at 90 to 100 % but by 0.034 at 105 %, 0.055 at 120 % and
    0.105 at 150 % (ticket 04's Comments). The cover hides that region, and 3a compares at or below saturation only.
    Rule 1's "`core/bands.ts` … read `model.scan`": `core/bands.ts` takes the classifier, and `ChartState` reads it off
    `model.scan` (`state/session.svelte.ts:148`); the registry-wide test is at `core/modelDeclaration.test.ts:86`, and
    "a model declaring `comfortZones` scans `pmv`" is held by the field's JSDoc alone (`core/modelDeclaration.ts:137`),
    since the `pmv` check went with the solver. Rule 2's "locks … the humidity entry mode to
    `humidityMode.humidityRatio`": the frame has no humidity field; sweeping `hr` makes `withEnteredValues` put each
    cell in the humidity-ratio mode. "The state keeps one frame": it does (`state/compute.svelte.ts:134`), and each
    builder builds the frame again from the request (`core/charts/dynamicChart.ts:128`,
    `core/charts/psychrometricChart.ts:84`). Rule 3's order, as drawn: the paint, the hover grid, the cover, the
    isolines with the saturation line last, the markers; the mask is `hr_to_rh > 100` (`:88`) and the cover's edge
    `psy_ta_rh` at 100 %. Rule 3's "a model that returns `NaN` above saturation falls back to the cell-resolution
    edge": a `NaN` cell is drawn as no number (`core/charts/specParts.ts:138`), but no registered model returns one
    there and no test pins the fallback above saturation. Rule 6 is two tests in
    `core/charts/psychrometricChartAccuracy.test.ts`: 3a on every grid row at or below saturation, its bounds fixed at
    the candidates, 0.005 and 0.01, and kept in the test beside the two PMV models it imports, so the next model
    declaring a psychrometric chart edits that file; 3b on each side's eleven recorded vertices, the 100 % corner
    included and the saturation-line run between the corners not. The measurements are in ADR-0001 §7's note. The full
    scan as built, PMV (ASHRAE 55) at its defaults, is 50.5 ms for one slot and 234.2 ms for three (Chromium 154,
    ticket 03), against the 50.0 and 219.8 ms measured for this decision; the 300 ms line stands.
    **Amended 2026-10-02 (decision 62).** "Every chart that is not declared polygons" is every chart but the adaptive
    chart. Rule 2's one painting hands over its fills, its outlines and its hover grid apart, and rule 3's order is
    decision 62 rule 3's: the fills, the isolines at 10 to 90 %, the outlines, the hover grid, the cover, the
    saturation line, the markers.

62. **Three chart types, each with its own builder: the adaptive chart leaves the dynamic chart, Adaptive's declaration
    hands over its limit lines, and every chart is drawn in one order from the same fills and outlines.** Taken
    2026-10-02 with the user (the grilling of three chart changes), ahead of the code. Amends decisions 27, 37 and 61,
    and ADR-0001 §4.4's table and hover rules. Facts. `chartType` is a closed set of two, `psychrometric` and `dynamic`,
    each with a user-visible `title` the chart picker shows, keyed by type (`ui/inputs/ChartControls.svelte`). The
    polygons chart decision 37 declared lives under `chartType.dynamic`, told apart by `isPolygonsChart` at five sites
    outside its own branch: the axes, the paint and the picker's quantities in `core/charts/dynamicChart.ts`, the frame
    in `state/compute.svelte.ts`, the axes lock in `state/session.svelte.ts`; `dynamicAxisQuantities` returns an empty
    list as the sign that there is no picker, and `ChartState` throws for a model without a dynamic chart. The
    prototype's closed set had `adaptive` beside `psychrometric` and `dynamic`, labelled "Adaptive"
    (`../comfort-tool-old/src/catalog/chartTypes.ts`), and the deployed tool draws the chart in
    `adaptive-chart-ashrae.js`. Adaptive's polygon is the temporary library's closing of two limit lines, the upper out
    and the lower back (`adaptive_ashrae_zone.ts`), so its two vertical sides, at the ends of the x range, are no limit
    the model returns; the step at 25 °C is part of the upper line. The psychrometric chart draws the paint, the hover
    grid, the cover, the isolines and the markers in that order, so the relative-humidity isolines lie over every
    Comfort zone; a zone is one Plotly contour that fills and outlines in one trace; a Band is an opaque contour with no
    outline, filled from its lower Edge to the top of the contiguous bands above it so that no seam shows
    (`ui/charts/PlotlyChart.svelte`). Wanted: the isolines visible on both pages, interrupted only where an outline
    crosses them. Rules. (1) `chartType` gains `adaptive = { id: "adaptive", title: "Adaptive" }`, named for the chart
    the deployed tool and the prototype draw under that name and not for a model: an EN 16798 adaptive model declares
    the same type. `DeclaredChart` has three members, one per type, and `dynamic` has one shape, scanned, so
    `DeclaredPolygonsChart`, `isPolygonsChart`, `ChartState`'s axes lock and the empty list go. The chart is built in
    `core/charts/adaptiveChart.ts` and found by `adaptiveChartOf`; `state/compute.svelte.ts` dispatches on the type
    where it dispatched on two. The picker stays as it is: a model with one chart shows one button. `ChartState.axes`
    is `ChartAxes | null`, `null` for a model without a dynamic chart, which `setAxes` leaves alone. (2) The adaptive
    chart is declared as `{ type: chartType.adaptive, axes, limits }`, `limits: (request: ZoneRequest) => readonly
    ZoneLimits[]`, where `ZoneLimits { label, lower, upper }` are one Comfort zone's two limit lines in SI along the
    chart's axes, as the temporary library's `upper_limit` and `lower_limit` give them. The builder strokes each line,
    fills between them, and reads the pointer against the polygon it closes itself, so the closing sides at the ends of
    the x range are never stroked. The temporary library's `polygon` stays as its oracle's shape; the app stops reading
    it. (3) One drawing order for every chart: the fills, the chrome (the psychrometric chart's isolines at 10 to
    90 %), the outlines, the hover grid, then on the psychrometric chart the cover and the saturation line, then the
    markers. An isoline shows through nothing and is cut only by an outline; the saturation line stays the cover's
    edge, drawn over it, and the cover still hides an outline that runs on above saturation. (4) A Comfort zone and a
    Band are one thing to the painter: a region of the scanned field between two values, filled once and outlined once.
    `BandTrace`, `BandFill` and `ContourZoneTrace` become `contourFill` and `contourLine`, two kinds with the same
    geometry (`x`, `y`, `z`, `lower?`, `upper`), one filled in a colour, the other its boundary stroked; a
    `contourLine` without `lower` is one line, and it is a constraint contour with a transparent fill and `showlines`,
    the mechanism `contourZoneData` measured on plotly.js 4.0.0. A zone is a fill over `[−limit, limit]` and a line at
    both ends; a band is a fill from its lower Edge to the contiguous top, as decision 27 has it, and a line at its own
    upper Edge, so n bands stroke the n Edges once each. `contiguousTopOf` moves from the Plotly adapter into
    `bandsFor`; the adapter draws fills and lines and knows no band. One constructor in `specParts.ts` makes a region's
    fill, line and legend entry for both; `FieldPaint` hands over `fills`, `outlines` and the hover grid apart, and
    each builder lays them in rule 3's order, the adaptive chart with `path` traces. A band's outline is one neutral
    colour, `chartInk.bandLine`, a shade darker than the isolines, 1 px; a zone's outline keeps the slot's zone line.
    (5) A page that one day paints a Band list and Comfort zones together puts the zones' fills after the bands' fills
    and the zones' outlines after the bands' outlines, so a zone is over a band in both groups and the isolines stay
    between the groups; `FieldPaint`'s shape does not change for it. Rejected: moving the polygons branch into a file
    of its own under `chartType.dynamic`, which relocates the five predicates and removes none; `limits` or
    `polygons` as the type's name, the one a word the reader of the single button on Adaptive's page would not know,
    the other the rendering the glossary avoids; hiding the picker on a one-chart model; translucent bands with the
    isolines under every paint, which breaks the stacked fills that hide the seams; an order per paint kind, under
    zones and over bands, two orders for one chart; stripping the polygon's sides by their x coordinate, which infers
    from the geometry what the declaration can say; `contours.coloring: "none"` for a line-only contour, unmeasured.

## Consequences

- ADR-0001 §4.1.2's "the app never evaluates a row" holds again: a run's broken rows are the result's `warnings`
  (decision 23), which `core/applicability.ts` maps to quantities without checking a bound. What the app still checks is
  the entered value before the call, the pre-call gate decision 4 keeps.
  **Amended 2026-10-01 (decision 56; `.scratch/one-precision/` ticket 06).** "Without checking a bound" no longer
  holds: `violationRows` asks each warning's value of the gate's comparison against the warning's own bound and
  drops one that no row shows outside it (`36573db`). The app still finds no row of its own, since what it reports
  is a subset of the library's `warnings`, so §4.1.2's sentence stands.
- `src/temporary-library/` is a third lint boundary beside `core/` and `ui/charts/` (decision 24, ticket 07);
  `.claude/rules/architecture.md` is rewritten to the four rules. ADR-0001 §4.1.4's "never writes its own root finder"
  now reads: never outside the temporary library.
- The ASHRAE cross-field air-speed rule arrives as `warnings` rows (decision 23): on `vr`, `max` only, the
  operative-temperature bound built per call. It differs from the deployed CBE, which tests the entered `v` against one
  limit clamped to 0.2–0.8 m/s at `(tdb + tr) / 2`; the app follows the library, pythermalcomfort's rule, and the
  difference is recorded rather than ported. Phase 4b decides only the display: rows sharing a quantity read as one
  sentence over their intersected bound.
- The experimental shape can move. Every read of `_INFO` goes through `core/quantities.ts`,
  `core/applicability.ts` and the declaration files, so a shape change is confined to those.
  **Amended 2026-09-28 (review after Phase 4b, Proposal 15; `S097`, `P024`).** The sentence above is narrowed to reads
  of `_INFO`'s shape: its `inputs` and `outputs` rows, their applicability bounds and their classifiers. A model info's
  `label` and `name` are read anywhere, since decision 30 as revised has every reader take `model.info.name`. Two
  shape reads outside the three are sanctioned: `axisRangeFor`'s fallback to an input's applicability bound in
  `core/modelDeclaration.ts` (decision 5), and `adaptive_ashrae_zone`'s read of the running-mean bound in
  `src/temporary-library/`, which is library code (decision 24). A third is sanctioned in core: `classifiedOutputs` in
  `core/resultCell.ts` walks `info.outputs` for the classified outputs, a walk that was `ResultTable.svelte`'s until
  `284a30e` moved it into core. The psychrometric chart's check that the result carries `pmv` was a fourth read
  outside the three, and became a registry-wide test in `core/modelDeclaration.test.ts` with `cdff7ca`.
  **Amended 2026-10-02 (decision 61; `.scratch/explore/` ticket 09).** That test is gone with the zone solver that
  needed `pmv` (`3e397c8`), so the fourth read is gone too. Its successor holds that a model declaring a psychrometric
  chart has Comfort zones in its scan (`core/modelDeclaration.test.ts:86`), which reads the declaration, not `_INFO`.
- Phases 1 and 2b of the rewrite plan were done in the fork and are superseded; Phase 3.7 is blocked
  on an upstream `PMV_PPD_ASHRAE_INFO`; Phase 4's model changes (decision 13).
- The `ClassifierBins.right: boolean` shape contradicts #186's own "`closed: left | right`, never
  `right: boolean`"; the app consumes what ships and does not raise it (lead's call, 2026-09-13).
- The fork's "writes nothing to the console" test was dropped with the migration: the main repository's
  `cooling_effect` still logs, and v1 calls no ASHRAE model. `suppressWarnings` is raised in the main
  repository, not the fork, before the Phase 4b grid scan (rewrite plan, Phase 4b).
  **Noted 2026-09-28 (review after Phase 4b, Proposal 13; `S101`).** Decision 38 brought the test back:
  `core/charts/consoleSilence.test.ts` draws every registered model's charts with `console.warn`, `console.log` and
  `console.error` spied, and fails on any write to them. The v1 registry now holds two ASHRAE models, PMV (ASHRAE 55) and Adaptive (ASHRAE 55).
