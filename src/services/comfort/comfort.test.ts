import { describe, expect, it, vi } from "vitest";

import { inputDefaultsById, InputId } from "../../models/inputSlots";
import { AirSpeedInputMode, HumidityInputMode, OptionKey } from "../../models/inputModes";
import { DerivedInputId, FieldKey } from "../../models/fieldKeys";
import { UnitSystem } from "../../models/units";
import {
  ChartMode,
  ModelOutputKey,
  type ChartBuildContext,
  type ExploreFieldChartConfig,
} from "../../models/modelCapabilities";
import {
  buildComparePsychrometricChart,
  buildComfortZonePolygon,
  buildPmvDynamicChart,
  calculateComfortZone,
  pmvNeutralZone,
  pmvChartableOutputs,
  type PmvChartSourceDto,
} from "../../comfortModels/pmvShared";
import {
  pmvAshraeAdapter,
  pmvAshraeDeclaration,
} from "../../comfortModels/pmvAshrae";
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
};

const comfortZonePayload = {
  ...pmvPayload,
  rhMin: 0,
  rhMax: 100,
  rhPoints: 31,
};

function createPmvChartSource(
  inputs: PmvChartSourceDto["inputs"] = {
    [InputId.Input1]: comfortZonePayload,
  },
  comfortZonesByInput: PmvChartSourceDto["comfortZonesByInput"] = {},
): PmvChartSourceDto {
  return {
    inputs,
    comfortZonesByInput,
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

function createChartContext(
  unitSystem: UnitSystem = UnitSystem.SI,
  fieldChartConfig: ExploreFieldChartConfig | null = null,
  baselineInputId: InputId = InputId.Input1,
): ChartBuildContext {
  return {
    unitSystem,
    dynamicAxes: {
      xAxis: fieldChartConfig?.xField ?? FieldKey.DryBulbTemperature,
      yAxis: fieldChartConfig?.yField ?? FieldKey.RelativeHumidity,
    },
    baselineInputId,
    fieldChartConfig,
  };
}

const utciPayload = {
  tdb: 30,
  tr: 32,
  v: 1.2,
  rh: 50,
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
        units: UnitSystem.SI,
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
          units: UnitSystem.SI,
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
          && pmvNeutralZone.contains(constrainedPmv.pmv),
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
    const psychrometricChart = buildComparePsychrometricChart(
      pmvAshraeDeclaration,
      createPmvChartSource(undefined, {
        [InputId.Input1]: comfortZone,
      }),
      {},
      createChartContext(),
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
      createChartContext(),
    );

    expect(psychrometricChart.traces.length).toBeGreaterThan(1);
    expect(psychrometricChart.traces[0].name).toContain("PMV");
    expect(psychrometricChart.traces[0].z).toHaveLength(50);
    expect(psychrometricChart.traces[0].z?.[0]).toHaveLength(50);
    expect(psychrometricChart.traces[0].isBackgroundZone).toBe(true);
    expect(psychrometricChart.traces.filter((trace) => trace.name.startsWith("RH "))).toHaveLength(10);
    const comfortZoneTrace = psychrometricChart.traces.find((trace) => trace.name.includes("comfort zone"));
    expect(comfortZoneTrace?.isComfortZone).toBe(true);
    expect(psychrometricChart.traces[psychrometricChart.traces.length - 1]?.type)
      .toBe("scatter");
    expect(psychrometricChart.traces.slice(0, 12).map((trace) => trace.name)).toEqual([
      "PMV (ASHRAE-55) Zones",
      "RH 10%",
      "RH 20%",
      "RH 30%",
      "RH 40%",
      "RH 50%",
      "RH 60%",
      "RH 70%",
      "RH 80%",
      "RH 90%",
      "RH 100%",
      "Input 1 comfort zone",
    ]);
    expect(psychrometricChart.traces[12].name).toBe("Input 1");
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
      createChartContext(unitSystem),
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
    const psychrometricChart = buildComparePsychrometricChart(
      pmvAshraeDeclaration,
      createPmvChartSource(undefined, {
        [InputId.Input1]: calculateComfortZone(
          pmvAshraeAdapter,
          comfortZonePayload,
        ),
      }),
      {},
      createChartContext(),
    );

    expect(Number.isNaN(psychrometricChart.traces[0].z?.[49]?.[0])).toBe(true);
    expect(psychrometricChart.traces[0].text?.[49]?.[0]).toBe("");
  });

  it("builds PMV dynamic chart with selected axes and input point", () => {
    const fieldChartConfig = createPmvExploreConfig(
      FieldKey.DryBulbTemperature,
      FieldKey.RelativeHumidity,
    );
    const dynamicChart = buildPmvDynamicChart(
      pmvAshraeDeclaration,
      createPmvChartSource(),
      {},
      createChartContext(UnitSystem.SI, fieldChartConfig),
    );
    const inputTrace = dynamicChart.traces.find((trace) => trace.type === "scatter" && trace.name === "Input 1");
    const rawGridTrace = dynamicChart.traces.find((trace) => (
      trace.contours?.type === "constraint" && trace.contours.operation !== "="
    ));

    expect(rawGridTrace?.isBackgroundZone).toBe(true);
    expect(rawGridTrace?.z).toHaveLength(50);
    expect(rawGridTrace?.z?.[0]).toHaveLength(50);
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
    const chartInputs: PmvChartSourceDto["inputs"] = {
        [InputId.Input1]: comfortZonePayload,
        [InputId.Input2]: alternatePayload,
    };
    const input1Source: PmvChartSourceDto = {
      inputs: chartInputs,
      comfortZonesByInput: {},
    };
    const fieldChartConfig = createPmvExploreConfig(
      FieldKey.DryBulbTemperature,
      FieldKey.RelativeHumidity,
    );

    const input1BaselineChart = buildPmvDynamicChart(
      pmvAshraeDeclaration,
      input1Source,
      {},
      createChartContext(UnitSystem.SI, fieldChartConfig, InputId.Input1),
    );
    const input2BaselineChart = buildPmvDynamicChart(
      pmvAshraeDeclaration,
      input1Source,
      {},
      createChartContext(UnitSystem.SI, fieldChartConfig, InputId.Input2),
    );
    const input1GridTrace = input1BaselineChart.traces.find((trace) => (
      trace.contours?.type === "constraint" && trace.contours.operation !== "="
    ));
    const input2GridTrace = input2BaselineChart.traces.find((trace) => (
      trace.contours?.type === "constraint" && trace.contours.operation !== "="
    ));

    expect(input1GridTrace?.z?.[25]?.[25]).not.toBe(input2GridTrace?.z?.[25]?.[25]);
    expect(input2BaselineChart.traces.filter((trace) => trace.mode === "markers"))
      .toHaveLength(2);
  });

  it("rebuilds chart labels and hover text for IP units", () => {
    const comfortZone = calculateComfortZone(pmvAshraeAdapter, comfortZonePayload);
    const psychrometricChart = buildComparePsychrometricChart(
      pmvAshraeDeclaration,
      createPmvChartSource(undefined, {
        [InputId.Input1]: comfortZone,
      }),
      {},
      createChartContext(UnitSystem.IP),
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
      createChartContext(UnitSystem.IP),
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
    const psychrometricChart = buildComparePsychrometricChart(
      pmvAshraeDeclaration,
      createPmvChartSource(undefined, {
        [InputId.Input1]: comfortZone,
      }),
      {},
      createChartContext(),
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
