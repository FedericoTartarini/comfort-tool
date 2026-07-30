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
  getAxisValue: (
    payload: TPayload,
    field: FieldKeyType,
  ) => number;
  getOperativeTemperature: (payload: TPayload) => number;
  getTemperatureComponentRange: (
    field: TemperatureComponentField,
  ) => { min: number; max: number };
}

type TemperatureComponentField =
  | typeof FieldKey.DryBulbTemperature
  | typeof FieldKey.MeanRadiantTemperature;

const SOLVER_TOLERANCE = 1e-6;

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
      Math.abs(valueDelta) <= SOLVER_TOLERANCE
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
      Math.abs(resolvedValue - targetOperativeTemperatureSi) <= SOLVER_TOLERANCE
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

  const previousSolvedValue = adapter.getAxisValue(payload, solvedField);
  let postConditionSatisfied = false;
  try {
    adapter.setAxisValue(payload, solvedField, solvedValue);
    const operativeTemperature = adapter.getOperativeTemperature(payload);
    postConditionSatisfied = Number.isFinite(operativeTemperature) && Math.abs(
      operativeTemperature - operativeCoordinate.valueSi,
    ) <= SOLVER_TOLERANCE;
    return postConditionSatisfied;
  } finally {
    if (!postConditionSatisfied) {
      adapter.setAxisValue(payload, solvedField, previousSolvedValue);
    }
  }
}
