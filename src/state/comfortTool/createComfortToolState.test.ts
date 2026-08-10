import { describe, expect, it } from "vitest";

import { ChartId } from "../../models/chartOptions";
import { ComfortModel } from "../../models/comfortModels";
import { FieldKey } from "../../models/fieldKeys";
import { InputControlId } from "../../models/inputControls";
import {
  AirSpeedControlMode,
  OptionKey,
  TemperatureMode,
} from "../../models/inputModes";
import { InputId } from "../../models/inputSlots";
import { UnitSystem } from "../../models/units";
import { ChartMode, ModelOutputKey } from "../../models/modelCapabilities";
import { ModifierFieldKey, ModifierId } from "../../models/inputModifiers";
import {
  pmvAshraeAdapter,
  pmvAshraeModelConfig,
} from "../../comfortModels/pmvAshrae";
import type { PmvChartSourceDto, PmvResponseDto } from "../../comfortModels/pmvShared";
import type { UtciResponseDto } from "../../comfortModels/utci";
import { createComfortToolState } from "./createComfortToolState.svelte";
import { comfortModelConfigs, comfortModelOrder } from "./modelConfigs";

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

function getChartSettings(
  toolState: ReturnType<typeof createComfortToolState>,
  modelId = toolState.state.ui.selectedModel,
) {
  return toolState.state.ui.chartSettingsByModel[modelId];
}

function getModeControl(toolState: ReturnType<typeof createComfortToolState>) {
  return toolState.selectors.getChartControlsViewModel().mode;
}

function toLegendBands(
  bands: readonly { label: string; color: string }[] | undefined,
) {
  return bands?.filter((band, index) => (
    bands.findIndex((candidate) => (
      candidate.label === band.label && candidate.color === band.color
    )) === index
  )).map(({ label, color }) => ({ label, color }));
}

const solarModifierFixture = [
  [ModifierFieldKey.SolarAltitude, "45"],
  [ModifierFieldKey.SolarHorizontalAngle, "90"],
  [ModifierFieldKey.DirectSolarRadiation, "800"],
  [ModifierFieldKey.SolarTransmittance, "0.5"],
  [ModifierFieldKey.SkyVaultViewFraction, "0.5"],
  [ModifierFieldKey.BodyExposureFraction, "0.5"],
] as const;

function populateSolarModifier(
  toolState: ReturnType<typeof createComfortToolState>,
  inputId: InputId,
) {
  for (const [fieldKey, value] of solarModifierFixture) {
    if (!toolState.actions.updateModifierInput(
      inputId,
      ModifierId.SolarGain,
      fieldKey,
      value,
    )) {
      throw new Error(`Failed to populate solar modifier field ${fieldKey}.`);
    }
  }
}

describe("createComfortToolState", () => {
  it("initializes model chart defaults and independent PMV variants", () => {
    const toolState = createComfortToolState();

    expect(toolState.state.ui.selectedModel).toBe(ComfortModel.PmvAshrae);
    expect(toolState.state.ui.selectedChartByModel).toEqual({
      [ComfortModel.PmvAshrae]: ChartId.PmvDynamic,
      [ComfortModel.PmvIso]: ChartId.PmvDynamic,
      [ComfortModel.Utci]: ChartId.UtciDynamic,
      [ComfortModel.AdaptiveAshrae]: ChartId.Adaptive,
      [ComfortModel.AdaptiveEn]: ChartId.Adaptive,
      [ComfortModel.HeatIndex]: ChartId.HeatIndexDynamic,
      [ComfortModel.Humidex]: ChartId.HumidexDynamic,
      [ComfortModel.WindChill]: ChartId.WindChillDynamic,
    });
    expect(toolState.state.ui.modelOptionsByModel[ComfortModel.PmvAshrae])
      .not.toBe(toolState.state.ui.modelOptionsByModel[ComfortModel.PmvIso]);
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae])
      .not.toBe(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvIso]);
    expect(getChartSettings(toolState, ComfortModel.PmvAshrae).mode)
      .toBe(ChartMode.Compliance);
    expect(getChartSettings(toolState, ComfortModel.PmvIso).mode)
      .toBe(ChartMode.Compliance);
    expect(getChartSettings(toolState).explore?.zOutput).toBe(ModelOutputKey.Pmv);
    expect(getChartSettings(toolState).explore?.bands)
      .not.toBe(pmvAshraeModelConfig.chartableOutputs[0].defaultBands);
    expect(getChartSettings(toolState, ComfortModel.PmvAshrae).explore?.bands)
      .not.toBe(getChartSettings(toolState, ComfortModel.PmvIso).explore?.bands);
  });

  it("keeps base air speed separate from reversible per-input modifier state", async () => {
    const toolState = createComfortToolState();
    const baseInput1 = toolState.state.inputsByInput[InputId.Input1][FieldKey.RelativeAirSpeed];
    const baseInput2 = toolState.state.inputsByInput[InputId.Input2][FieldKey.RelativeAirSpeed];

    expect(toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      true,
    )).toBe(false);
    expect(toolState.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      ModifierFieldKey.MeasuredAirSpeed,
      "0.6",
    )).toBe(true);
    expect(toolState.actions.updateModifierInput(
      InputId.Input2,
      ModifierId.MeasuredAirSpeed,
      ModifierFieldKey.MeasuredAirSpeed,
      "0.8",
    )).toBe(true);
    expect(toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      true,
    )).toBe(true);
    expect(toolState.actions.setModifierEnabled(
      InputId.Input2,
      ModifierId.MeasuredAirSpeed,
      true,
    )).toBe(true);

    expect(toolState.state.inputsByInput[InputId.Input1][FieldKey.RelativeAirSpeed])
      .toBe(baseInput1);
    expect(toolState.state.inputsByInput[InputId.Input2][FieldKey.RelativeAirSpeed])
      .toBe(baseInput2);
    expect(toolState.selectors.getEffectiveInputsByInput()[InputId.Input1]
      [FieldKey.RelativeAirSpeed]).toBeCloseTo(0.6, 6);
    expect(toolState.selectors.getEffectiveInputsByInput()[InputId.Input2]
      [FieldKey.RelativeAirSpeed]).toBeCloseTo(0.83, 6);

    toolState.actions.updateInput(InputId.Input1, InputControlId.AirSpeed, "0.3");
    toolState.actions.updateInput(InputId.Input1, InputControlId.MetabolicRate, "1.8");

    expect(toolState.state.inputsByInput[InputId.Input1][FieldKey.RelativeAirSpeed])
      .toBe(0.3);
    expect(toolState.selectors.getEffectiveInputsByInput()[InputId.Input1]
      [FieldKey.RelativeAirSpeed]).toBeCloseTo(0.84, 6);

    expect(toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      false,
    )).toBe(true);
    expect(toolState.selectors.getEffectiveInputsByInput()[InputId.Input1]
      [FieldKey.RelativeAirSpeed]).toBe(0.3);
    expect(toolState.selectors.getEffectiveInputsByInput()[InputId.Input2]
      [FieldKey.RelativeAirSpeed]).toBeCloseTo(0.83, 6);
    expect(toolState.state.modifierInputsByInput[InputId.Input1]
      [ModifierId.MeasuredAirSpeed][ModifierFieldKey.MeasuredAirSpeed]).toBe(0.6);

    expect(toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      true,
    )).toBe(true);
    expect(toolState.selectors.getEffectiveInputsByInput()[InputId.Input1]
      [FieldKey.RelativeAirSpeed]).toBeCloseTo(0.84, 6);

    await waitForIdle(toolState);
  });

  it("disables an active incomplete modifier without clearing its other inputs", async () => {
    const toolState = createComfortToolState();
    const baseRadiantTemperature = toolState.state.inputsByInput[InputId.Input1]
      [FieldKey.MeanRadiantTemperature];
    populateSolarModifier(toolState, InputId.Input1);

    expect(toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.SolarGain,
      true,
    )).toBe(true);
    expect(toolState.selectors.getEffectiveInputsByInput()[InputId.Input1]
      [FieldKey.MeanRadiantTemperature]).toBeCloseTo(baseRadiantTemperature + 15.1, 6);

    expect(toolState.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.SolarGain,
      ModifierFieldKey.SolarTransmittance,
      "",
    )).toBe(true);

    expect(toolState.state.activeModifiersByInput[InputId.Input1][ModifierId.SolarGain])
      .toBe(false);
    expect(toolState.state.modifierInputsByInput[InputId.Input1][ModifierId.SolarGain]
      [ModifierFieldKey.SolarTransmittance]).toBeNull();
    expect(toolState.state.modifierInputsByInput[InputId.Input1][ModifierId.SolarGain]
      [ModifierFieldKey.DirectSolarRadiation]).toBe(800);
    expect(toolState.selectors.getEffectiveInputsByInput()[InputId.Input1]
      [FieldKey.MeanRadiantTemperature]).toBe(baseRadiantTemperature);

    await waitForIdle(toolState);
  });

  it("keeps stored and effective SI values invariant when display units change", async () => {
    const toolState = createComfortToolState();
    toolState.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      ModifierFieldKey.MeasuredAirSpeed,
      "0.6",
    );
    toolState.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MorningClothingEstimate,
      ModifierFieldKey.MorningOutdoorTemperature,
      "10",
    );
    populateSolarModifier(toolState, InputId.Input1);
    toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      true,
    );
    toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MorningClothingEstimate,
      true,
    );
    toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.SolarGain,
      true,
    );
    await waitForIdle(toolState);

    const storedSi = JSON.stringify(toolState.state.modifierInputsByInput);
    const effectiveSi = toolState.selectors.getEffectiveInputsByInput();

    toolState.actions.toggleUnitSystem();

    expect(toolState.state.ui.unitSystem).toBe(UnitSystem.IP);
    expect(JSON.stringify(toolState.state.modifierInputsByInput)).toBe(storedSi);
    expect(toolState.selectors.getEffectiveInputsByInput()).toEqual(effectiveSi);

    const controls = toolState.selectors.getInputModifierControls();
    const measured = controls.find(({ id }) => id === ModifierId.MeasuredAirSpeed);
    const clothing = controls.find(({ id }) => id === ModifierId.MorningClothingEstimate);
    const solar = controls.find(({ id }) => id === ModifierId.SolarGain);
    expect(measured?.extraInputs[0].displayValuesByInput[InputId.Input1]).toBe("1.97");
    expect(clothing?.extraInputs[0].displayValuesByInput[InputId.Input1]).toBe("50.0");
    expect(solar?.extraInputs.find(({ key }) => (
      key === ModifierFieldKey.DirectSolarRadiation
    ))?.displayValuesByInput[InputId.Input1]).toBe("253.599");

    toolState.actions.toggleUnitSystem();
    expect(JSON.stringify(toolState.state.modifierInputsByInput)).toBe(storedSi);
    expect(toolState.selectors.getEffectiveInputsByInput()).toEqual(effectiveSi);
  });

  it.each([
    [
      ComfortModel.PmvAshrae,
      ChartMode.Compliance,
      [ChartMode.Compliance, ChartMode.Explore],
    ],
    [
      ComfortModel.PmvIso,
      ChartMode.Compliance,
      [ChartMode.Compliance, ChartMode.Explore],
    ],
    [ComfortModel.Utci, ChartMode.Explore, [ChartMode.Explore]],
    [ComfortModel.AdaptiveAshrae, ChartMode.Compliance, [ChartMode.Compliance]],
    [ComfortModel.AdaptiveEn, ChartMode.Compliance, [ChartMode.Compliance]],
    [ComfortModel.HeatIndex, ChartMode.Explore, [ChartMode.Explore]],
    [ComfortModel.Humidex, ChartMode.Explore, [ChartMode.Explore]],
    [ComfortModel.WindChill, ChartMode.Explore, [ChartMode.Explore]],
  ] as const)(
    "opens %s on its declared default mode",
    (modelId, expectedMode, expectedModes) => {
      const toolState = createComfortToolState();
      toolState.state.ui.selectedModel = modelId;

      const mode = getModeControl(toolState);
      expect(mode.selectedMode).toBe(expectedMode);
      expect(mode.modes).toEqual(expectedModes);
    },
  );

  it("provides one active mode config for every registered selectable chart", () => {
    const toolState = createComfortToolState();
    toolState.state.ui.compareEnabled = true;

    for (const modelId of comfortModelOrder) {
      toolState.state.ui.selectedModel = modelId;
      const modelConfig = comfortModelConfigs[modelId];
      const settings = getChartSettings(toolState, modelId);

      for (const chart of modelConfig.charts.entries) {
        toolState.actions.setSelectedChart(chart.id);
        const controls = toolState.selectors.getChartControlsViewModel();
        const supportsAxisSelection = chart.allowsAxisSelection;
        const expectedBands = settings.mode === ChartMode.Compliance
          ? modelConfig.complianceSpec?.bands
          : settings.explore?.bands;
        const outputKey = settings.mode === ChartMode.Compliance
          ? modelConfig.complianceSpec?.output
          : settings.explore?.zOutput;
        const output = modelConfig.chartableOutputs.find(
          ({ key }) => key === outputKey,
        );
        const expectedLegendTitle = (
          output?.legendTitle
          ?? output?.label
          ?? modelConfig.complianceSpec?.legendTitle
        ) || "Bands";

        expect(controls.mode?.selectedMode).toBe(settings.mode);
        expect(controls.mode?.modes).toEqual(modelConfig.modes);
        expect(controls.baseline?.selectedInputId).toBe(InputId.Input1);
        expect(controls.axes === null).toBe(!supportsAxisSelection);
        expect(controls.explore === null).toBe(
          settings.mode !== ChartMode.Explore,
        );
        const expectedLegendBands = chart.showsLegend
          ? toLegendBands(expectedBands)
          : null;
        expect(toolState.selectors.getCurrentChartLegendZones())
          .toEqual(expectedLegendBands);
        expect(toolState.selectors.getCurrentChartLegendTitle())
          .toBe(expectedLegendTitle);
      }
    }
  });

  it("keeps ASHRAE and ISO mode settings independent from chart selection", () => {
    const toolState = createComfortToolState();
    const ashraeChart = toolState.state.ui.selectedChartByModel[ComfortModel.PmvAshrae];

    toolState.actions.setChartMode(ChartMode.Explore);
    toolState.actions.setDynamicXAxis(FieldKey.MeanRadiantTemperature);
    expect(toolState.state.ui.selectedChartByModel[ComfortModel.PmvAshrae])
      .toBe(ashraeChart);

    toolState.state.ui.selectedModel = ComfortModel.PmvIso;
    expect(getChartSettings(toolState).mode).toBe(ChartMode.Compliance);
    expect(getChartSettings(toolState).xAxis).toBe(FieldKey.DryBulbTemperature);
    toolState.actions.setChartMode(ChartMode.Explore);
    toolState.actions.setExploreOutput(ModelOutputKey.Ppd);

    toolState.state.ui.selectedModel = ComfortModel.PmvAshrae;
    expect(getChartSettings(toolState).mode).toBe(ChartMode.Explore);
    expect(getChartSettings(toolState).xAxis).toBe(FieldKey.MeanRadiantTemperature);
    expect(getChartSettings(toolState).explore?.zOutput).toBe(ModelOutputKey.Pmv);
  });

  it("falls back to Input 1 without erasing a temporarily hidden baseline", async () => {
    const toolState = createComfortToolState();
    toolState.actions.setCompareEnabled(true);
    await waitForIdle(toolState);
    toolState.actions.setSelectedChart(ChartId.PmvDynamic);
    toolState.actions.setChartBaselineInputId(InputId.Input2);

    expect(toolState.selectors.getChartControlsViewModel().baseline?.selectedInputId)
      .toBe(InputId.Input2);
    toolState.actions.toggleCompareInputVisibility(InputId.Input2);
    await waitForIdle(toolState);

    expect(getChartSettings(toolState).baselineInputId).toBe(InputId.Input2);
    expect(toolState.selectors.getChartControlsViewModel().baseline?.selectedInputId)
      .toBe(InputId.Input1);

    toolState.actions.toggleCompareInputVisibility(InputId.Input2);
    await waitForIdle(toolState);
    expect(toolState.selectors.getChartControlsViewModel().baseline?.selectedInputId)
      .toBe(InputId.Input2);
  });

  it("builds mode captions and baseline-specific Compliance feedback", async () => {
    const toolState = createComfortToolState();
    toolState.actions.setCompareEnabled(true);
    await waitForIdle(toolState);
    toolState.actions.setSelectedChart(ChartId.PmvDynamic);
    toolState.actions.setChartBaselineInputId(InputId.Input2);

    const compliance = getModeControl(toolState);
    expect(compliance.caption).toContain("ASHRAE 55");
    expect(compliance.feedback).toEqual(expect.objectContaining({
      inputLabel: "Input 2",
      text: expect.any(String),
      passes: expect.any(Boolean),
    }));

    toolState.actions.setChartMode(ChartMode.Explore);
    const explore = getModeControl(toolState);
    expect(explore.caption).toBe(
      "Showing PMV over the selected axes with editable thresholds.",
    );
    expect(explore.feedback).toBeNull();
  });

  it("keeps mode and baseline controls on fixed views and exposes declared axes", () => {
    const toolState = createComfortToolState();
    toolState.state.ui.compareEnabled = true;

    expect(getModeControl(toolState).modes)
      .toEqual([ChartMode.Compliance, ChartMode.Explore]);

    toolState.actions.setSelectedChart(ChartId.Psychrometric);
    const fixed = toolState.selectors.getChartControlsViewModel();
    expect(fixed.mode?.modes)
      .toEqual([ChartMode.Compliance, ChartMode.Explore]);
    expect(fixed.baseline?.selectedInputId).toBe(InputId.Input1);
    expect(fixed.axes).toBeNull();
    expect(fixed.explore).toBeNull();

    toolState.actions.setChartMode(ChartMode.Explore);
    const fixedExplore = toolState.selectors.getChartControlsViewModel();
    expect(fixedExplore.mode?.caption).toContain("fixed axes");
    expect(fixedExplore.explore?.config.mode).toBe(ChartMode.Explore);

    toolState.actions.setSelectedChart(ChartId.PmvDynamic);
    expect(getModeControl(toolState).modes)
      .toEqual([ChartMode.Compliance, ChartMode.Explore]);
    expect(toolState.selectors.getChartControlsViewModel().axes).not.toBeNull();

    toolState.state.ui.selectedModel = ComfortModel.AdaptiveAshrae;
    const adaptive = getModeControl(toolState);
    expect(adaptive.modes).toEqual([ChartMode.Compliance]);
    expect(adaptive.caption).toContain("ASHRAE 55 80% and 90%");
    toolState.actions.setSelectedChart(ChartId.Adaptive);
    const adaptiveControls = toolState.selectors.getChartControlsViewModel();
    expect(adaptiveControls.mode?.selectedMode).toBe(ChartMode.Compliance);
    expect(adaptiveControls.baseline?.selectedInputId).toBe(InputId.Input1);
    expect(adaptiveControls.axes?.x.options).toEqual([
      FieldKey.PrevailingMeanOutdoorTemperature,
      FieldKey.OperativeTemperature,
    ]);
    expect(adaptiveControls.axes?.y.options).toEqual([
      FieldKey.PrevailingMeanOutdoorTemperature,
      FieldKey.OperativeTemperature,
    ]);
    expect(adaptiveControls.explore).toBeNull();

    toolState.state.ui.selectedModel = ComfortModel.Utci;
    const utci = getModeControl(toolState);
    expect(utci.modes).toEqual([ChartMode.Explore]);
    expect(utci.caption).toContain("Showing UTCI");
    toolState.actions.setSelectedChart(ChartId.Stress);
    const utciFixed = toolState.selectors.getChartControlsViewModel();
    expect(utciFixed.mode?.selectedMode).toBe(ChartMode.Explore);
    expect(utciFixed.baseline?.selectedInputId).toBe(InputId.Input1);
    expect(utciFixed.axes).toBeNull();
    expect(utciFixed.explore?.config.zOutput).toBe(ModelOutputKey.Utci);
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

    assertCalculationIdentity();
    expect(toolState.selectors.getCurrentChartResult()?.layout.title)
      .toContain("Dynamic Chart");

    const complianceBands = pmvAshraeModelConfig.complianceSpec?.bands;
    const complianceChart = toolState.selectors.getCurrentChartResult();
    expect(getModeControl(toolState).selectedMode)
      .toBe(ChartMode.Compliance);
    expect(toolState.selectors.getChartControlsViewModel().explore).toBeNull();
    expect(toolState.selectors.getCurrentChartLegendZones())
      .toEqual(toLegendBands(complianceBands));

    toolState.actions.setChartMode(ChartMode.Explore);
    assertCalculationIdentity();

    const exploreChart = toolState.selectors.getCurrentChartResult();
    expect(exploreChart?.traces).not.toEqual(complianceChart?.traces);
    expect(toolState.selectors.getCurrentChartLegendZones())
      .toEqual(toLegendBands(getChartSettings(toolState).explore?.bands));

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
    expect(getChartSettings(toolState).explore?.zOutput).toBe(ModelOutputKey.Ppd);
    expect(toolState.selectors.getCurrentChartLegendTitle()).toBe("PPD Bands");

    const ppdBands = getChartSettings(toolState).explore?.bands.map((band) => ({ ...band })) ?? [];
    toolState.actions.setExploreOutput(ModelOutputKey.Utci);
    assertCalculationIdentity();
    expect(getChartSettings(toolState).explore?.zOutput).toBe(ModelOutputKey.Ppd);

    expect(toolState.actions.setExploreBands([
      { min: 0, max: 20, label: "One", color: "#000" },
      { min: 10, max: 30, label: "Two", color: "#fff" },
    ])).toBe(false);
    assertCalculationIdentity();
    expect(getChartSettings(toolState).explore?.bands).toEqual(ppdBands);

    expect(toolState.actions.setExploreBands([
      { min: 10, max: Infinity, label: "High", color: "#f00" },
      { min: -Infinity, max: 10, label: "Low", color: "#00f" },
    ])).toBe(true);
    assertCalculationIdentity();
    expect(getChartSettings(toolState).explore?.bands.map(({ label }) => label))
      .toEqual(["Low", "High"]);

    toolState.actions.setChartMode(ChartMode.Compliance);
    assertCalculationIdentity();
    expect(getModeControl(toolState).selectedMode).toBe(ChartMode.Compliance);
    expect(toolState.selectors.getCurrentChartLegendZones())
      .toEqual(toLegendBands(complianceBands));
    expect(toolState.selectors.getCurrentChartLegendTitle()).toBe("PMV Zones");
    expect(toolState.selectors.getCurrentChartResult()?.traces)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "PMV bands hover" }),
      ]));
    expect(toolState.selectors.getChartControlsViewModel().explore).toBeNull();

    toolState.actions.setChartMode(ChartMode.Explore);
    assertCalculationIdentity();
    expect(toolState.selectors.getCurrentChartLegendZones())
      .toEqual(toLegendBands(getChartSettings(toolState).explore?.bands));
    expect(toolState.selectors.getCurrentChartLegendTitle()).toBe("PPD Bands");
    expect(getChartSettings(toolState).explore?.bands.map(({ label }) => label))
      .toEqual(["Low", "High"]);

    const editedExploreState = getChartSettings(toolState).explore;
    const editedBands = editedExploreState?.bands;
    toolState.actions.setExploreOutput(ModelOutputKey.Ppd);
    expect(getChartSettings(toolState).explore).toBe(editedExploreState);
    expect(getChartSettings(toolState).explore?.bands).toBe(editedBands);

    toolState.actions.toggleUnitSystem();
    assertCalculationIdentity();
    expect(getChartSettings(toolState).explore?.bands[1].min).toBe(10);
    expect(toolState.selectors.getCurrentChartResult()).not.toBeNull();
  });

  it("rebuilds Adaptive regions from the selected cached comparison baseline", async () => {
    const toolState = createComfortToolState();
    toolState.actions.setSelectedModel(ComfortModel.AdaptiveAshrae);
    await waitForIdle(toolState);
    toolState.state.inputsByInput[InputId.Input2][FieldKey.RelativeAirSpeed] = 1.2;
    toolState.actions.setCompareEnabled(true);
    await waitForIdle(toolState);

    const cache = toolState.state.ui.calculationCacheByModel[ComfortModel.AdaptiveAshrae];
    const chartSource = cache.chartSource;
    const resultsByInput = cache.resultsByInput;
    const getTooWarmBoundary = () => toolState.selectors.getCurrentChartResult()?.traces
      .find(({ name, fill }) => name === "Too Warm" && fill === "toself")?.y;
    const input1Boundary = getTooWarmBoundary();

    toolState.actions.setChartBaselineInputId(InputId.Input2);

    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.AdaptiveAshrae])
      .toBe(cache);
    expect(cache.status).toBe("ready");
    expect(cache.chartSource).toBe(chartSource);
    expect(cache.resultsByInput).toBe(resultsByInput);
    expect(toolState.state.ui.isLoading).toBe(false);
    const input2Boundary = getTooWarmBoundary();
    expect(input2Boundary).not.toEqual(input1Boundary);
    expect(toolState.selectors.getCurrentChartResult()?.traces
      .filter(({ mode }) => mode === "markers")
      .map(({ name }) => name)).toEqual(["Input 1", "Input 2"]);

    toolState.state.inputsByInput[InputId.Input2][FieldKey.RelativeAirSpeed] = 0.1;
    expect(getTooWarmBoundary()).toEqual(input2Boundary);

    toolState.actions.setDynamicXAxis(FieldKey.OperativeTemperature);
    expect(getChartSettings(toolState)).toEqual(expect.objectContaining({
      xAxis: FieldKey.OperativeTemperature,
      yAxis: FieldKey.PrevailingMeanOutdoorTemperature,
    }));
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.AdaptiveAshrae])
      .toBe(cache);
    expect(cache.chartSource).toBe(chartSource);
    expect(cache.resultsByInput).toBe(resultsByInput);
    expect(toolState.state.ui.isLoading).toBe(false);
    expect(toolState.selectors.getCurrentChartResult()?.layout.xaxis.title)
      .toContain("Operative temperature");

    toolState.actions.toggleUnitSystem();
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.AdaptiveAshrae])
      .toBe(cache);
    expect(cache.chartSource).toBe(chartSource);
    expect(cache.resultsByInput).toBe(resultsByInput);
    expect(toolState.state.ui.isLoading).toBe(false);
    expect(toolState.selectors.getCurrentChartResult()?.layout.xaxis.title)
      .toContain("°F");
  });

  it("retains independent mode, axes, output, bands, baseline, and chart selections", async () => {
    const toolState = createComfortToolState();
    toolState.actions.setCompareEnabled(true);
    await waitForIdle(toolState);
    toolState.actions.setChartMode(ChartMode.Explore);
    toolState.actions.setExploreOutput(ModelOutputKey.Ppd);
    toolState.actions.setExploreBands([
      { min: -Infinity, max: 15, label: "Preferred", color: "#0f0" },
      { min: 15, max: Infinity, label: "Other", color: "#f00" },
    ]);

    toolState.actions.setSelectedChart(ChartId.PmvDynamic);
    toolState.actions.setSelectedChart(ChartId.Psychrometric);
    toolState.actions.setDynamicXAxis(FieldKey.MeanRadiantTemperature);
    toolState.actions.setChartBaselineInputId(InputId.Input2);
    expect(getChartSettings(toolState).explore?.bands[0].label).toBe("Preferred");
    expect(toolState.selectors.getChartControlsViewModel().mode?.selectedMode)
      .toBe(ChartMode.Explore);
    expect(toolState.selectors.getChartControlsViewModel().explore?.config)
      .toEqual(expect.objectContaining({
        zOutput: ModelOutputKey.Ppd,
        bands: expect.arrayContaining([
          expect.objectContaining({ label: "Preferred" }),
        ]),
      }));

    toolState.actions.setSelectedModel(ComfortModel.Utci);
    await waitForIdle(toolState);
    expect(getChartSettings(toolState).mode).toBe(ChartMode.Explore);
    expect(getChartSettings(toolState).explore?.zOutput).toBe(ModelOutputKey.Utci);

    toolState.actions.setSelectedModel(ComfortModel.AdaptiveAshrae);
    await waitForIdle(toolState);
    expect(getChartSettings(toolState).mode).toBe(ChartMode.Compliance);
    expect(getChartSettings(toolState).explore).toBeNull();
    expect(toolState.selectors.getChartControlsViewModel().explore).toBeNull();

    toolState.actions.setSelectedModel(ComfortModel.PmvAshrae);
    expect(getChartSettings(toolState)).toEqual(expect.objectContaining({
      mode: ChartMode.Explore,
      xAxis: FieldKey.MeanRadiantTemperature,
      baselineInputId: InputId.Input2,
    }));
    expect(getChartSettings(toolState).explore?.zOutput).toBe(ModelOutputKey.Ppd);
    expect(getChartSettings(toolState).explore?.bands[0].label).toBe("Preferred");
    expect(toolState.state.ui.selectedChartByModel[ComfortModel.PmvAshrae])
      .toBe(ChartId.Psychrometric);

    toolState.actions.setSelectedChart(ChartId.PmvDynamic);
    expect(getModeControl(toolState).selectedMode).toBe(ChartMode.Explore);
    expect(toolState.selectors.getChartControlsViewModel().axes?.x.selectedField)
      .toBe(FieldKey.MeanRadiantTemperature);
    expect(toolState.selectors.getChartControlsViewModel().baseline?.selectedInputId)
      .toBe(InputId.Input2);
    expect(toolState.selectors.getChartControlsViewModel().explore?.config.zOutput)
      .toBe(ModelOutputKey.Ppd);
    expect(toolState.selectors.getChartControlsViewModel().explore?.config.bands[0].label)
      .toBe("Preferred");
  });

  it("round-trips field-chart settings in the strict v1 share snapshot", async () => {
    const toolState = createComfortToolState();
    toolState.actions.setChartMode(ChartMode.Explore);
    toolState.actions.setExploreOutput(ModelOutputKey.Ppd);
    toolState.actions.setExploreBands([
      { min: -Infinity, max: 20, label: "Edited", color: "#0f0" },
      { min: 20, max: Infinity, label: "Other", color: "#f00" },
    ]);
    toolState.actions.setChartBaselineInputId(InputId.Input2);
    const snapshot = toolState.actions.exportShareSnapshot();
    toolState.actions.setExploreOutput(ModelOutputKey.Pmv);
    toolState.actions.applyShareSnapshot(snapshot);
    await waitForIdle(toolState);

    expect(snapshot.version).toBe(1);
    expect(snapshot.models[ComfortModel.PmvAshrae].chartSettings)
      .toEqual(expect.objectContaining({
        mode: ChartMode.Explore,
        baselineInputId: InputId.Input2,
      }));
    expect(getChartSettings(toolState).explore?.zOutput).toBe(ModelOutputKey.Ppd);
    expect(getChartSettings(toolState).explore?.bands[0].label).toBe("Edited");
  });

  it("keeps Adaptive on one Compliance chart with only its two semantic axes", () => {
    const toolState = createComfortToolState();
    toolState.state.ui.selectedModel = ComfortModel.AdaptiveAshrae;
    const settings = getChartSettings(toolState);
    const controls = toolState.selectors.getChartControlsViewModel();

    expect(toolState.selectors.getCurrentChartOptions()).toEqual([
      expect.objectContaining({ id: ChartId.Adaptive, name: "Adaptive" }),
    ]);
    expect(settings).toEqual(expect.objectContaining({
      mode: ChartMode.Compliance,
      xAxis: FieldKey.PrevailingMeanOutdoorTemperature,
      yAxis: FieldKey.OperativeTemperature,
      explore: null,
    }));
    expect(controls.axes?.x.selectedField)
      .toBe(FieldKey.PrevailingMeanOutdoorTemperature);
    expect(controls.axes?.y.selectedField).toBe(FieldKey.OperativeTemperature);
    expect(controls.axes?.x.options).toEqual([
      FieldKey.PrevailingMeanOutdoorTemperature,
      FieldKey.OperativeTemperature,
    ]);
    expect(controls.axes?.y.options).toEqual([
      FieldKey.PrevailingMeanOutdoorTemperature,
      FieldKey.OperativeTemperature,
    ]);
    expect(controls.explore).toBeNull();

    toolState.actions.setDynamicYAxis(FieldKey.PrevailingMeanOutdoorTemperature);
    expect(settings.xAxis).toBe(FieldKey.OperativeTemperature);
    expect(settings.yAxis).toBe(FieldKey.PrevailingMeanOutdoorTemperature);
  });

  it("deduplicates legend entries by label and color without changing geometry bands", () => {
    const toolState = createComfortToolState();

    const assertions = [
      [ComfortModel.PmvAshrae, 3, 2],
      [ComfortModel.AdaptiveAshrae, 5, 4],
      [ComfortModel.AdaptiveEn, 7, 5],
    ] as const;
    assertions.forEach(([modelId, geometryCount, legendCount]) => {
      toolState.state.ui.selectedModel = modelId;
      expect(comfortModelConfigs[modelId].complianceSpec?.bands)
        .toHaveLength(geometryCount);
      expect(toolState.selectors.getCurrentChartLegendZones())
        .toHaveLength(legendCount);
    });

    toolState.state.ui.selectedModel = ComfortModel.PmvAshrae;
    toolState.actions.setChartMode(ChartMode.Explore);
    expect(toolState.actions.setExploreBands([
      { min: -Infinity, max: 0, label: "Same label", color: "#00ff00" },
      { min: 0, max: Infinity, label: "Same label", color: "#ff0000" },
    ])).toBe(true);
    expect(toolState.selectors.getCurrentChartLegendZones()).toEqual([
      { label: "Same label", color: "#00ff00" },
      { label: "Same label", color: "#ff0000" },
    ]);
    expect(getChartSettings(toolState).explore?.bands).toHaveLength(2);
  });

  it("exposes coupled UTCI temperature axes in both directions", () => {
    const toolState = createComfortToolState();
    toolState.state.ui.selectedModel = ComfortModel.Utci;
    toolState.state.ui.selectedChartByModel[ComfortModel.Utci] = ChartId.UtciDynamic;
    const settings = getChartSettings(toolState);
    settings.xAxis = FieldKey.WindSpeed;
    settings.yAxis = FieldKey.OperativeTemperature;

    const xAxisOptions = toolState.selectors.getChartControlsViewModel().axes?.x.options ?? [];
    expect(xAxisOptions).toHaveLength(5);
    expect(xAxisOptions).toContain(FieldKey.DryBulbTemperature);
    expect(xAxisOptions).toContain(FieldKey.MeanRadiantTemperature);

    toolState.actions.setDynamicXAxis(FieldKey.DryBulbTemperature);

    expect(settings.xAxis).toBe(FieldKey.DryBulbTemperature);
    expect(settings.yAxis).toBe(FieldKey.OperativeTemperature);

    settings.xAxis = FieldKey.OperativeTemperature;
    settings.yAxis = FieldKey.WindSpeed;

    const yAxisOptions = toolState.selectors.getChartControlsViewModel().axes?.y.options ?? [];
    expect(yAxisOptions).toHaveLength(5);
    expect(yAxisOptions).toContain(FieldKey.DryBulbTemperature);
    expect(yAxisOptions).toContain(FieldKey.MeanRadiantTemperature);

    toolState.actions.setDynamicYAxis(FieldKey.MeanRadiantTemperature);

    expect(settings.xAxis).toBe(FieldKey.OperativeTemperature);
    expect(settings.yAxis).toBe(FieldKey.MeanRadiantTemperature);
  });

  it.each([ComfortModel.PmvAshrae, ComfortModel.PmvIso])(
    "exposes coupled operative-temperature axes for %s",
    (modelId) => {
      const toolState = createComfortToolState();
      toolState.state.ui.selectedModel = modelId;
      toolState.state.ui.selectedChartByModel[modelId] = ChartId.PmvDynamic;
      const settings = getChartSettings(toolState, modelId);
      settings.xAxis = FieldKey.RelativeAirSpeed;
      settings.yAxis = FieldKey.OperativeTemperature;

      const xAxisOptions = toolState.selectors.getChartControlsViewModel().axes?.x.options ?? [];
      expect(xAxisOptions).toHaveLength(7);
      expect(xAxisOptions).toContain(FieldKey.DryBulbTemperature);
      expect(xAxisOptions).toContain(FieldKey.MeanRadiantTemperature);

      toolState.actions.setDynamicXAxis(FieldKey.DryBulbTemperature);

      expect(settings.xAxis).toBe(FieldKey.DryBulbTemperature);
      expect(settings.yAxis).toBe(FieldKey.OperativeTemperature);
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

  it("restores each model's own dynamic axes when switching models", async () => {
    const toolState = createComfortToolState();
    const pmvSettings = getChartSettings(toolState);
    pmvSettings.xAxis = FieldKey.MeanRadiantTemperature;
    pmvSettings.yAxis = FieldKey.RelativeHumidity;

    toolState.actions.setSelectedModel(ComfortModel.AdaptiveAshrae);
    await waitForIdle(toolState);

    expect(toolState.state.ui.selectedModel).toBe(ComfortModel.AdaptiveAshrae);
    expect(getChartSettings(toolState).xAxis)
      .toBe(FieldKey.PrevailingMeanOutdoorTemperature);
    expect(getChartSettings(toolState).yAxis).toBe(FieldKey.OperativeTemperature);

    toolState.actions.setSelectedModel(ComfortModel.PmvAshrae);
    expect(getChartSettings(toolState).xAxis).toBe(FieldKey.MeanRadiantTemperature);
    expect(getChartSettings(toolState).yAxis).toBe(FieldKey.RelativeHumidity);
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

  it("invalidates supporting model caches only when modifier state is effective", async () => {
    const toolState = createComfortToolState();
    toolState.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(toolState);
    toolState.actions.setSelectedModel(ComfortModel.PmvIso);
    await waitForIdle(toolState);
    toolState.actions.setSelectedModel(ComfortModel.PmvAshrae);

    const ashraeSource = toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae]
      .chartSource;
    const isoSource = toolState.state.ui.calculationCacheByModel[ComfortModel.PmvIso]
      .chartSource;

    expect(toolState.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      ModifierFieldKey.MeasuredAirSpeed,
      "0.6",
    )).toBe(true);
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae].status)
      .toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvIso].status)
      .toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae].chartSource)
      .toBe(ashraeSource);
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvIso].chartSource)
      .toBe(isoSource);

    expect(toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      true,
    )).toBe(true);
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae].status)
      .toBe("stale");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvIso].status)
      .toBe("stale");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.Utci].status)
      .toBe("empty");

    await waitForIdle(toolState);
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae].status)
      .toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvIso].status)
      .toBe("stale");

    expect(toolState.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      ModifierFieldKey.MeasuredAirSpeed,
      "0.7",
    )).toBe(true);
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae].status)
      .toBe("stale");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvIso].status)
      .toBe("stale");
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.Utci].status)
      .toBe("empty");

    toolState.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(toolState);
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae].status)
      .toBe("ready");
  });

  it("feeds one effective PMV request to results and chart generation in operative mode", async () => {
    const toolState = createComfortToolState();
    toolState.actions.setModelOption(OptionKey.TemperatureMode, TemperatureMode.Operative);
    toolState.actions.updateInput(InputId.Input1, InputControlId.Temperature, "24");
    toolState.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      ModifierFieldKey.MeasuredAirSpeed,
      "0.6",
    );
    toolState.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MorningClothingEstimate,
      ModifierFieldKey.MorningOutdoorTemperature,
      "10",
    );
    populateSolarModifier(toolState, InputId.Input1);
    toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      true,
    );
    toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MorningClothingEstimate,
      true,
    );
    toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.SolarGain,
      true,
    );
    await waitForIdle(toolState);

    const baseInputs = toolState.state.inputsByInput[InputId.Input1];
    const effectiveInputs = toolState.selectors.getEffectiveInputsByInput()[InputId.Input1];
    const cache = toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae];
    const chartSource = cache.chartSource as PmvChartSourceDto;
    const request = chartSource.inputs[InputId.Input1];
    const result = cache.resultsByInput[InputId.Input1] as PmvResponseDto;

    expect(baseInputs[FieldKey.DryBulbTemperature]).toBe(24);
    expect(baseInputs[FieldKey.MeanRadiantTemperature]).toBe(24);
    expect(effectiveInputs[FieldKey.DryBulbTemperature]).toBe(24);
    expect(effectiveInputs[FieldKey.MeanRadiantTemperature]).toBeCloseTo(39.1, 6);
    expect(request).toEqual(expect.objectContaining({
      tdb: effectiveInputs[FieldKey.DryBulbTemperature],
      tr: effectiveInputs[FieldKey.MeanRadiantTemperature],
      vr: effectiveInputs[FieldKey.RelativeAirSpeed],
      clo: effectiveInputs[FieldKey.ClothingInsulation],
    }));
    expect(result.vr).toBeCloseTo(request!.vr, 8);

    const expectedPmv = pmvAshraeAdapter.calculate(request!);
    expect(result.pmv).toBeCloseTo(expectedPmv.pmv, 8);
    expect(result.ppd).toBeCloseTo(expectedPmv.ppd, 8);
    expect(toolState.selectors.getResultSections()
      .find(({ title }) => title === "PMV")?.valuesByInput[InputId.Input1]?.text)
      .toBe(result.pmv.toFixed(2));
    expect(toolState.selectors.getChartControlsViewModel().mode.feedback?.passes)
      .toBe(result.isCompliant);

    toolState.actions.setDynamicXAxis(FieldKey.MeanRadiantTemperature);
    const marker = toolState.selectors.getCurrentChartResult()?.traces.find((trace) => (
      trace.name === "Input 1" && trace.mode === "markers"
    ));
    expect(Number(marker?.x?.[0])).toBeCloseTo(request!.tr, 6);
  });

  it("retains modifier configuration while unsupported models ignore and hide it", async () => {
    const toolState = createComfortToolState();
    toolState.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      ModifierFieldKey.MeasuredAirSpeed,
      "0.6",
    );
    toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      true,
    );
    await waitForIdle(toolState);
    const baseAirSpeed = toolState.state.inputsByInput[InputId.Input1]
      [FieldKey.RelativeAirSpeed];

    toolState.actions.setSelectedModel(ComfortModel.Utci);
    await waitForIdle(toolState);

    expect(toolState.state.activeModifiersByInput[InputId.Input1]
      [ModifierId.MeasuredAirSpeed]).toBe(true);
    expect(toolState.selectors.getInputModifierControls()).toEqual([]);
    expect(toolState.selectors.getEffectiveInputsByInput(ComfortModel.Utci)[InputId.Input1]
      [FieldKey.RelativeAirSpeed]).toBe(baseAirSpeed);

    toolState.actions.setSelectedModel(ComfortModel.PmvAshrae);
    expect(toolState.selectors.getInputModifierControls()
      .find(({ id }) => id === ModifierId.MeasuredAirSpeed)?.activeByInput[InputId.Input1])
      .toBe(true);
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

});
