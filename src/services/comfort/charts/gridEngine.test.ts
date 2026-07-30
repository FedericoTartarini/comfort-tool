import { describe, expect, it } from "vitest";

import { FieldKey } from "../../../models/fieldKeys";
import { UnitSystem } from "../../../models/units";
import { createFieldAxisScale } from "./axis";
import { evaluateGrid } from "./gridEngine";

function createAxes() {
  return {
    xAxis: createFieldAxisScale({
      field: FieldKey.DryBulbTemperature,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 1 },
      points: 2,
    }),
    yAxis: createFieldAxisScale({
      field: FieldKey.RelativeHumidity,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 1 },
      points: 2,
    }),
  };
}

describe("grid engine", () => {
  it("turns point failures into NaN cells", () => {
    const { xAxis, yAxis } = createAxes();
    const grid = evaluateGrid({
      xAxis,
      yAxis,
      evaluatePoint: (xSi, ySi) => {
        if (xSi > 0.5) throw new Error("outside");
        return { z: xSi + ySi, text: "ok", hoverMetadata: [xSi, ySi] };
      },
    });

    expect(grid.zValues).toEqual([[0, NaN], [1, NaN]]);
    expect(grid.textValues[0]).toEqual(["ok", "Error"]);
    expect(grid.hoverMetadata[0]).toEqual([[0, 0], [NaN]]);
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
