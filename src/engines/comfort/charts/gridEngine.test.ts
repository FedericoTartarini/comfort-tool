import { describe, expect, it } from "vitest";
import { PhysicalQuantityId } from "../../../catalog/quantities";

import { UnitSystem } from "../../../catalog/units";
import { createFieldAxisScale } from "./axis";
import { evaluateGrid } from "./gridEngine";

function createAxes() {
  return {
    xAxis: createFieldAxisScale({
      field: PhysicalQuantityId.DryBulbTemperature,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 1 },
      points: 2,
    }),
    yAxis: createFieldAxisScale({
      field: PhysicalQuantityId.RelativeHumidity,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 1 },
      points: 2,
    }),
  };
}

describe("grid engine", () => {
  it("turns explicit unplottable evaluations into NaN cells", () => {
    const { xAxis, yAxis } = createAxes();
    const grid = evaluateGrid({
      xAxis,
      yAxis,
      evaluatePoint: (xSi, ySi) => {
        if (xSi > 0.5) return null;
        return { z: xSi + ySi, text: "ok", hoverMetadata: [xSi, ySi] };
      },
    });

    expect(grid.zValues).toEqual([[0, NaN], [1, NaN]]);
    expect(grid.textValues[0]).toEqual(["ok", ""]);
    expect(grid.hoverMetadata[0]).toEqual([[0, 0], []]);
  });

  it("propagates unexpected evaluation errors", () => {
    const { xAxis, yAxis } = createAxes();

    expect(() => evaluateGrid({
      xAxis,
      yAxis,
      evaluatePoint: () => {
        throw new Error("unexpected failure");
      },
    })).toThrow("unexpected failure");
  });

  it("preserves scalar and tuple hover metadata", () => {
    const { xAxis, yAxis } = createAxes();
    const grid = evaluateGrid({
      xAxis,
      yAxis: { ...yAxis, points: 1 },
      evaluatePoint: (xSi, ySi) => ({
        z: xSi + ySi,
        hoverMetadata: xSi === 0 ? 12.5 : [xSi, ySi],
      }),
    });

    expect(grid.hoverMetadata[0]).toEqual([12.5, [1, 0]]);
  });
});
