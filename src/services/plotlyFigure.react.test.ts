import { afterEach, describe, expect, it } from "vitest";

import { calculateAdaptive } from "../declarations/adaptive/calculation";
import { buildAdaptiveChart } from "../declarations/adaptive/charts";
import { adaptiveEnDeclaration } from "../declarations/adaptive/en";
import type { AdaptiveRequest } from "../declarations/adaptive/shared";
import { InputId } from "../catalog/inputSlots";
import { FieldChartProfileKind } from "../catalog/output/fieldChartProfile";
import { PhysicalQuantityId } from "../catalog/quantities";
import { UnitSystem } from "../catalog/units";
import {
  toPlotlyFigure,
  type PlotlyFigure,
} from "./plotlyFigure";

interface PlotlyModule {
  react: (
    root: HTMLDivElement,
    data: PlotlyFigure["data"],
    layout: PlotlyFigure["layout"],
    config: PlotlyFigure["config"],
  ) => Promise<void>;
  purge: (root: HTMLDivElement) => void;
}

const baselineRequest: AdaptiveRequest = {
  tdb: 24,
  tr: 24,
  trm: 20.16,
  v: 0.1,
};

function buildAdaptiveEnChart() {
  const result = calculateAdaptive(adaptiveEnDeclaration, baselineRequest);
  return buildAdaptiveChart(
    adaptiveEnDeclaration,
    { inputs: { [InputId.Input1]: baselineRequest } },
    { [InputId.Input1]: result },
    {
      unitSystem: UnitSystem.SI,
      baselineInputId: InputId.Input1,
      fieldChartConfig: {
        profileKind: FieldChartProfileKind.Compliance,
        xField: PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
        yField: PhysicalQuantityId.OperativeTemperature,
        zOutput: adaptiveEnDeclaration.complianceProfile.output,
        bands: adaptiveEnDeclaration.complianceProfile.bands,
      },
    },
  );
}

describe("toPlotlyFigure with Plotly.react", () => {
  let root: HTMLDivElement | null = null;
  let plotly: PlotlyModule | null = null;

  afterEach(() => {
    if (root && plotly) {
      plotly.purge(root);
      root.remove();
    }
    root = null;
    plotly = null;
  });

  it("renders Adaptive EN through repeated Plotly.react calls", async () => {
    const imported = await import("plotly.js-dist-min");
    plotly = (imported.default ?? imported) as PlotlyModule;
    const chart = buildAdaptiveEnChart();
    const contour = chart.traces.find((trace) => trace.type === "contour");
    if (!contour) {
      throw new Error("Expected Adaptive EN tooltip contour");
    }

    root = document.createElement("div");
    root.style.width = "800px";
    root.style.height = "480px";
    document.body.appendChild(root);

    const first = toPlotlyFigure(chart);
    await plotly.react(root, first.data, first.layout, first.config);
    const second = toPlotlyFigure(chart);
    await plotly.react(root, second.data, second.layout, second.config);

    const gd = root as HTMLDivElement & {
      data?: Array<{ name?: string; x?: unknown[]; z?: unknown }>;
    };
    expect(gd.data?.some((trace) => (
      trace.name === "Category III" && (trace.x?.length ?? 0) > 1
    ))).toBe(true);
    expect(gd.data?.some((trace) => (
      trace.name === "Tooltip Layer" && Array.isArray(trace.z)
    ))).toBe(true);
    expect(contour.z?.[0]?.[0]).toBe(1);
    expect(second.data.find((trace) => trace.name === "Tooltip Layer")?.z)
      .not.toBe(contour.z);
  });
});
