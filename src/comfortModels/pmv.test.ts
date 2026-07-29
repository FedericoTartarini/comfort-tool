import { describe, expect, it } from "vitest";
import { pmv_ppd, pmv_ppd_ashrae } from "jsthermalcomfort";

import { CalculationSource, ComfortStandard } from "../models/calculationMetadata";
import { ChartId } from "../models/chartOptions";
import { ComfortModel, JsThermalComfortStandard } from "../models/comfortModels";
import { FieldKey } from "../models/fieldKeys";
import { InputControlId } from "../models/inputControls";
import { AirSpeedControlMode, OptionKey } from "../models/inputModes";
import { InputId } from "../models/inputSlots";
import {
  ChartMode,
  findBandForValue,
  ModelOutputKey,
  type InputsSi,
} from "../models/modelCapabilities";
import { UnitSystem } from "../models/units";
import { createComfortToolState } from "../state/comfortTool/createComfortToolState.svelte";
import { pmvAshraeAdapter, pmvAshraeModelConfig } from "./pmvAshrae";
import { pmvIsoAdapter, pmvIsoModelConfig } from "./pmvIso";
import {
  buildComparePsychrometricChart,
  calculateComfortZone,
  pmvZonesList,
  solveDryBulbForTargetPmv,
  type PmvChartSourceDto,
  type PmvResponseDto,
} from "./pmvShared";

function setPmvInputs(
  toolState: ReturnType<typeof createComfortToolState>,
  values: Partial<Record<(typeof FieldKey)[keyof typeof FieldKey], number>>,
) {
  Object.entries(values).forEach(([fieldKey, value]) => {
    toolState.state.inputsByInput[InputId.Input1][fieldKey as FieldKey] = value;
  });
}

function calculatePmvModel(
  config: typeof pmvAshraeModelConfig | typeof pmvIsoModelConfig,
  toolState: ReturnType<typeof createComfortToolState>,
) {
  const calculation = config.calculate(toolState.state, [InputId.Input1]);
  return {
    result: calculation.resultsByInput[InputId.Input1] as PmvResponseDto,
    chartSource: calculation.chartSource as PmvChartSourceDto,
  };
}

const pmvNeutralZone = pmvZonesList[3];
const pmvComplianceCases = [
  { targetPmv: pmvNeutralZone.min - 0.01, expectedCompliance: false },
  { targetPmv: pmvNeutralZone.min, expectedCompliance: true },
  { targetPmv: pmvNeutralZone.min + 0.01, expectedCompliance: true },
  { targetPmv: 0, expectedCompliance: true },
  { targetPmv: pmvNeutralZone.max - 0.01, expectedCompliance: true },
  { targetPmv: pmvNeutralZone.max, expectedCompliance: false },
  { targetPmv: pmvNeutralZone.max + 0.01, expectedCompliance: false },
] as const;

const pmvStandardCases = [
  {
    label: "ASHRAE",
    adapter: pmvAshraeAdapter,
    config: pmvAshraeModelConfig,
  },
  {
    label: "ISO",
    adapter: pmvIsoAdapter,
    config: pmvIsoModelConfig,
  },
] as const;

describe("PMV standard model configurations", () => {
  it("registers distinct ASHRAE and ISO definitions and calculation sources", () => {
    expect(pmvAshraeModelConfig).not.toBe(pmvIsoModelConfig);
    expect(pmvAshraeModelConfig.id).toBe(ComfortModel.PmvAshrae);
    expect(pmvIsoModelConfig.id).toBe(ComfortModel.PmvIso);
    expect(pmvAshraeModelConfig.label).toContain("ASHRAE");
    expect(pmvIsoModelConfig.label).toContain("ISO");
  });

  it.each([
    {
      label: "ASHRAE",
      adapter: pmvAshraeAdapter,
      config: pmvAshraeModelConfig,
      maxClothingInsulation: 1.5,
      supportsOccupantAirSpeedControl: true,
    },
    {
      label: "ISO",
      adapter: pmvIsoAdapter,
      config: pmvIsoModelConfig,
      maxClothingInsulation: 2,
      supportsOccupantAirSpeedControl: false,
    },
  ])(
    "$label declares its clothing limit and occupant-control capability",
    ({ adapter, config, maxClothingInsulation, supportsOccupantAirSpeedControl }) => {
      const toolState = createComfortToolState();
      toolState.state.ui.selectedModel = config.id;
      const controls = toolState.selectors.getInputControls();
      const clothingControl = controls.find(
        (control) => control.id === InputControlId.ClothingInsulation,
      );
      const airSpeedControl = controls.find(
        (control) => control.id === InputControlId.AirSpeed,
      );
      const airSpeedOptionKeys = airSpeedControl?.menu?.sections.flatMap(
        (section) => section.items.map((item) => item.optionKey),
      ) ?? [];

      expect(adapter.clothingInsulationMaxSi).toBe(maxClothingInsulation);
      expect(clothingControl?.maxValue).toBe(maxClothingInsulation);
      expect(adapter.supportsOccupantAirSpeedControl)
        .toBe(supportsOccupantAirSpeedControl);
      expect(airSpeedOptionKeys.includes(OptionKey.AirSpeedControlMode))
        .toBe(supportsOccupantAirSpeedControl);
      expect(config.optionHandlersByKey[OptionKey.AirSpeedControlMode] !== undefined)
        .toBe(supportsOccupantAirSpeedControl);
    },
  );

  it.each(pmvStandardCases)(
    "$label accepts its inclusive clothing limit and rejects values above it",
    ({ adapter }) => {
      const request = {
        tdb: 25,
        tr: 25,
        vr: 0.1,
        rh: 50,
        met: 1.2,
        clo: adapter.clothingInsulationMaxSi,
        wme: 0,
        occupantHasAirSpeedControl: adapter.supportsOccupantAirSpeedControl,
        standard: adapter.calculationStandard,
        units: UnitSystem.SI,
      };

      expect(adapter.checkApplicability(request)).toEqual([]);
      expect(adapter.checkApplicability({
        ...request,
        clo: adapter.clothingInsulationMaxSi + 0.0001,
      })).not.toEqual([]);
    },
  );

  it.each(pmvStandardCases)(
    "$label rejects dynamic axes that write the same PMV request fields",
    ({ config }) => {
      const validate = config.dynamicAxisPairValidator;

      expect(validate?.(
        FieldKey.OperativeTemperature,
        FieldKey.DryBulbTemperature,
      )).toBe(false);
      expect(validate?.(
        FieldKey.DryBulbTemperature,
        FieldKey.OperativeTemperature,
      )).toBe(false);
      expect(validate?.(
        FieldKey.OperativeTemperature,
        FieldKey.MeanRadiantTemperature,
      )).toBe(false);
      expect(validate?.(
        FieldKey.MeanRadiantTemperature,
        FieldKey.OperativeTemperature,
      )).toBe(false);
      expect(validate?.(
        FieldKey.DryBulbTemperature,
        FieldKey.MeanRadiantTemperature,
      )).toBe(true);
      expect(validate?.(
        FieldKey.OperativeTemperature,
        FieldKey.RelativeHumidity,
      )).toBe(true);
    },
  );

  it("uses different PMV implementations at elevated air speed", () => {
    const toolState = createComfortToolState();
    setPmvInputs(toolState, {
      [FieldKey.DryBulbTemperature]: 26,
      [FieldKey.MeanRadiantTemperature]: 26,
      [FieldKey.RelativeAirSpeed]: 0.8,
      [FieldKey.RelativeHumidity]: 50,
      [FieldKey.MetabolicRate]: 1.2,
      [FieldKey.ClothingInsulation]: 0.5,
      [FieldKey.ExternalWork]: 0,
    });

    const ashrae = calculatePmvModel(pmvAshraeModelConfig, toolState);
    const iso = calculatePmvModel(pmvIsoModelConfig, toolState);

    expect(ashrae.result.pmv).toBe(-0.65);
    expect(ashrae.result.ppd).toBe(13.8);
    expect(iso.result.pmv).toBe(-0.42);
    expect(iso.result.ppd).toBe(8.7);
    expect(ashrae.result.standard).toBe(ComfortStandard.Ashrae55PmvPpd);
    expect(iso.result.standard).toBe(ComfortStandard.Iso7730PmvPpd);
    expect(ashrae.result.source).toBe(CalculationSource.JsThermalComfort);
    expect(iso.result.source).toBe(CalculationSource.JsThermalComfort);
    expect(ashrae.chartSource.modelId).toBe(ComfortModel.PmvAshrae);
    expect(iso.chartSource.modelId).toBe(ComfortModel.PmvIso);
    expect(ashrae.chartSource.chartRequest.inputs[InputId.Input1]?.standard)
      .toBe(JsThermalComfortStandard.ASHRAE);
    expect(iso.chartSource.chartRequest.inputs[InputId.Input1]?.standard)
      .toBe(JsThermalComfortStandard.ISO);
    expect(ashrae.chartSource.comfortZonesByInput[InputId.Input1])
      .not.toEqual(iso.chartSource.comfortZonesByInput[InputId.Input1]);
  });

  it("preserves the existing ASHRAE result path", () => {
    const toolState = createComfortToolState();
    setPmvInputs(toolState, {
      [FieldKey.DryBulbTemperature]: 26,
      [FieldKey.MeanRadiantTemperature]: 26,
      [FieldKey.RelativeAirSpeed]: 0.8,
      [FieldKey.RelativeHumidity]: 50,
      [FieldKey.MetabolicRate]: 1.2,
      [FieldKey.ClothingInsulation]: 0.5,
      [FieldKey.ExternalWork]: 0,
    });

    const actual = calculatePmvModel(pmvAshraeModelConfig, toolState).result;
    const expected = pmv_ppd_ashrae(26, 26, 0.8, 50, 1.2, 0.5, 0, {
      units: UnitSystem.SI,
      limit_inputs: false,
      airspeed_control: true,
    });

    expect(actual).toEqual(expect.objectContaining(expected));
  });

  it("uses the ISO 7730 PMV implementation", () => {
    const toolState = createComfortToolState();
    setPmvInputs(toolState, {
      [FieldKey.DryBulbTemperature]: 26,
      [FieldKey.MeanRadiantTemperature]: 26,
      [FieldKey.RelativeAirSpeed]: 0.8,
      [FieldKey.RelativeHumidity]: 50,
      [FieldKey.MetabolicRate]: 1.2,
      [FieldKey.ClothingInsulation]: 0.5,
      [FieldKey.ExternalWork]: 0,
    });

    const actual = calculatePmvModel(pmvIsoModelConfig, toolState).result;
    const expected = pmv_ppd(26, 26, 0.8, 50, 1.2, 0.5, 0, JsThermalComfortStandard.ISO, {
      units: UnitSystem.SI,
      limit_inputs: false,
    });

    expect(actual).toEqual(expect.objectContaining(expected));
  });

  it("uses standard-specific applicability and ignores occupant control for ISO", () => {
    const toolState = createComfortToolState();
    setPmvInputs(toolState, {
      [FieldKey.DryBulbTemperature]: 24,
      [FieldKey.MeanRadiantTemperature]: 24,
      [FieldKey.RelativeAirSpeed]: 0.4,
      [FieldKey.MetabolicRate]: 1.29,
      [FieldKey.ClothingInsulation]: 0.69,
    });
    toolState.state.ui.modelOptionsByModel[ComfortModel.PmvAshrae][OptionKey.AirSpeedControlMode] =
      AirSpeedControlMode.NoLocalControl;
    toolState.state.ui.modelOptionsByModel[ComfortModel.PmvIso][OptionKey.AirSpeedControlMode] =
      AirSpeedControlMode.NoLocalControl;

    const ashraeWithoutControl = calculatePmvModel(pmvAshraeModelConfig, toolState).result;
    const isoWithoutControl = calculatePmvModel(pmvIsoModelConfig, toolState).result;

    toolState.state.ui.modelOptionsByModel[ComfortModel.PmvIso][OptionKey.AirSpeedControlMode] =
      AirSpeedControlMode.WithLocalControl;
    const isoWithControl = calculatePmvModel(pmvIsoModelConfig, toolState);

    expect(ashraeWithoutControl.pmv).toBeGreaterThanOrEqual(pmvZonesList[3].min);
    expect(ashraeWithoutControl.pmv).toBeLessThan(pmvZonesList[3].max);
    expect(ashraeWithoutControl.isCompliant).toBe(false);
    expect(isoWithoutControl.isCompliant).toBe(true);
    expect(isoWithControl.result).toEqual(isoWithoutControl);
    expect(
      isoWithControl.chartSource.chartRequest.inputs[InputId.Input1]
        ?.occupantHasAirSpeedControl,
    ).toBe(false);
  });

  it.each(pmvStandardCases)(
    "$label applies half-open PMV compliance boundaries consistently",
    ({ label, adapter, config }) => {
      pmvComplianceCases.forEach(({ targetPmv, expectedCompliance }) => {
        const request = {
          tdb: 25,
          tr: 25,
          vr: 0.1,
          rh: 50,
          met: 1.2,
          clo: 0.5,
          wme: 0,
          occupantHasAirSpeedControl: true,
          standard: adapter.calculationStandard,
          units: UnitSystem.SI,
        };
        const root = solveDryBulbForTargetPmv(adapter, targetPmv, request.rh, request);

        expect(root, `${label} should solve PMV ${targetPmv}`).not.toBeNull();
        if (root === null) {
          throw new Error(`${label} could not solve PMV ${targetPmv}.`);
        }

        const evaluatedRequest = { ...request, tdb: root };
        expect(
          adapter.checkApplicability(evaluatedRequest),
          `${label} PMV ${targetPmv} should use applicable inputs`,
        ).toEqual([]);

        const toolState = createComfortToolState();
        setPmvInputs(toolState, {
          [FieldKey.DryBulbTemperature]: root,
          [FieldKey.MeanRadiantTemperature]: request.tr,
          [FieldKey.RelativeAirSpeed]: request.vr,
          [FieldKey.RelativeHumidity]: request.rh,
          [FieldKey.MetabolicRate]: request.met,
          [FieldKey.ClothingInsulation]: request.clo,
          [FieldKey.ExternalWork]: request.wme,
        });
        const result = calculatePmvModel(config, toolState).result;
        const inputsSi: InputsSi = toolState.state.inputsByInput[InputId.Input1];
        const complianceBands = config.complianceSpec!.bands;
        const assignedBand = findBandForValue(
          complianceBands,
          result.pmv,
          root,
          inputsSi,
        );

        expect(result.pmv, `${label} should return PMV ${targetPmv}`)
          .toBeCloseTo(targetPmv, 10);
        expect(
          result.isCompliant,
          `${label} PMV ${targetPmv} compliance`,
        ).toBe(expectedCompliance);
        expect(
          result.isCompliant,
          `${label} PMV ${targetPmv} result and declarative band assignment`,
        ).toBe(assignedBand === complianceBands[1]);
      });
    },
  );

  it("uses the standard-specific model label for generated charts", () => {
    const toolState = createComfortToolState();
    setPmvInputs(toolState, {
      [FieldKey.DryBulbTemperature]: 26,
      [FieldKey.MeanRadiantTemperature]: 26,
      [FieldKey.RelativeAirSpeed]: 0.8,
      [FieldKey.RelativeHumidity]: 50,
      [FieldKey.MetabolicRate]: 1.2,
      [FieldKey.ClothingInsulation]: 0.5,
      [FieldKey.ExternalWork]: 0,
    });
    const ashrae = calculatePmvModel(pmvAshraeModelConfig, toolState);
    const iso = calculatePmvModel(pmvIsoModelConfig, toolState);

    const ashraeChart = pmvAshraeModelConfig.buildChartResult(
      ChartId.Psychrometric,
      ashrae.chartSource,
      { input1: ashrae.result, input2: null, input3: null },
      UnitSystem.SI,
    );
    const isoChart = pmvIsoModelConfig.buildChartResult(
      ChartId.Psychrometric,
      iso.chartSource,
      { input1: iso.result, input2: null, input3: null },
      UnitSystem.SI,
    );

    expect(String(ashraeChart?.layout.title)).toContain("ASHRAE");
    expect(String(isoChart?.layout.title)).toContain("ISO");
    expect(ashraeChart?.traces[0].z?.[25]?.[25]).not.toBe(isoChart?.traces[0].z?.[25]?.[25]);
  });

  it("uses the selected standard for dynamic operative-temperature coordinates", () => {
    const toolState = createComfortToolState();
    setPmvInputs(toolState, {
      [FieldKey.DryBulbTemperature]: 20,
      [FieldKey.MeanRadiantTemperature]: 30,
      [FieldKey.RelativeAirSpeed]: 0.8,
    });
    toolState.state.ui.dynamicXAxis = FieldKey.OperativeTemperature;
    toolState.state.ui.dynamicYAxis = FieldKey.RelativeHumidity;

    const ashrae = calculatePmvModel(pmvAshraeModelConfig, toolState);
    const iso = calculatePmvModel(pmvIsoModelConfig, toolState);
    const resultsByInput = { input1: null, input2: null, input3: null };
    const ashraeChart = pmvAshraeModelConfig.buildChartResult(
      ChartId.PmvDynamic,
      ashrae.chartSource,
      resultsByInput,
      UnitSystem.SI,
      {
        mode: ChartMode.Explore,
        xField: FieldKey.OperativeTemperature,
        yField: FieldKey.RelativeHumidity,
        zOutput: ModelOutputKey.Pmv,
        bands: pmvAshraeModelConfig.chartableOutputs[0].defaultBands,
      },
    );
    const isoChart = pmvIsoModelConfig.buildChartResult(
      ChartId.PmvDynamic,
      iso.chartSource,
      resultsByInput,
      UnitSystem.SI,
      {
        mode: ChartMode.Explore,
        xField: FieldKey.OperativeTemperature,
        yField: FieldKey.RelativeHumidity,
        zOutput: ModelOutputKey.Pmv,
        bands: pmvIsoModelConfig.chartableOutputs[0].defaultBands,
      },
    );
    const getInputX = (chart: typeof ashraeChart) => chart?.traces
      .find((trace) => trace.type === "scatter" && trace.name === "Input 1")?.x?.[0];

    expect(getInputX(ashraeChart)).toBe(23);
    expect(getInputX(isoChart)).toBeCloseTo(22.612, 3);
  });

  it("rejects mismatched standard adapters, requests, and chart sources", () => {
    const ashraeRequest = {
      tdb: 25,
      tr: 25,
      vr: 0.1,
      rh: 50,
      met: 1.2,
      clo: 0.5,
      wme: 0,
      occupantHasAirSpeedControl: true,
      standard: JsThermalComfortStandard.ASHRAE,
      units: UnitSystem.SI,
      rhMin: 0,
      rhMax: 100,
      rhPoints: 3,
    };

    expect(() => calculateComfortZone(pmvIsoAdapter, ashraeRequest))
      .toThrow(/cannot evaluate/i);

    const toolState = createComfortToolState();
    const ashrae = calculatePmvModel(pmvAshraeModelConfig, toolState);

    expect(() => buildComparePsychrometricChart(pmvIsoAdapter, ashrae.chartSource))
      .toThrow(/cannot build a chart/i);

    const wrongStandardSource: PmvChartSourceDto = {
      ...ashrae.chartSource,
      chartRequest: {
        ...ashrae.chartSource.chartRequest,
        inputs: {
          ...ashrae.chartSource.chartRequest.inputs,
          [InputId.Input1]: {
            ...ashrae.chartSource.chartRequest.inputs[InputId.Input1]!,
            standard: JsThermalComfortStandard.ISO,
          },
        },
      },
    };

    expect(() => buildComparePsychrometricChart(pmvAshraeAdapter, wrongStandardSource))
      .toThrow(/cannot evaluate/i);
  });
});
