import type { InputId as InputIdType } from "../../models/inputSlots";
import type { ChartBuildContext, NumericBand } from "../../models/modelCapabilities";
import type { PlotlyChartSpec } from "../../services/plotlyTypes";
import type { ChartAxisQuantityId } from "../../models/physicalQuantities";
import type {
  CustomChartEngineSpec,
  DynamicFieldGeometrySpec,
} from "../../services/comfort/charts/kinds/types";
import type { PmvChartSource, PmvResponse } from "./pmvCalculation";
import type { PmvModelDeclaration } from "./pmvShared";
import { buildPmvFieldChart, type PmvChartViewDescriptorFactory } from "./pmvChartShared";
import { createPsychrometricViewDescriptor } from "./pmvPsychrometricChart";
import { createDynamicViewDescriptor } from "./pmvDynamicChart";

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
