import type { ChartBuildContext, NumericBand } from "../../models/modelCapabilities";
import { applyDynamicAxisCoordinates } from "../../services/comfort/charts/dynamicAxisPayload";
import { CHART_COORDINATE_TOLERANCE } from "../../services/comfort/charts/types";
import { getBaselineInputEntry } from "../../services/comfort/helpers";
import {
  createPmvRequestAxisAdapter,
  getPmvZoneMeta,
  tryEvaluatePmvForChart,
  type PmvChartSource,
  type PmvResponse,
} from "./calculation";
import type { PmvModelDeclaration } from "./shared";
import type { InputId as InputIdType } from "../../models/inputSlots";
import {
  CONTOUR_GRID_RESOLUTION,
  type PmvChartViewDescriptorFactory,
} from "./chartShared";

export const createDynamicViewDescriptor: PmvChartViewDescriptorFactory = (
  declaration: PmvModelDeclaration,
  source: PmvChartSource,
  resultsByInput: Partial<Record<InputIdType, PmvResponse | null>>,
  context: ChartBuildContext<NumericBand>,
) => {
  const { adapter } = declaration;
  const config = context.fieldChartConfig;
  const baseline = getBaselineInputEntry(source.inputs, context.baselineInputId);
  const axisAdapter = createPmvRequestAxisAdapter(adapter);
  const baselineResult = resultsByInput[context.baselineInputId];
  const baselineXSi = axisAdapter.getAxisValue(baseline.payload, config.xField);
  const baselineYSi = axisAdapter.getAxisValue(baseline.payload, config.yField);

  return {
    config,
    title: `${declaration.label} Dynamic Chart`,
    xAxis: {
      field: config.xField,
      rangeSi: axisAdapter.getAxisRange(config.xField),
      points: CONTOUR_GRID_RESOLUTION,
    },
    yAxis: {
      field: config.yField,
      rangeSi: axisAdapter.getAxisRange(config.yField),
      points: CONTOUR_GRID_RESOLUTION,
    },
    coordinateDecimals: 2,
    evaluatePoint: (xSi, ySi) => {
      if (
        baselineResult
        && Math.abs(xSi - baselineXSi) < CHART_COORDINATE_TOLERANCE
        && Math.abs(ySi - baselineYSi) < CHART_COORDINATE_TOLERANCE
      ) {
        return {
          pmv: baselineResult.pmv,
          ppd: baselineResult.ppd,
          zone: getPmvZoneMeta(baselineResult.pmv),
        };
      }
      const request = { ...baseline.payload };
      const hasValidCoordinates = applyDynamicAxisCoordinates(
        request,
        { field: config.xField, valueSi: xSi },
        { field: config.yField, valueSi: ySi },
        axisAdapter,
      );
      return hasValidCoordinates ? tryEvaluatePmvForChart(adapter, request) : null;
    },
    getInputXSi: (payload) => axisAdapter.getAxisValue(payload, config.xField),
    getInputYSi: (payload) => axisAdapter.getAxisValue(payload, config.yField),
    margin: { l: 64, r: 24, t: 48, b: 64 },
  };
};
