# 3n execution plan — tree and name migration

Companion to [ARCHITECTURE-PLAN.md](../ARCHITECTURE-PLAN.md) §4. This document
sequences the remaining renames and folder moves into small, independently
verified rounds. It contains no new design decisions; where a decision was
needed, it is recorded in Plan §3.2, §4.1–§4.3, and §5.2 and only referenced
here.

## Scope

In scope (the Plan §4 rows marked `3n`):

| Item                                            | Current usage size            |
| ----------------------------------------------- | ----------------------------- |
| `ComfortModel` → `ModelId` symbol rename        | ~70 files                     |
| Wire values → kebab-case (`"pmv-ashrae"`)       | see R3 semantic classification |
| `ChartKind` → `ChartEngine` (+ chart `kind:` → `engine:`) | ~34 files           |
| Chart authoring contract A′ (`outputCharts` → `charts`, entry `instanceId` → `id`, `defaultChartId`, `setCharts()`; runtime `chartInstances` / `chartEngineRegistrations`) | authoring + builder + runtime consumers |
| `WorkspaceCapability` → fold into `WorkspaceId` | ~22 files                     |
| `createComfortToolState` → `createAnalysisState` | ~15 files                    |
| Drop `*Dto`; `PlotlyChartResponseDto` → `PlotlyChartSpec`; dissolve `comfortDtos.ts` | ~68 files |
| Mis-layered modules to their true home (`chartBuildResult`, `simulationCharts`, `timeSeries` view models, `siteShellConfig`) | 4 modules |
| Catalog anchor file renames                     | 4 files                       |
| Family file de-prefixing (`pmvAshrae.ts` → `ashrae.ts`, …) | pmv/, adaptive/, utci/, phs/ |
| Folder moves (`catalog/`, `declarations/`, `engines/`, `state/analysis/`, `ui/`) | whole tree |
| Docs / lint-glob sync                           | `AGENTS.md`, `CLAUDE.md`, `docs/`, `.cursor/rules/`, `eslint.config.js` |

Out of scope:

- Any behavior change other than the model wire-id strings (share-codec
  output).
- Renaming `PhysicalQuantityId` (Plan §4.2: it stays).
- Merging the two runtime chart projections (Plan §3.2: presentation without
  spec and execution with spec stay separate; there is no "3m" slice).
- A geometry-IR / vendor-neutral chart interchange slice (Plan §5.2: the
  product interchange is a compact, Plotly-compatible, theme-ready
  `PlotlyChartSpec` — the payload keeps its baseline style fields; 3n only
  renames and relocates it).
- Renaming `selectedChartInstanceId` or any share wire key other than model
  ids.
- Migrating logic between layers beyond the named mis-layered modules, new
  models, new engines, or any refactor not named in Plan §4.
- Share/URL compatibility (the product is not deployed).

## Naming boundary (normative)

`instanceId → id` happens **only in the authoring contract**. Runtime keeps
the instance vocabulary; state/share keys are wire-stable. Do not run a
"consistency" sweep across this boundary.

| Layer                        | Now                                 | Target                     |
| ---------------------------- | ----------------------------------- | -------------------------- |
| Authoring array              | `outputCharts`                      | `charts`                   |
| Authoring entry              | `instanceId`                        | `id`                       |
| Chart discriminant (all layers) | `kind`                           | `engine`                   |
| Authoring default            | `defaultChartInstanceId`            | `defaultChartId`           |
| Builder method               | `setOutputCharts()`                 | `setCharts()`              |
| Builder authoring option     | `{ defaultInstanceId }`             | `{ defaultChartId }`       |
| Family authoring contract fields | `psychrometricInstanceId`, `dynamicInstanceId`, `heatLossInstanceId`, `setInstanceId`, `boundaryInstanceId` | `psychrometricChartId`, `dynamicChartId`, `heatLossChartId`, `setChartId`, `boundaryChartId` |
| Simple-model local constants | `FIXED_CHART_INSTANCE_ID`, `DYNAMIC_CHART_INSTANCE_ID` | `FIXED_CHART_ID`, `DYNAMIC_CHART_ID` |
| Authoring input type / helpers | `OutputChartDeclarationInput`, `createPmvOutputCharts` | `ChartDeclarationInput`, `createPmvCharts` |
| Runtime presentation container | `outputCharts: ModelChartInstances` | `chartInstances`         |
| Runtime presentation entries | `instanceId`, `defaultInstanceId`   | **keep**                   |
| Runtime execution projection | `chartKindRegistrations`            | `chartEngineRegistrations` |
| Runtime registration join key | `instanceId`                       | **keep**                   |
| Engines (`GridModelChartSpec.instanceId`, chart memo keys, `buildChart(instanceId)`, "not a … chart" diagnostics) | `instanceId` | **keep** |
| Test fixtures / golden `"instanceId"` fields | `instanceId`        | **keep**                   |
| State/share                  | `selectedChartInstanceId`           | **keep** (wire-stable)     |
| Diagnostics                  | "Chart instance ID …"               | **keep**                   |

The builder maps authoring `id` → runtime `instanceId` during assemble.

## Ground rules

1. **No one-shot script rename.** Every round is a bounded, reviewable edit
   set applied with editor/agent edits, verified before the next round starts.
2. **One rename dimension per round.** Each round's diff should have one
   describable shape, and a round must not mix in migration dimensions its
   own checklist does not name. Wire-value changes never mix with anything
   else. Sub-rounds (R4a–c, R7a–d, each R8/R9 mini-round) are the commit and
   gate boundary; a sub-round may combine the edits its own checklist names
   (for example R7c renames types while dissolving `comfortDtos.ts`, and the
   R8 `tableTypes.ts` mini-round removes the named import detour), but must
   not pull in another round's dimension.
3. **Respect the naming boundary.** The table above is normative. A round
   that "tidies up" runtime `instanceId`, the share key, or diagnostics has
   gone off-script.
4. **Compiler as the net.** `tsconfig` is strict and there are no path
   aliases, so `npm run check` catches every missed import — including Svelte
   templates that Vitest does not execute. It is mandatory in every gate.
5. **Docs move with the code.** Each round updates the sentences it
   invalidates in `AGENTS.md`, `CLAUDE.md`, `docs/adding-a-model.md`, and
   `.cursor/rules/architecture-plan.mdc`. The final round is only a
   consistency pass, not the place where doc updates start.
6. **Commits belong to the user.** Each green round lands as one commit so it
   can be reverted alone; the user makes the commit (or explicitly authorizes
   it per round). The executor never runs git write commands on its own.
7. **Dirty workspace: stop.** If the working tree is not clean at any round
   boundary (beyond the round's own edits), stop and report; the user decides
   how to resolve it. Never stash, discard, or delete user changes.
8. **Leftover grep before closing a round.** Each round ends with a search
   proving the old name is gone from `src/` (exceptions listed per round).

## Verification gates

- **Gate A** (every round):
  1. Focused tests for the touched area, e.g.
     `npx vitest run src/state/comfortTool src/testSupport`
  2. `npm test`
  3. `npm run check`
  4. `npm run lint`
- **Gate B** (checkpoints): Gate A plus
  5. `npm run build`
  6. `npm run test:visual`
  7. `git diff --check`

Gate B applies after R3 (wire values), after R7 completes, after **each**
folder move in R9, and at completion. Every round states its expected diff
character (for example "zero snapshot changes"); if the actual diff differs,
stop and investigate before proceeding.

## R0 — Baseline

- The working tree must be clean. If it is not, **stop and report**; the
  user decides how to handle existing changes. Do not stash, commit, or
  delete anything to "fix" the baseline.
- Run full Gate B once and record it green. Do not start R1 on a red or
  dirty baseline.

## R1 — Fold `WorkspaceCapability` into `WorkspaceId`

`src/models/output/workspaceCapabilities.ts` is a thin alias of
`WorkspaceId` plus four helpers.

- Move `supportsWorkspace`, `supportsStandardWorkspace`,
  `supportsExploreWorkspace`, `supportsTimeSeriesWorkspace` into
  `src/models/workspaces.ts`, typed against `WorkspaceId`.
- Delete `workspaceCapabilities.ts`; update the `src/models/output/index.ts`
  barrel.
- Replace `WorkspaceCapability` with `WorkspaceId` in all ~22 referencing
  files (declarations, `modelConfigs/`, workspace routing, tests).
- Leftover grep: `WorkspaceCapability` → zero matches.
- Expected diff: type-level only; no snapshot or behavior change. **Gate A.**

## R2 — `ComfortModel` → `ModelId`

- In `src/models/comfortModels.ts`: rename the const and type
  `ComfortModel` → `ModelId`. **Wire values stay `"PMV_ASHRAE"` etc. this
  round.** The file itself renames later (R8).
- Update ~70 importing files; the common alias
  `type ComfortModel as ComfortModelType` becomes
  `type ModelId as ModelIdType`.
- `JsThermalComfortStandard` and `ComplianceStatus` in the same file are
  untouched.
- Leftover grep: `ComfortModel\b` → zero matches in `src/`.
- Expected diff: identifiers only; **zero snapshot changes**. **Gate A.**

## R3 — Wire values to kebab-case

Own round because it changes share-codec output, error-message text, memo
keys, and golden snapshots. **No global string replace** — classify every
match of the old ids semantically.

Change the nine values in the `ModelId` map:
`PMV_ASHRAE→pmv-ashrae`, `PMV_ISO→pmv-iso`, `UTCI→utci`,
`ADAPTIVE_ASHRAE→adaptive-ashrae`, `ADAPTIVE_EN→adaptive-en`,
`HEAT_INDEX→heat-index`, `HUMIDEX→humidex`, `WIND_CHILL→wind-chill`,
`PHS_2023→phs-2023`.

Then classify the remaining literal occurrences:

**Update (they assert or embed wire values):**

- Wire pins: `src/state/comfortTool/modelConfigs/index.test.ts` (~78–79)
  pin `ModelId.PmvAshrae === "PMV_ASHRAE"` — update to the kebab values.
- Error-message assertions that interpolate model ids:
  `modelConfigs/builder.test.ts` (~436, ~502),
  `modelConfigs/validateModel.test.ts` (~157, ~181, ~214, ~288, ~317).
- Memo-key fixtures: `src/services/comfort/charts/kinds/memo.test.ts`
  (`modelId: "PHS_2023"`, `"PMV_ASHRAE"`).
- Golden snapshot: regenerate intentionally
  (`npx vitest run src/testSupport/outputGolden.test.ts -u`) and review that
  the snapshot diff contains **only** id strings.
- Docs in the same round (ground rule 5): `docs/adding-a-model.md` (~33:
  `"HEAT_INDEX"`, `"HUMIDEX"`) and `AGENTS.md` (~172: `"PMV_ASHRAE"`,
  `"PMV_ISO"`) quote wire values — update them to kebab-case.

**Do not change (display or descriptive text):**

- Display labels and chart text: `UTCI_MODEL_LABEL`, `name: "UTCI"` legend
  entries, hover templates, result-row titles in `resultRows.test.ts` /
  `ChartControls.test.ts`.
- Route paths (`/ASHRAE-55/`) — route definitions, not model wire ids.
- Test description labels such as
  `testRequestAdapterContract("HEAT_INDEX", …)` in
  `requestMapping.contract.test.ts` — descriptive only; leave unless they
  compare against `ModelId` values.

- Leftover grep:
  `PMV_ASHRAE|PMV_ISO|ADAPTIVE_ASHRAE|ADAPTIVE_EN|HEAT_INDEX|HUMIDEX|WIND_CHILL|PHS_2023`
  over `src/`, `docs/adding-a-model.md`, `AGENTS.md`, `CLAUDE.md`, and
  `.cursor/rules/` → zero, with one listed exception: the three descriptive
  `testRequestAdapterContract("HEAT_INDEX" | "HUMIDEX" | "WIND_CHILL", …)`
  describe labels in `requestMapping.contract.test.ts` (test text only,
  never compared to `ModelId`). `UTCI` is not grepped — it is display text.
  `docs/refactor-plan-3n.md` is excluded by design: it records the old→new
  wire mapping and would never grep clean.
- Expected diff: the constant map, the listed test files, the two doc files,
  one snapshot. **Gate B.**

## R4 — `ChartKind` → `ChartEngine`

Three sub-rounds; the module rename must come first (Plan §4.2 collision).

- **R4a** — rename module
  `src/services/comfort/charts/chartEngine.ts` → `fieldChartEngine.ts`
  (imports only; exported symbols unchanged). **Gate A.**
- **R4b** — symbol renames across ~34 files:
  `ChartKind` → `ChartEngine`, `MODEL_CHART_KINDS` → `MODEL_CHART_ENGINES`,
  `ModelChartKind` → `ModelChartEngine`, `isChartKind` → `isChartEngine`,
  `isModelChartKind` → `isModelChartEngine`,
  `chartKindMetaById` → `chartEngineMetaById`,
  `ChartKindRegistration` → `ChartEngineRegistration`,
  `chartKindRegistrations` → `chartEngineRegistrations`, and other
  `*Kind*`-derived names in `services/comfort/charts/kinds/types.ts`.
  The file `models/output/chartKinds.ts` renames later (R8). **Gate A.**
- **R4c** — rename `kind:` → `engine:` on every field typed
  `ChartEngine`: the authoring unions (`ModelChartDeclaration`,
  `FrontendChartDeclaration`), runtime `ChartInstanceDeclaration`,
  `SimulationChartDeclaration`, registrations, and every model declaration
  entry. **Caution:** non-chart `kind` discriminants (for example the
  `{ kind: "modelQuantity" }` input-field spec and time-series control
  kinds) keep their name — rename only chart members. **Gate A.**
- Leftover grep after R4c: `ChartKind` → zero matches.

## R5 — Chart authoring contract (A′ renames)

Applies the normative naming-boundary table. No structural change: the
builder keeps deriving two projections.

- Authoring (`ModelDeclaration` and every declaration file):
  `outputCharts` → `charts`, entry `instanceId` → `id`,
  `defaultChartInstanceId` → `defaultChartId`.
- Builder: `setOutputCharts()` → `setCharts()` and its option
  `{ defaultInstanceId }` → `{ defaultChartId }`; it maps authoring `id` →
  runtime `instanceId` when building projections. Every builder internal
  drops the `OutputChart` wording — `registerOutputChart`,
  `RegisteredOutputChart`, `registeredOutputCharts`,
  `resolveOutputCharts()`, `registeredOutputChartsForBuild`,
  `defaultOutputChartInstanceId` — plus the `utciOutputCharts` local in
  `utci.ts`. These are in-scope renames, not grep false positives.
  Family/frontend modules (PMV, Adaptive, UTCI, PHS via
  `ComfortModelBuilder`) update their call sites and entry field names the
  same way.
- Family authoring contracts follow the authoring side (field names only —
  the id string **values** such as `"pmv-ashrae-heat-loss"` stay):
  `psychrometricInstanceId` / `dynamicInstanceId` / `heatLossInstanceId` /
  `setInstanceId` → `psychrometricChartId` / `dynamicChartId` /
  `heatLossChartId` / `setChartId` (`pmvShared.ts`, `pmvAshrae.ts`,
  `pmvIso.ts`, `pmvCharts.ts` field reads, `pmv.test.ts`),
  `boundaryInstanceId` → `boundaryChartId` (`adaptiveShared.ts`,
  `adaptiveAshrae.ts`, `adaptiveEn.ts`). Simple-model local constants
  rename likewise: `FIXED_CHART_INSTANCE_ID` / `DYNAMIC_CHART_INSTANCE_ID`
  → `FIXED_CHART_ID` / `DYNAMIC_CHART_ID` (`heatIndex.ts`, `humidex.ts`,
  `windChill.ts`). Authoring type and helper names lose the old wording:
  `OutputChartDeclarationInput` → `ChartDeclarationInput` and the private
  `OutputChartCommonFields` likewise
  (`services/comfort/charts/kinds/types.ts` plus the builder re-export and
  UTCI/PHS/family users), `createPmvOutputCharts` → `createPmvCharts`.
- Assembled runtime definition: `outputCharts: ModelChartInstances` →
  `chartInstances`. Runtime entries **keep** `instanceId` and
  `defaultInstanceId`; `chartEngineRegistrations` (renamed in R4b) keeps its
  `instanceId` join key. Tests reading
  `config.outputCharts.defaultInstanceId` follow the container rename to
  `config.chartInstances.defaultInstanceId` — the trailing property keeps
  its name.
- Untouched by design: `selectedChartInstanceId` (state field and share wire
  key), `chartInstancePresentation.ts` module name, "Chart instance ID …"
  diagnostics, and the engines side — `GridModelChartSpec.instanceId`, chart
  memo keys (`memo.ts`), `buildChart(instanceId, …)`, "is not a … chart"
  diagnostics (`builders.ts`), and test fixture / golden `"instanceId"`
  fields all keep `instanceId`.
- Leftover grep:
  `outputCharts|OutputChart|defaultChartInstanceId|CHART_INSTANCE_ID|psychrometricInstanceId|dynamicInstanceId|heatLossInstanceId|setInstanceId|boundaryInstanceId`
  → zero matches in `src/` (`OutputChart` also catches `setOutputCharts`,
  `createPmvOutputCharts`, `OutputChartDeclarationInput`, and the builder
  internals). Do **not** grep bare `instanceId` / `defaultInstanceId`
  toward zero — runtime keeps them.
- Expected diff: identifiers only; **zero snapshot changes**; share tests
  pass unchanged. **Gate A.**

## R6 — `createComfortToolState` → `createAnalysisState` (symbols)

- Rename every exported `ComfortTool*` / `createComfortTool*` symbol in
  `src/state/comfortTool/` — the full set:
  - `createComfortToolState` → `createAnalysisState`
    (`createComfortToolState.svelte.ts`)
  - `createComfortToolActions` → `createAnalysisActions`
    (`comfortToolActions.ts`)
  - `createComfortToolSelectors` → `createAnalysisSelectors`
    (`comfortToolSelectors.ts`)
  - `createComfortToolInternals` / `ComfortToolInternals` →
    `createAnalysisInternals` / `AnalysisInternals`
    (`comfortToolInternals.ts`)
  - in `types.ts`: `ComfortToolStateSlice` → `AnalysisStateSlice`,
    `ComfortToolActions` → `AnalysisActions`, `ComfortToolSelectors` →
    `AnalysisSelectors`, `ComfortToolController` → `AnalysisController`
- ~15 referencing files. File and folder names stay old until R8/R9.
- Leftover grep: `createComfortTool|ComfortTool[A-Z]` → the only remaining
  matches are module-path strings in import specifiers
  (`"./createComfortToolState.svelte"` and its relative variants). R8
  renames the files and takes this grep to zero; do not chase it to zero
  in R6.
- Expected diff: identifiers only. **Gate A.**

## R7 — Layer repositioning, `*Dto` removal, `PlotlyChartSpec`

The widest item (~68 files). Layer moves come first so the later folder
rounds are pure renames.

- **R7a — mis-layered modules to their true home** (Plan §4.1):
  - `src/models/output/chartBuildResult.ts` and
    `src/models/output/simulationCharts.ts` → `src/services/comfort/charts/`
    (they carry the Plotly-typed chart payload).
  - `src/models/timeSeries.ts` splits by an explicit type inventory (the
    file mixes layers; list before moving):
    - **Move to `src/state/timeSeries/`:** `buildTimeSeriesEditorViewModel`
      (with its private `buildControlViewModel`) and the view-model types
      `TimeSeriesNumberControlViewModel`,
      `TimeSeriesSelectControlViewModel`,
      `TimeSeriesToggleControlViewModel`, `TimeSeriesControlViewModel`,
      `TimeSeriesSegmentViewModel`, `TimeSeriesSettingsSectionViewModel`,
      `TimeSeriesEditorViewModel`, and `TimeSeriesChartViewModel` (the
      Plotly-typed one).
    - **Stay (pure declaration contracts):** `TimeSeriesPresetDefinition`,
      `TimeSeriesSelectItem`, the `TimeSeriesControlDefinition` union and
      its number/select/toggle members, `TimeSeriesSegmentReference`,
      `TimeSeriesSettingsSectionDefinition`, `TimeSeriesEditorDefinition`,
      `TimeSeriesSimulationControls`, `TimeSeriesModelReference`,
      `TimeSeriesModelDefinition`, `RuntimeTimeSeriesModelDefinition`.
  - `src/models/siteShellConfig.ts` → `src/components/` (rides into `ui/`
    in R9).
  - Update the `models/output/index.ts` barrel. **Gate A.**
- **R7b — application-side `*Dto` renames** in 2–3 family batches (PMV,
  Adaptive, UTCI/PHS, index models + shared charts): request/chart-source
  types drop the suffix (`PmvRequestDto` → `PmvRequest`,
  `ModelChartSourceDto` → `ModelChartSource`, …). The `jsthermalcomfort`
  boundary keeps short field names (`tdb`, `rh`) but no **type** keeps a
  `Dto` suffix. **Gate A per batch.**
- **R7c — dissolve `src/models/comfortDtos.ts`:**
  - `PlotlyChartResponseDto` → **`PlotlyChartSpec`**; all Plotly-shaped
    types (`PlotTraceDto` → `PlotTrace`, marker/line/contours/legend/
    margin/annotation types likewise) move to a new
    `src/services/plotlyTypes.ts` beside `plotlyFigure.ts`. They are
    Plotly-compatible, theme-ready adapter types (Plan §5.2; the payload
    keeps its baseline style fields) — do not label them theme-neutral or
    vendor-neutral geometry. Components may keep importing them
    (components → lightweight services lane).
  - Update the stale header comment in `src/services/chartTheme.ts`
    ("Geometry stays Plotly-agnostic") to the §5.2 wording — engines emit a
    Plotly-compatible spec and `toPlotlyFigure` owns theming; the comment
    describes the retired pipeline.
  - Cross-layer interchange types (`ModelChartSource`, `CompareInputMap`)
    move to `src/models/chartSource.ts` (catalog layer).
  - Delete `comfortDtos.ts`; split/rename `comfortDtos.test.ts` to follow
    the types it covers. **Gate A.**
- **R7d — final sweep:** `rg "Dto" src` returns zero matches; catalog
  modules (`src/models/**`) import nothing from `src/services/**`.
  **Gate B.**

## R8 — File renames in place

One file (or one family) per mini-round, **Gate A** after each. Folders are
still the old ones; R9 moves them.

Catalog anchors (lift to the `src/models/` root):

1. `src/models/comfortModels.ts` → `src/models/modelIds.ts`
2. `src/models/physicalQuantities.ts` → `src/models/quantities.ts`
   - `eslint.config.js` names this file in an `ignores` entry for the
     restricted wire-literal rule, and its header comments cite it — update
     those paths in the same mini-round. The restricted wire-literal
     **values** track `primaryInputOrder`, which does not change here.
3. `src/models/output/chartKinds.ts` → `src/models/chartEngines.ts`
4. `src/models/output/tableLayouts.ts` → `src/models/tableTypes.ts`
   - While touching it, import `ResultCellViewModel` directly from
     `./output/resultSections` instead of via `state/comfortTool/types`
     (removes the catalog→state detour named in Plan §4.1).

State controller files (symbols already renamed in R6):

5. `createComfortToolState.svelte.ts` → `createAnalysisState.svelte.ts`,
   `createComfortToolState.test.ts` → `createAnalysisState.test.ts`,
   `comfortToolActions.ts` → `analysisActions.ts`,
   `comfortToolSelectors.ts` → `analysisSelectors.ts`,
   `comfortToolInternals.ts` → `analysisInternals.ts`,
   `initialComfortToolState.ts` → `initialAnalysisState.ts`.

Family de-prefixing (one family per mini-round; Plan §4 tree). Support
modules drop the family prefix; standard entry files take the standard name;
single-standard entry files keep the model name:

6. `pmv/`: `pmvAshrae.ts` → `ashrae.ts`, `pmvIso.ts` → `iso.ts`,
   `pmvCalculation.ts` → `calculation.ts`, `pmvCharts.ts` → `charts.ts`,
   `pmvShared.ts` → `shared.ts`, `pmvHeatLossSeries.ts` →
   `heatLossSeries.ts`, `pmvSetSeries.ts` → `setSeries.ts`,
   `pmvDynamicChart.ts` → `dynamicChart.ts`, `pmvPsychrometricChart.ts` →
   `psychrometricChart.ts`, `pmvChartShared.ts` → `chartShared.ts`,
   `pmvParametricShared.ts` → `parametricShared.ts`; tests follow.
7. `adaptive/`: `adaptiveAshrae.ts` → `ashrae.ts`, `adaptiveEn.ts` →
   `en.ts`, `adaptiveCalculation.ts` → `calculation.ts`,
   `adaptiveCharts.ts` → `charts.ts`, `adaptiveShared.ts` → `shared.ts`;
   tests follow.
8. `utci/`: `utciCalculation.ts` → `calculation.ts`, `utciCharts.ts` →
   `charts.ts`; the declaration entry stays `utci.ts`.
9. `phs/`: `phsCalculation.ts` → `calculation.ts`, `phsCharts.ts` →
   `charts.ts`, `phsTimeSeries.ts` → `timeSeries.ts`,
   `phsTimeSeries.worker.ts` → `timeSeries.worker.ts` (update the
   `new URL("./phsTimeSeries.worker.ts", import.meta.url)` reference inside
   `timeSeries.ts` in the same mini-round),
   `phsTimeSeriesCharts.ts` → `timeSeriesCharts.ts`; the declaration entry
   stays `phs.ts`.

Test files rename with their subjects throughout
(`physicalQuantities.test.ts` → `quantities.test.ts`, …).

## R9 — Folder moves (pure moves only)

All member-file renames happened in R8; each round here is a pure directory
move plus compiler-guided import fixes. Use plain `mv` (git detects renames
by content). Each round: update every `eslint.config.js` `files`/`ignores`
glob and comment that names the moved folder (the config currently
references `src/components`, `src/views`, `src/services`,
`src/comfortModels`, `src/state/comfortTool`, and `src/models` in ~20
places), update doc sentences, then run **Gate B**. Close each round with
`rg "<old path>" src eslint.config.js docs/adding-a-model.md AGENTS.md CLAUDE.md .cursor/rules`
→ zero matches. `docs/refactor-plan-3n.md` is excluded by design — it is
the migration record and names every old path.

- **R9a** — `src/state/comfortTool/` → `src/state/analysis/`.
- **R9b** — `src/comfortModels/` → `src/declarations/`.
- **R9c** — `src/models/` → `src/catalog/` (`catalog/output/` subfolder is
  kept). In the same round, add the ESLint lane restriction from Plan §4.1:
  `catalog/**` must not import from `declarations/`, `engines/`, `state/`,
  or `ui/`. Scope it like the existing restricted rules — production
  sources only (`ignores: ["**/*.test.ts"]`): `zoneTokens.test.ts`
  legitimately imports declaration zone lists to test the token contract
  and stays beside the catalog.
- **R9d** — `src/services/` → `src/engines/` (everything moves: `comfort/`,
  `units/`, `chartTheme.ts`, `plotlyFigure.ts`, `plotlyExport.ts`,
  `plotlyTypes.ts`).
- **R9e** — `src/components/` → `src/ui/components/`.
- **R9f** — `src/routes/` → `src/ui/routes/`.
- **R9g** — `src/views/` → `src/ui/views/`.
- **R9h** — `src/utils/` → `src/ui/utils/` (only member: `clickOutside.ts`).
  Update its two importers, `PresetNumericInput.svelte` and
  `SearchableSelect.svelte` (under `src/ui/components/` after R9e);
  `src/App.svelte` and `src/main.ts` do not import from `utils/`, and
  `index.html` points at `src/main.ts` and is unaffected.

After R9h: `rg "comfortTool" src` → zero matches (paths and symbols; the
preserved `selectedChartInstanceId` / `chartInstancePresentation` names do
not contain it).

## R10 — Docs and guard consistency pass

- Sweep `AGENTS.md`, `CLAUDE.md`, `docs/adding-a-model.md`, and
  `.cursor/rules/architecture-plan.mdc` so every path, symbol, and layout
  description matches the new tree (earlier rounds already fixed what they
  broke; this is verification, not the first edit).
- Sweep ARCHITECTURE-PLAN.md for stale "type catalog" / old-name phrasing
  and mark the completed §4 / §10 rows as done.
- Full **Gate B**.

## Completion checklist (3n is done when)

- Zero matches in `src/` for: `ComfortModel\b`, `ChartKind`,
  `WorkspaceCapability`, `createComfortToolState`, `comfortTool`,
  `comfortDtos`, `outputCharts`, `OutputChart`, `chartKindRegistrations`,
  `defaultChartInstanceId`, `setOutputCharts`, `CHART_INSTANCE_ID`,
  `psychrometricInstanceId`, `dynamicInstanceId`, `heatLossInstanceId`,
  `setInstanceId`, `boundaryInstanceId`, `PlotlyChartResponseDto`,
  and `Dto`-suffixed type names.
- Old wire values gone: the R3 leftover grep (`PMV_ASHRAE|…|PHS_2023` over
  `src/`, `docs/adding-a-model.md`, `AGENTS.md`, `CLAUDE.md`,
  `.cursor/rules/`) is still zero apart from its listed exception (the
  three descriptive `requestMapping.contract.test.ts` labels).
- Preserved names still present exactly as decided (sanity check):
  `selectedChartInstanceId` in state and share, runtime `instanceId` /
  `defaultInstanceId` (including `GridModelChartSpec.instanceId`, chart
  memo keys, and test fixture / golden `"instanceId"` fields),
  `chartInstancePresentation.ts`, "Chart instance ID …" diagnostics.
- Folders match Plan §4: `src/catalog/`, `src/declarations/`,
  `src/engines/`, `src/state/analysis|timeSeries|workspace/`, `src/ui/`;
  `src/models/`, `src/comfortModels/`, `src/services/`, `src/components/`,
  `src/views/`, `src/routes/`, `src/utils/` no longer exist.
- Family folders match the §4 tree (`declarations/pmv/ashrae.ts`, …); no
  `pmv*`/`adaptive*`/`utci*`/`phs*`-prefixed support modules remain inside
  family folders.
- Model wire ids are kebab-case; share-codec tests are green; display
  labels ("UTCI" etc.) unchanged.
- The ESLint catalog-lane restriction is in place; `eslint.config.js`
  globs and the current-state docs (`AGENTS.md`, `CLAUDE.md`,
  `docs/adding-a-model.md`, `.cursor/rules/`) reference only new paths and
  names. This execution plan and `ARCHITECTURE-PLAN.md` may keep
  current→target mappings as the migration record.
- Full Gate B green: `npm test`, `npm run check`, `npm run lint`,
  `npm run build`, `npm run test:visual`, `git diff --check`.
- No behavior change beyond the model wire-id strings (visual baselines
  unchanged).

## Risk notes

- **Naming-boundary drift** — the biggest rework risk is a well-meaning
  "consistency" sweep renaming runtime `instanceId`, the share key,
  diagnostics, or the engines side (`GridModelChartSpec.instanceId`, memo
  keys, test fixtures and goldens). The boundary table at the top is
  normative; R5 lists the untouched names explicitly, and only R3 may touch
  snapshots.
- **Name collision** — handled by ordering: `fieldChartEngine.ts` rename
  (R4a) precedes the `ChartEngine` symbol (R4b).
- **Discriminant overlap** — `kind` exists on non-chart unions (input-field
  specs, time-series controls). R4c renames chart members only.
- **`PlotlyChartSpec` vs authoring `spec`** — two different layers share
  the word "spec" (authoring engine spec vs the built Plotly payload). The
  `Plotly` prefix scopes the latter; do not rename authoring `spec`.
- **Svelte template coverage** — Vitest does not execute every template;
  `npm run check` is the guard and is mandatory in every gate.
- **Snapshot noise** — only R3 may change snapshots. Any other round that
  touches a snapshot has gone off-script; stop and investigate.
- **Wire change side effects** — saved dev URLs and local share strings
  break. Acceptable: the product is not deployed and the Plan grants no
  share compatibility.
