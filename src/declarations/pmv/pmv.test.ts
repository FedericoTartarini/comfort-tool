import { pmv_ppd, pmv_ppd_ashrae } from "jsthermalcomfort";
import { describe, expect, it, vi } from "vitest";

import { CalculationSource, ComfortStandard } from "../../models/calculationMetadata";
import { ModelId, JsThermalComfortStandard } from "../../models/modelIds";
import { PhysicalQuantityId, type PrimaryInputState } from "../../models/quantities";
import { InputControlId } from "../../models/inputControls";
import {
  AirSpeedControlMode,
  HumidityInputMode,
  OptionKey,
  TemperatureMode,
} from "../../models/inputModes";
import { InputId } from "../../models/inputSlots";
import { ModifierId } from "../../models/inputModifiers";
import {
  findNumericBandIndexForValue,
  ModelOutputKey,
} from "../../models/modelCapabilities";
import { ChartEngine } from "../../models/chartEngines";
import { FieldChartProfileKind } from "../../models/output/fieldChartProfile";
import { UnitSystem } from "../../models/units";
import { createModelCalculationContext } from "../../models/modelCalculation";
import { buildChartPlotly } from "../../testSupport/modelChartTestHelpers";
import { createAnalysisState } from "../../state/analysis/createAnalysisState.svelte";
import { requiredControlIdsByModel } from "../../testSupport/requiredModelControls";
import {
  applyInputModifierChain,
  createDynamicClothingModifier,
} from "../../services/comfort/inputModifiers";
import {
  pmvAshraeAdapter,
  pmvAshraeDeclaration,
  pmvAshraeModelConfig,
} from "./ashrae";
import {
  pmvIsoAdapter,
  pmvIsoDeclaration,
  pmvIsoModelConfig,
} from "./iso";
import {
  createPmvComplianceCaption,
  createPmvModelConfig,
  type PmvModelDeclaration,
  type PmvStandardAdapter,
} from "./shared";
import { createDynamicViewDescriptor } from "./dynamicChart";
import {
  calculatePmvModel,
  derivePmvAnalysisOutputs,
  pmvNeutralZone,
  type PmvChartSource,
  type PmvRequest,
  type PmvResponse,
} from "./calculation";

const baseRequest: PmvRequest = {
  tdb: 25,
  tr: 25,
  vr: 0.1,
  rh: 50,
  met: 1.2,
  clo: 0.5,
  wme: 0,
  occupantHasAirSpeedControl: true,
};

const standardCases = [
  {
    label: "ASHRAE",
    adapter: pmvAshraeAdapter,
    declaration: pmvAshraeDeclaration,
    config: pmvAshraeModelConfig,
  },
  {
    label: "ISO",
    adapter: pmvIsoAdapter,
    declaration: pmvIsoDeclaration,
    config: pmvIsoModelConfig,
  },
] as const;

function setPmvInputs(
  toolState: ReturnType<typeof createAnalysisState>,
  values: Partial<PrimaryInputState>,
): void {
  Object.assign(toolState.state.quantitiesByInput[InputId.Input1], values);
}

function calculateRegisteredModel(
  adapter: PmvStandardAdapter,
  toolState: ReturnType<typeof createAnalysisState>,
  effectiveQuantitiesByInput = toolState.state.quantitiesByInput,
): { result: PmvResponse; chartSource: PmvChartSource } {
  const calculation = calculatePmvModel(createModelCalculationContext({
    effectiveQuantitiesByInput,
    auxiliaryQuantitiesByInput: toolState.state.auxiliaryQuantitiesByInput,
    modelInputs: toolState.state.modelInputsByModel[adapter.modelId],
    options: toolState.state.ui.modelOptionsByModel[adapter.modelId],
  }), [InputId.Input1], adapter);
  const result = calculation.resultsByInput[InputId.Input1];
  if (!result) throw new Error("Expected a PMV result for Input 1.");
  return { result, chartSource: calculation.chartSource };
}

function calculateWithDynamicClothingModifier(
  adapter: PmvStandardAdapter,
  clothingSi: number,
  metSi: number,
): { result: PmvResponse; effectiveClo: number } {
  const toolState = createAnalysisState();
  const base = {
    ...toolState.state.quantitiesByInput[InputId.Input1],
    [PhysicalQuantityId.ClothingInsulation]: clothingSi,
    [PhysicalQuantityId.MetabolicRate]: metSi,
  };
  const effective = applyInputModifierChain(
    base,
    [createDynamicClothingModifier(adapter.clothingStandard)],
    { [ModifierId.DynamicClothing]: true },
    { [ModifierId.DynamicClothing]: {} },
  );
  const { result } = calculateRegisteredModel(adapter, toolState, {
    ...toolState.state.quantitiesByInput,
    [InputId.Input1]: effective,
  });
  return {
    result,
    effectiveClo: effective[PhysicalQuantityId.ClothingInsulation],
  };
}

function emptyPmvResults(): Record<InputId, PmvResponse | null> {
  return {
    [InputId.Input1]: null,
    [InputId.Input2]: null,
    [InputId.Input3]: null,
  };
}

describe("PMV standard declarations", () => {
  it("derives compliance caption thresholds from the supplied Neutral band", () => {
    const caption = createPmvComplianceCaption("Custom standard", [
      { min: -Infinity, max: -0.7, label: "Cool", color: "#00f" },
      { min: -0.7, max: 0.8, label: "Neutral", color: "#0f0" },
      { min: 0.8, max: Infinity, label: "Warm", color: "#f00" },
    ]);

    expect(caption).toBe(
      "Green shading = Custom standard compliant PMV (−0.7 ≤ PMV < +0.8); red = outside the limit.",
    );
  });

  it("registers independent ASHRAE and ISO models with declaration-owned metadata", () => {
    expect(pmvAshraeModelConfig).not.toBe(pmvIsoModelConfig);
    expect(pmvAshraeModelConfig.id).toBe(ModelId.PmvAshrae);
    expect(pmvIsoModelConfig.id).toBe(ModelId.PmvIso);
    expect(pmvAshraeModelConfig.label).toBe(pmvAshraeDeclaration.label);
    expect(pmvIsoModelConfig.label).toBe(pmvIsoDeclaration.label);
    expect(pmvIsoModelConfig.description).toContain("ISO 7730 Category B");
    expect(pmvAshraeDeclaration.complianceProfile.bands)
      .not.toBe(pmvIsoDeclaration.complianceProfile.bands);
    expect(pmvAshraeDeclaration.heatLossChartId)
      .not.toBe(pmvIsoDeclaration.heatLossChartId);
    expect(pmvAshraeDeclaration.setChartId)
      .not.toBe(pmvIsoDeclaration.setChartId);
  });

  it("pins required Analysis controls independently of inputFields", () => {
    expect(pmvAshraeModelConfig.controls.map(({ id }) => id)).toEqual([
      ...requiredControlIdsByModel[ModelId.PmvAshrae],
    ]);
    expect(pmvIsoModelConfig.controls.map(({ id }) => id)).toEqual([
      ...requiredControlIdsByModel[ModelId.PmvIso],
    ]);
  });

  it("uses exact standard-specific option schemas", () => {
    const commonOptions = {
      [OptionKey.TemperatureMode]: TemperatureMode.Air,
      [OptionKey.HumidityInputMode]: HumidityInputMode.RelativeHumidity,
    };
    const ashraeOptions = {
      ...commonOptions,
      [OptionKey.AirSpeedControlMode]: AirSpeedControlMode.WithLocalControl,
    };

    expect(pmvAshraeModelConfig.parseOptions(ashraeOptions)).toEqual(ashraeOptions);
    expect(pmvAshraeModelConfig.parseOptions(commonOptions)).toBeNull();
    expect(pmvAshraeModelConfig.parseOptions({ ...ashraeOptions, unknown: "value" }))
      .toBeNull();

    expect(pmvIsoModelConfig.parseOptions(commonOptions)).toEqual(commonOptions);
    expect(pmvIsoModelConfig.parseOptions({
      ...commonOptions,
      [OptionKey.AirSpeedControlMode]: AirSpeedControlMode.WithLocalControl,
    })).toBeNull();
    expect(pmvIsoModelConfig.parseOptions({
      [OptionKey.TemperatureMode]: TemperatureMode.Air,
    })).toBeNull();
  });

  it("never enables occupant air-speed control for ISO requests", () => {
    const toolState = createAnalysisState();
    const { chartSource } = calculateRegisteredModel(pmvIsoAdapter, toolState);

    expect(chartSource.inputs[InputId.Input1]?.occupantHasAirSpeedControl)
      .toBe(false);
  });

  it.each(standardCases)(
    "$label exposes its clothing and occupant-air-speed capabilities",
    ({ adapter, config }) => {
      const toolState = createAnalysisState();
      toolState.state.ui.selectedModel = config.id;
      const controls = toolState.selectors.getInputControls();
      const clothingControl = controls.find(
        ({ id }) => id === InputControlId.ClothingInsulation,
      );
      const airSpeedControl = controls.find(({ id }) => id === InputControlId.AirSpeed);
      const optionKeys = airSpeedControl?.menu?.sections.flatMap(
        ({ items }) => items.map(({ optionKey }) => optionKey),
      ) ?? [];

      expect(clothingControl?.maxValue).toBe(adapter.clothingInsulationMaxSi);
      expect(optionKeys.includes(OptionKey.AirSpeedControlMode))
        .toBe(adapter.supportsOccupantAirSpeedControl);
      expect(config.optionHandlersByKey[OptionKey.AirSpeedControlMode] !== undefined)
        .toBe(adapter.supportsOccupantAirSpeedControl);
    },
  );

  it.each(standardCases)(
    "$label accepts its inclusive clothing limit and rejects values above it",
    ({ adapter }) => {
      const request = {
        ...baseRequest,
        clo: adapter.clothingInsulationMaxSi,
        occupantHasAirSpeedControl: adapter.supportsOccupantAirSpeedControl,
      };

      expect(adapter.checkApplicability(request)).toEqual([]);
      expect(adapter.checkApplicability({
        ...request,
        clo: adapter.clothingInsulationMaxSi + 0.0001,
      })).not.toEqual([]);
    },
  );

  it("binds each adapter to its SI-only library calculation", () => {
    const request = {
      ...baseRequest,
      tdb: 26,
      tr: 26,
      vr: 0.8,
    };
    const ashrae = pmvAshraeAdapter.calculate(request);
    const iso = pmvIsoAdapter.calculate(request);
    const expectedAshrae = pmv_ppd_ashrae(26, 26, 0.8, 50, 1.2, 0.5, 0, {
      units: UnitSystem.SI,
      limit_inputs: false,
      airspeed_control: true,
    });
    const expectedIso = pmv_ppd(
      26,
      26,
      0.8,
      50,
      1.2,
      0.5,
      0,
      JsThermalComfortStandard.ISO,
      { units: UnitSystem.SI, limit_inputs: false },
    );

    expect(ashrae).toEqual(expectedAshrae);
    expect(iso).toEqual(expectedIso);
    expect(ashrae.pmv).not.toBe(iso.pmv);
  });

  it("keeps standard identity out of requests and chart sources", () => {
    const toolState = createAnalysisState();
    setPmvInputs(toolState, {
      [PhysicalQuantityId.DryBulbTemperature]: 26,
      [PhysicalQuantityId.MeanRadiantTemperature]: 26,
      [PhysicalQuantityId.RelativeAirSpeed]: 0.8,
    });
    const ashrae = calculateRegisteredModel(pmvAshraeAdapter, toolState);
    const iso = calculateRegisteredModel(pmvIsoAdapter, toolState);
    const ashraeRequest = ashrae.chartSource.inputs[InputId.Input1];

    expect(ashrae.result.standard).toBe(ComfortStandard.Ashrae55PmvPpd);
    expect(iso.result.standard).toBe(ComfortStandard.Iso7730PmvPpd);
    expect(ashrae.result.source).toBe(CalculationSource.JsThermalComfort);
    expect(iso.result.source).toBe(CalculationSource.JsThermalComfort);
    expect(Object.keys(ashrae.chartSource).sort()).toEqual([
      "comfortZonesByInput",
      "derivedSlotsByInput",
      "inputs",
    ]);
    expect(ashraeRequest).not.toHaveProperty("units");
    expect(ashraeRequest).not.toHaveProperty("standard");
    expect(ashrae.chartSource).not.toHaveProperty("modelId");
    expect(ashrae.result.pmv).not.toBe(iso.result.pmv);
  });

  it.each(standardCases)(
    "$label stores SET, cooling effect, relative air speed, and dynamic clothing",
    ({ adapter }) => {
      const { result, chartSource } = calculateRegisteredModel(
        adapter,
        createAnalysisState(),
      );
      const request = chartSource.inputs[InputId.Input1];
      if (!request) throw new Error("Missing PMV request for Input 1.");
      const expected = derivePmvAnalysisOutputs(request);

      expect(result.set).toBe(expected.set);
      expect(result.coolingEffect).toBe(expected.coolingEffect);
      expect(result.vr).toBe(request.vr);
      expect(result.dynamicClothing).toBe(expected.dynamicClothing);
    },
  );

  it("keeps ASHRAE and ISO dynamic-clothing modifiers independent", () => {
    const ashrae = calculateWithDynamicClothingModifier(pmvAshraeAdapter, 1, 1.1);
    const iso = calculateWithDynamicClothingModifier(pmvIsoAdapter, 1, 1.1);

    expect(ashrae.effectiveClo).toBe(1);
    expect(iso.effectiveClo).toBeCloseTo(0.964, 3);
    expect(ashrae.result.dynamicClothing).toBe(ashrae.effectiveClo);
    expect(iso.result.dynamicClothing).toBe(iso.effectiveClo);
  });

  it.each(standardCases)(
    "$label reports modifier-adjusted clothing instead of applying clo_dynamic twice",
    ({ adapter, config }) => {
      const { result, effectiveClo } = calculateWithDynamicClothingModifier(
        adapter,
        1,
        1.8,
      );
      const sections = config.buildTable(
        {
          [InputId.Input1]: result,
          [InputId.Input2]: null,
          [InputId.Input3]: null,
        },
        [InputId.Input1],
        UnitSystem.SI,
      );
      const cell = sections.find((section) => section.title === "Dynamic clothing")
        ?.valuesByInput[InputId.Input1];

      expect(effectiveClo).toBeCloseTo(0.822, 3);
      expect(result.dynamicClothing).toBe(effectiveClo);
      expect(result.dynamicClothing).not.toBeCloseTo(0.676, 3);
      expect(cell?.text).toBe("0.82 clo");
    },
  );

  it("reports zero cooling effect at still-air speed and a positive value when elevated", () => {
    const still = derivePmvAnalysisOutputs(baseRequest);
    const elevated = derivePmvAnalysisOutputs(
      { ...baseRequest, vr: 0.3 },
    );

    expect(still.coolingEffect).toBe(0);
    expect(elevated.coolingEffect).toBeGreaterThan(0);
  });

  it.each(standardCases)(
    "$label Compare-matrix includes SET, cooling effect, relative air speed, and dynamic clothing",
    ({ config }) => {
      expect(config.tables.analysis.rows.map((row) => row.label)).toEqual([
        "Compliance",
        "PMV",
        "Zone",
        "PPD",
        "Acceptability",
        "SET",
        "Cooling effect",
        "Relative air speed",
        "Dynamic clothing",
      ]);
      expect(config.exploreOutputs.map((output) => output.key)).toEqual([
        ModelOutputKey.Pmv,
        ModelOutputKey.Ppd,
      ]);
    },
  );

  it.each(standardCases)(
    "$label registers independent ParametricLine heat-loss and SET charts",
    ({ config, declaration }) => {
      expect(config.chartInstances.defaultInstanceId)
        .toBe(declaration.psychrometricChartId);
      expect(config.chartInstances.entries.map(({ instanceId, engine, name }) => ({
        instanceId,
        engine,
        name,
      }))).toEqual([
        {
          instanceId: declaration.psychrometricChartId,
          engine: ChartEngine.Custom,
          name: "Psychrometric",
        },
        {
          instanceId: declaration.dynamicChartId,
          engine: ChartEngine.DynamicField,
          name: "Dynamic",
        },
        {
          instanceId: declaration.heatLossChartId,
          engine: ChartEngine.ParametricLine,
          name: "Heat Loss",
        },
        {
          instanceId: declaration.setChartId,
          engine: ChartEngine.ParametricLine,
          name: "SET",
        },
      ]);
    },
  );

  it.each(standardCases)(
    "$label builds heat-loss and SET charts from the calculation cache",
    ({ adapter, config, declaration }) => {
      const { chartSource } = calculateRegisteredModel(
        adapter,
        createAnalysisState(),
      );
      const context = {
        unitSystem: UnitSystem.SI,
        baselineInputId: InputId.Input1,
        fieldChartConfig: {
          profileKind: FieldChartProfileKind.Explore,
          xField: PhysicalQuantityId.DryBulbTemperature,
          yField: PhysicalQuantityId.RelativeHumidity,
          zOutput: ModelOutputKey.Pmv,
          bands: declaration.exploreOutputs[0].defaultBands,
        },
      };
      const heatLoss = buildChartPlotly(
        config,
        declaration.heatLossChartId,
        chartSource,
        emptyPmvResults(),
        context,
      );
      const set = buildChartPlotly(
        config,
        declaration.setChartId,
        chartSource,
        emptyPmvResults(),
        context,
      );

      expect(heatLoss?.layout.title).toBe("Heat Loss Components");
      expect(heatLoss?.traces.some((trace) => trace.type === "contour")).toBe(false);
      expect(heatLoss?.traces.some((trace) => trace.name === "Total heat loss"))
        .toBe(true);
      expect(set?.layout.title).toBe("SET outputs");
      expect(set?.traces.some((trace) => trace.type === "contour")).toBe(false);
      expect(set?.traces.some((trace) => trace.name === "SET temperature")).toBe(true);
    },
  );
});

describe("PMV roots and compliance", () => {
  it("rejects non-finite PMV values instead of assigning Neutral", () => {
    const adapter: PmvStandardAdapter = {
        ...pmvAshraeAdapter,
        calculate: () => ({ pmv: Number.NaN, ppd: Number.NaN }),
    };

    expect(() => calculateRegisteredModel(adapter, createAnalysisState()))
      .toThrow(/PMV.*non-finite/i);
  });

  it.each(standardCases)(
    "$label brackets and bisects ordinary PMV comfort-zone roots",
    ({ adapter }) => {
      const { chartSource } = calculateRegisteredModel(
        adapter,
        createAnalysisState(),
      );
      const request = chartSource.inputs[InputId.Input1];
      const zone = chartSource.comfortZonesByInput[InputId.Input1];
      const warmPoint = zone?.warmEdge.find(({ rh }) => rh === 50);
      if (!request || !warmPoint) throw new Error("Missing PMV warm-edge root.");

      expect(warmPoint.tdb).toBeGreaterThanOrEqual(10);
      expect(warmPoint.tdb).toBeLessThanOrEqual(40);
      expect(Math.abs(adapter.calculate({
        ...request,
        tdb: warmPoint.tdb,
        rh: warmPoint.rh,
      }).pmv - 0.5)).toBeLessThanOrEqual(5e-4);
    },
  );

  it("finds a non-monotonic root even when the view endpoints have the same sign", () => {
    const adapter: PmvStandardAdapter = {
      ...pmvAshraeAdapter,
      calculate: (request) => ({
        pmv: (request.tdb - 10.25) * (request.tdb - 20.25) - 0.5,
        ppd: 0,
      }),
    };
    const { chartSource } = calculateRegisteredModel(
      adapter,
      createAnalysisState(),
    );
    const coolEdge = chartSource.comfortZonesByInput[InputId.Input1]?.coolEdge ?? [];

    expect(coolEdge.some(({ tdb }) => Math.abs(tdb - 10.25) <= 5e-4)).toBe(true);
  });

  it("omits comfort-zone points when the drawable range contains no roots", () => {
    const adapter: PmvStandardAdapter = {
      ...pmvAshraeAdapter,
      calculate: () => ({ pmv: 1, ppd: 0 }),
    };
    const { chartSource } = calculateRegisteredModel(
      adapter,
      createAnalysisState(),
    );
    const zone = chartSource.comfortZonesByInput[InputId.Input1];

    expect(zone?.coolEdge).toEqual([]);
    expect(zone?.warmEdge).toEqual([]);
  });

  it("maps known point-domain failures to null and propagates unexpected errors", () => {
    const knownFailureAdapter: PmvStandardAdapter = {
      ...pmvAshraeAdapter,
      calculate: () => {
        throw new Error("Root is not bracketed");
      },
    };
    const unexpectedFailureAdapter: PmvStandardAdapter = {
      ...pmvAshraeAdapter,
      calculate: () => {
        throw new Error("broken adapter");
      },
    };
    const buildChart = (adapter: PmvStandardAdapter) => {
      const declaration: PmvModelDeclaration = { ...pmvAshraeDeclaration, adapter };
      const config = createPmvModelConfig(declaration);
      return buildChartPlotly(config,
        "pmv-ashrae-dynamic-field",
        {
          inputs: {
            [InputId.Input1]: {
              ...baseRequest,
              rhMin: 0,
              rhMax: 100,
              rhPoints: 31,
            },
          },
          comfortZonesByInput: {},
        },
        emptyPmvResults(),
        {
          unitSystem: UnitSystem.SI,
          baselineInputId: InputId.Input1,
          fieldChartConfig: {
            profileKind: FieldChartProfileKind.Explore,
            xField: PhysicalQuantityId.DryBulbTemperature,
            yField: PhysicalQuantityId.RelativeHumidity,
            zOutput: ModelOutputKey.Pmv,
            bands: declaration.exploreOutputs[0].defaultBands,
          },
        },
      );
    };

    expect(buildChart(knownFailureAdapter)).not.toBeNull();
    expect(() => createPmvModelConfig({
      ...pmvAshraeDeclaration,
      adapter: unexpectedFailureAdapter,
    }).calculate(
      createModelCalculationContext({
        effectiveQuantitiesByInput: createAnalysisState().state.quantitiesByInput,
        auxiliaryQuantitiesByInput: createAnalysisState().state.auxiliaryQuantitiesByInput,
        modelInputs: {},
        options: createAnalysisState().state.ui.modelOptionsByModel[ModelId.PmvAshrae],
      }),
      [InputId.Input1],
    )).toThrow("broken adapter");
  });

  it.each(standardCases)(
    "$label assigns neutral boundaries with half-open semantics",
    ({ adapter, declaration }) => {
      const neutralZone = pmvNeutralZone;
      const bands = declaration.complianceProfile.bands;
      const { chartSource } = calculateRegisteredModel(
        adapter,
        createAnalysisState(),
      );
      const request = chartSource.inputs[InputId.Input1];
      const zone = chartSource.comfortZonesByInput[InputId.Input1];
      if (!request || !zone) {
        throw new Error("Missing PMV Neutral zone calculation.");
      }

      [zone.coolEdge[0], zone.warmEdge[0]].forEach((point, index) => {
        if (!point) throw new Error("Missing PMV Neutral boundary point.");
        const targetPmv = index === 0 ? neutralZone.min : neutralZone.max;
        const evaluated = adapter.calculate({
          ...request,
          tdb: point.tdb,
          rh: point.rh,
        });
        const assignedIndex = findNumericBandIndexForValue(bands, evaluated.pmv);

        expect(evaluated.pmv).toBeCloseTo(targetPmv, 3);
        expect(assignedIndex).toBe(index + 1);
      });
    },
  );

  it("generates comfort-zone roots without cooling-effect warnings", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { chartSource } = calculateRegisteredModel(
      pmvAshraeAdapter,
      createAnalysisState(),
    );
    const zone = chartSource.comfortZonesByInput[InputId.Input1];
    if (!zone) throw new Error("Missing PMV comfort zone.");

    expect(zone.coolEdge.length).toBeGreaterThan(0);
    expect(zone.warmEdge).toHaveLength(zone.coolEdge.length);
    expect(zone.coolEdge.every(({ tdb }) => tdb >= 10 && tdb <= 40)).toBe(true);
    expect(warning).not.toHaveBeenCalled();
    warning.mockRestore();
  });

  it("stores derived psychrometric slots on chartSource", () => {
    const { chartSource } = calculateRegisteredModel(
      pmvAshraeAdapter,
      createAnalysisState(),
    );
    const derived = chartSource.derivedSlotsByInput?.[InputId.Input1];
    expect(derived?.[PhysicalQuantityId.DerivedHumidityRatio]).toBeTypeOf("number");
    expect(derived?.[PhysicalQuantityId.DewPoint]).toBeTypeOf("number");
  });

  it("reuses cached PMV results at the baseline dynamic-chart coordinate", () => {
    const toolState = createAnalysisState();
    const { result, chartSource } = calculateRegisteredModel(pmvAshraeAdapter, toolState);
    const calculateSpy = vi.spyOn(pmvAshraeAdapter, "calculate");
    try {
      const baselinePayload = chartSource.inputs[InputId.Input1];
      if (!baselinePayload) throw new Error("Missing baseline payload.");
      const descriptor = createDynamicViewDescriptor(
        pmvAshraeDeclaration,
        chartSource,
        { [InputId.Input1]: result },
        {
          baselineInputId: InputId.Input1,
          unitSystem: UnitSystem.SI,
          fieldChartConfig: {
            profileKind: FieldChartProfileKind.Explore,
            xField: PhysicalQuantityId.DryBulbTemperature,
            yField: PhysicalQuantityId.RelativeHumidity,
            zOutput: ModelOutputKey.Pmv,
            bands: pmvAshraeDeclaration.complianceProfile.bands,
          },
        },
      );
      const evaluation = descriptor.evaluatePoint(
        descriptor.getInputXSi(baselinePayload),
        descriptor.getInputYSi(baselinePayload),
      );
      expect(evaluation?.pmv).toBeCloseTo(result.pmv, 6);
      expect(calculateSpy).not.toHaveBeenCalled();
    } finally {
      calculateSpy.mockRestore();
    }
  });
});
