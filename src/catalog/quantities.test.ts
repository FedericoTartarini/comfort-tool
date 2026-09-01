import { describe, expect, it } from "vitest";

import { IpUnit, SiUnit } from "./units";
import {
  PhysicalQuantityId,
  QuantityCategory,
  derivedHumidityQuantityIds,
  humidityQuantityIds,
  physicalQuantityMetaById,
  primaryInputOrder,
} from "./quantities";

describe("quantities metadata", () => {
  it("defines catalog metadata for every quantity id", () => {
    for (const id of Object.values(PhysicalQuantityId)) {
      expect(physicalQuantityMetaById[id].id).toBe(id);
    }
  });

  it("keeps humidity quantities tagged and derived ids off the primary record", () => {
    const taggedHumidityIds = Object.values(physicalQuantityMetaById)
      .filter((meta) => meta.category === QuantityCategory.Humidity)
      .map((meta) => meta.id);
    expect(taggedHumidityIds).toEqual([
      PhysicalQuantityId.RelativeHumidity,
      PhysicalQuantityId.HumidityRatio,
      PhysicalQuantityId.DewPointTemperature,
      PhysicalQuantityId.WetBulbTemperature,
      PhysicalQuantityId.VaporPressure,
    ]);
    expect(new Set(humidityQuantityIds())).toEqual(
      new Set(taggedHumidityIds.filter((id) => id !== PhysicalQuantityId.RelativeHumidity)),
    );
    expect(new Set(derivedHumidityQuantityIds)).toEqual(new Set(humidityQuantityIds()));
    expect(humidityQuantityIds()).not.toContain(PhysicalQuantityId.RelativeHumidity);
    expect(primaryInputOrder).not.toContain(PhysicalQuantityId.HumidityRatio);
  });

  it("keeps body weight and height outside the persisted primary key set", () => {
    expect(primaryInputOrder).not.toContain(PhysicalQuantityId.BodyWeight);
    expect(primaryInputOrder).not.toContain(PhysicalQuantityId.Height);
  });

  it("stores humidity ratio as kg/kg and vapor pressure as Pa", () => {
    expect(physicalQuantityMetaById[PhysicalQuantityId.HumidityRatio].units.SI)
      .toBe(SiUnit.KilogramPerKilogram);
    expect(physicalQuantityMetaById[PhysicalQuantityId.HumidityRatio].defaultSi).toBe(0.009);
    expect(physicalQuantityMetaById[PhysicalQuantityId.VaporPressure].units.SI)
      .toBe(SiUnit.Pascal);
    expect(physicalQuantityMetaById[PhysicalQuantityId.VaporPressure].defaultSi).toBe(1500);
  });

  it("uses known SI and IP units for every catalog quantity", () => {
    const knownSiUnits = new Set(Object.values(SiUnit));
    const knownIpUnits = new Set(Object.values(IpUnit));
    for (const meta of Object.values(physicalQuantityMetaById)) {
      expect(knownSiUnits.has(meta.units.SI)).toBe(true);
      expect(knownIpUnits.has(meta.units.IP)).toBe(true);
    }
  });

  it("includes result quantities in the closed catalog with JS-aligned wires", () => {
    expect(PhysicalQuantityId.PredictedMeanVote).toBe("pmv");
    expect(PhysicalQuantityId.HeatIndex).toBe("hi");
    expect(PhysicalQuantityId.CoolingEffect).toBe("ce");
    expect(PhysicalQuantityId.LimitingExposureTime).toBe("limiting_exposure_time");
    expect(physicalQuantityMetaById[PhysicalQuantityId.HeatIndex].units.SI)
      .toBe(SiUnit.DegreeCelsius);
    expect(physicalQuantityMetaById[PhysicalQuantityId.CoolingEffect].units.SI)
      .toBe(SiUnit.KelvinDelta);
    expect(physicalQuantityMetaById[PhysicalQuantityId.LimitingExposureTime].units.SI)
      .toBe(SiUnit.Minute);
    expect(physicalQuantityMetaById[PhysicalQuantityId.LimitingExposureTime].units.IP)
      .toBe(IpUnit.Hour);
  });
});
