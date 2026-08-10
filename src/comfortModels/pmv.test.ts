import { pmv_ppd, pmv_ppd_ashrae } from "jsthermalcomfort";
import { describe, expect, it, vi } from "vitest";

import { CalculationSource, ComfortStandard } from "../models/calculationMetadata";
import { ChartId } from "../models/chartOptions";
import { ComfortModel, JsThermalComfortStandard } from "../models/comfortModels";
import { FieldKey, type FieldKey as FieldKeyType } from "../models/fieldKeys";
import { InputControlId } from "../models/inputControls";
import { OptionKey } from "../models/inputModes";
import { InputId } from "../models/inputSlots";
import {
  ChartMode,
  findNumericBandIndexForValue,
  ModelOutputKey,
} from "../models/modelCapabilities";
import { UnitSystem } from "../models/units";
import { createComfortToolState } from "../state/comfortTool/createComfortToolState.svelte";
import {
  pmvAshraeAdapter,
  pmvAshraeDeclaration,
  pmvAshraeModelConfig,
} from "./pmvAshrae";
import {
  pmvIsoAdapter,
  pmvIsoDeclaration,
  pmvIsoModelConfig,
} from "./pmvIso";
import {
  createPmvComplianceCaption,
  createPmvModelConfig,
  type PmvChartSourceDto,
  type PmvModelDeclaration,
  type PmvRequestDto,
  type PmvResponseDto,
  type PmvStandardAdapter,
} from "./pmvShared";

const baseRequest: PmvRequestDto = {
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
  toolState: ReturnType<typeof createComfortToolState>,
  values: Partial<Record<FieldKeyType, number>>,
): void {
  Object.entries(values).forEach(([fieldKey, value]) => {
    toolState.state.inputsByInput[InputId.Input1][fieldKey as FieldKeyType] = value;
  });
}

function calculateRegisteredModel(
  config: ReturnType<typeof createPmvModelConfig>,
  toolState: ReturnType<typeof createComfortToolState>,
): { result: PmvResponseDto; chartSource: PmvChartSourceDto } {
  const calculation = config.calculate({
    inputsByInput: toolState.state.inputsByInput,
    modelOptionsByModel: toolState.state.ui.modelOptionsByModel,
  }, [InputId.Input1]);
  const result = calculation.resultsByInput[InputId.Input1];
  if (!result) throw new Error("Expected a PMV result for Input 1.");
  return { result, chartSource: calculation.chartSource };
}

function emptyPmvResults(): Record<InputId, PmvResponseDto | null> {
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
    expect(pmvAshraeModelConfig.id).toBe(ComfortModel.PmvAshrae);
    expect(pmvIsoModelConfig.id).toBe(ComfortModel.PmvIso);
    expect(pmvAshraeModelConfig.label).toBe(pmvAshraeDeclaration.label);
    expect(pmvIsoModelConfig.label).toBe(pmvIsoDeclaration.label);
    expect(pmvIsoModelConfig.description).toContain("ISO 7730 Category B");
    expect(pmvAshraeDeclaration.complianceSpec.bands)
      .not.toBe(pmvIsoDeclaration.complianceSpec.bands);
  });

  it.each(standardCases)(
    "$label exposes its clothing and occupant-air-speed capabilities",
    ({ adapter, config }) => {
      const toolState = createComfortToolState();
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
    const toolState = createComfortToolState();
    setPmvInputs(toolState, {
      [FieldKey.DryBulbTemperature]: 26,
      [FieldKey.MeanRadiantTemperature]: 26,
      [FieldKey.RelativeAirSpeed]: 0.8,
    });
    const ashrae = calculateRegisteredModel(pmvAshraeModelConfig, toolState);
    const iso = calculateRegisteredModel(pmvIsoModelConfig, toolState);
    const ashraeRequest = ashrae.chartSource.inputs[InputId.Input1];

    expect(ashrae.result.standard).toBe(ComfortStandard.Ashrae55PmvPpd);
    expect(iso.result.standard).toBe(ComfortStandard.Iso7730PmvPpd);
    expect(ashrae.result.source).toBe(CalculationSource.JsThermalComfort);
    expect(iso.result.source).toBe(CalculationSource.JsThermalComfort);
    expect(Object.keys(ashrae.chartSource).sort()).toEqual([
      "comfortZonesByInput",
      "inputs",
    ]);
    expect(ashraeRequest).not.toHaveProperty("units");
    expect(ashraeRequest).not.toHaveProperty("standard");
    expect(ashrae.chartSource).not.toHaveProperty("modelId");
    expect(ashrae.result.pmv).not.toBe(iso.result.pmv);
  });
});

describe("PMV roots and compliance", () => {
  it("rejects non-finite PMV values instead of assigning Neutral", () => {
    const config = createPmvModelConfig({
      ...pmvAshraeDeclaration,
      adapter: {
        ...pmvAshraeAdapter,
        calculate: () => ({ pmv: Number.NaN, ppd: Number.NaN }),
      },
    });

    expect(() => calculateRegisteredModel(config, createComfortToolState()))
      .toThrow(/PMV.*non-finite/i);
  });

  it.each(standardCases)(
    "$label brackets and bisects ordinary PMV comfort-zone roots",
    ({ adapter, config }) => {
      const { chartSource } = calculateRegisteredModel(
        config,
        createComfortToolState(),
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
    const config = createPmvModelConfig({ ...pmvAshraeDeclaration, adapter });
    const { chartSource } = calculateRegisteredModel(
      config,
      createComfortToolState(),
    );
    const coolEdge = chartSource.comfortZonesByInput[InputId.Input1]?.coolEdge ?? [];

    expect(coolEdge.some(({ tdb }) => Math.abs(tdb - 10.25) <= 5e-4)).toBe(true);
  });

  it("omits comfort-zone points when the drawable range contains no roots", () => {
    const adapter: PmvStandardAdapter = {
      ...pmvAshraeAdapter,
      calculate: () => ({ pmv: 1, ppd: 0 }),
    };
    const config = createPmvModelConfig({ ...pmvAshraeDeclaration, adapter });
    const { chartSource } = calculateRegisteredModel(
      config,
      createComfortToolState(),
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
      return config.buildChartResult(
        ChartId.PmvDynamic,
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
            mode: ChartMode.Explore,
            xField: FieldKey.DryBulbTemperature,
            yField: FieldKey.RelativeHumidity,
            zOutput: ModelOutputKey.Pmv,
            bands: declaration.chartableOutputs[0].defaultBands,
          },
        },
      );
    };

    expect(buildChart(knownFailureAdapter)).not.toBeNull();
    expect(() => buildChart(unexpectedFailureAdapter))
      .toThrow("broken adapter");
  });

  it.each(standardCases)(
    "$label assigns neutral boundaries with half-open semantics",
    ({ adapter, config }) => {
      const neutralZone = config.zones.find(({ label }) => label === "Neutral");
      const bands = config.complianceSpec!.bands;
      const { chartSource } = calculateRegisteredModel(
        config,
        createComfortToolState(),
      );
      const request = chartSource.inputs[InputId.Input1];
      const zone = chartSource.comfortZonesByInput[InputId.Input1];
      if (!neutralZone || !request || !zone) {
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
      pmvAshraeModelConfig,
      createComfortToolState(),
    );
    const zone = chartSource.comfortZonesByInput[InputId.Input1];
    if (!zone) throw new Error("Missing PMV comfort zone.");

    expect(zone.coolEdge.length).toBeGreaterThan(0);
    expect(zone.warmEdge).toHaveLength(zone.coolEdge.length);
    expect(zone.coolEdge.every(({ tdb }) => tdb >= 10 && tdb <= 40)).toBe(true);
    expect(warning).not.toHaveBeenCalled();
    warning.mockRestore();
  });
});
