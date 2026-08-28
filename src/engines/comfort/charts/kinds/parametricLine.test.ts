import { describe, expect, it } from "vitest";
import { PhysicalQuantityId } from "../../../../catalog/quantities";

import { CalculationSource } from "../../../../catalog/calculationMetadata";
import { InputId } from "../../../../catalog/inputSlots";
import { type ChartBuildContext } from "../../../../catalog/modelCapabilities";
import { FieldChartProfileKind } from "../../../../catalog/fieldChartProfile";
import { UnitSystem } from "../../../../catalog/units";
import { ParametricYUnit, type ParametricLineGeometry } from "./types";
import { renderParametricLineGeometry } from "./parametricLine";

function createContext(
  unitSystem: UnitSystem = UnitSystem.SI,
): ChartBuildContext {
  return {
    unitSystem,
    baselineInputId: InputId.Input1,
    fieldChartConfig: {
      profileKind: FieldChartProfileKind.Explore,
      xField: PhysicalQuantityId.DryBulbTemperature,
      yField: PhysicalQuantityId.RelativeHumidity,
      zOutput: PhysicalQuantityId.Pmv,
      bands: [{ min: 0, max: 1, label: "All", color: "#ffffff" }],
    },
  };
}

function expectCompareMarkersInsideLayoutRanges(
  plotly: NonNullable<ReturnType<typeof renderParametricLineGeometry>>,
  expectedCount: number,
): void {
  const [xMin, xMax] = plotly.layout.xaxis.range;
  const [yMin, yMax] = plotly.layout.yaxis.range;
  const markers = plotly.traces.filter((trace) => trace.mode === "markers");
  expect(markers).toHaveLength(expectedCount);
  for (const marker of markers) {
    const x = marker.x[0];
    const y = marker.y[0];
    expect(x).toBeGreaterThanOrEqual(xMin);
    expect(x).toBeLessThanOrEqual(xMax);
    expect(y).toBeGreaterThanOrEqual(yMin);
    expect(y).toBeLessThanOrEqual(yMax);
  }
}

const geometry: ParametricLineGeometry = {
  polylines: [
    {
      id: "total",
      label: "Total heat loss",
      color: "#000000",
      yUnit: ParametricYUnit.HeatFlux,
      points: [
        { x: 10, y: 80 },
        { x: 25, y: 60 },
        { x: 40, y: 40 },
      ],
    },
    {
      id: "hidden",
      label: "Hidden component",
      color: "#556B2F",
      yUnit: ParametricYUnit.HeatFlux,
      visible: false,
      points: [
        { x: 10, y: 10 },
        { x: 40, y: 12 },
      ],
    },
  ],
  limitBands: [
    {
      label: "Acceptable range",
      color: "#86efac",
      min: 50,
      max: 70,
      yUnit: ParametricYUnit.HeatFlux,
    },
  ],
  comparePoints: {
    [InputId.Input1]: { x: 25, y: 60 },
  },
};

describe("ParametricLine engine", () => {
  it("renders polylines and optional limit bands without a dense grid", () => {
    const plotly = renderParametricLineGeometry(
      {
        title: "Heat Loss Components",
        xField: PhysicalQuantityId.DryBulbTemperature,
        yLabel: "Heat Loss",
      },
      geometry,
      createContext(),
    );

    expect(plotly).not.toBeNull();
    expect(plotly?.source).toBe(CalculationSource.FrontendGenerated);
    expect(plotly?.traces.some((trace) => trace.type === "contour")).toBe(
      false,
    );
    expect(
      plotly?.traces.some((trace) => "z" in trace && trace.z != null),
    ).toBe(false);

    const band = plotly?.traces.find(
      (trace) => trace.name === "Acceptable range",
    );
    expect(band).toMatchObject({
      type: "scatter",
      mode: "lines",
      fill: "toself",
      isBackgroundZone: true,
    });

    const total = plotly?.traces.find(
      (trace) => trace.name === "Total heat loss",
    );
    expect(total).toMatchObject({
      type: "scatter",
      mode: "lines",
      visible: true,
      showlegend: true,
    });
    expect(total?.x).toEqual([10, 25, 40]);
    expect(total?.y).toEqual([80, 60, 40]);

    const hidden = plotly?.traces.find(
      (trace) => trace.name === "Hidden component",
    );
    expect(hidden?.visible).toBe("legendonly");

    const marker = plotly?.traces.find((trace) => trace.mode === "markers");
    expect(marker).toMatchObject({ type: "scatter", mode: "markers" });
  });

  it("includes Compare-marker y-values in the explicit primary axis ranges", () => {
    const plotly = renderParametricLineGeometry(
      {
        title: "Heat Loss Components",
        xField: PhysicalQuantityId.DryBulbTemperature,
        yLabel: "Heat Loss",
      },
      {
        polylines: geometry.polylines,
        limitBands: geometry.limitBands,
        comparePoints: {
          [InputId.Input1]: { x: 25, y: 60 },
          [InputId.Input2]: { x: 18, y: 249 },
          [InputId.Input3]: { x: 35, y: -20 },
        },
      },
      createContext(),
    );

    expect(plotly).not.toBeNull();
    if (!plotly) return;
    expectCompareMarkersInsideLayoutRanges(plotly, 3);
    const markerYs = plotly.traces
      .filter((trace) => trace.mode === "markers")
      .map((trace) => trace.y[0]);
    expect(Math.max(...markerYs)).toBe(249);
    expect(Math.min(...markerYs)).toBe(-20);
  });

  it("converts temperature and heat-flux series for IP display", () => {
    const plotly = renderParametricLineGeometry(
      {
        title: "SET outputs",
        xField: PhysicalQuantityId.DryBulbTemperature,
        yLabel: "Temperature",
        y2Label: "Heat Loss",
      },
      {
        polylines: [
          {
            id: "set",
            label: "SET temperature",
            color: "#0D6EFC",
            yUnit: ParametricYUnit.Temperature,
            points: [{ x: 25, y: 24 }],
          },
          {
            id: "q-skin",
            label: "Total skin heat loss",
            color: "#000000",
            yUnit: ParametricYUnit.HeatFlux,
            yAxis: "y2",
            points: [{ x: 25, y: 60 }],
          },
        ],
      },
      createContext(UnitSystem.IP),
    );

    expect(plotly?.layout.yaxis2).toEqual(
      expect.objectContaining({
        overlaying: "y",
        side: "right",
      }),
    );
    const setTrace = plotly?.traces.find(
      (trace) => trace.name === "SET temperature",
    );
    expect(setTrace?.x[0]).toBeCloseTo(77, 5);
    expect(setTrace?.y[0]).toBeCloseTo(75.2, 5);
  });
});
