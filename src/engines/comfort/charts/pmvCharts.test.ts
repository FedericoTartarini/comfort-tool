import { FieldChartProfileKind } from "../../../catalog/output/fieldChartProfile";
import { describe, expect, it } from "vitest";

import {
  pmvAshraeAdapter,
  pmvAshraeDeclaration,
} from "../../../declarations/pmv/ashrae";
import {
  pmvIsoDeclaration,
} from "../../../declarations/pmv/iso";
import {
  createPmvModelConfig,
  type PmvModelDeclaration,
  type PmvStandardAdapter,
} from "../../../declarations/pmv/shared";
import {
  calculatePmvModel,
  pmvZonesList,
  type ComfortZoneRequest,
  type PmvChartSource,
  type PmvResponse,
} from "../../../declarations/pmv/calculation";
import { createModelCalculationContext } from "../../../catalog/modelCalculation";
import { PhysicalQuantityId, type ChartAxisQuantityId } from "../../../catalog/quantities";
import {
  AirSpeedControlMode,
  OptionKey,
  TemperatureMode,
} from "../../../catalog/inputModes";
import { InputId } from "../../../catalog/inputSlots";
import { inputChartStyleById } from "../../../catalog/inputSlotPresentation";
import {
  ModelOutputKey,
  type ChartBuildContext,
  type NumericBand,
  type ModelOutputKey as ModelOutputKeyType,
} from "../../../catalog/modelCapabilities";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../../catalog/units";
import { createAnalysisState } from "../../../state/analysis/createAnalysisState.svelte";
import { convertFieldValueFromSi } from "../../units";
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
  const toolState = createAnalysisState();
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
): ChartFigure {
  const { config, result } = calculateModel(declaration);
  const chart = buildChartPlotly(config,
    declaration.psychrometricChartId,
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
  xField: ChartAxisQuantityId,
  yField: ChartAxisQuantityId,
  outputKey: ModelOutputKeyType = ModelOutputKey.Pmv,
  unitSystem: UnitSystemType = UnitSystem.SI,
  request: ComfortZoneRequest = input,
  profileKind: typeof FieldChartProfileKind.Explore | typeof FieldChartProfileKind.Compliance = FieldChartProfileKind.Explore,
): ChartFigure {
  const { config, result, source } = calculateModel(declaration, request);
  const chart = buildChartPlotly(config,
    declaration.dynamicChartId,
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
    const bandFills = chart.traces.filter(({ name, fill }) => (
      typeof name === "string" && name.startsWith("PMV bands:") && fill === "toself"
    ));
    const tooltipTrace = chart.traces.find(({ name }) => name === "PMV bands hover");

    expect(fillTraces).toHaveLength(0);
    expect(bandFills).toHaveLength(pmvZonesList.length);
    expect(tooltipTrace?.type).toBe("contour");
    expect(tooltipTrace?.z).toHaveLength(100);
    expect(tooltipTrace?.z?.[0]).toHaveLength(100);
    expect(tooltipTrace?.hovertemplate).toContain("Zone: %{text}");
    expect(tooltipTrace?.hovertemplate).toContain("PMV: %{customdata[0]:.2f}");
    expect(tooltipTrace?.hovertemplate).toContain("PPD: %{customdata[1]:.1f}%");
    expect(chart.traces.filter(({ name }) => name?.startsWith("RH "))).toHaveLength(10);
    expectSaturationMaskToMatchCurve(chart);
    expect(chart.traces.some(({ name }) => name === "Input 1 comfort zone")).toBe(true);
    const comfortOutline = chart.traces.find(({ name }) => name === "Input 1 comfort zone");
    const neutralFill = bandFills.find(({ name }) => name?.includes("Neutral"));
    expect(comfortOutline?.fill).toBe("toself");
    expect(comfortOutline?.fillcolor).toBe(inputChartStyleById[InputId.Input1].fill);
    expect(neutralFill?.x).toEqual(comfortOutline?.x);
    expect(neutralFill?.y).toEqual(comfortOutline?.y);
    expect(chart.traces.some(({ name }) => name === "Input 1")).toBe(true);
    expect(chart.traces.find(({ name }) => name === "Input 1")?.hoverinfo).toBe("skip");
    expect(String(chart.layout.title)).toContain("ASHRAE");
    expect(chart.layout.xaxis.dtick).toBe(2);
    const assembled = assembleChart(chart.payload);
    const assembledNames = assembled.data.map(({ name }) => name);
    expect(assembled.layout.xaxis).toEqual(expect.objectContaining({
      dtick: 2,
      tickmode: "linear",
      tick0: 10,
    }));
    expect(assembledNames.indexOf("PMV bands: Neutral")).toBeGreaterThan(
      assembledNames.indexOf("Supersaturated region mask"),
    );
    expect(assembledNames.indexOf("RH 100%")).toBeGreaterThan(
      assembledNames.indexOf("PMV bands: Neutral"),
    );
    expect(assembledNames.indexOf("Input 1 comfort zone")).toBeGreaterThan(
      assembledNames.indexOf("RH 100%"),
    );
    expect(assembledNames.indexOf("PMV bands hover")).toBeGreaterThan(
      assembledNames.indexOf("Input 1 comfort zone"),
    );
    expect(assembledNames.indexOf("Input 1")).toBeGreaterThan(
      assembledNames.indexOf("PMV bands hover"),
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
    const warm = bandFills.find(({ name }) => name === "PMV bands: Warm");
    if (!warm?.x || !warm.y) throw new Error("Expected a Warm band fill.");

    bandFills.forEach((fill) => {
      expect(Math.min(...(fill.y ?? []))).toBeGreaterThanOrEqual(yMin);
      expect(Math.max(...(fill.y ?? []))).toBeLessThanOrEqual(yMax);
      expect(Math.min(...(fill.x ?? []))).toBeGreaterThanOrEqual(xMin);
      expect(Math.max(...(fill.x ?? []))).toBeLessThanOrEqual(xMax);
    });
    expect(Math.max(...warm.x)).toBe(xMax);
    expect(Math.min(...warm.y)).toBe(yMin);
  });

  it("covers the dry high-T corner on PPD psychrometric fills", () => {
    const chart = buildPsychrometric(
      pmvAshraeDeclaration,
      UnitSystem.SI,
      createSource(pmvAshraeDeclaration),
      ModelOutputKey.Ppd,
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
      "pmv-ashrae-psychrometric",
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
      "pmv-ashrae-psychrometric",
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
      typeof name === "string" && name.includes("Acceptable PMV range")
    ));
    const comfortOutline = compliance.traces.find(({ name }) => (
      name === "Input 1 comfort zone"
    ));
    expect(acceptableFill?.fillcolor).toBe(declaration.complianceProfile.bands[1].color);
    expect(acceptableFill?.x).toEqual(comfortOutline?.x);
    expect(ppd.traces.filter(({ contours }) => (
      contours?.type === "constraint" && contours.operation !== "="
    ))).toHaveLength(0);
    const ppdBandFills = ppd.traces.filter(({ name, fill }) => (
      typeof name === "string" && name.startsWith("PPD (%) bands:") && fill === "toself"
    ));
    expect(ppdBandFills.map(({ fillcolor }) => fillcolor)).toEqual(
      expect.arrayContaining(["#123456", "#abcdef"]),
    );
    expect(ppdHover?.hovertemplate).toContain("Band: %{text}");
    expect(ppdHover?.hovertemplate).toContain("PPD: %{customdata[0]:.1f}%");
    expect(ppdHover?.hovertemplate).toContain("PMV: %{customdata[1]:.2f}");
    expect(ppdInput?.hoverinfo).toBe("skip");
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
    const tooltipTrace = requireTrace(chart, "PMV bands hover");
    const tooltipValues = tooltipTrace.z?.flat() ?? [];
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
    expect(tooltipValues.some((value) => value === null)).toBe(true);
    expect(bandFillIndex).toBeGreaterThan(maskIndex);
    expect(rhCurveIndex).toBeGreaterThan(bandFillIndex);
    expect(comfortZoneIndex).toBeGreaterThan(rhCurveIndex);
    expect(chart.traces.indexOf(tooltipTrace)).toBeGreaterThan(comfortZoneIndex);
    expect(inputIndex).toBeGreaterThan(chart.traces.indexOf(tooltipTrace));
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
      declaration.psychrometricChartId,
      airModel.source,
      createResults(airModel.result),
      createContext(
        declaration,
        PhysicalQuantityId.DryBulbTemperature,
        PhysicalQuantityId.HumidityRatio,
        ModelOutputKey.Pmv,
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
      declaration.psychrometricChartId,
      operativeModel.source,
      createResults(operativeModel.result),
      createContext(
        declaration,
        PhysicalQuantityId.DryBulbTemperature,
        PhysicalQuantityId.HumidityRatio,
        ModelOutputKey.Pmv,
      ),
    );
    if (!operativeChart) throw new Error("Expected an Operative psychrometric chart.");
    const operativeSample = seen.find(({ tdb }) => Math.abs(tdb - sampleTdb) < 0.2);
    const comfortOutline = operativeChart.traces.find(({ name }) => (
      name === "Input 1 comfort zone"
    ));
    const neutralFill = operativeChart.traces.find(({ name, fill }) => (
      typeof name === "string" && name.includes("Neutral") && fill === "toself"
    ));

    expect(operativeModel.source.psychrometricTrEqualsTdb).toBe(true);
    expect(String(operativeChart.layout.xaxis.title)).toContain("Operative temperature");
    expect(String(operativeChart.layout.yaxis.title)).toContain("Humidity ratio");
    expect(operativeSample?.tr).toBeCloseTo(operativeSample?.tdb ?? Number.NaN, 6);
    expect(neutralFill?.x).toEqual(comfortOutline?.x);
    expect(neutralFill?.y).toEqual(comfortOutline?.y);
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
      const tooltipTraces = chart.traces.filter(({ name }) => name?.endsWith(" hover"));
      const inputTrace = chart.traces.find(({ name }) => name === "Input 1");

      expect(fillTraces.length).toBeGreaterThan(0);
      expect(chart.traces.every((trace) => !("hoveron" in trace))).toBe(true);
      expect(tooltipTraces).toHaveLength(1);
      expect(tooltipTraces[0].hoverongaps).toBe(false);
      expect(tooltipTraces[0].hovertemplate).toContain(
        outputKey === ModelOutputKey.Pmv ? "Zone:" : "Band:",
      );
      expect(tooltipTraces[0].hovertemplate).toContain("PMV:");
      expect(tooltipTraces[0].hovertemplate).toContain("PPD:");
      expect(inputTrace?.hoverinfo).toBe("skip");
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
    expect(chart.traces.find(({ name }) => name === "Input 1")?.hoverinfo)
      .toBe("skip");
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

    expect(fixedInput?.hoverinfo).toBe("skip");
    expect(exploreInput?.hoverinfo).toBe("skip");
    expect(
      explore.traces.find(({ name }) => name === "PMV bands hover")?.text?.flat(),
    ).toEqual(expect.arrayContaining([expectedZone]));
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
    const inputX = (chart: ChartFigure) => chart.traces
      .find(({ name }) => name === "Input 1")?.x?.[0];

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
      if (!lowerBoundary?.z || !lowerBoundary.y || !lowerBoundary.x) {
        throw new Error("Missing PMV boundary.");
      }
      const yValues = lowerBoundary.y;
      const rowIndex = yValues.reduce((bestIndex, value, index) => (
        Math.abs(value - 50) < Math.abs(yValues[bestIndex] - 50) ? index : bestIndex
      ), 0);
      const row = lowerBoundary.z[rowIndex];
      const crossingIndex = row.findIndex((value, index) => {
        const previous = row[index - 1];
        return (
          index > 0
          && value !== null
          && previous !== null
          && Number.isFinite(value)
          && Number.isFinite(previous)
          && (previous + 0.5) * (value + 0.5) <= 0
        );
      });
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
    expect(chart.traces.every((trace) => !("hoveron" in trace))).toBe(true);
    expect(inputTrace?.x?.[0]).toBeCloseTo(
      convertFieldValueFromSi(PhysicalQuantityId.DryBulbTemperature, input.tdb, UnitSystem.IP),
      6,
    );
  });
});
