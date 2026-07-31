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
- Defines model IDs, chart IDs, field keys, model capability types, the minimal calculation context, field metadata, DTOs, units, and preset options.

`src/comfortModels/`
- Owns each model's controls, request mapping, calculations, results, charts, zones, and declarative capabilities.
- Contains separate `pmvAshrae.ts` (`"PMV_ASHRAE"`) and `pmvIso.ts` (`"PMV_ISO"`) declarations; shared PMV mechanics live in the non-registered `pmvShared.ts` support module.
- Contains separate `adaptiveAshrae.ts` and `adaptiveEn.ts` declarations; standard-independent Adaptive mechanics live in `adaptiveShared.ts`.
- Model requests and calculation results are canonical-SI only; calculators receive `ModelCalculationContext`, not controller state.

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
- Owns `chartSettingsByModel`, where every model independently remembers mode, axes, baseline, and its optional Explore output/working bands.
- Builds one `ChartControlsViewModel`; selecting a mode, chart, axes, baseline, output, or working bands changes presentation only and preserves the ready cache and result identities.
- Resolves hidden or unavailable remembered baselines to Input 1 for presentation without erasing the per-model selection.

`src/state/comfortTool/types.ts`
- Central type definitions for controller state, model cache state, actions, selectors, and presentation view models.

`src/state/comfortTool/modelConfigs/index.ts`
- Registry of supported comfort models.
- Connects model IDs to their model-specific definitions, including both PMV standards.

`src/state/comfortTool/modelConfigs/builder.ts`
- Fluent model-definition builder and declarative result-row helpers.
- Validates capabilities plus required metadata, chart declarations, calculation/presentation functions, and dynamic-axis defaults, then returns a configuration snapshot with copied arrays and records.

`src/models/modelCapabilities.ts`
- Defines `ChartMode`, `ModelOutputKey`, `NumericFieldChartConfig`, numeric and functional Compliance chart contracts, `FieldChartConfig`, `ChartBuildContext`, editable numeric Explore bands, output declarations, and generic compliance specifications with captions and result feedback.
- Provides `bandsFromThermalZones()` plus canonical-SI, array-ordered half-open (`min <= value < max`) band resolution helpers.

`src/models/comfortDtos.ts`
- Defines the shared `ModelChartSourceDto<TRequest>` `{ inputs }` contract. Simple models, UTCI, and Adaptive use it directly; PMV extends it with per-input comfort-zone data.

`src/models/modelCalculation.ts`
- Defines the readonly calculation boundary exposed to models: canonical-SI `inputsByInput` and `modelOptionsByModel` only.

`src/comfortModels/pmvAshrae.ts` and `pmvIso.ts`
- Own their standard-specific PMV calculation, applicability, operative-temperature strategy, capability declaration, and independent compliance bands.
- The ISO declaration and result metadata explicitly identify ISO 7730 Category B; its Neutral `[-0.5, 0.5)` thresholds intentionally match the separate ASHRAE declaration numerically.

`src/comfortModels/pmvShared.ts`
- Owns shared PMV controls, zones, request/result DTOs, result rows, comfort-zone solving, charts, and config-builder plumbing.
- Accepts an explicit SI standard adapter; requests and chart sources do not repeat standard or model identity, and shared mechanics contain no ASHRAE/ISO selection branch.

`src/comfortModels/adaptiveAshrae.ts`, `adaptiveEn.ts`, and `adaptiveShared.ts`
- Each standard declaration explicitly owns `modes`, `chartableOutputs`, `complianceSpec`, coefficients, zones, calculator adapters, and an independently generated functional band array.
- Shared mechanics accept a boundary definition containing only levels, coefficients, and band sequence, then own request mapping, chart construction, and config-builder plumbing without standard-mode branches.

`src/comfortModels/utci.ts`, `heatIndex.ts`, `humidex.ts`, and `windChill.ts`
- Declare Explore-only capabilities with presets derived from their existing `ThermalZone` definitions.

`src/state/comfortTool/shareState.ts`
- Owns the strict v1 share snapshot schema, serialization, deserialization, and state-apply helpers.
- Stores selected chart, options, and `{ mode, xAxis, yAxis, baselineInputId, explore }` inside every model snapshot. Compliance bands are never serialized; Explore `±Infinity` edges use explicit wire sentinels.
- Rejects unsupported versions, the previous v1 shape, invalid model/mode/axis/output/band/baseline values, and incomplete registry snapshots without migration or apply-time normalization.

`src/services/comfort/referenceValues.ts`
- Adapts library-backed `met` and `clo` reference datasets into UI-ready option metadata.

`src/services/comfort/derivations/`
- Handles derived values such as dew point, humidity ratio, wet-bulb temperature, vapor pressure, operative temperature, and relative air speed transformations.

`src/services/comfort/charts/gridModelCharts.ts`
- Implements the declarative typed adapter used by Heat Index, Humidex, and Wind Chill.
- Clones typed SI baselines, writes axes through model-owned getters/setters, invokes typed evaluators, and maps fixed and dynamic declarations into the shared field-chart frame.

`src/services/comfort/charts/dynamicAxisPayload.ts`
- Resolves declared dynamic-axis coordinates into model payloads in canonical SI.
- Solves the current linear coupled-axis contract from the two endpoint values, rejecting non-finite, zero-slope, out-of-range, or failed post-condition results.
- Uses transactional axis adapters: endpoint probes restore the solved component in `finally`, successful solves commit once, and failed final commits roll back that component.
- Preserves the independently selected Air or Radiant temperature when paired with Operative temperature, so all four directed pairs remain chartable.

`src/services/comfort/charts/chartEngine.ts`
- Exposes `buildFieldChart()` as the single chart-assembly entry point used by PMV, UTCI, simple-model, and Adaptive charts.
- Accepts a discriminated Grid or Boundary strategy. `createBandedGridStrategy()` and `createZoneGridStrategy()` supply the two reusable Grid renderers without exposing the internal grid or zone modules to model files.
- Creates display axes from canonical-SI axis specs, then assembles traces in a fixed order: strategy traces, chart overlays, per-input overlays, and input markers.
- Fixed auxiliary views reuse the same axis, grid, band, input, layout, legend, and annotation primitives, but remain mode-free. Only Dynamic FieldCharts consume Compliance or Explore state.
- Grid evaluators return an explicit unplottable `null`; unexpected exceptions propagate to the caller.
- The banded Grid strategy accepts one validated `NumericFieldChartConfig`, evaluates raw canonical-SI model outputs, and performs half-open working-band assignment without repeating state or builder validation. Numeric Compliance configs use the same strategy, while Adaptive retains functional `Band` edges in the general Compliance contract.
- Smooth continuous outputs can opt into constraint contours, which retain one raw SI grid and let Plotly interpolate finite band thresholds. Constraint fills use per-region `fillcolor` without full-grid contour backgrounds. PMV ASHRAE/ISO use this strategy; other Explore charts remain categorical.
- Visible categorical and constraint traces skip hover. One transparent contour tooltip trace owns full per-position metadata from the original output grid: band gaps report `Unclassified`, while model-invalid `NaN` cells have no hover.
- The banded-grid runner keeps generic hover construction as its default and accepts an explicit full-template override for models that need multiple metrics or model-specific precision.

`src/state/comfortTool/fieldChartState.ts`
- Seeds each model's default mode and chart settings, owns independent Explore working copies, validates replacements and mode changes, and builds either a locked Compliance config or an editable Explore config without model-specific controller branches.

`src/services/units/modelOutputs.ts`
- Central registry for output display units, precision, editor steps, and reversible SI/display conversion.

`src/services/comfort/charts/boundaryRegionEngine.ts`
- Produces boundary and filled-region traces, including functional boundaries with an explicit variable-axis direction; chart assembly remains in `buildFieldChart()`.

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
- Displays the currently selected chart. Dynamic FieldCharts compose their mode caption, feedback, and capability-driven controls from one `ChartControlsViewModel`; fixed auxiliary views receive no mode or field controls.

`src/components/chart/ChartModeControl.svelte`, `ChartControls.svelte`, `ChartDisplayMenu.svelte`, and `ChartBandEditor.svelte`
- `ChartModeControl` renders a keyboard-operable `Compliance | Explore` segmented control only for dual-mode models, otherwise a single-mode caption. Compliance feedback includes baseline-aware text plus pass/fail/out-of-range icons.
- `ChartControls` renders non-null baseline and axes for dynamic charts, and renders Display plus threshold editing only for Explore; its X/Y dropdowns share one Svelte snippet and every branch callback is required.
- `ChartDisplayMenu` and `ChartBandEditor` retain their focused output-selection and draft-based threshold-editing responsibilities.
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
- `src/models/` owns stable identifiers and cross-model metadata; each registered model declaration owns its label, description, capabilities, and standard-specific metadata.
- Input identifiers/defaults are separated from input display/theme metadata.
- Share URLs use a strict registry-complete v1 schema with explicit version rejection and no compatibility path for the previous v1 shape.
- Model modes, chartable outputs, Explore presets, and Compliance bands are declared in registered model definitions rather than controller branches.
- Every chart builder receives one `ChartBuildContext`; chart-source DTOs contain calculation-derived data rather than axes, baseline selection, model identity, standards, or duplicate results.
- Dynamic FieldCharts receive the active validated `FieldChartConfig` and are the only Compliance/Explore mode surface. Fixed numeric-grid views build a mode-free local `NumericFieldChartConfig` while reusing the shared rendering primitives; model files still extract raw SI outputs while the shared engine owns axes, classification, conversion, trace ordering, input markers, legends, layout, and annotations.
- Mode, chart, axis, baseline, Explore output, and working-band changes synchronously rebuild presentation from the current ready cache without invalidating or rescheduling model calculations.
- Model request DTOs and calculators are SI-only. IP values exist in `src/services/units/` and presentation output.
- Calculation scheduling exposes only canonical inputs and model options through `ModelCalculationContext`; comfort models do not import full controller state.
- Share-state v1 stores mode, axes, baseline, and Explore output/working bands per model. Applying a parsed snapshot restores those values exactly and never serializes declaration-owned Compliance bands.

## What Was Improved Recently

- Each model definition keeps its concrete result and chart-source types. The controller registry deliberately stores them as `ModelCalculationCache<unknown, unknown>` because controller orchestration does not inspect model-specific payloads; raw SI data remains separate from preformatted presentation.
- Unit switching now rebuilds result and chart presentation consistently from SI source data.
- Share-state ownership is centralized in one strict v1 parser and codec.
- Numeric input fields now commit on change/blur so blank values are not committed as `0`.
- `met` and `clo` option values now come from `jsthermalcomfort` through a comfort-service adapter instead of duplicated model data.
- Shared calculation flow remains validated through automated tests and a successful production build.
- Model capabilities are now declarative, PMV ASHRAE and ISO are separate cached models, and share snapshots use a strict v1 registry-complete schema.
- Explore dynamic charts now share output selection, editable SI working bands, default categorical contour generation, optional continuous constraint contours, and centralized output conversion.
- Compliance is now a locked configuration of the same Dynamic FieldChart engine, with per-model mode/settings memory, accessible segmented controls, captions, and baseline-specific feedback. Mode-capable models enter that Dynamic surface by default; fixed auxiliary views remain selectable without presenting inert mode UI.
