import { describe, expect, it } from "vitest";

import { ModelOutputKey } from "../../models/modelCapabilities";
import { UnitSystem } from "../../models/units";
import {
  convertModelOutputFromSi,
  convertModelOutputToSi,
  getModelOutputDisplayMeta,
} from "./modelOutputs";
import { BTU_PER_HOUR_SQUARE_FOOT_PER_WATT_SQUARE_METER } from "./physicalQuantities";

describe("model output display conversion", () => {
  it.each([
    ModelOutputKey.Pmv,
    ModelOutputKey.Ppd,
    ModelOutputKey.Humidex,
  ])("keeps identity output %s unchanged", (outputKey) => {
    expect(convertModelOutputFromSi(outputKey, 12.5, UnitSystem.IP)).toBe(12.5);
    expect(convertModelOutputToSi(outputKey, 12.5, UnitSystem.IP)).toBe(12.5);
  });

  it.each([
    ModelOutputKey.Utci,
    ModelOutputKey.HeatIndex,
    ModelOutputKey.OperativeTemperature,
  ])("round-trips temperature output %s", (outputKey) => {
    const display = convertModelOutputFromSi(outputKey, 20, UnitSystem.IP);
    expect(display).toBe(68);
    expect(convertModelOutputToSi(outputKey, display, UnitSystem.IP)).toBeCloseTo(20, 10);
    expect(getModelOutputDisplayMeta(outputKey, UnitSystem.IP).displayUnits).toBe("°F");
  });

  it("round-trips Wind Chill Index heat flux and preserves infinities", () => {
    const display = convertModelOutputFromSi(ModelOutputKey.WindChill, 1000, UnitSystem.IP);
    expect(display).toBeCloseTo(
      1000 * BTU_PER_HOUR_SQUARE_FOOT_PER_WATT_SQUARE_METER,
      12,
    );
    expect(convertModelOutputToSi(ModelOutputKey.WindChill, display, UnitSystem.IP))
      .toBeCloseTo(1000, 8);
    expect(convertModelOutputFromSi(ModelOutputKey.WindChill, Infinity, UnitSystem.IP))
      .toBe(Infinity);
    expect(convertModelOutputToSi(ModelOutputKey.WindChill, -Infinity, UnitSystem.IP))
      .toBe(-Infinity);
  });
});
