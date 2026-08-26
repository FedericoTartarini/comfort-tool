import type { ChartInstanceDeclaration } from "../../models/output/chartKinds";
import {
  resolveChartCapabilities,
  type ChartInstanceCapabilities,
} from "../../models/output/chartKinds";
import type { ChartEngineRegistration } from "../../services/comfort/charts/kinds/types";

export interface ChartInstancePanelView {
  readonly instanceId: string;
  readonly name: string;
  readonly emptyMessage: string;
  readonly allowsAxisSelection: boolean;
  readonly locksYAxis: boolean;
  readonly showsZoneToggle: boolean;
  readonly showsLegend: boolean;
  readonly usesBaselineInput: boolean;
}

export function resolveChartInstanceCapabilities(
  instance: ChartInstanceDeclaration,
): ChartInstanceCapabilities {
  return resolveChartCapabilities(instance.engine, instance.capabilities);
}

export function toChartInstancePanelView(
  instance: ChartInstanceDeclaration,
): ChartInstancePanelView {
  const capabilities = resolveChartInstanceCapabilities(instance);
  return {
    instanceId: instance.instanceId,
    name: instance.name,
    emptyMessage: instance.emptyMessage,
    allowsAxisSelection: capabilities.allowsAxisSelection,
    locksYAxis: capabilities.locksYAxis,
    showsZoneToggle: capabilities.showsZoneToggle,
    showsLegend: capabilities.showsLegend,
    usesBaselineInput: capabilities.allowsBaselineSelection,
  };
}

export function findChartEngineRegistration(
  registrations: readonly ChartEngineRegistration<unknown, unknown>[],
  instanceId: string,
): ChartEngineRegistration<unknown, unknown> | undefined {
  return registrations.find((registration) => registration.instanceId === instanceId);
}
