import { PhysicalQuantityId, getPhysicalQuantityMeta } from "../../../catalog/quantities";
import type { LibraryQuantityMapping } from "../requestMapping";
import { CHART_COORDINATE_TOLERANCE, type ChartRange } from "./types";

export interface DynamicAxisCoordinate {
  readonly field: PhysicalQuantityId;
  readonly valueSi: number;
}

export interface DynamicAxisPayloadAdapter<TPayload> {
  setAxisValue: (
    payload: TPayload,
    field: PhysicalQuantityId,
    valueSi: number,
  ) => void;
  getAxisValue: (
    payload: TPayload,
    field: PhysicalQuantityId,
  ) => number;
  getOperativeTemperature: (payload: TPayload) => number;
  getTemperatureComponentRange: (
    field: TemperatureComponentField,
  ) => { min: number; max: number };
}

type TemperatureComponentField =
  | typeof PhysicalQuantityId.DryBulbTemperature
  | typeof PhysicalQuantityId.MeanRadiantTemperature;

export interface RequestAxisAdapter<TPayload>
  extends DynamicAxisPayloadAdapter<TPayload> {
  getAxisRange: (field: PhysicalQuantityId) => ChartRange;
}

interface RequestAxisAdapterOptions<TPayload extends object> {
  quantityMapping: Pick<
    LibraryQuantityMapping<TPayload>,
    "getAxisValue" | "setAxisValue"
  >;
  aliases?: Partial<Record<PhysicalQuantityId, PhysicalQuantityId>>;
  axisRanges?: Partial<Record<PhysicalQuantityId, ChartRange>>;
  temperatureComponentRanges?: Partial<Record<TemperatureComponentField, ChartRange>>;
  operativeTemperature: {
    get: (payload: TPayload) => number;
    set: (payload: TPayload, valueSi: number) => void;
    range: ChartRange;
  };
}

/**
 * Adds chart-only aliases and the standard-specific operative-temperature
 * constraint to a canonical request mapping.
 */
export function createRequestAxisAdapter<TPayload extends object>({
  quantityMapping,
  aliases = {},
  axisRanges = {},
  temperatureComponentRanges = {},
  operativeTemperature,
}: RequestAxisAdapterOptions<TPayload>): RequestAxisAdapter<TPayload> {
  const resolveField = (field: PhysicalQuantityId) => aliases[field] ?? field;
  const getAxisRange = (field: PhysicalQuantityId): ChartRange => {
    if (field === PhysicalQuantityId.OperativeTemperature) {
      return operativeTemperature.range;
    }
    const resolvedField = resolveField(field);
    return axisRanges[field]
      ?? axisRanges[resolvedField]
      ?? {
        min: getPhysicalQuantityMeta(resolvedField).minSi,
        max: getPhysicalQuantityMeta(resolvedField).maxSi,
      };
  };

  return {
    getAxisValue: (payload, field) => field === PhysicalQuantityId.OperativeTemperature
      ? operativeTemperature.get(payload)
      : quantityMapping.getAxisValue(payload, resolveField(field)),
    setAxisValue: (payload, field, valueSi) => {
      if (field === PhysicalQuantityId.OperativeTemperature) {
        operativeTemperature.set(payload, valueSi);
        return;
      }
      quantityMapping.setAxisValue(payload, resolveField(field), valueSi);
    },
    getOperativeTemperature: operativeTemperature.get,
    getTemperatureComponentRange: (field) => (
      temperatureComponentRanges[field] ?? getAxisRange(field)
    ),
    getAxisRange,
  };
}

function isTemperatureComponent(
  field: PhysicalQuantityId,
): field is TemperatureComponentField { return field === PhysicalQuantityId.DryBulbTemperature ||
    field === PhysicalQuantityId.MeanRadiantTemperature; }

function getOtherTemperatureComponent(
  field: TemperatureComponentField,
): TemperatureComponentField { return field === PhysicalQuantityId.DryBulbTemperature
    ? PhysicalQuantityId.MeanRadiantTemperature
    : PhysicalQuantityId.DryBulbTemperature; }

function solveTemperatureComponent<TPayload>(
  payload: TPayload,
  field: TemperatureComponentField,
  targetOperativeTemperatureSi: number,
  adapter: DynamicAxisPayloadAdapter<TPayload>,
): number | null {
  const range = adapter.getTemperatureComponentRange(field);
  const low = Math.min(range.min, range.max);
  const high = Math.max(range.min, range.max);
  const originalValue = adapter.getAxisValue(payload, field);

  try {
    const evaluate = (valueSi: number): number => {
      adapter.setAxisValue(payload, field, valueSi);
      return adapter.getOperativeTemperature(payload);
    };

    const lowValue = evaluate(low);
    const highValue = evaluate(high);
    const valueDelta = highValue - lowValue;
    if (
      !Number.isFinite(lowValue) ||
      !Number.isFinite(highValue) ||
      !Number.isFinite(valueDelta) ||
      Math.abs(valueDelta) <= CHART_COORDINATE_TOLERANCE
    ) {
      return null;
    }

    const resolved = low +
      ((targetOperativeTemperatureSi - lowValue) * (high - low)) /
        valueDelta;
    if (!Number.isFinite(resolved) || resolved < low || resolved > high) {
      return null;
    }

    const resolvedValue = evaluate(resolved);
    return Number.isFinite(resolvedValue) &&
      Math.abs(resolvedValue - targetOperativeTemperatureSi) <= CHART_COORDINATE_TOLERANCE
      ? resolved
      : null;
  } finally {
    adapter.setAxisValue(payload, field, originalValue);
  }
}

/**
 * Applies both chart coordinates as one physical constraint. In particular,
 * Air/Radiant + Operative pairs preserve the explicitly selected component and
 * solve the other component instead of allowing the second axis write to win.
 */
export function applyDynamicAxisCoordinates<TPayload>(
  payload: TPayload,
  xCoordinate: DynamicAxisCoordinate,
  yCoordinate: DynamicAxisCoordinate,
  adapter: DynamicAxisPayloadAdapter<TPayload>,
): boolean {
  if (xCoordinate.field === yCoordinate.field) {
    return false;
  }

  const coordinates = [xCoordinate, yCoordinate];
  const operativeCoordinate = coordinates.find(
    ({ field }) => field === PhysicalQuantityId.OperativeTemperature,
  );

  // Apply every independent coordinate first. Air speed can affect operative
  // temperature, so this phase must precede the operative constraint.
  coordinates
    .filter(({ field }) => field !== PhysicalQuantityId.OperativeTemperature)
    .forEach(({ field, valueSi }) => {
      adapter.setAxisValue(payload, field, valueSi);
    });

  if (!operativeCoordinate) {
    return true;
  }

  const temperatureComponent = coordinates.find(({ field }) => (
    isTemperatureComponent(field)
  ));
  if (!temperatureComponent || !isTemperatureComponent(temperatureComponent.field)) {
    adapter.setAxisValue(
      payload,
      PhysicalQuantityId.OperativeTemperature,
      operativeCoordinate.valueSi,
    );
    return Number.isFinite(adapter.getOperativeTemperature(payload));
  }

  const solvedField = getOtherTemperatureComponent(temperatureComponent.field);
  const solvedValue = solveTemperatureComponent(
    payload,
    solvedField,
    operativeCoordinate.valueSi,
    adapter,
  );
  if (solvedValue === null) {
    return false;
  }

  const previousSolvedValue = adapter.getAxisValue(payload, solvedField);
  let postConditionSatisfied = false;
  try {
    adapter.setAxisValue(payload, solvedField, solvedValue);
    const operativeTemperature = adapter.getOperativeTemperature(payload);
    postConditionSatisfied = Number.isFinite(operativeTemperature) && Math.abs(
      operativeTemperature - operativeCoordinate.valueSi,
    ) <= CHART_COORDINATE_TOLERANCE;
    return postConditionSatisfied;
  } finally {
    if (!postConditionSatisfied) {
      adapter.setAxisValue(payload, solvedField, previousSolvedValue);
    }
  }
}
