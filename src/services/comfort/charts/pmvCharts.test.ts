import { describe, expect, it } from "vitest";

import { CalculationSource } from "../../../models/calculationMetadata";
import { ComfortModel, JsThermalComfortStandard } from "../../../models/comfortModels";
import { FieldKey } from "../../../models/fieldKeys";
import { InputId } from "../../../models/inputSlots";
import { UnitSystem } from "../../../models/units";
import {
  ChartMode,
  ModelOutputKey,
  type ExploreFieldChartConfig,
} from "../../../models/modelCapabilities";
import {
  buildComparePsychrometricChart,
  buildPmvDynamicChart,
  pmvChartableOutputs,
  type ComfortZoneRequestDto,
  type PmvChartInputsRequestDto,
  type PmvChartSourceDto,
  type PmvStandardAdapter,
} from "../../../comfortModels/pmvShared";
import { pmvAshraeAdapter } from "../../../comfortModels/pmvAshrae";
import { pmvIsoAdapter } from "../../../comfortModels/pmvIso";

function createPmvInput(overrides: Partial<ComfortZoneRequestDto> = {}): ComfortZoneRequestDto {
  return {
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
    rhPoints: 9,
    ...overrides,
  };
}

function createPmvChartRequest(input = createPmvInput()): PmvChartInputsRequestDto {
  return {
    inputs: {
      [InputId.Input1]: input,
    },
    chartRange: {
      tdbMin: 10,
      tdbMax: 40,
      tdbPoints: 121,
      humidityRatioMin: 0,
      humidityRatioMax: 0.03,
    },
    rhCurves: [50, 100],
  };
}

function createPmvChartSource(
  chartRequest: PmvChartInputsRequestDto,
  modelId: PmvChartSourceDto["modelId"] = ComfortModel.PmvAshrae,
): PmvChartSourceDto {
  return {
    modelId,
    chartRequest,
    comfortZonesByInput: {},
    baselineInputId: InputId.Input1,
  };
}

function createExploreConfig(
  xField: FieldKey,
  yField: FieldKey,
  zOutput = ModelOutputKey.Pmv,
): ExploreFieldChartConfig {
  const output = pmvChartableOutputs.find(({ key }) => key === zOutput)!;
  return {
    mode: ChartMode.Explore,
    xField,
    yField,
    zOutput,
    bands: output.defaultBands,
  };
}

function getFirstConstraintFill(
  chart: ReturnType<typeof buildPmvDynamicChart>,
) {
  return chart.traces.find((trace) => (
    trace.contours?.type === "constraint" && trace.contours.operation !== "="
  ));
}

function getFirstHitRegion(
  chart: ReturnType<typeof buildPmvDynamicChart>,
) {
  return chart.traces.find((trace) => trace.hoveron === "fills");
}

describe("PMV charts", () => {
  it("builds the psychrometric chart with PMV zones, RH curves, comfort overlay, and SI input markers", () => {
    const chartRequest = createPmvChartRequest();
    const chart = buildComparePsychrometricChart(
      pmvAshraeAdapter,
      createPmvChartSource(chartRequest),
      UnitSystem.SI,
    );
    const zoneTrace = chart.traces.find((trace) => trace.type === "contour" && trace.isBackgroundZone);
    const comfortPolygon = chart.traces.find((trace) => trace.type === "scatter" && trace.isComfortZone);
    const inputTrace = chart.traces.find((trace) => trace.type === "scatter" && trace.mode === "markers");

    expect(chart.source).toBe(CalculationSource.FrontendGenerated);
    expect(chart.traces.map((trace) => trace.name)).toEqual([
      "PMV (ASHRAE-55) Zones",
      "RH 50%",
      "RH 100%",
      "Input 1 comfort zone",
      "Input 1",
    ]);
    expect(zoneTrace?.z).toHaveLength(50);
    expect(zoneTrace?.z?.[0]).toHaveLength(50);
    expect(Number.isNaN((zoneTrace?.z as number[][])[49][0])).toBe(true);
    expect(comfortPolygon?.x?.length).toBeGreaterThan(0);
    expect(comfortPolygon?.y?.length).toBeGreaterThan(0);
    expect(inputTrace?.x).toEqual([25]);
    expect((inputTrace?.y?.[0] as number)).toBeGreaterThan(0);
    expect((inputTrace?.y?.[0] as number)).toBeLessThan(25);
    expect(inputTrace?.hovertemplate).toContain("PMV");
    expect(String(chart.layout.xaxis.title)).toContain("Air temperature");
    expect(String(chart.layout.yaxis.title)).toContain("Humidity ratio");
  });

  it("converts psychrometric chart axes and input markers for IP display", () => {
    const chartRequest = createPmvChartRequest();
    const siChart = buildComparePsychrometricChart(
      pmvAshraeAdapter,
      createPmvChartSource(chartRequest),
      UnitSystem.SI,
    );
    const ipChart = buildComparePsychrometricChart(
      pmvAshraeAdapter,
      createPmvChartSource(chartRequest),
      UnitSystem.IP,
    );
    const siInputTrace = siChart.traces.find((trace) => trace.type === "scatter" && trace.mode === "markers");
    const ipInputTrace = ipChart.traces.find((trace) => trace.type === "scatter" && trace.mode === "markers");
    const siRhTrace = siChart.traces.find((trace) => trace.name === "RH 50%");
    const ipRhTrace = ipChart.traces.find((trace) => trace.name === "RH 50%");

    expect(ipInputTrace?.x).toEqual([77]);
    expect((ipInputTrace?.y?.[0] as number)).toBeGreaterThan(siInputTrace?.y?.[0] as number);
    expect(ipRhTrace?.x?.[0] as number).toBeGreaterThan(siRhTrace?.x?.[0] as number);
    expect(ipRhTrace?.y?.[0] as number).toBeGreaterThan(siRhTrace?.y?.[0] as number);
    expect(String(ipChart.layout.xaxis.title)).toContain("°F");
    expect(String(ipChart.layout.yaxis.title)).toContain("gr/lb");
  });

  it("builds PMV dynamic charts from shared grid scaffolding in SI and IP", () => {
    const chartRequest = createPmvChartRequest();
    const siChart = buildPmvDynamicChart(
      pmvAshraeAdapter,
      createPmvChartSource(chartRequest),
      createExploreConfig(FieldKey.DryBulbTemperature, FieldKey.RelativeHumidity),
      UnitSystem.SI,
    );
    const ipChart = buildPmvDynamicChart(
      pmvAshraeAdapter,
      createPmvChartSource(chartRequest),
      createExploreConfig(FieldKey.DryBulbTemperature, FieldKey.RelativeHumidity),
      UnitSystem.IP,
    );
    const siFillTrace = getFirstConstraintFill(siChart);
    const siHitRegion = getFirstHitRegion(siChart);
    const siBoundaryValues = siChart.traces
      .filter((trace) => trace.contours?.operation === "=")
      .map((trace) => trace.contours.value);
    const siInputTrace = siChart.traces.find((trace) => trace.type === "scatter" && trace.mode === "markers");
    const ipInputTrace = ipChart.traces.find((trace) => trace.type === "scatter" && trace.mode === "markers");

    expect(siFillTrace?.z).toHaveLength(50);
    expect(siFillTrace?.z?.[0]).toHaveLength(50);
    expect(siFillTrace?.hoverinfo).toBe("skip");
    expect(siHitRegion?.text?.[0]).toBe("Cold");
    expect(siHitRegion?.hoverMetadata?.[0]).toHaveLength(2);
    expect(siHitRegion?.hovertemplate).toContain("<b>Zone: %{text}</b>");
    expect(siHitRegion?.hovertemplate).toContain("PMV: %{customdata[0]:.2f}");
    expect(siHitRegion?.hovertemplate).toContain("PPD: %{customdata[1]:.1f}%");
    expect(siBoundaryValues).toEqual([-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]);
    expect(siInputTrace?.x).toEqual([25]);
    expect(siInputTrace?.y).toEqual([50]);
    expect(ipInputTrace?.x).toEqual([77]);
    expect(ipInputTrace?.y).toEqual([50]);
    expect(String(siChart.layout.title)).toContain("Dynamic Chart");
    expect(String(ipChart.layout.xaxis.title)).toContain("°F");
  });

  it("switches the dynamic grid between declared PMV and PPD outputs", () => {
    const targetInput = createPmvInput({
      tdb: 26,
      tr: 25,
      vr: 0.1,
      rh: 50,
      met: 1,
      clo: 0.51,
    });
    const chartSource = createPmvChartSource(createPmvChartRequest(targetInput));
    const pmvChart = buildPmvDynamicChart(
      pmvAshraeAdapter,
      chartSource,
      createExploreConfig(FieldKey.DryBulbTemperature, FieldKey.RelativeHumidity),
      UnitSystem.SI,
    );
    const ppdChart = buildPmvDynamicChart(
      pmvAshraeAdapter,
      chartSource,
      createExploreConfig(
        FieldKey.DryBulbTemperature,
        FieldKey.RelativeHumidity,
        ModelOutputKey.Ppd,
      ),
      UnitSystem.SI,
    );

    const pmvFillTrace = getFirstConstraintFill(pmvChart);
    const ppdFillTrace = getFirstConstraintFill(ppdChart);
    const pmvHitRegion = getFirstHitRegion(pmvChart);
    const ppdHitRegion = getFirstHitRegion(ppdChart);
    const pmvInputTrace = pmvChart.traces.find(
      (trace) => trace.type === "scatter" && trace.mode === "markers",
    );
    const ppdInputTrace = ppdChart.traces.find(
      (trace) => trace.type === "scatter" && trace.mode === "markers",
    );
    const ppdFillColors = ppdChart.traces
      .filter((trace) => trace.contours?.type === "constraint" && trace.contours.operation !== "=")
      .map((trace) => trace.fillcolor);
    const ppdBoundaryValues = ppdChart.traces
      .filter((trace) => trace.contours?.operation === "=")
      .map((trace) => trace.contours.value);

    expect(String(pmvChart.layout.title)).toContain("PMV");
    expect(String(ppdChart.layout.title)).toContain("PPD");
    expect(pmvFillTrace?.z).not.toEqual(ppdFillTrace?.z);
    expect(pmvHitRegion?.hovertemplate).toContain("<b>Zone: %{text}</b>");
    expect(pmvHitRegion?.hovertemplate).toContain("PMV: %{customdata[0]:.2f}");
    expect(pmvHitRegion?.hovertemplate).toContain("PPD: %{customdata[1]:.1f}%");
    expect(ppdHitRegion?.hovertemplate).toContain("<b>Band: %{text}</b>");
    expect(ppdHitRegion?.hovertemplate).toContain("PMV: %{customdata[1]:.2f}");
    expect(ppdHitRegion?.hovertemplate).toContain("PPD: %{customdata[0]:.1f}%");
    expect(pmvHitRegion?.hoverMetadata?.[0]).toHaveLength(2);
    expect(ppdHitRegion?.hoverMetadata?.[0]).toHaveLength(2);
    expect(pmvInputTrace?.hovertemplate).toContain("<b>Zone: Neutral</b>");
    expect(pmvInputTrace?.hovertemplate).toContain("PMV: -0.19");
    expect(pmvInputTrace?.hovertemplate).toContain("PPD: 5.7%");
    expect(ppdInputTrace?.hovertemplate).toContain("<b>Band: Acceptable dissatisfaction (< 10%)</b>");
    expect(ppdInputTrace?.hovertemplate).toContain("PMV: -0.19");
    expect(ppdInputTrace?.hovertemplate).toContain("PPD: 5.7%");
    expect(ppdFillColors).toEqual(["#86efac", "#fca5a5"]);
    expect(ppdBoundaryValues).toEqual([10]);
  });

  it("uses continuous constraint contours for both PMV standards", () => {
    const ashraeChart = buildPmvDynamicChart(
      pmvAshraeAdapter,
      createPmvChartSource(createPmvChartRequest()),
      createExploreConfig(FieldKey.DryBulbTemperature, FieldKey.RelativeHumidity),
      UnitSystem.SI,
    );
    const isoInput = createPmvInput({
      standard: JsThermalComfortStandard.ISO,
      occupantHasAirSpeedControl: false,
    });
    const isoChart = buildPmvDynamicChart(
      pmvIsoAdapter,
      createPmvChartSource(
        createPmvChartRequest(isoInput),
        ComfortModel.PmvIso,
      ),
      createExploreConfig(FieldKey.DryBulbTemperature, FieldKey.RelativeHumidity),
      UnitSystem.SI,
    );
    const getBoundaryValues = (chart: typeof ashraeChart) => chart.traces
      .filter((trace) => trace.contours?.operation === "=")
      .map((trace) => trace.contours.value);

    expect(getBoundaryValues(ashraeChart)).toEqual([-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]);
    expect(getBoundaryValues(isoChart)).toEqual([-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]);
    expect(getFirstConstraintFill(ashraeChart)?.z).toHaveLength(50);
    expect(getFirstConstraintFill(isoChart)?.z).toHaveLength(50);
  });

  it.each([ModelOutputKey.Pmv, ModelOutputKey.Ppd])(
    "evaluates each 50×50 dynamic grid point once for %s",
    (outputKey) => {
      let calculationCount = 0;
      const countingAdapter: PmvStandardAdapter = {
        ...pmvAshraeAdapter,
        calculate: (request) => {
          calculationCount += 1;
          return pmvAshraeAdapter.calculate(request);
        },
      };

      buildPmvDynamicChart(
        countingAdapter,
        createPmvChartSource(createPmvChartRequest()),
        createExploreConfig(
          FieldKey.DryBulbTemperature,
          FieldKey.RelativeHumidity,
          outputKey,
        ),
        UnitSystem.SI,
      );

      expect(calculationCount).toBe(50 * 50 + 1);
    },
  );

  it("keeps RH 50% constraint intersections within 0.1°C of continuous PMV roots", () => {
    const input = createPmvInput({
      tdb: 26,
      tr: 25,
      vr: 0.1,
      rh: 50,
      met: 1,
      clo: 0.51,
    });
    const chart = buildPmvDynamicChart(
      pmvAshraeAdapter,
      createPmvChartSource(createPmvChartRequest(input)),
      createExploreConfig(FieldKey.DryBulbTemperature, FieldKey.RelativeHumidity),
      UnitSystem.SI,
    );
    const fillTrace = getFirstConstraintFill(chart);
    const xValues = fillTrace?.x ?? [];
    const yValues = fillTrace?.y ?? [];
    const zValues = fillTrace?.z ?? [];
    const upperYIndex = yValues.findIndex((value) => value > 50);
    const lowerYIndex = upperYIndex - 1;
    const yFraction = (50 - yValues[lowerYIndex])
      / (yValues[upperYIndex] - yValues[lowerYIndex]);
    const pmvAtRh50 = xValues.map((_, xIndex) => (
      zValues[lowerYIndex][xIndex]
      + (zValues[upperYIndex][xIndex] - zValues[lowerYIndex][xIndex]) * yFraction
    ));
    const thresholds = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5];

    const interpolatedRoots = thresholds.map((threshold) => {
      const upperXIndex = pmvAtRh50.findIndex((value) => value >= threshold);
      const lowerXIndex = upperXIndex - 1;
      const fraction = (threshold - pmvAtRh50[lowerXIndex])
        / (pmvAtRh50[upperXIndex] - pmvAtRh50[lowerXIndex]);
      return xValues[lowerXIndex]
        + (xValues[upperXIndex] - xValues[lowerXIndex]) * fraction;
    });
    const continuousRoots = thresholds.map((threshold) => {
      let lower = 10;
      let upper = 40;
      for (let iteration = 0; iteration < 60; iteration += 1) {
        const midpoint = (lower + upper) / 2;
        const pmv = pmvAshraeAdapter.calculate({
          ...input,
          tdb: midpoint,
          rh: 50,
        }).pmv;
        if (pmv < threshold) {
          lower = midpoint;
        } else {
          upper = midpoint;
        }
      }
      return (lower + upper) / 2;
    });

    expect(interpolatedRoots).toHaveLength(6);
    interpolatedRoots.forEach((root, index) => {
      expect(Math.abs(root - continuousRoots[index])).toBeLessThanOrEqual(0.1);
    });
  });

  it.each([
    [FieldKey.OperativeTemperature, FieldKey.DryBulbTemperature],
    [FieldKey.DryBulbTemperature, FieldKey.OperativeTemperature],
    [FieldKey.OperativeTemperature, FieldKey.MeanRadiantTemperature],
    [FieldKey.MeanRadiantTemperature, FieldKey.OperativeTemperature],
  ] as const)("keeps coupled PMV component/operative axes chartable", (xAxis, yAxis) => {
    const chart = buildPmvDynamicChart(
      pmvAshraeAdapter,
      createPmvChartSource(createPmvChartRequest()),
      createExploreConfig(xAxis, yAxis),
      UnitSystem.SI,
    );

    expect(chart.layout.title).toContain("Dynamic Chart");
    expect(chart.traces.some((trace) => (
      trace.type === "contour"
      && trace.z?.flat().some(Number.isFinite)
    ))).toBe(true);
  });

  it.each([
    [FieldKey.DryBulbTemperature, FieldKey.MeanRadiantTemperature],
    [FieldKey.OperativeTemperature, FieldKey.RelativeHumidity],
  ] as const)("keeps independent PMV axis pairs chartable", (xAxis, yAxis) => {
    const chart = buildPmvDynamicChart(
      pmvAshraeAdapter,
      createPmvChartSource(createPmvChartRequest()),
      createExploreConfig(xAxis, yAxis),
      UnitSystem.SI,
    );

    expect(chart.layout.title).toContain("Dynamic Chart");
    expect(chart.traces.length).toBeGreaterThan(0);
  });

  it("fails directly when PMV dynamic axes violate the state invariant", () => {
    expect(() => buildPmvDynamicChart(
      pmvAshraeAdapter,
      createPmvChartSource(createPmvChartRequest()),
      createExploreConfig(
        FieldKey.DryBulbTemperature,
        FieldKey.DryBulbTemperature,
      ),
      UnitSystem.SI,
    )).toThrow(/dynamic axis pair/i);
  });

  it("uses each PMV standard's clothing limit for dynamic chart axes", () => {
    const ashraeChart = buildPmvDynamicChart(
      pmvAshraeAdapter,
      createPmvChartSource(createPmvChartRequest()),
      createExploreConfig(FieldKey.ClothingInsulation, FieldKey.RelativeHumidity),
      UnitSystem.SI,
    );
    const isoInput = createPmvInput({
      standard: JsThermalComfortStandard.ISO,
      occupantHasAirSpeedControl: false,
      clo: 2,
    });
    const isoChart = buildPmvDynamicChart(
      pmvIsoAdapter,
      createPmvChartSource(
        createPmvChartRequest(isoInput),
        ComfortModel.PmvIso,
      ),
      createExploreConfig(FieldKey.ClothingInsulation, FieldKey.RelativeHumidity),
      UnitSystem.SI,
    );

    expect(ashraeChart.layout.xaxis.range).toEqual([0, 1.5]);
    expect(isoChart.layout.xaxis.range).toEqual([0, 2]);
  });
});
