import {
  FieldKey,
  type FieldKey as FieldKeyType,
} from "../../../models/fieldKeys";

export interface DynamicAxisCoordinate {
  readonly field: FieldKeyType;
  readonly valueSi: number;
}

export interface DynamicAxisPayloadAdapter<TPayload> {
  setAxisValue: (
    payload: TPayload,
    field: FieldKeyType,
    valueSi: number,
  ) => void;
  getOperativeTemperature: (payload: TPayload) => number;
  getTemperatureComponentRange: (
    field: TemperatureComponentField,
  ) => { min: number; max: number };
}

type TemperatureComponentField =
  | typeof FieldKey.DryBulbTemperature
  | typeof FieldKey.MeanRadiantTemperature;

const SOLVER_TOLERANCE = 1e-6;
const SOLVER_MAX_ITERATIONS = 48;

function isTemperatureComponent(
  field: FieldKeyType,
): field is TemperatureComponentField {
  return field === FieldKey.DryBulbTemperature ||
    field === FieldKey.MeanRadiantTemperature;
}

function getOtherTemperatureComponent(
  field: TemperatureComponentField,
): TemperatureComponentField {
  return field === FieldKey.DryBulbTemperature
    ? FieldKey.MeanRadiantTemperature
    : FieldKey.DryBulbTemperature;
}

function solveTemperatureComponent<TPayload>(
  payload: TPayload,
  field: TemperatureComponentField,
  targetOperativeTemperatureSi: number,
  adapter: DynamicAxisPayloadAdapter<TPayload>,
): number | null {
  const range = adapter.getTemperatureComponentRange(field);
  let low = Math.min(range.min, range.max);
  let high = Math.max(range.min, range.max);

  const evaluate = (valueSi: number): number => {
    adapter.setAxisValue(payload, field, valueSi);
    return adapter.getOperativeTemperature(payload);
  };

  let lowValue = evaluate(low);
  let highValue = evaluate(high);
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue)) {
    return null;
  }

  let lowDelta = lowValue - targetOperativeTemperatureSi;
  let highDelta = highValue - targetOperativeTemperatureSi;
  if (Math.abs(lowDelta) <= SOLVER_TOLERANCE) {
    return low;
  }
  if (Math.abs(highDelta) <= SOLVER_TOLERANCE) {
    return high;
  }
  if (lowDelta * highDelta > 0) {
    return null;
  }

  // Operative temperature is linear in the current models. This estimate solves
  // the normal case in one step; bisection below keeps the adapter contract safe
  // if a future implementation is monotonic but non-linear.
  if (Math.abs(highValue - lowValue) > SOLVER_TOLERANCE) {
    const estimate = low +
      ((targetOperativeTemperatureSi - lowValue) * (high - low)) /
        (highValue - lowValue);
    if (estimate >= low && estimate <= high) {
      const estimateValue = evaluate(estimate);
      if (
        Number.isFinite(estimateValue) &&
        Math.abs(estimateValue - targetOperativeTemperatureSi) <= SOLVER_TOLERANCE
      ) {
        return estimate;
      }
    }
  }

  for (let iteration = 0; iteration < SOLVER_MAX_ITERATIONS; iteration += 1) {
    const midpoint = (low + high) / 2;
    const midpointValue = evaluate(midpoint);
    if (!Number.isFinite(midpointValue)) {
      return null;
    }

    const midpointDelta = midpointValue - targetOperativeTemperatureSi;
    if (Math.abs(midpointDelta) <= SOLVER_TOLERANCE) {
      return midpoint;
    }

    if (lowDelta * midpointDelta <= 0) {
      high = midpoint;
      highDelta = midpointDelta;
    } else {
      low = midpoint;
      lowDelta = midpointDelta;
    }
  }

  const resolved = Math.abs(lowDelta) <= Math.abs(highDelta) ? low : high;
  return Math.min(Math.abs(lowDelta), Math.abs(highDelta)) <= SOLVER_TOLERANCE * 10
    ? resolved
    : null;
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
    ({ field }) => field === FieldKey.OperativeTemperature,
  );

  // Apply every independent coordinate first. Air speed can affect operative
  // temperature, so this phase must precede the operative constraint.
  coordinates
    .filter(({ field }) => field !== FieldKey.OperativeTemperature)
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
      FieldKey.OperativeTemperature,
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

  adapter.setAxisValue(payload, solvedField, solvedValue);
  return Math.abs(
    adapter.getOperativeTemperature(payload) - operativeCoordinate.valueSi,
  ) <= SOLVER_TOLERANCE * 10;
}
