import { describe, expect, it } from "vitest";

import { ChartInstanceId } from "./models/output/chartInstances";
import { InputControlId } from "./models/inputControls";
import { InputId } from "./models/inputSlots";
import { PhysicalQuantityId } from "./models/physicalQuantities";
import { createComfortToolState } from "./state/comfortTool/createComfortToolState.svelte";

async function waitForIdle(
  toolState: ReturnType<typeof createComfortToolState>,
) {
  for (let index = 0; index < 50; index += 1) {
    if (!toolState.state.ui.isLoading) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("chart memo debug", () => {
  it("chart marker moves after input change", async () => {
    const toolState = createComfortToolState();
    toolState.actions.setSelectedChartInstance(ChartInstanceId.PmvAshrae.DynamicField);
    toolState.actions.setDynamicXAxis(PhysicalQuantityId.DryBulbTemperature);
    toolState.actions.scheduleCalculation({ immediate: true, force: true });
    await waitForIdle(toolState);

    const chart1 = toolState.selectors.getCurrentChartResult();
    const marker1 = chart1?.traces?.find((trace) => trace.name === "Input 1");

    toolState.actions.updateInput(InputId.Input1, InputControlId.Temperature, "32");
    await new Promise((resolve) => setTimeout(resolve, 250));
    await waitForIdle(toolState);

    const chart2 = toolState.selectors.getCurrentChartResult();
    const marker2 = chart2?.traces?.find((trace) => trace.name === "Input 1");
    const temperature = toolState.state.quantitiesByInput[InputId.Input1][
      PhysicalQuantityId.DryBulbTemperature
    ];

    expect(temperature).toBe(32);
    expect(chart1).not.toBe(chart2);
    expect(marker2?.x?.[0]).not.toBe(marker1?.x?.[0]);
    expect(marker2?.x?.[0]).toBeCloseTo(32, 6);
  });
});
