This document contains notes from a review of the CBE Thermal Comfort Tool from Federico.
This file is intended to be deleted after the review comments have been addressed.
While this file contains some overarching comments, I also left specific comments in the codebase using // todo tags.
Please address all comments (then delete them) and also address the following overarching comments (and then delete this file):

- There are several repetitions throughout the code and there is not a single source of truth where a model is imported. Or maybe there is, but at the same time for each model we need to initialize many different things and these are scattered around the code base, which makes it very difficult to maintain. For example, only for the PMV model we have so many files related to it: 
  - [pmv.ts](src/state/comfortTool/modelConfigs/pmv.ts)
  - [pmv.ts](src/services/comfort/pmv.ts)
  - colors are defined here [ResultsPanel.svelte](src/components/ResultsPanel.svelte)
  - the order of the models is defined here [comfortModels.ts](src/models/comfortModels.ts)
  - and there are so many more references to PMV in the codebase. This is going to make the code impossible to maintain in the long run, and it is also going to make it very difficult to add new models.
- The three thermal index models (Heat Index, Humidex, Wind Chill) share nearly identical calculator bodies. And are defined in a single file. [thermalIndices.ts](src/services/comfort/thermalIndices.ts) they should have a separate file for each model, as for the PMV, UTCI, ....
- You don't seem to be using the equation to calculate the wind chill index from Js thermal comfort but the equation seems to be defined here in the code base. This should never be done.
- types.ts defines 4 separate named cache types (PmvCalculationCache,    UtciCalculationCache, AdaptiveCalculationCache, ThermalIndicesCalculationCache) instead of one ModelCalculationCache<ResultType, ChartSourceType>. Why?
- ResultTone is a single long union type that mixes tones from all models (PMV cold/warm, UTCI stress bands, heat       index categories, wind chill zones). Every new model has to touch this union in types.ts. This is not the right approach. For each model we should define different stress categories, which are a list of strings.
- Test coverage is thin. 6 test files for 74 source files. The state layer, all model configs, and the chart builders   have no tests. The areas most likely to have subtle bugs — result section formatters, chart builders, share-state
  serialization edge cases — are untested.

Additional issues from AI review:

- helpers.ts imports ResultTone from the state layer (src/state/comfortTool/types.ts). This breaks the architecture rule that services should only depend on models, not state. ResultTone should move to src/models/ so that the import direction is correct.

- ModelCalculationCacheByModelState in types.ts was missing Humidex and WindChill entirely. The controller hid this with an "as ModelCalculationCacheByModelState" cast, meaning any access to the Humidex or WindChill cache had no type safety at all. This has been fixed inline but the root cause is still the per-model cache types — see the todo on that type.

- normalizeCompareInputIds is defined twice with the same body: once in shareState.ts and once in createComfortToolState.svelte.ts. One should be removed and the other imported.

- ThermalIndicesRequestDto and ThermalIndicesResponseDto bundle three separate models (Heat Index, Humidex, Wind Chill) into one DTO. Heat Index doesn't use wind speed, Humidex doesn't use most of the response fields, Wind Chill doesn't need relative humidity. Each model should have its own DTO once the calculation files are split.

- There are several "as any" casts in createComfortToolState.svelte.ts and calculationManager.svelte.ts. These are not defensive — they exist because the type system cannot verify calls across the per-model cache types. They will disappear once ModelCalculationCache becomes a proper generic type.

- helpers.ts mixes three very different things: zone definitions for every model (colors, labels, thresholds), pure math utilities (roundValue, ensureFiniteValue), and UI formatting helpers (formatSignedTemperature). Once models get their own files, the zone data should move with each model and only the shared math utilities should stay here.

- When adding a new model today, you need to touch at least these places: comfortModels.ts (enum, order, meta), modelConfigs/index.ts (config registry), types.ts (cache type map), createComfortToolState.svelte.ts (cache initialization), ResultsPanel.svelte (tone color map), and comfortDtos.ts (DTOs). This is too many files for one change. The goal should be that adding a model means creating one new config file and registering it in one place.

- TypeScript strict mode is turned off in tsconfig.json. For a calculation tool where passing the wrong unit (e.g. Fahrenheit where Celsius is expected) produces a silent wrong result, strict mode would catch many of these mistakes at compile time and should be enabled.