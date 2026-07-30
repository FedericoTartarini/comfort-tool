import { inputDisplayMetaById } from "../../../models/inputSlotPresentation";
import type { CompareInputMap, PlotTraceDto } from "../../../models/comfortDtos";
import type { InputId as InputIdType } from "../../../models/inputSlots";
import { getCompareInputs } from "../helpers";
import { buildInputScatterTrace } from "./plotlyBuilders";
import type { ChartAxisScale } from "./types";

export interface InputTraceContext<TPayload, TResult> {
  inputId: InputIdType;
  inputLabel: string;
  payload: TPayload;
  result: TResult | null | undefined;
  xSi: number;
  ySi: number;
  xDisplay: number;
  yDisplay: number;
}

export interface BuildInputTraceGroupsOptions<TPayload, TResult> {
  inputsMap: CompareInputMap<TPayload>;
  resultsByInput?: Partial<Record<InputIdType, TResult | null>>;
  showLegend?: boolean;
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
  getXSi: (payload: TPayload, inputId: InputIdType) => number;
  getYSi: (payload: TPayload, inputId: InputIdType) => number;
  formatXDisplay?: (value: number) => number;
  formatYDisplay?: (value: number) => number;
  getHovertemplate: (context: InputTraceContext<TPayload, TResult>) => string;
  buildOverlayTraces?: (context: InputTraceContext<TPayload, TResult>) => PlotTraceDto[];
  markerSize?: number;
  color?: string;
  hoverMetadata?: (
    context: InputTraceContext<TPayload, TResult>,
  ) => unknown[] | unknown[][];
  hoverinfo?: string;
}

export type ChartInputEntry<TPayload> = {
  inputId: InputIdType;
  payload: TPayload;
};

export function shouldShowInputLegend<TPayload>(inputsMap: CompareInputMap<TPayload>): boolean {
  return getCompareInputs(inputsMap).length > 1;
}

/** Returns the baseline payload declared by the chart build context. */
export function getBaselineInputEntry<TPayload>(
  inputsMap: CompareInputMap<TPayload>,
  baselineInputId: InputIdType,
): ChartInputEntry<TPayload> {
  const payload = inputsMap[baselineInputId];
  if (payload === undefined) {
    throw new Error(`Missing chart baseline payload for ${baselineInputId}.`);
  }
  return { inputId: baselineInputId, payload };
}

export function buildInputTraceGroups<TPayload, TResult = unknown>({
  inputsMap,
  resultsByInput = {},
  showLegend,
  xAxis,
  yAxis,
  getXSi,
  getYSi,
  formatXDisplay = (value) => value,
  formatYDisplay = (value) => value,
  getHovertemplate,
  buildOverlayTraces,
  markerSize,
  color,
  hoverMetadata,
  hoverinfo,
}: BuildInputTraceGroupsOptions<TPayload, TResult>): PlotTraceDto[] {
  const inputs = getCompareInputs(inputsMap);
  const resolvedShowLegend = showLegend ?? inputs.length > 1;

  return inputs.flatMap(({ inputId, payload }) => {
    const result = resultsByInput[inputId];
    const xSi = getXSi(payload, inputId);
    const ySi = getYSi(payload, inputId);
    const xDisplay = formatXDisplay(xAxis.toDisplay(xSi));
    const yDisplay = formatYDisplay(yAxis.toDisplay(ySi));
    const inputLabel = inputDisplayMetaById[inputId]?.label ?? "Input";
    const context: InputTraceContext<TPayload, TResult> = {
      inputId,
      inputLabel,
      payload,
      result,
      xSi,
      ySi,
      xDisplay,
      yDisplay,
    };

    return [
      ...(buildOverlayTraces?.(context) ?? []),
      buildInputScatterTrace({
        inputId,
        x: xDisplay,
        y: yDisplay,
        showLegend: resolvedShowLegend,
        markerSize,
        color,
        hoverinfo,
        hoverMetadata: hoverMetadata?.(context),
        hovertemplate: getHovertemplate(context),
      }),
    ];
  });
}
