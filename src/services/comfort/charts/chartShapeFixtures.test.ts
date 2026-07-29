import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { PlotlyChartResponseDto } from "../../../models/comfortDtos";
import { ComfortModel, JsThermalComfortStandard } from "../../../models/comfortModels";
import { AdaptiveStandardMode } from "../../../models/inputModes";
import { FieldKey } from "../../../models/fieldKeys";
import { InputId } from "../../../models/inputSlots";
import { UnitSystem } from "../../../models/units";
import { ChartMode, ModelOutputKey } from "../../../models/modelCapabilities";
import {
  buildAdaptiveChart,
  buildAdaptiveDynamicChart,
} from "../../../comfortModels/adaptive";
import {
  buildComparePsychrometricChart,
  buildPmvDynamicChart,
  calculateComfortZone,
  pmvChartableOutputs,
  type ComfortZoneRequestDto,
  type PmvChartInputsRequestDto,
  type PmvChartSourceDto,
} from "../../../comfortModels/pmvShared";
import { pmvAshraeAdapter } from "../../../comfortModels/pmvAshrae";
import { buildUtciDynamicChart, utciModelConfig } from "../../../comfortModels/utci";

const pmvPayload: ComfortZoneRequestDto = {
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
};

const adaptivePayload = {
  tdb: 24,
  tr: 24,
  trm: 20.16,
  v: 0.1,
  units: UnitSystem.SI,
};

const utciPayload = {
  tdb: 25,
  tr: 25,
  v: 1,
  rh: 50,
  units: UnitSystem.SI,
};

function createPmvChartRequest(): PmvChartInputsRequestDto {
  return {
    inputs: {
      [InputId.Input1]: pmvPayload,
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

function createPmvChartSource(chartRequest: PmvChartInputsRequestDto): PmvChartSourceDto {
  return {
    modelId: ComfortModel.PmvAshrae,
    chartRequest,
    comfortZonesByInput: {
      [InputId.Input1]: calculateComfortZone(pmvAshraeAdapter, pmvPayload),
    },
    baselineInputId: InputId.Input1,
  };
}

function normalizeChartValue(value: unknown): unknown {
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NaN";
    if (!Number.isFinite(value)) return String(value);
    return Number(value.toFixed(4));
  }

  if (Array.isArray(value)) {
    return value.map(normalizeChartValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, nestedValue]) => [key, normalizeChartValue(nestedValue)]),
    );
  }

  return value;
}

function chartShapeHash(chart: PlotlyChartResponseDto): string {
  return createHash("sha256")
    .update(JSON.stringify(normalizeChartValue(chart)))
    .digest("hex");
}

describe("PMV and Adaptive chart shape fixtures", () => {
  it("keeps the PMV psychrometric chart DTO shape stable", () => {
    const chartRequest = createPmvChartRequest();
    const chartSource = createPmvChartSource(chartRequest);

    expect(chartShapeHash(buildComparePsychrometricChart(
      pmvAshraeAdapter,
      chartSource,
      UnitSystem.SI,
    ))).toBe("b8d399b1110cb8c1f4b52777e83bcf80267c24ec0e46e43472db58ece35e88ad");
  });

  it("keeps the PMV dynamic chart DTO shape stable", () => {
    const chartRequest = createPmvChartRequest();

    expect(chartShapeHash(buildPmvDynamicChart(
      pmvAshraeAdapter,
      createPmvChartSource(chartRequest),
      {
        mode: ChartMode.Explore,
        xField: FieldKey.DryBulbTemperature,
        yField: FieldKey.RelativeHumidity,
        zOutput: ModelOutputKey.Pmv,
        bands: pmvChartableOutputs[0].defaultBands,
      },
      UnitSystem.SI,
    ))).toBe("86296f881da4bfc9c25d8c210f9ed3329d61e18058cca31581941b09a6690f65");
  });

  it("keeps the Adaptive static chart DTO shape stable", () => {
    expect(chartShapeHash(buildAdaptiveChart(
      {
        inputs: {
          [InputId.Input1]: adaptivePayload as any,
        },
      },
      AdaptiveStandardMode.Ashrae,
      UnitSystem.SI,
    ))).toBe("fb745994a97042340949ed493a2b9014a701b498394dc090c41538e69f2ec0ce");
  });

  it("keeps the Adaptive outdoor dynamic chart DTO shape stable", () => {
    expect(chartShapeHash(buildAdaptiveDynamicChart(
      {
        inputs: {
          [InputId.Input1]: adaptivePayload as any,
        },
      },
      AdaptiveStandardMode.Ashrae,
      UnitSystem.SI,
      FieldKey.PrevailingMeanOutdoorTemperature,
      FieldKey.OperativeTemperature,
    ))).toBe("8fc5f61feadd879eaf10b791406ac0cd3d1c251218a33bc74cb8f95c6a2c92fa");
  });

  it("keeps the Adaptive non-outdoor dynamic chart DTO shape stable", () => {
    expect(chartShapeHash(buildAdaptiveDynamicChart(
      {
        inputs: {
          [InputId.Input1]: adaptivePayload as any,
        },
      },
      AdaptiveStandardMode.Ashrae,
      UnitSystem.SI,
      FieldKey.DryBulbTemperature,
      FieldKey.RelativeAirSpeed,
    ))).toBe("576cac4ab2ddbb327133132e2afd0d152e628d81b1920af8a28751b708bbac12");
  });

  it("keeps the UTCI dynamic chart DTO shape stable", () => {
    expect(chartShapeHash(buildUtciDynamicChart(
      {
        inputs: {
          [InputId.Input1]: utciPayload,
        },
      },
      {
        [InputId.Input1]: {
          utci: 25,
          stressCategory: "no thermal stress",
        },
      },
      UnitSystem.SI,
      {
        mode: ChartMode.Explore,
        xField: FieldKey.DryBulbTemperature,
        yField: FieldKey.RelativeHumidity,
        zOutput: ModelOutputKey.Utci,
        bands: utciModelConfig.chartableOutputs[0].defaultBands,
      },
      InputId.Input1,
    ))).toBe("286d22be0edd5d455ad011fc148514bd62c15369db96dc851450b92f2760901d");
  });
});
