import { describe, expect, it } from "vitest";

import {
  pmvAshraeAdapter,
  pmvAshraeDeclaration,
} from "../../../comfortModels/pmvAshrae";
import {
  pmvIsoDeclaration,
} from "../../../comfortModels/pmvIso";
import {
  buildComparePsychrometricChart,
  buildPmvDynamicChart,
  calculateComfortZone,
  getPmvZoneMeta,
  solveDryBulbForTargetPmv,
  type ComfortZoneRequestDto,
  type PmvChartSourceDto,
  type PmvModelDeclaration,
  type PmvResponseDto,
  type PmvStandardAdapter,
} from "../../../comfortModels/pmvShared";
import type { PlotlyChartResponseDto } from "../../../models/comfortDtos";
import { CalculationSource } from "../../../models/calculationMetadata";
import { FieldKey, type FieldKey as FieldKeyType } from "../../../models/fieldKeys";
import { InputId } from "../../../models/inputSlots";
import {
  ChartMode,
  ModelOutputKey,
  type ChartBuildContext,
  type ModelOutputKey as ModelOutputKeyType,
} from "../../../models/modelCapabilities";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../../models/units";
import { convertFieldValueFromSi } from "../../units";

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

function createResult(
  declaration: PmvModelDeclaration,
  request: ComfortZoneRequestDto = input,
): PmvResponseDto {
  const result = declaration.adapter.calculate(request);
  return {
    ...result,
    vr: request.vr,
    isCompliant: declaration.adapter.checkApplicability(request).length === 0
      && result.pmv >= -0.5
      && result.pmv < 0.5,
    standard: declaration.adapter.resultStandard,
    source: CalculationSource.JsThermalComfort,
  };
}

function createSource(
  adapter: PmvStandardAdapter,
  request: ComfortZoneRequestDto = input,
): PmvChartSourceDto {
  return {
    inputs: { [InputId.Input1]: request },
    comfortZonesByInput: {
      [InputId.Input1]: calculateComfortZone(adapter, request),
    },
  };
}

function createContext(
  declaration: PmvModelDeclaration,
  xField: FieldKeyType,
  yField: FieldKeyType,
  outputKey: ModelOutputKeyType,
  unitSystem: UnitSystemType = UnitSystem.SI,
): ChartBuildContext {
  const output = declaration.chartableOutputs.find(({ key }) => key === outputKey);
  if (!output) throw new Error(`Missing PMV output: ${outputKey}`);
  return {
    unitSystem,
    dynamicAxes: { xAxis: xField, yAxis: yField },
    baselineInputId: InputId.Input1,
    fieldChartConfig: {
      mode: ChartMode.Explore,
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
  source = createSource(declaration.adapter),
): PlotlyChartResponseDto {
  return buildComparePsychrometricChart(
    declaration,
    source,
    { [InputId.Input1]: createResult(declaration) },
    {
      unitSystem,
      dynamicAxes: {
        xAxis: FieldKey.DryBulbTemperature,
        yAxis: FieldKey.RelativeHumidity,
      },
      baselineInputId: InputId.Input1,
      fieldChartConfig: null,
    },
  );
}

function buildDynamic(
  declaration: PmvModelDeclaration,
  xField: FieldKeyType,
  yField: FieldKeyType,
  outputKey: ModelOutputKeyType = ModelOutputKey.Pmv,
  unitSystem: UnitSystemType = UnitSystem.SI,
  request: ComfortZoneRequestDto = input,
): PlotlyChartResponseDto {
  return buildPmvDynamicChart(
    declaration,
    createSource(declaration.adapter, request),
    { [InputId.Input1]: createResult(declaration, request) },
    createContext(declaration, xField, yField, outputKey, unitSystem),
  );
}

describe("PMV charts", () => {
  it("builds the fixed psychrometric view with zones, RH curves, comfort polygon, and input", () => {
    const chart = buildPsychrometric(pmvAshraeDeclaration);
    const zoneTrace = chart.traces[0];

    expect(zoneTrace.type).toBe("contour");
    expect(zoneTrace.z).toHaveLength(50);
    expect(zoneTrace.z?.[0]).toHaveLength(50);
    expect(zoneTrace.hovertemplate).toContain("Zone: %{text}");
    expect(zoneTrace.hovertemplate).toContain("PMV: %{z:.2f}");
    expect(zoneTrace.hovertemplate).toContain("PPD: %{customdata[0]:.1f}%");
    expect(chart.traces.filter(({ name }) => name.startsWith("RH "))).toHaveLength(10);
    expect(chart.traces.some(({ name }) => name === "Input 1 comfort zone")).toBe(true);
    expect(chart.traces.some(({ name }) => name === "Input 1")).toBe(true);
    expect(String(chart.layout.title)).toContain("ASHRAE");
  });

  it("leaves supersaturated psychrometric cells uncolored and clamps evaluated RH to 100%", () => {
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
      createSource(pmvAshraeAdapter),
    );
    const zValues = chart.traces[0].z?.flat() ?? [];

    expect(zValues.some(Number.isNaN)).toBe(true);
    expect(zValues.some(Number.isFinite)).toBe(true);
    expect(maximumRh).toBeLessThanOrEqual(100);
  });

  it("converts psychrometric axes and markers only at the display boundary", () => {
    const siChart = buildPsychrometric(pmvAshraeDeclaration, UnitSystem.SI);
    const ipChart = buildPsychrometric(pmvAshraeDeclaration, UnitSystem.IP);
    const siInput = siChart.traces.find(({ name }) => name === "Input 1");
    const ipInput = ipChart.traces.find(({ name }) => name === "Input 1");

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
        FieldKey.DryBulbTemperature,
        FieldKey.RelativeHumidity,
        outputKey,
      );
      const fillTraces = chart.traces.filter(({ contours }) => (
        contours?.type === "constraint" && contours.operation !== "="
      ));
      const tooltipTraces = chart.traces.filter(({ name }) => name.endsWith(" hover"));
      const inputTrace = chart.traces.find(({ name }) => name === "Input 1");

      expect(fillTraces.length).toBeGreaterThan(0);
      expect(chart.traces.some(({ hoveron }) => hoveron === "fills")).toBe(false);
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

  it("keeps fixed and Explore classification consistent for the input point", () => {
    const result = createResult(pmvAshraeDeclaration);
    const expectedZone = getPmvZoneMeta(result.pmv).label;
    const fixed = buildPsychrometric(pmvAshraeDeclaration);
    const explore = buildDynamic(
      pmvAshraeDeclaration,
      FieldKey.DryBulbTemperature,
      FieldKey.RelativeHumidity,
    );
    const fixedInput = fixed.traces.find(({ name }) => name === "Input 1");
    const exploreInput = explore.traces.find(({ name }) => name === "Input 1");

    expect(fixedInput?.hovertemplate).toContain(`Zone: ${expectedZone}`);
    expect(exploreInput?.hovertemplate).toContain(`Zone: ${expectedZone}`);
  });

  it.each([
    [FieldKey.DryBulbTemperature, FieldKey.OperativeTemperature],
    [FieldKey.OperativeTemperature, FieldKey.DryBulbTemperature],
    [FieldKey.MeanRadiantTemperature, FieldKey.OperativeTemperature],
    [FieldKey.OperativeTemperature, FieldKey.MeanRadiantTemperature],
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
      FieldKey.OperativeTemperature,
      FieldKey.RelativeHumidity,
      ModelOutputKey.Pmv,
      UnitSystem.SI,
      operativeInput,
    );
    const isoOperative = buildDynamic(
      pmvIsoDeclaration,
      FieldKey.OperativeTemperature,
      FieldKey.RelativeHumidity,
      ModelOutputKey.Pmv,
      UnitSystem.SI,
      operativeInput,
    );
    const ashraeClothing = buildDynamic(
      pmvAshraeDeclaration,
      FieldKey.ClothingInsulation,
      FieldKey.RelativeHumidity,
    );
    const isoClothing = buildDynamic(
      pmvIsoDeclaration,
      FieldKey.ClothingInsulation,
      FieldKey.RelativeHumidity,
    );
    const inputX = (chart: PlotlyChartResponseDto) => chart.traces
      .find(({ name }) => name === "Input 1")?.x[0];

    expect(inputX(ashraeOperative)).toBe(23);
    expect(inputX(isoOperative)).toBeCloseTo(22.612, 3);
    expect(ashraeClothing.layout.xaxis.range).toEqual([0, 1.5]);
    expect(isoClothing.layout.xaxis.range).toEqual([0, 2]);
  });

  it("fails directly when Explore axes violate the state invariant", () => {
    expect(() => buildDynamic(
      pmvAshraeDeclaration,
      FieldKey.DryBulbTemperature,
      FieldKey.DryBulbTemperature,
    )).toThrow(/unsupported PMV dynamic axis pair/i);
  });

  it.each([pmvAshraeDeclaration, pmvIsoDeclaration])(
    "keeps RH 50% constraint crossings close to the continuous root for $label",
    (declaration) => {
      const chart = buildDynamic(
        declaration,
        FieldKey.DryBulbTemperature,
        FieldKey.RelativeHumidity,
      );
      const lowerBoundary = chart.traces.find(({ contours }) => (
        contours?.operation === "=" && contours.value === -0.5
      ));
      const root = solveDryBulbForTargetPmv(
        declaration.adapter,
        -0.5,
        50,
        input,
      );
      if (!lowerBoundary?.z || root === null) {
        throw new Error("Missing PMV boundary or root.");
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
      expect(Math.min(
        Math.abs(xValues[crossingIndex] - root),
        Math.abs(xValues[crossingIndex - 1] - root),
      )).toBeLessThan(0.7);
    },
  );

  it("keeps PMV grid hover complete in IP display", () => {
    const chart = buildDynamic(
      pmvAshraeDeclaration,
      FieldKey.DryBulbTemperature,
      FieldKey.RelativeHumidity,
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
    expect(chart.traces.some(({ hoveron }) => hoveron === "fills")).toBe(false);
    expect(inputTrace?.x[0]).toBeCloseTo(
      convertFieldValueFromSi(FieldKey.DryBulbTemperature, input.tdb, UnitSystem.IP),
      6,
    );
  });
});
