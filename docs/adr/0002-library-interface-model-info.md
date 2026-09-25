# ADR-0002 · Library interface: the jsthermalcomfort main repository's `ModelInfo` replaces the fork contract

- Status: accepted (2026-09-13, decision taken with the project lead; details settled the same day); amended 2026-09-15 after the migration landed (decision 9 revised; decisions 15–19 recorded from the migration spec); decision 20 added 2026-09-15 while closing Phase 3.6 (presets); decisions 21–26 added 2026-09-17 from the library-boundary audit (`.scratch/library-boundary/spec.md`; 21 restated the same evening when the temporary library was decided); decisions 22 and 23 revised 2026-09-19 (integration branch retired, no PRs; what the `warnings` field shipped as); decisions 27–31 added 2026-09-21 from the grilling session on the Worker boundary and the band editor (`.scratch/numeric-scan-and-model-name/spec.md`); decision 27 revised 2026-09-22 when that spec landed (one constraint contour per Band; how `bands` is spelled); decisions 32–35 added 2026-09-22 from the grilling session on the four tickets that spec's close-out left behind (switching models, what the gate freezes, the shape of `run`, the unrounded `run`), with decisions 3 and 27 revised the same day; decision 32 revised 2026-09-22 when the model-switch feature landed (every in-app way of switching asks, not only the select; where the rehearsal lives); decision 36 added 2026-09-23 from the Phase 4b grilling (`.scratch/phase-4b/spec.md`) when the option contract landed, revising decision 34; decisions 34 and 36 revised 2026-09-25 when the app moved onto the library's params objects (`.scratch/library-v2-migration/`), and decision 30 the same day when it read the model's name from the model info, and decision 24 the same day when the zone solver took one params object, and decisions 8 and 31 the same day when the PMV (ISO 7730) page drew categories A, B and C
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
   **Revised 2026-09-21:** `pathSegment` is replaced by `name`, the library's function name (decision 30).
   **Revised 2026-09-22:** `run` no longer takes `Record<key, number>`. It stays the positional call written in
   the declaration file, and reads its values by `Quantity` (decision 34).
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
   **Revised 2026-09-21:** an Explore Band list is the `ClassifierBins` itself plus colours, a copy rather than a
   conversion (decision 31).
8. **Results** are the model's own return object; the table reads `result[key]` for each `table`
   entry; an output whose `VariableInfo` carries a `classifier` reports its category in that result
   field (`tsv` for PMV). There is no `Measure` / `Outcome` layer.
   **Revised 2026-09-25 (`.scratch/library-v2-migration/`, ticket 04):** the Compliance column prints each classified
   output as its quantity's `Quantity.label` and its category, `Thermal sensation: Neutral`, `ISO 7730 category: B`,
   each with a swatch from that output's own classifier. It rendered the category alone, so the ISO page's new
   `category` sat unlabelled beside `tsv`. One change to the table component, for every model (Heat Index reads
   `Heat stress category: caution`); ADR-0001 §4.3's Compliance sentence is amended with it.
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
    and C, one zone per bin below the sentinel edge, and Phase 4b's ASHRAE declaration will write
    `intervalZone(copy.comfortZone, PMV_COMPLIANCE_INTERVAL_ASHRAE)`. The Standard page draws the declaration's zones,
    nested, largest first, in one hue whose opacity rises inwards. A zone's inclusivity follows its source as
    pythermalcomfort reads it: a classifier's `right`, and strict at both ends for the compliance interval, so the limit
    above reads |PMV| < 0.5 and the deployed tool's `≤` is not ported. The "deleted when an `_INFO` carries the
    interval" trigger is closed by the library's `PMV_COMPLIANCE_INTERVAL_ASHRAE` (`fcd877e`) and
    `PMV_CATEGORY_BINS_ISO` (`ab8f6d5`), and the temporary library holds no limit (decision 24's note of the same
    date). The dynamic chart is unchanged: the category bins cut |PMV|, not the signed `pmv` it scans, so they cannot
    be its bands.

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
