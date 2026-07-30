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
import { ModelOutputKey } from "../../models/modelCapabilities";
import { pmvAshraeModelConfig } from "../../comfortModels/pmvAshrae";
import type { PmvChartSourceDto } from "../../comfortModels/pmvShared";
import type { UtciResponseDto } from "../../comfortModels/utci";
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
    expect(toolState.state.ui.exploreChart?.zOutput).toBe(ModelOutputKey.Pmv);
    expect(toolState.state.ui.exploreChart?.bands)
      .not.toBe(pmvAshraeModelConfig.chartableOutputs[0].defaultBands);
  });

  it("rebuilds chart presentation without invalidating or replacing ready calculations", async () => {
    const toolState = createComfortToolState();
    toolState.actions.setCompareEnabled(true);
    await waitForIdle(toolState);

    const cache = toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae];
    const chartSource = cache.chartSource;
    const resultsByInput = cache.resultsByInput;
    const input1Result = cache.resultsByInput[InputId.Input1];
    const assertCalculationIdentity = () => {
      const current = toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae];
      expect(current).toBe(cache);
      expect(current.status).toBe("ready");
      expect(current.chartSource).toBe(chartSource);
      expect(current.resultsByInput).toBe(resultsByInput);
      expect(current.resultsByInput[InputId.Input1]).toBe(input1Result);
      expect(toolState.state.ui.isLoading).toBe(false);
    };

    toolState.actions.setSelectedChart(ChartId.PmvDynamic);
    assertCalculationIdentity();
    expect(toolState.selectors.getCurrentChartResult()?.layout.title)
      .toContain("Dynamic Chart");

    expect(
      toolState.selectors.getChartControlsViewModel().explore?.config,
    ).toEqual(expect.objectContaining({
      xField: FieldKey.DryBulbTemperature,
      yField: FieldKey.RelativeHumidity,
      zOutput: ModelOutputKey.Pmv,
    }));
    expect(toolState.selectors.getCurrentChartLegendTitle()).toBe("PMV Zones");

    toolState.actions.setDynamicXAxis(FieldKey.MeanRadiantTemperature);
    assertCalculationIdentity();
    toolState.actions.setDynamicYAxis(FieldKey.OperativeTemperature);
    assertCalculationIdentity();
    toolState.actions.setChartBaselineInputId(InputId.Input2);
    assertCalculationIdentity();

    toolState.actions.setExploreOutput(ModelOutputKey.Ppd);
    assertCalculationIdentity();
    expect(toolState.state.ui.exploreChart?.zOutput).toBe(ModelOutputKey.Ppd);
    expect(toolState.selectors.getCurrentChartLegendTitle()).toBe("PPD Bands");

    const ppdBands = toolState.state.ui.exploreChart?.bands.map((band) => ({ ...band })) ?? [];
    toolState.actions.setExploreOutput(ModelOutputKey.Utci);
    assertCalculationIdentity();
    expect(toolState.state.ui.exploreChart?.zOutput).toBe(ModelOutputKey.Ppd);

    expect(toolState.actions.setExploreBands([
      { min: 0, max: 20, label: "One", color: "#000" },
      { min: 10, max: 30, label: "Two", color: "#fff" },
    ])).toBe(false);
    assertCalculationIdentity();
    expect(toolState.state.ui.exploreChart?.bands).toEqual(ppdBands);

    expect(toolState.actions.setExploreBands([
      { min: 10, max: Infinity, label: "High", color: "#f00" },
      { min: -Infinity, max: 10, label: "Low", color: "#00f" },
    ])).toBe(true);
    assertCalculationIdentity();
    expect(toolState.state.ui.exploreChart?.bands.map(({ label }) => label))
      .toEqual(["Low", "High"]);

    const editedExploreState = toolState.state.ui.exploreChart;
    const editedBands = editedExploreState?.bands;
    toolState.actions.setExploreOutput(ModelOutputKey.Ppd);
    expect(toolState.state.ui.exploreChart).toBe(editedExploreState);
    expect(toolState.state.ui.exploreChart?.bands).toBe(editedBands);

    toolState.actions.toggleUnitSystem();
    assertCalculationIdentity();
    expect(toolState.state.ui.exploreChart?.bands[1].min).toBe(10);
    expect(toolState.selectors.getCurrentChartResult()).not.toBeNull();
  });

  it("retains Explore edits across chart changes and reseeds on model changes", async () => {
    const toolState = createComfortToolState();
    toolState.actions.setExploreOutput(ModelOutputKey.Ppd);
    toolState.actions.setExploreBands([
      { min: -Infinity, max: 15, label: "Preferred", color: "#0f0" },
      { min: 15, max: Infinity, label: "Other", color: "#f00" },
    ]);

    toolState.actions.setSelectedChart(ChartId.PmvDynamic);
    toolState.actions.setSelectedChart(ChartId.Psychrometric);
    expect(toolState.state.ui.exploreChart?.bands[0].label).toBe("Preferred");
    expect(toolState.selectors.getChartControlsViewModel().explore).toBeNull();

    toolState.actions.setSelectedModel(ComfortModel.Utci);
    await waitForIdle(toolState);
    expect(toolState.state.ui.exploreChart?.zOutput).toBe(ModelOutputKey.Utci);

    toolState.actions.setSelectedModel(ComfortModel.AdaptiveAshrae);
    await waitForIdle(toolState);
    expect(toolState.state.ui.exploreChart).toBeNull();
    expect(toolState.selectors.getChartControlsViewModel().explore).toBeNull();
  });

  it("keeps share-state v1 unchanged and reseeds transient Explore defaults", async () => {
    const toolState = createComfortToolState();
    const snapshot = toolState.actions.exportShareSnapshot();

    toolState.actions.setExploreOutput(ModelOutputKey.Ppd);
    toolState.actions.setExploreBands([
      { min: -Infinity, max: 20, label: "Edited", color: "#0f0" },
      { min: 20, max: Infinity, label: "Other", color: "#f00" },
    ]);
    toolState.actions.applyShareSnapshot(snapshot);
    await waitForIdle(toolState);

    expect(snapshot).not.toHaveProperty("exploreChart");
    expect(toolState.state.ui.exploreChart?.zOutput).toBe(ModelOutputKey.Pmv);
    expect(toolState.state.ui.exploreChart?.bands)
      .toEqual(pmvAshraeModelConfig.chartableOutputs[0].defaultBands);
  });

  it("exposes coupled adaptive temperature axes in both directions", () => {
    const toolState = createComfortToolState();
    toolState.state.ui.selectedModel = ComfortModel.AdaptiveAshrae;
    toolState.state.ui.selectedChartByModel[ComfortModel.AdaptiveAshrae] =
      ChartId.AdaptiveDynamic;
    toolState.state.ui.dynamicXAxis = FieldKey.PrevailingMeanOutdoorTemperature;
    toolState.state.ui.dynamicYAxis = FieldKey.OperativeTemperature;

    const controls = toolState.selectors.getChartControlsViewModel();
    expect(controls.axes?.x.options).toEqual(controls.axes?.y.options);
    expect(controls.axes?.x.options).toHaveLength(5);

    toolState.actions.setDynamicXAxis(FieldKey.DryBulbTemperature);

    expect(toolState.state.ui.dynamicXAxis).toBe(FieldKey.DryBulbTemperature);
    expect(toolState.state.ui.dynamicYAxis).toBe(FieldKey.OperativeTemperature);

    toolState.actions.setDynamicXAxis(FieldKey.OperativeTemperature);

    expect(toolState.state.ui.dynamicXAxis).toBe(FieldKey.OperativeTemperature);
    expect(toolState.state.ui.dynamicYAxis).toBe(FieldKey.DryBulbTemperature);
  });

  it("exposes coupled UTCI temperature axes in both directions", () => {
    const toolState = createComfortToolState();
    toolState.state.ui.selectedModel = ComfortModel.Utci;
    toolState.state.ui.selectedChartByModel[ComfortModel.Utci] = ChartId.UtciDynamic;
    toolState.state.ui.dynamicXAxis = FieldKey.WindSpeed;
    toolState.state.ui.dynamicYAxis = FieldKey.OperativeTemperature;

    const xAxisOptions = toolState.selectors.getChartControlsViewModel().axes?.x.options ?? [];
    expect(xAxisOptions).toHaveLength(5);
    expect(xAxisOptions).toContain(FieldKey.DryBulbTemperature);
    expect(xAxisOptions).toContain(FieldKey.MeanRadiantTemperature);

    toolState.actions.setDynamicXAxis(FieldKey.DryBulbTemperature);

    expect(toolState.state.ui.dynamicXAxis).toBe(FieldKey.DryBulbTemperature);
    expect(toolState.state.ui.dynamicYAxis).toBe(FieldKey.OperativeTemperature);

    toolState.state.ui.dynamicXAxis = FieldKey.OperativeTemperature;
    toolState.state.ui.dynamicYAxis = FieldKey.WindSpeed;

    const yAxisOptions = toolState.selectors.getChartControlsViewModel().axes?.y.options ?? [];
    expect(yAxisOptions).toHaveLength(5);
    expect(yAxisOptions).toContain(FieldKey.DryBulbTemperature);
    expect(yAxisOptions).toContain(FieldKey.MeanRadiantTemperature);

    toolState.actions.setDynamicYAxis(FieldKey.MeanRadiantTemperature);

    expect(toolState.state.ui.dynamicXAxis).toBe(FieldKey.OperativeTemperature);
    expect(toolState.state.ui.dynamicYAxis).toBe(FieldKey.MeanRadiantTemperature);
  });

  it.each([ComfortModel.PmvAshrae, ComfortModel.PmvIso])(
    "exposes coupled operative-temperature axes for %s",
    (modelId) => {
      const toolState = createComfortToolState();
      toolState.state.ui.selectedModel = modelId;
      toolState.state.ui.selectedChartByModel[modelId] = ChartId.PmvDynamic;
      toolState.state.ui.dynamicXAxis = FieldKey.RelativeAirSpeed;
      toolState.state.ui.dynamicYAxis = FieldKey.OperativeTemperature;

      const xAxisOptions = toolState.selectors.getChartControlsViewModel().axes?.x.options ?? [];
      expect(xAxisOptions).toHaveLength(7);
      expect(xAxisOptions).toContain(FieldKey.DryBulbTemperature);
      expect(xAxisOptions).toContain(FieldKey.MeanRadiantTemperature);

      toolState.actions.setDynamicXAxis(FieldKey.DryBulbTemperature);

      expect(toolState.state.ui.dynamicXAxis).toBe(FieldKey.DryBulbTemperature);
      expect(toolState.state.ui.dynamicYAxis).toBe(FieldKey.OperativeTemperature);
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

  it("completes a boundary-confirmed switch to Wind Chill and refreshes its cache", async () => {
    const toolState = createComfortToolState();

    toolState.actions.setSelectedModel(ComfortModel.WindChill);

    expect(toolState.state.ui.selectedModel).toBe(ComfortModel.PmvAshrae);
    expect(toolState.selectors.getPendingModelSwitch()).toEqual(expect.objectContaining({
      targetModel: ComfortModel.WindChill,
      violations: expect.arrayContaining([
        expect.objectContaining({
          inputId: InputId.Input1,
          controlId: InputControlId.Temperature,
          currentValue: 26,
          maxAllowed: 0,
        }),
        expect.objectContaining({
          inputId: InputId.Input1,
          controlId: InputControlId.WindSpeed,
          currentValue: 0.1,
          minAllowed: 1,
        }),
      ]),
    }));

    toolState.actions.confirmModelSwitch();

    expect(toolState.state.ui.selectedModel).toBe(ComfortModel.WindChill);
    expect(toolState.selectors.getPendingModelSwitch()).toBeNull();
    expect(toolState.state.inputsByInput[InputId.Input1][FieldKey.DryBulbTemperature])
      .toBe(0);
    expect(toolState.state.inputsByInput[InputId.Input1][FieldKey.WindSpeed]).toBe(1);

    await waitForIdle(toolState);

    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.WindChill].status)
      .toBe("ready");
    expect(toolState.selectors.getCurrentChartResult()?.traces[0].type).toBe("contour");
  });

  it("normalizes dynamic axes deterministically when switching models", async () => {
    const toolState = createComfortToolState();
    toolState.state.ui.dynamicXAxis = FieldKey.DryBulbTemperature;
    toolState.state.ui.dynamicYAxis = FieldKey.RelativeHumidity;

    toolState.actions.setSelectedModel(ComfortModel.AdaptiveAshrae);
    await waitForIdle(toolState);

    expect(toolState.state.ui.selectedModel).toBe(ComfortModel.AdaptiveAshrae);
    expect(toolState.state.ui.dynamicXAxis).toBe(FieldKey.DryBulbTemperature);
    expect(toolState.state.ui.dynamicYAxis).toBe(FieldKey.PrevailingMeanOutdoorTemperature);
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
    const ashraeSource = toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae]
      .chartSource as PmvChartSourceDto;

    toolState.actions.setSelectedModel(ComfortModel.PmvIso);
    await waitForIdle(toolState);
    const isoSource = toolState.state.ui.calculationCacheByModel[ComfortModel.PmvIso]
      .chartSource as PmvChartSourceDto;

    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae].status).toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvIso].status).toBe("ready");
    expect(ashraeSource).not.toBe(isoSource);
    expect(Object.keys(ashraeSource).sort()).toEqual(["comfortZonesByInput", "inputs"]);
    expect(Object.keys(isoSource).sort()).toEqual(["comfortZonesByInput", "inputs"]);
    expect(ashraeSource.inputs).not.toBe(isoSource.inputs);

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
      .chartSource as PmvChartSourceDto;
    const currentInput = toolState.state.inputsByInput[InputId.Input1];

    expect(currentIsoChartSource).not.toBe(previousIsoChartSource);
    expect(currentIsoChartSource.inputs[InputId.Input1]?.tdb)
      .toBeCloseTo(currentInput[FieldKey.DryBulbTemperature], 6);
    expect(currentIsoChartSource.inputs[InputId.Input1]?.tr)
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

    const rawUtci = (
      toolState.state.ui.calculationCacheByModel[ComfortModel.Utci]
        .resultsByInput.input1 as UtciResponseDto | null
    )?.utci;
    const chartSource = toolState.state.ui.calculationCacheByModel[ComfortModel.Utci].chartSource;
    const siResultText = toolState.selectors.getResultSections()[0].valuesByInput.input1?.text;
    const siChartTitle = String(toolState.selectors.getCurrentChartResult()?.layout.xaxis.title ?? "");

    toolState.actions.toggleUnitSystem();

    const ipResultText = toolState.selectors.getResultSections()[0].valuesByInput.input1?.text;
    const ipChartTitle = String(toolState.selectors.getCurrentChartResult()?.layout.xaxis.title ?? "");

    expect(rawUtci).toBe((
      toolState.state.ui.calculationCacheByModel[ComfortModel.Utci]
        .resultsByInput.input1 as UtciResponseDto | null
    )?.utci);
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
