# ADR-0002 · Library interface: the jsthermalcomfort main repository's `ModelInfo` replaces the fork contract

- Status: accepted (2026-09-13, decision taken with the project lead; details settled the same day); amended 2026-09-15 after the migration landed (decision 9 revised; decisions 15–19 recorded from the migration spec); decision 20 added 2026-09-15 while closing Phase 3.6 (presets); decisions 21–26 added 2026-09-17 from the library-boundary audit (`.scratch/library-boundary/spec.md`; 21 restated the same evening when the temporary library was decided); decisions 22 and 23 revised 2026-09-19 (integration branch retired, no PRs; what the `warnings` field shipped as)
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
   **Superseded by decision 24 (2026-09-18):** the zone solver, the root finders and the oracle live in
   `src/temporary-library/`, and `core/compute/` is deleted. The solver is `pmv_psychrometric_zone`, and
   the closure it takes is a `PmvFunction`, built from `run` (decision 18 as revised 2026-09-18).
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
24. **Temporary library.** `src/temporary-library/` holds rule-C members until jsthermalcomfort ships them. Written to
    the library's conventions — snake_case names, positional SI arguments plus a kwargs object, JSDoc on the function,
    tests in the library's shape — so that a move upstream is a file cut, and lint-restricted to importing
    `jsthermalcomfort` alone, nothing from `src/`. First members: the psychrometric zone solver, the two CBE root finders
    it needs, the oracle fixture `chart-online.json`, and their tests. The root finders move with the zone because the
    chart is meant to reproduce the deployed tool vertex for vertex, defects included (`correctKnownDefects` stays
    opt-in); exporting the library's internal `brent` is not asked. A member may stay for good if the lead keeps the
    library at pythermalcomfort parity: the seam is the point, not the move.
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
- Phases 1 and 2b of the rewrite plan were done in the fork and are superseded; Phase 3.7 is blocked
  on an upstream `PMV_PPD_ASHRAE_INFO`; Phase 4's model changes (decision 13).
- The `ClassifierBins.right: boolean` shape contradicts #186's own "`closed: left | right`, never
  `right: boolean`"; the app consumes what ships and does not raise it (lead's call, 2026-09-13).
- The fork's "writes nothing to the console" test was dropped with the migration: the main repository's
  `cooling_effect` still logs, and v1 calls no ASHRAE model. `suppressWarnings` is raised in the main
  repository, not the fork, before the Phase 4b grid scan (rewrite plan, Phase 4b).
