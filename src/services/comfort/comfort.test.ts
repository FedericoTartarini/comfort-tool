import { describe, expect, it, vi } from "vitest";

import { inputDefaultsById, InputId } from "../../models/inputSlots";
import { AirSpeedInputMode, HumidityInputMode, OptionKey } from "../../models/inputModes";
import { DerivedInputId, FieldKey } from "../../models/fieldKeys";
import { UnitSystem } from "../../models/units";
import { buildComparePsychrometricChart, buildComfortZonePolygon } from "./charts/pmvCharts";
import { buildUtciTemperatureChart } from "./charts/utciCharts";
import { calculateComfortZone } from "./comfortZone";
import {
  deriveRelativeAirSpeedFromMeasured,
  deriveRelativeHumidityFromDewPoint,
} from "./derivations";
import { check_standard_compliance_array } from "jsthermalcomfort";
import {
  synchronizeControlInputState,
} from "./syncState";
import { pmv_ppd_ashrae, PMV_COMFORT_LIMIT } from "./pmv";
import { clothingGarmentOptions, clothingTypicalEnsembles, metabolicActivityOptions } from "./referenceValues";
import { calculateUtci } from "./utci";
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
  units: UnitSystem.SI,
};

const comfortZonePayload = {
  ...pmvPayload,
  rhMin: 0,
  rhMax: 100,
  rhPoints: 31,
};

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
    const comfortZone = calculateComfortZone(comfortZonePayload);

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
      const constrainedCompliance = check_standard_compliance_array("ASHRAE", {
        tdb: [constrainedPayload.tdb],
        tr: [constrainedPayload.tr],
        v: [constrainedPayload.vr],
        met: [constrainedPayload.met],
        clo: [constrainedPayload.clo],
        airspeed_control: constrainedPayload.occupantHasAirSpeedControl,
      });

      const constrainedResult = {
        ...constrainedPmv,
        isCompliant: !constrainedCompliance.tdb.some((value) => Number.isNaN(value))
          && !constrainedCompliance.tr.some((value) => Number.isNaN(value))
          && !constrainedCompliance.v.some((value) => Number.isNaN(value))
          && !(constrainedCompliance.met ?? []).some((value) => Number.isNaN(value))
          && !(constrainedCompliance.clo ?? []).some((value) => Number.isNaN(value))
          && Math.abs(constrainedPmv.pmv) <= PMV_COMFORT_LIMIT,
        standard: ComfortStandard.Ashrae55PmvPpd,
        source: CalculationSource.JsThermalComfort,
      };
      const constrainedComfortZone = calculateComfortZone({
        ...constrainedPayload,
        rhMin: 0,
        rhMax: 100,
        rhPoints: 31,
      });

      expect(constrainedResult.isCompliant).toBe(false);
      expect(constrainedComfortZone.coolEdge.length).toBeLessThan(31);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("builds PMV and UTCI charts from typed requests", () => {
    const comfortZone = calculateComfortZone(comfortZonePayload);
    const psychrometricChart = buildComparePsychrometricChart(
      {
        inputs: {
          [InputId.Input1]: comfortZonePayload,
        },
        chartRange: {
          tdbMin: 10,
          tdbMax: 40,
          tdbPoints: 121,
          humidityRatioMin: 0,
          humidityRatioMax: 0.03,
        },
        rhCurves: [10, 20, 30, 40, 50, 60],
      },
      {
        [InputId.Input1]: comfortZone,
      },
    );

    const utciResult = calculateUtci(utciPayload);
    const utciChart = buildUtciTemperatureChart(
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
    expect(utciChart.traces).toHaveLength(2);
    expect(utciChart.annotations).toHaveLength(0);
  });

  it("rebuilds chart labels and hover text for IP units", () => {
    const comfortZone = calculateComfortZone(comfortZonePayload);
    const psychrometricChart = buildComparePsychrometricChart(
      {
        inputs: {
          [InputId.Input1]: comfortZonePayload,
        },
        chartRange: {
          tdbMin: 10,
          tdbMax: 40,
          tdbPoints: 121,
          humidityRatioMin: 0,
          humidityRatioMax: 0.03,
        },
        rhCurves: [10, 20, 30, 40, 50, 60],
      },
      {
        [InputId.Input1]: comfortZone,
      },
      UnitSystem.IP,
    );

    const utciResult = calculateUtci(utciPayload);
    const utciChart = buildUtciTemperatureChart(
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
    expect(String(utciChart.layout.yaxis.title)).toContain("°F");
    expect(utciChart.traces[1].hovertemplate).toContain("°F");
  });

  it("smooths comfort-zone polygon x values while preserving solver output", () => {
    const comfortZone = calculateComfortZone(comfortZonePayload);
    const psychrometricChart = buildComparePsychrometricChart(
      {
        inputs: {
          [InputId.Input1]: comfortZonePayload,
        },
        chartRange: {
          tdbMin: 10,
          tdbMax: 40,
          tdbPoints: 121,
          humidityRatioMin: 0,
          humidityRatioMax: 0.03,
        },
        rhCurves: [10, 20, 30, 40, 50, 60],
      },
      {
        [InputId.Input1]: comfortZone,
      },
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
      },
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
