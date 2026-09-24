import { describe, expect, it } from "vitest";

import {
  ModelId,
  type ModelId as ModelIdType,
} from "../../catalog/modelIds";
import {
  PhysicalQuantityId,
  derivedHumidityQuantityIds,
} from "../../catalog/quantities";
import { InputControlId } from "../../catalog/inputControls";
import {
  AirSpeedControlMode,
  HumidityInputMode,
  OptionKey,
  TemperatureMode,
} from "../../catalog/inputModes";
import { ModifierId, modifierOrder } from "../../catalog/inputModifiers";
import { InputId } from "../../catalog/inputSlots";

import { SurfaceId } from "../../catalog/surfaces";
import { createPointSession } from "./createPointSession.svelte";
import {
  seedSelectedModel,
  seedPrimaryQuantity,
  seedCompareVisibleInputs,
  seedModifierInput,
  seedModifierEnabled,
} from "../../testSupport/seedPointSession";
import { FieldChartProfileKind } from "../../catalog/fieldChartProfile";
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
    const session = createPointSession();
    seedModifierInput(
      session,
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      PhysicalQuantityId.MeasuredAirSpeed,
      0.6,
    );
    seedModifierEnabled(session, InputId.Input1, ModifierId.MeasuredAirSpeed, true);
    seedModifierInput(
      session,
      InputId.Input2,
      ModifierId.MorningClothingEstimate,
      PhysicalQuantityId.MorningOutdoorTemperature,
      10,
    );
    seedModifierEnabled(session, InputId.Input2, ModifierId.DynamicClothing, true);
    seedModifierInput(
      session,
      InputId.Input3,
      ModifierId.SolarGain,
      PhysicalQuantityId.SolarAltitude,
      45,
    );
    seedModifierInput(
      session,
      InputId.Input3,
      ModifierId.SolarGain,
      PhysicalQuantityId.SolarHorizontalAngle,
      90,
    );
    seedModifierInput(
      session,
      InputId.Input3,
      ModifierId.SolarGain,
      PhysicalQuantityId.DirectSolarRadiation,
      800,
    );
    seedModifierInput(
      session,
      InputId.Input3,
      ModifierId.SolarGain,
      PhysicalQuantityId.SolarTransmittance,
      0.5,
    );
    seedModifierInput(
      session,
      InputId.Input3,
      ModifierId.SolarGain,
      PhysicalQuantityId.SkyVaultViewFraction,
      0.5,
    );
    seedModifierInput(
      session,
      InputId.Input3,
      ModifierId.SolarGain,
      PhysicalQuantityId.BodyExposureFraction,
      0.5,
    );
    seedModifierEnabled(session, InputId.Input3, ModifierId.SolarGain, true);

    const snapshot = createShareStateSnapshot(session);
    const restored = deserializeShareState(serializeShareState(snapshot));

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
      snapshot.quantitiesByInput[InputId.Input1][
        PhysicalQuantityId.MeasuredAirSpeed
      ],
    ).toBe(0.6);
    expect(
      snapshot.quantitiesByInput[InputId.Input2],
    ).not.toHaveProperty(PhysicalQuantityId.MeasuredAirSpeed);
    expect(
      snapshot.quantitiesByInput[InputId.Input2][
        PhysicalQuantityId.MorningOutdoorTemperature
      ],
    ).toBe(10);
    expect(
      snapshot.quantitiesByInput[InputId.Input2],
    ).not.toHaveProperty(PhysicalQuantityId.SolarAltitude);
    for (const humidityId of derivedHumidityQuantityIds) {
      expect(snapshot.quantitiesByInput[InputId.Input1]).not.toHaveProperty(
        humidityId,
      );
    }
    expect(restored).toEqual(snapshot);
  });

  it("round-trips a changed PHS quantity in quantitiesByInput", () => {
    const session = createPointSession();
    expect(
      session.actions.updateModelQuantity(
        ModelId.Phs2023,
        PhysicalQuantityId.BodyWeight,
        90,
      ),
    ).toBe(true);

    const snapshot = createShareStateSnapshot(session);

    expect(
      snapshot.quantitiesByInput[InputId.Input1][PhysicalQuantityId.BodyWeight],
    ).toBe(90);
    expect(
      snapshot.quantitiesByInput[InputId.Input1],
    ).not.toHaveProperty(PhysicalQuantityId.Height);
    expect(
      (decodeShareWire(serializeShareState(snapshot)).quantitiesByInput as {
        [InputId.Input1]: Record<string, number>;
      })[InputId.Input1][PhysicalQuantityId.BodyWeight],
    ).toBe(90);

    const restored = deserializeShareState(serializeShareState(snapshot));
    expect(
      restored?.quantitiesByInput[InputId.Input1][PhysicalQuantityId.BodyWeight],
    ).toBe(90);
    expect(restored?.quantitiesByInput[InputId.Input1]).not.toHaveProperty(
      PhysicalQuantityId.Height,
    );
  });

  it("round-trips all per-model field settings and explicit Infinity edges", () => {
    const session = createPointSession();
    seedSelectedModel(session, ModelId.PmvIso);
    session.actions.setSelectedChartInstance("dynamic");
    session.actions.toggleUnitSystem();
    session.actions.setModelOption(
      OptionKey.TemperatureMode,
      TemperatureMode.Operative,
    );
    seedPrimaryQuantity(
      session,
      InputId.Input1,
      PhysicalQuantityId.ClothingInsulation,
      1.2,
    );

    seedSelectedModel(session, ModelId.PmvAshrae);
    session.actions.setSelectedChartInstance("dynamic");
    session.actions.setDynamicXAxis(PhysicalQuantityId.MeanRadiantTemperature);
    session.actions.setDynamicYAxis(PhysicalQuantityId.RelativeHumidity);
    session.actions.setChartBaselineInputId(InputId.Input3);
    session.actions.setActiveSurface(SurfaceId.Explore);
    session.actions.setExploreOutput(PhysicalQuantityId.PredictedPercentageOfDissatisfied);
    session.actions.setExploreBands([
      { min: -Infinity, max: 12, label: "Preferred", color: "#0f0" },
      { min: 12, max: Infinity, label: "Other", color: "#f00" },
    ]);
    session.actions.setSelectedChartInstance("psychrometric");

    seedSelectedModel(session, ModelId.PmvIso);
    session.actions.setDynamicXAxis(PhysicalQuantityId.OperativeTemperature);
    session.actions.setDynamicYAxis(PhysicalQuantityId.RelativeAirSpeed);
    session.actions.setChartBaselineInputId(InputId.Input2);

    const snapshot = createShareStateSnapshot(session);
    const restored = deserializeShareState(serializeShareState(snapshot));

    expect(snapshot.version).toBe(1);
    expect(snapshot).not.toHaveProperty("dynamicXAxis");
    expect(snapshot).not.toHaveProperty("dynamicYAxis");
    expect(
      snapshot.models[ModelId.PmvAshrae].selectedChartType,
    ).toBe("psychrometric");
    expect(
      restored?.models[ModelId.PmvAshrae].selectedChartType,
    ).toBe("psychrometric");
    expect(restored?.models[ModelId.PmvIso].selectedChartType).toBe(
      "dynamic",
    );
    expect(snapshot.models[ModelId.PmvIso].options).not.toHaveProperty(
      OptionKey.AirSpeedControlMode,
    );
    expect(snapshot.models[ModelId.PmvAshrae].outputSettings).toEqual(
      expect.objectContaining({
        xAxis: PhysicalQuantityId.MeanRadiantTemperature,
        yAxis: PhysicalQuantityId.RelativeHumidity,
        baselineInputId: InputId.Input3,
        exploreOutput: PhysicalQuantityId.PredictedPercentageOfDissatisfied,
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
    const session = createPointSession();
    seedSelectedModel(session, ModelId.Phs2023);
    session.actions.setActiveSurface(SurfaceId.Explore);
    session.actions.setSelectedChartInstance("dynamic");
    session.actions.setExploreOutput(PhysicalQuantityId.SweatLoss);

    const dynamicSnapshot = createShareStateSnapshot(session);
    expect(dynamicSnapshot.version).toBe(1);
    expect(deserializeShareState(serializeShareState(dynamicSnapshot))).toEqual(
      dynamicSnapshot,
    );
    expect(
      dynamicSnapshot.models[ModelId.Phs2023].selectedChartType,
    ).toBe("dynamic");

    session.actions.setSelectedChartInstance("body-temperature");
    const historySnapshot = createShareStateSnapshot(session);
    expect(
      historySnapshot.models[ModelId.Phs2023].selectedChartType,
    ).toBe("body-temperature");
    expect(
      historySnapshot.models[ModelId.Phs2023].outputSettings.exploreOutput,
    ).toBe(PhysicalQuantityId.RectalTemperature);
    expect(deserializeShareState(serializeShareState(historySnapshot))).toEqual(
      historySnapshot,
    );

    const incompatible = structuredClone(historySnapshot);
    incompatible.models[ModelId.Phs2023].outputSettings.exploreOutput =
      PhysicalQuantityId.SweatLoss;
    expect(parseShareStateSnapshot(incompatible)).toBeNull();
  });

  it("round-trips built-in and edited UTF-8 labels through the codec and URL", () => {
    const session = createPointSession();
    session.actions.setActiveSurface(SurfaceId.Explore);
    session.actions.setExploreOutput(PhysicalQuantityId.PredictedPercentageOfDissatisfied);

    const builtInSnapshot = createShareStateSnapshot(session);
    const builtInBands =
      builtInSnapshot.models[ModelId.PmvAshrae].outputSettings
        .exploreBands;
    expect(builtInBands?.[1].label).toBe(">= 10");
    expect(deserializeShareState(serializeShareState(builtInSnapshot))).toEqual(
      builtInSnapshot,
    );

    expect(
      session.actions.setExploreBands([
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
    const editedSnapshot = createShareStateSnapshot(session);
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
    const session = createPointSession();
    seedSelectedModel(session, ModelId.AdaptiveAshrae);
    session.actions.setDynamicXAxis(PhysicalQuantityId.OperativeTemperature);
    const snapshot = createShareStateSnapshot(session);
    const restored = deserializeShareState(serializeShareState(snapshot));

    expect(snapshot.models[ModelId.AdaptiveAshrae]).toEqual(
      expect.objectContaining({
        selectedChartType: "adaptive",
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
        selectedChartType: "adaptive",
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
    const original = createPointSession();
    seedCompareVisibleInputs(original, [InputId.Input1, InputId.Input3]);
    original.actions.setActiveInputId(InputId.Input3);
    original.actions.toggleUnitSystem();
    seedSelectedModel(original, ModelId.Utci);
    original.actions.setDynamicXAxis(PhysicalQuantityId.WindSpeed);
    original.actions.setDynamicYAxis(PhysicalQuantityId.MeanRadiantTemperature);
    original.actions.setActiveSurface(SurfaceId.Explore);
    seedSelectedModel(original, ModelId.PmvIso);
    original.actions.setChartBaselineInputId(InputId.Input3);

    const snapshot = createShareStateSnapshot(original);
    const restored = createPointSession();
    applyShareSnapshotToState(restored, snapshot);

    expect(createShareStateSnapshot(restored)).toEqual(snapshot);
    expect(
      restored.chart.outputSettingsByModel[ModelId.PmvIso]
        .baselineInputId,
    ).toBe(InputId.Input3);
    expect(restored.input.compareInputIds).toEqual([
      InputId.Input1,
      InputId.Input3,
    ]);
    expect(restored.input.activeInputId).toBe(InputId.Input3);
  });

  it.each(Object.values(ModelId))(
    "rejects non-object and unknown-key options for %s",
    (modelId) => {
      const current = createShareStateSnapshot(createPointSession());

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
      const current = createShareStateSnapshot(createPointSession());
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
    const current = createShareStateSnapshot(createPointSession());

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
      const current = createShareStateSnapshot(createPointSession());

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
    const current = createShareStateSnapshot(createPointSession());
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
    const current = createShareStateSnapshot(createPointSession());
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
    const current = createShareStateSnapshot(createPointSession());
    const incomplete = structuredClone(current);
    incomplete.activeModifiersByInput[InputId.Input1][ModifierId.SolarGain] =
      true;

    const derivedHumidity = structuredClone(current);
    derivedHumidity.quantitiesByInput[InputId.Input1][
      PhysicalQuantityId.DewPointTemperature
    ] = 10;

    const unknownModifier = structuredClone(current);
    Object.assign(unknownModifier.activeModifiersByInput[InputId.Input1], {
      unknownModifier: false,
    });

    const unknownField = structuredClone(current);
    Object.assign(unknownField.quantitiesByInput[InputId.Input1], {
      unknownField: 1,
    });

    const missingDynamicActiveKey = structuredClone(current);
    Reflect.deleteProperty(
      missingDynamicActiveKey.activeModifiersByInput[InputId.Input1],
      ModifierId.DynamicClothing,
    );

    const missingQuantitiesInput = structuredClone(current);
    Reflect.deleteProperty(
      missingQuantitiesInput.quantitiesByInput,
      InputId.Input1,
    );

    const nonFinite = structuredClone(current);
    nonFinite.quantitiesByInput[InputId.Input1][
      PhysicalQuantityId.MeasuredAirSpeed
    ] = Infinity;

    expect(parseShareStateSnapshot(incomplete)).toBeNull();
    expect(parseShareStateSnapshot(derivedHumidity)).toBeNull();
    expect(parseShareStateSnapshot(unknownModifier)).toBeNull();
    expect(parseShareStateSnapshot(unknownField)).toBeNull();
    expect(parseShareStateSnapshot(missingDynamicActiveKey)).toBeNull();
    expect(parseShareStateSnapshot(missingQuantitiesInput)).toBeNull();
    expect(parseShareStateSnapshot(nonFinite)).toBeNull();
  });

  it("strictly validates output settings axes, output, bands, and baseline", () => {
    const current = createShareStateSnapshot(createPointSession());

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
            zOutput: PhysicalQuantityId.UniversalThermalClimateIndex,
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
            zOutput: PhysicalQuantityId.PredictedMeanVote,
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
    const current = createShareStateSnapshot(createPointSession());

    const legacySelectedChart = {
      ...current,
      models: {
        ...current.models,
        [ModelId.PmvAshrae]: {
          options: current.models[ModelId.PmvAshrae].options,
          outputSettings: current.models[ModelId.PmvAshrae].outputSettings,
          selectedChart: "dynamic",
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
    const current = createShareStateSnapshot(createPointSession());
    const missingIso = structuredClone(current);
    Reflect.deleteProperty(missingIso.models, ModelId.PmvIso);

    const emptyModels = { ...current, models: {} };

    const invalidIsoChart = {
      ...current,
      models: {
        ...current.models,
        [ModelId.PmvIso]: {
          ...current.models[ModelId.PmvIso],
          selectedChartType: "invented",
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

    expect(parseShareStateSnapshot(missingIso)).toEqual(current);
    expect(parseShareStateSnapshot(emptyModels)).toEqual(current);
    expect(parseShareStateSnapshot(invalidIsoChart)).toBeNull();
    expect(parseShareStateSnapshot(unknownModel)).toBeNull();
    expect(
      parseShareStateSnapshot({ ...current, selectedModel: "PMV" }),
    ).toBeNull();
  });

  it("omits default model slices and unset model inputs on the wire", () => {
    const session = createPointSession();
    const defaultSnapshot = createShareStateSnapshot(session);
    const defaultWire = decodeShareWire(serializeShareState(defaultSnapshot));

    expect(defaultWire.models).toEqual({});
    expect(defaultWire).not.toHaveProperty("modelInputsByModel");
    expect(defaultWire).not.toHaveProperty("auxiliaryQuantitiesByInput");
    expect(defaultWire).not.toHaveProperty("selectedModel");
    expect(
      (defaultWire.quantitiesByInput as Record<string, Record<string, number>>)[
        InputId.Input1
      ],
    ).not.toHaveProperty(PhysicalQuantityId.BodyWeight);
    expect(deserializeShareState(serializeShareState(defaultSnapshot))).toEqual(
      defaultSnapshot,
    );

    session.actions.setSelectedChartInstance("dynamic");
    expect(
      session.actions.updateModelQuantity(
        ModelId.Phs2023,
        PhysicalQuantityId.BodyWeight,
        90,
      ),
    ).toBe(true);

    const changedSnapshot = createShareStateSnapshot(session);
    const changedWire = decodeShareWire(serializeShareState(changedSnapshot));

    expect(Object.keys(changedWire.models as object)).toEqual([
      ModelId.PmvAshrae,
    ]);
    expect(changedWire.models).not.toHaveProperty(ModelId.PmvIso);
    expect(
      (changedWire.quantitiesByInput as Record<string, Record<string, number>>)[
        InputId.Input1
      ][PhysicalQuantityId.BodyWeight],
    ).toBe(90);
    expect(changedWire).not.toHaveProperty("modelInputsByModel");
    expect(deserializeShareState(serializeShareState(changedSnapshot))).toEqual(
      changedSnapshot,
    );
  });

  it("recomputes derived displays after applying canonical shared inputs", () => {
    const original = createPointSession();
    original.actions.setModelOption(
      OptionKey.HumidityInputMode,
      HumidityInputMode.DewPoint,
    );
    original.actions.updateInput(
      original.input.activeInputId,
      InputControlId.Humidity,
      "10",
    );
    const snapshot = createShareStateSnapshot(original);
    const restored = createPointSession();

    applyShareSnapshotToState(restored, snapshot);
    const humidityControl = restored.inputControls
      .find((control) => control.id === InputControlId.Humidity);
    expect(humidityControl?.numericValuesByInput.input1).toBeCloseTo(10, 6);
  });

  it("restores modifier configuration even when the selected model does not support it", () => {
    const original = createPointSession();
    seedModifierInput(
      original,
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      PhysicalQuantityId.MeasuredAirSpeed,
      0.6,
    );
    seedModifierEnabled(original, InputId.Input1, ModifierId.MeasuredAirSpeed, true);
    seedSelectedModel(original, ModelId.Utci);
    const snapshot = createShareStateSnapshot(original);
    const restoredSnapshot = deserializeShareState(
      serializeShareState(snapshot),
    );
    const restored = createPointSession();

    if (!restoredSnapshot)
      throw new Error("Expected a valid modifier snapshot.");
    applyShareSnapshotToState(restored, restoredSnapshot);

    seedSelectedModel(restored, ModelId.Utci);
    expect(restored.inputModifierControls()).toEqual([]);
    expect(
      restored.effectiveQuantities(ModelId.Utci)[
        InputId.Input1
      ][PhysicalQuantityId.RelativeAirSpeed],
    ).toBe(
      restored.input.quantitiesByInput[InputId.Input1][
        PhysicalQuantityId.RelativeAirSpeed
      ],
    );

    seedSelectedModel(restored, ModelId.PmvAshrae);
    expect(
      restored.effectiveQuantities()[InputId.Input1][
        PhysicalQuantityId.RelativeAirSpeed
      ],
    ).toBe(0.6);
  });

  it("rejects legacy wire keys inputsByInput, modifierInputsByInput, and derivedByInput", () => {
    const session = createPointSession();
    const snapshot = createShareStateSnapshot(
      session,
    ) as unknown as Record<string, unknown>;
    const { quantitiesByInput, ...rest } = snapshot;

    expect(
      parseShareStateSnapshot({
        ...rest,
        inputsByInput: quantitiesByInput,
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

    expect(
      parseShareStateSnapshot({
        ...snapshot,
        auxiliaryQuantitiesByInput: {},
      }),
    ).toBeNull();

    expect(
      parseShareStateSnapshot({
        ...snapshot,
        modelInputsByModel: {},
      }),
    ).toBeNull();
  });
});
