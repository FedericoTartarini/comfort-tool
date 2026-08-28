import { describe, expect, it } from "vitest";
import { PhysicalQuantityId } from "./catalog/quantities";

import { InputControlId } from "./catalog/inputControls";
import { InputId } from "./catalog/inputSlots";
import { createAnalysisState } from "./state/analysis/createAnalysisState.svelte";
import { chartFigure } from "./testSupport/modelChartTestHelpers";

async function waitForIdle(
  toolState: ReturnType<typeof createAnalysisState>,
) {
  for (let index = 0; index < 50; index += 1) {
    if (!toolState.state.output.isLoading) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("chart memo debug", () => {
  it("chart marker moves after input change", async () => {
    const toolState = createAnalysisState();
    toolState.actions.setSelectedChartInstance("pmv-ashrae-dynamic-field");
    toolState.actions.setDynamicXAxis(PhysicalQuantityId.DryBulbTemperature);
    toolState.actions.scheduleCalculation({ immediate: true, force: true });
    await waitForIdle(toolState);

    const chart1 = chartFigure(toolState.selectors.getCurrentChartResult());
    const marker1 = chart1?.traces?.find((trace) => trace.name === "Input 1");

    toolState.actions.updateInput(InputId.Input1, InputControlId.Temperature, "32");
    await new Promise((resolve) => setTimeout(resolve, 250));
    await waitForIdle(toolState);

    const chart2 = chartFigure(toolState.selectors.getCurrentChartResult());
    const marker2 = chart2?.traces?.find((trace) => trace.name === "Input 1");
    const temperature = toolState.state.input.quantitiesByInput[InputId.Input1][
      PhysicalQuantityId.DryBulbTemperature
    ];

    expect(temperature).toBe(32);
    expect(chart1).not.toBe(chart2);
    expect(marker2?.x?.[0]).not.toBe(marker1?.x?.[0]);
    expect(marker2?.x?.[0]).toBeCloseTo(32, 6);
  });
});
