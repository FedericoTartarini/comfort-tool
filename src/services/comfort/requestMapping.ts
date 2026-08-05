import type { ModelChartSourceDto } from "../../models/comfortDtos";
import type { FieldKey as FieldKeyType } from "../../models/fieldKeys";
import {
  inputOrder,
  type InputId as InputIdType,
} from "../../models/inputSlots";
import type { ModelCalculationContext } from "../../models/modelCalculation";

export type CalculationRequestMapper<TRequest> = (
  context: ModelCalculationContext,
  inputId: InputIdType,
) => TRequest;

type NumericRequestFieldMap<TRequest extends object> = {
  [TRequestProperty in keyof TRequest]: TRequest[TRequestProperty] extends number
    ? FieldKeyType
    : never;
};

/** Maps explicitly selected model request properties from canonical-SI input state. */
export function createFieldRequestMapper<TRequest extends object>(
  fieldByRequestProperty: NumericRequestFieldMap<TRequest>,
): CalculationRequestMapper<TRequest> {
  return (context, inputId) => {
    const input = context.inputsByInput[inputId];
    return Object.fromEntries(
      (
        Object.entries(fieldByRequestProperty) as Array<
          [string, FieldKeyType]
        >
      ).map(([requestProperty, fieldKey]) => [
        requestProperty,
        Number(input[fieldKey]),
      ]),
    ) as TRequest;
  };
}

interface CalculatePerInputOptions<TRequest, TResult> {
  context: ModelCalculationContext;
  visibleInputIds: readonly InputIdType[];
  mapRequest: CalculationRequestMapper<TRequest>;
  calculate: (request: TRequest) => TResult;
}

export function calculatePerInput<TRequest, TResult>({
  context,
  visibleInputIds,
  mapRequest,
  calculate,
}: CalculatePerInputOptions<TRequest, TResult>): {
  resultsByInput: Record<InputIdType, TResult | null>;
  chartSource: ModelChartSourceDto<TRequest>;
} {
  const resultsByInput = Object.fromEntries(
    inputOrder.map((inputId) => [inputId, null]),
  ) as Record<InputIdType, TResult | null>;
  const inputs: ModelChartSourceDto<TRequest>["inputs"] = {};

  for (const inputId of visibleInputIds) {
    const request = mapRequest(context, inputId);
    resultsByInput[inputId] = calculate(request);
    inputs[inputId] = request;
  }

  return { resultsByInput, chartSource: { inputs } };
}
