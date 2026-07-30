import type { FieldKey as FieldKeyType } from "../../models/fieldKeys";

interface DynamicAxisConfiguration {
  dynamicAxisFields: ReadonlyArray<FieldKeyType>;
  defaultDynamicAxes: DynamicAxisPair;
}

export interface DynamicAxisPair {
  xAxis: FieldKeyType;
  yAxis: FieldKeyType;
}

export type DynamicAxisDimension = "x" | "y";

export function isDynamicAxisPairValid(
  config: DynamicAxisConfiguration,
  pair: DynamicAxisPair,
): boolean {
  return config.dynamicAxisFields.includes(pair.xAxis) &&
    config.dynamicAxisFields.includes(pair.yAxis) &&
    pair.xAxis !== pair.yAxis;
}

export function normalizeDynamicAxisPair(
  config: DynamicAxisConfiguration,
  pair: DynamicAxisPair,
): DynamicAxisPair {
  if (isDynamicAxisPairValid(config, pair)) {
    return pair;
  }

  return { ...config.defaultDynamicAxes };
}

export function resolveDynamicAxisSelection(
  config: DynamicAxisConfiguration,
  pair: DynamicAxisPair,
  dimension: DynamicAxisDimension,
  nextField: FieldKeyType,
): DynamicAxisPair | null {
  if (!config.dynamicAxisFields.includes(nextField)) {
    return null;
  }

  const candidate = dimension === "x"
    ? nextField === pair.yAxis
      ? { xAxis: nextField, yAxis: pair.xAxis }
      : { xAxis: nextField, yAxis: pair.yAxis }
    : nextField === pair.xAxis
      ? { xAxis: pair.yAxis, yAxis: nextField }
      : { xAxis: pair.xAxis, yAxis: nextField };

  return isDynamicAxisPairValid(config, candidate) ? candidate : null;
}

export function getDynamicAxisOptions(
  config: DynamicAxisConfiguration,
  pair: DynamicAxisPair,
  dimension: DynamicAxisDimension,
): FieldKeyType[] {
  return config.dynamicAxisFields.filter((field) => (
    resolveDynamicAxisSelection(config, pair, dimension, field) !== null
  ));
}
