import { describe, expect, it } from "vitest";

import { ModelId } from "../../../catalog/modelIds";
import { PhysicalQuantityId } from "../../../catalog/quantities";
import { InputControlId } from "../../../catalog/inputControls";
import {
  HumidityInputMode,
  OptionKey,
  TemperatureMode,
} from "../../../catalog/inputModes";
import { InputId } from "../../../catalog/inputSlots";
import { createAnalysisState } from "../../../state/analysis/createAnalysisState.svelte";
import {
  deriveRelativeHumidityFromDewPoint,
  deriveRelativeHumidityFromHumidityRatio,
  deriveRelativeHumidityFromVaporPressure,
  deriveRelativeHumidityFromWetBulb,
} from "../derivations";

function getControl(
  toolState: ReturnType<typeof createAnalysisState>,
  controlId: InputControlId,
) {
  const control = toolState.selectors.getInputControls().find(
    ({ id }) => id === controlId,
  );
  if (!control) throw new Error(`Missing control ${controlId}.`);
  return control;
}

describe("input control ownership", () => {
  it("opts models into operative temperature without affecting ordinary temperature controls", () => {
    const toolState = createAnalysisState();
    expect(getControl(toolState, InputControlId.Temperature).menu?.title)
      .toBe("Temperature input");

    toolState.state.setting.selectedModel = ModelId.WindChill;
    expect(getControl(toolState, InputControlId.Temperature).menu).toBeNull();
    expect(getControl(toolState, InputControlId.Temperature).label)
      .toBe("Air temperature");
  });

  it("keeps Air and Operative edits reversible through the model option handler", () => {
    const toolState = createAnalysisState();
    const input = toolState.state.input.quantitiesByInput[InputId.Input1];
    input[PhysicalQuantityId.DryBulbTemperature] = 26;
    input[PhysicalQuantityId.MeanRadiantTemperature] = 22;

    toolState.actions.setModelOption(
      OptionKey.TemperatureMode,
      TemperatureMode.Operative,
    );
    expect(input[PhysicalQuantityId.DryBulbTemperature]).toBe(
      input[PhysicalQuantityId.MeanRadiantTemperature],
    );

    toolState.actions.updateInput(
      InputId.Input1,
      InputControlId.Temperature,
      "24",
    );
    expect(input[PhysicalQuantityId.DryBulbTemperature]).toBe(24);
    expect(input[PhysicalQuantityId.MeanRadiantTemperature]).toBe(24);

    toolState.actions.setModelOption(
      OptionKey.TemperatureMode,
      TemperatureMode.Air,
    );
    toolState.actions.updateInput(
      InputId.Input1,
      InputControlId.Temperature,
      "25",
    );
    expect(input[PhysicalQuantityId.DryBulbTemperature]).toBe(25);
    expect(input[PhysicalQuantityId.MeanRadiantTemperature]).toBe(24);
  });

  it.each([
    {
      mode: HumidityInputMode.RelativeHumidity,
      rawValue: "62",
      label: "Relative humidity",
      displayUnits: "%",
      expectedRh: 62,
    },
    {
      mode: HumidityInputMode.HumidityRatio,
      rawValue: "10",
      label: "Humidity ratio",
      displayUnits: "g/kg",
      expectedRh: deriveRelativeHumidityFromHumidityRatio(26, 0.01),
    },
    {
      mode: HumidityInputMode.DewPoint,
      rawValue: "12",
      label: "Dew point",
      displayUnits: "°C",
      expectedRh: deriveRelativeHumidityFromDewPoint(26, 12),
    },
    {
      mode: HumidityInputMode.WetBulb,
      rawValue: "18",
      label: "Wet-bulb temperature",
      displayUnits: "°C",
      expectedRh: deriveRelativeHumidityFromWetBulb(26, 18),
    },
    {
      mode: HumidityInputMode.VaporPressure,
      rawValue: "1.8",
      label: "Vapor pressure",
      displayUnits: "kPa",
      expectedRh: deriveRelativeHumidityFromVaporPressure(26, 1800),
    },
  ])("uses the $mode humidity descriptor for display and RH synchronization", ({
    mode,
    rawValue,
    label,
    displayUnits,
    expectedRh,
  }) => {
    const toolState = createAnalysisState();
    const input = toolState.state.input.quantitiesByInput[InputId.Input1];
    input[PhysicalQuantityId.DryBulbTemperature] = 26;

    toolState.actions.setModelOption(
      OptionKey.HumidityInputMode,
      mode,
    );
    toolState.actions.updateInput(
      InputId.Input1,
      InputControlId.Humidity,
      rawValue,
    );

    expect(input[PhysicalQuantityId.RelativeHumidity]).toBeCloseTo(expectedRh, 6);
    expect(getControl(toolState, InputControlId.Humidity)).toEqual(
      expect.objectContaining({ label, displayUnits }),
    );
  });

  it.each([
    ModelId.Utci,
    ModelId.AdaptiveAshrae,
    ModelId.AdaptiveEn,
  ])("does not route %s temperature changes through PMV humidity behavior", (modelId) => {
    const toolState = createAnalysisState();
    toolState.state.setting.selectedModel = modelId;
    const input = toolState.state.input.quantitiesByInput[InputId.Input1];
    input[PhysicalQuantityId.RelativeHumidity] = 63;

    toolState.actions.setModelOption(
      OptionKey.TemperatureMode,
      TemperatureMode.Operative,
    );
    expect(input[PhysicalQuantityId.RelativeHumidity]).toBe(63);
  });

  it("throws for illegal or incomplete internal options instead of repairing them", () => {
    const toolState = createAnalysisState();
    expect(() => toolState.actions.setModelOption(
      OptionKey.TemperatureMode,
      "invalid-mode",
    )).toThrow(/invalid option/i);

    delete toolState.state.setting.modelOptionsByModel[ModelId.PmvAshrae][
      OptionKey.HumidityInputMode
    ];
    expect(() => toolState.selectors.getInputControls())
      .toThrow(/invalid options state/i);

    const switchingToolState = createAnalysisState();
    switchingToolState.state.setting.modelOptionsByModel[ModelId.WindChill][
      OptionKey.TemperatureMode
    ] = TemperatureMode.Air;
    expect(() => switchingToolState.actions.setSelectedModel(ModelId.WindChill))
      .toThrow(/invalid options state/i);
  });
});
