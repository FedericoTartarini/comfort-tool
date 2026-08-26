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
  PMV_MET_TO_HEAT_FLUX,
  calculatePmvHeatLossComponents,
  createPmvHeatLossParametricSpec,
} from "./heatLossSeries";

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

describe("PMV heat-loss vs temperature series", () => {
  it("returns ISO 7730 heat-loss components in W/m²", () => {
    const components = calculatePmvHeatLossComponents(pickPmvRequest());
    expect(components).not.toBeNull();
    expect(components?.metabolicRate).toBeCloseTo(
      1.2 * PMV_MET_TO_HEAT_FLUX,
      8,
    );
    expect(components?.totalHeatLoss).toBeCloseTo(
      (components?.totalLatent ?? 0) + (components?.totalSensible ?? 0),
      8,
    );
    expect(components?.totalHeatLoss).toBeGreaterThan(0);
  });

  it("renders heat-loss polylines against dry-bulb temperature", () => {
    const request = pickPmvRequest();
    const plotly = buildModelParametricLineChart(
      createPmvHeatLossParametricSpec(),
      { inputs: { [InputId.Input1]: request } },
      createEmptyResults(),
      createContext(),
    );

    expect(plotly).not.toBeNull();
    expect(plotly?.layout.title).toBe("Heat Loss Components");
    expect(plotly?.traces.some((trace) => trace.type === "contour")).toBe(
      false,
    );

    const total = plotly?.traces.find(
      (trace) => trace.name === "Total heat loss",
    );
    const metabolic = plotly?.traces.find(
      (trace) => trace.name === "Metabolic rate",
    );
    expect(total).toMatchObject({
      type: "scatter",
      mode: "lines",
      visible: true,
    });
    expect(metabolic).toMatchObject({
      type: "scatter",
      mode: "lines",
      visible: true,
    });
    const totalX = total?.x ?? [];
    expect(totalX[0]).toBe(10);
    expect(totalX[totalX.length - 1]).toBe(40);
    expect(total?.y.length).toBeGreaterThan(2);

    const totalY = total?.y ?? [];
    expect(totalY[0]).toBeGreaterThan(totalY[totalY.length - 1] ?? 0);

    const metabolicY = metabolic?.y ?? [];
    expect(new Set(metabolicY.map((value) => value.toFixed(6))).size).toBe(1);

    const hidden = plotly?.traces.find(
      (trace) =>
        trace.name === "Water vapor diffusion through the skin - Latent",
    );
    expect(hidden?.visible).toBe("legendonly");
    expect(
      plotly?.traces.filter(
        (trace) => trace.type === "scatter" && trace.mode === "lines",
      ),
    ).toHaveLength(10);
  });

  it("keeps three Compare markers inside the explicit x and y ranges", () => {
    const plotly = buildModelParametricLineChart(
      createPmvHeatLossParametricSpec(),
      {
        inputs: {
          [InputId.Input1]: pickPmvRequest(),
          [InputId.Input2]: pickPmvRequest({
            [PhysicalQuantityId.DryBulbTemperature]: 18,
            [PhysicalQuantityId.MetabolicRate]: 4,
          }),
          [InputId.Input3]: pickPmvRequest({
            [PhysicalQuantityId.DryBulbTemperature]: 35,
            [PhysicalQuantityId.MetabolicRate]: 4,
            [PhysicalQuantityId.ClothingInsulation]: 1.5,
          }),
        },
      },
      createEmptyResults(),
      createContext(),
    );

    expect(plotly).not.toBeNull();
    if (!plotly) return;

    const markers = plotly.traces.filter((trace) => trace.mode === "markers");
    expect(markers).toHaveLength(3);

    const [xMin, xMax] = plotly.layout.xaxis.range;
    const [yMin, yMax] = plotly.layout.yaxis.range;
    for (const marker of markers) {
      const x = marker.x[0];
      const y = marker.y[0];
      expect(x).toBeGreaterThanOrEqual(xMin);
      expect(x).toBeLessThanOrEqual(xMax);
      expect(y).toBeGreaterThanOrEqual(yMin);
      expect(y).toBeLessThanOrEqual(yMax);
    }

    const total = plotly.traces.find(
      (trace) => trace.name === "Total heat loss",
    );
    const seriesMax = Math.max(...(total?.y ?? [Number.NEGATIVE_INFINITY]));
    const markerYs = markers.map((marker) => marker.y[0]);
    expect(Math.max(...markerYs)).toBeGreaterThan(seriesMax);
  });
});
