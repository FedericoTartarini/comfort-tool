import type { InputId as InputIdType } from "../../catalog/inputSlots";
import type { ChartBuildContext, NumericBand } from "../../catalog/modelCapabilities";
import type { PlotlyChartSpec } from "../../services/plotlyTypes";
import type { ChartAxisQuantityId } from "../../catalog/quantities";
import type {
  CustomChartEngineSpec,
  DynamicFieldGeometrySpec,
} from "../../services/comfort/charts/kinds/types";
import type { PmvChartSource, PmvResponse } from "./calculation";
import type { PmvModelDeclaration } from "./shared";
import { buildPmvFieldChart, type PmvChartViewDescriptorFactory } from "./chartShared";
import { createPsychrometricViewDescriptor } from "./psychrometricChart";
import { createDynamicViewDescriptor } from "./dynamicChart";

function resolvePmvChartView(
  instanceId: string,
  declaration: PmvModelDeclaration,
): PmvChartViewDescriptorFactory | undefined {
  if (instanceId === declaration.psychrometricChartId) {
    return createPsychrometricViewDescriptor;
  }
  if (instanceId === declaration.dynamicChartId) {
    return createDynamicViewDescriptor;
  }
  return undefined;
}

export function buildPmvChart(
  instanceId: string,
  declaration: PmvModelDeclaration,
  source: PmvChartSource,
  resultsByInput: Partial<Record<InputIdType, PmvResponse | null>>,
  context: ChartBuildContext<NumericBand>,
): PlotlyChartSpec | null {
  const createDescriptor = resolvePmvChartView(instanceId, declaration);
  return createDescriptor
    ? buildPmvFieldChart(
        declaration,
        source,
        resultsByInput,
        context,
        createDescriptor(declaration, source, resultsByInput, context),
      )
    : null;
}

export function createPmvPsychrometricChartSpec(
  declaration: PmvModelDeclaration,
  psychrometricChartId: string,
): CustomChartEngineSpec<PmvResponse, PmvChartSource> {
  return {
    build: (chartSource, resultsByInput, context) => {
      if (!chartSource) return null;
      return buildPmvChart(
        psychrometricChartId,
        declaration,
        chartSource,
        resultsByInput,
        context as ChartBuildContext<NumericBand>,
      );
    },
  };
}

export function createPmvDynamicFieldChartSpec(
  declaration: PmvModelDeclaration,
  dynamicChartId: string,
  axisFields: readonly ChartAxisQuantityId[],
): DynamicFieldGeometrySpec<PmvResponse, PmvChartSource> {
  return {
    title: `${declaration.label} Dynamic Chart`,
    axisFields,
    build: (chartSource, resultsByInput, context) => {
      if (!chartSource) return null;
      return buildPmvChart(
        dynamicChartId,
        declaration,
        chartSource,
        resultsByInput,
        context as ChartBuildContext<NumericBand>,
      );
    },
  };
}
