import { describe, expect, it } from "vitest";

import {
  ModelId,
  type ModelId as ModelIdType,
} from "../../models/comfortModels";
import {
  PhysicalQuantityId,
  primaryInputOrder,
} from "../../models/physicalQuantities";
import { PhsQuantityId } from "../../models/phs";
import { InputControlId } from "../../models/inputControls";
import {
  AirSpeedControlMode,
  HumidityInputMode,
  OptionKey,
  TemperatureMode,
} from "../../models/inputModes";
import { ModifierId, modifierOrder } from "../../models/inputModifiers";
import { InputId } from "../../models/inputSlots";
import { ModelOutputKey } from "../../models/modelCapabilities";

import { UnitSystem } from "../../models/units";
import { WorkspaceId } from "../../models/workspaces";
import { createAnalysisState } from "./createComfortToolState.svelte";
import { FieldChartProfileKind } from "../../models/output/fieldChartProfile";
import {
  applyShareSnapshotToState,
  buildShareUrl,
  createShareStateSnapshot,
  deserializeShareState,
  parseShareStateSnapshot,
  readShareStateFromUrl,
  serializeShareState,
  type ShareStateSnapshot,
} from "./shareState";

function decodeShareWire(encoded: string): Record<string, unknown> {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const binary = globalThis.atob(`${normalized}${"=".repeat(paddingLength)}`);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

function withOutputSettings(
  snapshot: ShareStateSnapshot,
  modelId: ModelIdType,
  patch: Record<string, unknown>,
): unknown {
  return {
    ...snapshot,
    models: {
      ...snapshot.models,
      [modelId]: {
        ...snapshot.models[modelId],
        outputSettings: {
          ...snapshot.models[modelId].outputSettings,
          ...patch,
        },
      },
    },
  };
}

function withModelOptions(
  snapshot: ShareStateSnapshot,
  modelId: ModelIdType,
  options: unknown,
): unknown {
  return {
    ...snapshot,
    models: {
      ...snapshot.models,
      [modelId]: {
        ...snapshot.models[modelId],
        options,
      },
    },
  };
}

describe("shareState strict v1 codec", () => {
  it("round-trips enabled, disabled-but-configured, unset, and per-input modifier state", () => {
    const toolState = createAnalysisState();
    toolState.state.auxiliaryQuantitiesByInput[InputId.Input1][
      PhysicalQuantityId.ModifierMeasuredAirSpeed
    ] = 0.6;
    toolState.state.activeModifiersByInput[InputId.Input1][
      ModifierId.MeasuredAirSpeed
    ] = true;
    toolState.state.auxiliaryQuantitiesByInput[InputId.Input2][
      PhysicalQuantityId.ModifierMorningOutdoorTemperature
    ] = 10;
    toolState.state.activeModifiersByInput[InputId.Input2][
      ModifierId.DynamicClothing
    ] = true;
    Object.assign(toolState.state.auxiliaryQuantitiesByInput[InputId.Input3], {
      [PhysicalQuantityId.ModifierSolarAltitude]: 45,
      [PhysicalQuantityId.ModifierSolarHorizontalAngle]: 90,
      [PhysicalQuantityId.ModifierDirectSolarRadiation]: 800,
      [PhysicalQuantityId.ModifierSolarTransmittance]: 0.5,
      [PhysicalQuantityId.ModifierSkyVaultViewFraction]: 0.5,
      [PhysicalQuantityId.ModifierBodyExposureFraction]: 0.5,
    });
    toolState.state.activeModifiersByInput[InputId.Input3][
      ModifierId.SolarGain
    ] = true;

    const snapshot = createShareStateSnapshot(toolState.state);
    const restored = deserializeShareState(serializeShareState(snapshot));

    expect(Object.keys(snapshot.quantitiesByInput[InputId.Input1])).toEqual(
      primaryInputOrder,
    );
    expect(
      Object.keys(snapshot.activeModifiersByInput[InputId.Input1]),
    ).toEqual(modifierOrder);
    expect(
      snapshot.activeModifiersByInput[InputId.Input1][
        ModifierId.MeasuredAirSpeed
      ],
    ).toBe(true);
    expect(
      snapshot.activeModifiersByInput[InputId.Input2][
        ModifierId.MorningClothingEstimate
      ],
    ).toBe(false);
    expect(
      snapshot.activeModifiersByInput[InputId.Input2][
        ModifierId.DynamicClothing
      ],
    ).toBe(true);
    expect(
      snapshot.auxiliaryQuantitiesByInput[InputId.Input2],
    ).not.toHaveProperty(PhysicalQuantityId.ModifierMeasuredAirSpeed);
    expect(
      snapshot.auxiliaryQuantitiesByInput[InputId.Input2][
        PhysicalQuantityId.ModifierMorningOutdoorTemperature
      ],
    ).toBe(10);
    expect(
      snapshot.auxiliaryQuantitiesByInput[InputId.Input2],
    ).not.toHaveProperty(PhysicalQuantityId.ModifierSolarAltitude);
    expect(restored).toEqual(snapshot);
  });

  it("round-trips a changed PHS quantity only under modelInputsByModel", () => {
    const toolState = createAnalysisState();
    expect(
      toolState.actions.updateModelQuantity(
        ModelId.Phs2023,
        PhsQuantityId.BodyWeight,
        90,
      ),
    ).toBe(true);

    const snapshot = createShareStateSnapshot(toolState.state);

    expect(snapshot.modelInputsByModel[ModelId.Phs2023]).toEqual({
      [PhsQuantityId.BodyWeight]: 90,
    });
    expect(
      snapshot.modelInputsByModel[ModelId.Phs2023],
    ).not.toHaveProperty(PhsQuantityId.Height);
    expect(snapshot.modelInputsByModel[ModelId.PmvAshrae]).toEqual({});
    expect(
      decodeShareWire(serializeShareState(snapshot)).modelInputsByModel,
    ).toEqual({
      [ModelId.Phs2023]: { [PhsQuantityId.BodyWeight]: 90 },
    });
    expect(Object.keys(snapshot.quantitiesByInput[InputId.Input1])).toEqual([
      ...primaryInputOrder,
    ]);
    expect(snapshot.quantitiesByInput[InputId.Input1]).not.toHaveProperty(
      PhsQuantityId.BodyWeight,
    );

    const restored = deserializeShareState(serializeShareState(snapshot));
    expect(restored?.modelInputsByModel[ModelId.Phs2023]).toEqual({
      [PhsQuantityId.BodyWeight]: 90,
    });
    expect(restored?.quantitiesByInput[InputId.Input1]).not.toHaveProperty(
      PhsQuantityId.BodyWeight,
    );
  });

  it("round-trips all per-model field settings and explicit Infinity edges", () => {
    const toolState = createAnalysisState();
    toolState.state.ui.selectedModel = ModelId.PmvIso;
    toolState.state.ui.selectedChartInstanceByModel[ModelId.PmvAshrae] =
      "pmv-ashrae-psychrometric";
    toolState.state.ui.selectedChartInstanceByModel[ModelId.PmvIso] =
      "pmv-iso-dynamic-field";
    toolState.state.ui.unitSystem = UnitSystem.IP;
    toolState.state.ui.modelOptionsByModel[ModelId.PmvIso][
      OptionKey.TemperatureMode
    ] = TemperatureMode.Operative;
    toolState.state.quantitiesByInput[InputId.Input1][
      PhysicalQuantityId.ClothingInsulation
    ] = 2;

    const ashrae =
      toolState.state.ui.outputSettingsByModel[ModelId.PmvAshrae];
    ashrae.xAxis = PhysicalQuantityId.MeanRadiantTemperature;
    ashrae.yAxis = PhysicalQuantityId.RelativeHumidity;
    ashrae.baselineInputId = InputId.Input3;
    ashrae.exploreOutput = ModelOutputKey.Ppd;
    ashrae.exploreBands = [
      { min: -Infinity, max: 12, label: "Preferred", color: "#0f0" },
      { min: 12, max: Infinity, label: "Other", color: "#f00" },
    ];

    const iso = toolState.state.ui.outputSettingsByModel[ModelId.PmvIso];
    iso.xAxis = PhysicalQuantityId.OperativeTemperature;
    iso.yAxis = PhysicalQuantityId.RelativeAirSpeed;
    iso.baselineInputId = InputId.Input2;

    const snapshot = createShareStateSnapshot(toolState.state);
    const restored = deserializeShareState(serializeShareState(snapshot));

    expect(snapshot.version).toBe(1);
    expect(snapshot).not.toHaveProperty("dynamicXAxis");
    expect(snapshot).not.toHaveProperty("dynamicYAxis");
    expect(
      snapshot.models[ModelId.PmvAshrae].selectedChartInstanceId,
    ).toBe("pmv-ashrae-psychrometric");
    expect(
      restored?.models[ModelId.PmvAshrae].selectedChartInstanceId,
    ).toBe("pmv-ashrae-psychrometric");
    expect(restored?.models[ModelId.PmvIso].selectedChartInstanceId).toBe(
      "pmv-iso-dynamic-field",
    );
    expect(snapshot.models[ModelId.PmvIso].options).not.toHaveProperty(
      OptionKey.AirSpeedControlMode,
    );
    expect(snapshot.models[ModelId.PmvAshrae].outputSettings).toEqual(
      expect.objectContaining({
        xAxis: PhysicalQuantityId.MeanRadiantTemperature,
        yAxis: PhysicalQuantityId.RelativeHumidity,
        baselineInputId: InputId.Input3,
        exploreOutput: ModelOutputKey.Ppd,
      }),
    );
    expect(snapshot.models[ModelId.PmvIso].outputSettings).toEqual(
      expect.objectContaining({
        xAxis: PhysicalQuantityId.OperativeTemperature,
        baselineInputId: InputId.Input2,
      }),
    );
    expect(restored).toEqual(snapshot);
    expect(
      restored?.models[ModelId.PmvAshrae].outputSettings.exploreBands?.[0]
        .min,
    ).toBe(-Infinity);
    expect(
      restored?.models[ModelId.PmvAshrae].outputSettings.exploreBands?.[1]
        .max,
    ).toBe(Infinity);
  });

  it("preserves both PHS chart IDs in strict v1 snapshots", () => {
    const toolState = createAnalysisState();
    toolState.state.ui.selectedModel = ModelId.Phs2023;
    toolState.actions.setActiveWorkspace(WorkspaceId.Explore);
    toolState.actions.setSelectedChartInstance("phs-dynamic-field");
    toolState.actions.setExploreOutput(ModelOutputKey.PhsWaterLoss);

    const dynamicSnapshot = createShareStateSnapshot(toolState.state);
    expect(dynamicSnapshot.version).toBe(1);
    expect(deserializeShareState(serializeShareState(dynamicSnapshot))).toEqual(
      dynamicSnapshot,
    );
    expect(
      dynamicSnapshot.models[ModelId.Phs2023].selectedChartInstanceId,
    ).toBe("phs-dynamic-field");

    toolState.actions.setSelectedChartInstance("phs-exposure-history");
    const historySnapshot = createShareStateSnapshot(toolState.state);
    expect(
      historySnapshot.models[ModelId.Phs2023].selectedChartInstanceId,
    ).toBe("phs-exposure-history");
    expect(
      historySnapshot.models[ModelId.Phs2023].outputSettings.exploreOutput,
    ).toBe(ModelOutputKey.PhsRectalTemperature);
    expect(deserializeShareState(serializeShareState(historySnapshot))).toEqual(
      historySnapshot,
    );

    const incompatible = structuredClone(historySnapshot);
    incompatible.models[ModelId.Phs2023].outputSettings.exploreOutput =
      ModelOutputKey.PhsWaterLoss;
    expect(parseShareStateSnapshot(incompatible)).toBeNull();
  });

  it("round-trips built-in and edited UTF-8 labels through the codec and URL", () => {
    const toolState = createAnalysisState();
    toolState.actions.setActiveWorkspace(WorkspaceId.Explore);
    toolState.actions.setExploreOutput(ModelOutputKey.Ppd);

    const builtInSnapshot = createShareStateSnapshot(toolState.state);
    const builtInBands =
      builtInSnapshot.models[ModelId.PmvAshrae].outputSettings
        .exploreBands;
    expect(builtInBands?.[1].label).toContain("≥");
    expect(deserializeShareState(serializeShareState(builtInSnapshot))).toEqual(
      builtInSnapshot,
    );

    expect(
      toolState.actions.setExploreBands([
        {
          min: -Infinity,
          max: 10,
          label: "舒适区 ✅",
          color: "#86efac",
        },
        {
          min: 10,
          max: Infinity,
          label: "偏高 🥵（≥ 10%）",
          color: "#fca5a5",
        },
      ]),
    ).toBe(true);
    const editedSnapshot = createShareStateSnapshot(toolState.state);
    const url = buildShareUrl(
      editedSnapshot,
      "https://example.test/comfort?existing=1#results",
    );
    const restored = readShareStateFromUrl(url);

    expect(restored).toEqual(editedSnapshot);
    expect(
      restored?.models[ModelId.PmvAshrae].outputSettings.exploreBands?.map(
        ({ label }) => label,
      ),
    ).toEqual(["舒适区 ✅", "偏高 🥵（≥ 10%）"]);
  });

  it("round-trips both Adaptive models and a transposed axis direction", () => {
    const toolState = createAnalysisState();
    toolState.state.ui.selectedModel = ModelId.AdaptiveAshrae;
    toolState.actions.setDynamicXAxis(PhysicalQuantityId.OperativeTemperature);
    const snapshot = createShareStateSnapshot(toolState.state);
    const restored = deserializeShareState(serializeShareState(snapshot));

    expect(snapshot.models[ModelId.AdaptiveAshrae]).toEqual(
      expect.objectContaining({
        selectedChartInstanceId: "adaptive-ashrae-boundary",
        outputSettings: expect.objectContaining({
          xAxis: PhysicalQuantityId.OperativeTemperature,
          yAxis: PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
          exploreOutput: null,
          exploreBands: null,
        }),
      }),
    );
    expect(snapshot.models[ModelId.AdaptiveEn]).toEqual(
      expect.objectContaining({
        selectedChartInstanceId: "adaptive-en-boundary",
        outputSettings: expect.objectContaining({
          xAxis: PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
          yAxis: PhysicalQuantityId.OperativeTemperature,
          exploreOutput: null,
          exploreBands: null,
        }),
      }),
    );
    expect(restored?.models[ModelId.AdaptiveAshrae]).toEqual(
      snapshot.models[ModelId.AdaptiveAshrae],
    );
    expect(restored?.models[ModelId.AdaptiveEn]).toEqual(
      snapshot.models[ModelId.AdaptiveEn],
    );
  });

  it("rejects invalid Base64URL and malformed UTF-8 bytes", () => {
    const malformedUtf8 = globalThis
      .btoa(String.fromCharCode(0xc3, 0x28))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    expect(deserializeShareState("%%%")).toBeNull();
    expect(deserializeShareState("A")).toBeNull();
    expect(deserializeShareState(malformedUtf8)).toBeNull();
  });

  it("applies a complete snapshot without reseeding any model settings", () => {
    const original = createAnalysisState();
    original.state.ui.compareEnabled = true;
    original.state.ui.compareInputIds = [InputId.Input1, InputId.Input3];
    original.state.ui.activeInputId = InputId.Input3;
    original.state.ui.unitSystem = UnitSystem.IP;
    original.state.ui.outputSettingsByModel[ModelId.Utci].xAxis =
      PhysicalQuantityId.WindSpeed;
    original.state.ui.outputSettingsByModel[ModelId.Utci].yAxis =
      PhysicalQuantityId.MeanRadiantTemperature;
    original.state.ui.activeWorkspace = WorkspaceId.Explore;
    original.state.ui.outputSettingsByModel[
      ModelId.PmvIso
    ].baselineInputId = InputId.Input3;

    const snapshot = createShareStateSnapshot(original.state);
    const restored = createAnalysisState();
    applyShareSnapshotToState(restored.state, snapshot);

    expect(createShareStateSnapshot(restored.state)).toEqual(snapshot);
    expect(
      restored.state.ui.outputSettingsByModel[ModelId.PmvIso]
        .baselineInputId,
    ).toBe(InputId.Input3);
    expect(restored.state.ui.compareInputIds).toEqual([
      InputId.Input1,
      InputId.Input3,
    ]);
    expect(restored.state.ui.activeInputId).toBe(InputId.Input3);
  });

  it.each(Object.values(ModelId))(
    "rejects non-object and unknown-key options for %s",
    (modelId) => {
      const current = createShareStateSnapshot(createAnalysisState().state);

      expect(
        parseShareStateSnapshot(withModelOptions(current, modelId, null)),
      ).toBeNull();
      expect(
        parseShareStateSnapshot(withModelOptions(current, modelId, [])),
      ).toBeNull();
      expect(
        parseShareStateSnapshot(
          withModelOptions(current, modelId, {
            ...current.models[modelId].options,
            unknown: "value",
          }),
        ),
      ).toBeNull();
    },
  );

  it.each([
    ModelId.PmvAshrae,
    ModelId.PmvIso,
    ModelId.Utci,
    ModelId.AdaptiveAshrae,
    ModelId.AdaptiveEn,
  ] as const)(
    "rejects missing, empty, and invalid-enum options for %s",
    (modelId) => {
      const current = createShareStateSnapshot(createAnalysisState().state);
      const options = { ...current.models[modelId].options } as Record<
        string,
        string
      >;
      const [firstKey] = Object.keys(options);
      const missingKeyOptions = { ...options };
      delete missingKeyOptions[firstKey];

      expect(
        parseShareStateSnapshot(
          withModelOptions(current, modelId, missingKeyOptions),
        ),
      ).toBeNull();
      expect(
        parseShareStateSnapshot(withModelOptions(current, modelId, {})),
      ).toBeNull();
      expect(
        parseShareStateSnapshot(
          withModelOptions(current, modelId, {
            ...options,
            [firstKey]: "invalid-enum-value",
          }),
        ),
      ).toBeNull();
    },
  );

  it("rejects the unsupported occupant-control option for ISO PMV", () => {
    const current = createShareStateSnapshot(createAnalysisState().state);

    expect(
      parseShareStateSnapshot(
        withModelOptions(current, ModelId.PmvIso, {
          ...current.models[ModelId.PmvIso].options,
          [OptionKey.AirSpeedControlMode]: AirSpeedControlMode.WithLocalControl,
        }),
      ),
    ).toBeNull();
  });

  it.each([
    ModelId.HeatIndex,
    ModelId.Humidex,
    ModelId.WindChill,
  ] as const)(
    "accepts only the exact empty options object for %s",
    (modelId) => {
      const current = createShareStateSnapshot(createAnalysisState().state);

      expect(
        parseShareStateSnapshot(withModelOptions(current, modelId, {})),
      ).not.toBeNull();
      expect(
        parseShareStateSnapshot(
          withModelOptions(current, modelId, {
            [OptionKey.TemperatureMode]: TemperatureMode.Air,
          }),
        ),
      ).toBeNull();
    },
  );

  it("rejects non-canonical compare IDs and inconsistent active inputs", () => {
    const current = createShareStateSnapshot(createAnalysisState().state);
    const comparing = {
      ...current,
      compareEnabled: true,
      compareInputIds: [InputId.Input1, InputId.Input2],
      activeInputId: InputId.Input2,
    };

    expect(
      parseShareStateSnapshot({
        ...comparing,
        compareInputIds: [InputId.Input1, InputId.Input2, InputId.Input2],
      }),
    ).toBeNull();
    expect(
      parseShareStateSnapshot({
        ...comparing,
        compareInputIds: [InputId.Input2, InputId.Input1],
      }),
    ).toBeNull();
    expect(
      parseShareStateSnapshot({
        ...comparing,
        compareInputIds: [InputId.Input2],
      }),
    ).toBeNull();
    expect(
      parseShareStateSnapshot({
        ...comparing,
        compareInputIds: [InputId.Input1, InputId.Input3],
        activeInputId: InputId.Input2,
      }),
    ).toBeNull();
    expect(
      parseShareStateSnapshot({
        ...current,
        compareEnabled: false,
        activeInputId: InputId.Input2,
      }),
    ).toBeNull();
  });

  it("rejects unknown versions and unknown current-schema fields", () => {
    const current = createShareStateSnapshot(createAnalysisState().state);
    expect(parseShareStateSnapshot({ ...current, version: 2 })).toBeNull();
    expect(parseShareStateSnapshot({ ...current, version: 999 })).toBeNull();
    expect(parseShareStateSnapshot({ ...current, unknown: true })).toBeNull();
    expect(
      parseShareStateSnapshot({
        ...current,
        models: {
          ...current.models,
          [ModelId.AdaptiveAshrae]: {
            ...current.models[ModelId.AdaptiveAshrae],
            unknown: true,
          },
        },
      }),
    ).toBeNull();
    expect(
      parseShareStateSnapshot(
        withOutputSettings(current, ModelId.AdaptiveAshrae, {
          unknown: true,
        }),
      ),
    ).toBeNull();

    const oldShape = { ...current } as Record<string, unknown>;
    delete oldShape.activeModifiersByInput;
    delete oldShape.auxiliaryQuantitiesByInput;
    delete oldShape.modelInputsByModel;
    expect(parseShareStateSnapshot(oldShape)).toBeNull();

    expect(
      parseShareStateSnapshot(
        withModelOptions(current, ModelId.PmvAshrae, {
          ...current.models[ModelId.PmvAshrae].options,
          "airSpeed.inputMode": "relative",
        }),
      ),
    ).toBeNull();
  });

  it("strictly validates modifier keys, ranges, and enabled completeness", () => {
    const current = createShareStateSnapshot(createAnalysisState().state);
    const incomplete = structuredClone(current);
    incomplete.activeModifiersByInput[InputId.Input1][ModifierId.SolarGain] =
      true;

    const outOfRange = structuredClone(current);
    outOfRange.auxiliaryQuantitiesByInput[InputId.Input1][
      PhysicalQuantityId.ModifierSolarAltitude
    ] = 91;

    const unknownModifier = structuredClone(current);
    Object.assign(unknownModifier.activeModifiersByInput[InputId.Input1], {
      unknownModifier: false,
    });

    const unknownField = structuredClone(current);
    Object.assign(unknownField.auxiliaryQuantitiesByInput[InputId.Input1], {
      unknownField: 1,
    });

    const missingDynamicActiveKey = structuredClone(current);
    Reflect.deleteProperty(
      missingDynamicActiveKey.activeModifiersByInput[InputId.Input1],
      ModifierId.DynamicClothing,
    );

    const missingAuxiliaryInput = structuredClone(current);
    Reflect.deleteProperty(
      missingAuxiliaryInput.auxiliaryQuantitiesByInput,
      InputId.Input1,
    );

    const unknownModelInput = structuredClone(current);
    Object.assign(
      unknownModelInput.modelInputsByModel[ModelId.PmvAshrae],
      { [PhsQuantityId.BodyWeight]: 80 },
    );

    const nonFinite = structuredClone(current);
    nonFinite.auxiliaryQuantitiesByInput[InputId.Input1][
      PhysicalQuantityId.ModifierMeasuredAirSpeed
    ] = Infinity;

    expect(parseShareStateSnapshot(incomplete)).toBeNull();
    expect(parseShareStateSnapshot(outOfRange)).toBeNull();
    expect(parseShareStateSnapshot(unknownModifier)).toBeNull();
    expect(parseShareStateSnapshot(unknownField)).toBeNull();
    expect(parseShareStateSnapshot(missingDynamicActiveKey)).toBeNull();
    expect(parseShareStateSnapshot(missingAuxiliaryInput)).toBeNull();
    expect(parseShareStateSnapshot(unknownModelInput)).toBeNull();
    expect(parseShareStateSnapshot(nonFinite)).toBeNull();
  });

  it("strictly validates output settings axes, output, bands, and baseline", () => {
    const current = createShareStateSnapshot(createAnalysisState().state);

    expect(
      parseShareStateSnapshot(
        withOutputSettings(current, ModelId.AdaptiveAshrae, {
          profileKind: FieldChartProfileKind.Explore,
        }),
      ),
    ).toBeNull();
    expect(
      parseShareStateSnapshot(
        withOutputSettings(current, ModelId.AdaptiveAshrae, {
          xAxis: PhysicalQuantityId.DryBulbTemperature,
          yAxis: PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
        }),
      ),
    ).toBeNull();
    expect(
      parseShareStateSnapshot(
        withOutputSettings(current, ModelId.PmvAshrae, {
          xAxis: PhysicalQuantityId.DryBulbTemperature,
          yAxis: PhysicalQuantityId.DryBulbTemperature,
        }),
      ),
    ).toBeNull();
    expect(
      parseShareStateSnapshot(
        withOutputSettings(current, ModelId.PmvAshrae, {
          explore: {
            zOutput: ModelOutputKey.Utci,
            bands:
              current.models[ModelId.PmvAshrae].outputSettings
                .exploreBands,
          },
        }),
      ),
    ).toBeNull();
    expect(
      parseShareStateSnapshot(
        withOutputSettings(current, ModelId.PmvAshrae, {
          explore: {
            zOutput: ModelOutputKey.Pmv,
            bands: [
              { min: 0, max: 2, label: "One", color: "#000" },
              { min: 1, max: 3, label: "Two", color: "#fff" },
            ],
          },
        }),
      ),
    ).toBeNull();
    expect(
      parseShareStateSnapshot(
        withOutputSettings(current, ModelId.PmvAshrae, {
          baselineInputId: "not-an-input",
        }),
      ),
    ).toBeNull();
    expect(
      parseShareStateSnapshot(
        withOutputSettings(current, ModelId.PmvAshrae, { explore: null }),
      ),
    ).toBeNull();
  });

  it("rejects legacy chart wire keys selectedChart, chartSettings, and outputSettings.mode", () => {
    const current = createShareStateSnapshot(createAnalysisState().state);

    const legacySelectedChart = {
      ...current,
      models: {
        ...current.models,
        [ModelId.PmvAshrae]: {
          options: current.models[ModelId.PmvAshrae].options,
          outputSettings: current.models[ModelId.PmvAshrae].outputSettings,
          selectedChart: "pmv-ashrae-dynamic-field",
        },
      },
    };

    const legacyChartSettings = {
      ...current,
      models: {
        ...current.models,
        [ModelId.PmvAshrae]: {
          ...current.models[ModelId.PmvAshrae],
          chartSettings: current.models[ModelId.PmvAshrae].outputSettings,
        },
      },
    };

    expect(
      parseShareStateSnapshot(
        withOutputSettings(current, ModelId.PmvAshrae, {
          mode: FieldChartProfileKind.Explore,
        }),
      ),
    ).toBeNull();
    expect(
      parseShareStateSnapshot(
        withOutputSettings(current, ModelId.PmvAshrae, {
          profileKind: FieldChartProfileKind.Explore,
        }),
      ),
    ).toBeNull();
    expect(parseShareStateSnapshot(legacySelectedChart)).toBeNull();
    expect(parseShareStateSnapshot(legacyChartSettings)).toBeNull();
  });

  it("seeds omitted registered models and rejects unknown model keys", () => {
    const current = createShareStateSnapshot(createAnalysisState().state);
    const missingIso = structuredClone(current);
    Reflect.deleteProperty(missingIso.models, ModelId.PmvIso);

    const emptyModels = { ...current, models: {} };
    const missingPhsInputs = structuredClone(current);
    Reflect.deleteProperty(
      missingPhsInputs.modelInputsByModel,
      ModelId.Phs2023,
    );

    const invalidIsoChart = {
      ...current,
      models: {
        ...current.models,
        [ModelId.PmvIso]: {
          ...current.models[ModelId.PmvIso],
          selectedChartInstanceId: "utci-dynamic-field",
        },
      },
    };
    const unknownModel = {
      ...current,
      models: {
        ...current.models,
        UNKNOWN_MODEL: current.models[ModelId.Utci],
      },
    };
    const unknownModelInputs = {
      ...current,
      modelInputsByModel: {
        ...current.modelInputsByModel,
        UNKNOWN_MODEL: {},
      },
    };

    expect(parseShareStateSnapshot(missingIso)).toEqual(current);
    expect(parseShareStateSnapshot(emptyModels)).toEqual(current);
    expect(parseShareStateSnapshot(missingPhsInputs)).toEqual(current);
    expect(parseShareStateSnapshot(invalidIsoChart)).toBeNull();
    expect(parseShareStateSnapshot(unknownModel)).toBeNull();
    expect(parseShareStateSnapshot(unknownModelInputs)).toBeNull();
    expect(
      parseShareStateSnapshot({ ...current, selectedModel: "PMV" }),
    ).toBeNull();
  });

  it("omits default model slices and unset model inputs on the wire", () => {
    const toolState = createAnalysisState();
    const defaultSnapshot = createShareStateSnapshot(toolState.state);
    const defaultWire = decodeShareWire(serializeShareState(defaultSnapshot));

    expect(defaultWire.models).toEqual({});
    expect(defaultWire.modelInputsByModel).toEqual({});
    expect(deserializeShareState(serializeShareState(defaultSnapshot))).toEqual(
      defaultSnapshot,
    );

    toolState.actions.setSelectedChartInstance("pmv-ashrae-dynamic-field");
    expect(
      toolState.actions.updateModelQuantity(
        ModelId.Phs2023,
        PhsQuantityId.BodyWeight,
        90,
      ),
    ).toBe(true);

    const changedSnapshot = createShareStateSnapshot(toolState.state);
    const changedWire = decodeShareWire(serializeShareState(changedSnapshot));

    expect(Object.keys(changedWire.models as object)).toEqual([
      ModelId.PmvAshrae,
    ]);
    expect(changedWire.models).not.toHaveProperty(ModelId.PmvIso);
    expect(changedWire.modelInputsByModel).toEqual({
      [ModelId.Phs2023]: { [PhsQuantityId.BodyWeight]: 90 },
    });
    expect(deserializeShareState(serializeShareState(changedSnapshot))).toEqual(
      changedSnapshot,
    );
  });

  it("recomputes derived displays after applying canonical shared inputs", () => {
    const original = createAnalysisState();
    original.actions.setModelOption(
      OptionKey.HumidityInputMode,
      HumidityInputMode.DewPoint,
    );
    original.actions.updateInput(
      original.state.ui.activeInputId,
      InputControlId.Humidity,
      "10",
    );
    const snapshot = createShareStateSnapshot(original.state);
    const restored = createAnalysisState();

    applyShareSnapshotToState(restored.state, snapshot);
    const humidityControl = restored.selectors
      .getInputControls()
      .find((control) => control.id === InputControlId.Humidity);
    expect(humidityControl?.numericValuesByInput.input1).toBeCloseTo(10, 6);
  });

  it("restores modifier configuration even when the selected model does not support it", () => {
    const original = createAnalysisState();
    original.state.ui.selectedModel = ModelId.Utci;
    original.state.auxiliaryQuantitiesByInput[InputId.Input1][
      PhysicalQuantityId.ModifierMeasuredAirSpeed
    ] = 0.6;
    original.state.activeModifiersByInput[InputId.Input1][
      ModifierId.MeasuredAirSpeed
    ] = true;
    const snapshot = createShareStateSnapshot(original.state);
    const restoredSnapshot = deserializeShareState(
      serializeShareState(snapshot),
    );
    const restored = createAnalysisState();

    if (!restoredSnapshot)
      throw new Error("Expected a valid modifier snapshot.");
    applyShareSnapshotToState(restored.state, restoredSnapshot);

    expect(restored.selectors.getInputModifierControls()).toEqual([]);
    expect(
      restored.selectors.getEffectiveQuantitiesByInput(ModelId.Utci)[
        InputId.Input1
      ][PhysicalQuantityId.RelativeAirSpeed],
    ).toBe(
      restored.state.quantitiesByInput[InputId.Input1][
        PhysicalQuantityId.RelativeAirSpeed
      ],
    );

    restored.state.ui.selectedModel = ModelId.PmvAshrae;
    expect(
      restored.selectors.getEffectiveQuantitiesByInput()[InputId.Input1][
        PhysicalQuantityId.RelativeAirSpeed
      ],
    ).toBe(0.6);
  });

  it("rejects legacy wire keys inputsByInput, modifierInputsByInput, and derivedByInput", () => {
    const toolState = createAnalysisState();
    const snapshot = createShareStateSnapshot(
      toolState.state,
    ) as unknown as Record<string, unknown>;
    const { quantitiesByInput, auxiliaryQuantitiesByInput, ...rest } = snapshot;

    expect(
      parseShareStateSnapshot({
        ...rest,
        inputsByInput: quantitiesByInput,
        auxiliaryQuantitiesByInput,
        modelInputsByModel: snapshot.modelInputsByModel,
        activeModifiersByInput: snapshot.activeModifiersByInput,
      }),
    ).toBeNull();

    expect(
      parseShareStateSnapshot({
        ...snapshot,
        modifierInputsByInput: {},
      }),
    ).toBeNull();

    expect(
      parseShareStateSnapshot({
        ...snapshot,
        derivedByInput: {},
      }),
    ).toBeNull();
  });
});
