import { type FieldKey as FieldKeyType } from "../../../models/fieldKeys";
import { fieldMetaByKey } from "../../../models/inputFieldsMeta";
import { type UnitSystem as UnitSystemType } from "../../../models/units";
import { convertFieldValueFromSi, convertFieldValueToSi } from "../../units";
import type { ChartAxisScale, ChartAxisValues, ChartRange } from "./types";

interface CreateFieldAxisScaleOptions {
  field: FieldKeyType;
  unitSystem: UnitSystemType;
  rangeSi?: ChartRange;
  points: number;
  label?: string;
  units?: string;
  decimals?: number;
  toDisplay?: (valueSi: number) => number;
  toSi?: (valueDisplay: number) => number;
}

export function createFieldAxisScale({
  field,
  unitSystem,
  rangeSi,
  points,
  label,
  units,
  decimals,
  toDisplay,
  toSi,
}: CreateFieldAxisScaleOptions): ChartAxisScale {
  const meta = fieldMetaByKey[field];

  return {
    field,
    label: label ?? meta.label,
    units: units ?? meta.displayUnits[unitSystem],
    decimals: decimals ?? meta.decimals,
    rangeSi: rangeSi ?? { min: meta.minValue, max: meta.maxValue },
    points,
    toDisplay: toDisplay ?? ((valueSi) => convertFieldValueFromSi(field, valueSi, unitSystem)),
    toSi: toSi ?? ((valueDisplay) => convertFieldValueToSi(field, valueDisplay, unitSystem)),
  };
}

export function buildAxisValues(axis: ChartAxisScale): ChartAxisValues {
  const displayMin = axis.toDisplay(axis.rangeSi.min);
  const displayMax = axis.toDisplay(axis.rangeSi.max);
  const displayValues = Array.from({ length: axis.points }, (_, index) => (
    axis.points === 1
      ? displayMin
      : displayMin + ((displayMax - displayMin) * index) / (axis.points - 1)
  ));

  return {
    displayValues,
    siValues: displayValues.map(axis.toSi),
    displayRange: { min: displayMin, max: displayMax },
  };
}

export function formatAxisTitle(axis: ChartAxisScale): string {
  return `${axis.label} (${axis.units})`;
}
