import { afterEach, describe, expect, it } from "vitest";
import { PhysicalQuantityId } from "../catalog/quantities";

import { calculateAdaptive } from "../declarations/adaptive/calculation";
import { createAdaptiveBoundaryRegionSpec } from "../declarations/adaptive/shared";
import { adaptiveEnDeclaration } from "../declarations/adaptive/en";
import type { AdaptiveRequest } from "../declarations/adaptive/shared";
import { ChartType } from "../catalog/chartTypes";
import { InputId } from "../catalog/inputSlots";
import { FieldChartProfileKind } from "../catalog/fieldChartProfile";
import { UnitSystem } from "../catalog/units";
import { assembleChart, draw, destroy, loadPlotly } from "./index";
import { chartPayloadFromSpec } from "../engines/comfort/charts/toChartPayload";
import { buildModelBoundaryRegionChart } from "../engines/comfort/charts/kinds/modelDataCharts";

const baselineRequest: AdaptiveRequest = {
  tdb: 24,
  tr: 24,
  t_running_mean: 20.16,
  v: 0.1,
};

function buildAdaptiveEnPayload() {
  const result = calculateAdaptive(adaptiveEnDeclaration, baselineRequest);
  const spec = buildModelBoundaryRegionChart(
    createAdaptiveBoundaryRegionSpec(adaptiveEnDeclaration),
    { inputs: { [InputId.Input1]: baselineRequest } },
    { [InputId.Input1]: result, [InputId.Input2]: null, [InputId.Input3]: null },
    {
      unitSystem: UnitSystem.SI,
      baselineInputId: InputId.Input1,
      fieldChartConfig: { profileKind: FieldChartProfileKind.Compliance, xField: PhysicalQuantityId.PrevailingMeanOutdoorTemperature, yField: PhysicalQuantityId.OperativeTemperature, zOutput: adaptiveEnDeclaration.complianceProfile.output, bands: adaptiveEnDeclaration.complianceProfile.bands },
    },
  ).spec;
  return chartPayloadFromSpec(ChartType.Adaptive, spec);
}

describe("draw with Plotly.react", () => {
  let root: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) {
      await destroy(root);
      root.remove();
    }
    root = null;
  });

  it("renders Adaptive EN through repeated Plotly.react calls", async () => {
    await loadPlotly();
    const payload = buildAdaptiveEnPayload();
    const assembled = assembleChart(payload);
    const contour = assembled.data.find((trace) => trace.type === "contour");

    root = document.createElement("div");
    root.style.width = "800px";
    root.style.height = "480px";
    document.body.appendChild(root);

    await draw(root, assembled);
    await draw(root, assembled);

    const gd = root as HTMLDivElement & {
      data?: Array<{ name?: string; x?: unknown[]; z?: unknown }>;
    };
    expect(gd.data?.some((trace) => (
      trace.name === "Category III" && (trace.x?.length ?? 0) > 1
    ))).toBe(true);
    expect(gd.data?.some((trace) => trace.name === "Input 1")).toBe(true);
    expect(contour).toBeUndefined();
    expect(gd.data?.some((trace) => trace.name === "Tooltip Layer")).toBe(false);
  });
});
