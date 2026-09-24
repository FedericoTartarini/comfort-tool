import { describe, expect, it } from "vitest";

import {
  IpUnit,
  SiUnit,
  UnitSystem,
  ipUnitForSi,
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

  it("pairs each SI unit with a typed IP unit", () => {
    for (const unit of Object.values(SiUnit)) {
      expect(Object.values(IpUnit)).toContain(ipUnitForSi[unit]);
    }
  });

  it("pairs each quantity SI unit with matching labels", () => {
    const knownSiUnits = new Set(Object.values(SiUnit));
    for (const meta of Object.values(physicalQuantityMetaById)) {
      expect(knownSiUnits.has(meta.siUnit)).toBe(true);
      expect(unitLabel(meta.siUnit, UnitSystem.SI)).toBe(siUnitLabel[meta.siUnit]);
      expect(unitLabel(meta.siUnit, UnitSystem.IP)).toBe(
        ipUnitLabel[ipUnitForSi[meta.siUnit]],
      );
    }
  });
});
