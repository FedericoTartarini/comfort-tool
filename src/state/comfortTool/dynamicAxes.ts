import type { FieldKey as FieldKeyType } from "../../models/fieldKeys";
import type { DynamicAxisPairValidator } from "./modelConfigs";

interface DynamicAxisConfiguration {
  dynamicAxisFields: ReadonlyArray<FieldKeyType>;
  defaultDynamicAxes?: DynamicAxisPair;
  dynamicAxisPairValidator?: DynamicAxisPairValidator;
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
    pair.xAxis !== pair.yAxis &&
    (config.dynamicAxisPairValidator?.(pair.xAxis, pair.yAxis) ?? true);
}

export function normalizeDynamicAxisPair(
  config: DynamicAxisConfiguration,
  pair: DynamicAxisPair,
): DynamicAxisPair | null {
  if (isDynamicAxisPairValid(config, pair)) {
    return pair;
  }

  if (
    config.defaultDynamicAxes &&
    isDynamicAxisPairValid(config, config.defaultDynamicAxes)
  ) {
    return { ...config.defaultDynamicAxes };
  }

  const fields = config.dynamicAxisFields;

  if (fields.includes(pair.xAxis)) {
    for (const yAxis of fields) {
      const candidate = { xAxis: pair.xAxis, yAxis };
      if (isDynamicAxisPairValid(config, candidate)) {
        return candidate;
      }
    }
  }

  if (fields.includes(pair.yAxis)) {
    for (const xAxis of fields) {
      const candidate = { xAxis, yAxis: pair.yAxis };
      if (isDynamicAxisPairValid(config, candidate)) {
        return candidate;
      }
    }
  }

  for (const xAxis of fields) {
    for (const yAxis of fields) {
      const candidate = { xAxis, yAxis };
      if (isDynamicAxisPairValid(config, candidate)) {
        return candidate;
      }
    }
  }

  return null;
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
