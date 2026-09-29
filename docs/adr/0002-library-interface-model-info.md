# ADR-0002 · Library interface: the jsthermalcomfort main repository's `ModelInfo` replaces the fork contract

- Status: accepted (2026-09-13, decision taken with the project lead; details settled the same day); amended 2026-09-15 after the migration landed (decision 9 revised; decisions 15–19 recorded from the migration spec); decision 20 added 2026-09-15 while closing Phase 3.6 (presets); decisions 21–26 added 2026-09-17 from the library-boundary audit (`.scratch/library-boundary/spec.md`; 21 restated the same evening when the temporary library was decided); decisions 22 and 23 revised 2026-09-19 (integration branch retired, no PRs; what the `warnings` field shipped as); decisions 27–31 added 2026-09-21 from the grilling session on the Worker boundary and the band editor (`.scratch/numeric-scan-and-model-name/spec.md`); decision 27 revised 2026-09-22 when that spec landed (one constraint contour per Band; how `bands` is spelled); decisions 32–35 added 2026-09-22 from the grilling session on the four tickets that spec's close-out left behind (switching models, what the gate freezes, the shape of `run`, the unrounded `run`), with decisions 3 and 27 revised the same day; decision 32 revised 2026-09-22 when the model-switch feature landed (every in-app way of switching asks, not only the select; where the rehearsal lives); decision 36 added 2026-09-23 from the Phase 4b grilling (`.scratch/phase-4b/spec.md`) when the option contract landed, revising decision 34; decisions 34 and 36 revised 2026-09-25 when the app moved onto the library's params objects (`.scratch/library-v2-migration/`), and decision 30 the same day when it read the model's name from the model info, and decision 24 the same day when the zone solver took one params object, and decisions 8 and 31 the same day when the PMV (ISO 7730) page drew categories A, B and C; decision 35 revised 2026-09-26 at that pass's close-out, when `utci`'s `round_output` closed its upstream gap, and decision 3 the same day to point at decisions 30 and 34's notes; decision 37 added 2026-09-27 when the dynamic chart split into a scanned and a polygons shape, amending decision 27; decision 38 added the same day when the registry-wide tests were restated for a model with no scanned output and gained the silence test, amending decision 35; decision 24 revised the same day when the temporary library drew Adaptive's bands and its fence stopped barring model functions; decision 38 noted the same day at Phase 4b's close-out (the registry it describes); decisions 1, 9 and 13 noted the same day (`ADAPTIVE_ASHRAE_INFO` shipped without `offsets`); decision 39 added 2026-09-28 when the switch into operative entry took the model's standard (Phase 4b ticket 11); decision 37 amended and decision 39 noted the same day when the operative marker took the library's `t_o` (Phase 4b ticket 12); decisions 32 and 33 amended and decision 40 added the same day from the review after Phase 4b (`.scratch/review-after-4b/decisions.md`, Proposals 1 to 3); decisions 10, 31 and 37 noted, decision 29 amended, decisions 41 and 42 added and one Consequences bullet amended and one noted the same day from the same review (Proposals 12 to 23); decision 6 amended the same day when the ISO 7730 pin moved to 2025 (same review, Proposal 27); decision 43 added the same day when the address reached the session through the router's after-load hook (same review, Proposal 26); decision 24 amended the same day when the temporary library's tests took the library's imports and dropped their module mock (same review, Proposal 34); decision 4 noted the same day when the air-speed warning took the relative air speed's label (same review, Proposal 31); decision 8 noted the same day when PMV (ASHRAE 55)'s table took its `compliance` as Yes or No (same review, Proposal 29); decision 7 noted the same day when a classifier longer than the palette started to throw (same review, Proposal 32); decision 8 noted the same day when the stress category's label became "Thermal stress category" (same review, Proposal 33); decision 37 noted the same day when a polygons chart answered hover through a hover grid (same review, ticket 32); decision 44 added the same day when the zone legend's limit took the number formatter (same review, Proposal 25); decision 45 added the same day when humidity ratio took a display unit that tells its values apart (same review, Proposal 24); decision 46 added and decision 32 amended the same day when relative humidity was bounded 0 to 100 by its quantity kind (same review, Proposal 30); decision 41 amended the same day when its spelling was widened to the names the code has (same review, Proposal 36); decision 48 added and decision 3 revised the same day when whether a model takes the relative air speed was read from its model info (same review, round 16); decision 47 added and decisions 32 and 37 noted the same day when the slot took its own module in core (same review, round 16); decision 47 noted 2026-09-29 when the slot's two entries became read-only outside the class, and its module's reach narrowed to what the code holds (`.scratch/slot-shape/` ticket 08); decisions 23 and 32 noted the same day when `outOfRangeInputs` became `outOfRangeQuantities` (review after Phase 4b, round 17)
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

## Consequences

- ADR-0001 §4.1.2's "the app never evaluates a row" holds again: a run's broken rows are the result's `warnings`
  (decision 23), which `core/applicability.ts` maps to quantities without checking a bound. What the app still checks is
  the entered value before the call, the pre-call gate decision 4 keeps.
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
