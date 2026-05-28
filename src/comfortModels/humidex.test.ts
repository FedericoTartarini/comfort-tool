/**
 * Unit tests for the Humidex comfort model calculation service.
 */
import { describe, expect, it } from "vitest";
import { calculateHumidex } from "./humidex";
import { UnitSystem } from "../models/units";

describe("humidex service", () => {
  it("calculates Humidex correctly and assigns appropriate discomfort level", () => {
    // 30°C, 70% RH -> Humidex should be ~41 (Intense)
    const result = calculateHumidex({
      tdb: 30,
      rh: 70,
      units: UnitSystem.SI,
    });
    
    expect(result.humidex).toBeGreaterThan(40);
    expect(result.humidex).toBeLessThan(43);
    expect(result.humidexDiscomfort).toBe("Intense");
  });

  it("identifies extreme stroke probable conditions", () => {
    // 40°C, 75% RH -> Humidex is highly elevated
    const result = calculateHumidex({
      tdb: 40,
      rh: 75,
      units: UnitSystem.SI,
    });
    
    expect(result.humidex).toBeGreaterThanOrEqual(54);
    expect(result.humidexDiscomfort).toBe("Stroke Probable");
  });

  it("returns mild/none discomfort in low temperatures", () => {
    const result = calculateHumidex({
      tdb: 15,
      rh: 30,
      units: UnitSystem.SI,
    });
    
    expect(result.humidexDiscomfort).toBe("Little/None");
  });
});
