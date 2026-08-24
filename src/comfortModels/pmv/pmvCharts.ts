import type { InputId as InputIdType } from "../../models/inputSlots";
import type { ChartBuildContext, NumericBand } from "../../models/modelCapabilities";
import type { PlotlyChartResponseDto } from "../../models/comfortDtos";
import type { ChartAxisQuantityId } from "../../models/physicalQuantities";
import type {
  CustomChartKindSpec,
  DynamicFieldGeometrySpec,
} from "../../services/comfort/charts/kinds/types";
import type { PmvChartSourceDto, PmvResponseDto } from "./pmvCalculation";
import type { PmvModelDeclaration } from "./pmvShared";
import { buildPmvFieldChart, type PmvChartViewDescriptorFactory } from "./pmvChartShared";
import { createPsychrometricViewDescriptor } from "./pmvPsychrometricChart";
import { createDynamicViewDescriptor } from "./pmvDynamicChart";

function resolvePmvChartView(
  instanceId: string,
  declaration: PmvModelDeclaration,
): PmvChartViewDescriptorFactory | undefined {
  if (instanceId === declaration.psychrometricInstanceId) {
    return createPsychrometricViewDescriptor;
  }
  if (instanceId === declaration.dynamicInstanceId) {
    return createDynamicViewDescriptor;
  }
  return undefined;
}

export function buildPmvChart(
  instanceId: string,
  declaration: PmvModelDeclaration,
  source: PmvChartSourceDto,
  resultsByInput: Partial<Record<InputIdType, PmvResponseDto | null>>,
  context: ChartBuildContext<NumericBand>,
): PlotlyChartResponseDto | null {
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
  psychrometricInstanceId: string,
): CustomChartKindSpec<PmvResponseDto, PmvChartSourceDto> {
  return {
    build: (chartSource, resultsByInput, context) => {
      if (!chartSource) return null;
      return buildPmvChart(
        psychrometricInstanceId,
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
  dynamicInstanceId: string,
  axisFields: readonly ChartAxisQuantityId[],
): DynamicFieldGeometrySpec<PmvResponseDto, PmvChartSourceDto> {
  return {
    title: `${declaration.label} Dynamic Chart`,
    axisFields,
    build: (chartSource, resultsByInput, context) => {
      if (!chartSource) return null;
      return buildPmvChart(
        dynamicInstanceId,
        declaration,
        chartSource,
        resultsByInput,
        context as ChartBuildContext<NumericBand>,
      );
    },
  };
}
