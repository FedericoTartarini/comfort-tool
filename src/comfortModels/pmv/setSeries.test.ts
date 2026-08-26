import { describe, expect, it } from "vitest";

import { pickPmvRequest } from "../../testSupport/goldenFixtures";
import { InputId } from "../../models/inputSlots";
import {
  ModelOutputKey,
  type ChartBuildContext,
} from "../../models/modelCapabilities";
import { FieldChartProfileKind } from "../../models/output/fieldChartProfile";
import { PhysicalQuantityId } from "../../models/quantities";
import { UnitSystem } from "../../models/units";
import { createEmptyResults } from "../../state/comfortTool/modelConfigs/builder";
import { buildModelParametricLineChart } from "../../services/comfort/charts/kinds/parametricLine";
import {
  calculatePmvSetOutputs,
  createPmvSetParametricSpec,
} from "./setSeries";

function createContext(): ChartBuildContext {
  return {
    unitSystem: UnitSystem.SI,
    baselineInputId: InputId.Input1,
    fieldChartConfig: {
      profileKind: FieldChartProfileKind.Explore,
      xField: PhysicalQuantityId.DryBulbTemperature,
      yField: PhysicalQuantityId.RelativeHumidity,
      zOutput: ModelOutputKey.Pmv,
      bands: [{ min: -0.5, max: 0.5, label: "Neutral", color: "#f2f2f2" }],
    },
  };
}

describe("PMV SET series", () => {
  it("returns SET and two-node outputs for a PMV request", () => {
    const outputs = calculatePmvSetOutputs(pickPmvRequest());
    expect(outputs).not.toBeNull();
    expect(outputs?.set).toBeGreaterThan(10);
    expect(outputs?.tCore).toBeGreaterThan(outputs?.tSkin ?? 0);
    expect(outputs?.qSkin).toBeGreaterThan(0);
  });

  it("renders SET temperature and heat-loss series against dry-bulb temperature", () => {
    const plotly = buildModelParametricLineChart(
      createPmvSetParametricSpec(),
      { inputs: { [InputId.Input1]: pickPmvRequest() } },
      createEmptyResults(),
      createContext(),
    );

    expect(plotly).not.toBeNull();
    expect(plotly?.layout.title).toBe("SET outputs");
    expect(plotly?.layout.yaxis2).toEqual(
      expect.objectContaining({
        overlaying: "y",
        side: "right",
      }),
    );
    expect(plotly?.traces.some((trace) => trace.type === "contour")).toBe(
      false,
    );

    const setTrace = plotly?.traces.find(
      (trace) => trace.name === "SET temperature",
    );
    expect(setTrace).toMatchObject({
      type: "scatter",
      mode: "lines",
      visible: true,
      yaxis: "y",
    });
    const setX = setTrace?.x ?? [];
    expect(setX[0]).toBe(10);
    expect(setX[setX.length - 1]).toBe(40);
    const setY = setTrace?.y ?? [];
    expect(setY[setY.length - 1]).toBeGreaterThan(setY[0] ?? 0);

    const skinLoss = plotly?.traces.find(
      (trace) => trace.name === "Total skin heat loss",
    );
    expect(skinLoss).toMatchObject({ yaxis: "y2", visible: true });

    const hidden = plotly?.traces.find(
      (trace) => trace.name === "Mean body temperature",
    );
    expect(hidden?.visible).toBe("legendonly");
  });
});
