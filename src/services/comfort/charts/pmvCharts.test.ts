import { FieldChartProfileKind } from "../../../models/output/fieldChartProfile";
import { describe, expect, it } from "vitest";

import {
  pmvAshraeAdapter,
  pmvAshraeDeclaration,
} from "../../../comfortModels/pmv/pmvAshrae";
import {
  pmvIsoDeclaration,
} from "../../../comfortModels/pmv/pmvIso";
import {
  createPmvModelConfig,
  type PmvModelDeclaration,
  type PmvStandardAdapter,
} from "../../../comfortModels/pmv/pmvShared";
import {
  calculatePmvModel,
  pmvZonesList,
  type ComfortZoneRequestDto,
  type PmvChartSourceDto,
  type PmvResponseDto,
} from "../../../comfortModels/pmv/pmvCalculation";
import { createModelCalculationContext } from "../../../models/modelCalculation";
import { PhysicalQuantityId, type ChartAxisQuantityId } from "../../../models/physicalQuantities";
import {
  AirSpeedControlMode,
  OptionKey,
  TemperatureMode,
} from "../../../models/inputModes";
import { InputId } from "../../../models/inputSlots";
import {
  ModelOutputKey,
  type ChartBuildContext,
  type NumericBand,
  type ModelOutputKey as ModelOutputKeyType,
} from "../../../models/modelCapabilities";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../../models/units";
import { createComfortToolState } from "../../../state/comfortTool/createComfortToolState.svelte";
import { convertFieldValueFromSi } from "../../units";
import type { PlotlyChartResponseDto, PlotTraceDto } from "../../../models/comfortDtos";
import { buildChartPlotly } from "../../../testSupport/modelChartTestHelpers";
import { ChartInstanceId } from "../../../models/output/chartInstances";

const input: ComfortZoneRequestDto = {
  tdb: 25,
  tr: 25,
  vr: 0.1,
  rh: 50,
  met: 1.2,
  clo: 0.5,
  wme: 0,
  occupantHasAirSpeedControl: true,
  rhMin: 0,
  rhMax: 100,
  rhPoints: 11,
};

function calculateModel(
  declaration: PmvModelDeclaration,
  request: ComfortZoneRequestDto = input,
): {
  config: ReturnType<typeof createPmvModelConfig>;
  result: PmvResponseDto;
  source: PmvChartSourceDto;
} {
  const config = createPmvModelConfig(declaration);
  const toolState = createComfortToolState();
  const stateInput = toolState.state.quantitiesByInput[InputId.Input1];
  stateInput[PhysicalQuantityId.DryBulbTemperature] = request.tdb;
  stateInput[PhysicalQuantityId.MeanRadiantTemperature] = request.tr;
  stateInput[PhysicalQuantityId.RelativeAirSpeed] = request.vr;
  stateInput[PhysicalQuantityId.RelativeHumidity] = request.rh;
  stateInput[PhysicalQuantityId.MetabolicRate] = request.met;
  stateInput[PhysicalQuantityId.ClothingInsulation] = request.clo;
  stateInput[PhysicalQuantityId.ExternalWork] = request.wme;
  toolState.state.ui.modelOptionsByModel[config.id] = {
    ...config.defaultOptions,
    [OptionKey.TemperatureMode]: TemperatureMode.Air,
    ...(declaration.adapter.supportsOccupantAirSpeedControl
      ? {
          [OptionKey.AirSpeedControlMode]: request.occupantHasAirSpeedControl
            ? AirSpeedControlMode.WithLocalControl
            : AirSpeedControlMode.NoLocalControl,
        }
      : {}),
  };
  const calculation = calculatePmvModel(createModelCalculationContext({
    effectiveQuantitiesByInput: toolState.state.quantitiesByInput,
    auxiliaryQuantitiesByInput: toolState.state.auxiliaryQuantitiesByInput,
    modelInputs: toolState.state.modelInputsByModel[declaration.adapter.modelId],
    options: toolState.state.ui.modelOptionsByModel[declaration.adapter.modelId],
  }), [InputId.Input1], declaration.adapter);
  const result = calculation.resultsByInput[InputId.Input1];
  if (!result) throw new Error("Expected a PMV result for Input 1.");
  return { config, result, source: calculation.chartSource };
}

function createSource(
  declaration: PmvModelDeclaration,
  request: ComfortZoneRequestDto = input,
): PmvChartSourceDto {
  return calculateModel(declaration, request).source;
}

function createResults(
  result: PmvResponseDto,
): Record<InputId, PmvResponseDto | null> {
  return {
    [InputId.Input1]: result,
    [InputId.Input2]: null,
    [InputId.Input3]: null,
  };
}

function createContext(
  declaration: PmvModelDeclaration,
  xField: ChartAxisQuantityId,
  yField: ChartAxisQuantityId,
  outputKey: ModelOutputKeyType,
  unitSystem: UnitSystemType = UnitSystem.SI,
  profileKind: typeof FieldChartProfileKind.Explore | typeof FieldChartProfileKind.Compliance = FieldChartProfileKind.Explore,
): ChartBuildContext<NumericBand> {
  const output = declaration.exploreOutputs.find(({ key }) => key === outputKey);
  if (!output) throw new Error(`Missing PMV output: ${outputKey}`);
  return {
    unitSystem,
    baselineInputId: InputId.Input1,
    fieldChartConfig: profileKind === FieldChartProfileKind.Compliance
      ? {
          profileKind,
          xField,
          yField,
          zOutput: declaration.complianceProfile.output,
          bands: declaration.complianceProfile.bands,
        }
      : {
          profileKind,
          xField,
          yField,
          zOutput: outputKey,
          bands: output.defaultBands,
        },
  };
}

function buildPsychrometric(
  declaration: PmvModelDeclaration,
  unitSystem: UnitSystemType = UnitSystem.SI,
  source = createSource(declaration),
  outputKey: ModelOutputKeyType = ModelOutputKey.Pmv,
  profileKind: typeof FieldChartProfileKind.Explore | typeof FieldChartProfileKind.Compliance = FieldChartProfileKind.Explore,
): PlotlyChartResponseDto {
  const { config, result } = calculateModel(declaration);
  const chart = buildChartPlotly(config,
    declaration.psychrometricInstanceId,
    source,
    createResults(result),
    createContext(
      declaration,
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.RelativeHumidity,
      outputKey,
      unitSystem,
      profileKind,
    ),
  );
  if (!chart) throw new Error("Expected a PMV psychrometric chart.");
  return chart;
}

function requireTrace(
  chart: PlotlyChartResponseDto,
  name: string,
): PlotTraceDto {
  const trace = chart.traces.find((candidate: PlotTraceDto) => candidate.name === name);
  if (!trace) throw new Error(`Missing chart trace: ${name}`);
  return trace;
}

function expectSaturationMaskToMatchCurve(chart: PlotlyChartResponseDto): void {
  const mask = requireTrace(chart, "Supersaturated region mask");
  const saturationCurve = requireTrace(chart, "RH 100%");
  const curveLength = saturationCurve.x.length;

  expect(mask.type).toBe("scatter");
  expect(mask.fill).toBe("toself");
  expect(mask.fillcolor).toBe(chart.layout.plot_bgcolor);
  expect(mask.hoverinfo).toBe("skip");
  expect(mask.isBackgroundZone).not.toBe(true);
  expect(mask.x.slice(0, curveLength)).toEqual(saturationCurve.x);
  expect(mask.y.slice(0, curveLength)).toEqual(saturationCurve.y);
  expect(mask.y.slice(-2)).toEqual([
    chart.layout.yaxis.range[1],
    chart.layout.yaxis.range[1],
  ]);
}

function buildDynamic(
  declaration: PmvModelDeclaration,
  xField: ChartAxisQuantityId,
  yField: ChartAxisQuantityId,
  outputKey: ModelOutputKeyType = ModelOutputKey.Pmv,
  unitSystem: UnitSystemType = UnitSystem.SI,
  request: ComfortZoneRequestDto = input,
  profileKind: typeof FieldChartProfileKind.Explore | typeof FieldChartProfileKind.Compliance = FieldChartProfileKind.Explore,
): PlotlyChartResponseDto {
  const { config, result, source } = calculateModel(declaration, request);
  const chart = buildChartPlotly(config,
    declaration.dynamicInstanceId,
    source,
    createResults(result),
    createContext(declaration, xField, yField, outputKey, unitSystem, profileKind),
  );
  if (!chart) throw new Error("Expected a PMV dynamic chart.");
  return chart;
}

describe("PMV charts", () => {
  it("builds the fixed psychrometric view with zones, RH curves, comfort polygon, and input", () => {
    const chart = buildPsychrometric(pmvAshraeDeclaration);
    const fillTraces = chart.traces.filter(({ contours }) => (
      contours?.type === "constraint" && contours.operation !== "="
    ));
    const tooltipTrace = chart.traces.find(({ name }) => name === "PMV bands hover");

    expect(fillTraces.length).toBeGreaterThan(0);
    expect(tooltipTrace?.type).toBe("contour");
    expect(tooltipTrace?.z).toHaveLength(50);
    expect(tooltipTrace?.z?.[0]).toHaveLength(50);
    expect(tooltipTrace?.hovertemplate).toContain("Zone: %{text}");
    expect(tooltipTrace?.hovertemplate).toContain("PMV: %{customdata[0]:.2f}");
    expect(tooltipTrace?.hovertemplate).toContain("PPD: %{customdata[1]:.1f}%");
    expect(chart.traces.filter(({ name }) => name.startsWith("RH "))).toHaveLength(10);
    expectSaturationMaskToMatchCurve(chart);
    expect(chart.traces.some(({ name }) => name === "Input 1 comfort zone")).toBe(true);
    expect(chart.traces.some(({ name }) => name === "Input 1")).toBe(true);
    expect(String(chart.layout.title)).toContain("ASHRAE");
  });

  it("uses locked Compliance and edited PPD configs in the fixed psychrometric view", () => {
    const declaration = pmvAshraeDeclaration;
    const { config, source, result } = calculateModel(declaration);
    const results = createResults(result);
    const compliance = buildChartPlotly(config,
      ChartInstanceId.PmvAshrae.Psychrometric,
      source,
      results,
      createContext(
        declaration,
        PhysicalQuantityId.DryBulbTemperature,
        PhysicalQuantityId.RelativeHumidity,
        ModelOutputKey.Pmv,
        UnitSystem.SI,
        FieldChartProfileKind.Compliance,
      ),
    );
    const baseExplore = createContext(
      declaration,
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.RelativeHumidity,
      ModelOutputKey.Ppd,
    );
    const editedBands = [
      {
        min: -Infinity,
        max: result.ppd,
        label: "Lower PPD",
        color: "#123456",
      },
      {
        min: result.ppd,
        max: Infinity,
        label: "Boundary PPD",
        color: "#abcdef",
      },
    ];
    const ppd = buildChartPlotly(config,
      ChartInstanceId.PmvAshrae.Psychrometric,
      source,
      results,
      {
        ...baseExplore,
        fieldChartConfig: {
          ...baseExplore.fieldChartConfig,
          profileKind: FieldChartProfileKind.Explore,
          zOutput: ModelOutputKey.Ppd,
          bands: editedBands,
        },
      },
    );
    if (!compliance || !ppd) {
      throw new Error("Expected both PMV psychrometric chart modes.");
    }
    const ppdHover = ppd.traces.find(
      ({ name }) => name === "PPD (%) bands hover",
    );
    const ppdInput = ppd.traces.find(({ name }) => name === "Input 1");
    const rhCurve = ppd.traces.find(({ name }) => name === "RH 50%");

    expect(compliance.traces.filter(({ contours }) => (
      contours?.type === "constraint" && contours.operation !== "="
    )).map(({ fillcolor }) => fillcolor)).toEqual(
      declaration.complianceProfile.bands.map(({ color }) => color),
    );
    expect(ppd.traces.filter(({ contours }) => (
      contours?.type === "constraint" && contours.operation !== "="
    )).map(({ fillcolor }) => fillcolor)).toEqual(["#123456", "#abcdef"]);
    expect(ppdHover?.hovertemplate).toContain("Band: %{text}");
    expect(ppdHover?.hovertemplate).toContain("PPD: %{customdata[0]:.1f}%");
    expect(ppdHover?.hovertemplate).toContain("PMV: %{customdata[1]:.2f}");
    expect(ppdInput?.hovertemplate).toContain("Boundary PPD");
    expect(rhCurve?.text?.some((label) => label === "Lower PPD")).toBe(true);
    expect(String(ppd.layout.title)).toContain("PPD (%)");
  });

  it("extends fills under a non-interactive saturation mask without evaluating above 100% RH", () => {
    let maximumRh = -Infinity;
    const countingAdapter: PmvStandardAdapter = {
      ...pmvAshraeAdapter,
      calculate: (request) => {
        maximumRh = Math.max(maximumRh, request.rh);
        return pmvAshraeAdapter.calculate(request);
      },
    };
    const declaration: PmvModelDeclaration = {
      ...pmvAshraeDeclaration,
      adapter: countingAdapter,
    };
    const chart = buildPsychrometric(
      declaration,
      UnitSystem.SI,
      createSource(pmvAshraeDeclaration),
    );
    const fillTrace = chart.traces.find(({ contours }) => (
      contours?.type === "constraint" && contours.operation !== "="
    ));
    const tooltipTrace = requireTrace(chart, "PMV bands hover");
    const fillValues = fillTrace?.z?.flat() ?? [];
    const tooltipValues = tooltipTrace.z?.flat() ?? [];
    const maskIndex = chart.traces.findIndex(({ name }) => (
      name === "Supersaturated region mask"
    ));
    const rhCurveIndex = chart.traces.findIndex(({ name }) => name === "RH 100%");
    const comfortZoneIndex = chart.traces.findIndex(({ name }) => (
      name === "Input 1 comfort zone"
    ));
    const inputIndex = chart.traces.findIndex(({ name }) => name === "Input 1");

    expectSaturationMaskToMatchCurve(chart);
    expect(tooltipValues.some(Number.isNaN)).toBe(true);
    expect(tooltipValues.some((value, index) => (
      Number.isNaN(value) && Number.isFinite(fillValues[index])
    ))).toBe(true);
    expect(maskIndex).toBeGreaterThan(chart.traces.indexOf(tooltipTrace));
    expect(rhCurveIndex).toBeGreaterThan(maskIndex);
    expect(comfortZoneIndex).toBeGreaterThan(rhCurveIndex);
    expect(inputIndex).toBeGreaterThan(comfortZoneIndex);
    expect(maximumRh).toBeLessThanOrEqual(100);
  });

  it.each([
    ["ASHRAE Compliance", pmvAshraeDeclaration, FieldChartProfileKind.Compliance, ModelOutputKey.Pmv],
    ["ASHRAE Explore", pmvAshraeDeclaration, FieldChartProfileKind.Explore, ModelOutputKey.Ppd],
    ["ISO Compliance", pmvIsoDeclaration, FieldChartProfileKind.Compliance, ModelOutputKey.Pmv],
    ["ISO Explore", pmvIsoDeclaration, FieldChartProfileKind.Explore, ModelOutputKey.Ppd],
  ] as const)(
    "uses the shared saturation boundary for %s",
    (_label, declaration, profileKind, outputKey) => {
      const chart = buildPsychrometric(
        declaration,
        UnitSystem.SI,
        createSource(declaration),
        outputKey,
        profileKind,
      );

      expectSaturationMaskToMatchCurve(chart);
    },
  );

  it("converts psychrometric axes and markers only at the display boundary", () => {
    const siChart = buildPsychrometric(pmvAshraeDeclaration, UnitSystem.SI);
    const ipChart = buildPsychrometric(pmvAshraeDeclaration, UnitSystem.IP);
    const siInput = siChart.traces.find(({ name }) => name === "Input 1");
    const ipInput = ipChart.traces.find(({ name }) => name === "Input 1");

    expectSaturationMaskToMatchCurve(siChart);
    expectSaturationMaskToMatchCurve(ipChart);
    expect(siInput?.x).toEqual([25]);
    expect(ipInput?.x[0]).toBeCloseTo(77, 6);
    expect(ipInput?.y[0]).not.toBe(siInput?.y[0]);
    expect(String(ipChart.layout.xaxis.title)).toContain("°F");
  });

  it.each([ModelOutputKey.Pmv, ModelOutputKey.Ppd])(
    "builds the %s Explore output through continuous band constraints",
    (outputKey) => {
      const chart = buildDynamic(
        pmvAshraeDeclaration,
        PhysicalQuantityId.DryBulbTemperature,
        PhysicalQuantityId.RelativeHumidity,
        outputKey,
      );
      const fillTraces = chart.traces.filter(({ contours }) => (
        contours?.type === "constraint" && contours.operation !== "="
      ));
      const tooltipTraces = chart.traces.filter(({ name }) => name.endsWith(" hover"));
      const inputTrace = chart.traces.find(({ name }) => name === "Input 1");

      expect(fillTraces.length).toBeGreaterThan(0);
      expect(chart.traces.every((trace: PlotTraceDto) => !("hoveron" in trace))).toBe(true);
      expect(tooltipTraces).toHaveLength(1);
      expect(tooltipTraces[0].hoverongaps).toBe(false);
      expect(tooltipTraces[0].hovertemplate).toContain(
        outputKey === ModelOutputKey.Pmv ? "Zone:" : "Band:",
      );
      expect(tooltipTraces[0].hovertemplate).toContain("PMV:");
      expect(tooltipTraces[0].hovertemplate).toContain("PPD:");
      expect(inputTrace?.hovertemplate).toContain(
        outputKey === ModelOutputKey.Pmv ? "Zone:" : "Band:",
      );
      expect(inputTrace?.hovertemplate).toContain("PMV:");
      expect(inputTrace?.hovertemplate).toContain("PPD:");
    },
  );

  it("builds locked Compliance bands through the same PMV field engine", () => {
    const chart = buildDynamic(
      pmvAshraeDeclaration,
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.RelativeHumidity,
      ModelOutputKey.Pmv,
      UnitSystem.SI,
      input,
      FieldChartProfileKind.Compliance,
    );
    const fillTraces = chart.traces.filter(({ contours }) => (
      contours?.type === "constraint" && contours.operation !== "="
    ));

    expect(fillTraces.length).toBeGreaterThan(0);
    expect(chart.traces.find(({ name }) => name === "Input 1")?.hovertemplate)
      .toContain("PMV:");
  });

  it("keeps fixed and Explore classification consistent for the input point", () => {
    const { result } = calculateModel(pmvAshraeDeclaration);
    const expectedZone = pmvZonesList.find(({ min, max }) => (
      result.pmv >= min && result.pmv < max
    ))?.label;
    if (!expectedZone) throw new Error("Expected a declared PMV zone.");
    const fixed = buildPsychrometric(pmvAshraeDeclaration);
    const explore = buildDynamic(
      pmvAshraeDeclaration,
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.RelativeHumidity,
    );
    const fixedInput = fixed.traces.find(({ name }) => name === "Input 1");
    const exploreInput = explore.traces.find(({ name }) => name === "Input 1");

    expect(fixedInput?.hovertemplate).toContain(`Zone: ${expectedZone}`);
    expect(exploreInput?.hovertemplate).toContain(`Zone: ${expectedZone}`);
  });

  it.each([
    [PhysicalQuantityId.DryBulbTemperature, PhysicalQuantityId.OperativeTemperature],
    [PhysicalQuantityId.OperativeTemperature, PhysicalQuantityId.DryBulbTemperature],
    [PhysicalQuantityId.MeanRadiantTemperature, PhysicalQuantityId.OperativeTemperature],
    [PhysicalQuantityId.OperativeTemperature, PhysicalQuantityId.MeanRadiantTemperature],
  ] as const)("solves operative/component axes transactionally for %s / %s", (
    xField,
    yField,
  ) => {
    const chart = buildDynamic(pmvAshraeDeclaration, xField, yField);
    const constraint = chart.traces.find(({ contours }) => (
      contours?.type === "constraint" && contours.operation !== "="
    ));

    expect(constraint?.z?.flat().some(Number.isFinite)).toBe(true);
  });

  it("uses each standard's operative temperature and clothing range", () => {
    const operativeInput = { ...input, tdb: 20, tr: 30, vr: 0.8 };
    const ashraeOperative = buildDynamic(
      pmvAshraeDeclaration,
      PhysicalQuantityId.OperativeTemperature,
      PhysicalQuantityId.RelativeHumidity,
      ModelOutputKey.Pmv,
      UnitSystem.SI,
      operativeInput,
    );
    const isoOperative = buildDynamic(
      pmvIsoDeclaration,
      PhysicalQuantityId.OperativeTemperature,
      PhysicalQuantityId.RelativeHumidity,
      ModelOutputKey.Pmv,
      UnitSystem.SI,
      operativeInput,
    );
    const ashraeClothing = buildDynamic(
      pmvAshraeDeclaration,
      PhysicalQuantityId.ClothingInsulation,
      PhysicalQuantityId.RelativeHumidity,
    );
    const isoClothing = buildDynamic(
      pmvIsoDeclaration,
      PhysicalQuantityId.ClothingInsulation,
      PhysicalQuantityId.RelativeHumidity,
    );
    const inputX = (chart: PlotlyChartResponseDto) => chart.traces
      .find(({ name }) => name === "Input 1")?.x[0];

    expect(inputX(ashraeOperative)).toBe(23);
    expect(inputX(isoOperative)).toBeCloseTo(22.612, 3);
    expect(ashraeClothing.layout.xaxis.range).toEqual([0, 1.5]);
    expect(isoClothing.layout.xaxis.range).toEqual([0, 2]);
  });

  it.each([pmvAshraeDeclaration, pmvIsoDeclaration])(
    "keeps RH 50% constraint crossings close to the continuous root for $label",
    (declaration) => {
      const chart = buildDynamic(
        declaration,
        PhysicalQuantityId.DryBulbTemperature,
        PhysicalQuantityId.RelativeHumidity,
      );
      const lowerBoundary = chart.traces.find(({ contours }) => (
        contours?.operation === "=" && contours.value === -0.5
      ));
      if (!lowerBoundary?.z) {
        throw new Error("Missing PMV boundary.");
      }
      const yValues = lowerBoundary.y;
      const rowIndex = yValues.reduce((bestIndex, value, index) => (
        Math.abs(value - 50) < Math.abs(yValues[bestIndex] - 50) ? index : bestIndex
      ), 0);
      const row = lowerBoundary.z[rowIndex];
      const crossingIndex = row.findIndex((value, index) => (
        index > 0
        && Number.isFinite(value)
        && Number.isFinite(row[index - 1])
        && (row[index - 1] + 0.5) * (value + 0.5) <= 0
      ));
      const xValues = lowerBoundary.x;
      expect(crossingIndex).toBeGreaterThan(0);
      const closestDelta = Math.min(
        ...[xValues[crossingIndex - 1], xValues[crossingIndex]].map((tdb) => (
          Math.abs(declaration.adapter.calculate({ ...input, tdb }).pmv + 0.5)
        )),
      );

      expect(closestDelta).toBeLessThan(0.1);
    },
  );

  it("keeps PMV grid hover complete in IP display", () => {
    const chart = buildDynamic(
      pmvAshraeDeclaration,
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.RelativeHumidity,
      ModelOutputKey.Pmv,
      UnitSystem.IP,
    );
    const tooltipTrace = chart.traces.find(({ name }) => name === "PMV bands hover");
    const inputTrace = chart.traces.find(({ name }) => name === "Input 1");

    expect(tooltipTrace?.type).toBe("contour");
    expect(tooltipTrace?.hoverongaps).toBe(false);
    expect(tooltipTrace?.hovertemplate).toContain("Air temperature");
    expect(tooltipTrace?.hovertemplate).toContain("Relative humidity");
    expect(tooltipTrace?.hovertemplate).toContain("Zone:");
    expect(tooltipTrace?.hovertemplate).toContain("PMV:");
    expect(tooltipTrace?.hovertemplate).toContain("PPD:");
    expect(chart.traces.every((trace: PlotTraceDto) => !("hoveron" in trace))).toBe(true);
    expect(inputTrace?.x[0]).toBeCloseTo(
      convertFieldValueFromSi(PhysicalQuantityId.DryBulbTemperature, input.tdb, UnitSystem.IP),
      6,
    );
  });
});
