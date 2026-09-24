import { describe, expect, it } from "vitest";

import { IpUnit, SiUnit, ipUnitForSi } from "./units";
import {
  PhysicalQuantityId,
  QuantityCategory,
  derivedHumidityQuantityIds,
  physicalQuantityMetaById,
} from "./quantities";

describe("quantities metadata", () => {
  it("defines catalog metadata for every quantity id", () => {
    for (const id of Object.values(PhysicalQuantityId)) {
      expect(physicalQuantityMetaById[id]).toBeDefined();
    }
  });

  it("keeps humidity quantities tagged and derived ids off the persisted share bag", () => {
    const taggedHumidityIds = Object.entries(physicalQuantityMetaById)
      .filter(([, meta]) => meta.category === QuantityCategory.Humidity)
      .map(([id]) => id);
    expect(taggedHumidityIds).toEqual([
      PhysicalQuantityId.RelativeHumidity,
      PhysicalQuantityId.HumidityRatio,
      PhysicalQuantityId.DewPointTemperature,
      PhysicalQuantityId.WetBulbTemperature,
      PhysicalQuantityId.VaporPressure,
    ]);
    expect(new Set(derivedHumidityQuantityIds)).toEqual(
      new Set(taggedHumidityIds.filter((id) => id !== PhysicalQuantityId.RelativeHumidity)),
    );
  });

  it("keeps body weight and height as catalog quantities", () => {
    expect(physicalQuantityMetaById[PhysicalQuantityId.BodyWeight].siUnit).toBe(SiUnit.Kilogram);
    expect(physicalQuantityMetaById[PhysicalQuantityId.Height].siUnit).toBe(SiUnit.Meter);
  });

  it("stores humidity ratio as kg/kg and vapor pressure as Pa", () => {
    expect(physicalQuantityMetaById[PhysicalQuantityId.HumidityRatio].siUnit)
      .toBe(SiUnit.KilogramPerKilogram);
    expect(physicalQuantityMetaById[PhysicalQuantityId.VaporPressure].siUnit)
      .toBe(SiUnit.Pascal);
  });

  it("uses known SI units for every catalog quantity", () => {
    const knownSiUnits = new Set(Object.values(SiUnit));
    for (const meta of Object.values(physicalQuantityMetaById)) {
      expect(knownSiUnits.has(meta.siUnit)).toBe(true);
    }
  });

  it("includes result quantities in the closed catalog with JS-aligned wires", () => {
    expect(PhysicalQuantityId.PredictedMeanVote).toBe("pmv");
    expect(PhysicalQuantityId.HeatIndex).toBe("hi");
    expect(PhysicalQuantityId.CoolingEffect).toBe("ce");
    expect(PhysicalQuantityId.LimitingExposureTime).toBe("limiting_exposure_time");
    expect(physicalQuantityMetaById[PhysicalQuantityId.HeatIndex].siUnit)
      .toBe(SiUnit.DegreeCelsius);
    expect(physicalQuantityMetaById[PhysicalQuantityId.CoolingEffect].siUnit)
      .toBe(SiUnit.KelvinDelta);
    expect(physicalQuantityMetaById[PhysicalQuantityId.LimitingExposureTime].siUnit)
      .toBe(SiUnit.Minute);
    expect(ipUnitForSi[physicalQuantityMetaById[PhysicalQuantityId.LimitingExposureTime].siUnit])
      .toBe(IpUnit.Hour);
  });
});
