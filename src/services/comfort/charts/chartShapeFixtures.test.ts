import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { PlotlyChartResponseDto } from "../../../models/comfortDtos";
import { FieldKey } from "../../../models/fieldKeys";
import { InputId } from "../../../models/inputSlots";
import { UnitSystem } from "../../../models/units";
import { ChartMode, ModelOutputKey } from "../../../models/modelCapabilities";
import {
  buildAdaptiveChart,
  buildAdaptiveDynamicChart,
  calculateAdaptive,
} from "../../../comfortModels/adaptiveShared";
import { adaptiveAshraeDeclaration } from "../../../comfortModels/adaptiveAshrae";
import {
  buildComparePsychrometricChart,
  buildPmvDynamicChart,
  calculateComfortZone,
  type ComfortZoneRequestDto,
  type PmvChartSourceDto,
} from "../../../comfortModels/pmvShared";
import {
  pmvAshraeAdapter,
  pmvAshraeDeclaration,
} from "../../../comfortModels/pmvAshrae";
import {
  buildUtciDynamicChart,
  calculateUtci,
  utciModelConfig,
} from "../../../comfortModels/utci";

const pmvPayload: ComfortZoneRequestDto = {
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
  rhPoints: 9,
};

const adaptivePayload = {
  tdb: 24,
  tr: 24,
  trm: 20.16,
  v: 0.1,
};

const utciPayload = {
  tdb: 25,
  tr: 25,
  v: 1,
  rh: 50,
};

function createPmvChartSource(): PmvChartSourceDto {
  return {
    inputs: {
      [InputId.Input1]: pmvPayload,
    },
    comfortZonesByInput: {
      [InputId.Input1]: calculateComfortZone(pmvAshraeAdapter, pmvPayload),
    },
  };
}

function fixedContext() {
  return {
    unitSystem: UnitSystem.SI,
    dynamicAxes: {
      xAxis: FieldKey.DryBulbTemperature,
      yAxis: FieldKey.RelativeHumidity,
    },
    baselineInputId: InputId.Input1,
    fieldChartConfig: null,
  } as const;
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
    const chartSource = createPmvChartSource();

    expect(chartShapeHash(buildComparePsychrometricChart(
      pmvAshraeDeclaration,
      chartSource,
      {},
      fixedContext(),
    ))).toBe("439a4d10378730abf1663272185c0d3bfa545f7108ed78ec535a10c28064ee7d");
  });

  it("keeps the PMV dynamic chart DTO shape stable", () => {
    expect(chartShapeHash(buildPmvDynamicChart(
      pmvAshraeDeclaration,
      createPmvChartSource(),
      {},
      {
        ...fixedContext(),
        fieldChartConfig: {
          mode: ChartMode.Explore,
          xField: FieldKey.DryBulbTemperature,
          yField: FieldKey.RelativeHumidity,
          zOutput: ModelOutputKey.Pmv,
          bands: pmvAshraeDeclaration.chartableOutputs[0].defaultBands,
        },
      },
    ))).toBe("bf34bae044504c09ec2307d34a0eee3bca7580472463b6fcff3950eacdb623ac");
  });

  it("keeps the Adaptive static chart DTO shape stable", () => {
    expect(chartShapeHash(buildAdaptiveChart(
      adaptiveAshraeDeclaration,
      {
        inputs: {
          [InputId.Input1]: adaptivePayload,
        },
      },
      { [InputId.Input1]: calculateAdaptive(adaptiveAshraeDeclaration, adaptivePayload) },
      fixedContext(),
    ))).toBe("cb219bf177f01bc53d43747f896838afe815466e677951c0404fd6a8c88058f3");
  });

  it("keeps the Adaptive outdoor dynamic chart DTO shape stable", () => {
    expect(chartShapeHash(buildAdaptiveDynamicChart(
      adaptiveAshraeDeclaration,
      {
        inputs: {
          [InputId.Input1]: adaptivePayload,
        },
      },
      { [InputId.Input1]: calculateAdaptive(adaptiveAshraeDeclaration, adaptivePayload) },
      {
        ...fixedContext(),
        dynamicAxes: {
          xAxis: FieldKey.PrevailingMeanOutdoorTemperature,
          yAxis: FieldKey.OperativeTemperature,
        },
      },
    ))).toBe("ac72b3f8b16db4a1f47479ad99aa4564715cb74265938d609371464673290dc5");
  });

  it("keeps the Adaptive non-outdoor dynamic chart DTO shape stable", () => {
    expect(chartShapeHash(buildAdaptiveDynamicChart(
      adaptiveAshraeDeclaration,
      {
        inputs: {
          [InputId.Input1]: adaptivePayload,
        },
      },
      { [InputId.Input1]: calculateAdaptive(adaptiveAshraeDeclaration, adaptivePayload) },
      {
        ...fixedContext(),
        dynamicAxes: {
          xAxis: FieldKey.DryBulbTemperature,
          yAxis: FieldKey.RelativeAirSpeed,
        },
      },
    ))).toBe("1bae5859f89cf557dc9afb13f2fc9b482616afa6bfe2ba0b598e2ec5ff1e112f");
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
          ...calculateUtci(utciPayload),
        },
      },
      {
        ...fixedContext(),
        fieldChartConfig: {
          mode: ChartMode.Explore,
          xField: FieldKey.DryBulbTemperature,
          yField: FieldKey.RelativeHumidity,
          zOutput: ModelOutputKey.Utci,
          bands: utciModelConfig.chartableOutputs[0].defaultBands,
        },
      },
    ))).toBe("640a0a697f0d50957641045cc85b1961bfd8b0b108469e41c5d0efe1a45c92d5");
  });
});
