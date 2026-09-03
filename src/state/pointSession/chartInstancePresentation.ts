import type { ChartInstanceDeclaration } from "../../catalog/chartTypes";
import {
  chartTypeLabel,
  resolveChartCapabilities,
  type ChartInstanceCapabilities,
} from "../../catalog/chartTypes";
import type { ChartEngineRegistration } from "../../engines/comfort/charts/kinds/types";

export interface ChartInstancePanelView {
  readonly instanceId: string;
  readonly name: string;
  readonly emptyMessage: string;
  readonly allowsAxisSelection: boolean;
  readonly locksYAxis: boolean;
  readonly showsLegend: boolean;
  readonly usesBaselineInput: boolean;
}

export function resolveChartInstanceCapabilities(
  instance: ChartInstanceDeclaration,
): ChartInstanceCapabilities {
  return resolveChartCapabilities(instance.type, instance.capabilities);
}

export function toChartInstancePanelView(
  instance: ChartInstanceDeclaration,
): ChartInstancePanelView {
  const capabilities = resolveChartInstanceCapabilities(instance);
  return {
    instanceId: instance.instanceId,
    name: chartTypeLabel[instance.type],
    emptyMessage: instance.emptyMessage,
    allowsAxisSelection: capabilities.allowsAxisSelection,
    locksYAxis: capabilities.locksYAxis,
    showsLegend: capabilities.showsLegend,
    usesBaselineInput: capabilities.allowsBaselineSelection,
  };
}

export function findChartEngineRegistration<TResult = unknown, TSource = unknown>(
  registrations: readonly ChartEngineRegistration<TResult, TSource>[],
  instanceId: string,
): ChartEngineRegistration<TResult, TSource> | undefined {
  return registrations.find((registration) => registration.instanceId === instanceId);
}
