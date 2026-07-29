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
    const siZoneTrace = siChart.traces.find((trace) => trace.type === "contour" && trace.isBackgroundZone);
    const siInputTrace = siChart.traces.find((trace) => trace.type === "scatter" && trace.mode === "markers");
    const ipInputTrace = ipChart.traces.find((trace) => trace.type === "scatter" && trace.mode === "markers");

    expect(siZoneTrace?.z).toHaveLength(50);
    expect(siZoneTrace?.z?.[0]).toHaveLength(50);
    expect(siZoneTrace?.hoverMetadata?.[0]?.[0]).toHaveLength(1);
    expect(siInputTrace?.x).toEqual([25]);
    expect(siInputTrace?.y).toEqual([50]);
    expect(ipInputTrace?.x).toEqual([77]);
    expect(ipInputTrace?.y).toEqual([50]);
    expect(String(siChart.layout.title)).toContain("Dynamic Chart");
    expect(String(ipChart.layout.xaxis.title)).toContain("°F");
  });

  it("switches the dynamic grid between declared PMV and PPD outputs", () => {
    const chartSource = createPmvChartSource(createPmvChartRequest());
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

    expect(String(pmvChart.layout.title)).toContain("PMV");
    expect(String(ppdChart.layout.title)).toContain("PPD");
    expect(pmvChart.traces[0].z).not.toEqual(ppdChart.traces[0].z);
    expect(ppdChart.traces[0].hovertemplate).toContain("PPD (%)");
    expect(ppdChart.traces[0].colorscale).toEqual([
      [0, "#86efac"],
      [0.5, "#86efac"],
      [0.5, "#fca5a5"],
      [1, "#fca5a5"],
    ]);
  });

  it.each([
    [FieldKey.OperativeTemperature, FieldKey.DryBulbTemperature],
    [FieldKey.DryBulbTemperature, FieldKey.OperativeTemperature],
    [FieldKey.OperativeTemperature, FieldKey.MeanRadiantTemperature],
    [FieldKey.MeanRadiantTemperature, FieldKey.OperativeTemperature],
  ] as const)("rejects PMV axes that overwrite the same request fields", (xAxis, yAxis) => {
    const chart = buildPmvDynamicChart(
      pmvAshraeAdapter,
      createPmvChartSource(createPmvChartRequest()),
      createExploreConfig(xAxis, yAxis),
      UnitSystem.SI,
    );

    expect(chart.traces).toEqual([]);
    expect(chart.layout.title).toBe("Invalid Axes Selection");
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

    expect(chart.layout.title).not.toBe("Invalid Axes Selection");
    expect(chart.traces.length).toBeGreaterThan(0);
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
