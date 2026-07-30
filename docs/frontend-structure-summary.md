# Frontend Structure Summary

## Overall Purpose

This project is a Svelte 5 frontend for exploring thermal comfort calculations. The application lets users enter environmental and personal parameters, run comfort calculations, and view both numeric results and charts.

The current active application is the repository root version.

## Main Runtime Flow

`src/App.svelte`
- Application entry point.
- Creates the main comfort-tool state controller.
- Loads shared state from the URL when present.
- Triggers the initial calculation when the page opens.

`src/views/ComfortDashboard.svelte`
- Main page composition.
- Connects the input panel, results panel, and chart panel.
- Keeps layout separate from domain logic.

## Directory Summary

`src/components/`
- Reusable UI components.
- Contains layout components, results display, search/select inputs, and clothing tools.

`src/components/chart/`
- Chart-specific UI.
- Handles chart display, export, Plotly rendering, Explore output selection, and transactional threshold editing.

`src/components/input-panel/`
- Input workflow UI.
- Handles model selection, compare mode, unit switching, and input editing.

`src/models/`
- Domain constants and metadata.
- Defines model IDs, chart IDs, field keys, model capability types, field metadata, DTOs, units, and preset options.

`src/comfortModels/`
- Owns each model's controls, request mapping, calculations, results, charts, zones, and declarative capabilities.
- Contains separate `pmvAshrae.ts` (`"PMV_ASHRAE"`) and `pmvIso.ts` (`"PMV_ISO"`) declarations; shared PMV mechanics live in the non-registered `pmvShared.ts` support module.

`src/services/comfort/`
- Reusable thermal-comfort helpers shared by model definitions.
- Contains psychrometrics, input derivation, reference data, control behavior, and chart scaffolding.

`src/services/comfort/charts/`
- Shared grid/contour and boundary-region engines, numeric-band validation, and Plotly-ready chart helpers.

`src/services/comfort/controls/`
- Encapsulates advanced PMV input behavior and reusable numeric control behavior.

`src/services/units/`
- Centralized SI to display-unit conversion helpers.
- Keeps canonical shared state and Explore band edges in SI units, including output-specific presentation such as Wind Chill Index heat flux.

`src/state/comfortTool/`
- Main shared controller for the application.
- Owns UI state, canonical input state, model configuration, and share-state logic.

`src/views/`
- Page-level composition only.

`public/brand-media/`
- Static media assets used by the UI.

## Key Files And Their Roles

`src/state/comfortTool/createComfortToolState.svelte.ts`
- Main controller for the tool.
- Creates canonical input state and UI state.
- Recomputes derived input view data from canonical inputs via Svelte `$derived.by()`.
- Exposes actions and selectors used by the interface.
- Tracks per-model calculation caches with explicit `empty` / `stale` / `ready` status.
- Invalidates model caches without wiping raw results and rebuilds presentation from selectors.
- Owns one transient, model-agnostic Explore working state; output or band edits rebuild charts from cached SI source data without recalculation.

`src/state/comfortTool/types.ts`
- Central type definitions for controller state, model cache state, actions, selectors, and presentation view models.

`src/state/comfortTool/modelConfigs/index.ts`
- Registry of supported comfort models.
- Connects model IDs to their model-specific definitions, including both PMV standards.

`src/state/comfortTool/modelConfigs/builder.ts`
- Fluent model-definition builder and declarative result-row helpers.
- Validates required `modes`, `chartableOutputs`, Compliance declarations, and each model's default dynamic-axis pair.

`src/models/modelCapabilities.ts`
- Defines `ChartMode`, `ModelOutputKey`, `FieldChartConfig`, functional Compliance bands, editable numeric Explore bands, output declarations, and compliance specifications.
- Provides `bandsFromThermalZones()` plus canonical-SI, array-ordered half-open (`min <= value < max`) band resolution helpers.

`src/comfortModels/pmvAshrae.ts` and `pmvIso.ts`
- Own their standard-specific PMV calculation, applicability, operative-temperature strategy, capability declaration, and independent compliance bands.
- The ISO declaration and result metadata explicitly identify ISO 7730 Category B; its Neutral `[-0.5, 0.5)` thresholds intentionally match the separate ASHRAE declaration numerically.

`src/comfortModels/pmvShared.ts`
- Owns shared PMV controls, zones, request/result DTOs, result rows, comfort-zone solving, charts, and config-builder plumbing.
- Accepts an explicit standard adapter and rejects mismatched requests or chart sources; it contains no ASHRAE/ISO selection branch.

`src/comfortModels/adaptive.ts`
- Builds separate ASHRAE 55 and EN 16798-1 Adaptive configurations.
- Declares compliance-only functional bands using the existing adaptive boundary equations.

`src/comfortModels/utci.ts`, `heatIndex.ts`, `humidex.ts`, and `windChill.ts`
- Declare Explore-only capabilities with presets derived from their existing `ThermalZone` definitions.

`src/state/comfortTool/shareState.ts`
- Owns the strict v1 share snapshot schema, serialization, deserialization, and state-apply helpers. Unsupported versions are rejected.

`src/services/comfort/referenceValues.ts`
- Adapts library-backed `met` and `clo` reference datasets into UI-ready option metadata.

`src/services/comfort/derivations/`
- Handles derived values such as dew point, humidity ratio, wet-bulb temperature, vapor pressure, operative temperature, and relative air speed transformations.

`src/services/comfort/charts/gridModelCharts.ts`
- Implements the typed grid-model strategy used by Heat Index, Humidex, and Wind Chill.
- Clones typed SI baselines, writes axes through model-owned getters/setters, invokes typed evaluators, narrows Explore config once, and assembles optional explicit-ID static charts without compatibility APIs.

`src/services/comfort/charts/dynamicAxisPayload.ts`
- Resolves declared dynamic-axis coordinates into model payloads in canonical SI.
- Uses transactional axis adapters: every probe restores the solved component in `finally`, successful solves commit once, and failed post-conditions roll back only that component.
- Preserves the independently selected Air or Radiant temperature when paired with Operative temperature, so all four directed pairs remain chartable.

`src/services/comfort/charts/chartEngine.ts`
- Shared field-chart engine used by PMV, UTCI, simple-model, and Adaptive chart strategies.
- Its Explore runner accepts raw canonical-SI model outputs and performs half-open working-band assignment. Categorical contour indices remain the default so classified outputs and gaps preserve their existing rendering.
- Smooth continuous outputs can opt into constraint contours, which retain one raw SI grid and let Plotly interpolate finite band thresholds. Constraint fills use per-region `fillcolor` without full-grid contour backgrounds. PMV ASHRAE/ISO use this strategy; other Explore charts remain categorical.
- Constraint-band hover is band-owned: `zoneGrid` derives marching-squares hit regions from the same raw grid and edges, so unfilled gaps have no hover target. No full-grid transparent hover layer or `PlotlyCanvas` classification is used.
- The banded-grid runner keeps generic hover construction as its default and accepts an explicit full-template override for models that need multiple metrics or model-specific precision.

`src/state/comfortTool/exploreChartState.ts`
- Seeds deep working copies from declared output presets, validates replacements, reconciles output changes, and builds dynamic `ExploreFieldChartConfig` values without model-specific controller branches.

`src/services/units/modelOutputs.ts`
- Central registry for output display units, precision, editor steps, and reversible SI/display conversion.

`src/services/comfort/charts/boundaryRegionEngine.ts`
- Shared boundary and filled-region scaffolding, including support for functional boundaries.

`src/services/units/index.ts`
- Centralized unit conversion helpers.
- Converts between canonical SI values and display units used by the UI.

`src/components/input-panel/InputPanel.svelte`
- Container for the input section.
- Combines controls, compare toggles, and input rows.

`src/components/input-panel/InputFieldRow.svelte`
- Renders one logical input row across one or more visible input sets.
- Handles numeric entry, presets, and advanced option menus.
- Canonical state is updated on committed number-field changes instead of every keystroke.

`src/components/input-panel/ToolControls.svelte`
- Handles model selection, compare mode, and unit-system switching.

`src/components/ResultsPanel.svelte`
- Displays calculated result sections for the currently active model.

`src/components/chart/ChartPanel.svelte`
- Displays the currently selected chart and chart selector UI.

`src/components/chart/ChartAxisMenu.svelte`, `ChartDisplayMenu.svelte`, and `ChartBandEditor.svelte`
- Compose dynamic x/y selection with declared-output selection and a draft-based threshold editor.
- The editor converts finite edges only for display, validates and sorts before atomic commit, and leaves declaration presets untouched.

`src/components/chart/PlotlyCanvas.svelte`
- Hosts the Plotly chart rendering surface.

`src/components/chart/ChartExportMenu.svelte`
- Provides chart export actions.

`src/components/ClothingEnsembleBuilder.svelte`
- Helps users estimate clothing insulation from clothing ensembles.

## Current Design Principles

- Canonical shared state is stored in SI units.
- Derived input display values are recomputed from canonical inputs instead of being stored as mutable controller state.
- Raw calculation caches are stored in SI and kept separate from result/chart presentation.
- Result sections, chart payloads, units, and tone styling are derived in selectors or presentation builders, not stored in canonical state.
- Model-specific formulas stay in `src/comfortModels/`; reusable comfort helpers stay in `src/services/comfort/`. Neither belongs in UI components or controller state.
- Library reference datasets such as metabolic tasks and clothing presets are adapted in `src/services/comfort/`.
- Views handle composition.
- Components handle rendering and interaction.
- State coordinates inputs, selections, cache invalidation, scheduling, and share-state application.
- Metadata in `src/models/` provides stable identifiers and configuration.
- Input identifiers/defaults are separated from input display/theme metadata.
- Share URLs use a strict versioned schema. The current undeployed schema is v1 and does not carry legacy migrations.
- Model modes, chartable outputs, Explore presets, and fixed compliance bands are declared in registered model definitions rather than controller branches.
- Dynamic Explore charts receive one validated `FieldChartConfig`; model files extract raw outputs while the shared engine owns classification and presentation.
- Share-state v1 intentionally stores global axes but not transient Explore output or edited bands; applying a snapshot reseeds model defaults.

## What Was Improved Recently

- Per-model caches now preserve typed raw results instead of storing `unknown` buckets and preformatted UI payloads.
- Unit switching now rebuilds result and chart presentation consistently from SI source data.
- Share-state ownership is centralized in one module with explicit version dispatch.
- Numeric input fields now commit on change/blur so blank values are not committed as `0`.
- `met` and `clo` option values now come from `jsthermalcomfort` through a comfort-service adapter instead of duplicated model data.
- Shared calculation flow remains validated through automated tests and a successful production build.
- Model capabilities are now declarative, PMV ASHRAE and ISO are separate cached models, and share snapshots use a strict v1 registry-complete schema.
- Explore dynamic charts now share output selection, editable SI working bands, default categorical contour generation, optional continuous constraint contours, and centralized output conversion.
