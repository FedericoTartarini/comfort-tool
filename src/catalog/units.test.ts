import { describe, expect, it } from "vitest";

import {
  IpUnit,
  SiUnit,
  UnitSystem,
  ipUnitLabel,
  siUnitLabel,
  unitLabel,
} from "./units";
import { physicalQuantityMetaById } from "./quantities";

describe("unit catalogs", () => {
  it("labels every SI and IP unit", () => {
    for (const unit of Object.values(SiUnit)) {
      expect(siUnitLabel[unit]).toBeTypeOf("string");
    }
    for (const unit of Object.values(IpUnit)) {
      expect(ipUnitLabel[unit]).toBeTypeOf("string");
    }
  });

  it("pairs each quantity SI unit with a typed IP unit and matching labels", () => {
    const knownSiUnits = new Set(Object.values(SiUnit));
    const knownIpUnits = new Set(Object.values(IpUnit));
    for (const meta of Object.values(physicalQuantityMetaById)) {
      expect(knownSiUnits.has(meta.units.SI)).toBe(true);
      expect(knownIpUnits.has(meta.units.IP)).toBe(true);
      expect(unitLabel(meta.units, UnitSystem.SI)).toBe(siUnitLabel[meta.units.SI]);
      expect(unitLabel(meta.units, UnitSystem.IP)).toBe(ipUnitLabel[meta.units.IP]);
    }
  });
});
