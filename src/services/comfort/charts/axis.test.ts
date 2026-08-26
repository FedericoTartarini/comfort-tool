import { describe, expect, it } from "vitest";

import { PhysicalQuantityId } from "../../../models/quantities";
import { UnitSystem } from "../../../models/units";
import { buildAxisValues, createFieldAxisScale } from "./axis";

describe("chart axes", () => {
  it("preserves SI values while converting display coordinates", () => {
    const axis = createFieldAxisScale({
      field: PhysicalQuantityId.DryBulbTemperature,
      unitSystem: UnitSystem.IP,
      rangeSi: { min: 0, max: 100 },
      points: 2,
    });

    expect(axis.toDisplay(0)).toBe(32);
    expect(axis.toSi(212)).toBe(100);
    expect(axis.units).toBe("°F");
    expect(buildAxisValues(axis)).toEqual({
      siValues: [0, 100],
      displayValues: [32, 212],
      displayRange: { min: 32, max: 212 },
    });
  });

  it("converts humidity-ratio axes from catalog kg/kg storage", () => {
    const axis = createFieldAxisScale({
      field: PhysicalQuantityId.HumidityRatio,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 0.025 },
      points: 2,
    });

    expect(axis.units).toBe("g/kg");
    expect(axis.toDisplay(0.009)).toBeCloseTo(9, 8);
    expect(axis.toSi(9)).toBeCloseTo(0.009, 8);

    const ipAxis = createFieldAxisScale({
      field: PhysicalQuantityId.HumidityRatio,
      unitSystem: UnitSystem.IP,
      rangeSi: { min: 0, max: 0.025 },
      points: 2,
    });
    expect(ipAxis.units).toBe("gr/lb");
    expect(ipAxis.toDisplay(0.009)).toBeCloseTo(63, 8);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid point count %s",
    (points) => {
      const axis = createFieldAxisScale({
        field: PhysicalQuantityId.DryBulbTemperature,
        unitSystem: UnitSystem.SI,
        rangeSi: { min: 0, max: 1 },
        points,
      });

      expect(() => buildAxisValues(axis)).toThrow(
        `Axis points must be a positive integer; received ${points}`,
      );
    },
  );
});
