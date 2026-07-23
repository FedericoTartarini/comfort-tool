import { describe, expect, it } from "vitest";

import { ComfortModel } from "../../models/comfortModels";
import { ChartId } from "../../models/chartOptions";
import { FieldKey } from "../../models/fieldKeys";
import { InputControlId } from "../../models/inputControls";
import { HumidityInputMode, OptionKey, TemperatureMode } from "../../models/inputModes";
import { InputId } from "../../models/inputSlots";
import { UnitSystem } from "../../models/units";
import { createComfortToolState } from "./createComfortToolState.svelte";
import {
  applyShareSnapshotToState,
  createShareStateSnapshot,
  deserializeShareState,
  parseShareStateSnapshot,
  serializeShareState,
  type ShareStateSnapshot,
} from "./shareState";

describe("shareState", () => {
  it("round-trips the current share snapshot format", () => {
    const toolState = createComfortToolState();
    toolState.state.ui.selectedModel = ComfortModel.PmvIso;
    toolState.state.ui.selectedChartByModel[ComfortModel.PmvIso] = ChartId.PmvDynamic;
    toolState.state.ui.unitSystem = UnitSystem.IP;
    toolState.state.ui.modelOptionsByModel[ComfortModel.PmvIso][OptionKey.TemperatureMode] = TemperatureMode.Operative;
    toolState.state.ui.dynamicXAxis = FieldKey.DryBulbTemperature;
    toolState.state.ui.dynamicYAxis = FieldKey.RelativeHumidity;

    const snapshot = createShareStateSnapshot(toolState.state);
    const encodedSnapshot = serializeShareState(snapshot);

    expect(snapshot.version).toBe(1);
    expect(snapshot.selectedModel).toBe(ComfortModel.PmvIso);
    expect(snapshot.models[ComfortModel.PmvAshrae]).toBeDefined();
    expect(snapshot.models[ComfortModel.PmvIso]).toEqual(expect.objectContaining({
      selectedChart: ChartId.PmvDynamic,
    }));
    expect(deserializeShareState(encodedSnapshot)).toEqual(snapshot);
  });

  it("applies a snapshot through the centralized codec helpers", () => {
    const originalState = createComfortToolState();
    originalState.state.ui.selectedModel = ComfortModel.PmvIso;
    originalState.state.ui.compareEnabled = true;
    originalState.state.ui.compareInputIds = [InputId.Input1, InputId.Input3];
    originalState.state.ui.unitSystem = UnitSystem.IP;
    originalState.state.ui.dynamicXAxis = FieldKey.DryBulbTemperature;
    originalState.state.ui.dynamicYAxis = FieldKey.RelativeHumidity;

    const snapshot = createShareStateSnapshot(originalState.state);
    const restoredState = createComfortToolState();

    applyShareSnapshotToState(restoredState.state, snapshot);

    expect(createShareStateSnapshot(restoredState.state)).toEqual(snapshot);
  });

  it("restores and validates dynamic axes during snapshot application", () => {
    const originalState = createComfortToolState();
    originalState.state.ui.selectedModel = ComfortModel.Utci;
    originalState.state.ui.dynamicXAxis = FieldKey.WindSpeed;
    originalState.state.ui.dynamicYAxis = FieldKey.MeanRadiantTemperature;

    const snapshot = createShareStateSnapshot(originalState.state);

    const restoredState = createComfortToolState();
    applyShareSnapshotToState(restoredState.state, snapshot);
    expect(restoredState.state.ui.dynamicXAxis).toBe(FieldKey.WindSpeed);
    expect(restoredState.state.ui.dynamicYAxis).toBe(FieldKey.MeanRadiantTemperature);

    // Test axis validation: Adaptive ASHRAE does not support 'v' or 'rh'
    const invalidSnapshot: ShareStateSnapshot = {
      ...snapshot,
      selectedModel: ComfortModel.AdaptiveAshrae,
      dynamicXAxis: "v",
      dynamicYAxis: "rh",
    };
    const restoredState2 = createComfortToolState();
    applyShareSnapshotToState(restoredState2.state, invalidSnapshot);
    // Should fallback to valid dynamic axes for Adaptive ASHRAE (usually to / trm)
    expect(restoredState2.state.ui.dynamicXAxis).not.toBe("v");
    expect(restoredState2.state.ui.dynamicYAxis).not.toBe("rh");

    const validAdaptiveSnapshot: ShareStateSnapshot = {
      ...snapshot,
      selectedModel: ComfortModel.AdaptiveEn,
      dynamicXAxis: FieldKey.OperativeTemperature,
      dynamicYAxis: FieldKey.PrevailingMeanOutdoorTemperature,
    };
    const validAdaptiveState = createComfortToolState();
    applyShareSnapshotToState(validAdaptiveState.state, validAdaptiveSnapshot);

    expect(validAdaptiveState.state.ui.dynamicXAxis).toBe(FieldKey.OperativeTemperature);
    expect(validAdaptiveState.state.ui.dynamicYAxis).toBe(FieldKey.PrevailingMeanOutdoorTemperature);

    const incompatibleSnapshot: ShareStateSnapshot = {
      ...snapshot,
      selectedModel: ComfortModel.AdaptiveEn,
      dynamicXAxis: FieldKey.DryBulbTemperature,
      dynamicYAxis: FieldKey.OperativeTemperature,
    };
    const normalizedState = createComfortToolState();
    applyShareSnapshotToState(normalizedState.state, incompatibleSnapshot);

    expect(incompatibleSnapshot.version).toBe(1);
    expect(normalizedState.state.ui.dynamicXAxis).toBe(FieldKey.DryBulbTemperature);
    expect(normalizedState.state.ui.dynamicYAxis).toBe(FieldKey.MeanRadiantTemperature);
  });

  it("rejects every snapshot version except the current v1 schema", () => {
    const current = createShareStateSnapshot(createComfortToolState().state);

    expect(parseShareStateSnapshot({ ...current, version: 6 })).toBeNull();
    expect(parseShareStateSnapshot({ ...current, version: 7 })).toBeNull();
    expect(parseShareStateSnapshot({ ...current, version: 999 })).toBeNull();
  });

  it("requires exactly the current v1 model registry", () => {
    const current = createShareStateSnapshot(createComfortToolState().state);
    const currentWithoutIso = {
      ...current,
      models: { ...current.models },
    } as any;
    delete currentWithoutIso.models[ComfortModel.PmvIso];

    const currentWithInvalidIsoChart = {
      ...current,
      models: {
        ...current.models,
        [ComfortModel.PmvIso]: {
          ...current.models[ComfortModel.PmvIso],
          selectedChart: ChartId.UtciDynamic,
        },
      },
    };
    const currentWithUnknownModel = {
      ...current,
      models: {
        ...current.models,
        UNKNOWN_MODEL: current.models[ComfortModel.Utci],
      },
    };
    const currentWithLegacyPmvId = {
      ...current,
      models: {
        ...current.models,
        PMV: current.models[ComfortModel.PmvAshrae],
      },
    } as any;
    delete currentWithLegacyPmvId.models[ComfortModel.PmvAshrae];
    const currentWithLegacySelectedModel = {
      ...current,
      selectedModel: "PMV",
    };

    expect(parseShareStateSnapshot(currentWithoutIso)).toBeNull();
    expect(parseShareStateSnapshot(currentWithInvalidIsoChart)).toBeNull();
    expect(parseShareStateSnapshot(currentWithUnknownModel)).toBeNull();
    expect(parseShareStateSnapshot(currentWithLegacyPmvId)).toBeNull();
    expect(parseShareStateSnapshot(currentWithLegacySelectedModel)).toBeNull();
  });

  it("recomputes derived control displays after applying a snapshot", () => {
    const originalState = createComfortToolState();
    originalState.actions.setModelOption(OptionKey.HumidityInputMode, HumidityInputMode.DewPoint);
    originalState.actions.updateInput(originalState.state.ui.activeInputId, InputControlId.Humidity, "10");

    const snapshot = createShareStateSnapshot(originalState.state);
    const restoredState = createComfortToolState();

    applyShareSnapshotToState(restoredState.state, snapshot);

    const humidityControl = restoredState.selectors.getInputControls()
      .find((control) => control.id === InputControlId.Humidity);

    expect(humidityControl?.numericValuesByInput.input1).toBeCloseTo(10, 6);
  });
});
