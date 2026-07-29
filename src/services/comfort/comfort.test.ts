import { describe, expect, it, vi } from "vitest";

import { inputDefaultsById, InputId } from "../../models/inputSlots";
import { AirSpeedInputMode, HumidityInputMode, OptionKey } from "../../models/inputModes";
import { DerivedInputId, FieldKey } from "../../models/fieldKeys";
import { UnitSystem } from "../../models/units";
import {
  ChartMode,
  ModelOutputKey,
  type ExploreFieldChartConfig,
} from "../../models/modelCapabilities";
import {
  buildComparePsychrometricChart,
  buildComfortZonePolygon,
  buildPmvDynamicChart,
  calculateComfortZone,
  pmvChartableOutputs,
  pmvZonesList,
  type PmvChartSourceDto,
} from "../../comfortModels/pmvShared";
import { pmvAshraeAdapter } from "../../comfortModels/pmvAshrae";
import { buildUtciStressChart, calculateUtci } from "../../comfortModels/utci";
import {
  deriveRelativeAirSpeedFromMeasured,
  deriveRelativeHumidityFromDewPoint,
} from "./derivations";
import { check_standard_compliance, pmv_ppd_ashrae } from "jsthermalcomfort";
import {
  synchronizeControlInputState,
} from "./syncState";
import { clothingGarmentOptions, clothingTypicalEnsembles, metabolicActivityOptions } from "./referenceValues";
import { CalculationSource, ComfortStandard } from "../../models/calculationMetadata";
import { ComfortModel, JsThermalComfortStandard } from "../../models/comfortModels";
import { predictClothingInsulation as predictClothingInsulationFromService } from "./clothingTools";

const pmvPayload = {
  tdb: 26,
  tr: 26,
  vr: 0.1,
  rh: 50,
  met: 1.2,
  clo: 0.5,
  wme: 0,
  occupantHasAirSpeedControl: true,
  standard: JsThermalComfortStandard.ASHRAE,
  units: UnitSystem.SI,
};

const comfortZonePayload = {
  ...pmvPayload,
  rhMin: 0,
  rhMax: 100,
  rhPoints: 31,
};

function createPmvChartRequest(
  inputs: PmvChartSourceDto["chartRequest"]["inputs"] = {
    [InputId.Input1]: comfortZonePayload,
  },
): PmvChartSourceDto["chartRequest"] {
  return {
    inputs,
    chartRange: {
      tdbMin: 10,
      tdbMax: 40,
      tdbPoints: 121,
      humidityRatioMin: 0,
      humidityRatioMax: 0.03,
    },
    rhCurves: [10, 20, 30, 40, 50, 60],
  };
}

function createPmvChartSource(
  chartRequest: PmvChartSourceDto["chartRequest"],
  comfortZonesByInput: PmvChartSourceDto["comfortZonesByInput"] = {},
): PmvChartSourceDto {
  return {
    modelId: ComfortModel.PmvAshrae,
    chartRequest,
    comfortZonesByInput,
    baselineInputId: InputId.Input1,
  };
}

function createPmvExploreConfig(
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

const utciPayload = {
  tdb: 30,
  tr: 32,
  v: 1.2,
  rh: 50,
  units: UnitSystem.SI,
};

describe("comfort services", () => {
  it("calculates PMV and comfort zone data", () => {
    const pmvResult = pmv_ppd_ashrae(
      pmvPayload.tdb,
      pmvPayload.tr,
      pmvPayload.vr,
      pmvPayload.rh,
      pmvPayload.met,
      pmvPayload.clo,
      pmvPayload.wme,
      {
        units: pmvPayload.units,
        limit_inputs: false,
        airspeed_control: pmvPayload.occupantHasAirSpeedControl,
      },
    );
    const comfortZone = calculateComfortZone(pmvAshraeAdapter, comfortZonePayload);

    expect(pmvResult.pmv).toBeTypeOf("number");
    expect(pmvResult.ppd).toBeGreaterThanOrEqual(0);
    expect(comfortZone.coolEdge.length).toBeGreaterThan(0);
    expect(comfortZone.warmEdge.length).toBeGreaterThan(0);
  });

  it("applies the no-local-control constraint to PMV acceptability and comfort zones", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const constrainedPayload = {
        ...pmvPayload,
        tdb: 24,
        tr: 24,
        vr: 0.4,
        occupantHasAirSpeedControl: false,
      };
      const constrainedPmv = pmv_ppd_ashrae(
        constrainedPayload.tdb,
        constrainedPayload.tr,
        constrainedPayload.vr,
        constrainedPayload.rh,
        constrainedPayload.met,
        constrainedPayload.clo,
        constrainedPayload.wme,
        {
          units: constrainedPayload.units,
          limit_inputs: false,
          airspeed_control: constrainedPayload.occupantHasAirSpeedControl,
        },
      );
      const constrainedComplianceWarnings = check_standard_compliance("ASHRAE", {
        tdb: constrainedPayload.tdb,
        tr: constrainedPayload.tr,
        v: constrainedPayload.vr,
        met: constrainedPayload.met,
        clo: constrainedPayload.clo,
        airspeed_control: constrainedPayload.occupantHasAirSpeedControl,
      });

      const constrainedResult = {
        ...constrainedPmv,
        isCompliant: constrainedComplianceWarnings.length === 0
          && pmvZonesList[3].contains(constrainedPmv.pmv),
        standard: ComfortStandard.Ashrae55PmvPpd,
        source: CalculationSource.JsThermalComfort,
      };
      const constrainedComfortZone = calculateComfortZone(pmvAshraeAdapter, {
        ...constrainedPayload,
        rhMin: 0,
        rhMax: 100,
        rhPoints: 31,
      });

      expect(constrainedResult.isCompliant).toBe(false);
      expect(constrainedComfortZone.coolEdge.length).toBeGreaterThan(0);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("builds PMV and UTCI charts from typed requests", () => {
    const comfortZone = calculateComfortZone(pmvAshraeAdapter, comfortZonePayload);
    const chartRequest = createPmvChartRequest();
    const psychrometricChart = buildComparePsychrometricChart(
      pmvAshraeAdapter,
      createPmvChartSource(chartRequest, {
        [InputId.Input1]: comfortZone,
      }),
    );

    const utciResult = calculateUtci(utciPayload);
    const utciChart = buildUtciStressChart(
      {
        inputs: {
          [InputId.Input1]: utciPayload,
        },
      },
      {
        [InputId.Input1]: utciResult,
      },
    );

    expect(psychrometricChart.traces.length).toBeGreaterThan(1);
    expect(psychrometricChart.traces[0].name).toContain("PMV");
    expect(psychrometricChart.traces[0].z).toHaveLength(50);
    expect(psychrometricChart.traces[0].z?.[0]).toHaveLength(50);
    expect(psychrometricChart.traces[0].isBackgroundZone).toBe(true);
    expect(psychrometricChart.traces.filter((trace) => trace.name.startsWith("RH "))).toHaveLength(6);
    const comfortZoneTrace = psychrometricChart.traces.find((trace) => trace.name.includes("comfort zone"));
    expect(comfortZoneTrace?.isComfortZone).toBe(true);
    expect(psychrometricChart.traces.at(-1)?.type).toBe("scatter");
    expect(psychrometricChart.traces.slice(0, 8).map((trace) => trace.name)).toEqual([
      "PMV (ASHRAE-55) Zones",
      "RH 10%",
      "RH 20%",
      "RH 30%",
      "RH 40%",
      "RH 50%",
      "RH 60%",
      "Input 1 comfort zone",
    ]);
    expect(psychrometricChart.traces[8].name).toBe("Input 1");
    expect(utciChart.traces).toHaveLength(3);
    expect(utciChart.annotations.length).toBeGreaterThan(0);
  });

  it.each([
    { unitSystem: UnitSystem.SI, expectedRange: [-50, 55] },
    { unitSystem: UnitSystem.IP, expectedRange: [-58, 131] },
  ])("keeps the UTCI stress chart finite in $unitSystem units", ({ unitSystem, expectedRange }) => {
    const utciResult = calculateUtci(utciPayload);
    const chart = buildUtciStressChart(
      {
        inputs: {
          [InputId.Input1]: utciPayload,
        },
      },
      {
        [InputId.Input1]: utciResult,
      },
      unitSystem,
    );
    const range = chart.layout.xaxis.range as number[];
    const bandCoordinates = chart.traces
      .slice(0, 2)
      .flatMap((trace) => trace.x ?? []);
    const annotationCoordinates = chart.annotations
      .map((annotation) => annotation.x)
      .filter((value): value is number => typeof value === "number");

    expect(range[0]).toBeCloseTo(expectedRange[0], 6);
    expect(range[1]).toBeCloseTo(expectedRange[1], 6);
    expect(bandCoordinates.every(Number.isFinite)).toBe(true);
    expect(annotationCoordinates).toHaveLength(10);
    expect(annotationCoordinates.every(Number.isFinite)).toBe(true);
  });

  it("keeps PMV psychrometric supersaturated grid cells empty", () => {
    const chartRequest = createPmvChartRequest();
    const psychrometricChart = buildComparePsychrometricChart(
      pmvAshraeAdapter,
      createPmvChartSource(chartRequest),
    );

    expect(Number.isNaN(psychrometricChart.traces[0].z?.[49]?.[0])).toBe(true);
    expect(psychrometricChart.traces[0].text?.[49]?.[0]).toBe("");
  });

  it("builds PMV dynamic chart with selected axes and input point", () => {
    const chartRequest = createPmvChartRequest();
    const dynamicChart = buildPmvDynamicChart(
      pmvAshraeAdapter,
      createPmvChartSource(chartRequest),
      createPmvExploreConfig(FieldKey.DryBulbTemperature, FieldKey.RelativeHumidity),
    );
    const inputTrace = dynamicChart.traces.find((trace) => trace.type === "scatter" && trace.name === "Input 1");

    expect(dynamicChart.traces[0].name).toBe("PMV bands");
    expect(dynamicChart.traces[0].isBackgroundZone).toBe(true);
    expect(dynamicChart.traces[0].z).toHaveLength(50);
    expect(dynamicChart.traces[0].z?.[0]).toHaveLength(50);
    expect(String(dynamicChart.layout.xaxis.title)).toContain("Air temperature");
    expect(String(dynamicChart.layout.yaxis.title)).toContain("Relative humidity");
    expect(inputTrace?.x).toEqual([26]);
    expect(inputTrace?.y).toEqual([50]);
    expect(inputTrace?.hovertemplate).toContain("PMV");
  });

  it("uses the selected baseline input for PMV dynamic contour evaluation", () => {
    const alternatePayload = {
      ...comfortZonePayload,
      met: 2.0,
      clo: 1.0,
    };
    const chartRequest = createPmvChartRequest({
        [InputId.Input1]: comfortZonePayload,
        [InputId.Input2]: alternatePayload,
    });
    const input1Source: PmvChartSourceDto = {
      modelId: ComfortModel.PmvAshrae,
      chartRequest,
      comfortZonesByInput: {},
      baselineInputId: InputId.Input1,
    };
    const input2Source: PmvChartSourceDto = {
      ...input1Source,
      baselineInputId: InputId.Input2,
    };

    const input1BaselineChart = buildPmvDynamicChart(
      pmvAshraeAdapter,
      input1Source,
      createPmvExploreConfig(FieldKey.DryBulbTemperature, FieldKey.RelativeHumidity),
      UnitSystem.SI,
    );
    const input2BaselineChart = buildPmvDynamicChart(
      pmvAshraeAdapter,
      input2Source,
      createPmvExploreConfig(FieldKey.DryBulbTemperature, FieldKey.RelativeHumidity),
      UnitSystem.SI,
    );

    expect(input1BaselineChart.traces[0].z?.[25]?.[25]).not.toBe(input2BaselineChart.traces[0].z?.[25]?.[25]);
    expect(input2BaselineChart.traces.filter((trace) => trace.type === "scatter")).toHaveLength(2);
  });

  it("rebuilds chart labels and hover text for IP units", () => {
    const comfortZone = calculateComfortZone(pmvAshraeAdapter, comfortZonePayload);
    const chartRequest = createPmvChartRequest();
    const psychrometricChart = buildComparePsychrometricChart(
      pmvAshraeAdapter,
      createPmvChartSource(chartRequest, {
        [InputId.Input1]: comfortZone,
      }),
      UnitSystem.IP,
    );

    const utciResult = calculateUtci(utciPayload);
    const utciChart = buildUtciStressChart(
      {
        inputs: {
          [InputId.Input1]: utciPayload,
        },
      },
      {
        [InputId.Input1]: utciResult,
      },
      UnitSystem.IP,
    );

    expect(String(psychrometricChart.layout.xaxis.title)).toContain("°F");
    expect(String(psychrometricChart.layout.yaxis.title)).toContain("gr/lb");
    expect(psychrometricChart.traces[0].hovertemplate).toContain("°F");
    expect(String(utciChart.layout.xaxis.title)).toContain("°F");
    const utciInputTrace = utciChart.traces.find((trace) => trace.type === "scatter" && trace.name === "Input 1");
    expect(utciInputTrace).toBeDefined();
    expect(utciInputTrace?.hovertemplate).toContain("°F");
  });

  it("smooths comfort-zone polygon x values while preserving solver output", () => {
    const comfortZone = calculateComfortZone(pmvAshraeAdapter, comfortZonePayload);
    const chartRequest = createPmvChartRequest();
    const psychrometricChart = buildComparePsychrometricChart(
      pmvAshraeAdapter,
      createPmvChartSource(chartRequest, {
        [InputId.Input1]: comfortZone,
      }),
    );

    const comfortPolygon = psychrometricChart.traces.find((trace) => trace.name.includes("comfort zone"));
    const { polygonX } = buildComfortZonePolygon(
      comfortZone.coolEdge,
      comfortZone.warmEdge,
      (point) => Math.round(point.tdb * 1000) / 1000,
      (point) => point.rh,
    );
    const middleIndex = Math.floor(comfortZone.coolEdge.length / 2);

    expect(comfortPolygon).toBeDefined();
    expect(comfortPolygon?.x).toEqual(polygonX);
    expect(comfortZone.coolEdge[middleIndex].tdb).not.toBe(polygonX[middleIndex]);
  });

  it("normalizes clothing prediction results from jsthermalcomfort", () => {
    const predictedClothing = predictClothingInsulationFromService(10, UnitSystem.SI);

    expect(predictedClothing).toBeTypeOf("number");
    expect(predictedClothing).toBeGreaterThan(0);
  });

  it("sources met and clo option values from jsthermalcomfort", () => {
    expect(metabolicActivityOptions.find((option) => option.label === "Sleeping")?.met).toBe(0.7);
    expect(metabolicActivityOptions.find((option) => option.label === "Basketball")?.met).toBe(6.3);
    expect(clothingTypicalEnsembles.find((option) => option.label === "Trousers, long-sleeve shirt")?.clo).toBe(0.61);
    expect(clothingGarmentOptions.find((option) => option.article === "Metal chair")?.clo).toBe(0);
    expect(clothingGarmentOptions.find((option) => option.article === "Double-breasted coat (thick)")?.clo).toBe(0.48);
  });

  it("synchronizes canonical inputs from measured air speed and dew point overrides", () => {
    const synchronizedState = synchronizeControlInputState(
      {
        ...inputDefaultsById[InputId.Input1],
        [FieldKey.DryBulbTemperature]: 26,
        [FieldKey.MetabolicRate]: 1.8,
      } as any,
      {
        [OptionKey.AirSpeedInputMode]: AirSpeedInputMode.Measured,
        [OptionKey.HumidityInputMode]: HumidityInputMode.DewPoint,
      },
      {
        [DerivedInputId.MeasuredAirSpeed]: 0.6,
        [DerivedInputId.DewPoint]: 12,
      },
    );

    expect(synchronizedState.inputState[FieldKey.RelativeAirSpeed]).toBeCloseTo(
      deriveRelativeAirSpeedFromMeasured(0.6, 1.8),
      6,
    );
    expect(synchronizedState.inputState[FieldKey.RelativeHumidity]).toBeCloseTo(
      deriveRelativeHumidityFromDewPoint(26, 12),
      6,
    );
  });
});
