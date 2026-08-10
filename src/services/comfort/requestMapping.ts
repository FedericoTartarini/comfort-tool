import type { ModelChartSourceDto } from "../../models/comfortDtos";
import type {
  CanonicalInputFieldKey,
  FieldKey as FieldKeyType,
} from "../../models/fieldKeys";
import {
  InputId,
  type InputId as InputIdType,
} from "../../models/inputSlots";
import type { ModelCalculationContext } from "../../models/modelCalculation";

export type CalculationRequestMapper<TRequest> = (
  context: ModelCalculationContext,
  inputId: InputIdType,
) => TRequest;

type NumericRequestFieldMap<TRequest extends object> = {
  [TRequestProperty in keyof TRequest as TRequest[TRequestProperty] extends number
    ? TRequestProperty
    : never]: CanonicalInputFieldKey;
};

export interface FieldRequestAdapter<TRequest extends object> {
  readonly mapRequest: CalculationRequestMapper<TRequest>;
  readonly getAxisValue: (request: TRequest, field: FieldKeyType) => number;
  readonly setAxisValue: (
    request: TRequest,
    field: FieldKeyType,
    valueSi: number,
  ) => void;
}

/** Creates calculation and chart-axis adapters from one canonical field mapping. */
export function createFieldRequestAdapter<TRequest extends object>(
  fieldByRequestProperty: NumericRequestFieldMap<TRequest>,
): FieldRequestAdapter<TRequest> {
  const entries = Object.entries(fieldByRequestProperty) as Array<
    [keyof TRequest & string, CanonicalInputFieldKey]
  >;

  function getRequestProperty(field: FieldKeyType): keyof TRequest & string {
    const entry = entries.find(([, mappedField]) => mappedField === field);
    if (!entry) {
      throw new Error(`Unsupported request field: ${field}`);
    }
    return entry[0];
  }

  const mapRequest: CalculationRequestMapper<TRequest> = (context, inputId) => {
    const input = context.inputsByInput[inputId];
    return Object.fromEntries(
      entries.map(([requestProperty, fieldKey]) => [
        requestProperty,
        input[fieldKey],
      ]),
    ) as TRequest;
  };

  return {
    mapRequest,
    getAxisValue: (request, field) => {
      const value = Reflect.get(request, getRequestProperty(field));
      if (typeof value !== "number") {
        throw new Error(`Mapped request field ${field} is not numeric.`);
      }
      return value;
    },
    setAxisValue: (request, field, valueSi) => {
      Reflect.set(request, getRequestProperty(field), valueSi);
    },
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
  const resultsByInput: Record<InputIdType, TResult | null> = {
    [InputId.Input1]: null,
    [InputId.Input2]: null,
    [InputId.Input3]: null,
  };
  const inputs: ModelChartSourceDto<TRequest>["inputs"] = {};

  for (const inputId of visibleInputIds) {
    const request = mapRequest(context, inputId);
    resultsByInput[inputId] = calculate(request);
    inputs[inputId] = request;
  }

  return { resultsByInput, chartSource: { inputs } };
}
