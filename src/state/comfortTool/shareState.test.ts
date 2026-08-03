import { describe, expect, it } from "vitest";

import { ChartId } from "../../models/chartOptions";
import { ComfortModel, type ComfortModel as ComfortModelType } from "../../models/comfortModels";
import { FieldKey } from "../../models/fieldKeys";
import { InputControlId } from "../../models/inputControls";
import { HumidityInputMode, OptionKey, TemperatureMode } from "../../models/inputModes";
import { InputId } from "../../models/inputSlots";
import { ChartMode, ModelOutputKey } from "../../models/modelCapabilities";
import { UnitSystem } from "../../models/units";
import { createComfortToolState } from "./createComfortToolState.svelte";
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

function withChartSettings(
  snapshot: ShareStateSnapshot,
  modelId: ComfortModelType,
  patch: Record<string, unknown>,
): unknown {
  return {
    ...snapshot,
    models: {
      ...snapshot.models,
      [modelId]: {
        ...snapshot.models[modelId],
        chartSettings: {
          ...snapshot.models[modelId].chartSettings,
          ...patch,
        },
      },
    },
  };
}

describe("shareState strict v1 codec", () => {
  it("round-trips all per-model field settings and explicit Infinity edges", () => {
    const toolState = createComfortToolState();
    toolState.state.ui.selectedModel = ComfortModel.PmvIso;
    toolState.state.ui.selectedChartByModel[ComfortModel.PmvAshrae] =
      ChartId.Psychrometric;
    toolState.state.ui.selectedChartByModel[ComfortModel.PmvIso] = ChartId.PmvDynamic;
    toolState.state.ui.unitSystem = UnitSystem.IP;
    toolState.state.ui.modelOptionsByModel[ComfortModel.PmvIso]
      [OptionKey.TemperatureMode] = TemperatureMode.Operative;
    toolState.state.inputsByInput[InputId.Input1][FieldKey.ClothingInsulation] = 2;

    const ashrae = toolState.state.ui.chartSettingsByModel[ComfortModel.PmvAshrae];
    ashrae.mode = ChartMode.Explore;
    ashrae.xAxis = FieldKey.MeanRadiantTemperature;
    ashrae.yAxis = FieldKey.RelativeHumidity;
    ashrae.baselineInputId = InputId.Input3;
    ashrae.explore = {
      zOutput: ModelOutputKey.Ppd,
      bands: [
        { min: -Infinity, max: 12, label: "Preferred", color: "#0f0" },
        { min: 12, max: Infinity, label: "Other", color: "#f00" },
      ],
    };

    const iso = toolState.state.ui.chartSettingsByModel[ComfortModel.PmvIso];
    iso.mode = ChartMode.Compliance;
    iso.xAxis = FieldKey.OperativeTemperature;
    iso.yAxis = FieldKey.RelativeAirSpeed;
    iso.baselineInputId = InputId.Input2;

    const snapshot = createShareStateSnapshot(toolState.state);
    const restored = deserializeShareState(serializeShareState(snapshot));

    expect(snapshot.version).toBe(1);
    expect(snapshot).not.toHaveProperty("dynamicXAxis");
    expect(snapshot).not.toHaveProperty("dynamicYAxis");
    expect(snapshot.models[ComfortModel.PmvAshrae].selectedChart)
      .toBe(ChartId.Psychrometric);
    expect(restored?.models[ComfortModel.PmvAshrae].selectedChart)
      .toBe(ChartId.Psychrometric);
    expect(restored?.models[ComfortModel.PmvIso].selectedChart)
      .toBe(ChartId.PmvDynamic);
    expect(snapshot.models[ComfortModel.PmvAshrae].chartSettings)
      .toEqual(expect.objectContaining({
        mode: ChartMode.Explore,
        xAxis: FieldKey.MeanRadiantTemperature,
        yAxis: FieldKey.RelativeHumidity,
        baselineInputId: InputId.Input3,
      }));
    expect(snapshot.models[ComfortModel.PmvIso].chartSettings)
      .toEqual(expect.objectContaining({
        mode: ChartMode.Compliance,
        xAxis: FieldKey.OperativeTemperature,
        baselineInputId: InputId.Input2,
      }));
    expect(restored).toEqual(snapshot);
    expect(restored?.models[ComfortModel.PmvAshrae].chartSettings.explore?.bands[0].min)
      .toBe(-Infinity);
    expect(restored?.models[ComfortModel.PmvAshrae].chartSettings.explore?.bands[1].max)
      .toBe(Infinity);
  });

  it("round-trips built-in and edited UTF-8 labels through the codec and URL", () => {
    const toolState = createComfortToolState();
    toolState.actions.setChartMode(ChartMode.Explore);
    toolState.actions.setExploreOutput(ModelOutputKey.Ppd);

    const builtInSnapshot = createShareStateSnapshot(toolState.state);
    const builtInBands = builtInSnapshot.models[ComfortModel.PmvAshrae]
      .chartSettings.explore?.bands;
    expect(builtInBands?.[1].label).toContain("≥");
    expect(deserializeShareState(serializeShareState(builtInSnapshot)))
      .toEqual(builtInSnapshot);

    expect(toolState.actions.setExploreBands([
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
    ])).toBe(true);
    const editedSnapshot = createShareStateSnapshot(toolState.state);
    const url = buildShareUrl(
      editedSnapshot,
      "https://example.test/comfort?existing=1#results",
    );
    const restored = readShareStateFromUrl(url);

    expect(restored).toEqual(editedSnapshot);
    expect(
      restored?.models[ComfortModel.PmvAshrae]
        .chartSettings.explore?.bands.map(({ label }) => label),
    ).toEqual(["舒适区 ✅", "偏高 🥵（≥ 10%）"]);
  });

  it("round-trips both Adaptive models with the single fixed chart", () => {
    const snapshot = createShareStateSnapshot(createComfortToolState().state);
    const restored = deserializeShareState(serializeShareState(snapshot));

    [ComfortModel.AdaptiveAshrae, ComfortModel.AdaptiveEn].forEach((modelId) => {
      expect(snapshot.models[modelId]).toEqual(expect.objectContaining({
        selectedChart: ChartId.Adaptive,
        chartSettings: expect.objectContaining({
          mode: ChartMode.Compliance,
          xAxis: FieldKey.PrevailingMeanOutdoorTemperature,
          yAxis: FieldKey.OperativeTemperature,
          explore: null,
        }),
      }));
      expect(restored?.models[modelId]).toEqual(snapshot.models[modelId]);
    });
  });

  it("rejects invalid Base64URL and malformed UTF-8 bytes", () => {
    const malformedUtf8 = globalThis.btoa(
      String.fromCharCode(0xc3, 0x28),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    expect(deserializeShareState("%%%")).toBeNull();
    expect(deserializeShareState("A")).toBeNull();
    expect(deserializeShareState(malformedUtf8)).toBeNull();
  });

  it("applies a complete snapshot without reseeding any model settings", () => {
    const original = createComfortToolState();
    original.state.ui.compareEnabled = true;
    original.state.ui.compareInputIds = [InputId.Input1, InputId.Input3];
    original.state.ui.unitSystem = UnitSystem.IP;
    original.state.ui.chartSettingsByModel[ComfortModel.Utci].xAxis = FieldKey.WindSpeed;
    original.state.ui.chartSettingsByModel[ComfortModel.Utci].yAxis =
      FieldKey.MeanRadiantTemperature;
    original.state.ui.chartSettingsByModel[ComfortModel.PmvAshrae].mode = ChartMode.Explore;
    original.state.ui.chartSettingsByModel[ComfortModel.PmvIso].baselineInputId = InputId.Input3;

    const snapshot = createShareStateSnapshot(original.state);
    const restored = createComfortToolState();
    applyShareSnapshotToState(restored.state, snapshot);

    expect(createShareStateSnapshot(restored.state)).toEqual(snapshot);
    expect(restored.state.ui.chartSettingsByModel[ComfortModel.PmvAshrae].mode)
      .toBe(ChartMode.Explore);
    expect(restored.state.ui.chartSettingsByModel[ComfortModel.PmvIso].baselineInputId)
      .toBe(InputId.Input3);
  });

  it("rejects unknown versions and the previous v1 shape without migration", () => {
    const current = createShareStateSnapshot(createComfortToolState().state);
    expect(parseShareStateSnapshot({ ...current, version: 2 })).toBeNull();
    expect(parseShareStateSnapshot({ ...current, version: 999 })).toBeNull();

    const oldModels = Object.fromEntries(Object.entries(current.models).map(
      ([modelId, model]) => [
        modelId,
        { selectedChart: model.selectedChart, options: model.options },
      ],
    ));
    const oldV1 = {
      ...current,
      models: oldModels,
      dynamicXAxis: FieldKey.DryBulbTemperature,
      dynamicYAxis: FieldKey.RelativeHumidity,
    };
    expect(parseShareStateSnapshot(oldV1)).toBeNull();

    const historicalAdaptiveDynamic = {
      ...current,
      models: {
        ...current.models,
        [ComfortModel.AdaptiveAshrae]: {
          ...current.models[ComfortModel.AdaptiveAshrae],
          selectedChart: "adaptiveDynamic",
        },
      },
    };
    expect(parseShareStateSnapshot(historicalAdaptiveDynamic)).toBeNull();
    expect(deserializeShareState(serializeShareState(
      historicalAdaptiveDynamic as ShareStateSnapshot,
    ))).toBeNull();
  });

  it("strictly validates declared mode, axes, output, bands, and baseline", () => {
    const current = createShareStateSnapshot(createComfortToolState().state);

    expect(parseShareStateSnapshot(withChartSettings(
      current,
      ComfortModel.AdaptiveAshrae,
      { mode: ChartMode.Explore },
    ))).toBeNull();
    expect(parseShareStateSnapshot(withChartSettings(
      current,
      ComfortModel.AdaptiveAshrae,
      {
        xAxis: FieldKey.DryBulbTemperature,
        yAxis: FieldKey.PrevailingMeanOutdoorTemperature,
      },
    ))).toBeNull();
    expect(parseShareStateSnapshot(withChartSettings(
      current,
      ComfortModel.PmvAshrae,
      { xAxis: FieldKey.DryBulbTemperature, yAxis: FieldKey.DryBulbTemperature },
    ))).toBeNull();
    expect(parseShareStateSnapshot(withChartSettings(
      current,
      ComfortModel.PmvAshrae,
      {
        explore: {
          zOutput: ModelOutputKey.Utci,
          bands: current.models[ComfortModel.PmvAshrae].chartSettings.explore?.bands,
        },
      },
    ))).toBeNull();
    expect(parseShareStateSnapshot(withChartSettings(
      current,
      ComfortModel.PmvAshrae,
      {
        explore: {
          zOutput: ModelOutputKey.Pmv,
          bands: [
            { min: 0, max: 2, label: "One", color: "#000" },
            { min: 1, max: 3, label: "Two", color: "#fff" },
          ],
        },
      },
    ))).toBeNull();
    expect(parseShareStateSnapshot(withChartSettings(
      current,
      ComfortModel.PmvAshrae,
      { baselineInputId: "not-an-input" },
    ))).toBeNull();
    expect(parseShareStateSnapshot(withChartSettings(
      current,
      ComfortModel.PmvAshrae,
      { explore: null },
    ))).toBeNull();
  });

  it("requires exactly the registered models and a valid chart for each", () => {
    const current = createShareStateSnapshot(createComfortToolState().state);
    const missingIso = { ...current, models: { ...current.models } } as Record<
      string,
      unknown
    >;
    delete (missingIso.models as Record<string, unknown>)[ComfortModel.PmvIso];

    const invalidIsoChart = {
      ...current,
      models: {
        ...current.models,
        [ComfortModel.PmvIso]: {
          ...current.models[ComfortModel.PmvIso],
          selectedChart: ChartId.UtciDynamic,
        },
      },
    };
    const unknownModel = {
      ...current,
      models: {
        ...current.models,
        UNKNOWN_MODEL: current.models[ComfortModel.Utci],
      },
    };

    expect(parseShareStateSnapshot(missingIso)).toBeNull();
    expect(parseShareStateSnapshot(invalidIsoChart)).toBeNull();
    expect(parseShareStateSnapshot(unknownModel)).toBeNull();
    expect(parseShareStateSnapshot({ ...current, selectedModel: "PMV" })).toBeNull();
  });

  it("recomputes derived displays after applying canonical shared inputs", () => {
    const original = createComfortToolState();
    original.actions.setModelOption(OptionKey.HumidityInputMode, HumidityInputMode.DewPoint);
    original.actions.updateInput(
      original.state.ui.activeInputId,
      InputControlId.Humidity,
      "10",
    );
    const snapshot = createShareStateSnapshot(original.state);
    const restored = createComfortToolState();

    applyShareSnapshotToState(restored.state, snapshot);
    const humidityControl = restored.selectors.getInputControls()
      .find((control) => control.id === InputControlId.Humidity);
    expect(humidityControl?.numericValuesByInput.input1).toBeCloseTo(10, 6);
  });
});
