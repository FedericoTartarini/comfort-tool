import { ChartInstanceId } from "../../models/output/chartInstances";
import type { InputId as InputIdType } from "../../models/inputSlots";
import type { ChartBuildContext, NumericBand } from "../../models/modelCapabilities";
import type { PlotlyChartResponseDto } from "../../models/comfortDtos";
import type { PmvChartSourceDto, PmvResponseDto } from "./pmvCalculation";
import type { PmvModelDeclaration } from "./pmvShared";
import { buildPmvFieldChart, type PmvChartViewDescriptorFactory } from "./pmvChartShared";
import { createPsychrometricViewDescriptor } from "./pmvPsychrometricChart";
import { createDynamicViewDescriptor } from "./pmvDynamicChart";

const pmvChartViewByInstanceId: Partial<Record<string, PmvChartViewDescriptorFactory>> = {
  [ChartInstanceId.PmvAshrae.Psychrometric]: createPsychrometricViewDescriptor,
  [ChartInstanceId.PmvAshrae.DynamicField]: createDynamicViewDescriptor,
  [ChartInstanceId.PmvIso.Psychrometric]: createPsychrometricViewDescriptor,
  [ChartInstanceId.PmvIso.DynamicField]: createDynamicViewDescriptor,
};

export function buildPmvChart(
  instanceId: string,
  declaration: PmvModelDeclaration,
  source: PmvChartSourceDto,
  resultsByInput: Partial<Record<InputIdType, PmvResponseDto | null>>,
  context: ChartBuildContext<NumericBand>,
): PlotlyChartResponseDto | null {
  const createDescriptor = pmvChartViewByInstanceId[instanceId];
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
