import { two_nodes } from "jsthermalcomfort";

import { PhysicalQuantityId } from "../../models/physicalQuantities";
import type { ChartBuildContext } from "../../models/modelCapabilities";
import type { InputId as InputIdType } from "../../models/inputSlots";
import {
  ParametricYUnit,
  type ParametricLineDataSpec,
  type ParametricLineGeometry,
  type ParametricPolyline,
} from "../../services/comfort/charts/kinds/types";
import type { PmvRequestDto, PmvResponseDto } from "./pmvCalculation";
import {
  readPmvRequestFromChartSource,
  readPmvRequestsByInput,
  sampleParametricDryBulbSi,
} from "./pmvParametricShared";

export const PmvSetSeriesId = {
  Set: "set",
  SkinTemperature: "t-skin",
  CoreTemperature: "t-core",
  MeanBodyTemperature: "t-mean-body",
  SkinEvaporativeLoss: "e-skin",
  SweatEvaporationLoss: "e-rsw",
  VapourDiffusionLoss: "e-diff",
  SkinSensibleLoss: "q-sensible",
  TotalSkinLoss: "q-skin",
  RespirationLoss: "q-res",
  SkinWettedness: "skin-wettedness",
} as const;

export type PmvSetSeriesId =
  (typeof PmvSetSeriesId)[keyof typeof PmvSetSeriesId];

export interface PmvSetOutputs {
  readonly set: number;
  readonly tSkin: number;
  readonly tCore: number;
  readonly tMeanBody: number;
  readonly eSkin: number;
  readonly eRsw: number;
  readonly eDiff: number;
  readonly qSensible: number;
  readonly qSkin: number;
  readonly qRes: number;
  readonly skinWettednessPercent: number;
}

interface TwoNodesFields {
  readonly set: number;
  readonly tSkin: number;
  readonly tCore: number;
  readonly eSkin: number;
  readonly eRsw: number;
  readonly qSensible: number;
  readonly qSkin: number;
  readonly qRes: number;
  readonly w: number;
}

function readFinite(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}

function asTwoNodesFields(value: unknown): TwoNodesFields | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const fields: TwoNodesFields = {
    set: readFinite(record.set),
    tSkin: readFinite(record.t_skin ?? record.tSkin),
    tCore: readFinite(record.t_core ?? record.tCore),
    eSkin: readFinite(record.e_skin ?? record.eSkin),
    eRsw: readFinite(record.e_rsw ?? record.eRsw),
    qSensible: readFinite(record.q_sensible ?? record.qSensible),
    qSkin: readFinite(record.q_skin ?? record.qSkin),
    qRes: readFinite(record.q_res ?? record.qRes),
    w: readFinite(record.w),
  };
  return Object.values(fields).every(Number.isFinite) ? fields : null;
}

export function calculatePmvSetOutputs(
  request: PmvRequestDto,
): PmvSetOutputs | null {
  const result = asTwoNodesFields(two_nodes(
    request.tdb,
    request.tr,
    request.vr,
    request.rh,
    request.met,
    request.clo,
    request.wme,
    undefined,
    undefined,
    "sitting",
  ));
  if (!result) return null;
  return {
    set: result.set,
    tSkin: result.tSkin,
    tCore: result.tCore,
    tMeanBody: 0.1 * result.tSkin + 0.9 * result.tCore,
    eSkin: result.eSkin,
    eRsw: result.eRsw,
    eDiff: result.eSkin - result.eRsw,
    qSensible: result.qSensible,
    qSkin: result.qSkin,
    qRes: result.qRes,
    skinWettednessPercent: result.w * 100,
  };
}

interface SetSeriesDefinition {
  readonly id: PmvSetSeriesId;
  readonly label: string;
  readonly color: string;
  readonly visible: boolean;
  readonly yUnit: typeof ParametricYUnit[keyof typeof ParametricYUnit];
  readonly yAxis: "y" | "y2";
  readonly dash?: "dash";
  readonly read: (outputs: PmvSetOutputs) => number;
}

const SET_SERIES: readonly SetSeriesDefinition[] = [
  {
    id: PmvSetSeriesId.Set,
    label: "SET temperature",
    color: "#0D6EFC",
    visible: true,
    yUnit: ParametricYUnit.Temperature,
    yAxis: "y",
    read: ({ set }) => set,
  },
  {
    id: PmvSetSeriesId.SkinTemperature,
    label: "Skin temperature",
    color: "#0BBAD9",
    visible: true,
    yUnit: ParametricYUnit.Temperature,
    yAxis: "y",
    read: ({ tSkin }) => tSkin,
  },
  {
    id: PmvSetSeriesId.CoreTemperature,
    label: "Core temperature",
    color: "#00F0A4",
    visible: true,
    yUnit: ParametricYUnit.Temperature,
    yAxis: "y",
    read: ({ tCore }) => tCore,
  },
  {
    id: PmvSetSeriesId.MeanBodyTemperature,
    label: "Mean body temperature",
    color: "#55FA01",
    visible: false,
    yUnit: ParametricYUnit.Temperature,
    yAxis: "y",
    read: ({ tMeanBody }) => tMeanBody,
  },
  {
    id: PmvSetSeriesId.SkinEvaporativeLoss,
    label: "Total skin evaporative heat loss",
    color: "#999999",
    visible: false,
    yUnit: ParametricYUnit.HeatFlux,
    yAxis: "y2",
    read: ({ eSkin }) => eSkin,
  },
  {
    id: PmvSetSeriesId.SweatEvaporationLoss,
    label: "Sweat evaporation skin heat loss",
    color: "#FF9905",
    visible: false,
    yUnit: ParametricYUnit.HeatFlux,
    yAxis: "y2",
    read: ({ eRsw }) => eRsw,
  },
  {
    id: PmvSetSeriesId.VapourDiffusionLoss,
    label: "Vapour diffusion skin heat loss",
    color: "#DB5200",
    visible: false,
    yUnit: ParametricYUnit.HeatFlux,
    yAxis: "y2",
    read: ({ eDiff }) => eDiff,
  },
  {
    id: PmvSetSeriesId.SkinSensibleLoss,
    label: "Total skin sensible heat loss",
    color: "#505050",
    visible: false,
    yUnit: ParametricYUnit.HeatFlux,
    yAxis: "y2",
    read: ({ qSensible }) => qSensible,
  },
  {
    id: PmvSetSeriesId.TotalSkinLoss,
    label: "Total skin heat loss",
    color: "#000000",
    visible: true,
    yUnit: ParametricYUnit.HeatFlux,
    yAxis: "y2",
    read: ({ qSkin }) => qSkin,
  },
  {
    id: PmvSetSeriesId.RespirationLoss,
    label: "Heat loss respiration",
    color: "#000000",
    visible: true,
    yUnit: ParametricYUnit.HeatFlux,
    yAxis: "y2",
    dash: "dash",
    read: ({ qRes }) => qRes,
  },
  {
    id: PmvSetSeriesId.SkinWettedness,
    label: "Skin wettedness",
    color: "#ffcc00",
    visible: false,
    yUnit: ParametricYUnit.Identity,
    yAxis: "y2",
    read: ({ skinWettednessPercent }) => skinWettednessPercent,
  },
];

export function buildPmvSetGeometry(
  baseline: PmvRequestDto,
  compareRequests: Partial<Record<InputIdType, PmvRequestDto>> = {},
): ParametricLineGeometry | null {
  const temperatures = sampleParametricDryBulbSi();
  const valuesBySeries = new Map<PmvSetSeriesId, Array<{ x: number; y: number }>>(
    SET_SERIES.map(({ id }) => [id, []]),
  );

  for (const tdb of temperatures) {
    const outputs = calculatePmvSetOutputs({ ...baseline, tdb });
    if (!outputs) continue;
    for (const series of SET_SERIES) {
      const y = series.read(outputs);
      if (!Number.isFinite(y)) continue;
      valuesBySeries.get(series.id)?.push({ x: tdb, y });
    }
  }

  const polylines: ParametricPolyline[] = SET_SERIES.flatMap((series) => {
    const points = valuesBySeries.get(series.id) ?? [];
    if (points.length === 0) return [];
    return [{
      id: series.id,
      label: series.label,
      color: series.color,
      points,
      yUnit: series.yUnit,
      yAxis: series.yAxis,
      visible: series.visible,
      ...(series.dash ? { dash: series.dash } : {}),
    }];
  });
  if (polylines.length === 0) return null;

  const comparePoints: Partial<Record<InputIdType, { x: number; y: number }>> = {};
  for (const [inputId, request] of Object.entries(compareRequests) as Array<
    [InputIdType, PmvRequestDto]
  >) {
    const outputs = calculatePmvSetOutputs(request);
    if (!outputs) continue;
    comparePoints[inputId] = { x: request.tdb, y: outputs.set };
  }

  return { polylines, comparePoints };
}

export function createPmvSetParametricSpec(): ParametricLineDataSpec<PmvResponseDto> {
  return {
    title: "SET outputs",
    xField: PhysicalQuantityId.DryBulbTemperature,
    yLabel: "Temperature",
    y2Label: "Heat Loss, Skin wettedness",
    getGeometry: (chartSource, _resultsByInput, context: ChartBuildContext) => {
      const baseline = readPmvRequestFromChartSource(
        chartSource,
        context.baselineInputId,
      );
      if (!baseline) return null;
      return buildPmvSetGeometry(baseline, readPmvRequestsByInput(chartSource));
    },
  };
}
