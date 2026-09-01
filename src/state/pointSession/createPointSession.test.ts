import { describe, expect, it, vi } from "vitest";

import { ModelId } from "../../catalog/modelIds";
import { InputControlId } from "../../catalog/inputControls";
import {
  AirSpeedControlMode,
  OptionKey,
  TemperatureMode,
} from "../../catalog/inputModes";
import { InputId } from "../../catalog/inputSlots";
import { UnitSystem } from "../../catalog/units";
import { SurfaceId, supportsStandardSurface } from "../../catalog/surfaces";
import { FieldChartProfileKind } from "../../catalog/fieldChartProfile";
import { resolveChartInstanceCapabilities } from "./chartInstancePresentation";
import { ModifierId } from "../../catalog/inputModifiers";

import {
  pmvAshraeAdapter,
  pmvAshraeModelConfig,
} from "../../declarations/pmv/ashrae";
import type { PmvChartSource, PmvResponse } from "../../declarations/pmv/calculation";
import type { UtciResponse } from "../../declarations/utci/utci";
import { type PhsResponse } from "../../catalog/phs";
import { createPointSession } from "./createPointSession.svelte";
import { comfortModelConfigs, comfortModelOrder } from "../modelRegistry";
import { PhysicalQuantityId } from "../../catalog/quantities";
import { formatDisplayValue } from "../../engines/units";
import { chartFigure } from "../../testSupport/modelChartTestHelpers";
import { seedSelectedModel, seedPrimaryQuantity, seedCompareVisibleInputs } from "../../testSupport/seedPointSession";

function currentChart(session: ReturnType<typeof createPointSession>) {
  return chartFigure(session.chartBuild.payload);
}

function syncWorkspaceToModel(
  session: ReturnType<typeof createPointSession>,
  modelId: ModelId,
) {
  const capabilities = comfortModelConfigs[modelId].surfaceCapabilities;
  session.actions.setActiveSurface(
    supportsStandardSurface(capabilities)
      ? SurfaceId.Standard
      : SurfaceId.Explore,
  );
}

async function waitForIdle(session: ReturnType<typeof createPointSession>) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    if (!session.output.isLoading) {
      return;
    }
  }

  throw new Error("Controller did not finish calculating.");
}

function getOutputSettings(
  session: ReturnType<typeof createPointSession>,
  modelId = session.setting.selectedModel,
) {
  return session.setting.outputSettingsByModel[modelId];
}

function getProfileBadgeControl(session: ReturnType<typeof createPointSession>) {
  return session.chartControls.profileBadge;
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
  [PhysicalQuantityId.SolarAltitude, "45"],
  [PhysicalQuantityId.SolarHorizontalAngle, "90"],
  [PhysicalQuantityId.DirectSolarRadiation, "800"],
  [PhysicalQuantityId.SolarTransmittance, "0.5"],
  [PhysicalQuantityId.SkyVaultViewFraction, "0.5"],
  [PhysicalQuantityId.BodyExposureFraction, "0.5"],
] as const;

function populateSolarModifier(
  session: ReturnType<typeof createPointSession>,
  inputId: InputId,
) {
  for (const [fieldKey, value] of solarModifierFixture) {
    if (!session.actions.updateModifierInput(
      inputId,
      ModifierId.SolarGain,
      fieldKey,
      value,
    )) {
      throw new Error(`Failed to populate solar modifier field ${fieldKey}.`);
    }
  }
}

describe("createPointSession", () => {
  it("initializes model chart defaults and independent PMV variants", () => {
    const session = createPointSession();

    expect(session.setting.selectedModel).toBe(ModelId.PmvAshrae);
    expect(session.setting.selectedChartInstanceByModel).toEqual({
      [ModelId.PmvAshrae]: "psychrometric",
      [ModelId.PmvIso]: "psychrometric",
      [ModelId.Utci]: "utci",
      [ModelId.AdaptiveAshrae]: "adaptive",
      [ModelId.AdaptiveEn]: "adaptive",
      [ModelId.HeatIndex]: "dynamic",
      [ModelId.Humidex]: "dynamic",
      [ModelId.WindChill]: "dynamic",
      [ModelId.Phs2023]: "body-temperature",
    });
    expect(session.setting.modelOptionsByModel[ModelId.PmvAshrae])
      .not.toBe(session.setting.modelOptionsByModel[ModelId.PmvIso]);
    expect(session.calculationCacheByModel[ModelId.PmvAshrae])
      .not.toBe(session.calculationCacheByModel[ModelId.PmvIso]);
    expect(session.setting.activeSurface)
      .toBe(SurfaceId.Standard);
    expect(session.setting.activeSurface)
      .toBe(SurfaceId.Standard);
    expect(getOutputSettings(session).exploreOutput).toBe(PhysicalQuantityId.PredictedMeanVote);
    expect(getOutputSettings(session).exploreBands)
      .not.toBe(pmvAshraeModelConfig.exploreOutputs[0].defaultBands);
    expect(getOutputSettings(session, ModelId.PmvAshrae).exploreBands)
      .not.toBe(getOutputSettings(session, ModelId.PmvIso).exploreBands);
  });

  it("keeps base air speed separate from reversible per-input modifier state", async () => {
    const session = createPointSession();
    const baseInput1 = session.input.quantitiesByInput[InputId.Input1][PhysicalQuantityId.RelativeAirSpeed];
    const baseInput2 = session.input.quantitiesByInput[InputId.Input2][PhysicalQuantityId.RelativeAirSpeed];

    expect(session.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      true,
    )).toBe(false);
    expect(session.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      PhysicalQuantityId.MeasuredAirSpeed,
      "0.6",
    )).toBe(true);
    expect(session.actions.updateModifierInput(
      InputId.Input2,
      ModifierId.MeasuredAirSpeed,
      PhysicalQuantityId.MeasuredAirSpeed,
      "0.8",
    )).toBe(true);
    expect(session.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      true,
    )).toBe(true);
    expect(session.actions.setModifierEnabled(
      InputId.Input2,
      ModifierId.MeasuredAirSpeed,
      true,
    )).toBe(true);

    expect(session.input.quantitiesByInput[InputId.Input1][PhysicalQuantityId.RelativeAirSpeed])
      .toBe(baseInput1);
    expect(session.input.quantitiesByInput[InputId.Input2][PhysicalQuantityId.RelativeAirSpeed])
      .toBe(baseInput2);
    expect(session.effectiveQuantities()[InputId.Input1]
      [PhysicalQuantityId.RelativeAirSpeed]).toBeCloseTo(0.6, 6);
    expect(session.effectiveQuantities()[InputId.Input2]
      [PhysicalQuantityId.RelativeAirSpeed]).toBeCloseTo(0.83, 6);

    session.actions.updateInput(InputId.Input1, InputControlId.AirSpeed, "0.3");
    session.actions.updateInput(InputId.Input1, InputControlId.MetabolicRate, "1.8");

    expect(session.input.quantitiesByInput[InputId.Input1][PhysicalQuantityId.RelativeAirSpeed])
      .toBe(0.3);
    expect(session.effectiveQuantities()[InputId.Input1]
      [PhysicalQuantityId.RelativeAirSpeed]).toBeCloseTo(0.84, 6);

    expect(session.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      false,
    )).toBe(true);
    expect(session.effectiveQuantities()[InputId.Input1]
      [PhysicalQuantityId.RelativeAirSpeed]).toBe(0.3);
    expect(session.effectiveQuantities()[InputId.Input2]
      [PhysicalQuantityId.RelativeAirSpeed]).toBeCloseTo(0.83, 6);
    expect(session.input.auxiliaryQuantitiesByInput[InputId.Input1]
      [PhysicalQuantityId.MeasuredAirSpeed]).toBe(0.6);

    expect(session.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      true,
    )).toBe(true);
    expect(session.effectiveQuantities()[InputId.Input1]
      [PhysicalQuantityId.RelativeAirSpeed]).toBeCloseTo(0.84, 6);

    await waitForIdle(session);
  });

  it("projects a canonical-SI draft without mutating state and commits it atomically", async () => {
    const calculateSpy = vi.spyOn(pmvAshraeModelConfig, "calculate");
    try {
      const session = createPointSession();
      session.actions.setCompareEnabled(true);
      session.input.auxiliaryQuantitiesByInput[InputId.Input3]
        [PhysicalQuantityId.MeasuredAirSpeed] = 0.9;
      session.input.activeModifiersByInput[InputId.Input3]
        [ModifierId.MeasuredAirSpeed] = true;
      seedPrimaryQuantity(
        session,
        InputId.Input2,
        PhysicalQuantityId.MetabolicRate,
        1.8,
      );
      const baseInput1Speed = session.input.quantitiesByInput[InputId.Input1]
        [PhysicalQuantityId.RelativeAirSpeed];
      const baseInput2Clothing = session.input.quantitiesByInput[InputId.Input2]
        [PhysicalQuantityId.ClothingInsulation];

      const draft = session.inputModifierDraft;
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
      measuredInput1.inputs[PhysicalQuantityId.MeasuredAirSpeed] = 0.6;
      measuredInput1.enabled = true;
      morningInput2.inputs[PhysicalQuantityId.MorningOutdoorTemperature] = 10;
      morningInput2.enabled = true;
      dynamicInput2.enabled = true;

      const projectedControls = session.inputModifierControls(draft);
      expect(projectedControls.find(({ id }) => id === ModifierId.MeasuredAirSpeed)
        ?.activeByInput[InputId.Input1]).toBe(true);
      expect(session.input.auxiliaryQuantitiesByInput[InputId.Input1]
        [PhysicalQuantityId.MeasuredAirSpeed]).toBeUndefined();
      expect(session.input.activeModifiersByInput[InputId.Input2]
        [ModifierId.DynamicClothing]).toBe(false);

      expect(session.actions.applyInputModifierDraft(draft)).toBe(true);
      expect(session.input.quantitiesByInput[InputId.Input1]
        [PhysicalQuantityId.RelativeAirSpeed]).toBe(baseInput1Speed);
      expect(session.input.quantitiesByInput[InputId.Input2]
        [PhysicalQuantityId.ClothingInsulation]).toBe(baseInput2Clothing);
      expect(session.effectiveQuantities()[InputId.Input1]
        [PhysicalQuantityId.RelativeAirSpeed]).toBeCloseTo(0.6, 6);
      expect(session.effectiveQuantities()[InputId.Input2]
        [PhysicalQuantityId.ClothingInsulation]).toBeCloseTo(0.485, 3);
      expect(session.input.auxiliaryQuantitiesByInput[InputId.Input3]
        [PhysicalQuantityId.MeasuredAirSpeed]).toBe(0.9);
      expect(session.input.activeModifiersByInput[InputId.Input3]
        [ModifierId.MeasuredAirSpeed]).toBe(true);

      await waitForIdle(session);
      expect(calculateSpy).toHaveBeenCalledTimes(1);
    } finally {
      calculateSpy.mockRestore();
    }
  });

  it("rejects an invalid modifier draft without partially writing valid entries", () => {
    const session = createPointSession();
    const draft = session.inputModifierDraft;
    const measured = draft.find(({ modifierId }) => (
      modifierId === ModifierId.MeasuredAirSpeed
    ));
    if (!measured) throw new Error("Expected a measured-air-speed draft entry.");
    measured.inputs[PhysicalQuantityId.MeasuredAirSpeed] = 0.6;
    measured.enabled = true;

    const incompleteDraft = draft.slice(0, -1);
    const stateBeforeApply = JSON.stringify({
      active: session.input.activeModifiersByInput,
      inputs: session.input.auxiliaryQuantitiesByInput,
    });
    expect(session.actions.applyInputModifierDraft(incompleteDraft)).toBe(false);
    expect(JSON.stringify({
      active: session.input.activeModifiersByInput,
      inputs: session.input.auxiliaryQuantitiesByInput,
    })).toBe(stateBeforeApply);

    const enabledIncompleteDraft = session.inputModifierDraft;
    const incompleteMeasured = enabledIncompleteDraft.find(({ modifierId }) => (
      modifierId === ModifierId.MeasuredAirSpeed
    ));
    if (!incompleteMeasured) throw new Error("Expected a measured-air-speed draft entry.");
    incompleteMeasured.enabled = true;
    expect(session.actions.applyInputModifierDraft(enabledIncompleteDraft)).toBe(false);
    expect(JSON.stringify({
      active: session.input.activeModifiersByInput,
      inputs: session.input.auxiliaryQuantitiesByInput,
    })).toBe(stateBeforeApply);
  });

  it("stores disabled modifier configuration without invalidating or recalculating", async () => {
    const session = createPointSession();
    session.actions.scheduleCalculation({ immediate: true, force: true });
    await waitForIdle(session);
    const calculateSpy = vi.spyOn(pmvAshraeModelConfig, "calculate");
    try {
      const readyCache = session.calculationCacheByModel[ModelId.PmvAshrae];
      expect(readyCache.status).toBe("ready");
      const draft = session.inputModifierDraft;
      const measured = draft.find(({ modifierId }) => (
        modifierId === ModifierId.MeasuredAirSpeed
      ));
      if (!measured) throw new Error("Expected a measured-air-speed draft entry.");
      measured.inputs[PhysicalQuantityId.MeasuredAirSpeed] = 0.6;

      expect(session.actions.applyInputModifierDraft(draft)).toBe(true);
      await Promise.resolve();

      expect(session.input.auxiliaryQuantitiesByInput[InputId.Input1]
        [PhysicalQuantityId.MeasuredAirSpeed]).toBe(0.6);
      expect(session.input.activeModifiersByInput[InputId.Input1]
        [ModifierId.MeasuredAirSpeed]).toBe(false);
      expect(session.calculationCacheByModel[ModelId.PmvAshrae])
        .toBe(readyCache);
      expect(session.calculationCacheByModel[ModelId.PmvAshrae].status)
        .toBe("ready");
      expect(calculateSpy).not.toHaveBeenCalled();
    } finally {
      calculateSpy.mockRestore();
    }
  });

  it("applies Morning then Dynamic Clothing per input and recomputes the remaining chain", async () => {
    const session = createPointSession();
    seedCompareVisibleInputs(session, [InputId.Input1, InputId.Input2]);
    session.actions.updateInput(
      InputId.Input1,
      InputControlId.MetabolicRate,
      "1.8",
    );
    session.actions.updateInput(
      InputId.Input2,
      InputControlId.MetabolicRate,
      "1.8",
    );
    session.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MorningClothingEstimate,
      PhysicalQuantityId.MorningOutdoorTemperature,
      "10",
    );

    const baseInput1Clothing = session.input.quantitiesByInput[InputId.Input1]
      [PhysicalQuantityId.ClothingInsulation];
    const baseInput2Clothing = session.input.quantitiesByInput[InputId.Input2]
      [PhysicalQuantityId.ClothingInsulation];

    expect(session.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MorningClothingEstimate,
      true,
    )).toBe(true);
    const morningClothing = session.effectiveQuantities()
      [InputId.Input1][PhysicalQuantityId.ClothingInsulation];
    expect(morningClothing).toBeCloseTo(0.59, 2);

    expect(session.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.DynamicClothing,
      true,
    )).toBe(true);
    expect(session.actions.setModifierEnabled(
      InputId.Input2,
      ModifierId.DynamicClothing,
      true,
    )).toBe(true);
    const chainedClothing = session.effectiveQuantities()
      [InputId.Input1][PhysicalQuantityId.ClothingInsulation];
    const input2DynamicClothing = session.effectiveQuantities()
      [InputId.Input2][PhysicalQuantityId.ClothingInsulation];
    expect(chainedClothing).toBeCloseTo(0.485, 3);
    expect(input2DynamicClothing).not.toBe(baseInput2Clothing);
    expect(session.input.quantitiesByInput[InputId.Input1]
      [PhysicalQuantityId.ClothingInsulation]).toBe(baseInput1Clothing);
    expect(session.input.quantitiesByInput[InputId.Input2]
      [PhysicalQuantityId.ClothingInsulation]).toBe(baseInput2Clothing);

    expect(session.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MorningClothingEstimate,
      false,
    )).toBe(true);
    const baseDynamicClothing = session.effectiveQuantities()
      [InputId.Input1][PhysicalQuantityId.ClothingInsulation];
    expect(baseDynamicClothing).not.toBe(chainedClothing);
    expect(baseDynamicClothing).not.toBe(baseInput1Clothing);

    expect(session.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MorningClothingEstimate,
      true,
    )).toBe(true);
    expect(session.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.DynamicClothing,
      false,
    )).toBe(true);
    expect(session.effectiveQuantities()[InputId.Input1]
      [PhysicalQuantityId.ClothingInsulation]).toBe(morningClothing);
    expect(session.effectiveQuantities()[InputId.Input2]
      [PhysicalQuantityId.ClothingInsulation]).toBe(input2DynamicClothing);

    expect(session.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MorningClothingEstimate,
      false,
    )).toBe(true);
    expect(session.effectiveQuantities()[InputId.Input1]
      [PhysicalQuantityId.ClothingInsulation]).toBe(baseInput1Clothing);

    await waitForIdle(session);
  });

  it("exposes Dynamic Clothing only for the two PMV declarations", () => {
    const session = createPointSession();

    for (const modelId of comfortModelOrder) {
      seedSelectedModel(session, modelId);
      const modifierIds = session.inputModifierControls()
        .map(({ id }) => id);
      expect(modifierIds.includes(ModifierId.DynamicClothing)).toBe(
        modelId === ModelId.PmvAshrae || modelId === ModelId.PmvIso,
      );
    }
  });

  it("disables an active incomplete modifier without clearing its other inputs", async () => {
    const session = createPointSession();
    const baseRadiantTemperature = session.input.quantitiesByInput[InputId.Input1]
      [PhysicalQuantityId.MeanRadiantTemperature];
    populateSolarModifier(session, InputId.Input1);

    expect(session.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.SolarGain,
      true,
    )).toBe(true);
    expect(session.effectiveQuantities()[InputId.Input1]
      [PhysicalQuantityId.MeanRadiantTemperature]).toBeCloseTo(baseRadiantTemperature + 15.1, 6);

    expect(session.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.SolarGain,
      PhysicalQuantityId.SolarTransmittance,
      "",
    )).toBe(true);

    expect(session.input.activeModifiersByInput[InputId.Input1][ModifierId.SolarGain])
      .toBe(false);
    expect(session.input.auxiliaryQuantitiesByInput[InputId.Input1]
      [PhysicalQuantityId.SolarTransmittance]).toBeUndefined();
    expect(session.input.auxiliaryQuantitiesByInput[InputId.Input1]
      [PhysicalQuantityId.DirectSolarRadiation]).toBe(800);
    expect(session.effectiveQuantities()[InputId.Input1]
      [PhysicalQuantityId.MeanRadiantTemperature]).toBe(baseRadiantTemperature);

    await waitForIdle(session);
  });

  it("keeps stored and effective SI values invariant when display units change", async () => {
    const session = createPointSession();
    session.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      PhysicalQuantityId.MeasuredAirSpeed,
      "0.6",
    );
    session.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MorningClothingEstimate,
      PhysicalQuantityId.MorningOutdoorTemperature,
      "10",
    );
    populateSolarModifier(session, InputId.Input1);
    session.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      true,
    );
    session.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MorningClothingEstimate,
      true,
    );
    session.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.SolarGain,
      true,
    );
    await waitForIdle(session);

    const storedSi = JSON.stringify(session.input.auxiliaryQuantitiesByInput);
    const effectiveSi = session.effectiveQuantities();

    session.actions.toggleUnitSystem();

    expect(session.setting.unitSystem).toBe(UnitSystem.IP);
    expect(JSON.stringify(session.input.auxiliaryQuantitiesByInput)).toBe(storedSi);
    expect(session.effectiveQuantities()).toEqual(effectiveSi);

    const controls = session.inputModifierControls();
    const measured = controls.find(({ id }) => id === ModifierId.MeasuredAirSpeed);
    const clothing = controls.find(({ id }) => id === ModifierId.MorningClothingEstimate);
    const solar = controls.find(({ id }) => id === ModifierId.SolarGain);
    expect(measured?.extraInputs[0].displayValuesByInput[InputId.Input1]).toBe("1.97");
    expect(clothing?.extraInputs[0].displayValuesByInput[InputId.Input1]).toBe("50");
    expect(solar?.extraInputs.find(({ key }) => (
      key === PhysicalQuantityId.DirectSolarRadiation
    ))?.displayValuesByInput[InputId.Input1]).toBe("253.6");

    session.actions.toggleUnitSystem();
    expect(JSON.stringify(session.input.auxiliaryQuantitiesByInput)).toBe(storedSi);
    expect(session.effectiveQuantities()).toEqual(effectiveSi);
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
      const session = createPointSession();
      seedSelectedModel(session, modelId);
      session.actions.setActiveSurface(
        expectedMode === FieldChartProfileKind.Explore
          ? SurfaceId.Explore
          : SurfaceId.Standard,
      );

      const mode = getProfileBadgeControl(session);
      expect(mode.profileKind).toBe(expectedMode);
    },
  );

  it("provides one active mode config for every registered selectable chart", async () => {
    const session = createPointSession();
    session.actions.setCompareEnabled(true);
    await waitForIdle(session);

    for (const modelId of comfortModelOrder) {
      seedSelectedModel(session, modelId);
      const modelConfig = comfortModelConfigs[modelId];

      for (const chart of modelConfig.chartInstances.entries) {
        const registration = modelConfig.chartEngineRegistrations.find(
          ({ instanceId }) => instanceId === chart.instanceId,
        );
        session.actions.setActiveSurface(
          registration?.supportedExploreOutputs?.length
            ? SurfaceId.Explore
            : supportsStandardSurface(modelConfig.surfaceCapabilities)
              ? SurfaceId.Standard
              : SurfaceId.Explore,
        );
        session.actions.setSelectedChartInstance(chart.instanceId);
        const controls = session.chartControls;
        const supportsAxisSelection = resolveChartInstanceCapabilities(chart).allowsAxisSelection;
        const onExploreWorkspace = session.setting.activeSurface === SurfaceId.Explore;

        expect(controls.profileBadge?.profileKind).toBe(
          session.setting.activeSurface === SurfaceId.Explore
            ? FieldChartProfileKind.Explore
            : FieldChartProfileKind.Compliance,
        );
        expect(controls.baseline?.selectedInputId).toBe(InputId.Input1);
        expect(controls.axes === null).toBe(!supportsAxisSelection);
        expect(controls.explore === null).toBe(!onExploreWorkspace);
      }
    }
  });

  it("constrains PHS exposure history to its declared Explore output", () => {
    const session = createPointSession();
    seedSelectedModel(session, ModelId.Phs2023);
    session.actions.setActiveSurface(SurfaceId.Explore);

    expect(session.chartInstanceId)
      .toBe("body-temperature");
    expect(getOutputSettings(session).exploreOutput)
      .toBe(PhysicalQuantityId.RectalTemperature);
    expect(session.chartControls.explore?.outputs.map(
      ({ key }) => key,
    )).toEqual([PhysicalQuantityId.RectalTemperature]);

    session.actions.setSelectedChartInstance("dynamic");
    session.actions.setExploreOutput(PhysicalQuantityId.SweatLoss);
    expect(getOutputSettings(session).exploreOutput)
      .toBe(PhysicalQuantityId.SweatLoss);

    session.actions.setSelectedChartInstance("body-temperature");
    expect(getOutputSettings(session).exploreOutput)
      .toBe(PhysicalQuantityId.RectalTemperature);
    session.actions.setExploreOutput(PhysicalQuantityId.SweatLoss);
    expect(getOutputSettings(session).exploreOutput)
      .toBe(PhysicalQuantityId.RectalTemperature);
  });

  it("recalculates PHS when a model quantity changes without affecting other models", async () => {
    const session = createPointSession();
    session.actions.setSelectedModel(ModelId.Humidex);
    syncWorkspaceToModel(session, ModelId.Humidex);
    session.actions.scheduleCalculation({ immediate: true, force: true });
    await waitForIdle(session);
    const humidexBefore = session.calculationCacheByModel[ModelId.Humidex]
      .resultsByInput[InputId.Input1];

    session.actions.setSelectedModel(ModelId.Phs2023);
    session.actions.setActiveSurface(SurfaceId.Standard);
    session.actions.scheduleCalculation({ immediate: true, force: true });
    await waitForIdle(session);

    const phsBefore = (session.calculationCacheByModel[ModelId.Phs2023]
      .resultsByInput[InputId.Input1] as PhsResponse | null)?.waterLossLimitG;

    expect(
      session.actions.updateModelQuantity(
        ModelId.Phs2023,
        PhysicalQuantityId.BodyWeight,
        90,
      ),
    ).toBe(true);
    session.actions.scheduleCalculation({ immediate: true, force: true });
    await waitForIdle(session);

    const phsAfter = (session.calculationCacheByModel[ModelId.Phs2023]
      .resultsByInput[InputId.Input1] as PhsResponse | null)?.waterLossLimitG;
    expect(phsAfter).toBeDefined();
    expect(phsAfter).not.toBe(phsBefore);
    expect(session.input.modelInputsByModel[ModelId.Phs2023]
      [PhysicalQuantityId.BodyWeight]).toBe(90);

    session.actions.setSelectedModel(ModelId.Humidex);
    syncWorkspaceToModel(session, ModelId.Humidex);
    session.actions.scheduleCalculation({ immediate: true, force: true });
    await waitForIdle(session);
    expect(session.calculationCacheByModel[ModelId.Humidex]
      .resultsByInput[InputId.Input1]).toEqual(humidexBefore);
  });

  it("keeps ASHRAE and ISO mode settings independent from chart selection", () => {
    const session = createPointSession();
    const ashraeChart = session.setting.selectedChartInstanceByModel[ModelId.PmvAshrae];

    session.actions.setActiveSurface(SurfaceId.Explore);
    session.actions.setDynamicXAxis(PhysicalQuantityId.MeanRadiantTemperature);
    expect(session.setting.selectedChartInstanceByModel[ModelId.PmvAshrae])
      .toBe(ashraeChart);

    seedSelectedModel(session, ModelId.PmvIso);
    session.actions.setActiveSurface(SurfaceId.Standard);
    expect(getProfileBadgeControl(session).profileKind).toBe(FieldChartProfileKind.Compliance);
    expect(getOutputSettings(session).xAxis).toBe(PhysicalQuantityId.DryBulbTemperature);
    session.actions.setActiveSurface(SurfaceId.Explore);
    session.actions.setExploreOutput(PhysicalQuantityId.PredictedPercentageOfDissatisfied);

    seedSelectedModel(session, ModelId.PmvAshrae);
    expect(getProfileBadgeControl(session).profileKind).toBe(FieldChartProfileKind.Explore);
    expect(getOutputSettings(session).xAxis).toBe(PhysicalQuantityId.MeanRadiantTemperature);
    expect(getOutputSettings(session).exploreOutput).toBe(PhysicalQuantityId.PredictedMeanVote);
  });

  it("falls back to Input 1 without erasing a temporarily hidden baseline", async () => {
    const session = createPointSession();
    session.actions.setCompareEnabled(true);
    await waitForIdle(session);
    session.actions.setSelectedChartInstance("dynamic");
    session.actions.setChartBaselineInputId(InputId.Input2);

    expect(session.chartControls.baseline?.selectedInputId)
      .toBe(InputId.Input2);
    session.actions.toggleCompareInputVisibility(InputId.Input2);
    await waitForIdle(session);

    expect(getOutputSettings(session).baselineInputId).toBe(InputId.Input2);
    expect(session.chartControls.baseline?.selectedInputId)
      .toBe(InputId.Input1);

    session.actions.toggleCompareInputVisibility(InputId.Input2);
    await waitForIdle(session);
    expect(session.chartControls.baseline?.selectedInputId)
      .toBe(InputId.Input2);
  });

  it("builds mode captions and baseline-specific Compliance feedback", async () => {
    const session = createPointSession();
    session.actions.setCompareEnabled(true);
    await waitForIdle(session);
    session.actions.setSelectedChartInstance("dynamic");
    session.actions.setChartBaselineInputId(InputId.Input2);

    const compliance = getProfileBadgeControl(session);
    expect(compliance.caption).toContain("ASHRAE 55");
    expect(compliance.feedback).toEqual(expect.objectContaining({
      inputLabel: "Input 2",
      text: expect.any(String),
      passes: expect.any(Boolean),
    }));

    session.actions.setActiveSurface(SurfaceId.Explore);
    const explore = getProfileBadgeControl(session);
    expect(explore.caption).toBe(
      "Showing PMV over the selected axes with editable thresholds.",
    );
    expect(explore.feedback).toBeNull();
  });

  it("keeps mode and baseline controls on fixed views and exposes declared axes", () => {
    const session = createPointSession();
    session.actions.setCompareEnabled(true);

    expect(getProfileBadgeControl(session).profileKind).toBe(FieldChartProfileKind.Compliance);

    session.actions.setSelectedChartInstance("psychrometric");
    const fixed = session.chartControls;
    expect(fixed.profileBadge?.profileKind).toBe(FieldChartProfileKind.Compliance);
    expect(fixed.baseline?.selectedInputId).toBe(InputId.Input1);
    expect(fixed.axes).toBeNull();
    expect(fixed.explore).toBeNull();

    session.actions.setActiveSurface(SurfaceId.Explore);
    const fixedExplore = session.chartControls;
    expect(fixedExplore.profileBadge?.caption).toContain("fixed axes");
    expect(fixedExplore.explore?.profile.kind).toBe(FieldChartProfileKind.Explore);

    session.actions.setSelectedChartInstance("dynamic");
    expect(getProfileBadgeControl(session).profileKind).toBe(FieldChartProfileKind.Explore);
    expect(session.chartControls.axes).not.toBeUndefined();

    seedSelectedModel(session, ModelId.AdaptiveAshrae);
    syncWorkspaceToModel(session, ModelId.AdaptiveAshrae);
    const adaptive = getProfileBadgeControl(session);
    expect(adaptive.profileKind).toBe(FieldChartProfileKind.Compliance);
    expect(adaptive.caption).toContain("80: t_cmf");
    session.actions.setSelectedChartInstance("adaptive");
    const adaptiveControls = session.chartControls;
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

    seedSelectedModel(session, ModelId.Utci);
    syncWorkspaceToModel(session, ModelId.Utci);
    const utci = getProfileBadgeControl(session);
    expect(utci.profileKind).toBe(FieldChartProfileKind.Explore);
    expect(utci.caption).toContain("Showing UTCI");
    session.actions.setSelectedChartInstance("utci");
    const utciFixed = session.chartControls;
    expect(utciFixed.profileBadge?.profileKind).toBe(FieldChartProfileKind.Explore);
    expect(utciFixed.baseline?.selectedInputId).toBe(InputId.Input1);
    expect(utciFixed.axes).toBeNull();
    expect(utciFixed.explore?.profile.zOutput).toBe(PhysicalQuantityId.UniversalThermalClimateIndex);
  });

  it("rebuilds chart presentation without invalidating or replacing ready calculations", async () => {
    const session = createPointSession();
    session.actions.setCompareEnabled(true);
    await waitForIdle(session);

    const cache = session.calculationCacheByModel[ModelId.PmvAshrae];
    const chartSource = cache.chartSource;
    const resultsByInput = cache.resultsByInput;
    const input1Result = cache.resultsByInput[InputId.Input1];
    const assertCalculationIdentity = () => {
      const current = session.calculationCacheByModel[ModelId.PmvAshrae];
      expect(current).toBe(cache);
      expect(current.status).toBe("ready");
      expect(current.chartSource).toBe(chartSource);
      expect(current.resultsByInput).toBe(resultsByInput);
      expect(current.resultsByInput[InputId.Input1]).toBe(input1Result);
      expect(session.output.isLoading).toBe(false);
    };

    session.actions.setSelectedChartInstance("dynamic");
    assertCalculationIdentity();
    expect(currentChart(session)?.layout.title)
      .toContain("Dynamic");

    const complianceBands = pmvAshraeModelConfig.complianceProfile?.bands;
    const complianceChart = currentChart(session);
    expect(getProfileBadgeControl(session).profileKind)
      .toBe(FieldChartProfileKind.Compliance);
    expect(session.chartControls.explore).toBeNull();
    const complianceLegend = session.chartLegendZones;
    if (complianceLegend) {
      expect(complianceLegend).toEqual(toLegendBands(complianceBands));
    }

    session.actions.setActiveSurface(SurfaceId.Explore);
    assertCalculationIdentity();

    expect(getProfileBadgeControl(session).profileKind)
      .toBe(FieldChartProfileKind.Explore);
    expect(session.chartLegendZones)
      .toEqual(toLegendBands(getOutputSettings(session).exploreBands ?? undefined));

    expect(
      session.chartControls.explore?.profile,
    ).toEqual(expect.objectContaining({
      xField: PhysicalQuantityId.DryBulbTemperature,
      yField: PhysicalQuantityId.RelativeHumidity,
      zOutput: PhysicalQuantityId.PredictedMeanVote,
    }));
    expect(session.chartLegendTitle).toBe("PMV acceptability");

    session.actions.setDynamicXAxis(PhysicalQuantityId.MeanRadiantTemperature);
    assertCalculationIdentity();
    session.actions.setDynamicYAxis(PhysicalQuantityId.OperativeTemperature);
    assertCalculationIdentity();
    session.actions.setChartBaselineInputId(InputId.Input2);
    assertCalculationIdentity();

    session.actions.setExploreOutput(PhysicalQuantityId.PredictedPercentageOfDissatisfied);
    assertCalculationIdentity();
    expect(getOutputSettings(session).exploreOutput).toBe(PhysicalQuantityId.PredictedPercentageOfDissatisfied);
    expect(session.chartLegendTitle).toBe("PPD Bands");
    expect(currentChart(session)?.traces).not.toEqual(complianceChart?.traces);

    const ppdBands = getOutputSettings(session).exploreBands?.map((band) => ({ ...band })) ?? [];
    session.actions.setExploreOutput(PhysicalQuantityId.UniversalThermalClimateIndex);
    assertCalculationIdentity();
    expect(getOutputSettings(session).exploreOutput).toBe(PhysicalQuantityId.PredictedPercentageOfDissatisfied);

    expect(session.actions.setExploreBands([
      { min: 0, max: 20, label: "One", color: "#000" },
      { min: 10, max: 30, label: "Two", color: "#fff" },
    ])).toBe(false);
    assertCalculationIdentity();
    expect(getOutputSettings(session).exploreBands).toEqual(ppdBands);

    expect(session.actions.setExploreBands([
      { min: 10, max: Infinity, label: "High", color: "#f00" },
      { min: -Infinity, max: 10, label: "Low", color: "#00f" },
    ])).toBe(true);
    assertCalculationIdentity();
    expect(getOutputSettings(session).exploreBands?.map(({ label }) => label))
      .toEqual(["Low", "High"]);

    session.actions.setActiveSurface(SurfaceId.Standard);
    assertCalculationIdentity();
    expect(getProfileBadgeControl(session).profileKind).toBe(FieldChartProfileKind.Compliance);
    const complianceLegendAfterStandard = session.chartLegendZones;
    if (complianceLegendAfterStandard) {
      expect(complianceLegendAfterStandard).toEqual(toLegendBands(complianceBands));
    }
    expect(session.chartLegendTitle).toBe("PMV acceptability");
    expect(currentChart(session)?.traces.some(({ fill }) => fill === "toself"))
      .toBe(true);
    expect(currentChart(session)?.traces.find(({ name }) => name === "PMV bands hover"))
      .toBeUndefined();
    expect(session.chartControls.explore).toBeNull();

    session.actions.setActiveSurface(SurfaceId.Explore);
    assertCalculationIdentity();
    expect(session.chartLegendZones)
      .toEqual(toLegendBands(getOutputSettings(session).exploreBands ?? undefined));
    expect(session.chartLegendTitle).toBe("PPD Bands");
    expect(getOutputSettings(session).exploreBands?.map(({ label }) => label))
      .toEqual(["Low", "High"]);

    const editedBands = getOutputSettings(session).exploreBands;
    session.actions.setExploreOutput(PhysicalQuantityId.PredictedPercentageOfDissatisfied);
    expect(getOutputSettings(session).exploreBands).toBe(editedBands);

    session.actions.toggleUnitSystem();
    assertCalculationIdentity();
    expect(getOutputSettings(session).exploreBands![1].min).toBe(10);
    expect(currentChart(session)).not.toBeUndefined();
  });

  it("can read Adaptive chartBuild before the first calculation finishes", () => {
    const session = createPointSession();
    session.actions.setSelectedModel(ModelId.AdaptiveAshrae, {
      validateRanges: false,
      schedule: false,
    });
    expect(session.setting.selectedModel).toBe(ModelId.AdaptiveAshrae);
    expect(() => session.chartBuild).not.toThrow();
    expect(session.chartBuild.readiness).toBe("empty");
  });

  it("rebuilds Adaptive regions from the selected cached comparison baseline", async () => {
    const session = createPointSession();
    session.actions.setSelectedModel(ModelId.AdaptiveAshrae);
    await waitForIdle(session);
    seedPrimaryQuantity(
      session,
      InputId.Input2,
      PhysicalQuantityId.RelativeAirSpeed,
      1.2,
    );
    session.actions.setCompareEnabled(true);
    await waitForIdle(session);

    const cache = session.calculationCacheByModel[ModelId.AdaptiveAshrae];
    const chartSource = cache.chartSource;
    const resultsByInput = cache.resultsByInput;
    const getTooWarmBoundary = () => currentChart(session)?.traces
      .find(({ name, fill }) => name === "too-warm" && fill === "toself")?.y;
    const input1Boundary = getTooWarmBoundary();

    session.actions.setChartBaselineInputId(InputId.Input2);

    expect(session.calculationCacheByModel[ModelId.AdaptiveAshrae])
      .toBe(cache);
    expect(cache.status).toBe("ready");
    expect(cache.chartSource).toBe(chartSource);
    expect(cache.resultsByInput).toBe(resultsByInput);
    expect(session.output.isLoading).toBe(false);
    const input2Boundary = getTooWarmBoundary();
    expect(input2Boundary).not.toEqual(input1Boundary);
    expect(currentChart(session)?.traces
      .filter(({ mode }) => mode === "markers")
      .map(({ name }) => name)).toEqual(["Input 1", "Input 2"]);

    session.input.quantitiesByInput[InputId.Input2][
      PhysicalQuantityId.RelativeAirSpeed
    ] = 0.1;
    expect(getTooWarmBoundary()).toEqual(input2Boundary);

    session.actions.setDynamicXAxis(PhysicalQuantityId.OperativeTemperature);
    expect(getOutputSettings(session)).toEqual(expect.objectContaining({
      xAxis: PhysicalQuantityId.OperativeTemperature,
      yAxis: PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
    }));
    expect(session.calculationCacheByModel[ModelId.AdaptiveAshrae])
      .toBe(cache);
    expect(cache.chartSource).toBe(chartSource);
    expect(cache.resultsByInput).toBe(resultsByInput);
    expect(session.output.isLoading).toBe(false);
    expect(currentChart(session)?.layout.xaxis.title)
      .toContain("Operative temperature");

    session.actions.toggleUnitSystem();
    expect(session.calculationCacheByModel[ModelId.AdaptiveAshrae])
      .toBe(cache);
    expect(cache.chartSource).toBe(chartSource);
    expect(cache.resultsByInput).toBe(resultsByInput);
    expect(session.output.isLoading).toBe(false);
    expect(currentChart(session)?.layout.xaxis.title)
      .toContain("°F");
  });

  it("retains independent mode, axes, output, bands, baseline, and chart selections", async () => {
    const session = createPointSession();
    session.actions.setCompareEnabled(true);
    await waitForIdle(session);
    session.actions.setActiveSurface(SurfaceId.Explore);
    session.actions.setExploreOutput(PhysicalQuantityId.PredictedPercentageOfDissatisfied);
    session.actions.setExploreBands([
      { min: -Infinity, max: 15, label: "Preferred", color: "#0f0" },
      { min: 15, max: Infinity, label: "Other", color: "#f00" },
    ]);

    session.actions.setSelectedChartInstance("dynamic");
    session.actions.setSelectedChartInstance("psychrometric");
    session.actions.setDynamicXAxis(PhysicalQuantityId.MeanRadiantTemperature);
    session.actions.setChartBaselineInputId(InputId.Input2);
    expect(getOutputSettings(session).exploreBands![0].label).toBe("Preferred");
    expect(session.chartControls.profileBadge?.profileKind)
      .toBe(FieldChartProfileKind.Explore);
    expect(session.chartControls.explore?.profile)
      .toEqual(expect.objectContaining({
        zOutput: PhysicalQuantityId.PredictedPercentageOfDissatisfied,
        bands: expect.arrayContaining([
          expect.objectContaining({ label: "Preferred" }),
        ]),
      }));

    session.actions.setSelectedModel(ModelId.Utci);
    syncWorkspaceToModel(session, ModelId.Utci);
    await waitForIdle(session);
    expect(getProfileBadgeControl(session).profileKind).toBe(FieldChartProfileKind.Explore);
    expect(getOutputSettings(session).exploreOutput).toBe(PhysicalQuantityId.UniversalThermalClimateIndex);

    session.actions.setSelectedModel(ModelId.AdaptiveAshrae);
    syncWorkspaceToModel(session, ModelId.AdaptiveAshrae);
    await waitForIdle(session);
    expect(getProfileBadgeControl(session).profileKind).toBe(FieldChartProfileKind.Compliance);
    expect(getOutputSettings(session).exploreOutput).toBeNull();
    expect(session.chartControls.explore).toBeNull();

    session.actions.setSelectedModel(ModelId.PmvAshrae);
    session.actions.setActiveSurface(SurfaceId.Explore);
    expect(getOutputSettings(session)).toEqual(expect.objectContaining({
      xAxis: PhysicalQuantityId.MeanRadiantTemperature,
      baselineInputId: InputId.Input2,
    }));
    expect(session.setting.activeSurface).toBe(SurfaceId.Explore);
    expect(getOutputSettings(session).exploreOutput).toBe(PhysicalQuantityId.PredictedPercentageOfDissatisfied);
    expect(getOutputSettings(session).exploreBands![0].label).toBe("Preferred");
    expect(session.setting.selectedChartInstanceByModel[ModelId.PmvAshrae])
      .toBe("psychrometric");

    session.actions.setSelectedChartInstance("dynamic");
    expect(getProfileBadgeControl(session).profileKind).toBe(FieldChartProfileKind.Explore);
    expect(session.chartControls.axes?.x.selectedField)
      .toBe(PhysicalQuantityId.MeanRadiantTemperature);
    expect(session.chartControls.baseline?.selectedInputId)
      .toBe(InputId.Input2);
    expect(session.chartControls.explore?.profile.zOutput)
      .toBe(PhysicalQuantityId.PredictedPercentageOfDissatisfied);
    expect(session.chartControls.explore?.profile.bands[0].label)
      .toBe("Preferred");
  });

  it("round-trips field-chart settings in the strict v1 share snapshot", async () => {
    const session = createPointSession();
    session.actions.setSelectedChartInstance("dynamic");
    session.actions.setActiveSurface(SurfaceId.Explore);
    session.actions.setExploreOutput(PhysicalQuantityId.PredictedPercentageOfDissatisfied);
    session.actions.setExploreBands([
      { min: -Infinity, max: 20, label: "Edited", color: "#0f0" },
      { min: 20, max: Infinity, label: "Other", color: "#f00" },
    ]);
    session.actions.setChartBaselineInputId(InputId.Input2);
    const snapshot = session.actions.exportShareSnapshot();
    session.actions.setExploreOutput(PhysicalQuantityId.PredictedMeanVote);
    session.actions.applyShareSnapshot(snapshot);
    await waitForIdle(session);

    expect(snapshot.version).toBe(1);
    expect(snapshot.models[ModelId.PmvAshrae].selectedChartType)
      .toBe("dynamic");
    expect(session.setting.selectedChartInstanceByModel[ModelId.PmvAshrae])
      .toBe("dynamic");
    expect(snapshot.models[ModelId.PmvAshrae].outputSettings)
      .toEqual(expect.objectContaining({
        baselineInputId: InputId.Input2,
        exploreOutput: PhysicalQuantityId.PredictedPercentageOfDissatisfied,
      }));
    expect(getOutputSettings(session).exploreOutput).toBe(PhysicalQuantityId.PredictedPercentageOfDissatisfied);
    expect(getOutputSettings(session).exploreBands![0].label).toBe("Edited");
  });

  it("keeps Adaptive on one Compliance chart with only its two semantic axes", () => {
    const session = createPointSession();
    seedSelectedModel(session, ModelId.AdaptiveAshrae);
    syncWorkspaceToModel(session, ModelId.AdaptiveAshrae);
    const settings = getOutputSettings(session);
    const controls = session.chartControls;

    expect(session.chartInstances).toEqual([
      expect.objectContaining({ instanceId: "adaptive", type: "adaptive" }),
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

    session.actions.setDynamicYAxis(PhysicalQuantityId.PrevailingMeanOutdoorTemperature);
    expect(settings.xAxis).toBe(PhysicalQuantityId.OperativeTemperature);
    expect(settings.yAxis).toBe(PhysicalQuantityId.PrevailingMeanOutdoorTemperature);
  });

  it("deduplicates legend entries by label and color without changing geometry bands", async () => {
    const session = createPointSession();
    session.actions.scheduleCalculation({ immediate: true, force: true });

    const assertions = [
      [ModelId.PmvAshrae, 3, 2],
      [ModelId.AdaptiveAshrae, 5, 4],
      [ModelId.AdaptiveEn, 7, 5],
    ] as const;
    await waitForIdle(session);
    for (const [modelId, geometryCount, legendCount] of assertions) {
      seedSelectedModel(session, modelId);
      syncWorkspaceToModel(session, modelId);
      session.actions.scheduleCalculation({ immediate: true, force: true });
      await waitForIdle(session);
      expect(comfortModelConfigs[modelId].complianceProfile?.bands)
        .toHaveLength(geometryCount);
      if (session.cacheStatus !== "ready") {
        continue;
      }
      const legendZones = session.chartLegendZones;
      expect(legendZones?.length ?? 0).toBe(legendCount);
    }

    seedSelectedModel(session, ModelId.PmvAshrae);
    session.actions.setActiveSurface(SurfaceId.Explore);
    expect(session.actions.setExploreBands([
      { min: -Infinity, max: 0, label: "Same label", color: "#00ff00" },
      { min: 0, max: Infinity, label: "Same label", color: "#ff0000" },
    ])).toBe(true);
    expect(session.chartLegendZones).toEqual([
      { label: "Same label", color: "#00ff00" },
      { label: "Same label", color: "#ff0000" },
    ]);
    expect(getOutputSettings(session).exploreBands).toHaveLength(2);
  });

  it("exposes coupled UTCI temperature axes in both directions", () => {
    const session = createPointSession();
    seedSelectedModel(session, ModelId.Utci);
    syncWorkspaceToModel(session, ModelId.Utci);
    session.actions.setSelectedChartInstance("dynamic");
    session.actions.setDynamicXAxis(PhysicalQuantityId.WindSpeed);
    session.actions.setDynamicYAxis(PhysicalQuantityId.OperativeTemperature);
    const settings = getOutputSettings(session);

    const xAxisOptions = session.chartControls.axes?.x.options ?? [];
    expect(xAxisOptions).toHaveLength(5);
    expect(xAxisOptions).toContain(PhysicalQuantityId.DryBulbTemperature);
    expect(xAxisOptions).toContain(PhysicalQuantityId.MeanRadiantTemperature);

    session.actions.setDynamicXAxis(PhysicalQuantityId.DryBulbTemperature);

    expect(settings.xAxis).toBe(PhysicalQuantityId.DryBulbTemperature);
    expect(settings.yAxis).toBe(PhysicalQuantityId.OperativeTemperature);

    session.actions.setDynamicXAxis(PhysicalQuantityId.OperativeTemperature);
    session.actions.setDynamicYAxis(PhysicalQuantityId.WindSpeed);

    const yAxisOptions = session.chartControls.axes?.y.options ?? [];
    expect(yAxisOptions).toHaveLength(5);
    expect(yAxisOptions).toContain(PhysicalQuantityId.DryBulbTemperature);
    expect(yAxisOptions).toContain(PhysicalQuantityId.MeanRadiantTemperature);

    session.actions.setDynamicYAxis(PhysicalQuantityId.MeanRadiantTemperature);

    expect(settings.xAxis).toBe(PhysicalQuantityId.OperativeTemperature);
    expect(settings.yAxis).toBe(PhysicalQuantityId.MeanRadiantTemperature);
  });

  it.each([ModelId.PmvAshrae, ModelId.PmvIso])(
    "exposes coupled operative-temperature axes for %s",
    (modelId) => {
      const session = createPointSession();
      seedSelectedModel(session, modelId);
      session.actions.setSelectedChartInstance(
        modelId === ModelId.PmvIso
          ? "dynamic"
          : "dynamic",
      );
      session.actions.setDynamicXAxis(PhysicalQuantityId.RelativeAirSpeed);
      session.actions.setDynamicYAxis(PhysicalQuantityId.OperativeTemperature);
      const settings = getOutputSettings(session, modelId);

      const xAxisOptions = session.chartControls.axes?.x.options ?? [];
      expect(xAxisOptions).toHaveLength(7);
      expect(xAxisOptions).toContain(PhysicalQuantityId.DryBulbTemperature);
      expect(xAxisOptions).toContain(PhysicalQuantityId.MeanRadiantTemperature);

      session.actions.setDynamicXAxis(PhysicalQuantityId.DryBulbTemperature);

      expect(settings.xAxis).toBe(PhysicalQuantityId.DryBulbTemperature);
      expect(settings.yAxis).toBe(PhysicalQuantityId.OperativeTemperature);
    },
  );

  it("does not store the unsupported occupant-control option for ISO PMV", () => {
    const session = createPointSession();
    seedSelectedModel(session, ModelId.PmvIso);
    const initialOptions = {
      ...session.setting.modelOptionsByModel[ModelId.PmvIso],
    };

    expect(initialOptions).not.toHaveProperty(OptionKey.AirSpeedControlMode);

    session.actions.setModelOption(
      OptionKey.AirSpeedControlMode,
      AirSpeedControlMode.NoLocalControl,
    );

    expect(session.setting.modelOptionsByModel[ModelId.PmvIso])
      .toEqual(initialOptions);
    expect(session.output.isLoading).toBe(false);
  });

  it("allows ISO clothing values above 1.5 clo and flags them when switching to ASHRAE", () => {
    const session = createPointSession();
    seedSelectedModel(session, ModelId.PmvIso);

    session.actions.updateInput(
      InputId.Input1,
      InputControlId.ClothingInsulation,
      "1.8",
    );
    session.actions.setSelectedModel(ModelId.PmvAshrae);

    expect(session.input.quantitiesByInput[InputId.Input1][PhysicalQuantityId.ClothingInsulation])
      .toBe(1.8);
    expect(session.pendingModelSwitch).toEqual(expect.objectContaining({
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
    const session = createPointSession();

    session.actions.setSelectedModel(ModelId.WindChill);

    expect(session.setting.selectedModel).toBe(ModelId.PmvAshrae);
    expect(session.pendingModelSwitch).toEqual(expect.objectContaining({
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

    session.actions.confirmModelSwitch();
    syncWorkspaceToModel(session, ModelId.WindChill);

    expect(session.setting.selectedModel).toBe(ModelId.WindChill);
    expect(session.pendingModelSwitch).toBeNull();
    expect(session.input.quantitiesByInput[InputId.Input1][PhysicalQuantityId.DryBulbTemperature])
      .toBe(0);
    expect(session.input.quantitiesByInput[InputId.Input1][PhysicalQuantityId.WindSpeed]).toBe(1);

    await waitForIdle(session);

    expect(session.calculationCacheByModel[ModelId.WindChill].status)
      .toBe("ready");
    expect(currentChart(session)?.traces[0].type).toBe("scatter");
  });

  it("restores each model's own dynamic axes when switching models", async () => {
    const session = createPointSession();
    session.actions.setSelectedChartInstance("dynamic");
    session.actions.setDynamicXAxis(PhysicalQuantityId.MeanRadiantTemperature);
    session.actions.setDynamicYAxis(PhysicalQuantityId.RelativeHumidity);

    session.actions.setSelectedModel(ModelId.AdaptiveAshrae);
    await waitForIdle(session);

    expect(session.setting.selectedModel).toBe(ModelId.AdaptiveAshrae);
    expect(getOutputSettings(session).xAxis)
      .toBe(PhysicalQuantityId.PrevailingMeanOutdoorTemperature);
    expect(getOutputSettings(session).yAxis).toBe(PhysicalQuantityId.OperativeTemperature);

    session.actions.setSelectedModel(ModelId.PmvAshrae);
    expect(getOutputSettings(session).xAxis).toBe(PhysicalQuantityId.MeanRadiantTemperature);
    expect(getOutputSettings(session).yAxis).toBe(PhysicalQuantityId.RelativeHumidity);
  });

  it("rejects invalid selected-model options at the calculation boundary", async () => {
    const session = createPointSession();
    delete session.setting.modelOptionsByModel[ModelId.PmvAshrae][
      OptionKey.HumidityInputMode
    ];

    session.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(session);

    expect(session.output.errorMessage).toBe(
      `Invariant violation: invalid options state for ${ModelId.PmvAshrae}.`,
    );
    expect(session.calculationCacheByModel[ModelId.PmvAshrae].status)
      .toBe("empty");
  });

  it("preserves ready model caches when switching between models", async () => {
    const session = createPointSession();

    session.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(session);

    const pmvChartSource = session.calculationCacheByModel[ModelId.PmvAshrae].chartSource;
    expect(session.calculationCacheByModel[ModelId.PmvAshrae].status).toBe("ready");
    expect(session.calculationCacheByModel[ModelId.Utci].status).toBe("empty");

    session.actions.setSelectedModel(ModelId.Utci);
    await waitForIdle(session);

    expect(session.calculationCacheByModel[ModelId.Utci].status).toBe("ready");
    expect(session.calculationCacheByModel[ModelId.PmvAshrae].status).toBe("ready");

    session.actions.setSelectedModel(ModelId.PmvAshrae);
    expect(session.output.isLoading).toBe(false);
    expect(session.calculationCacheByModel[ModelId.PmvAshrae].chartSource).toBe(pmvChartSource);
  });

  it("keeps ASHRAE and ISO PMV calculations in isolated registry caches", async () => {
    const session = createPointSession();

    session.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(session);
    const ashraeSource = session.calculationCacheByModel[ModelId.PmvAshrae]
      .chartSource as PmvChartSource;

    session.actions.setSelectedModel(ModelId.PmvIso);
    await waitForIdle(session);
    const isoSource = session.calculationCacheByModel[ModelId.PmvIso]
      .chartSource as PmvChartSource;

    expect(session.calculationCacheByModel[ModelId.PmvAshrae].status).toBe("ready");
    expect(session.calculationCacheByModel[ModelId.PmvIso].status).toBe("ready");
    expect(ashraeSource).not.toBe(isoSource);
    expect(Object.keys(ashraeSource).sort()).toEqual([
      "comfortZonesByInput",
      "derivedSlotsByInput",
      "inputs",
      "psychrometricTrEqualsTdb",
    ]);
    expect(Object.keys(isoSource).sort()).toEqual([
      "comfortZonesByInput",
      "derivedSlotsByInput",
      "inputs",
      "psychrometricTrEqualsTdb",
    ]);
    expect(ashraeSource.inputs).not.toBe(isoSource.inputs);

    session.actions.setSelectedModel(ModelId.PmvAshrae);
    expect(session.output.isLoading).toBe(false);
    expect(session.calculationCacheByModel[ModelId.PmvAshrae].chartSource).toBe(ashraeSource);
  });

  it("stales every model cache when an option patch rewrites shared inputs", async () => {
    const session = createPointSession();

    session.actions.updateInput(InputId.Input1, InputControlId.Temperature, "28");
    session.actions.updateInput(InputId.Input1, InputControlId.RadiantTemperature, "20");
    session.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(session);

    session.actions.setSelectedModel(ModelId.PmvIso);
    await waitForIdle(session);
    session.actions.setSelectedModel(ModelId.PmvAshrae);

    const previousIsoChartSource = session.calculationCacheByModel[ModelId.PmvIso].chartSource;

    session.actions.setModelOption(OptionKey.TemperatureMode, TemperatureMode.Operative);

    expect(session.calculationCacheByModel[ModelId.PmvAshrae].status).toBe("stale");
    expect(session.calculationCacheByModel[ModelId.PmvIso].status).toBe("stale");
    expect(session.calculationCacheByModel[ModelId.PmvIso].chartSource)
      .toBe(previousIsoChartSource);

    await waitForIdle(session);

    expect(session.calculationCacheByModel[ModelId.PmvAshrae].status).toBe("ready");
    expect(session.calculationCacheByModel[ModelId.PmvIso].status).toBe("stale");

    session.actions.setSelectedModel(ModelId.PmvIso);
    await waitForIdle(session);

    const currentIsoChartSource = session.calculationCacheByModel[ModelId.PmvIso]
      .chartSource as PmvChartSource;
    const currentInput = session.input.quantitiesByInput[InputId.Input1];

    expect(currentIsoChartSource).not.toBe(previousIsoChartSource);
    expect(currentIsoChartSource.inputs[InputId.Input1]?.tdb)
      .toBeCloseTo(currentInput[PhysicalQuantityId.DryBulbTemperature], 6);
    expect(currentIsoChartSource.inputs[InputId.Input1]?.tr)
      .toBeCloseTo(currentInput[PhysicalQuantityId.MeanRadiantTemperature], 6);
  });

  it("stales only the active model cache for a pure option patch", async () => {
    const session = createPointSession();

    session.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(session);
    session.actions.setSelectedModel(ModelId.PmvIso);
    await waitForIdle(session);
    session.actions.setSelectedModel(ModelId.PmvAshrae);

    const isoChartSource = session.calculationCacheByModel[ModelId.PmvIso].chartSource;

    session.actions.setModelOption(
      OptionKey.AirSpeedControlMode,
      AirSpeedControlMode.NoLocalControl,
    );

    expect(session.calculationCacheByModel[ModelId.PmvAshrae].status).toBe("stale");
    expect(session.calculationCacheByModel[ModelId.PmvIso].status).toBe("ready");
    expect(session.calculationCacheByModel[ModelId.PmvIso].chartSource)
      .toBe(isoChartSource);

    await waitForIdle(session);

    expect(session.calculationCacheByModel[ModelId.PmvAshrae].status).toBe("ready");
  });

  it("invalidates supporting model caches only when modifier state is effective", async () => {
    const session = createPointSession();
    session.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(session);
    session.actions.setSelectedModel(ModelId.PmvIso);
    await waitForIdle(session);
    session.actions.setSelectedModel(ModelId.PmvAshrae);

    const ashraeSource = session.calculationCacheByModel[ModelId.PmvAshrae]
      .chartSource;
    const isoSource = session.calculationCacheByModel[ModelId.PmvIso]
      .chartSource;

    expect(session.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      PhysicalQuantityId.MeasuredAirSpeed,
      "0.6",
    )).toBe(true);
    expect(session.calculationCacheByModel[ModelId.PmvAshrae].status)
      .toBe("ready");
    expect(session.calculationCacheByModel[ModelId.PmvIso].status)
      .toBe("ready");
    expect(session.calculationCacheByModel[ModelId.PmvAshrae].chartSource)
      .toBe(ashraeSource);
    expect(session.calculationCacheByModel[ModelId.PmvIso].chartSource)
      .toBe(isoSource);

    expect(session.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      true,
    )).toBe(true);
    expect(session.calculationCacheByModel[ModelId.PmvAshrae].status)
      .toBe("stale");
    expect(session.calculationCacheByModel[ModelId.PmvIso].status)
      .toBe("stale");
    expect(session.calculationCacheByModel[ModelId.Utci].status)
      .toBe("empty");

    await waitForIdle(session);
    expect(session.calculationCacheByModel[ModelId.PmvAshrae].status)
      .toBe("ready");
    expect(session.calculationCacheByModel[ModelId.PmvIso].status)
      .toBe("stale");

    expect(session.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      PhysicalQuantityId.MeasuredAirSpeed,
      "0.7",
    )).toBe(true);
    expect(session.calculationCacheByModel[ModelId.PmvAshrae].status)
      .toBe("stale");
    expect(session.calculationCacheByModel[ModelId.PmvIso].status)
      .toBe("stale");
    expect(session.calculationCacheByModel[ModelId.Utci].status)
      .toBe("empty");

    session.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(session);
    expect(session.calculationCacheByModel[ModelId.PmvAshrae].status)
      .toBe("ready");
  });

  it("feeds one effective PMV request to results and chart generation in operative mode", async () => {
    const session = createPointSession();
    session.actions.setModelOption(OptionKey.TemperatureMode, TemperatureMode.Operative);
    session.actions.updateInput(InputId.Input1, InputControlId.Temperature, "24");
    session.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      PhysicalQuantityId.MeasuredAirSpeed,
      "0.6",
    );
    session.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MorningClothingEstimate,
      PhysicalQuantityId.MorningOutdoorTemperature,
      "10",
    );
    populateSolarModifier(session, InputId.Input1);
    session.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      true,
    );
    session.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MorningClothingEstimate,
      true,
    );
    session.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.SolarGain,
      true,
    );
    await waitForIdle(session);

    const baseInputs = session.input.quantitiesByInput[InputId.Input1];
    const effectiveInputs = session.effectiveQuantities()[InputId.Input1];
    const cache = session.calculationCacheByModel[ModelId.PmvAshrae];
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
    expect(session.resultSections
      .find(({ title }) => title === "PMV")?.valuesByInput[InputId.Input1]?.text)
      .toBe(formatDisplayValue(result.pmv));
    expect(session.chartControls.profileBadge.feedback?.passes)
      .toBe(result.isCompliant);

    session.actions.setSelectedChartInstance("dynamic");
    session.actions.setDynamicXAxis(PhysicalQuantityId.MeanRadiantTemperature);
    const marker = currentChart(session)?.traces.find((trace) => (
      trace.name === "Input 1" && trace.mode === "markers"
    ));
    expect(Number(marker?.x?.[0])).toBeCloseTo(request!.tr, 6);
  });

  it("retains modifier configuration while unsupported models ignore and hide it", async () => {
    const session = createPointSession();
    session.actions.updateModifierInput(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      PhysicalQuantityId.MeasuredAirSpeed,
      "0.6",
    );
    session.actions.setModifierEnabled(
      InputId.Input1,
      ModifierId.MeasuredAirSpeed,
      true,
    );
    await waitForIdle(session);
    const baseAirSpeed = session.input.quantitiesByInput[InputId.Input1]
      [PhysicalQuantityId.RelativeAirSpeed];

    session.actions.setSelectedModel(ModelId.Utci);
    await waitForIdle(session);

    expect(session.input.activeModifiersByInput[InputId.Input1]
      [ModifierId.MeasuredAirSpeed]).toBe(true);
    expect(session.inputModifierControls()).toEqual([]);
    expect(session.effectiveQuantities(ModelId.Utci)[InputId.Input1]
      [PhysicalQuantityId.RelativeAirSpeed]).toBe(baseAirSpeed);

    session.actions.setSelectedModel(ModelId.PmvAshrae);
    expect(session.inputModifierControls()
      .find(({ id }) => id === ModifierId.MeasuredAirSpeed)?.activeByInput[InputId.Input1])
      .toBe(true);
  });

  it("stales all model caches after shared input updates and only refreshes the selected model", async () => {
    const session = createPointSession();

    session.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(session);
    session.actions.setSelectedModel(ModelId.Utci);
    await waitForIdle(session);
    session.actions.setSelectedModel(ModelId.PmvAshrae);

    const previousUtciChartSource = session.calculationCacheByModel[ModelId.Utci].chartSource;

    session.actions.updateInput(session.setting.activeInputId, InputControlId.Temperature, "27");

    expect(session.calculationCacheByModel[ModelId.PmvAshrae].status).toBe("stale");
    expect(session.calculationCacheByModel[ModelId.Utci].status).toBe("stale");

    session.actions.scheduleCalculation({ immediate: true });
    await waitForIdle(session);

    expect(session.calculationCacheByModel[ModelId.PmvAshrae].status).toBe("ready");
    expect(session.calculationCacheByModel[ModelId.Utci].status).toBe("stale");
    expect(session.calculationCacheByModel[ModelId.Utci].chartSource).toBe(previousUtciChartSource);
  });

  it("rebuilds result and chart presentation on unit toggle without mutating cached SI results", async () => {
    const session = createPointSession();

    session.actions.setSelectedModel(ModelId.Utci);
    syncWorkspaceToModel(session, ModelId.Utci);
    await waitForIdle(session);

    const rawUtci = (
      session.calculationCacheByModel[ModelId.Utci]
        .resultsByInput.input1 as UtciResponse | null
    )?.utci;
    const chartSource = session.calculationCacheByModel[ModelId.Utci].chartSource;
    const siResultText = session.resultSections[0].valuesByInput.input1?.text;
    const siChartTitle = String(currentChart(session)?.layout.xaxis.title ?? "");

    session.actions.toggleUnitSystem();

    const ipResultText = session.resultSections[0].valuesByInput.input1?.text;
    const ipChartTitle = String(currentChart(session)?.layout.xaxis.title ?? "");

    expect(rawUtci).toBe((
      session.calculationCacheByModel[ModelId.Utci]
        .resultsByInput.input1 as UtciResponse | null
    )?.utci);
    expect(chartSource).toBe(session.calculationCacheByModel[ModelId.Utci].chartSource);
    expect(siResultText).toContain("°C");
    expect(ipResultText).toContain("°F");
    expect(siChartTitle).toContain("°C");
    expect(ipChartTitle).toContain("°F");
    expect(session.setting.unitSystem).toBe(UnitSystem.IP);
  });

  it("skips recalculation when scheduleCalculation is called on a ready cache without force", async () => {
    const session = createPointSession();
    session.actions.scheduleCalculation({ immediate: true, force: true });
    await waitForIdle(session);
    const calculateSpy = vi.spyOn(pmvAshraeModelConfig, "calculate");
    try {
      const readyCache = session.calculationCacheByModel[ModelId.PmvAshrae];
      expect(readyCache.status).toBe("ready");
      session.actions.scheduleCalculation({ immediate: true, force: false });
      await waitForIdle(session);
      expect(calculateSpy).not.toHaveBeenCalled();
      expect(session.calculationCacheByModel[ModelId.PmvAshrae]).toBe(readyCache);
    } finally {
      calculateSpy.mockRestore();
    }
  });

  it("invalidates and recalculates when a primary quantity changes", async () => {
    const session = createPointSession();
    session.actions.scheduleCalculation({ immediate: true, force: true });
    await waitForIdle(session);
    const calculateSpy = vi.spyOn(pmvAshraeModelConfig, "calculate");
    try {
      calculateSpy.mockClear();
      session.actions.updateInput(
        InputId.Input1,
        InputControlId.Temperature,
        "32",
      );
      expect(session.calculationCacheByModel[ModelId.PmvAshrae].status)
        .toBe("stale");
      await new Promise((resolve) => setTimeout(resolve, 250));
      await waitForIdle(session);
      expect(session.input.quantitiesByInput[InputId.Input1]
        [PhysicalQuantityId.DryBulbTemperature]).toBe(32);
      expect(calculateSpy).toHaveBeenCalled();
      expect(session.calculationCacheByModel[ModelId.PmvAshrae].status)
        .toBe("ready");
    } finally {
      calculateSpy.mockRestore();
    }
  });

  it("rebuilds chart markers after input changes instead of reusing memoized chart builds", async () => {
    const session = createPointSession();
    session.actions.setSelectedChartInstance("dynamic");
    session.actions.setDynamicXAxis(PhysicalQuantityId.DryBulbTemperature);
    session.actions.scheduleCalculation({ immediate: true, force: true });
    await waitForIdle(session);

    const chartBefore = currentChart(session);
    const markerBefore = chartBefore?.traces.find((trace) => trace.name === "Input 1");

    session.actions.updateInput(InputId.Input1, InputControlId.Temperature, "32");
    await new Promise((resolve) => setTimeout(resolve, 250));
    await waitForIdle(session);

    const chartAfter = currentChart(session);
    const markerAfter = chartAfter?.traces.find((trace) => trace.name === "Input 1");

    expect(session.input.quantitiesByInput[InputId.Input1]
      [PhysicalQuantityId.DryBulbTemperature]).toBe(32);
    expect(chartAfter).not.toBe(chartBefore);
    expect(markerAfter?.x?.[0]).not.toBe(markerBefore?.x?.[0]);
    expect(markerAfter?.x?.[0]).toBeCloseTo(32, 6);
  });

});
