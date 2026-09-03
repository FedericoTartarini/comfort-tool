import { describe, expect, it, vi } from "vitest";

import { inputDefaultsById, InputId } from "../../catalog/inputSlots";
import { inputChartStyleById } from "../../catalog/inputSlotPresentation";
import {
  AirSpeedControlMode,
  HumidityInputMode,
  OptionKey,
} from "../../catalog/inputModes";
import { PhysicalQuantityId } from "../../catalog/quantities";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../catalog/units";
import { type ChartBuildContext, type ExploreFieldChartConfig, type NumericBand } from "../../catalog/modelCapabilities";
import { ChartType } from "../../catalog/chartTypes";
import { FieldChartProfileKind } from "../../catalog/fieldChartProfile";

import {
  pmvAshraeAdapter,
  pmvAshraeDeclaration,
  pmvAshraeModelConfig,
} from "../../declarations/pmv/ashrae";
import {
  calculatePmvModel,
  type PmvChartSource,
} from "../../declarations/pmv/calculation";
import {
  calculateUtci,
  utciModelConfig,
} from "../../declarations/utci/utci";
import {
  deriveRelativeHumidityFromDewPoint,
} from "./derivations";
import { check_standard_compliance, pmv_ppd_ashrae } from "jsthermalcomfort";
import {
  derivePsychrometricSlots,
} from "./syncState";
import { synchronizeHumidityInputState } from "./controls/humidityControl";
import { clothingGarmentOptions, clothingTypicalEnsembles, metabolicActivityOptions } from "./referenceValues";
import { ComfortStandard } from "../../catalog/calculationMetadata";
import { predictClothingInsulation as predictClothingInsulationFromService } from "./clothingTools";
import { createModelCalculationContext } from "../../catalog/modelCalculation";
import { createPointSession } from "../../state/pointSession/createPointSession.svelte";
import { buildChartPlotly } from "../../testSupport/modelChartTestHelpers";
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

function calculatePmvModelForTest(
  inputs: PmvChartSource["inputs"] = {
    [InputId.Input1]: comfortZonePayload,
  },
  occupantHasAirSpeedControl = true,
) {
  const session = createPointSession();
  const visibleInputIds = Object.keys(inputs) as InputId[];
  for (const inputId of visibleInputIds) { const request = inputs[inputId];
    if (!request) continue;
    const inputState = session.input.quantitiesByInput[inputId];
    inputState[PhysicalQuantityId.DryBulbTemperature] = request.tdb;
    inputState[PhysicalQuantityId.MeanRadiantTemperature] = request.tr;
    inputState[PhysicalQuantityId.RelativeAirSpeed] = request.vr;
    inputState[PhysicalQuantityId.RelativeHumidity] = request.rh;
    inputState[PhysicalQuantityId.MetabolicRate] = request.met;
    inputState[PhysicalQuantityId.ClothingInsulation] = request.clo;
    inputState[PhysicalQuantityId.ExternalWork] = request.wme; }
  session.input.modelOptionsByModel[pmvAshraeModelConfig.id] = {
    ...pmvAshraeModelConfig.defaultOptions,
    [OptionKey.AirSpeedControlMode]: occupantHasAirSpeedControl
      ? AirSpeedControlMode.WithLocalControl
      : AirSpeedControlMode.NoLocalControl,
  };
  return calculatePmvModel(createModelCalculationContext({
    effectiveQuantitiesByInput: session.input.quantitiesByInput,
    options: session.input.modelOptionsByModel[pmvAshraeModelConfig.id],
  }), visibleInputIds, pmvAshraeAdapter);
}

function buildRegisteredPmvChart(
  instanceId: string,
  inputs: PmvChartSource["inputs"],
  context: ChartBuildContext<NumericBand>,
) {
  const calculation = calculatePmvModelForTest(inputs);
  const chart = buildChartPlotly(pmvAshraeModelConfig,
    instanceId,
    calculation.chartSource,
    calculation.valuesByInput,
    context,
  );
  if (!chart) throw new Error(`Expected registered PMV chart ${instanceId}.`);
  return { calculation, chart };
}

function buildRegisteredUtciChart(unitSystem: UnitSystemType = UnitSystem.SI) {
  const utciResult = calculateUtci(utciPayload);
  const chart = buildChartPlotly(
    utciModelConfig,
    ChartType.Utci,
    { inputs: { [InputId.Input1]: utciPayload } },
    {
      [InputId.Input1]: utciResult,
      [InputId.Input2]: null,
      [InputId.Input3]: null,
    },
    createChartContext(unitSystem, createUtciExploreConfig()),
  );
  if (!chart) throw new Error("Expected a UTCI chart.");
  return chart;
}

function createPmvExploreConfig(
  xField: PhysicalQuantityId,
  yField: PhysicalQuantityId,
  zOutput = PhysicalQuantityId.PredictedMeanVote,
): ExploreFieldChartConfig {
  const output = pmvAshraeDeclaration.exploreOutputs.find(({ key }) => key === zOutput)!;
  return {
    profileKind: FieldChartProfileKind.Explore,
    xField,
    yField,
    zOutput,
    bands: output.defaultBands,
  };
}

function createUtciExploreConfig(): ExploreFieldChartConfig {
  const output = utciModelConfig.exploreOutputs[0];
  return { profileKind: FieldChartProfileKind.Explore, xField: PhysicalQuantityId.DryBulbTemperature, yField: PhysicalQuantityId.RelativeHumidity, zOutput: output.key, bands: output.defaultBands };
}

function createChartContext(
  unitSystem: UnitSystem = UnitSystem.SI,
  fieldChartConfig: ExploreFieldChartConfig = createPmvExploreConfig(
    PhysicalQuantityId.DryBulbTemperature,
    PhysicalQuantityId.RelativeHumidity,
  ),
  baselineInputId: InputId = InputId.Input1,
): ChartBuildContext<NumericBand> {
  return {
    unitSystem,
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
    const calculation = calculatePmvModelForTest();
    const comfortZone = calculation.chartSource.comfortZonesByInput[InputId.Input1];

    expect(pmvResult.pmv).toBeTypeOf("number");
    expect(pmvResult.ppd).toBeGreaterThanOrEqual(0);
    expect(comfortZone?.coolEdge.length).toBeGreaterThan(0);
    expect(comfortZone?.warmEdge.length).toBeGreaterThan(0);
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

      const calculation = calculatePmvModelForTest({
        [InputId.Input1]: {
          ...constrainedPayload,
          rhMin: 0,
          rhMax: 100,
          rhPoints: 31,
        },
      }, false);
      const constrainedResult = calculation.valuesByInput[InputId.Input1];
      const constrainedComfortZone = calculation.chartSource
        .comfortZonesByInput[InputId.Input1];

      expect(constrainedComplianceWarnings).not.toEqual([]);
      expect(constrainedResult?.pmv).toBeCloseTo(constrainedPmv.pmv, 6);
      expect(Math.abs(constrainedResult?.pmv ?? Number.NaN))
        .toBeGreaterThan(pmv_ppd_ashrae.COMPLIANCE_LIMIT);
      expect(pmvAshraeAdapter.resultStandard).toBe(ComfortStandard.Ashrae55PmvPpd);
      expect(constrainedComfortZone?.coolEdge.length).toBeGreaterThan(0);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("builds PMV and UTCI charts from typed requests", () => {
    const { chart: psychrometricChart } = buildRegisteredPmvChart(
      "psychrometric",
      { [InputId.Input1]: comfortZonePayload },
      createChartContext(),
    );

    const utciChart = buildRegisteredUtciChart();

    expect(psychrometricChart.traces.length).toBeGreaterThan(1);
    expect(psychrometricChart.traces.find(({ name }) => name === "PMV bands hover"))
      .toBeUndefined();
    expect(psychrometricChart.traces.find(({ name }) => name === "Input 1")?.hovertemplate)
      .toContain("PMV:");
    expect(psychrometricChart.traces.filter((trace) => typeof trace.name === "string" && trace.name.startsWith("RH "))).toHaveLength(10);
    expect(
      psychrometricChart.payload.type === "psychrometric"
        ? psychrometricChart.payload.input.zones.some((zone) => (
          zone.name?.includes("comfort zone")
        ))
        : false,
    ).toBe(true);
    expect(psychrometricChart.traces[psychrometricChart.traces.length - 1]?.type)
      .toBe("scatter");
    expect(psychrometricChart.traces.filter(({ contours }) => (
      contours?.type === "constraint" && contours.operation !== "="
    ))).toHaveLength(0);
    expect(psychrometricChart.traces.filter(({ name, fill }) => (
      typeof name === "string" && name.startsWith("PMV bands:") && fill === "toself"
    )).length).toBeGreaterThan(0);
    expect(psychrometricChart.traces.find(({ name }) => name === "Input 1"))
      .toBeDefined();
    expect(utciChart.traces.find(({ name }) => name === "UTCI bands hover"))
      .toBeUndefined();
    expect(utciChart.traces.find(({ name }) => name === "Input 1"))
      .toBeDefined();
    expect(utciChart.annotations.length).toBeGreaterThan(0);
  });

  it.each([
    { unitSystem: UnitSystem.SI, expectedRange: [-50, 55] },
    { unitSystem: UnitSystem.IP, expectedRange: [-58, 131] },
  ])("keeps the UTCI stress chart finite in $unitSystem units", ({ unitSystem, expectedRange }) => {
    const chart = buildRegisteredUtciChart(unitSystem);
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

  it("does not evaluate a psychrometric hover grid above saturation", () => {
    const { chart: psychrometricChart } = buildRegisteredPmvChart(
      "psychrometric",
      { [InputId.Input1]: comfortZonePayload },
      createChartContext(),
    );

    expect(psychrometricChart.traces.find(({ name }) => name === "PMV bands hover"))
      .toBeUndefined();
    expect(psychrometricChart.traces.find(({ name }) => name === "Input 1")?.hoverinfo)
      .toBe("all");
  });

  it("builds PMV dynamic chart with selected axes and input point", () => {
    const fieldChartConfig = createPmvExploreConfig(
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.RelativeHumidity,
    );
    const { chart: dynamicChart } = buildRegisteredPmvChart(
      "dynamic",
      { [InputId.Input1]: comfortZonePayload },
      createChartContext(UnitSystem.SI, fieldChartConfig),
    );
    const inputTrace = dynamicChart.traces.find((trace) => trace.type === "scatter" && trace.name === "Input 1");
    const bandFills = dynamicChart.traces.filter(({ name, fill }) => (
      typeof name === "string" && name.startsWith("PMV bands:") && fill === "toself"
    ));

    expect(bandFills.length).toBeGreaterThan(0);
    expect(dynamicChart.traces.find(({ type }) => type === "contour")).toBeUndefined();
    expect(String(dynamicChart.layout.xaxis.title)).toContain("Air temperature");
    expect(String(dynamicChart.layout.yaxis.title)).toContain("Relative humidity");
    expect(inputTrace?.x).toEqual([26]);
    expect(inputTrace?.y).toEqual([50]);
    expect(inputTrace?.hoverinfo).toBe("all");
  });

  it("uses the selected baseline input for PMV dynamic isoline evaluation", () => {
    const alternatePayload = {
      ...comfortZonePayload,
      met: 2.0,
      clo: 1.0,
    };
    const chartInputs: PmvChartSource["inputs"] = {
        [InputId.Input1]: comfortZonePayload,
        [InputId.Input2]: alternatePayload,
    };
    const fieldChartConfig = createPmvExploreConfig(
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.RelativeHumidity,
    );

    const { chart: input1BaselineChart } = buildRegisteredPmvChart(
      "dynamic",
      chartInputs,
      createChartContext(UnitSystem.SI, fieldChartConfig, InputId.Input1),
    );
    const { chart: input2BaselineChart } = buildRegisteredPmvChart(
      "dynamic",
      chartInputs,
      createChartContext(UnitSystem.SI, fieldChartConfig, InputId.Input2),
    );
    const input1Fill = input1BaselineChart.traces.find(({ name, fill }) => (
      typeof name === "string" && name.includes("acceptable") && fill === "toself"
    ));
    const input2Fill = input2BaselineChart.traces.find(({ name, fill }) => (
      typeof name === "string" && name.includes("acceptable") && fill === "toself"
    ));

    expect(input1Fill?.x).toBeDefined();
    expect(input2Fill?.x).toBeDefined();
    expect(input1Fill?.x).not.toEqual(input2Fill?.x);
    expect(input2BaselineChart.traces.filter((trace) => trace.mode === "markers"))
      .toHaveLength(2);
  });

  it("rebuilds chart labels and hover text for IP units", () => {
    const { chart: psychrometricChart } = buildRegisteredPmvChart(
      "psychrometric",
      { [InputId.Input1]: comfortZonePayload },
      createChartContext(UnitSystem.IP),
    );

    const utciChart = buildRegisteredUtciChart(UnitSystem.IP);

    expect(String(psychrometricChart.layout.xaxis.title)).toContain("°F");
    expect(String(psychrometricChart.layout.yaxis.title)).toContain("gr/lb");
    expect(psychrometricChart.traces.find(({ name }) => name === "Input 1")?.hovertemplate)
      .toContain("°F");
    expect(String(utciChart.layout.xaxis.title)).toContain("°F");
    const utciInputTrace = utciChart.traces.find((trace) => trace.type === "scatter" && trace.name === "Input 1");
    expect(utciInputTrace).toBeDefined();
    expect(utciInputTrace?.hoverinfo).toBe("all");
  });

  it("closes the comfort-zone overlay along RH caps", () => {
    const { calculation, chart: psychrometricChart } = buildRegisteredPmvChart(
      "psychrometric",
      { [InputId.Input1]: comfortZonePayload },
      createChartContext(),
    );

    const comfortZone = calculation.chartSource.comfortZonesByInput[InputId.Input1];
    const comfortPolygon = psychrometricChart.traces.find(
      (trace) => trace.name?.includes("comfort zone"),
    );
    if (!comfortZone || !comfortPolygon?.x || !comfortPolygon.y) {
      throw new Error("Expected a registered PMV comfort-zone polygon.");
    }

    expect(comfortPolygon.fill).toBe("toself");
    expect(comfortPolygon.fillcolor).toBe(inputChartStyleById[InputId.Input1].fill);
    expect(comfortPolygon.x[0]).toBe(comfortPolygon.x[comfortPolygon.x.length - 1]);
    expect(comfortPolygon.y[0]).toBe(comfortPolygon.y[comfortPolygon.y.length - 1]);
    expect(comfortPolygon.x.length).toBeGreaterThan(
      comfortZone.coolEdge.length + comfortZone.warmEdge.length,
    );
  });

  it("normalizes clothing prediction results from jsthermalcomfort", () => {
    const predictedClothing = predictClothingInsulationFromService(10);

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

  it("synchronizes canonical relative humidity from a dew-point override", () => {
    const inputState = {
      ...inputDefaultsById[InputId.Input1],
      [PhysicalQuantityId.DryBulbTemperature]: 26,
    };
    const synchronizedState = synchronizeHumidityInputState(
      inputState,
      derivePsychrometricSlots(inputState),
      HumidityInputMode.DewPoint,
      {
        [PhysicalQuantityId.DewPointTemperature]: 12,
      },
    );

    expect(synchronizedState[PhysicalQuantityId.RelativeHumidity]).toBeCloseTo(
      deriveRelativeHumidityFromDewPoint(26, 12),
      6,
    );
  });
});
