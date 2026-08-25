# 3n execution plan — tree and name migration

Companion to [ARCHITECTURE-PLAN.md](../ARCHITECTURE-PLAN.md) §4. This document
sequences the remaining renames and folder moves into small, independently
verified rounds. It contains no new design decisions; where a decision was
needed, it is recorded in Plan §4.1–§4.3 and only referenced here.

## Scope

In scope (the Plan §4 rows marked `3n`):

| Item                                                                             | Current usage size                                                      |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `ComfortModel` → `ModelId` symbol rename                                         | ~70 files                                                               |
| Wire values → kebab-case (`"pmv-ashrae"`)                                        | 4 literal sites + 1 snapshot                                            |
| `ChartKind` → `ChartEngine` (+ `kind:` → `engine:` on chart declarations)        | ~34 files                                                               |
| `WorkspaceCapability` → fold into `WorkspaceId`                                  | ~22 files                                                               |
| `createComfortToolState` → `createAnalysisState`                                 | ~15 files                                                               |
| Drop `*Dto` suffix; dissolve `comfortDtos.ts`                                    | ~68 files                                                               |
| Catalog anchor file renames                                                      | 4 files                                                                 |
| Folder moves (`catalog/`, `declarations/`, `engines/`, `state/analysis/`, `ui/`) | whole tree                                                              |
| Docs / lint-glob sync                                                            | `AGENTS.md`, `CLAUDE.md`, `docs/`, `.cursor/rules/`, `eslint.config.js` |

Out of scope:

- Any behavior change other than the wire-id strings (share-codec output).
- Renaming `PhysicalQuantityId` (Plan §4.2: it stays).
- Migrating logic between layers, new models, new engines, or any refactor
  not named in Plan §4.
- Share/URL compatibility (the product is not deployed).

## Ground rules

1. **No one-shot script rename.** Every round is a bounded, reviewable edit
   set applied with editor/agent edits, verified before the next round starts.
2. **One rename dimension per round.** Never mix a symbol rename with a file
   move, or a wire-value change with anything else. Each round's diff should
   have one describable shape.
3. **Compiler as the net.** `tsconfig` is strict and there are no path
   aliases, so `npm run check` catches every missed import — including Svelte
   templates that Vitest does not execute. It is mandatory in every gate.
4. **Docs move with the code.** Each round updates the sentences it
   invalidates in `AGENTS.md`, `CLAUDE.md`, `docs/adding-a-model.md`, and
   `.cursor/rules/architecture-plan.mdc`. R9 is only a final consistency
   pass, not the place where doc updates start.
5. **One commit per green round**, so any round can be reverted alone.
6. **Leftover grep before closing a round.** Each round ends with a search
   proving the old name is gone from `src/` (exceptions listed per round).

## Verification gates

- **Gate A** (every round):
  1. Focused tests for the touched area, e.g.
     `npx vitest run src/state/comfortTool src/testSupport`
  2. `npm test`
  3. `npm run check`
  4. `npm run lint`
- **Gate B** (checkpoints): Gate A plus 5. `npm run build` 6. `npm run test:visual` 7. `git diff --check`

Gate B applies after R3 (wire values), after R6 completes, after **each**
folder move in R8, and at completion. Every round states its expected diff
character (for example "zero snapshot changes"); if the actual diff differs,
stop and investigate before proceeding.

## R0 — Baseline

- Working tree clean (stash or commit unrelated changes such as
  `package-lock.json` edits; delete stray `playwright-report/` output).
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
  round.** The file itself renames later (R7).
- Update ~70 importing files; the common alias
  `type ComfortModel as ComfortModelType` becomes
  `type ModelId as ModelIdType`.
- `JsThermalComfortStandard` and `ComplianceStatus` in the same file are
  untouched.
- Leftover grep: `ComfortModel\b` → zero matches in `src/`.
- Expected diff: identifiers only; **zero snapshot changes**. **Gate A.**

## R3 — Wire values to kebab-case

Own round because it changes share-codec output and golden snapshots.

- In the `ModelId` map, change all nine values:
  `PMV_ASHRAE→pmv-ashrae`, `PMV_ISO→pmv-iso`, `UTCI→utci`,
  `ADAPTIVE_ASHRAE→adaptive-ashrae`, `ADAPTIVE_EN→adaptive-en`,
  `HEAT_INDEX→heat-index`, `HUMIDEX→humidex`, `WIND_CHILL→wind-chill`,
  `PHS_2023→phs-2023`.
- Update the known literal sites:
  `src/state/comfortTool/modelConfigs/index.test.ts`,
  `src/services/comfort/charts/kinds/memo.test.ts`.
- Regenerate the golden snapshot intentionally
  (`npx vitest run src/testSupport/outputGolden.test.ts -u`) and review that
  the snapshot diff contains **only** id strings.
- Share tests referencing the symbols pass unchanged; fix any remaining raw
  literals they contain rather than weakening assertions.
- Route paths (`/ASHRAE-55/`) are unrelated and must not change.
- Expected diff: the constant map, two test files, one snapshot. **Gate B.**

## R4 — `ChartKind` → `ChartEngine`

Three sub-rounds; the module rename must come first (Plan §4.2 collision).

- **R4a** — rename module
  `src/services/comfort/charts/chartEngine.ts` → `fieldChartEngine.ts`
  (imports only; exported symbols unchanged). **Gate A.**
- **R4b** — symbol renames across ~34 files:
  `ChartKind` → `ChartEngine`, `MODEL_CHART_KINDS` → `MODEL_CHART_ENGINES`,
  `ModelChartKind` → `ModelChartEngine`, `isChartKind` → `isChartEngine`,
  `isModelChartKind` → `isModelChartEngine`,
  `chartKindMetaById` → `chartEngineMetaById`. The file
  `models/output/chartKinds.ts` renames later (R7). **Gate A.**
- **R4c** — rename the chart-declaration discriminant `kind:` → `engine:`
  on `ChartInstanceDeclaration`, the `ModelChartDeclaration` /
  `FrontendChartDeclaration` unions in
  `services/comfort/charts/kinds/types.ts`, and every model declaration
  entry, matching the §3.2 `{ id, engine, spec }` contract.
  **Caution:** non-chart `kind` discriminants (for example the
  `{ kind: "modelQuantity" }` input-field spec) keep their name — rename
  only chart-declaration members. **Gate A.**
- Leftover grep after R4c: `ChartKind` → zero matches.

## R5 — `createComfortToolState` → `createAnalysisState` (symbols)

- Rename the exported creator and controller types in
  `src/state/comfortTool/`: `createComfortToolState` →
  `createAnalysisState`, `ComfortToolStateSlice` → `AnalysisStateSlice`,
  `ComfortToolActions` → `AnalysisActions`, `ComfortToolSelectors` →
  `AnalysisSelectors`, plus any other `ComfortTool*` exported names in
  `types.ts`.
- ~15 referencing files. File and folder names stay old until R8a.
- Leftover grep: `ComfortTool[A-Z]|createComfortToolState` → zero matches.
- Expected diff: identifiers only. **Gate A.**

## R6 — Drop `*Dto`; dissolve `comfortDtos.ts`

The widest item (~68 files). Split by type family; Plotly-shaped types also
move, because Plan §4 requires "geometry types, then a small Plotly adapter"
rather than one mixed bag.

- **R6a** — application-side types drop the suffix in place, in 2–3 family
  batches (PMV, Adaptive, UTCI/PHS, index models + shared charts):
  `ModelChartSourceDto` → `ModelChartSource`, request types like
  `PmvRequestDto` → `PmvRequest`, chart-source types likewise. The
  `jsthermalcomfort` boundary keeps short field names (`tdb`, `rh`) but no
  **type** keeps a `Dto` suffix. **Gate A per batch.**
- **R6b** — relocate what is left of `src/models/comfortDtos.ts`:
  - Plotly-shaped types (`PlotTraceDto`, `PlotMarkerDto`, `PlotLineDto`,
    contours, legend, margin, annotation, `PlotlyChartResponseDto`, …) move
    to a new `src/services/plotlyTypes.ts` beside `plotlyFigure.ts`,
    dropping the suffix (`PlotTrace`, `PlotlyChartResponse`, …). They are
    adapter-boundary types, not domain metadata. Components may keep
    importing them (components → lightweight services lane).
  - Cross-layer interchange types (`ModelChartSource`, `CompareInputMap`)
    move to `src/models/chartSource.ts` (catalog layer), since declarations
    and engines both consume them.
  - `comfortDtos.ts` is deleted; `comfortDtos.test.ts` splits/renames to
    follow the types it covers. **Gate A.**
- **R6c** — final sweep: `rg "Dto" src` returns zero matches. **Gate B**
  (the churn is wide enough to warrant a build + visual pass).

## R7 — Catalog anchor file renames

Rename and lift the four seed files to the `src/models/` root (still under
`src/models/` — the folder itself renames in R8c). One file per mini-round,
**Gate A** after each:

1. `src/models/comfortModels.ts` → `src/models/modelIds.ts`
2. `src/models/physicalQuantities.ts` → `src/models/quantities.ts`
3. `src/models/output/chartKinds.ts` → `src/models/chartEngines.ts`
4. `src/models/output/tableLayouts.ts` → `src/models/tableTypes.ts`
   - While touching it, import `ResultCellViewModel` directly from
     `./output/resultSections` instead of via `state/comfortTool/types`
     (removes the catalog→state detour named in Plan §4.1).

- Update the `src/models/output/index.ts` barrel for the moved entries; do
  not grow it.
- Test files rename with their subjects
  (`physicalQuantities.test.ts` → `quantities.test.ts`, …).
- `eslint.config.js` names `src/models/physicalQuantities.ts` in an
  `ignores` entry for the restricted wire-literal rule, and its header
  comments cite that file and `catalogWireIds.test.ts` — update those paths
  in the same mini-round as rename 2. The restricted wire-literal **values**
  track `primaryInputOrder`, which does not change here; verify
  `catalogWireIds.test.ts` still passes unchanged.

## R8 — Folder moves

One folder per round. Use plain `mv` (git detects renames by content), then
fix imports compiler-guided. Each round: update every `eslint.config.js`
`files`/`ignores` glob and comment that names the moved folder (the config
currently references `src/components`, `src/views`, `src/services`,
`src/comfortModels`, `src/state/comfortTool`, and `src/models` in ~20
places), update doc sentences, then run **Gate B**. Close each round with
`rg "<old path>" src eslint.config.js docs AGENTS.md CLAUDE.md` → zero
matches.

- **R8a** — `src/state/comfortTool/` → `src/state/analysis/`, with member
  file renames in the same round:
  `createComfortToolState.svelte.ts` → `createAnalysisState.svelte.ts`,
  `createComfortToolState.test.ts` → `createAnalysisState.test.ts`,
  `comfortToolActions.ts` → `analysisActions.ts`,
  `comfortToolSelectors.ts` → `analysisSelectors.ts`,
  `comfortToolInternals.ts` → `analysisInternals.ts`,
  `initialComfortToolState.ts` → `initialAnalysisState.ts`.
- **R8b** — `src/comfortModels/` → `src/declarations/`.
- **R8c** — `src/models/` → `src/catalog/` (pure folder rename; anchors were
  lifted in R7; `catalog/output/` subfolder is kept).
- **R8d** — `src/services/` → `src/engines/` (everything moves: `comfort/`,
  `units/`, `chartTheme.ts`, `plotlyFigure.ts`, `plotlyExport.ts`,
  `plotlyTypes.ts`).
- **R8e** — `src/components/` + `src/routes/` + `src/views/` + `src/utils/`
  → `src/ui/components`, `src/ui/routes`, `src/ui/views`, `src/ui/utils`.
  Update `src/App.svelte` and `src/main.ts` imports; `index.html` points at
  `src/main.ts` and is unaffected.

After R8e: `rg "comfortTool" src` → zero matches (paths and symbols).

## R9 — Docs and guard consistency pass

- Sweep `AGENTS.md`, `CLAUDE.md`, `docs/adding-a-model.md`, and
  `.cursor/rules/architecture-plan.mdc` so every path, symbol, and layout
  description matches the new tree (earlier rounds already fixed what they
  broke; this is verification, not the first edit).
- Mark the completed rows in ARCHITECTURE-PLAN.md §4 / §10 as done.
- Full **Gate B**.

## Completion checklist (3n is done when)

- Zero matches in `src/` for: `ComfortModel\b`, `ChartKind`,
  `WorkspaceCapability`, `createComfortToolState`, `comfortTool`,
  `comfortDtos`, and `Dto`-suffixed type names.
- Folders match Plan §4: `src/catalog/`, `src/declarations/`,
  `src/engines/`, `src/state/analysis|timeSeries|workspace/`, `src/ui/`;
  `src/models/`, `src/comfortModels/`, `src/services/`, `src/components/`,
  `src/views/`, `src/routes/` no longer exist.
- Model wire ids are kebab-case; share-codec tests are green.
- Full Gate B green: `npm test`, `npm run check`, `npm run lint`,
  `npm run build`, `npm run test:visual`, `git diff --check`.
- `eslint.config.js` globs, `AGENTS.md`, `CLAUDE.md`, `docs/`, and
  `.cursor/rules/` reference only new paths and names.
- No behavior change beyond the wire-id strings (visual baselines
  unchanged).

## Risk notes

- **Name collision** — handled by ordering: `fieldChartEngine.ts` rename
  (R4a) precedes the `ChartEngine` symbol (R4b).
- **Discriminant overlap** — `kind` exists on non-chart unions
  (input-field specs). R4c renames chart-declaration members only.
- **Svelte template coverage** — Vitest does not execute every template;
  `npm run check` is the guard and is mandatory in every gate.
- **Snapshot noise** — only R3 may change snapshots. Any other round that
  touches a snapshot has gone off-script; stop and investigate.
- **Wire change side effects** — saved dev URLs and local share strings
  break. Acceptable: the product is not deployed and the Plan grants no
  share compatibility.
