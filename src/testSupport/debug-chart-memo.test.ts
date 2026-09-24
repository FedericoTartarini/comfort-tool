import { describe, expect, it } from "vitest";
import { PhysicalQuantityId } from "../catalog/quantities";

import { InputControlId } from "../catalog/inputControls";
import { InputId } from "../catalog/inputSlots";
import { createPointSession } from "../state/pointSession/createPointSession.svelte";
import { chartFigure } from "./modelChartTestHelpers";

async function waitForIdle(
  session: ReturnType<typeof createPointSession>,
) {
  for (let index = 0; index < 50; index += 1) {
    if (!session.output.isLoading) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("chart memo debug", () => {
  it("chart marker moves after input change", async () => {
    const session = createPointSession();
    session.actions.setSelectedChartInstance("dynamic");
    session.actions.setDynamicXAxis(PhysicalQuantityId.DryBulbTemperature);
    session.actions.scheduleCalculation({ immediate: true, force: true });
    await waitForIdle(session);

    const chart1 = chartFigure(session.chartBuild.payload);
    const marker1 = chart1?.traces?.find((trace) => trace.name === "Input 1");

    session.actions.updateInput(InputId.Input1, InputControlId.Temperature, "32");
    await new Promise((resolve) => setTimeout(resolve, 250));
    await waitForIdle(session);

    const chart2 = chartFigure(session.chartBuild.payload);
    const marker2 = chart2?.traces?.find((trace) => trace.name === "Input 1");
    const temperature = session.input.quantitiesByInput[InputId.Input1][
      PhysicalQuantityId.DryBulbTemperature
    ];

    expect(temperature).toBe(32);
    expect(chart1).not.toBe(chart2);
    expect(marker2?.x?.[0]).not.toBe(marker1?.x?.[0]);
    expect(marker2?.x?.[0]).toBeCloseTo(32, 6);
  });
});
