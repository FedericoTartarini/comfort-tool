import type { ChartBuildResult } from "../chartBuildResult";
import type { FieldChartProfile } from "../../../../models/output/fieldChartProfile";
import type { InputId as InputIdType } from "../../../../models/inputSlots";
import type { UnitSystem as UnitSystemType } from "../../../../models/units";

export interface ChartBuildMemoKey {
  readonly modelId: string;
  readonly instanceId: string;
  readonly unitSystem: UnitSystemType;
  readonly xAxis: string;
  readonly yAxis: string;
  readonly zOutput: string;
  readonly bandsHash: string;
  readonly baselineInputId: InputIdType;
  readonly chartSourceVersion: number;
  readonly profileKind: FieldChartProfile["kind"];
  readonly modelInputsHash: string;
}

export function hashModelInputs(
  modelInputs: Readonly<Partial<Record<string, number>>>,
): string {
  return Object.entries(modelInputs)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([quantityId, value]) => `${quantityId}:${value}`)
    .join("|");
}

const memoStore = new Map<string, ChartBuildResult>();

export function hashBands(bands: readonly { min: number; max: number; label: string }[]): string {
  return bands.map((band) => `${band.min}:${band.max}:${band.label}`).join("|");
}

export function buildChartMemoKey(parts: ChartBuildMemoKey): string {
  return [
    parts.modelId,
    parts.instanceId,
    parts.unitSystem,
    parts.xAxis,
    parts.yAxis,
    parts.zOutput,
    parts.bandsHash,
    parts.baselineInputId,
    parts.chartSourceVersion,
    parts.profileKind,
    parts.modelInputsHash,
  ].join("::");
}

export function readChartMemo(key: string): ChartBuildResult | undefined {
  return memoStore.get(key);
}

export function writeChartMemo(key: string, value: ChartBuildResult): ChartBuildResult {
  memoStore.set(key, value);
  return value;
}

export function clearChartMemo(): void {
  memoStore.clear();
}
