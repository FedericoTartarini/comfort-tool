import { PhysicalQuantityId } from "../../catalog/quantities";
import type { ChartBuildContext } from "../../catalog/modelCapabilities";
import type { InputId as InputIdType } from "../../catalog/inputSlots";
import {
  ParametricYUnit,
  type ParametricLineDataSpec,
  type ParametricLineGeometry,
  type ParametricPolyline,
} from "../../engines/comfort/charts/kinds/types";
import type { PmvRequest, PmvResponse } from "./calculation";
import {
  readPmvRequestFromChartSource,
  readPmvRequestsByInput,
  sampleParametricDryBulbSi,
} from "./parametricShared";

/** ISO 7730 conversion from met to W/m². */
export const PMV_MET_TO_HEAT_FLUX = 58.15;

export const PmvHeatLossSeriesId = {
  SkinDiffusionLatent: "skin-diffusion-latent",
  SweatEvaporationLatent: "sweat-evaporation-latent",
  RespirationLatent: "respiration-latent",
  RespirationSensible: "respiration-sensible",
  RadiationSensible: "radiation-sensible",
  ConvectionSensible: "convection-sensible",
  TotalLatent: "total-latent",
  TotalSensible: "total-sensible",
  TotalHeatLoss: "total-heat-loss",
  MetabolicRate: "metabolic-rate",
} as const;

export type PmvHeatLossSeriesId =
  (typeof PmvHeatLossSeriesId)[keyof typeof PmvHeatLossSeriesId];

export interface PmvHeatLossComponents {
  readonly skinDiffusionLatent: number;
  readonly sweatEvaporationLatent: number;
  readonly respirationLatent: number;
  readonly respirationSensible: number;
  readonly radiationSensible: number;
  readonly convectionSensible: number;
  readonly totalLatent: number;
  readonly totalSensible: number;
  readonly totalHeatLoss: number;
  readonly metabolicRate: number;
}

/**
 * ISO 7730 / Fanger heat-loss components (W/m²) at one condition.
 * Same clothing-temperature iteration as jsthermalcomfort `pmv_calculation`.
 */
export function calculatePmvHeatLossComponents(
  request: PmvRequest,
): PmvHeatLossComponents | null {
  const pa = request.rh * 10 * Math.exp(16.6536 - 4030.183 / (request.tdb + 235));
  const icl = 0.155 * request.clo;
  const metabolicRate = request.met * PMV_MET_TO_HEAT_FLUX;
  const externalWork = request.wme * PMV_MET_TO_HEAT_FLUX;
  const internalHeat = metabolicRate - externalWork;
  const clothingAreaFactor = icl <= 0.078
    ? 1 + 1.29 * icl
    : 1.05 + 0.645 * icl;
  const forcedConvection = 12.1 * Math.sqrt(request.vr);
  let convectionCoefficient = forcedConvection;
  const airKelvin = request.tdb + 273;
  const radiantKelvin = request.tr + 273;
  const clothingGuess = airKelvin + (35.5 - request.tdb) / (3.5 * icl + 0.1);
  const p1 = icl * clothingAreaFactor;
  const p2 = p1 * 3.96;
  const p3 = p1 * 100;
  const p4 = p1 * airKelvin;
  const p5 = 308.7 - 0.028 * internalHeat + p2 * (radiantKelvin / 100) ** 4;
  let xn = clothingGuess / 100;
  let xf = clothingGuess / 50;
  const tolerance = 0.00015;
  let iterations = 0;

  while (Math.abs(xn - xf) > tolerance) {
    xf = (xf + xn) / 2;
    const naturalConvection = 2.38 * Math.abs(100 * xf - airKelvin) ** 0.25;
    convectionCoefficient = forcedConvection > naturalConvection
      ? forcedConvection
      : naturalConvection;
    xn = (p5 + p4 * convectionCoefficient - p2 * xf ** 4)
      / (100 + p3 * convectionCoefficient);
    iterations += 1;
    if (iterations > 150) return null;
  }

  const clothingTemperature = 100 * xn - 273;
  const skinDiffusionLatent = 3.05 * 0.001 * (5733 - 6.99 * internalHeat - pa);
  const sweatEvaporationLatent = internalHeat > 58.15
    ? 0.42 * (internalHeat - 58.15)
    : 0;
  const respirationLatent = 1.7 * 0.00001 * metabolicRate * (5867 - pa);
  const respirationSensible = 0.0014 * metabolicRate * (34 - request.tdb);
  const radiationSensible = 3.96 * clothingAreaFactor
    * (xn ** 4 - (radiantKelvin / 100) ** 4);
  const convectionSensible = clothingAreaFactor
    * convectionCoefficient
    * (clothingTemperature - request.tdb);
  const totalLatent = skinDiffusionLatent + sweatEvaporationLatent + respirationLatent;
  const totalSensible = respirationSensible + radiationSensible + convectionSensible;

  return {
    skinDiffusionLatent,
    sweatEvaporationLatent,
    respirationLatent,
    respirationSensible,
    radiationSensible,
    convectionSensible,
    totalLatent,
    totalSensible,
    totalHeatLoss: totalLatent + totalSensible,
    metabolicRate,
  };
}

interface HeatLossSeriesDefinition {
  readonly id: PmvHeatLossSeriesId;
  readonly label: string;
  readonly color: string;
  readonly visible: boolean;
  readonly read: (components: PmvHeatLossComponents) => number;
}

const HEAT_LOSS_SERIES: readonly HeatLossSeriesDefinition[] = [
  {
    id: PmvHeatLossSeriesId.SkinDiffusionLatent,
    label: "Water vapor diffusion through the skin - Latent",
    color: "#556B2F",
    visible: false,
    read: ({ skinDiffusionLatent }) => skinDiffusionLatent,
  },
  {
    id: PmvHeatLossSeriesId.SweatEvaporationLatent,
    label: "Evaporation of sweat from skin surface - Latent",
    color: "#9ACD32",
    visible: false,
    read: ({ sweatEvaporationLatent }) => sweatEvaporationLatent,
  },
  {
    id: PmvHeatLossSeriesId.RespirationLatent,
    label: "Respiration - Latent",
    color: "#008000",
    visible: false,
    read: ({ respirationLatent }) => respirationLatent,
  },
  {
    id: PmvHeatLossSeriesId.RespirationSensible,
    label: "Respiration - Sensible",
    color: "#8B4513",
    visible: false,
    read: ({ respirationSensible }) => respirationSensible,
  },
  {
    id: PmvHeatLossSeriesId.RadiationSensible,
    label: "Radiation from clothing surface - Sensible",
    color: "#D2691E",
    visible: false,
    read: ({ radiationSensible }) => radiationSensible,
  },
  {
    id: PmvHeatLossSeriesId.ConvectionSensible,
    label: "Convection from clothing surface - Sensible",
    color: "#F4A460",
    visible: false,
    read: ({ convectionSensible }) => convectionSensible,
  },
  {
    id: PmvHeatLossSeriesId.TotalLatent,
    label: "Total latent",
    color: "#696969",
    visible: true,
    read: ({ totalLatent }) => totalLatent,
  },
  {
    id: PmvHeatLossSeriesId.TotalSensible,
    label: "Total sensible",
    color: "#A9A9A9",
    visible: true,
    read: ({ totalSensible }) => totalSensible,
  },
  {
    id: PmvHeatLossSeriesId.TotalHeatLoss,
    label: "Total heat loss",
    color: "#000000",
    visible: true,
    read: ({ totalHeatLoss }) => totalHeatLoss,
  },
  {
    id: PmvHeatLossSeriesId.MetabolicRate,
    label: "Metabolic rate",
    color: "#800080",
    visible: true,
    read: ({ metabolicRate }) => metabolicRate,
  },
];

export function buildPmvHeatLossGeometry(
  baseline: PmvRequest,
  compareRequests: Partial<Record<InputIdType, PmvRequest>> = {},
): ParametricLineGeometry | null {
  const temperatures = sampleParametricDryBulbSi();
  const valuesBySeries = new Map<PmvHeatLossSeriesId, Array<{ x: number; y: number }>>(
    HEAT_LOSS_SERIES.map(({ id }) => [id, []]),
  );

  for (const tdb of temperatures) {
    const components = calculatePmvHeatLossComponents({ ...baseline, tdb });
    if (!components) continue;
    for (const series of HEAT_LOSS_SERIES) {
      const y = series.read(components);
      if (!Number.isFinite(y)) continue;
      valuesBySeries.get(series.id)?.push({ x: tdb, y });
    }
  }

  const polylines: ParametricPolyline[] = HEAT_LOSS_SERIES.flatMap((series) => {
    const points = valuesBySeries.get(series.id) ?? [];
    if (points.length === 0) return [];
    return [{
      id: series.id,
      label: series.label,
      color: series.color,
      points,
      yUnit: ParametricYUnit.HeatFlux,
      visible: series.visible,
    }];
  });
  if (polylines.length === 0) return null;

  const comparePoints: Partial<Record<InputIdType, { x: number; y: number }>> = {};
  for (const [inputId, request] of Object.entries(compareRequests) as Array<
    [InputIdType, PmvRequest]
  >) {
    const components = calculatePmvHeatLossComponents(request);
    if (!components) continue;
    comparePoints[inputId] = { x: request.tdb, y: components.totalHeatLoss };
  }

  return { polylines, comparePoints };
}

export function createPmvHeatLossParametricSpec(): ParametricLineDataSpec<PmvResponse> {
  return {
    title: "Heat Loss Components",
    xField: PhysicalQuantityId.DryBulbTemperature,
    yLabel: "Heat Loss",
    getGeometry: (chartSource, _resultsByInput, context: ChartBuildContext) => {
      const baseline = readPmvRequestFromChartSource(
        chartSource,
        context.baselineInputId,
      );
      if (!baseline) return null;
      return buildPmvHeatLossGeometry(baseline, readPmvRequestsByInput(chartSource));
    },
  };
}
