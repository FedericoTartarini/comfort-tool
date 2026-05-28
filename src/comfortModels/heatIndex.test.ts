/**
 * Unit tests for the Heat Index calculation service.
 */
import { describe, expect, it } from "vitest";
import { calculateHeatIndex } from "./heatIndex";
import { UnitSystem } from "../models/units";
import { convertFieldValueFromSi } from "../services/units";
import { FieldKey } from "../models/fieldKeys";

describe("heatIndex service", () => {
  it("calculates Heat Index correctly in SI format", () => {
    // 35°C, 70% RH -> HI should be ~50°C (Danger)
    const result = calculateHeatIndex({
      tdb: 35,
      rh: 70,
      units: UnitSystem.SI,
    });
    
    expect(result.hi).toBeGreaterThan(45);
    expect(result.category).toBe("Danger");
  });

  it("calculates Heat Index correctly in IP format (Fahrenheit)", () => {
    // 95°F, 70% RH -> HI should be ~122°F (Danger)
    const result = calculateHeatIndex({
      tdb: 95,
      rh: 70,
      units: UnitSystem.IP,
    });
    
    const hiF = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.hi, UnitSystem.IP);
    expect(hiF).toBeGreaterThan(115);
    expect(hiF).toBeLessThan(125);
    expect(result.category).toBe("Danger");
  });

  it("identifies Extreme Danger threshold accurately", () => {
    // 105°F, 75% RH -> HI should be > 130°F (Extreme Danger)
    const result = calculateHeatIndex({
      tdb: 105,
      rh: 75,
      units: UnitSystem.IP,
    });
    
    expect(result.category).toBe("Extreme Danger");
  });
});
