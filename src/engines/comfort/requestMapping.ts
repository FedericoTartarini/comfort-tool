import type { ModelChartSource } from "../../catalog/chartSource";
import {
  type PhysicalQuantityId,
} from "../../catalog/quantities";
import {
  InputId,
  type InputId as InputIdType,
} from "../../catalog/inputSlots";
import type { ModelCalculationContext } from "../../catalog/modelCalculation";

export type CalculationRequestMapper<TRequest> = (
  context: ModelCalculationContext,
  inputId: InputIdType,
) => TRequest;

export interface LibraryQuantityMapping<TRequest extends object> {
  readonly mapRequest: CalculationRequestMapper<TRequest>;
  readonly toLibrary: (
    siByQuantity: Partial<Record<PhysicalQuantityId, number>>,
  ) => Record<string, number>;
  readonly fromLibrary: (
    jsObject: object,
  ) => Partial<Record<PhysicalQuantityId, number>>;
  readonly getAxisValue: (request: TRequest, field: PhysicalQuantityId) => number;
  readonly setAxisValue: (
    request: TRequest,
    field: PhysicalQuantityId,
    valueSi: number,
  ) => void;
}

/**
 * Per-model table of jsthermalcomfort field names ↔ catalog quantities.
 * Direction is supplied by the call (`toLibrary` / `fromLibrary` / axis get-set).
 */
export function defineLibraryQuantityMapping<TRequest extends object>(
  fieldByLibraryName: Record<string, PhysicalQuantityId>,
): LibraryQuantityMapping<TRequest> {
  const entries = Object.entries(fieldByLibraryName) as Array<
    [string, PhysicalQuantityId]
  >;

  function libraryNameForQuantity(field: PhysicalQuantityId): string {
    const entry = entries.find(([, quantityId]) => quantityId === field);
    if (!entry) {
      throw new Error(`Unsupported request field: ${field}`);
    }
    return entry[0];
  }

  function toLibrary(
    siByQuantity: Partial<Record<PhysicalQuantityId, number>>,
  ): Record<string, number> {
    const request: Record<string, number> = {};
    for (const [libraryName, quantityId] of entries) {
      const value = siByQuantity[quantityId];
      if (typeof value === "number") {
        request[libraryName] = value;
      }
    }
    return request;
  }

  function fromLibrary(
    jsObject: object,
  ): Partial<Record<PhysicalQuantityId, number>> {
    const record = jsObject as Record<string, unknown>;
    const values: Partial<Record<PhysicalQuantityId, number>> = {};
    for (const [libraryName, quantityId] of entries) {
      const value = record[libraryName];
      if (typeof value === "number") {
        values[quantityId] = value;
      }
    }
    return values;
  }

  const mapRequest: CalculationRequestMapper<TRequest> = (context, inputId) => (
    toLibrary({
      ...context.effectiveQuantitiesByInput[inputId],
    }) as TRequest
  );

  return {
    mapRequest,
    toLibrary,
    fromLibrary,
    getAxisValue: (request, field) => {
      const value = Reflect.get(request, libraryNameForQuantity(field));
      if (typeof value !== "number") {
        throw new Error(`Mapped request field ${field} is not numeric.`);
      }
      return value;
    },
    setAxisValue: (request, field, valueSi) => {
      const libraryName = libraryNameForQuantity(field);
      if (!Object.prototype.hasOwnProperty.call(request, libraryName)) {
        throw new Error(`Mapped request field ${field} is not on this object.`);
      }
      Reflect.set(request, libraryName, valueSi);
    },
  };
}

interface CalculatePerInputOptions<TRequest, TResult> {
  context: ModelCalculationContext;
  visibleInputIds: readonly InputIdType[];
  mapRequest: CalculationRequestMapper<TRequest>;
  calculate: (request: TRequest, inputId: InputIdType) => TResult;
}

export function calculatePerInput<TRequest, TResult>({
  context,
  visibleInputIds,
  mapRequest,
  calculate,
}: CalculatePerInputOptions<TRequest, TResult>): {
  resultsByInput: Record<InputIdType, TResult | null>;
  chartSource: ModelChartSource<TRequest>;
} {
  const resultsByInput: Record<InputIdType, TResult | null> = {
    [InputId.Input1]: null,
    [InputId.Input2]: null,
    [InputId.Input3]: null,
  };
  const inputs: ModelChartSource<TRequest>["inputs"] = {};

  for (const inputId of visibleInputIds) {
    const request = mapRequest(context, inputId);
    resultsByInput[inputId] = calculate(request, inputId);
    inputs[inputId] = request;
  }

  return { resultsByInput, chartSource: { inputs } };
}

export interface PerInputCalculationContext<
  TRequest,
  TResult,
  TChartRequest,
  TChartSource extends ModelChartSource<TChartRequest>,
> {
  inputId: InputIdType;
  request: TRequest;
  chartRequest: TChartRequest;
  result: TResult;
  chartSource: TChartSource;
}

interface CalculatePerInputWithExtensionsOptions<
  TRequest,
  TResult,
  TChartRequest,
  TChartSource extends ModelChartSource<TChartRequest>,
> {
  context: ModelCalculationContext;
  visibleInputIds: readonly InputIdType[];
  mapRequest: CalculationRequestMapper<TRequest>;
  mapChartRequest: (request: TRequest) => TChartRequest;
  calculate: (request: TRequest) => TResult;
  createChartSource: () => TChartSource;
  afterCalculate?: (
    iteration: PerInputCalculationContext<TRequest, TResult, TChartRequest, TChartSource>,
  ) => void;
}

/** Extends `calculatePerInput` for chart sources with per-input maps beyond `inputs`. */
export function calculatePerInputWithExtensions<
  TRequest,
  TResult,
  TChartRequest,
  TChartSource extends ModelChartSource<TChartRequest>,
>({
  context,
  visibleInputIds,
  mapRequest,
  mapChartRequest,
  calculate,
  createChartSource,
  afterCalculate,
}: CalculatePerInputWithExtensionsOptions<
  TRequest,
  TResult,
  TChartRequest,
  TChartSource
>): {
  resultsByInput: Record<InputIdType, TResult | null>;
  chartSource: TChartSource;
} {
  const resultsByInput: Record<InputIdType, TResult | null> = {
    [InputId.Input1]: null,
    [InputId.Input2]: null,
    [InputId.Input3]: null,
  };
  const chartSource = createChartSource();

  for (const inputId of visibleInputIds) {
    const request = mapRequest(context, inputId);
    const chartRequest = mapChartRequest(request);
    const result = calculate(request);
    resultsByInput[inputId] = result;
    chartSource.inputs[inputId] = chartRequest;
    if (afterCalculate) {
      afterCalculate({
        inputId,
        request,
        chartRequest,
        result,
        chartSource,
      });
    }
  }

  return { resultsByInput, chartSource };
}
