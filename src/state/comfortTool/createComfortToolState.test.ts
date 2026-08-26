import { describe, expect, it, vi } from "vitest";

import { ModelId } from "../../models/modelIds";
import { InputControlId } from "../../models/inputControls";
import {
  AirSpeedControlMode,
  OptionKey,
  TemperatureMode,
} from "../../models/inputModes";
import { InputId } from "../../models/inputSlots";
import { UnitSystem } from "../../models/units";
import { ModelOutputKey } from "../../models/modelCapabilities";
import { WorkspaceId, supportsStandardWorkspace } from "../../models/workspaces";
import { FieldChartProfileKind } from "../../models/output/fieldChartProfile";
import { resolveChartInstanceCapabilities } from "./chartInstancePresentation";
import { ModifierId } from "../../models/inputModifiers";

import {
  pmvAshraeAdapter,
  pmvAshraeModelConfig,
} from "../../comfortModels/pmv/pmvAshrae";
import type { PmvChartSource, PmvResponse } from "../../comfortModels/pmv/pmvCalculation";
import type { UtciResponse } from "../../comfortModels/utci/utci";
import { PhsQuantityId, type PhsResponse } from "../../models/phs";
import { createAnalysisState } from "./createComfortToolState.svelte";
import { comfortModelConfigs, comfortModelOrder } from "./modelConfigs";
import { PhysicalQuantityId } from "../../models/quantities";
function syncWorkspaceToModel(
  toolState: ReturnType<typeof createAnalysisState>,
  modelId: ModelId,
) {
  const capabilities = comfortModelConfigs[modelId].workspaceCapabilities;
  toolState.actions.setActiveWorkspace(
    supportsStandardWorkspace(capabilities)
      ? WorkspaceId.Standard
      : WorkspaceId.Explore,
  );
}

async function waitForIdle(toolState: ReturnType<typeof createAnalysisState>) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    if (!toolState.state.ui.isLoading) {
      return;
    }
  }

  throw new Error("Controller did not finish calculating.");
}

function getOutputSettings(
  toolState: ReturnType<typeof createAnalysisState>,
  modelId = toolState.state.ui.selectedModel,
) {
  return toolState.state.ui.outputSettingsByModel[modelId];
}

function getProfileBadgeControl(toolState: ReturnType<typeof createAnalysisState>) {
  return toolState.selectors.getChartControlsViewModel().profileBadge;
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
  [PhysicalQuantityId.ModifierSolarAltitude, "45"],
  [PhysicalQuantityId.ModifierSolarHorizontalAngle, "90"],
  [PhysicalQuantityId.ModifierDirectSolarRadiation, "800"],
  [PhysicalQuantityId.ModifierSolarTransmittance, "0.5"],
  [PhysicalQuantityId.ModifierSkyVaultViewFraction, "0.5"],
  [PhysicalQuantityId.ModifierBodyExposureFraction, "0.5"],
] as const;

function populateSolarModifier(
  toolState: ReturnType<typeof createAnalysisState>,
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

describe("createAnalysisState", () => {
  it("initializes model chart defaults and independent PMV variants", () => {
    const toolState = createAnalysisState();

    expect(toolState.state.ui.selectedModel).toBe(ModelId.PmvAshrae);
    expect(toolState.state.ui.selectedChartInstanceByModel).toEqual({
      [ModelId.PmvAshrae]: "pmv-ashrae-psychrometric",
      [ModelId.PmvIso]: "pmv-iso-psychrometric",
      [ModelId.Utci]: "utci-stress-band",
      [ModelId.AdaptiveAshrae]: "adaptive-ashrae-boundary",
      [ModelId.AdaptiveEn]: "adaptive-en-boundary",
      [ModelId.HeatIndex]: "heat-index-ranges",
      [ModelId.Humidex]: "humidex-ranges",
      [ModelId.WindChill]: "wind-chill-dynamic-field",
      [ModelId.Phs2023]: "phs-exposure-history",
    });
    expect(toolState.state.ui.modelOptionsByModel[ModelId.PmvAshrae])
      .not.toBe(toolState.state.ui.modelOptionsByModel[ModelId.PmvIso]);
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae])
      .not.toBe(toolState.state.ui.calculationCacheByModel[ModelId.PmvIso]);
    expect(toolState.state.ui.activeWorkspace)
      .toBe(WorkspaceId.Standard);
    expect(toolState.state.ui.activeWorkspace)
      .toBe(WorkspaceId.Standard);
    expect(getOutputSettings(toolState).exploreOutput).toBe(ModelOutputKey.Pmv);
    expect(getOutputSettings(toolState).exploreBands)
      .not.toBe(pmvAshraeModelConfig.exploreOutputs[0].defaultBands);
    expect(getOutputSettings(toolState, ModelId.PmvAshrae).exploreBands)
      .not.toBe(getOutputSettings(toolState, ModelId.PmvIso).exploreBands);
  });

  it("keeps base air speed separate from reversible per-input modifier state", async () => {
    const toolState = createAnalysisState();
    const baseInput1 = toolState.state.quantitiesByInput[InputId.Input1][PhysicalQuantityId.RelativeAirSpeed];
    const baseInput2 = toolState.state.quantitiesByInput[InputId.Input2][PhysicalQuantityId.RelativeAirSpeed];

    expect(toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      true,
    )).toBe(false);
    expect(toolState.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      PhysicalQuantityId.ModifierMeasuredAirSpeed,
      "0.6",
    )).toBe(true);
    expect(toolState.actions.updateModifierInput(
      InputId.Input2,
      ModifierId.MeasuredAirSpeed,
      PhysicalQuantityId.ModifierMeasuredAirSpeed,
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

    expect(toolState.state.quantitiesByInput[InputId.Input1][PhysicalQuantityId.RelativeAirSpeed])
      .toBe(baseInput1);
    expect(toolState.state.quantitiesByInput[InputId.Input2][PhysicalQuantityId.RelativeAirSpeed])
      .toBe(baseInput2);
    expect(toolState.selectors.getEffectiveQuantitiesByInput()[InputId.Input1]
      [PhysicalQuantityId.RelativeAirSpeed]).toBeCloseTo(0.6, 6);
    expect(toolState.selectors.getEffectiveQuantitiesByInput()[InputId.Input2]
      [PhysicalQuantityId.RelativeAirSpeed]).toBeCloseTo(0.83, 6);

    toolState.actions.updateInput(InputId.Input1, InputControlId.AirSpeed, "0.3");
    toolState.actions.updateInput(InputId.Input1, InputControlId.MetabolicRate, "1.8");

    expect(toolState.state.quantitiesByInput[InputId.Input1][PhysicalQuantityId.RelativeAirSpeed])
      .toBe(0.3);
    expect(toolState.selectors.getEffectiveQuantitiesByInput()[InputId.Input1]
      [PhysicalQuantityId.RelativeAirSpeed]).toBeCloseTo(0.84, 6);

    expect(toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      false,
    )).toBe(true);
    expect(toolState.selectors.getEffectiveQuantitiesByInput()[InputId.Input1]
      [PhysicalQuantityId.RelativeAirSpeed]).toBe(0.3);
    expect(toolState.selectors.getEffectiveQuantitiesByInput()[InputId.Input2]
      [PhysicalQuantityId.RelativeAirSpeed]).toBeCloseTo(0.83, 6);
    expect(toolState.state.auxiliaryQuantitiesByInput[InputId.Input1]
      [PhysicalQuantityId.ModifierMeasuredAirSpeed]).toBe(0.6);

    expect(toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      true,
    )).toBe(true);
    expect(toolState.selectors.getEffectiveQuantitiesByInput()[InputId.Input1]
      [PhysicalQuantityId.RelativeAirSpeed]).toBeCloseTo(0.84, 6);

    await waitForIdle(toolState);
  });

  it("projects a canonical-SI draft without mutating state and commits it atomically", async () => {
    const calculateSpy = vi.spyOn(pmvAshraeModelConfig, "calculate");
    try {
      const toolState = createAnalysisState();
      toolState.state.ui.compareEnabled = true;
      toolState.state.auxiliaryQuantitiesByInput[InputId.Input3]
        [PhysicalQuantityId.ModifierMeasuredAirSpeed] = 0.9;
      toolState.state.activeModifiersByInput[InputId.Input3]
        [ModifierId.MeasuredAirSpeed] = true;
      toolState.state.quantitiesByInput[InputId.Input2][PhysicalQuantityId.MetabolicRate] = 1.8;
      const baseInput1Speed = toolState.state.quantitiesByInput[InputId.Input1]
        [PhysicalQuantityId.RelativeAirSpeed];
      const baseInput2Clothing = toolState.state.quantitiesByInput[InputId.Input2]
        [PhysicalQuantityId.ClothingInsulation];

      const draft = toolState.selectors.getInputModifierDraft();
      expect(draft).toHaveLength(8);
      const measuredInput1 = draft.find((entry) => (
        entry.inputId === InputId.Input1
        && entry.modifierId === ModifierId.MeasuredAirSpeed
      ));
      const morningInput2 = draft.find((entry) => (
        entry.inputId === InputId.Input2
        && entry.modifierId === ModifierId.MorningClothingEstimate
      ));
      const dynamicInput2 = draft.find((entry) => (
        entry.inputId === InputId.Input2
        && entry.modifierId === ModifierId.DynamicClothing
      ));
      if (!measuredInput1 || !morningInput2 || !dynamicInput2) {
        throw new Error("Expected complete visible modifier draft entries.");
      }
      measuredInput1.inputs[PhysicalQuantityId.ModifierMeasuredAirSpeed] = 0.6;
      measuredInput1.enabled = true;
      morningInput2.inputs[PhysicalQuantityId.ModifierMorningOutdoorTemperature] = 10;
      morningInput2.enabled = true;
      dynamicInput2.enabled = true;

      const projectedControls = toolState.selectors.getInputModifierControls(draft);
      expect(projectedControls.find(({ id }) => id === ModifierId.MeasuredAirSpeed)
        ?.activeByInput[InputId.Input1]).toBe(true);
      expect(toolState.state.auxiliaryQuantitiesByInput[InputId.Input1]
        [PhysicalQuantityId.ModifierMeasuredAirSpeed]).toBeUndefined();
      expect(toolState.state.activeModifiersByInput[InputId.Input2]
        [ModifierId.DynamicClothing]).toBe(false);

      expect(toolState.actions.applyInputModifierDraft(draft)).toBe(true);
      expect(toolState.state.quantitiesByInput[InputId.Input1]
        [PhysicalQuantityId.RelativeAirSpeed]).toBe(baseInput1Speed);
      expect(toolState.state.quantitiesByInput[InputId.Input2]
        [PhysicalQuantityId.ClothingInsulation]).toBe(baseInput2Clothing);
      expect(toolState.selectors.getEffectiveQuantitiesByInput()[InputId.Input1]
        [PhysicalQuantityId.RelativeAirSpeed]).toBeCloseTo(0.6, 6);
      expect(toolState.selectors.getEffectiveQuantitiesByInput()[InputId.Input2]
        [PhysicalQuantityId.ClothingInsulation]).toBeCloseTo(0.485, 3);
      expect(toolState.state.auxiliaryQuantitiesByInput[InputId.Input3]
        [PhysicalQuantityId.ModifierMeasuredAirSpeed]).toBe(0.9);
      expect(toolState.state.activeModifiersByInput[InputId.Input3]
        [ModifierId.MeasuredAirSpeed]).toBe(true);

      await waitForIdle(toolState);
      expect(calculateSpy).toHaveBeenCalledTimes(1);
    } finally {
      calculateSpy.mockRestore();
    }
  });

  it("rejects an invalid modifier draft without partially writing valid entries", () => {
    const toolState = createAnalysisState();
    const draft = toolState.selectors.getInputModifierDraft();
    const measured = draft.find(({ modifierId }) => (
      modifierId === ModifierId.MeasuredAirSpeed
    ));
    if (!measured) throw new Error("Expected a measured-air-speed draft entry.");
    measured.inputs[PhysicalQuantityId.ModifierMeasuredAirSpeed] = 0.6;
    measured.enabled = true;

    const incompleteDraft = draft.slice(0, -1);
    const stateBeforeApply = JSON.stringify({
      active: toolState.state.activeModifiersByInput,
      inputs: toolState.state.auxiliaryQuantitiesByInput,
    });
    expect(toolState.actions.applyInputModifierDraft(incompleteDraft)).toBe(false);
    expect(JSON.stringify({
      active: toolState.state.activeModifiersByInput,
      inputs: toolState.state.auxiliaryQuantitiesByInput,
    })).toBe(stateBeforeApply);

    const enabledIncompleteDraft = toolState.selectors.getInputModifierDraft();
    const incompleteMeasured = enabledIncompleteDraft.find(({ modifierId }) => (
      modifierId === ModifierId.MeasuredAirSpeed
    ));
    if (!incompleteMeasured) throw new Error("Expected a measured-air-speed draft entry.");
    incompleteMeasured.enabled = true;
    expect(toolState.actions.applyInputModifierDraft(enabledIncompleteDraft)).toBe(false);
    expect(JSON.stringify({
      active: toolState.state.activeModifiersByInput,
      inputs: toolState.state.auxiliaryQuantitiesByInput,
    })).toBe(stateBeforeApply);
  });

  it("stores disabled modifier configuration without invalidating or recalculating", async () => {
    const toolState = createAnalysisState();
    toolState.actions.scheduleCalculation({ immediate: true, force: true });
    await waitForIdle(toolState);
    const calculateSpy = vi.spyOn(pmvAshraeModelConfig, "calculate");
    try {
      const readyCache = toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae];
      expect(readyCache.status).toBe("ready");
      const draft = toolState.selectors.getInputModifierDraft();
      const measured = draft.find(({ modifierId }) => (
        modifierId === ModifierId.MeasuredAirSpeed
      ));
      if (!measured) throw new Error("Expected a measured-air-speed draft entry.");
      measured.inputs[PhysicalQuantityId.ModifierMeasuredAirSpeed] = 0.6;

      expect(toolState.actions.applyInputModifierDraft(draft)).toBe(true);
      await Promise.resolve();

      expect(toolState.state.auxiliaryQuantitiesByInput[InputId.Input1]
        [PhysicalQuantityId.ModifierMeasuredAirSpeed]).toBe(0.6);
      expect(toolState.state.activeModifiersByInput[InputId.Input1]
        [ModifierId.MeasuredAirSpeed]).toBe(false);
      expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae])
        .toBe(readyCache);
      expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].status)
        .toBe("ready");
      expect(calculateSpy).not.toHaveBeenCalled();
    } finally {
      calculateSpy.mockRestore();
    }
  });

  it("applies Morning then Dynamic Clothing per input and recomputes the remaining chain", async () => {
    const toolState = createAnalysisState();
    toolState.state.ui.compareEnabled = true;
    toolState.state.ui.compareInputIds = [InputId.Input1, InputId.Input2];
    toolState.actions.updateInput(
      InputId.Input1,
      InputControlId.MetabolicRate,
      "1.8",
    );
    toolState.actions.updateInput(
      InputId.Input2,
      InputControlId.MetabolicRate,
      "1.8",
    );
    toolState.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MorningClothingEstimate,
      PhysicalQuantityId.ModifierMorningOutdoorTemperature,
      "10",
    );

    const baseInput1Clothing = toolState.state.quantitiesByInput[InputId.Input1]
      [PhysicalQuantityId.ClothingInsulation];
    const baseInput2Clothing = toolState.state.quantitiesByInput[InputId.Input2]
      [PhysicalQuantityId.ClothingInsulation];

    expect(toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MorningClothingEstimate,
      true,
    )).toBe(true);
    const morningClothing = toolState.selectors.getEffectiveQuantitiesByInput()
      [InputId.Input1][PhysicalQuantityId.ClothingInsulation];
    expect(morningClothing).toBeCloseTo(0.59, 2);

    expect(toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.DynamicClothing,
      true,
    )).toBe(true);
    expect(toolState.actions.setModifierEnabled(
      InputId.Input2,
      ModifierId.DynamicClothing,
      true,
    )).toBe(true);
    const chainedClothing = toolState.selectors.getEffectiveQuantitiesByInput()
      [InputId.Input1][PhysicalQuantityId.ClothingInsulation];
    const input2DynamicClothing = toolState.selectors.getEffectiveQuantitiesByInput()
      [InputId.Input2][PhysicalQuantityId.ClothingInsulation];
    expect(chainedClothing).toBeCloseTo(0.485, 3);
    expect(input2DynamicClothing).not.toBe(baseInput2Clothing);
    expect(toolState.state.quantitiesByInput[InputId.Input1]
      [PhysicalQuantityId.ClothingInsulation]).toBe(baseInput1Clothing);
    expect(toolState.state.quantitiesByInput[InputId.Input2]
      [PhysicalQuantityId.ClothingInsulation]).toBe(baseInput2Clothing);

    expect(toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MorningClothingEstimate,
      false,
    )).toBe(true);
    const baseDynamicClothing = toolState.selectors.getEffectiveQuantitiesByInput()
      [InputId.Input1][PhysicalQuantityId.ClothingInsulation];
    expect(baseDynamicClothing).not.toBe(chainedClothing);
    expect(baseDynamicClothing).not.toBe(baseInput1Clothing);

    expect(toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MorningClothingEstimate,
      true,
    )).toBe(true);
    expect(toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.DynamicClothing,
      false,
    )).toBe(true);
    expect(toolState.selectors.getEffectiveQuantitiesByInput()[InputId.Input1]
      [PhysicalQuantityId.ClothingInsulation]).toBe(morningClothing);
    expect(toolState.selectors.getEffectiveQuantitiesByInput()[InputId.Input2]
      [PhysicalQuantityId.ClothingInsulation]).toBe(input2DynamicClothing);

    expect(toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MorningClothingEstimate,
      false,
    )).toBe(true);
    expect(toolState.selectors.getEffectiveQuantitiesByInput()[InputId.Input1]
      [PhysicalQuantityId.ClothingInsulation]).toBe(baseInput1Clothing);

    await waitForIdle(toolState);
  });

  it("exposes Dynamic Clothing only for the two PMV declarations", () => {
    const toolState = createAnalysisState();

    for (const modelId of comfortModelOrder) {
      toolState.state.ui.selectedModel = modelId;
      const modifierIds = toolState.selectors.getInputModifierControls()
        .map(({ id }) => id);
      expect(modifierIds.includes(ModifierId.DynamicClothing)).toBe(
        modelId === ModelId.PmvAshrae || modelId === ModelId.PmvIso,
      );
    }
  });

  it("disables an active incomplete modifier without clearing its other inputs", async () => {
    const toolState = createAnalysisState();
    const baseRadiantTemperature = toolState.state.quantitiesByInput[InputId.Input1]
      [PhysicalQuantityId.MeanRadiantTemperature];
    populateSolarModifier(toolState, InputId.Input1);

    expect(toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.SolarGain,
      true,
    )).toBe(true);
    expect(toolState.selectors.getEffectiveQuantitiesByInput()[InputId.Input1]
      [PhysicalQuantityId.MeanRadiantTemperature]).toBeCloseTo(baseRadiantTemperature + 15.1, 6);

    expect(toolState.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.SolarGain,
      PhysicalQuantityId.ModifierSolarTransmittance,
      "",
    )).toBe(true);

    expect(toolState.state.activeModifiersByInput[InputId.Input1][ModifierId.SolarGain])
      .toBe(false);
    expect(toolState.state.auxiliaryQuantitiesByInput[InputId.Input1]
      [PhysicalQuantityId.ModifierSolarTransmittance]).toBeUndefined();
    expect(toolState.state.auxiliaryQuantitiesByInput[InputId.Input1]
      [PhysicalQuantityId.ModifierDirectSolarRadiation]).toBe(800);
    expect(toolState.selectors.getEffectiveQuantitiesByInput()[InputId.Input1]
      [PhysicalQuantityId.MeanRadiantTemperature]).toBe(baseRadiantTemperature);

    await waitForIdle(toolState);
  });

  it("keeps stored and effective SI values invariant when display units change", async () => {
    const toolState = createAnalysisState();
    toolState.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      PhysicalQuantityId.ModifierMeasuredAirSpeed,
      "0.6",
    );
    toolState.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MorningClothingEstimate,
      PhysicalQuantityId.ModifierMorningOutdoorTemperature,
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

    const storedSi = JSON.stringify(toolState.state.auxiliaryQuantitiesByInput);
    const effectiveSi = toolState.selectors.getEffectiveQuantitiesByInput();

    toolState.actions.toggleUnitSystem();

    expect(toolState.state.ui.unitSystem).toBe(UnitSystem.IP);
    expect(JSON.stringify(toolState.state.auxiliaryQuantitiesByInput)).toBe(storedSi);
    expect(toolState.selectors.getEffectiveQuantitiesByInput()).toEqual(effectiveSi);

    const controls = toolState.selectors.getInputModifierControls();
    const measured = controls.find(({ id }) => id === ModifierId.MeasuredAirSpeed);
    const clothing = controls.find(({ id }) => id === ModifierId.MorningClothingEstimate);
    const solar = controls.find(({ id }) => id === ModifierId.SolarGain);
    expect(measured?.extraInputs[0].displayValuesByInput[InputId.Input1]).toBe("1.97");
    expect(clothing?.extraInputs[0].displayValuesByInput[InputId.Input1]).toBe("50.0");
    expect(solar?.extraInputs.find(({ key }) => (
      key === PhysicalQuantityId.ModifierDirectSolarRadiation
    ))?.displayValuesByInput[InputId.Input1]).toBe("253.599");

    toolState.actions.toggleUnitSystem();
    expect(JSON.stringify(toolState.state.auxiliaryQuantitiesByInput)).toBe(storedSi);
    expect(toolState.selectors.getEffectiveQuantitiesByInput()).toEqual(effectiveSi);
  });

  it.each([
    [ModelId.PmvAshrae, FieldChartProfileKind.Compliance],
    [ModelId.PmvIso, FieldChartProfileKind.Compliance],
    [ModelId.Utci, FieldChartProfileKind.Explore],
    [ModelId.AdaptiveAshrae, FieldChartProfileKind.Compliance],
    [ModelId.AdaptiveEn, FieldChartProfileKind.Compliance],
    [ModelId.HeatIndex, FieldChartProfileKind.Explore],
    [ModelId.Humidex, FieldChartProfileKind.Explore],
    [ModelId.WindChill, FieldChartProfileKind.Explore],
  ] as const)(
    "opens %s on its declared default mode",
    (modelId, expectedMode) => {
      const toolState = createAnalysisState();
      toolState.state.ui.selectedModel = modelId;
      toolState.actions.setActiveWorkspace(
        expectedMode === FieldChartProfileKind.Explore
          ? WorkspaceId.Explore
          : WorkspaceId.Standard,
      );

      const mode = getProfileBadgeControl(toolState);
      expect(mode.profileKind).toBe(expectedMode);
    },
  );

  it("provides one active mode config for every registered selectable chart", async () => {
    const toolState = createAnalysisState();
    toolState.state.ui.compareEnabled = true;
    await waitForIdle(toolState);

    for (const modelId of comfortModelOrder) {
      toolState.state.ui.selectedModel = modelId;
      const modelConfig = comfortModelConfigs[modelId];
      const settings = getOutputSettings(toolState, modelId);

      for (const chart of modelConfig.chartInstances.entries) {
        const registration = modelConfig.chartEngineRegistrations.find(
          ({ instanceId }) => instanceId === chart.instanceId,
        );
        toolState.actions.setActiveWorkspace(
          registration?.supportedExploreOutputs?.length
            ? WorkspaceId.Explore
            : supportsStandardWorkspace(modelConfig.workspaceCapabilities)
              ? WorkspaceId.Standard
              : WorkspaceId.Explore,
        );
        toolState.actions.setSelectedChartInstance(chart.instanceId);
        const controls = toolState.selectors.getChartControlsViewModel();
        const supportsAxisSelection = resolveChartInstanceCapabilities(chart).allowsAxisSelection;
        const onExploreWorkspace = toolState.state.ui.activeWorkspace === WorkspaceId.Explore;
        const expectedBands = onExploreWorkspace
          ? modelConfig.complianceProfile?.bands
          : settings.exploreBands;
        const outputKey = onExploreWorkspace
          ? settings.exploreOutput
          : modelConfig.complianceProfile?.output;
        const output = modelConfig.exploreOutputs.find(
          ({ key }) => key === outputKey,
        );
        const expectedLegendTitle = (
          output?.legendTitle
          ?? output?.label
          ?? modelConfig.complianceProfile?.legendTitle
        ) || "Bands";

        expect(controls.profileBadge?.profileKind).toBe(
          toolState.state.ui.activeWorkspace === WorkspaceId.Explore
            ? FieldChartProfileKind.Explore
            : FieldChartProfileKind.Compliance,
        );
        expect(controls.baseline?.selectedInputId).toBe(InputId.Input1);
        expect(controls.axes === null).toBe(!supportsAxisSelection);
        expect(controls.explore === null).toBe(!onExploreWorkspace);
        const expectedLegendBands = resolveChartInstanceCapabilities(chart).showsLegend
          ? toLegendBands(expectedBands ?? undefined)
          : null;
        if (toolState.selectors.getCurrentCacheStatus() === "ready") {
          expect(toolState.selectors.getCurrentChartLegendZones())
            .toEqual(expectedLegendBands);
          expect(toolState.selectors.getCurrentChartLegendTitle())
            .toBe(resolveChartInstanceCapabilities(chart).showsLegend ? expectedLegendTitle : "");
        }
      }
    }
  });

  it("constrains PHS exposure history to its declared Explore output", () => {
    const toolState = createAnalysisState();
    toolState.state.ui.selectedModel = ModelId.Phs2023;
    toolState.actions.setActiveWorkspace(WorkspaceId.Explore);

    expect(toolState.selectors.getCurrentChartInstanceId())
      .toBe("phs-exposure-history");
    expect(getOutputSettings(toolState).exploreOutput)
      .toBe(ModelOutputKey.PhsRectalTemperature);
    expect(toolState.selectors.getChartControlsViewModel().explore?.outputs.map(
      ({ key }) => key,
    )).toEqual([ModelOutputKey.PhsRectalTemperature]);

    toolState.actions.setSelectedChartInstance("phs-dynamic-field");
    toolState.actions.setExploreOutput(ModelOutputKey.PhsWaterLoss);
    expect(getOutputSettings(toolState).exploreOutput)
      .toBe(ModelOutputKey.PhsWaterLoss);

    toolState.actions.setSelectedChartInstance("phs-exposure-history");
    expect(getOutputSettings(toolState).exploreOutput)
      .toBe(ModelOutputKey.PhsRectalTemperature);
    toolState.actions.setExploreOutput(ModelOutputKey.PhsWaterLoss);
    expect(getOutputSettings(toolState).exploreOutput)
      .toBe(ModelOutputKey.PhsRectalTemperature);
  });

  it("recalculates PHS when a model quantity changes without affecting other models", async () => {
    const toolState = createAnalysisState();
    toolState.actions.setSelectedModel(ModelId.Humidex);
    syncWorkspaceToModel(toolState, ModelId.Humidex);
    toolState.actions.scheduleCalculation({ immediate: true, force: true });
    await waitForIdle(toolState);
    const humidexBefore = toolState.state.ui.calculationCacheByModel[ModelId.Humidex]
      .resultsByInput[InputId.Input1];

    toolState.actions.setSelectedModel(ModelId.Phs2023);
    toolState.actions.setActiveWorkspace(WorkspaceId.Standard);
    toolState.actions.scheduleCalculation({ immediate: true, force: true });
    await waitForIdle(toolState);

    const phsBefore = (toolState.state.ui.calculationCacheByModel[ModelId.Phs2023]
      .resultsByInput[InputId.Input1] as PhsResponse | null)?.waterLossLimitG;

    expect(
      toolState.actions.updateModelQuantity(
        ModelId.Phs2023,
        PhsQuantityId.BodyWeight,
        90,
      ),
    ).toBe(true);
    toolState.actions.scheduleCalculation({ immediate: true, force: true });
    await waitForIdle(toolState);

    const phsAfter = (toolState.state.ui.calculationCacheByModel[ModelId.Phs2023]
      .resultsByInput[InputId.Input1] as PhsResponse | null)?.waterLossLimitG;
    expect(phsAfter).toBeDefined();
    expect(phsAfter).not.toBe(phsBefore);
    expect(toolState.state.modelInputsByModel[ModelId.Phs2023]
      [PhsQuantityId.BodyWeight]).toBe(90);

    toolState.actions.setSelectedModel(ModelId.Humidex);
    syncWorkspaceToModel(toolState, ModelId.Humidex);
    toolState.actions.scheduleCalculation({ immediate: true, force: true });
    await waitForIdle(toolState);
    expect(toolState.state.ui.calculationCacheByModel[ModelId.Humidex]
      .resultsByInput[InputId.Input1]).toEqual(humidexBefore);
  });

  it("keeps ASHRAE and ISO mode settings independent from chart selection", () => {
    const toolState = createAnalysisState();
    const ashraeChart = toolState.state.ui.selectedChartInstanceByModel[ModelId.PmvAshrae];

    toolState.actions.setActiveWorkspace(WorkspaceId.Explore);
    toolState.actions.setDynamicXAxis(PhysicalQuantityId.MeanRadiantTemperature);
    expect(toolState.state.ui.selectedChartInstanceByModel[ModelId.PmvAshrae])
      .toBe(ashraeChart);

    toolState.state.ui.selectedModel = ModelId.PmvIso;
    toolState.actions.setActiveWorkspace(WorkspaceId.Standard);
    expect(getProfileBadgeControl(toolState).profileKind).toBe(FieldChartProfileKind.Compliance);
    expect(getOutputSettings(toolState).xAxis).toBe(PhysicalQuantityId.DryBulbTemperature);
    toolState.actions.setActiveWorkspace(WorkspaceId.Explore);
    toolState.actions.setExploreOutput(ModelOutputKey.Ppd);

    toolState.state.ui.selectedModel = ModelId.PmvAshrae;
    expect(getProfileBadgeControl(toolState).profileKind).toBe(FieldChartProfileKind.Explore);
    expect(getOutputSettings(toolState).xAxis).toBe(PhysicalQuantityId.MeanRadiantTemperature);
    expect(getOutputSettings(toolState).exploreOutput).toBe(ModelOutputKey.Pmv);
  });

  it("falls back to Input 1 without erasing a temporarily hidden baseline", async () => {
    const toolState = createAnalysisState();
    toolState.actions.setCompareEnabled(true);
    await waitForIdle(toolState);
    toolState.actions.setSelectedChartInstance("pmv-ashrae-dynamic-field");
    toolState.actions.setChartBaselineInputId(InputId.Input2);

    expect(toolState.selectors.getChartControlsViewModel().baseline?.selectedInputId)
      .toBe(InputId.Input2);
    toolState.actions.toggleCompareInputVisibility(InputId.Input2);
    await waitForIdle(toolState);

    expect(getOutputSettings(toolState).baselineInputId).toBe(InputId.Input2);
    expect(toolState.selectors.getChartControlsViewModel().baseline?.selectedInputId)
      .toBe(InputId.Input1);

    toolState.actions.toggleCompareInputVisibility(InputId.Input2);
    await waitForIdle(toolState);
    expect(toolState.selectors.getChartControlsViewModel().baseline?.selectedInputId)
      .toBe(InputId.Input2);
  });

  it("builds mode captions and baseline-specific Compliance feedback", async () => {
    const toolState = createAnalysisState();
    toolState.actions.setCompareEnabled(true);
    await waitForIdle(toolState);
    toolState.actions.setSelectedChartInstance("pmv-ashrae-dynamic-field");
    toolState.actions.setChartBaselineInputId(InputId.Input2);

    const compliance = getProfileBadgeControl(toolState);
    expect(compliance.caption).toContain("ASHRAE 55");
    expect(compliance.feedback).toEqual(expect.objectContaining({
      inputLabel: "Input 2",
      text: expect.any(String),
      passes: expect.any(Boolean),
    }));

    toolState.actions.setActiveWorkspace(WorkspaceId.Explore);
    const explore = getProfileBadgeControl(toolState);
    expect(explore.caption).toBe(
      "Showing PMV over the selected axes with editable thresholds.",
    );
    expect(explore.feedback).toBeNull();
  });

  it("keeps mode and baseline controls on fixed views and exposes declared axes", () => {
    const toolState = createAnalysisState();
    toolState.state.ui.compareEnabled = true;

    expect(getProfileBadgeControl(toolState).profileKind).toBe(FieldChartProfileKind.Compliance);

    toolState.actions.setSelectedChartInstance("pmv-ashrae-psychrometric");
    const fixed = toolState.selectors.getChartControlsViewModel();
    expect(fixed.profileBadge?.profileKind).toBe(FieldChartProfileKind.Compliance);
    expect(fixed.baseline?.selectedInputId).toBe(InputId.Input1);
    expect(fixed.axes).toBeNull();
    expect(fixed.explore).toBeNull();

    toolState.actions.setActiveWorkspace(WorkspaceId.Explore);
    const fixedExplore = toolState.selectors.getChartControlsViewModel();
    expect(fixedExplore.profileBadge?.caption).toContain("fixed axes");
    expect(fixedExplore.explore?.profile.kind).toBe(FieldChartProfileKind.Explore);

    toolState.actions.setSelectedChartInstance("pmv-ashrae-dynamic-field");
    expect(getProfileBadgeControl(toolState).profileKind).toBe(FieldChartProfileKind.Explore);
    expect(toolState.selectors.getChartControlsViewModel().axes).not.toBeUndefined();

    toolState.state.ui.selectedModel = ModelId.AdaptiveAshrae;
    syncWorkspaceToModel(toolState, ModelId.AdaptiveAshrae);
    const adaptive = getProfileBadgeControl(toolState);
    expect(adaptive.profileKind).toBe(FieldChartProfileKind.Compliance);
    expect(adaptive.caption).toContain("ASHRAE 55 80% and 90%");
    toolState.actions.setSelectedChartInstance("adaptive-ashrae-boundary");
    const adaptiveControls = toolState.selectors.getChartControlsViewModel();
    expect(adaptiveControls.profileBadge?.profileKind).toBe(FieldChartProfileKind.Compliance);
    expect(adaptiveControls.baseline?.selectedInputId).toBe(InputId.Input1);
    expect(adaptiveControls.axes?.x.options).toEqual([
      PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
      PhysicalQuantityId.OperativeTemperature,
    ]);
    expect(adaptiveControls.axes?.y.options).toEqual([
      PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
      PhysicalQuantityId.OperativeTemperature,
    ]);
    expect(adaptiveControls.explore).toBeNull();

    toolState.state.ui.selectedModel = ModelId.Utci;
    syncWorkspaceToModel(toolState, ModelId.Utci);
    const utci = getProfileBadgeControl(toolState);
    expect(utci.profileKind).toBe(FieldChartProfileKind.Explore);
    expect(utci.caption).toContain("Showing UTCI");
    toolState.actions.setSelectedChartInstance("utci-stress-band");
    const utciFixed = toolState.selectors.getChartControlsViewModel();
    expect(utciFixed.profileBadge?.profileKind).toBe(FieldChartProfileKind.Explore);
    expect(utciFixed.baseline?.selectedInputId).toBe(InputId.Input1);
    expect(utciFixed.axes).toBeNull();
    expect(utciFixed.explore?.profile.zOutput).toBe(ModelOutputKey.Utci);
  });

  it("rebuilds chart presentation without invalidating or replacing ready calculations", async () => {
    const toolState = createAnalysisState();
    toolState.actions.setCompareEnabled(true);
    await waitForIdle(toolState);

    const cache = toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae];
    const chartSource = cache.chartSource;
    const resultsByInput = cache.resultsByInput;
    const input1Result = cache.resultsByInput[InputId.Input1];
    const assertCalculationIdentity = () => {
      const current = toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae];
      expect(current).toBe(cache);
      expect(current.status).toBe("ready");
      expect(current.chartSource).toBe(chartSource);
      expect(current.resultsByInput).toBe(resultsByInput);
      expect(current.resultsByInput[InputId.Input1]).toBe(input1Result);
      expect(toolState.state.ui.isLoading).toBe(false);
    };

    toolState.actions.setSelectedChartInstance("pmv-ashrae-dynamic-field");
    assertCalculationIdentity();
    expect(toolState.selectors.getCurrentChartResult()?.layout.title)
      .toContain("Dynamic Chart");

    const complianceBands = pmvAshraeModelConfig.complianceProfile?.bands;
    const complianceChart = toolState.selectors.getCurrentChartResult();
    expect(getProfileBadgeControl(toolState).profileKind)
      .toBe(FieldChartProfileKind.Compliance);
    expect(toolState.selectors.getChartControlsViewModel().explore).toBeNull();
    const complianceLegend = toolState.selectors.getCurrentChartLegendZones();
    if (complianceLegend) {
      expect(complianceLegend).toEqual(toLegendBands(complianceBands));
    }

    toolState.actions.setActiveWorkspace(WorkspaceId.Explore);
    assertCalculationIdentity();

    const exploreChart = toolState.selectors.getCurrentChartResult();
    expect(exploreChart?.traces).not.toEqual(complianceChart?.traces);
    expect(toolState.selectors.getCurrentChartLegendZones())
      .toEqual(toLegendBands(getOutputSettings(toolState).exploreBands ?? undefined));

    expect(
      toolState.selectors.getChartControlsViewModel().explore?.profile,
    ).toEqual(expect.objectContaining({
      xField: PhysicalQuantityId.DryBulbTemperature,
      yField: PhysicalQuantityId.RelativeHumidity,
      zOutput: ModelOutputKey.Pmv,
    }));
    expect(toolState.selectors.getCurrentChartLegendTitle()).toBe("PMV Zones");

    toolState.actions.setDynamicXAxis(PhysicalQuantityId.MeanRadiantTemperature);
    assertCalculationIdentity();
    toolState.actions.setDynamicYAxis(PhysicalQuantityId.OperativeTemperature);
    assertCalculationIdentity();
    toolState.actions.setChartBaselineInputId(InputId.Input2);
    assertCalculationIdentity();

    toolState.actions.setExploreOutput(ModelOutputKey.Ppd);
    assertCalculationIdentity();
    expect(getOutputSettings(toolState).exploreOutput).toBe(ModelOutputKey.Ppd);
    expect(toolState.selectors.getCurrentChartLegendTitle()).toBe("PPD Bands");

    const ppdBands = getOutputSettings(toolState).exploreBands?.map((band) => ({ ...band })) ?? [];
    toolState.actions.setExploreOutput(ModelOutputKey.Utci);
    assertCalculationIdentity();
    expect(getOutputSettings(toolState).exploreOutput).toBe(ModelOutputKey.Ppd);

    expect(toolState.actions.setExploreBands([
      { min: 0, max: 20, label: "One", color: "#000" },
      { min: 10, max: 30, label: "Two", color: "#fff" },
    ])).toBe(false);
    assertCalculationIdentity();
    expect(getOutputSettings(toolState).exploreBands).toEqual(ppdBands);

    expect(toolState.actions.setExploreBands([
      { min: 10, max: Infinity, label: "High", color: "#f00" },
      { min: -Infinity, max: 10, label: "Low", color: "#00f" },
    ])).toBe(true);
    assertCalculationIdentity();
    expect(getOutputSettings(toolState).exploreBands?.map(({ label }) => label))
      .toEqual(["Low", "High"]);

    toolState.actions.setActiveWorkspace(WorkspaceId.Standard);
    assertCalculationIdentity();
    expect(getProfileBadgeControl(toolState).profileKind).toBe(FieldChartProfileKind.Compliance);
    const complianceLegendAfterStandard = toolState.selectors.getCurrentChartLegendZones();
    if (complianceLegendAfterStandard) {
      expect(complianceLegendAfterStandard).toEqual(toLegendBands(complianceBands));
    }
    expect(toolState.selectors.getCurrentChartLegendTitle()).toBe("PMV Zones");
    expect(toolState.selectors.getCurrentChartResult()?.traces)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "PMV bands hover" }),
      ]));
    expect(toolState.selectors.getChartControlsViewModel().explore).toBeNull();

    toolState.actions.setActiveWorkspace(WorkspaceId.Explore);
    assertCalculationIdentity();
    expect(toolState.selectors.getCurrentChartLegendZones())
      .toEqual(toLegendBands(getOutputSettings(toolState).exploreBands ?? undefined));
    expect(toolState.selectors.getCurrentChartLegendTitle()).toBe("PPD Bands");
    expect(getOutputSettings(toolState).exploreBands?.map(({ label }) => label))
      .toEqual(["Low", "High"]);

    const editedBands = getOutputSettings(toolState).exploreBands;
    toolState.actions.setExploreOutput(ModelOutputKey.Ppd);
    expect(getOutputSettings(toolState).exploreBands).toBe(editedBands);

    toolState.actions.toggleUnitSystem();
    assertCalculationIdentity();
    expect(getOutputSettings(toolState).exploreBands![1].min).toBe(10);
    expect(toolState.selectors.getCurrentChartResult()).not.toBeUndefined();
  });

  it("rebuilds Adaptive regions from the selected cached comparison baseline", async () => {
    const toolState = createAnalysisState();
    toolState.actions.setSelectedModel(ModelId.AdaptiveAshrae);
    await waitForIdle(toolState);
    toolState.state.quantitiesByInput[InputId.Input2][PhysicalQuantityId.RelativeAirSpeed] = 1.2;
    toolState.actions.setCompareEnabled(true);
    await waitForIdle(toolState);

    const cache = toolState.state.ui.calculationCacheByModel[ModelId.AdaptiveAshrae];
    const chartSource = cache.chartSource;
    const resultsByInput = cache.resultsByInput;
    const getTooWarmBoundary = () => toolState.selectors.getCurrentChartResult()?.traces
      .find(({ name, fill }) => name === "Too Warm" && fill === "toself")?.y;
    const input1Boundary = getTooWarmBoundary();

    toolState.actions.setChartBaselineInputId(InputId.Input2);

    expect(toolState.state.ui.calculationCacheByModel[ModelId.AdaptiveAshrae])
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

    toolState.state.quantitiesByInput[InputId.Input2][PhysicalQuantityId.RelativeAirSpeed] = 0.1;
    expect(getTooWarmBoundary()).toEqual(input2Boundary);

    toolState.actions.setDynamicXAxis(PhysicalQuantityId.OperativeTemperature);
    expect(getOutputSettings(toolState)).toEqual(expect.objectContaining({
      xAxis: PhysicalQuantityId.OperativeTemperature,
      yAxis: PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
    }));
    expect(toolState.state.ui.calculationCacheByModel[ModelId.AdaptiveAshrae])
      .toBe(cache);
    expect(cache.chartSource).toBe(chartSource);
    expect(cache.resultsByInput).toBe(resultsByInput);
    expect(toolState.state.ui.isLoading).toBe(false);
    expect(toolState.selectors.getCurrentChartResult()?.layout.xaxis.title)
      .toContain("Operative temperature");

    toolState.actions.toggleUnitSystem();
    expect(toolState.state.ui.calculationCacheByModel[ModelId.AdaptiveAshrae])
      .toBe(cache);
    expect(cache.chartSource).toBe(chartSource);
    expect(cache.resultsByInput).toBe(resultsByInput);
    expect(toolState.state.ui.isLoading).toBe(false);
    expect(toolState.selectors.getCurrentChartResult()?.layout.xaxis.title)
      .toContain("°F");
  });

  it("retains independent mode, axes, output, bands, baseline, and chart selections", async () => {
    const toolState = createAnalysisState();
    toolState.actions.setCompareEnabled(true);
    await waitForIdle(toolState);
    toolState.actions.setActiveWorkspace(WorkspaceId.Explore);
    toolState.actions.setExploreOutput(ModelOutputKey.Ppd);
    toolState.actions.setExploreBands([
      { min: -Infinity, max: 15, label: "Preferred", color: "#0f0" },
      { min: 15, max: Infinity, label: "Other", color: "#f00" },
    ]);

    toolState.actions.setSelectedChartInstance("pmv-ashrae-dynamic-field");
    toolState.actions.setSelectedChartInstance("pmv-ashrae-psychrometric");
    toolState.actions.setDynamicXAxis(PhysicalQuantityId.MeanRadiantTemperature);
    toolState.actions.setChartBaselineInputId(InputId.Input2);
    expect(getOutputSettings(toolState).exploreBands![0].label).toBe("Preferred");
    expect(toolState.selectors.getChartControlsViewModel().profileBadge?.profileKind)
      .toBe(FieldChartProfileKind.Explore);
    expect(toolState.selectors.getChartControlsViewModel().explore?.profile)
      .toEqual(expect.objectContaining({
        zOutput: ModelOutputKey.Ppd,
        bands: expect.arrayContaining([
          expect.objectContaining({ label: "Preferred" }),
        ]),
      }));

    toolState.actions.setSelectedModel(ModelId.Utci);
    syncWorkspaceToModel(toolState, ModelId.Utci);
    await waitForIdle(toolState);
    expect(getProfileBadgeControl(toolState).profileKind).toBe(FieldChartProfileKind.Explore);
    expect(getOutputSettings(toolState).exploreOutput).toBe(ModelOutputKey.Utci);

    toolState.actions.setSelectedModel(ModelId.AdaptiveAshrae);
    syncWorkspaceToModel(toolState, ModelId.AdaptiveAshrae);
    await waitForIdle(toolState);
    expect(getProfileBadgeControl(toolState).profileKind).toBe(FieldChartProfileKind.Compliance);
    expect(getOutputSettings(toolState).exploreOutput).toBeNull();
    expect(toolState.selectors.getChartControlsViewModel().explore).toBeNull();

    toolState.actions.setSelectedModel(ModelId.PmvAshrae);
    toolState.actions.setActiveWorkspace(WorkspaceId.Explore);
    expect(getOutputSettings(toolState)).toEqual(expect.objectContaining({
      xAxis: PhysicalQuantityId.MeanRadiantTemperature,
      baselineInputId: InputId.Input2,
    }));
    expect(toolState.state.ui.activeWorkspace).toBe(WorkspaceId.Explore);
    expect(getOutputSettings(toolState).exploreOutput).toBe(ModelOutputKey.Ppd);
    expect(getOutputSettings(toolState).exploreBands![0].label).toBe("Preferred");
    expect(toolState.state.ui.selectedChartInstanceByModel[ModelId.PmvAshrae])
      .toBe("pmv-ashrae-psychrometric");

    toolState.actions.setSelectedChartInstance("pmv-ashrae-dynamic-field");
    expect(getProfileBadgeControl(toolState).profileKind).toBe(FieldChartProfileKind.Explore);
    expect(toolState.selectors.getChartControlsViewModel().axes?.x.selectedField)
      .toBe(PhysicalQuantityId.MeanRadiantTemperature);
    expect(toolState.selectors.getChartControlsViewModel().baseline?.selectedInputId)
      .toBe(InputId.Input2);
    expect(toolState.selectors.getChartControlsViewModel().explore?.profile.zOutput)
      .toBe(ModelOutputKey.Ppd);
    expect(toolState.selectors.getChartControlsViewModel().explore?.profile.bands[0].label)
      .toBe("Preferred");
  });

  it("round-trips field-chart settings in the strict v1 share snapshot", async () => {
    const toolState = createAnalysisState();
    toolState.actions.setSelectedChartInstance("pmv-ashrae-dynamic-field");
    toolState.actions.setActiveWorkspace(WorkspaceId.Explore);
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
    expect(snapshot.models[ModelId.PmvAshrae].selectedChartInstanceId)
      .toBe("pmv-ashrae-dynamic-field");
    expect(toolState.state.ui.selectedChartInstanceByModel[ModelId.PmvAshrae])
      .toBe("pmv-ashrae-dynamic-field");
    expect(snapshot.models[ModelId.PmvAshrae].outputSettings)
      .toEqual(expect.objectContaining({
        baselineInputId: InputId.Input2,
        exploreOutput: ModelOutputKey.Ppd,
      }));
    expect(getOutputSettings(toolState).exploreOutput).toBe(ModelOutputKey.Ppd);
    expect(getOutputSettings(toolState).exploreBands![0].label).toBe("Edited");
  });

  it("keeps Adaptive on one Compliance chart with only its two semantic axes", () => {
    const toolState = createAnalysisState();
    toolState.state.ui.selectedModel = ModelId.AdaptiveAshrae;
    syncWorkspaceToModel(toolState, ModelId.AdaptiveAshrae);
    const settings = getOutputSettings(toolState);
    const controls = toolState.selectors.getChartControlsViewModel();

    expect(toolState.selectors.getCurrentChartInstances()).toEqual([
      expect.objectContaining({ instanceId: "adaptive-ashrae-boundary", name: "Adaptive" }),
    ]);
    expect(settings).toEqual(expect.objectContaining({
      xAxis: PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
      yAxis: PhysicalQuantityId.OperativeTemperature,
      exploreOutput: null,
    }));
    expect(controls.axes?.x.selectedField)
      .toBe(PhysicalQuantityId.PrevailingMeanOutdoorTemperature);
    expect(controls.axes?.y.selectedField).toBe(PhysicalQuantityId.OperativeTemperature);
    expect(controls.axes?.x.options).toEqual([
      PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
      PhysicalQuantityId.OperativeTemperature,
    ]);
    expect(controls.axes?.y.options).toEqual([
      PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
      PhysicalQuantityId.OperativeTemperature,
    ]);
    expect(controls.explore).toBeNull();

    toolState.actions.setDynamicYAxis(PhysicalQuantityId.PrevailingMeanOutdoorTemperature);
    expect(settings.xAxis).toBe(PhysicalQuantityId.OperativeTemperature);
    expect(settings.yAxis).toBe(PhysicalQuantityId.PrevailingMeanOutdoorTemperature);
  });

  it("deduplicates legend entries by label and color without changing geometry bands", async () => {
    const toolState = createAnalysisState();
    toolState.actions.scheduleCalculation({ immediate: true, force: true });

    const assertions = [
      [ModelId.PmvAshrae, 3, 2],
      [ModelId.AdaptiveAshrae, 5, 4],
      [ModelId.AdaptiveEn, 7, 5],
    ] as const;
    await waitForIdle(toolState);
    for (const [modelId, geometryCount, legendCount] of assertions) {
      toolState.state.ui.selectedModel = modelId;
      syncWorkspaceToModel(toolState, modelId);
      toolState.actions.scheduleCalculation({ immediate: true, force: true });
      await waitForIdle(toolState);
      expect(comfortModelConfigs[modelId].complianceProfile?.bands)
        .toHaveLength(geometryCount);
      if (toolState.selectors.getCurrentCacheStatus() !== "ready") {
        continue;
      }
      const legendZones = toolState.selectors.getCurrentChartLegendZones();
      expect(legendZones?.length ?? 0).toBe(legendCount);
    }

    toolState.state.ui.selectedModel = ModelId.PmvAshrae;
    toolState.actions.setActiveWorkspace(WorkspaceId.Explore);
    expect(toolState.actions.setExploreBands([
      { min: -Infinity, max: 0, label: "Same label", color: "#00ff00" },
      { min: 0, max: Infinity, label: "Same label", color: "#ff0000" },
    ])).toBe(true);
    expect(toolState.selectors.getCurrentChartLegendZones()).toEqual([
      { label: "Same label", color: "#00ff00" },
      { label: "Same label", color: "#ff0000" },
    ]);
    expect(getOutputSettings(toolState).exploreBands).toHaveLength(2);
  });

  it("exposes coupled UTCI temperature axes in both directions", () => {
    const toolState = createAnalysisState();
    toolState.state.ui.selectedModel = ModelId.Utci;
    syncWorkspaceToModel(toolState, ModelId.Utci);
    toolState.state.ui.selectedChartInstanceByModel[ModelId.Utci] = "utci-dynamic-field";
    const settings = getOutputSettings(toolState);
    settings.xAxis = PhysicalQuantityId.WindSpeed;
    settings.yAxis = PhysicalQuantityId.OperativeTemperature;

    const xAxisOptions = toolState.selectors.getChartControlsViewModel().axes?.x.options ?? [];
    expect(xAxisOptions).toHaveLength(5);
    expect(xAxisOptions).toContain(PhysicalQuantityId.DryBulbTemperature);
    expect(xAxisOptions).toContain(PhysicalQuantityId.MeanRadiantTemperature);

    toolState.actions.setDynamicXAxis(PhysicalQuantityId.DryBulbTemperature);

    expect(settings.xAxis).toBe(PhysicalQuantityId.DryBulbTemperature);
    expect(settings.yAxis).toBe(PhysicalQuantityId.OperativeTemperature);

    settings.xAxis = PhysicalQuantityId.OperativeTemperature;
    settings.yAxis = PhysicalQuantityId.WindSpeed;

    const yAxisOptions = toolState.selectors.getChartControlsViewModel().axes?.y.options ?? [];
    expect(yAxisOptions).toHaveLength(5);
    expect(yAxisOptions).toContain(PhysicalQuantityId.DryBulbTemperature);
    expect(yAxisOptions).toContain(PhysicalQuantityId.MeanRadiantTemperature);

    toolState.actions.setDynamicYAxis(PhysicalQuantityId.MeanRadiantTemperature);

    expect(settings.xAxis).toBe(PhysicalQuantityId.OperativeTemperature);
    expect(settings.yAxis).toBe(PhysicalQuantityId.MeanRadiantTemperature);
  });

  it.each([ModelId.PmvAshrae, ModelId.PmvIso])(
    "exposes coupled operative-temperature axes for %s",
    (modelId) => {
      const toolState = createAnalysisState();
      toolState.state.ui.selectedModel = modelId;
      toolState.state.ui.selectedChartInstanceByModel[modelId] = modelId === ModelId.PmvIso
        ? "pmv-iso-dynamic-field"
        : "pmv-ashrae-dynamic-field";
      const settings = getOutputSettings(toolState, modelId);
      settings.xAxis = PhysicalQuantityId.RelativeAirSpeed;
      settings.yAxis = PhysicalQuantityId.OperativeTemperature;

      const xAxisOptions = toolState.selectors.getChartControlsViewModel().axes?.x.options ?? [];
      expect(xAxisOptions).toHaveLength(7);
      expect(xAxisOptions).toContain(PhysicalQuantityId.DryBulbTemperature);
      expect(xAxisOptions).toContain(PhysicalQuantityId.MeanRadiantTemperature);

      toolState.actions.setDynamicXAxis(PhysicalQuantityId.DryBulbTemperature);

      expect(settings.xAxis).toBe(PhysicalQuantityId.DryBulbTemperature);
      expect(settings.yAxis).toBe(PhysicalQuantityId.OperativeTemperature);
    },
  );

  it("does not store the unsupported occupant-control option for ISO PMV", () => {
    const toolState = createAnalysisState();
    toolState.state.ui.selectedModel = ModelId.PmvIso;
    const initialOptions = {
      ...toolState.state.ui.modelOptionsByModel[ModelId.PmvIso],
    };

    expect(initialOptions).not.toHaveProperty(OptionKey.AirSpeedControlMode);

    toolState.actions.setModelOption(
      OptionKey.AirSpeedControlMode,
      AirSpeedControlMode.NoLocalControl,
    );

    expect(toolState.state.ui.modelOptionsByModel[ModelId.PmvIso])
      .toEqual(initialOptions);
    expect(toolState.state.ui.isLoading).toBe(false);
  });

  it("allows ISO clothing values above 1.5 clo and flags them when switching to ASHRAE", () => {
    const toolState = createAnalysisState();
    toolState.state.ui.selectedModel = ModelId.PmvIso;

    toolState.actions.updateInput(
      InputId.Input1,
      InputControlId.ClothingInsulation,
      "1.8",
    );
    toolState.actions.setSelectedModel(ModelId.PmvAshrae);

    expect(toolState.state.quantitiesByInput[InputId.Input1][PhysicalQuantityId.ClothingInsulation])
      .toBe(1.8);
    expect(toolState.selectors.getPendingModelSwitch()).toEqual(expect.objectContaining({
      targetModel: ModelId.PmvAshrae,
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
    const toolState = createAnalysisState();

    toolState.actions.setSelectedModel(ModelId.WindChill);

    expect(toolState.state.ui.selectedModel).toBe(ModelId.PmvAshrae);
    expect(toolState.selectors.getPendingModelSwitch()).toEqual(expect.objectContaining({
      targetModel: ModelId.WindChill,
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
    syncWorkspaceToModel(toolState, ModelId.WindChill);

    expect(toolState.state.ui.selectedModel).toBe(ModelId.WindChill);
    expect(toolState.selectors.getPendingModelSwitch()).toBeNull();
    expect(toolState.state.quantitiesByInput[InputId.Input1][PhysicalQuantityId.DryBulbTemperature])
      .toBe(0);
    expect(toolState.state.quantitiesByInput[InputId.Input1][PhysicalQuantityId.WindSpeed]).toBe(1);

    await waitForIdle(toolState);

    expect(toolState.state.ui.calculationCacheByModel[ModelId.WindChill].status)
      .toBe("ready");
    expect(toolState.selectors.getCurrentChartResult()?.traces[0].type).toBe("contour");
  });

  it("restores each model's own dynamic axes when switching models", async () => {
    const toolState = createAnalysisState();
    const pmvSettings = getOutputSettings(toolState);
    pmvSettings.xAxis = PhysicalQuantityId.MeanRadiantTemperature;
    pmvSettings.yAxis = PhysicalQuantityId.RelativeHumidity;

    toolState.actions.setSelectedModel(ModelId.AdaptiveAshrae);
    await waitForIdle(toolState);

    expect(toolState.state.ui.selectedModel).toBe(ModelId.AdaptiveAshrae);
    expect(getOutputSettings(toolState).xAxis)
      .toBe(PhysicalQuantityId.PrevailingMeanOutdoorTemperature);
    expect(getOutputSettings(toolState).yAxis).toBe(PhysicalQuantityId.OperativeTemperature);

    toolState.actions.setSelectedModel(ModelId.PmvAshrae);
    expect(getOutputSettings(toolState).xAxis).toBe(PhysicalQuantityId.MeanRadiantTemperature);
    expect(getOutputSettings(toolState).yAxis).toBe(PhysicalQuantityId.RelativeHumidity);
  });

  it("rejects invalid selected-model options at the calculation boundary", async () => {
    const toolState = createAnalysisState();
    delete toolState.state.ui.modelOptionsByModel[ModelId.PmvAshrae][
      OptionKey.HumidityInputMode
    ];

    toolState.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(toolState);

    expect(toolState.state.ui.errorMessage).toBe(
      `Invariant violation: invalid options state for ${ModelId.PmvAshrae}.`,
    );
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].status)
      .toBe("empty");
  });

  it("preserves ready model caches when switching between models", async () => {
    const toolState = createAnalysisState();

    toolState.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(toolState);

    const pmvChartSource = toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].chartSource;
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].status).toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ModelId.Utci].status).toBe("empty");

    toolState.actions.setSelectedModel(ModelId.Utci);
    await waitForIdle(toolState);

    expect(toolState.state.ui.calculationCacheByModel[ModelId.Utci].status).toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].status).toBe("ready");

    toolState.actions.setSelectedModel(ModelId.PmvAshrae);
    expect(toolState.state.ui.isLoading).toBe(false);
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].chartSource).toBe(pmvChartSource);
  });

  it("keeps ASHRAE and ISO PMV calculations in isolated registry caches", async () => {
    const toolState = createAnalysisState();

    toolState.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(toolState);
    const ashraeSource = toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae]
      .chartSource as PmvChartSource;

    toolState.actions.setSelectedModel(ModelId.PmvIso);
    await waitForIdle(toolState);
    const isoSource = toolState.state.ui.calculationCacheByModel[ModelId.PmvIso]
      .chartSource as PmvChartSource;

    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].status).toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvIso].status).toBe("ready");
    expect(ashraeSource).not.toBe(isoSource);
    expect(Object.keys(ashraeSource).sort()).toEqual([
      "comfortZonesByInput",
      "derivedSlotsByInput",
      "inputs",
    ]);
    expect(Object.keys(isoSource).sort()).toEqual([
      "comfortZonesByInput",
      "derivedSlotsByInput",
      "inputs",
    ]);
    expect(ashraeSource.inputs).not.toBe(isoSource.inputs);

    toolState.actions.setSelectedModel(ModelId.PmvAshrae);
    expect(toolState.state.ui.isLoading).toBe(false);
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].chartSource).toBe(ashraeSource);
  });

  it("stales every model cache when an option patch rewrites shared inputs", async () => {
    const toolState = createAnalysisState();

    toolState.actions.updateInput(InputId.Input1, InputControlId.Temperature, "28");
    toolState.actions.updateInput(InputId.Input1, InputControlId.RadiantTemperature, "20");
    toolState.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(toolState);

    toolState.actions.setSelectedModel(ModelId.PmvIso);
    await waitForIdle(toolState);
    toolState.actions.setSelectedModel(ModelId.PmvAshrae);

    const previousIsoChartSource = toolState.state.ui.calculationCacheByModel[ModelId.PmvIso].chartSource;

    toolState.actions.setModelOption(OptionKey.TemperatureMode, TemperatureMode.Operative);

    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].status).toBe("stale");
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvIso].status).toBe("stale");
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvIso].chartSource)
      .toBe(previousIsoChartSource);

    await waitForIdle(toolState);

    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].status).toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvIso].status).toBe("stale");

    toolState.actions.setSelectedModel(ModelId.PmvIso);
    await waitForIdle(toolState);

    const currentIsoChartSource = toolState.state.ui.calculationCacheByModel[ModelId.PmvIso]
      .chartSource as PmvChartSource;
    const currentInput = toolState.state.quantitiesByInput[InputId.Input1];

    expect(currentIsoChartSource).not.toBe(previousIsoChartSource);
    expect(currentIsoChartSource.inputs[InputId.Input1]?.tdb)
      .toBeCloseTo(currentInput[PhysicalQuantityId.DryBulbTemperature], 6);
    expect(currentIsoChartSource.inputs[InputId.Input1]?.tr)
      .toBeCloseTo(currentInput[PhysicalQuantityId.MeanRadiantTemperature], 6);
  });

  it("stales only the active model cache for a pure option patch", async () => {
    const toolState = createAnalysisState();

    toolState.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(toolState);
    toolState.actions.setSelectedModel(ModelId.PmvIso);
    await waitForIdle(toolState);
    toolState.actions.setSelectedModel(ModelId.PmvAshrae);

    const isoChartSource = toolState.state.ui.calculationCacheByModel[ModelId.PmvIso].chartSource;

    toolState.actions.setModelOption(
      OptionKey.AirSpeedControlMode,
      AirSpeedControlMode.NoLocalControl,
    );

    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].status).toBe("stale");
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvIso].status).toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvIso].chartSource)
      .toBe(isoChartSource);

    await waitForIdle(toolState);

    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].status).toBe("ready");
  });

  it("invalidates supporting model caches only when modifier state is effective", async () => {
    const toolState = createAnalysisState();
    toolState.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(toolState);
    toolState.actions.setSelectedModel(ModelId.PmvIso);
    await waitForIdle(toolState);
    toolState.actions.setSelectedModel(ModelId.PmvAshrae);

    const ashraeSource = toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae]
      .chartSource;
    const isoSource = toolState.state.ui.calculationCacheByModel[ModelId.PmvIso]
      .chartSource;

    expect(toolState.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      PhysicalQuantityId.ModifierMeasuredAirSpeed,
      "0.6",
    )).toBe(true);
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].status)
      .toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvIso].status)
      .toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].chartSource)
      .toBe(ashraeSource);
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvIso].chartSource)
      .toBe(isoSource);

    expect(toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      true,
    )).toBe(true);
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].status)
      .toBe("stale");
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvIso].status)
      .toBe("stale");
    expect(toolState.state.ui.calculationCacheByModel[ModelId.Utci].status)
      .toBe("empty");

    await waitForIdle(toolState);
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].status)
      .toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvIso].status)
      .toBe("stale");

    expect(toolState.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      PhysicalQuantityId.ModifierMeasuredAirSpeed,
      "0.7",
    )).toBe(true);
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].status)
      .toBe("stale");
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvIso].status)
      .toBe("stale");
    expect(toolState.state.ui.calculationCacheByModel[ModelId.Utci].status)
      .toBe("empty");

    toolState.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(toolState);
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].status)
      .toBe("ready");
  });

  it("feeds one effective PMV request to results and chart generation in operative mode", async () => {
    const toolState = createAnalysisState();
    toolState.actions.setModelOption(OptionKey.TemperatureMode, TemperatureMode.Operative);
    toolState.actions.updateInput(InputId.Input1, InputControlId.Temperature, "24");
    toolState.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      PhysicalQuantityId.ModifierMeasuredAirSpeed,
      "0.6",
    );
    toolState.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MorningClothingEstimate,
      PhysicalQuantityId.ModifierMorningOutdoorTemperature,
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

    const baseInputs = toolState.state.quantitiesByInput[InputId.Input1];
    const effectiveInputs = toolState.selectors.getEffectiveQuantitiesByInput()[InputId.Input1];
    const cache = toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae];
    const chartSource = cache.chartSource as PmvChartSource;
    const request = chartSource.inputs[InputId.Input1];
    const result = cache.resultsByInput[InputId.Input1] as PmvResponse;

    expect(baseInputs[PhysicalQuantityId.DryBulbTemperature]).toBe(24);
    expect(baseInputs[PhysicalQuantityId.MeanRadiantTemperature]).toBe(24);
    expect(effectiveInputs[PhysicalQuantityId.DryBulbTemperature]).toBe(24);
    expect(effectiveInputs[PhysicalQuantityId.MeanRadiantTemperature]).toBeCloseTo(39.1, 6);
    expect(request).toEqual(expect.objectContaining({
      tdb: effectiveInputs[PhysicalQuantityId.DryBulbTemperature],
      tr: effectiveInputs[PhysicalQuantityId.MeanRadiantTemperature],
      vr: effectiveInputs[PhysicalQuantityId.RelativeAirSpeed],
      clo: effectiveInputs[PhysicalQuantityId.ClothingInsulation],
    }));
    expect(result.vr).toBeCloseTo(request!.vr, 8);

    const expectedPmv = pmvAshraeAdapter.calculate(request!);
    expect(result.pmv).toBeCloseTo(expectedPmv.pmv, 8);
    expect(result.ppd).toBeCloseTo(expectedPmv.ppd, 8);
    expect(toolState.selectors.getResultSections()
      .find(({ title }) => title === "PMV")?.valuesByInput[InputId.Input1]?.text)
      .toBe(result.pmv.toFixed(2));
    expect(toolState.selectors.getChartControlsViewModel().profileBadge.feedback?.passes)
      .toBe(result.isCompliant);

    toolState.actions.setSelectedChartInstance("pmv-ashrae-dynamic-field");
    toolState.actions.setDynamicXAxis(PhysicalQuantityId.MeanRadiantTemperature);
    const marker = toolState.selectors.getCurrentChartResult()?.traces.find((trace) => (
      trace.name === "Input 1" && trace.mode === "markers"
    ));
    expect(Number(marker?.x?.[0])).toBeCloseTo(request!.tr, 6);
  });

  it("retains modifier configuration while unsupported models ignore and hide it", async () => {
    const toolState = createAnalysisState();
    toolState.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      PhysicalQuantityId.ModifierMeasuredAirSpeed,
      "0.6",
    );
    toolState.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      true,
    );
    await waitForIdle(toolState);
    const baseAirSpeed = toolState.state.quantitiesByInput[InputId.Input1]
      [PhysicalQuantityId.RelativeAirSpeed];

    toolState.actions.setSelectedModel(ModelId.Utci);
    await waitForIdle(toolState);

    expect(toolState.state.activeModifiersByInput[InputId.Input1]
      [ModifierId.MeasuredAirSpeed]).toBe(true);
    expect(toolState.selectors.getInputModifierControls()).toEqual([]);
    expect(toolState.selectors.getEffectiveQuantitiesByInput(ModelId.Utci)[InputId.Input1]
      [PhysicalQuantityId.RelativeAirSpeed]).toBe(baseAirSpeed);

    toolState.actions.setSelectedModel(ModelId.PmvAshrae);
    expect(toolState.selectors.getInputModifierControls()
      .find(({ id }) => id === ModifierId.MeasuredAirSpeed)?.activeByInput[InputId.Input1])
      .toBe(true);
  });

  it("stales all model caches after shared input updates and only refreshes the selected model", async () => {
    const toolState = createAnalysisState();

    toolState.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(toolState);
    toolState.actions.setSelectedModel(ModelId.Utci);
    await waitForIdle(toolState);
    toolState.actions.setSelectedModel(ModelId.PmvAshrae);

    const previousUtciChartSource = toolState.state.ui.calculationCacheByModel[ModelId.Utci].chartSource;

    toolState.actions.updateInput(toolState.state.ui.activeInputId, InputControlId.Temperature, "27");

    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].status).toBe("stale");
    expect(toolState.state.ui.calculationCacheByModel[ModelId.Utci].status).toBe("stale");

    toolState.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(toolState);

    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].status).toBe("ready");
    expect(toolState.state.ui.calculationCacheByModel[ModelId.Utci].status).toBe("stale");
    expect(toolState.state.ui.calculationCacheByModel[ModelId.Utci].chartSource).toBe(previousUtciChartSource);
  });

  it("rebuilds result and chart presentation on unit toggle without mutating cached SI results", async () => {
    const toolState = createAnalysisState();

    toolState.actions.setSelectedModel(ModelId.Utci);
    syncWorkspaceToModel(toolState, ModelId.Utci);
    await waitForIdle(toolState);

    const rawUtci = (
      toolState.state.ui.calculationCacheByModel[ModelId.Utci]
        .resultsByInput.input1 as UtciResponse | null
    )?.utci;
    const chartSource = toolState.state.ui.calculationCacheByModel[ModelId.Utci].chartSource;
    const siResultText = toolState.selectors.getResultSections()[0].valuesByInput.input1?.text;
    const siChartTitle = String(toolState.selectors.getCurrentChartResult()?.layout.xaxis.title ?? "");

    toolState.actions.toggleUnitSystem();

    const ipResultText = toolState.selectors.getResultSections()[0].valuesByInput.input1?.text;
    const ipChartTitle = String(toolState.selectors.getCurrentChartResult()?.layout.xaxis.title ?? "");

    expect(rawUtci).toBe((
      toolState.state.ui.calculationCacheByModel[ModelId.Utci]
        .resultsByInput.input1 as UtciResponse | null
    )?.utci);
    expect(chartSource).toBe(toolState.state.ui.calculationCacheByModel[ModelId.Utci].chartSource);
    expect(siResultText).toContain("°C");
    expect(ipResultText).toContain("°F");
    expect(siChartTitle).toContain("°C");
    expect(ipChartTitle).toContain("°F");
    expect(toolState.state.ui.unitSystem).toBe(UnitSystem.IP);
  });

  it("skips recalculation when scheduleCalculation is called on a ready cache without force", async () => {
    const toolState = createAnalysisState();
    toolState.actions.scheduleCalculation({ immediate: true, force: true });
    await waitForIdle(toolState);
    const calculateSpy = vi.spyOn(pmvAshraeModelConfig, "calculate");
    try {
      const readyCache = toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae];
      expect(readyCache.status).toBe("ready");
      toolState.actions.scheduleCalculation({ immediate: true, force: false });
      await waitForIdle(toolState);
      expect(calculateSpy).not.toHaveBeenCalled();
      expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae]).toBe(readyCache);
    } finally {
      calculateSpy.mockRestore();
    }
  });

  it("invalidates and recalculates when a primary quantity changes", async () => {
    const toolState = createAnalysisState();
    toolState.actions.scheduleCalculation({ immediate: true, force: true });
    await waitForIdle(toolState);
    const calculateSpy = vi.spyOn(pmvAshraeModelConfig, "calculate");
    try {
      calculateSpy.mockClear();
      toolState.actions.updateInput(
        InputId.Input1,
        InputControlId.Temperature,
        "32",
      );
      expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].status)
        .toBe("stale");
      await new Promise((resolve) => setTimeout(resolve, 250));
      await waitForIdle(toolState);
      expect(toolState.state.quantitiesByInput[InputId.Input1]
        [PhysicalQuantityId.DryBulbTemperature]).toBe(32);
      expect(calculateSpy).toHaveBeenCalled();
      expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae].status)
        .toBe("ready");
    } finally {
      calculateSpy.mockRestore();
    }
  });

  it("rebuilds chart markers after input changes instead of reusing memoized chart builds", async () => {
    const toolState = createAnalysisState();
    toolState.actions.setSelectedChartInstance("pmv-ashrae-dynamic-field");
    toolState.actions.setDynamicXAxis(PhysicalQuantityId.DryBulbTemperature);
    toolState.actions.scheduleCalculation({ immediate: true, force: true });
    await waitForIdle(toolState);

    const chartBefore = toolState.selectors.getCurrentChartResult();
    const markerBefore = chartBefore?.traces.find((trace) => trace.name === "Input 1");

    toolState.actions.updateInput(InputId.Input1, InputControlId.Temperature, "32");
    await new Promise((resolve) => setTimeout(resolve, 250));
    await waitForIdle(toolState);

    const chartAfter = toolState.selectors.getCurrentChartResult();
    const markerAfter = chartAfter?.traces.find((trace) => trace.name === "Input 1");

    expect(toolState.state.quantitiesByInput[InputId.Input1]
      [PhysicalQuantityId.DryBulbTemperature]).toBe(32);
    expect(chartAfter).not.toBe(chartBefore);
    expect(markerAfter?.x?.[0]).not.toBe(markerBefore?.x?.[0]);
    expect(markerAfter?.x?.[0]).toBeCloseTo(32, 6);
  });

});
