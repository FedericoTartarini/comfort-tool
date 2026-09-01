import { pmv_ppd, pmv_ppd_ashrae } from "jsthermalcomfort";
import { describe, expect, it, vi } from "vitest";

import { CalculationSource, ComfortStandard } from "../../catalog/calculationMetadata";
import { ModelId, JsThermalComfortStandard } from "../../catalog/modelIds";
import { PhysicalQuantityId, type QuantityState } from "../../catalog/quantities";
import { InputControlId } from "../../catalog/inputControls";
import {
  AirSpeedControlMode,
  HumidityInputMode,
  OptionKey,
  TemperatureMode,
} from "../../catalog/inputModes";
import { InputId } from "../../catalog/inputSlots";
import { ModifierId } from "../../catalog/inputModifiers";
import { findNumericBandIndexForValue } from "../../catalog/modelCapabilities";
import { ChartType } from "../../catalog/chartTypes";
import { FieldChartProfileKind } from "../../catalog/fieldChartProfile";
import { UnitSystem } from "../../catalog/units";
import { createModelCalculationContext } from "../../catalog/modelCalculation";
import { buildChartPlotly } from "../../testSupport/modelChartTestHelpers";
import { createPointSession } from "../../state/pointSession/createPointSession.svelte";
import { seedSelectedModel } from "../../testSupport/seedPointSession";
import { requiredControlIdsByModel } from "../../testSupport/requiredModelControls";
import {
  applyInputModifierChain,
  createDynamicClothingModifier,
} from "../../engines/comfort/inputModifiers";
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
  createAshraePmvComplianceCaption,
  createPmvModelConfig,
  type PmvModelDeclaration,
  type PmvStandardAdapter,
} from "./shared";
import {
  calculatePmvModel,
  derivePmvAnalysisOutputs,
  invertPpdToAbsPmv,
  ppdThresholdToAbsPmv,
  type PmvChartSource,
  type PmvRequest,
  type PmvResponse,
} from "./calculation";
import { ashraeComfortIsolineTargets } from "./zones";

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
  session: ReturnType<typeof createPointSession>,
  values: QuantityState,
): void {
  Object.assign(session.input.quantitiesByInput[InputId.Input1], values);
}

function calculateRegisteredModel(
  adapter: PmvStandardAdapter,
  session: ReturnType<typeof createPointSession>,
  effectiveQuantitiesByInput = session.input.quantitiesByInput,
): { result: PmvResponse; chartSource: PmvChartSource } {
  const calculation = calculatePmvModel(createModelCalculationContext({
    effectiveQuantitiesByInput,
    options: session.input.modelOptionsByModel[adapter.modelId],
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
  const session = createPointSession();
  const base = { ...session.input.quantitiesByInput[InputId.Input1], [PhysicalQuantityId.ClothingInsulation]: clothingSi, [PhysicalQuantityId.MetabolicRate]: metSi };
  const effective = applyInputModifierChain(
    base,
    [createDynamicClothingModifier(adapter.clothingStandard)],
    { [ModifierId.DynamicClothing]: true },
    { [ModifierId.DynamicClothing]: {} },
  );
  const { result } = calculateRegisteredModel(adapter, session, {
    ...session.input.quantitiesByInput,
    [InputId.Input1]: effective,
  });
  return {
    result,
    effectiveClo: effective[PhysicalQuantityId.ClothingInsulation] ?? NaN,
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
  it("describes ASHRAE open-interval compliance from the library edges", () => {
    const caption = createAshraePmvComplianceCaption(ashraeComfortIsolineTargets);

    expect(caption).toBe(
      "Green shading = ASHRAE 55 compliant PMV (−0.5 < PMV < +0.5); red = outside the limit.",
    );
  });

  it("registers independent ASHRAE and ISO models with declaration-owned metadata", () => {
    expect(pmvAshraeModelConfig).not.toBe(pmvIsoModelConfig);
    expect(pmvAshraeModelConfig.id).toBe(ModelId.PmvAshrae);
    expect(pmvIsoModelConfig.id).toBe(ModelId.PmvIso);
    expect(pmvAshraeModelConfig.label.length).toBeGreaterThan(0);
    expect(pmvIsoModelConfig.label.length).toBeGreaterThan(0);
    expect(pmvIsoModelConfig.description).toContain("ISO 7730");
    expect(pmvAshraeDeclaration.complianceProfile.bands)
      .not.toBe(pmvIsoDeclaration.complianceProfile.bands);
    expect(
      pmvAshraeModelConfig.chartInstances.entries.map(({ type }) => type),
    ).toEqual(
      pmvIsoModelConfig.chartInstances.entries.map(({ type }) => type),
    );
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
    const session = createPointSession();
    const { chartSource } = calculateRegisteredModel(pmvIsoAdapter, session);

    expect(chartSource.inputs[InputId.Input1]?.occupantHasAirSpeedControl)
      .toBe(false);
  });

  it.each(standardCases)(
    "$label exposes its clothing and occupant-air-speed capabilities",
    ({ adapter, config }) => {
      const session = createPointSession();
      seedSelectedModel(session, config.id);
      const controls = session.inputControls;
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

    expect(ashrae).toMatchObject(expectedAshrae);
    expect(iso).toMatchObject(expectedIso);
    expect(ashrae.pmv).not.toBe(iso.pmv);
  });

  it("keeps standard identity out of requests and chart sources", () => {
    const session = createPointSession();
    setPmvInputs(session, { [PhysicalQuantityId.DryBulbTemperature]: 26, [PhysicalQuantityId.MeanRadiantTemperature]: 26, [PhysicalQuantityId.RelativeAirSpeed]: 0.8 });
    const ashrae = calculateRegisteredModel(pmvAshraeAdapter, session);
    const iso = calculateRegisteredModel(pmvIsoAdapter, session);
    const ashraeRequest = ashrae.chartSource.inputs[InputId.Input1];

    expect(ashrae.result.standard).toBe(ComfortStandard.Ashrae55PmvPpd);
    expect(iso.result.standard).toBe(ComfortStandard.Iso7730PmvPpd);
    expect(ashrae.result.source).toBe(CalculationSource.JsThermalComfort);
    expect(iso.result.source).toBe(CalculationSource.JsThermalComfort);
    expect(Object.keys(ashrae.chartSource).sort()).toEqual([
      "comfortZonesByInput",
      "derivedSlotsByInput",
      "inputs",
      "psychrometricTrEqualsTdb",
    ]);
    expect(ashrae.chartSource.psychrometricTrEqualsTdb).toBe(false);
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
        createPointSession(),
      );
      const request = chartSource.inputs[InputId.Input1];
      if (!request) throw new Error("Missing PMV request for Input 1.");
      const expected = derivePmvAnalysisOutputs(request);

      expect(result.set).toBe(expected.set);
      expect(result.ce).toBe(expected.ce);
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

    expect(still.ce).toBe(0);
    expect(elevated.ce).toBeGreaterThan(0);
  });

  it.each(standardCases)(
    "$label Compare-matrix includes SET, cooling effect, relative air speed, and dynamic clothing",
    ({ config }) => { expect(config.tables.results.map((row) => row.label)).toEqual([
        "Compliance", "PMV", "Zone", "PPD", "Acceptability", "SET", "Cooling effect", "Relative air speed", "Dynamic clothing", ]);
      expect(config.exploreOutputs.map((output) => output.key)).toEqual([
        PhysicalQuantityId.PredictedMeanVote, PhysicalQuantityId.PredictedPercentageOfDissatisfied, ]); },
  );

  it.each(standardCases)(
    "$label registers independent ParametricLine heat-loss and SET charts",
    ({ config }) => {
      expect(config.chartInstances.defaultInstanceId)
        .toBe(ChartType.Psychrometric);
      expect(config.chartInstances.entries.map(({ instanceId, type }) => ({
        instanceId,
        type,
      }))).toEqual([
        {
          instanceId: ChartType.Psychrometric,
          type: ChartType.Psychrometric,
        },
        {
          instanceId: ChartType.Dynamic,
          type: ChartType.Dynamic,
        },
        {
          instanceId: ChartType.HeatLoss,
          type: ChartType.HeatLoss,
        },
        {
          instanceId: ChartType.Set,
          type: ChartType.Set,
        },
      ]);
    },
  );

  it.each(standardCases)(
    "$label builds heat-loss and SET charts from the calculation cache",
    ({ adapter, config, declaration }) => {
      const { chartSource } = calculateRegisteredModel(
        adapter,
        createPointSession(),
      );
      const context = {
        unitSystem: UnitSystem.SI,
        baselineInputId: InputId.Input1,
        fieldChartConfig: { profileKind: FieldChartProfileKind.Explore, xField: PhysicalQuantityId.DryBulbTemperature, yField: PhysicalQuantityId.RelativeHumidity, zOutput: PhysicalQuantityId.PredictedMeanVote, bands: declaration.exploreOutputs[0].defaultBands },
      };
      const heatLoss = buildChartPlotly(
        config,
        ChartType.HeatLoss,
        chartSource,
        emptyPmvResults(),
        context,
      );
      const set = buildChartPlotly(
        config,
        ChartType.Set,
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
        calculate: () => ({ pmv: Number.NaN, ppd: Number.NaN, tsv: Number.NaN }),
    };

    expect(() => calculateRegisteredModel(adapter, createPointSession()))
      .toThrow(/PMV.*non-finite/i);
  });

  it("inverts PPD 10% to the Explore |PMV| contour", () => {
    expect(invertPpdToAbsPmv(10)).toBeCloseTo(0.5, 1);
    expect(ppdThresholdToAbsPmv(10)).toBe(0.5);
  });

  it.each(standardCases)(
    "$label brackets and bisects ordinary PMV comfort-zone roots",
    ({ adapter }) => {
      const { chartSource } = calculateRegisteredModel(
        adapter,
        createPointSession(),
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
        tsv: Number.NaN,
      }),
    };
    const { chartSource } = calculateRegisteredModel(
      adapter,
      createPointSession(),
    );
    const coolEdge = chartSource.comfortZonesByInput[InputId.Input1]?.coolEdge ?? [];

    expect(coolEdge.some(({ tdb }) => Math.abs(tdb - 10.25) <= 5e-4)).toBe(true);
  });

  it("omits comfort-zone points when the drawable range contains no roots", () => {
    const adapter: PmvStandardAdapter = {
      ...pmvAshraeAdapter,
      calculate: () => ({ pmv: 1, ppd: 0, tsv: Number.NaN }),
    };
    const { chartSource } = calculateRegisteredModel(
      adapter,
      createPointSession(),
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
        "dynamic",
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
          psychrometricTrEqualsTdb: false,
        },
        emptyPmvResults(),
        {
          unitSystem: UnitSystem.SI,
          baselineInputId: InputId.Input1,
          fieldChartConfig: { profileKind: FieldChartProfileKind.Explore, xField: PhysicalQuantityId.DryBulbTemperature, yField: PhysicalQuantityId.RelativeHumidity, zOutput: PhysicalQuantityId.PredictedMeanVote, bands: declaration.exploreOutputs[0].defaultBands },
        },
      );
    };

    expect(buildChart(knownFailureAdapter)).not.toBeNull();
    expect(() => createPmvModelConfig({
      ...pmvAshraeDeclaration,
      adapter: unexpectedFailureAdapter,
    }).calculate(
      createModelCalculationContext({
        effectiveQuantitiesByInput: createPointSession().input.quantitiesByInput,
        options: createPointSession().input.modelOptionsByModel[ModelId.PmvAshrae],
      }),
      [InputId.Input1],
    )).toThrow("broken adapter");
  });

  it("ASHRAE keeps ±0.5 outside the open compliance interval", () => {
    expect(pmvAshraeAdapter.isAcceptablePmv(-0.5)).toBe(false);
    expect(pmvAshraeAdapter.isAcceptablePmv(0.5)).toBe(false);
    expect(pmvAshraeAdapter.isAcceptablePmv(0)).toBe(true);
    expect(pmvAshraeAdapter.classifyTsv(-0.5)).toBe("Slightly Cool");
    expect(pmvAshraeAdapter.classifyTsv(0.5)).toBe("Neutral");
  });

  it("ISO TSV is left-closed at the Neutral edges", () => {
    expect(pmvIsoAdapter.classifyTsv(-0.5)).toBe("Neutral");
    expect(pmvIsoAdapter.classifyTsv(0.5)).toBe("Slightly Warm");
    expect(pmvIsoAdapter.isAcceptablePmv(-0.5)).toBe(true);
    expect(pmvIsoAdapter.isAcceptablePmv(0.5)).toBe(false);
  });

  it("ASHRAE comfort-zone roots sit on the open compliance edges", () => {
    const bands = pmvAshraeDeclaration.complianceProfile.bands;
    const { chartSource } = calculateRegisteredModel(
      pmvAshraeAdapter,
      createPointSession(),
    );
    const request = chartSource.inputs[InputId.Input1];
    const zone = chartSource.comfortZonesByInput[InputId.Input1];
    if (!request || !zone) {
      throw new Error("Missing PMV Neutral zone calculation.");
    }

    [zone.coolEdge[0], zone.warmEdge[0]].forEach((point, index) => {
      if (!point) throw new Error("Missing PMV Neutral boundary point.");
      const targetPmv = index === 0
        ? pmvAshraeAdapter.comfortIsolineTargets[0]
        : pmvAshraeAdapter.comfortIsolineTargets[1];
      const evaluated = pmvAshraeAdapter.calculate({
        ...request,
        tdb: point.tdb,
        rh: point.rh,
      });
      const assignedIndex = findNumericBandIndexForValue(bands, evaluated.pmv);

      expect(evaluated.pmv).toBeCloseTo(targetPmv, 3);
      expect(assignedIndex).toBe(index === 0 ? 0 : bands.length - 1);
    });
  });

  it("ISO comfort-zone roots follow Neutral TSV edges", () => {
    const bands = pmvIsoDeclaration.complianceProfile.bands;
    const { chartSource } = calculateRegisteredModel(
      pmvIsoAdapter,
      createPointSession(),
    );
    const request = chartSource.inputs[InputId.Input1];
    const zone = chartSource.comfortZonesByInput[InputId.Input1];
    if (!request || !zone) {
      throw new Error("Missing ISO TSV Neutral zone calculation.");
    }

    const coolPoint = zone.coolEdge[0];
    const warmPoint = zone.warmEdge[0];
    if (!coolPoint || !warmPoint) {
      throw new Error("Missing ISO Neutral boundary point.");
    }
    const coolPmv = pmvIsoAdapter.calculate({
      ...request,
      tdb: coolPoint.tdb,
      rh: coolPoint.rh,
    }).pmv;
    const warmPmv = pmvIsoAdapter.calculate({
      ...request,
      tdb: warmPoint.tdb,
      rh: warmPoint.rh,
    }).pmv;

    expect(coolPmv).toBeCloseTo(pmvIsoAdapter.comfortIsolineTargets[0], 3);
    expect(warmPmv).toBeCloseTo(pmvIsoAdapter.comfortIsolineTargets[1], 3);
    expect(findNumericBandIndexForValue(bands, -0.5)).toBe(
      bands.findIndex((band) => band.label === "Neutral"),
    );
    expect(findNumericBandIndexForValue(bands, 0.5)).toBe(
      bands.findIndex((band) => band.label === "Slightly Warm"),
    );
  });

  it("generates comfort-zone roots without cooling-effect warnings", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { chartSource } = calculateRegisteredModel(
      pmvAshraeAdapter,
      createPointSession(),
    );
    const zone = chartSource.comfortZonesByInput[InputId.Input1];
    if (!zone) throw new Error("Missing PMV comfort zone.");

    expect(zone.coolEdge.length).toBeGreaterThan(0);
    expect(zone.warmEdge).toHaveLength(zone.coolEdge.length);
    expect(zone.coolEdge.every(({ tdb }) => tdb >= 10 && tdb <= 40)).toBe(true);
    expect(warning).not.toHaveBeenCalled();
    warning.mockRestore();
  });

  it("evaluates Operative comfort-zone roots with tr equal to tdb", () => {
    const session = createPointSession();
    session.input.modelOptionsByModel[ModelId.PmvAshrae] = {
      ...session.input.modelOptionsByModel[ModelId.PmvAshrae],
      [OptionKey.TemperatureMode]: TemperatureMode.Operative,
    };
    setPmvInputs(session, { [PhysicalQuantityId.DryBulbTemperature]: 25, [PhysicalQuantityId.MeanRadiantTemperature]: 25 });
    const { chartSource } = calculateRegisteredModel(pmvAshraeAdapter, session);
    const request = chartSource.inputs[InputId.Input1];
    const zone = chartSource.comfortZonesByInput[InputId.Input1];
    const warmPoint = zone?.warmEdge.find(({ rh }) => rh === 50);
    if (!request || !warmPoint) throw new Error("Missing Operative warm-edge root.");

    const psychtop = pmvAshraeAdapter.calculate({
      ...request,
      tdb: warmPoint.tdb,
      tr: warmPoint.tdb,
      rh: warmPoint.rh,
    });
    const fixedTr = pmvAshraeAdapter.calculate({
      ...request,
      tdb: warmPoint.tdb,
      rh: warmPoint.rh,
    });

    expect(chartSource.psychrometricTrEqualsTdb).toBe(true);
    expect(Math.abs(psychtop.pmv - 0.5)).toBeLessThanOrEqual(5e-4);
    expect(Math.abs(warmPoint.tdb - request.tr)).toBeGreaterThan(0.05);
    expect(Math.abs(fixedTr.pmv - 0.5)).toBeGreaterThan(5e-4);
  });

  it("stores derived psychrometric slots on chartSource", () => {
    const { chartSource } = calculateRegisteredModel(
      pmvAshraeAdapter,
      createPointSession(),
    );
    const derived = chartSource.derivedSlotsByInput?.[InputId.Input1];
    expect(derived?.[PhysicalQuantityId.HumidityRatio]).toBeTypeOf("number");
    expect(derived?.[PhysicalQuantityId.DewPointTemperature]).toBeTypeOf("number");
  });

  it("reuses cached PMV results when building the Dynamic chart", () => {
    const session = createPointSession();
    const { result, chartSource } = calculateRegisteredModel(pmvAshraeAdapter, session);
    const chart = buildChartPlotly(
      pmvAshraeModelConfig,
      ChartType.Dynamic,
      chartSource,
      {
        [InputId.Input1]: result,
        [InputId.Input2]: null,
        [InputId.Input3]: null,
      },
      {
        baselineInputId: InputId.Input1,
        unitSystem: UnitSystem.SI,
        fieldChartConfig: {
          profileKind: FieldChartProfileKind.Explore,
          xField: PhysicalQuantityId.DryBulbTemperature,
          yField: PhysicalQuantityId.RelativeHumidity,
          zOutput: PhysicalQuantityId.PredictedMeanVote,
          bands: pmvAshraeDeclaration.complianceProfile.bands,
        },
      },
    );
    expect(chart?.payload).not.toBeNull();
  });
});
