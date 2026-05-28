import { describe, expect, it } from "vitest";

import { ComfortModel } from "../../models/comfortModels";
import { InputControlId } from "../../models/inputControls";
import { AirSpeedInputMode, OptionKey, TemperatureMode } from "../../models/inputModes";
import { InputId } from "../../models/inputSlots";
import { UnitSystem } from "../../models/units";
import { createComfortToolState } from "./createComfortToolState.svelte";

async function waitForIdle(toolState: ReturnType<typeof createComfortToolState>) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    if (!toolState.state.ui.isLoading) {
      return;
    }
  }

  throw new Error("Controller did not finish calculating.");
}
describe("createComfortToolState", () => {
  it("preserves ready model caches when switching between models", async () => {
    const toolState = createComfortToolState();

    toolState.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(toolState);

    const pmvChartSource = toolState.state.ui.calculationCacheByModel[ComfortModel.Pmv].chartSource;
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.Pmv].status).toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.Utci].status).toBe("empty");

    toolState.actions.setSelectedModel(ComfortModel.Utci);
    await waitForIdle(toolState);

    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.Utci].status).toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.Pmv].status).toBe("ready");

    toolState.actions.setSelectedModel(ComfortModel.Pmv);
    expect(toolState.state.ui.isLoading).toBe(false);
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.Pmv].chartSource).toBe(pmvChartSource);
  });

  it("stales only the active model when a model option changes", async () => {
    const toolState = createComfortToolState();

    toolState.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(toolState);
    toolState.actions.setSelectedModel(ComfortModel.Utci);
    await waitForIdle(toolState);
    toolState.actions.setSelectedModel(ComfortModel.Pmv);

    const utciChartSource = toolState.state.ui.calculationCacheByModel[ComfortModel.Utci].chartSource;

    toolState.actions.setModelOption(OptionKey.TemperatureMode, TemperatureMode.Operative);

    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.Pmv].status).toBe("stale");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.Utci].status).toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.Utci].chartSource).toBe(utciChartSource);

    await waitForIdle(toolState);

    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.Pmv].status).toBe("ready");
  });

  it("stales all model caches after shared input updates and only refreshes the selected model", async () => {
    const toolState = createComfortToolState();

    toolState.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(toolState);
    toolState.actions.setSelectedModel(ComfortModel.Utci);
    await waitForIdle(toolState);
    toolState.actions.setSelectedModel(ComfortModel.Pmv);

    const previousUtciChartSource = toolState.state.ui.calculationCacheByModel[ComfortModel.Utci].chartSource;

    toolState.actions.updateInput(toolState.state.ui.activeInputId, InputControlId.Temperature, "27");

    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.Pmv].status).toBe("stale");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.Utci].status).toBe("stale");

    toolState.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(toolState);

    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.Pmv].status).toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.Utci].status).toBe("stale");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.Utci].chartSource).toBe(previousUtciChartSource);
  });

  it("rebuilds result and chart presentation on unit toggle without mutating cached SI results", async () => {
    const toolState = createComfortToolState();

    toolState.actions.setSelectedModel(ComfortModel.Utci);
    await waitForIdle(toolState);

    const rawUtci = (toolState.state.ui.calculationCacheByModel[ComfortModel.Utci].resultsByInput.input1 as any)?.utci;
    const chartSource = toolState.state.ui.calculationCacheByModel[ComfortModel.Utci].chartSource;
    const siResultText = toolState.selectors.getResultSections()[0].valuesByInput.input1?.text;
    const siChartTitle = String(toolState.selectors.getCurrentChartResult()?.layout.xaxis.title ?? "");

    toolState.actions.toggleUnitSystem();

    const ipResultText = toolState.selectors.getResultSections()[0].valuesByInput.input1?.text;
    const ipChartTitle = String(toolState.selectors.getCurrentChartResult()?.layout.xaxis.title ?? "");

    expect(rawUtci).toBe((toolState.state.ui.calculationCacheByModel[ComfortModel.Utci].resultsByInput.input1 as any)?.utci);
    expect(chartSource).toBe(toolState.state.ui.calculationCacheByModel[ComfortModel.Utci].chartSource);
    expect(siResultText).toContain("°C");
    expect(ipResultText).toContain("°F");
    expect(siChartTitle).toContain("°C");
    expect(ipChartTitle).toContain("°F");
    expect(toolState.state.ui.unitSystem).toBe(UnitSystem.IP);
  });

  it("recomputes derived control displays from canonical input patches", () => {
    const toolState = createComfortToolState();

    toolState.actions.setModelOption(OptionKey.AirSpeedInputMode, AirSpeedInputMode.Measured);
    toolState.actions.updateInput(InputId.Input1, InputControlId.AirSpeed, "0.6");

    const airSpeedControl = toolState.selectors.getInputControls()
      .find((control) => control.id === InputControlId.AirSpeed);

    expect(airSpeedControl?.numericValuesByInput.input1).toBeCloseTo(0.6, 6);
  });
});
