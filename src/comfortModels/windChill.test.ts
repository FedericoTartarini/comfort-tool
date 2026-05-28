/**
 * Unit tests for the standalone Wind Chill calculation service.
 */
import { describe, expect, it } from "vitest";
import { calculateWindChill } from "./windChill";
import { UnitSystem } from "../models/units";
import { convertFieldValueFromSi } from "../services/units";
import { FieldKey } from "../models/fieldKeys";

describe("windChill service", () => {
  it("calculates Wind Chill Index and equivalent temperature correctly in SI", () => {
    // -10°C, 10 m/s wind
    const result = calculateWindChill({
      tdb: -10,
      v: 10,
      units: UnitSystem.SI,
    });
    
    expect(result.wci).toBeGreaterThan(1400); // 30 mins to frostbite or worse
    expect(result.wciTemp).toBeLessThan(-20);
    expect(result.wciZone).not.toBe("Safe");
  });

  it("calculates Wind Chill correctly in IP format mappings", () => {
    // 10°F (-12.2°C), 10 ft/s (3.048 m/s)
    const result = calculateWindChill({
      tdb: -12.22, // SI representation of 10°F
      v: 3.048,    // SI representation of 10 ft/s
      units: UnitSystem.SI,
    });
    
    const wciTempF = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.wciTemp, UnitSystem.IP);
    expect(wciTempF).toBeLessThan(5);
    expect(result.wciZone).toBe("Safe");
  });

  it("reverts Wind Chill Temp to Air Temp in mild conditions above 10°C", () => {
    const result = calculateWindChill({
      tdb: 12,
      v: 5,
      units: UnitSystem.SI,
    });
    
    expect(result.wciTemp).toBe(12);
  });
});
