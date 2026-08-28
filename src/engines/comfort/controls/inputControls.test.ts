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
import { createPointSession } from "../../../state/pointSession/createPointSession.svelte";
import { seedSelectedModel, seedPrimaryQuantity } from "../../../testSupport/seedPointSession";
import {
  deriveRelativeHumidityFromDewPoint,
  deriveRelativeHumidityFromHumidityRatio,
  deriveRelativeHumidityFromVaporPressure,
  deriveRelativeHumidityFromWetBulb,
} from "../derivations";

function getControl(
  session: ReturnType<typeof createPointSession>,
  controlId: InputControlId,
) {
  const control = session.inputControls.find(
    ({ id }) => id === controlId,
  );
  if (!control) throw new Error(`Missing control ${controlId}.`);
  return control;
}

describe("input control ownership", () => {
  it("opts models into operative temperature without affecting ordinary temperature controls", () => {
    const session = createPointSession();
    expect(getControl(session, InputControlId.Temperature).menu?.title)
      .toBe("Temperature input");

    seedSelectedModel(session, ModelId.WindChill);
    expect(getControl(session, InputControlId.Temperature).menu).toBeNull();
    expect(getControl(session, InputControlId.Temperature).label)
      .toBe("Air temperature");
  });

  it("keeps Air and Operative edits reversible through the model option handler", () => {
    const session = createPointSession();
    const input = session.input.quantitiesByInput[InputId.Input1];
    seedPrimaryQuantity(
      session,
      InputId.Input1,
      PhysicalQuantityId.DryBulbTemperature,
      26,
    );
    seedPrimaryQuantity(
      session,
      InputId.Input1,
      PhysicalQuantityId.MeanRadiantTemperature,
      22,
    );

    session.actions.setModelOption(
      OptionKey.TemperatureMode,
      TemperatureMode.Operative,
    );
    expect(input[PhysicalQuantityId.DryBulbTemperature]).toBe(
      input[PhysicalQuantityId.MeanRadiantTemperature],
    );

    session.actions.updateInput(
      InputId.Input1,
      InputControlId.Temperature,
      "24",
    );
    expect(input[PhysicalQuantityId.DryBulbTemperature]).toBe(24);
    expect(input[PhysicalQuantityId.MeanRadiantTemperature]).toBe(24);

    session.actions.setModelOption(
      OptionKey.TemperatureMode,
      TemperatureMode.Air,
    );
    session.actions.updateInput(
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
    const session = createPointSession();
    const input = session.input.quantitiesByInput[InputId.Input1];
    seedPrimaryQuantity(
      session,
      InputId.Input1,
      PhysicalQuantityId.DryBulbTemperature,
      26,
    );

    session.actions.setModelOption(
      OptionKey.HumidityInputMode,
      mode,
    );
    session.actions.updateInput(
      InputId.Input1,
      InputControlId.Humidity,
      rawValue,
    );

    expect(input[PhysicalQuantityId.RelativeHumidity]).toBeCloseTo(expectedRh, 6);
    expect(getControl(session, InputControlId.Humidity)).toEqual(
      expect.objectContaining({ label, displayUnits }),
    );
  });

  it.each([
    ModelId.Utci,
    ModelId.AdaptiveAshrae,
    ModelId.AdaptiveEn,
  ])("does not route %s temperature changes through PMV humidity behavior", (modelId) => {
    const session = createPointSession();
    seedSelectedModel(session, modelId);
    const input = session.input.quantitiesByInput[InputId.Input1];
    seedPrimaryQuantity(
      session,
      InputId.Input1,
      PhysicalQuantityId.RelativeHumidity,
      63,
    );

    session.actions.setModelOption(
      OptionKey.TemperatureMode,
      TemperatureMode.Operative,
    );
    expect(input[PhysicalQuantityId.RelativeHumidity]).toBe(63);
  });

  it("throws for illegal or incomplete internal options instead of repairing them", () => {
    const session = createPointSession();
    expect(() => session.actions.setModelOption(
      OptionKey.TemperatureMode,
      "invalid-mode",
    )).toThrow(/invalid option/i);

    delete session.setting.modelOptionsByModel[ModelId.PmvAshrae][
      OptionKey.HumidityInputMode
    ];
    expect(() => session.inputControls)
      .toThrow(/invalid options state/i);

    const switchingSession = createPointSession();
    switchingSession.setting.modelOptionsByModel[ModelId.WindChill][
      OptionKey.TemperatureMode
    ] = TemperatureMode.Air;
    expect(() => switchingSession.actions.setSelectedModel(ModelId.WindChill))
      .toThrow(/invalid options state/i);
  });
});
