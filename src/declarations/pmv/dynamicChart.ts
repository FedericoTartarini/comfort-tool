import type { ChartBuildContext, NumericBand } from "../../catalog/modelCapabilities";
import { applyDynamicAxisCoordinates } from "../../engines/comfort/charts/dynamicAxisPayload";
import { CHART_COORDINATE_TOLERANCE } from "../../engines/comfort/charts/types";
import { getBaselineInputEntry } from "../../engines/comfort/helpers";
import {
  createPmvRequestAxisAdapter,
  getPmvZoneMeta,
  tryEvaluatePmvForChart,
  type PmvChartSource,
  type PmvResponse,
} from "./calculation";
import type { PmvModelDeclaration } from "./shared";
import type { InputId as InputIdType } from "../../catalog/inputSlots";
import { type PmvChartViewDescriptorFactory } from "./chartShared";

const EMPTY_AXIS_POINTS = 2;

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
  const clipAirSpeedWithoutOccupantControl =
    baseline.payload.occupantHasAirSpeedControl === false;

  return {
    config,
    title: `${declaration.label} Dynamic Chart`,
    xAxis: {
      field: config.xField,
      rangeSi: axisAdapter.getAxisRange(config.xField),
      points: EMPTY_AXIS_POINTS,
    },
    yAxis: {
      field: config.yField,
      rangeSi: axisAdapter.getAxisRange(config.yField),
      points: EMPTY_AXIS_POINTS,
    },
    coordinateDecimals: 2,
    clipAirSpeedWithoutOccupantControl,
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
      const request = {
        ...baseline.payload,
        occupantHasAirSpeedControl: true,
      };
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
