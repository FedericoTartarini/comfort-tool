import { describe, expect, it } from "vitest";

import { FieldKey } from "../../../models/fieldKeys";
import { InputId } from "../../../models/inputSlots";
import { UnitSystem } from "../../../models/units";
import { createFieldAxisScale } from "./axis";
import { buildInputTraceGroups, getBaselineInputEntry } from "./inputPoints";

describe("chart input points", () => {
  it("builds scatter traces from SI payload values", () => {
    const xAxis = createFieldAxisScale({
      field: FieldKey.DryBulbTemperature,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 40 },
      points: 2,
    });
    const yAxis = createFieldAxisScale({
      field: FieldKey.RelativeHumidity,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 100 },
      points: 2,
    });

    const traces = buildInputTraceGroups({
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

    expect(traces).toHaveLength(1);
    expect(traces[0]).toEqual(expect.objectContaining({
      name: "Input 1",
      x: [25],
      y: [50],
    }));
    expect(traces[0].hovertemplate).toContain("Neutral");
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
