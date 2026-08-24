import { describe, expect, it } from "vitest";

import { PhysicalQuantityId } from "../../../models/physicalQuantities";
import { InputId } from "../../../models/inputSlots";
import { UnitSystem } from "../../../models/units";
import { getBaselineInputEntry } from "../helpers";
import { createFieldAxisScale } from "./axis";
import { buildCompareInputMarkerTraces, buildInputTraceGroup } from "./inputPoints";

describe("chart input points", () => {
  it("builds scatter traces from SI payload values", () => {
    const xAxis = createFieldAxisScale({
      field: PhysicalQuantityId.DryBulbTemperature,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 40 },
      points: 2,
    });
    const yAxis = createFieldAxisScale({
      field: PhysicalQuantityId.RelativeHumidity,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 100 },
      points: 2,
    });

    const traces = buildInputTraceGroup({
      inputsMap: {
        [InputId.Input1]: { tdb: 25, rh: 50 },
      },
      resultsByInput: {
        [InputId.Input1]: { category: "Neutral" },
      },
      xAxis,
      yAxis,
      getXSi: (payload) => payload.tdb,
      getYSi: (payload) => payload.rh,
      getHovertemplate: ({ inputLabel, result }) => (
        `${inputLabel}: ${result?.category}<extra></extra>`
      ),
    });

    expect(traces.overlays).toEqual([]);
    expect(traces.markers).toHaveLength(1);
    expect(traces.markers[0]).toEqual(expect.objectContaining({
      name: "Input 1",
      x: [25],
      y: [50],
    }));
    expect(traces.markers[0].hovertemplate).toContain("Neutral");
  });

  it("builds named Compare markers for every plotted input", () => {
    const traces = buildCompareInputMarkerTraces({
      [InputId.Input1]: { x: 1, y: 2 },
      [InputId.Input3]: { x: 3, y: 4 },
    });

    expect(traces.map(({ name, x, y }) => ({ name, x, y }))).toEqual([
      { name: "Input 1", x: [1], y: [2] },
      { name: "Input 3", x: [3], y: [4] },
    ]);
    expect(traces.every(({ mode }) => mode === "markers")).toBe(true);
  });

  it("requires the baseline selected by the chart build context", () => {
    const inputsMap = {
      [InputId.Input1]: { label: "first" },
      [InputId.Input2]: { label: "second" },
    };

    expect(getBaselineInputEntry(inputsMap, InputId.Input2)).toEqual({
      inputId: InputId.Input2,
      payload: { label: "second" },
    });
    expect(() => getBaselineInputEntry(inputsMap, InputId.Input3))
      .toThrow("Missing chart baseline payload for input3.");
  });
});
