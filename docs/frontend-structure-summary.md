# Frontend structure summary

This is an internal developer reference for the Svelte 5 frontend. Product code lives under `src/`; calculations run locally, canonical state is SI, and no backend or documentation deployment is part of the application build.

See [Adding a thermal model](adding-a-thermal-model.md) for the model-authoring checklist and [AGENTS.md](../AGENTS.md) for repository execution rules.

## Source ownership

| Layer | Owns | May depend on |
|---|---|---|
| `views` | Page composition | components, state |
| `components` | Rendering and interaction | state, models, lightweight services |
| `state/comfortTool` | Rune state, keyed model memory, cache scheduling, pure projections, strict share snapshots | models, services, registered runtime definitions |
| `comfortModels` | Model declarations, calculations, results, chart evaluators, declaration-local zones | models, comfort/unit services, model builder |
| `services/comfort` | Reusable comfort logic, modifiers, controls, psychrometrics, request/axis adapters, chart engines | models |
| `services/units` | SI/display conversion and presentation precision | models |

The model registry is the intentional exception that imports registered definitions from `comfortModels`. `jsthermalcomfort` imports are restricted to `comfortModels` and `services/comfort`.

Primary entrypoints are:

```text
src/App.svelte
src/views/ComfortDashboard.svelte
src/state/comfortTool/createComfortToolState.svelte.ts
src/state/comfortTool/types.ts
```

## Model authoring and runtime definitions

Each registered model has one focused declaration entry under `src/comfortModels/`. “One declaration entry” means that its identity and product decisions are readable in one place; it does not remove the centralized stable-ID sets, explicit registry, or separate tests.

Simple models may keep calculation and chart code in the declaration file. Larger standard families use focused modules beside their declarations so formulas and chart construction are implemented once without hiding standard-specific decisions:

- PMV: ASHRAE/ISO declarations, shared builder assembly, calculation/results, and charts;
- Adaptive: ASHRAE/EN declarations, shared builder assembly, calculation/results, and charts.

`ComfortModelDefinition<Result, ChartSource, ComplianceBand = NumericBand>` is the typed authoring contract in `modelConfigs/definition.ts`. Builder setters preserve the model's result, chart-source, and Compliance-band types. Numeric-band models normally omit the third argument; models with functional band edges use `Band`. `build()` validates semantic invariants and erases those generics exactly once into `RuntimeComfortModelDefinition`.

The explicit registry is:

```ts
Record<ComfortModel, RuntimeComfortModelDefinition>
```

It owns registration and ordering only. The controller consumes runtime definitions without importing model implementations, double-casting definitions, or adding model-specific state.

Declaration-local `ThermalZone[]` values derive Explore or Compliance bands. Zones are not copied into the runtime definition, and each numeric boundary has one source.

## Canonical inputs and controls

`FieldKey` includes persisted inputs and derived/chart-only coordinates. `canonicalInputFieldOrder as const` is the narrower source of truth for persistent input state, share input records, behavior patches, modifier patches, and calculation context.

Humidity ratio and operative temperature are legal chart axes but are not canonical record members. Base input remains SI and survives model switches even when a model does not display every field.

Control behavior constructs an `InputControlViewModel` and applies numeric input. Model `optionHandlersByKey` is the only option-change path. Shared behavior is split by capability:

- `numericControl.ts` for ordinary fields and air-speed behavior;
- `temperatureControl.ts` for explicit Air/Operative support;
- `humidityControl.ts` for humidity modes, conversion, and RH synchronization.

Every model supplies complete default options and an exact parser. Missing, extra, or invalid external options are rejected; invalid internal option state is an invariant error.

## Requests, axes, and calculations

`createFieldRequestAdapter()` accepts one mapping from numeric request properties to canonical fields and returns calculation mapping plus ordinary chart-axis get/set behavior.

`createRequestAxisAdapter()` composes that mapping when charts need aliases or explicit operative-temperature behavior. PMV aliases Wind Speed to Relative Air Speed; UTCI aliases Relative Air Speed to Wind Speed. Each supplies its standard-relevant operative get/set/range rules through the adapter.

The shared dynamic-axis solver applies two coordinates as one physical constraint. For Air/Radiant/Operative pairs, it preserves the explicitly selected component and solves the coupled component instead of allowing a later write to overwrite the earlier coordinate.

Calculations receive `ModelCalculationContext`, containing effective canonical-SI inputs and only the active model's options after exact parsing. The keyed `modelOptionsByModel` record remains in controller/share state. Each definition returns typed results and a typed chart source. At controller level they are stored in generic `ModelCalculationCache<unknown, unknown>` records keyed by model ID.

## Generic input modifiers

The controller stores three separate concepts:

```text
base SI input
modifier enabled/configuration state
derived effective SI input
```

`defineInputModifier()` uses tuple generics for `extraInputs` and `affectedFields`. A callback receives complete effective input and exact complete extra inputs, and may return only a patch of its declared canonical fields. Incomplete configuration is handled at the parser/application boundary; non-finite or undeclared output is rejected.

Executable modifier definitions belong to model declarations. The global catalogue contains only stable UI/share IDs and extra-input schema. Supported definitions execute in this fixed order:

```text
Measured Air Speed -> Morning Clothing Estimate -> Dynamic Clothing -> Solar Gain
```

PMV ASHRAE and PMV ISO each declare Dynamic Clothing with their own `clo_dynamic` standard. Other models do not declare it. Dynamic Clothing has no additional user input and consumes the current effective clothing/metabolic values, so it follows Morning Clothing when both are enabled.

Modifier output never writes back to base state. Disabling any modifier therefore recomputes the effective values from base input through the remaining chain.

## Controller composition

`createComfortToolState.svelte.ts` owns rune initialization, cache invalidation, calculation scheduling, and action/selector composition. Pure logic lives beside it:

- `chartPresentation.ts` projects controls, captions, feedback, legends, and chart presentation;
- `modifierState.ts` derives effective input and handles modifier control transitions;
- `modelSwitch.ts` detects invalid target-model values and builds canonical-SI clamp patches.

These modules receive ordinary state/config/context values. There is no dependency-injection container, service class, forwarding wrapper, or model-specific controller branch.

State stays keyed by model ID: selected charts, options, chart settings, caches, results, and chart results do not grow parallel PMV/UTCI slots.

## Charts and presentation cache

Each model owns one `setCharts({ defaultId, entries })` declaration. Every `ModelChartDefinition` carries its name, empty state, axis-selection capability, optional Y lock, zone-toggle visibility, and legend visibility. There is no parallel global chart metadata registry.

Compliance and Explore share the Field Chart engine:

- Compliance reads fixed output/bands, caption, legend title, and feedback from `complianceSpec`.
- Explore reads a selected `ModelOutput` and a per-model editable working copy of numeric default bands.
- Band membership is array ordered and half open: `min <= value < max`.

Chart selection, mode, axes, baseline, Explore output/bands, unit system, and zone visibility are presentation-only. They rebuild from a ready calculation cache and do not invalidate or schedule model calculation.

The psychrometric chart clamps its drawable domain at 100% relative humidity.

## Share state

Share snapshots use one strict `version: 1` schema. Every registered model contributes its selected chart, exact options, and chart settings. Only Explore working bands are serialized; functional Compliance bands come from declarations. Infinite numeric edges use explicit wire sentinels.

The modifier records contain the exact stable modifier key set, including Dynamic Clothing. Missing or extra model, input, option, chart, band, or modifier keys are rejected. There is no migration reader, fallback, compatibility shim, or cutover path.

Adding a registered model intentionally changes the exact model key set required by a version-1 snapshot. The project has no deployed legacy snapshot compatibility requirement.

## Validation

Run the complete matrix before considering an architecture or model change complete:

```bash
npm test
npm run check
npm run lint
npm run build
npm run test:visual
git diff --check
```

The production command builds only the application entry. The files under `docs/` are maintained as internal Markdown and are neither generated nor deployed by that command.
