import { describe, expect, it } from "vitest";

import { ChartId } from "../../models/chartOptions";
import { ComfortModel } from "../../models/comfortModels";
import { FieldKey } from "../../models/fieldKeys";
import { InputControlId } from "../../models/inputControls";
import {
  AirSpeedControlMode,
  AirSpeedInputMode,
  OptionKey,
  TemperatureMode,
} from "../../models/inputModes";
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
  it("initializes independent registry defaults for both PMV variants", () => {
    const toolState = createComfortToolState();

    expect(toolState.state.ui.selectedModel).toBe(ComfortModel.PmvAshrae);
    expect(toolState.state.ui.selectedChartByModel[ComfortModel.PmvAshrae])
      .toBe(ChartId.Psychrometric);
    expect(toolState.state.ui.selectedChartByModel[ComfortModel.PmvIso])
      .toBe(ChartId.Psychrometric);
    expect(toolState.state.ui.modelOptionsByModel[ComfortModel.PmvAshrae])
      .not.toBe(toolState.state.ui.modelOptionsByModel[ComfortModel.PmvIso]);
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae])
      .not.toBe(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvIso]);
  });

  it("filters incompatible adaptive axes and ignores invalid selections", () => {
    const toolState = createComfortToolState();
    toolState.state.ui.selectedModel = ComfortModel.AdaptiveAshrae;
    toolState.state.ui.dynamicXAxis = FieldKey.PrevailingMeanOutdoorTemperature;
    toolState.state.ui.dynamicYAxis = FieldKey.OperativeTemperature;

    expect(toolState.selectors.getDynamicXAxisOptions()).toEqual([
      FieldKey.OperativeTemperature,
      FieldKey.RelativeAirSpeed,
      FieldKey.PrevailingMeanOutdoorTemperature,
    ]);

    toolState.actions.setDynamicXAxis(FieldKey.DryBulbTemperature);

    expect(toolState.state.ui.dynamicXAxis).toBe(FieldKey.PrevailingMeanOutdoorTemperature);
    expect(toolState.state.ui.dynamicYAxis).toBe(FieldKey.OperativeTemperature);
    expect(toolState.state.ui.isLoading).toBe(false);

    toolState.actions.setDynamicXAxis(FieldKey.OperativeTemperature);

    expect(toolState.state.ui.dynamicXAxis).toBe(FieldKey.OperativeTemperature);
    expect(toolState.state.ui.dynamicYAxis).toBe(FieldKey.PrevailingMeanOutdoorTemperature);
  });

  it.each([ComfortModel.PmvAshrae, ComfortModel.PmvIso])(
    "filters conflicting operative-temperature axes for %s",
    (modelId) => {
      const toolState = createComfortToolState();
      toolState.state.ui.selectedModel = modelId;
      toolState.state.ui.dynamicXAxis = FieldKey.RelativeAirSpeed;
      toolState.state.ui.dynamicYAxis = FieldKey.OperativeTemperature;

      const xAxisOptions = toolState.selectors.getDynamicXAxisOptions();
      expect(xAxisOptions).not.toContain(FieldKey.DryBulbTemperature);
      expect(xAxisOptions).not.toContain(FieldKey.MeanRadiantTemperature);
      expect(xAxisOptions).toContain(FieldKey.RelativeHumidity);

      toolState.actions.setDynamicXAxis(FieldKey.DryBulbTemperature);

      expect(toolState.state.ui.dynamicXAxis).toBe(FieldKey.RelativeAirSpeed);
      expect(toolState.state.ui.dynamicYAxis).toBe(FieldKey.OperativeTemperature);
      expect(toolState.state.ui.isLoading).toBe(false);
    },
  );

  it("ignores the unsupported occupant-control option for ISO PMV", () => {
    const toolState = createComfortToolState();
    toolState.state.ui.selectedModel = ComfortModel.PmvIso;
    const initialValue = toolState.state.ui.modelOptionsByModel[ComfortModel.PmvIso]
      [OptionKey.AirSpeedControlMode];

    toolState.actions.setModelOption(
      OptionKey.AirSpeedControlMode,
      AirSpeedControlMode.NoLocalControl,
    );

    expect(toolState.state.ui.modelOptionsByModel[ComfortModel.PmvIso]
      [OptionKey.AirSpeedControlMode]).toBe(initialValue);
    expect(toolState.state.ui.isLoading).toBe(false);
  });

  it("allows ISO clothing values above 1.5 clo and flags them when switching to ASHRAE", () => {
    const toolState = createComfortToolState();
    toolState.state.ui.selectedModel = ComfortModel.PmvIso;

    toolState.actions.updateInput(
      InputId.Input1,
      InputControlId.ClothingInsulation,
      "1.8",
    );
    toolState.actions.setSelectedModel(ComfortModel.PmvAshrae);

    expect(toolState.state.inputsByInput[InputId.Input1][FieldKey.ClothingInsulation])
      .toBe(1.8);
    expect(toolState.selectors.getPendingModelSwitch()).toEqual(expect.objectContaining({
      targetModel: ComfortModel.PmvAshrae,
      violations: expect.arrayContaining([
        expect.objectContaining({
          inputId: InputId.Input1,
          controlId: InputControlId.ClothingInsulation,
          currentValue: 1.8,
          maxAllowed: 1.5,
        }),
      ]),
    }));
  });

  it("normalizes dynamic axes deterministically when switching models", async () => {
    const toolState = createComfortToolState();
    toolState.state.ui.dynamicXAxis = FieldKey.DryBulbTemperature;
    toolState.state.ui.dynamicYAxis = FieldKey.OperativeTemperature;

    toolState.actions.setSelectedModel(ComfortModel.AdaptiveAshrae);
    await waitForIdle(toolState);

    expect(toolState.state.ui.selectedModel).toBe(ComfortModel.AdaptiveAshrae);
    expect(toolState.state.ui.dynamicXAxis).toBe(FieldKey.DryBulbTemperature);
    expect(toolState.state.ui.dynamicYAxis).toBe(FieldKey.MeanRadiantTemperature);
  });

  it("preserves ready model caches when switching between models", async () => {
    const toolState = createComfortToolState();

    toolState.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(toolState);

    const pmvChartSource = toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae].chartSource;
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae].status).toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.Utci].status).toBe("empty");

    toolState.actions.setSelectedModel(ComfortModel.Utci);
    await waitForIdle(toolState);

    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.Utci].status).toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae].status).toBe("ready");

    toolState.actions.setSelectedModel(ComfortModel.PmvAshrae);
    expect(toolState.state.ui.isLoading).toBe(false);
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae].chartSource).toBe(pmvChartSource);
  });

  it("keeps ASHRAE and ISO PMV calculations in isolated registry caches", async () => {
    const toolState = createComfortToolState();

    toolState.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(toolState);
    const ashraeSource = toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae].chartSource as any;

    toolState.actions.setSelectedModel(ComfortModel.PmvIso);
    await waitForIdle(toolState);
    const isoSource = toolState.state.ui.calculationCacheByModel[ComfortModel.PmvIso].chartSource as any;

    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae].status).toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvIso].status).toBe("ready");
    expect(ashraeSource).not.toBe(isoSource);
    expect(ashraeSource.modelId).toBe(ComfortModel.PmvAshrae);
    expect(isoSource.modelId).toBe(ComfortModel.PmvIso);

    toolState.actions.setSelectedModel(ComfortModel.PmvAshrae);
    expect(toolState.state.ui.isLoading).toBe(false);
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae].chartSource).toBe(ashraeSource);
  });

  it("stales every model cache when an option patch rewrites shared inputs", async () => {
    const toolState = createComfortToolState();

    toolState.actions.updateInput(InputId.Input1, InputControlId.Temperature, "28");
    toolState.actions.updateInput(InputId.Input1, InputControlId.RadiantTemperature, "20");
    toolState.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(toolState);

    toolState.actions.setSelectedModel(ComfortModel.PmvIso);
    await waitForIdle(toolState);
    toolState.actions.setSelectedModel(ComfortModel.PmvAshrae);

    const previousIsoChartSource = toolState.state.ui.calculationCacheByModel[ComfortModel.PmvIso].chartSource;

    toolState.actions.setModelOption(OptionKey.TemperatureMode, TemperatureMode.Operative);

    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae].status).toBe("stale");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvIso].status).toBe("stale");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvIso].chartSource)
      .toBe(previousIsoChartSource);

    await waitForIdle(toolState);

    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae].status).toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvIso].status).toBe("stale");

    toolState.actions.setSelectedModel(ComfortModel.PmvIso);
    await waitForIdle(toolState);

    const currentIsoChartSource = toolState.state.ui.calculationCacheByModel[ComfortModel.PmvIso]
      .chartSource as any;
    const currentInput = toolState.state.inputsByInput[InputId.Input1];

    expect(currentIsoChartSource).not.toBe(previousIsoChartSource);
    expect(currentIsoChartSource.chartRequest.inputs[InputId.Input1].tdb)
      .toBeCloseTo(currentInput[FieldKey.DryBulbTemperature], 6);
    expect(currentIsoChartSource.chartRequest.inputs[InputId.Input1].tr)
      .toBeCloseTo(currentInput[FieldKey.MeanRadiantTemperature], 6);
  });

  it("stales only the active model cache for a pure option patch", async () => {
    const toolState = createComfortToolState();

    toolState.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(toolState);
    toolState.actions.setSelectedModel(ComfortModel.PmvIso);
    await waitForIdle(toolState);
    toolState.actions.setSelectedModel(ComfortModel.PmvAshrae);

    const isoChartSource = toolState.state.ui.calculationCacheByModel[ComfortModel.PmvIso].chartSource;

    toolState.actions.setModelOption(
      OptionKey.AirSpeedControlMode,
      AirSpeedControlMode.NoLocalControl,
    );

    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae].status).toBe("stale");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvIso].status).toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvIso].chartSource)
      .toBe(isoChartSource);

    await waitForIdle(toolState);

    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae].status).toBe("ready");
  });

  it("stales all model caches after shared input updates and only refreshes the selected model", async () => {
    const toolState = createComfortToolState();

    toolState.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(toolState);
    toolState.actions.setSelectedModel(ComfortModel.Utci);
    await waitForIdle(toolState);
    toolState.actions.setSelectedModel(ComfortModel.PmvAshrae);

    const previousUtciChartSource = toolState.state.ui.calculationCacheByModel[ComfortModel.Utci].chartSource;

    toolState.actions.updateInput(toolState.state.ui.activeInputId, InputControlId.Temperature, "27");

    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae].status).toBe("stale");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.Utci].status).toBe("stale");

    toolState.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(toolState);

    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae].status).toBe("ready");
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
