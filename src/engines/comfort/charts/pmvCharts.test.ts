import { FieldChartProfileKind } from "../../../catalog/fieldChartProfile";
import { describe, expect, it } from "vitest";

import {
  pmvAshraeAdapter,
  pmvAshraeDeclaration,
  pmvAshraeModelConfig,
} from "../../../declarations/pmv/ashrae";
import {
  pmvIsoDeclaration,
} from "../../../declarations/pmv/iso";
import {
  createPmvModelConfig,
  type PmvModelDeclaration,
  type PmvStandardAdapter,
} from "../../../declarations/pmv/shared";
import { ashraeComplianceZonesList } from "../../../declarations/pmv/zones";
import {
  calculatePmvModel,
  type ComfortZoneRequest,
  type PmvChartSource,
  type PmvResponse,
} from "../../../declarations/pmv/calculation";
import { createModelCalculationContext } from "../../../catalog/modelCalculation";
import { PhysicalQuantityId, type PhysicalQuantityId as PhysicalQuantityIdType } from "../../../catalog/quantities";
import {
  AirSpeedControlMode,
  OptionKey,
  TemperatureMode,
} from "../../../catalog/inputModes";
import { InputId } from "../../../catalog/inputSlots";
import { inputChartStyleById } from "../../../catalog/inputSlotPresentation";
import { type ChartBuildContext, type NumericBand } from "../../../catalog/modelCapabilities";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../../catalog/units";
import { ChartType } from "../../../catalog/chartTypes";
import { createPointSession } from "../../../state/pointSession/createPointSession.svelte";
import { convertFieldValueFromSi } from "../../units";
import { maxRelativeAirSpeedWithoutOccupantControl } from "./ashraeAirSpeedLimits";
import { buildChartPlotly, type ChartFigure } from "../../../testSupport/modelChartTestHelpers";
import { assembleChart } from "../../../charts";
const input: ComfortZoneRequest = {
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
  request: ComfortZoneRequest = input,
  temperatureMode: typeof TemperatureMode[keyof typeof TemperatureMode] = TemperatureMode.Air,
): {
  config: ReturnType<typeof createPmvModelConfig>;
  result: PmvResponse;
  source: PmvChartSource;
} {
  const config = createPmvModelConfig(declaration);
  const session = createPointSession();
  const stateInput = session.input.quantitiesByInput[InputId.Input1];
  stateInput[PhysicalQuantityId.DryBulbTemperature] = request.tdb;
  stateInput[PhysicalQuantityId.MeanRadiantTemperature] = request.tr;
  stateInput[PhysicalQuantityId.RelativeAirSpeed] = request.vr;
  stateInput[PhysicalQuantityId.RelativeHumidity] = request.rh;
  stateInput[PhysicalQuantityId.MetabolicRate] = request.met;
  stateInput[PhysicalQuantityId.ClothingInsulation] = request.clo;
  stateInput[PhysicalQuantityId.ExternalWork] = request.wme;
  session.setting.modelOptionsByModel[config.id] = {
    ...config.defaultOptions,
    [OptionKey.TemperatureMode]: temperatureMode,
    ...(declaration.adapter.supportsOccupantAirSpeedControl
      ? {
          [OptionKey.AirSpeedControlMode]: request.occupantHasAirSpeedControl
            ? AirSpeedControlMode.WithLocalControl
            : AirSpeedControlMode.NoLocalControl,
        }
      : {}),
  };
  const calculation = calculatePmvModel(createModelCalculationContext({
    effectiveQuantitiesByInput: session.input.quantitiesByInput,
    auxiliaryQuantitiesByInput: session.input.auxiliaryQuantitiesByInput,
    modelInputs: session.input.modelInputsByModel[declaration.adapter.modelId],
    options: session.setting.modelOptionsByModel[declaration.adapter.modelId],
  }), [InputId.Input1], declaration.adapter);
  const result = calculation.resultsByInput[InputId.Input1];
  if (!result) throw new Error("Expected a PMV result for Input 1.");
  return { config, result, source: calculation.chartSource };
}

function createSource(
  declaration: PmvModelDeclaration,
  request: ComfortZoneRequest = input,
): PmvChartSource {
  return calculateModel(declaration, request).source;
}

function createResults(
  result: PmvResponse,
): Record<InputId, PmvResponse | null> {
  return {
    [InputId.Input1]: result,
    [InputId.Input2]: null,
    [InputId.Input3]: null,
  };
}

function createContext(
  declaration: PmvModelDeclaration,
  xField: PhysicalQuantityId,
  yField: PhysicalQuantityId,
  outputKey: PhysicalQuantityIdType,
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
  outputKey: PhysicalQuantityIdType = PhysicalQuantityId.PredictedMeanVote,
  profileKind: typeof FieldChartProfileKind.Explore | typeof FieldChartProfileKind.Compliance = FieldChartProfileKind.Explore,
): ChartFigure {
  const { config, result } = calculateModel(declaration);
  const chart = buildChartPlotly(config,
    ChartType.Psychrometric,
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
  chart: ChartFigure,
  name: string,
): ChartFigure["traces"][number] {
  const trace = chart.traces.find((candidate) => candidate.name === name);
  if (!trace) throw new Error(`Missing chart trace: ${name}`);
  return trace;
}

function bandFillTraces(chart: ChartFigure, prefix: string) {
  return chart.traces.filter(({ name, fill }) => (
    typeof name === "string" && name.startsWith(prefix) && fill === "toself"
  ));
}

function expectInputMarkerHover(
  chart: ChartFigure,
  rows: readonly string[],
  inputName = "Input 1",
): void {
  const inputTrace = requireTrace(chart, inputName);
  expect(inputTrace.hoverinfo).toBe("all");
  expect(inputTrace.hovertemplate).toBeDefined();
  for (const row of rows) {
    expect(inputTrace.hovertemplate).toContain(row);
  }
}

function expectSaturationMaskToMatchCurve(chart: ChartFigure): void {
  const mask = requireTrace(chart, "Supersaturated region mask");
  const saturationCurve = requireTrace(chart, "RH 100%");
  const curveLength = saturationCurve.x?.length ?? 0;

  expect(mask.type).toBe("scatter");
  expect(mask.fill).toBe("toself");
  expect(mask.fillcolor).toBe(chart.layout.plot_bgcolor);
  expect(mask.hoverinfo).toBe("skip");
  expect(mask.x?.slice(0, curveLength)).toEqual(saturationCurve.x);
  expect(mask.y?.slice(0, curveLength)).toEqual(saturationCurve.y);
  expect(mask.y?.slice(-2)).toEqual([
    chart.layout.yaxis.range[1],
    chart.layout.yaxis.range[1],
  ]);
}

function buildDynamic(
  declaration: PmvModelDeclaration,
  xField: PhysicalQuantityId,
  yField: PhysicalQuantityId,
  outputKey: PhysicalQuantityIdType = PhysicalQuantityId.PredictedMeanVote,
  unitSystem: UnitSystemType = UnitSystem.SI,
  request: ComfortZoneRequest = input,
  profileKind: typeof FieldChartProfileKind.Explore | typeof FieldChartProfileKind.Compliance = FieldChartProfileKind.Explore,
): ChartFigure {
  const { config, result, source } = calculateModel(declaration, request);
  const chart = buildChartPlotly(config,
    ChartType.Dynamic,
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
    const bandFills = bandFillTraces(chart, "PMV bands:");

    expect(fillTraces).toHaveLength(0);
    expect(bandFills).toHaveLength(ashraeComplianceZonesList.length);
    expect(chart.traces.find(({ name }) => name === "PMV bands hover")).toBeUndefined();
    expectInputMarkerHover(chart, [
      "Zone:",
      "PMV:",
      "PPD:",
    ]);
    expect(chart.traces.filter(({ name }) => name?.startsWith("RH "))).toHaveLength(10);
    expectSaturationMaskToMatchCurve(chart);
    expect(chart.traces.some(({ name }) => name === "Input 1 comfort zone")).toBe(true);
    const comfortOutline = chart.traces.find(({ name }) => name === "Input 1 comfort zone");
    const acceptableFill = bandFills.find(({ name }) => name?.includes("acceptable"));
    expect(comfortOutline?.fill).toBe("toself");
    expect(comfortOutline?.fillcolor).toBe(inputChartStyleById[InputId.Input1].fill);
    expect(acceptableFill).toBeDefined();
    expect(chart.traces.some(({ name }) => name === "Input 1")).toBe(true);
    expect(chart.traces.find(({ name }) => name === "Input 1")?.hoverinfo).toBe("all");
    expect(String(chart.layout.title)).toContain("ASHRAE");
    expect(chart.layout.xaxis.dtick).toBe(2);
    const assembled = assembleChart(chart.payload);
    const assembledNames = assembled.data.map(({ name }) => name);
    expect(assembled.layout.xaxis).toEqual(expect.objectContaining({
      dtick: 2,
      tickmode: "linear",
      tick0: 10,
    }));
    expect(assembledNames.indexOf("PMV bands: acceptable")).toBeGreaterThan(
      assembledNames.indexOf("Supersaturated region mask"),
    );
    expect(assembledNames.indexOf("RH 100%")).toBeGreaterThan(
      assembledNames.indexOf("PMV bands: acceptable"),
    );
    expect(assembledNames.indexOf("Input 1 comfort zone")).toBeGreaterThan(
      assembledNames.indexOf("RH 100%"),
    );
    expect(assembledNames.indexOf("Input 1")).toBeGreaterThan(
      assembledNames.indexOf("Input 1 comfort zone"),
    );
    expect(
      assembled.data
        .filter(({ name }) => String(name).startsWith("RH "))
        .every((trace) => trace.hoverinfo === "skip"),
    ).toBe(true);
  });

  it("strokes adjacent psychrometric band fills so shared isolines do not show plot-background gaps", () => {
    const chart = buildPsychrometric(pmvAshraeDeclaration);
    const bandFills = chart.traces.filter(({ name, fill }) => (
      typeof name === "string" && name.startsWith("PMV bands:") && fill === "toself"
    ));
    expect(bandFills.length).toBeGreaterThan(1);
    bandFills.forEach((fill) => {
      expect(fill.line?.color).toBe(fill.fillcolor);
      expect(fill.line?.width).toBeGreaterThanOrEqual(1.5);
    });
  });

  it("keeps psychrometric band fills inside the axes including the dry high-T corner", () => {
    const chart = buildPsychrometric(pmvAshraeDeclaration);
    const bandFills = chart.traces.filter(({ name, fill }) => (
      typeof name === "string" && name.startsWith("PMV bands:") && fill === "toself"
    ));
    const [yMin, yMax] = chart.layout.yaxis.range;
    const [xMin, xMax] = chart.layout.xaxis.range;
    const lastFill = bandFills[bandFills.length - 1];
    if (!lastFill?.x || !lastFill.y) throw new Error("Expected an outer band fill.");

    bandFills.forEach((fill) => {
      expect(Math.min(...(fill.y ?? []))).toBeGreaterThanOrEqual(yMin);
      expect(Math.max(...(fill.y ?? []))).toBeLessThanOrEqual(yMax);
      expect(Math.min(...(fill.x ?? []))).toBeGreaterThanOrEqual(xMin);
      expect(Math.max(...(fill.x ?? []))).toBeLessThanOrEqual(xMax);
    });
    expect(Math.max(...lastFill.x)).toBe(xMax);
    expect(Math.min(...lastFill.y)).toBe(yMin);
  });

  it("covers the dry high-T corner on PPD psychrometric fills", () => {
    const chart = buildPsychrometric(
      pmvAshraeDeclaration,
      UnitSystem.SI,
      createSource(pmvAshraeDeclaration),
      PhysicalQuantityId.PredictedPercentageOfDissatisfied,
      FieldChartProfileKind.Explore,
    );
    const outer = chart.traces.filter(({ name, fill }) => (
      typeof name === "string"
      && name.startsWith("PPD (%) bands:")
      && fill === "toself"
    ));
    const [yMin] = chart.layout.yaxis.range;
    const [, xMax] = chart.layout.xaxis.range;
    const coversCorner = outer.some((fill) => (
      Math.max(...(fill.x ?? [])) === xMax
      && Math.min(...(fill.y ?? [])) === yMin
    ));
    expect(coversCorner).toBe(true);
  });

  it("uses locked Compliance and edited PPD configs in the fixed psychrometric view", () => {
    const declaration = pmvAshraeDeclaration;
    const { config, source, result } = calculateModel(declaration);
    const results = createResults(result);
    const compliance = buildChartPlotly(config,
      "psychrometric",
      source,
      results,
      createContext(
        declaration,
        PhysicalQuantityId.DryBulbTemperature,
        PhysicalQuantityId.RelativeHumidity,
        PhysicalQuantityId.PredictedMeanVote,
        UnitSystem.SI,
        FieldChartProfileKind.Compliance,
      ),
    );
    const baseExplore = createContext(
      declaration,
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.RelativeHumidity,
      PhysicalQuantityId.PredictedPercentageOfDissatisfied,
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
      "psychrometric",
      source,
      results,
      {
        ...baseExplore,
        fieldChartConfig: {
          ...baseExplore.fieldChartConfig,
          profileKind: FieldChartProfileKind.Explore,
          zOutput: PhysicalQuantityId.PredictedPercentageOfDissatisfied,
          bands: editedBands,
        },
      },
    );
    if (!compliance || !ppd) {
      throw new Error("Expected both PMV psychrometric chart modes.");
    }
    const ppdInput = ppd.traces.find(({ name }) => name === "Input 1");
    const rhCurve = ppd.traces.find(({ name }) => name === "RH 50%");

    expect(compliance.traces.filter(({ contours }) => (
      contours?.type === "constraint" && contours.operation !== "="
    ))).toHaveLength(0);
    expect(
      compliance.traces
        .filter(({ name, fill }) => (
          typeof name === "string" && name.startsWith("PMV bands:") && fill === "toself"
        ))
        .map(({ fillcolor }) => fillcolor),
    ).toEqual([
      declaration.complianceProfile.bands[0].color,
      declaration.complianceProfile.bands[1].color,
      declaration.complianceProfile.bands[2].color,
    ]);
    const acceptableFill = compliance.traces.find(({ name }) => (
      typeof name === "string" && name.includes("acceptable")
    ));
    const comfortOutline = compliance.traces.find(({ name }) => (
      name === "Input 1 comfort zone"
    ));
    expect(acceptableFill?.fillcolor).toBe(declaration.complianceProfile.bands[1].color);
    expect(acceptableFill).toBeDefined();
    expect(comfortOutline).toBeDefined();
    expect(ppd.traces.filter(({ contours }) => (
      contours?.type === "constraint" && contours.operation !== "="
    ))).toHaveLength(0);
    const ppdBandFills = ppd.traces.filter(({ name, fill }) => (
      typeof name === "string" && name.startsWith("PPD (%) bands:") && fill === "toself"
    ));
    expect(ppdBandFills.map(({ fillcolor }) => fillcolor)).toEqual(
      expect.arrayContaining(["#123456", "#abcdef"]),
    );
    expect(ppd.traces.find(({ name }) => name === "PPD (%) bands hover")).toBeUndefined();
    expectInputMarkerHover(ppd, [
      "Band:",
      "PPD:",
      "PMV:",
    ]);
    expect(ppdInput?.hoverinfo).toBe("all");
    expect(rhCurve?.hoverinfo).toBe("skip");
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
    const maskIndex = chart.traces.findIndex(({ name }) => (
      name === "Supersaturated region mask"
    ));
    const rhCurveIndex = chart.traces.findIndex(({ name }) => name === "RH 100%");
    const comfortZoneIndex = chart.traces.findIndex(({ name }) => (
      name === "Input 1 comfort zone"
    ));
    const inputIndex = chart.traces.findIndex(({ name }) => name === "Input 1");
    const bandFillIndex = chart.traces.findIndex(({ name, fill }) => (
      typeof name === "string" && name.startsWith("PMV bands:") && fill === "toself"
    ));

    expectSaturationMaskToMatchCurve(chart);
    expect(bandFillIndex).toBeGreaterThan(maskIndex);
    expect(rhCurveIndex).toBeGreaterThan(bandFillIndex);
    expect(comfortZoneIndex).toBeGreaterThan(rhCurveIndex);
    expect(inputIndex).toBeGreaterThan(comfortZoneIndex);
    expect(maximumRh).toBeLessThanOrEqual(100);
  });

  it.each([
    ["ASHRAE Compliance", pmvAshraeDeclaration, FieldChartProfileKind.Compliance, PhysicalQuantityId.PredictedMeanVote],
    ["ASHRAE Explore", pmvAshraeDeclaration, FieldChartProfileKind.Explore, PhysicalQuantityId.PredictedPercentageOfDissatisfied],
    ["ISO Compliance", pmvIsoDeclaration, FieldChartProfileKind.Compliance, PhysicalQuantityId.PredictedMeanVote],
    ["ISO Explore", pmvIsoDeclaration, FieldChartProfileKind.Explore, PhysicalQuantityId.PredictedPercentageOfDissatisfied],
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
    expect(ipInput?.x?.[0]).toBeCloseTo(77, 6);
    expect(ipInput?.y?.[0]).not.toBe(siInput?.y?.[0]);
    expect(String(ipChart.layout.xaxis.title)).toContain("°F");
    expect(siChart.layout.xaxis.dtick).toBe(2);
    expect(ipChart.layout.xaxis.dtick).toBe(5);
  });

  it("uses Air temperature with fixed tr and Operative temperature with tr=tdb", () => {
    const sampleTdb = 30;
    const airRequest = { ...input, tdb: 25, tr: 20 };
    const seen: Array<{ tdb: number; tr: number }> = [];
    const spyAdapter: PmvStandardAdapter = {
      ...pmvAshraeAdapter,
      calculate: (request) => {
        seen.push({ tdb: request.tdb, tr: request.tr });
        return pmvAshraeAdapter.calculate(request);
      },
    };
    const declaration: PmvModelDeclaration = {
      ...pmvAshraeDeclaration,
      adapter: spyAdapter,
    };

    const airModel = calculateModel(declaration, airRequest, TemperatureMode.Air);
    seen.length = 0;
    const airChart = buildChartPlotly(
      airModel.config,
      ChartType.Psychrometric,
      airModel.source,
      createResults(airModel.result),
      createContext(
        declaration,
        PhysicalQuantityId.DryBulbTemperature,
        PhysicalQuantityId.HumidityRatio,
        PhysicalQuantityId.PredictedMeanVote,
      ),
    );
    if (!airChart) throw new Error("Expected an Air psychrometric chart.");
    const airSample = seen.find(({ tdb }) => Math.abs(tdb - sampleTdb) < 0.2);

    expect(airModel.source.psychrometricTrEqualsTdb).toBe(false);
    expect(String(airChart.layout.xaxis.title)).toContain("Air temperature");
    expect(String(airChart.layout.yaxis.title)).toContain("Humidity ratio");
    expect(airSample?.tr).toBe(20);

    const operativeModel = calculateModel(
      declaration,
      { ...input, tdb: 25, tr: 25 },
      TemperatureMode.Operative,
    );
    seen.length = 0;
    const operativeChart = buildChartPlotly(
      operativeModel.config,
      ChartType.Psychrometric,
      operativeModel.source,
      createResults(operativeModel.result),
      createContext(
        declaration,
        PhysicalQuantityId.DryBulbTemperature,
        PhysicalQuantityId.HumidityRatio,
        PhysicalQuantityId.PredictedMeanVote,
      ),
    );
    if (!operativeChart) throw new Error("Expected an Operative psychrometric chart.");
    const operativeSample = seen.find(({ tdb }) => tdb > 10 && tdb < 40);
    const comfortOutline = operativeChart.traces.find(({ name }) => (
      name === "Input 1 comfort zone"
    ));
    const acceptableFill = operativeChart.traces.find(({ name, fill }) => (
      typeof name === "string" && name.includes("acceptable") && fill === "toself"
    ));

    expect(operativeModel.source.psychrometricTrEqualsTdb).toBe(true);
    expect(String(operativeChart.layout.xaxis.title)).toContain("Operative temperature");
    expect(String(operativeChart.layout.yaxis.title)).toContain("Humidity ratio");
    expect(operativeSample?.tr).toBeCloseTo(operativeSample?.tdb ?? Number.NaN, 6);
    expect(acceptableFill).toBeDefined();
    expect(comfortOutline).toBeDefined();
  });

  it.each([PhysicalQuantityId.PredictedMeanVote, PhysicalQuantityId.PredictedPercentageOfDissatisfied])(
    "builds the %s Explore output through continuous band constraints",
    (outputKey) => {
      const chart = buildDynamic(
        pmvAshraeDeclaration,
        PhysicalQuantityId.DryBulbTemperature,
        PhysicalQuantityId.RelativeHumidity,
        outputKey,
      );
      const fillTraces = bandFillTraces(chart, `${outputKey === PhysicalQuantityId.PredictedMeanVote ? "PMV" : "PPD (%)"} bands:`);
      const tooltipTraces = chart.traces.filter(({ name }) => name?.endsWith(" hover"));
      const inputTrace = chart.traces.find(({ name }) => name === "Input 1");

      expect(fillTraces.length).toBeGreaterThan(0);
      expect(chart.traces.every((trace) => !("hoveron" in trace))).toBe(true);
      expect(tooltipTraces).toHaveLength(0);
      expectInputMarkerHover(chart, [
        outputKey === PhysicalQuantityId.PredictedMeanVote ? "Zone:" : "Band:",
        "PMV:",
        outputKey === PhysicalQuantityId.PredictedPercentageOfDissatisfied ? "PPD (%):" : "PPD:",
      ]);
      expect(inputTrace?.hoverinfo).toBe("all");
    },
  );

  it("builds locked Compliance bands through the same PMV field engine", () => {
    const chart = buildDynamic(
      pmvAshraeDeclaration,
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.RelativeHumidity,
      PhysicalQuantityId.PredictedMeanVote,
      UnitSystem.SI,
      input,
      FieldChartProfileKind.Compliance,
    );
    const fillTraces = bandFillTraces(chart, "PMV bands:");

    expect(fillTraces.length).toBeGreaterThan(0);
    expect(chart.traces.find(({ name }) => name === "Input 1")?.hoverinfo)
      .toBe("all");
  });

  it("keeps fixed and Explore classification consistent for the input point", () => {
    const { result } = calculateModel(pmvAshraeDeclaration);
    const expectedZone = pmvAshraeDeclaration.exploreOutputs[0].defaultBands.find(
      ({ min, max }) => result.pmv >= min && result.pmv < max,
    )?.label;
    if (!expectedZone) throw new Error("Expected a declared PMV zone.");
    const fixed = buildPsychrometric(pmvAshraeDeclaration);
    const explore = buildDynamic(
      pmvAshraeDeclaration,
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.RelativeHumidity,
    );
    const fixedInput = fixed.traces.find(({ name }) => name === "Input 1");
    const exploreInput = explore.traces.find(({ name }) => name === "Input 1");

    expect(fixedInput?.hoverinfo).toBe("all");
    expect(exploreInput?.hoverinfo).toBe("all");
    expectInputMarkerHover(explore, [expectedZone]);
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
    const fillTraces = bandFillTraces(chart, "PMV bands:");

    expect(fillTraces.some((trace) => (trace.x?.length ?? 0) > 4)).toBe(true);
  });

  it("uses each standard's operative temperature and clothing range", () => {
    const operativeInput = { ...input, tdb: 20, tr: 30, vr: 0.8 };
    const ashraeOperative = buildDynamic(
      pmvAshraeDeclaration,
      PhysicalQuantityId.OperativeTemperature,
      PhysicalQuantityId.RelativeHumidity,
      PhysicalQuantityId.PredictedMeanVote,
      UnitSystem.SI,
      operativeInput,
    );
    const isoOperative = buildDynamic(
      pmvIsoDeclaration,
      PhysicalQuantityId.OperativeTemperature,
      PhysicalQuantityId.RelativeHumidity,
      PhysicalQuantityId.PredictedMeanVote,
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
    const inputX = (chart: ChartFigure) => chart.traces
      .find(({ name }) => name === "Input 1")?.x?.[0];

    expect(inputX(ashraeOperative)).toBe(23);
    expect(inputX(isoOperative)).toBeCloseTo(22.612, 3);
    expect(ashraeClothing.layout.xaxis.range).toEqual([0, 1.5]);
    expect(isoClothing.layout.xaxis.range).toEqual([0, 2]);
  });

  it.each([pmvAshraeDeclaration, pmvIsoDeclaration])(
    "keeps RH 50% isoline vertices close to the continuous root for $label",
    (declaration) => {
      const chart = buildDynamic(
        declaration,
        PhysicalQuantityId.DryBulbTemperature,
        PhysicalQuantityId.RelativeHumidity,
      );
      const coolFill = bandFillTraces(chart, "PMV bands:").find(({ name }) => (
        name?.includes("Slightly Cool")
        || name?.includes("Neutral")
        || name?.includes("acceptable")
      ));
      const xs = coolFill?.x ?? [];
      const ys = coolFill?.y ?? [];
      const nearRh50 = xs
        .map((tdb, index) => ({ tdb, rh: ys[index] }))
        .filter(({ rh }) => Math.abs(rh - 50) < 2);
      expect(nearRh50.length).toBeGreaterThan(0);
      const closestDelta = Math.min(
        ...nearRh50.map(({ tdb }) => (
          Math.abs(declaration.adapter.calculate({ ...input, tdb }).pmv + 0.5)
        )),
      );
      expect(closestDelta).toBeLessThan(0.15);
    },
  );

  it("keeps PMV cursor hover complete in IP display", () => {
    const chart = buildDynamic(
      pmvAshraeDeclaration,
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.RelativeHumidity,
      PhysicalQuantityId.PredictedMeanVote,
      UnitSystem.IP,
    );
    const inputTrace = chart.traces.find(({ name }) => name === "Input 1");

    expect(chart.traces.find(({ name }) => name === "PMV bands hover")).toBeUndefined();
    expectInputMarkerHover(chart, [
      "Air temperature",
      "Relative humidity",
      "Zone:",
      "PMV:",
      "PPD:",
    ]);
    expect(chart.traces.every((trace) => !("hoveron" in trace))).toBe(true);
    expect(inputTrace?.x?.[0]).toBeCloseTo(
      convertFieldValueFromSi(PhysicalQuantityId.DryBulbTemperature, input.tdb, UnitSystem.IP),
      6,
    );
  });

  it("clips ASHRAE To×vr without occupant control", () => {
    const clipped = buildDynamic(
      pmvAshraeDeclaration,
      PhysicalQuantityId.OperativeTemperature,
      PhysicalQuantityId.RelativeAirSpeed,
      PhysicalQuantityId.PredictedMeanVote,
      UnitSystem.SI,
      { ...input, occupantHasAirSpeedControl: false },
    );
    const clippedAcceptable = bandFillTraces(clipped, "PMV bands:").find(({ name }) => (
      name?.includes("acceptable")
    ));
    expect(clippedAcceptable?.y?.length).toBeGreaterThan(4);
    clippedAcceptable?.x?.forEach((to, index) => {
      expect(clippedAcceptable.y?.[index]).toBeLessThanOrEqual(
        maxRelativeAirSpeedWithoutOccupantControl(to) + 1e-6,
      );
    });
  });

  it("leaves ASHRAE To×vr unclipped when occupants have local control", () => {
    const { source } = calculateModel(
      pmvAshraeDeclaration,
      { ...input, occupantHasAirSpeedControl: true },
    );
    expect(source.inputs[InputId.Input1]?.occupantHasAirSpeedControl).toBe(true);
    const dynamic = pmvAshraeModelConfig.chartEngineRegistrations.find(
      (entry) => entry.type === ChartType.Dynamic,
    );
    const clip = dynamic
      && "clipAirSpeedWithoutOccupantControl" in dynamic.registration.spec
      ? dynamic.registration.spec.clipAirSpeedWithoutOccupantControl
      : undefined;
    expect(
      typeof clip === "function"
        ? clip({ occupantHasAirSpeedControl: true } as never)
        : clip,
    ).toBe(false);
  });

  it("clips ISO To×vr because occupant air-speed control is never available", () => {
    const chart = buildDynamic(
      pmvIsoDeclaration,
      PhysicalQuantityId.OperativeTemperature,
      PhysicalQuantityId.RelativeAirSpeed,
    );
    const neutral = bandFillTraces(chart, "PMV bands:").find(({ name }) => (
      name?.includes("Neutral")
    ));
    expect(neutral?.y?.length).toBeGreaterThan(4);
    neutral?.x?.forEach((to, index) => {
      expect(neutral.y?.[index]).toBeLessThanOrEqual(
        maxRelativeAirSpeedWithoutOccupantControl(to) + 1e-6,
      );
    });
  });
});
