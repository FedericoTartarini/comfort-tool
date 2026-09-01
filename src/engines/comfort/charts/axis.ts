import { getPhysicalQuantityMeta, getQuantityPresentationMeta, type PhysicalQuantityId } from "../../../catalog/quantities";
import { type UnitSystem as UnitSystemType } from "../../../catalog/units";
import { convertQuantityFromSi, convertQuantityToSi } from "../../units";
import type { ChartAxisScale, ChartAxisValues, ChartRange } from "./types";

interface CreateFieldAxisScaleOptions {
  field: PhysicalQuantityId;
  unitSystem: UnitSystemType;
  rangeSi?: ChartRange;
  points: number;
  label?: string;
  units?: string;
  decimals?: number;
  gridColor?: string;
  showGrid?: boolean;
  zeroLine?: boolean;
  showTickLabels?: boolean;
  dtick?: number;
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
  gridColor,
  showGrid,
  zeroLine,
  showTickLabels,
  dtick,
  toDisplay,
  toSi,
}: CreateFieldAxisScaleOptions): ChartAxisScale {
  const meta = getPhysicalQuantityMeta(field);
  const presentation = getQuantityPresentationMeta(field, unitSystem);

  return {
    field,
    label: label ?? meta.label,
    units: units ?? presentation.displayUnits,
    decimals: decimals ?? 2,
    gridColor,
    showGrid,
    zeroLine,
    showTickLabels,
    dtick,
    rangeSi: rangeSi ?? { min: meta.minSi, max: meta.maxSi },
    points,
    toDisplay: toDisplay ?? ((valueSi) => convertQuantityFromSi(field, valueSi, unitSystem)),
    toSi: toSi ?? ((valueDisplay) => convertQuantityToSi(field, valueDisplay, unitSystem)),
  };
}

export function buildAxisValues(axis: ChartAxisScale): ChartAxisValues {
  if (!Number.isInteger(axis.points) || axis.points < 1) {
    throw new Error(`Axis points must be a positive integer; received ${axis.points}`);
  }

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
  if (!axis.label) return "";
  return axis.units ? `${axis.label} (${axis.units})` : axis.label;
}
