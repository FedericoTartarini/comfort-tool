import type { ModelChartSource } from "../../catalog/chartSource";
import type { InputId as InputIdType } from "../../catalog/inputSlots";
import { InputId } from "../../catalog/inputSlots";
import type { ModelCalculationContext } from "../../catalog/modelCalculation";
import type {
  PhysicalQuantityId,
  QuantityState,
} from "../../catalog/quantities";
import type {
  QuantityInputBind,
  QuantityResultBind,
} from "./libraryBinds";
import {
  defineLibraryQuantityMapping,
  type LibraryQuantityMapping,
} from "./requestMapping";

export const LIBRARY_INVOKE_DEFAULTS = {
  units: "SI",
  round: false,
  limit_inputs: false,
} as const;

export type JsModelFn = ((...args: never[]) => unknown) & {
  readonly label: string;
  readonly description: string;
};

export function mappingFromBinds(
  inputs: readonly QuantityInputBind[],
  values: readonly QuantityResultBind[],
): LibraryQuantityMapping<QuantityState> {
  const fieldByLibraryName: Record<string, PhysicalQuantityId> = {};
  for (const row of inputs) {
    fieldByLibraryName[row.library] = row.quantity;
  }
  for (const row of values) {
    fieldByLibraryName[row.library] = row.quantity;
  }
  return defineLibraryQuantityMapping<QuantityState>(fieldByLibraryName);
}

export const quantityStateAxisAdapter = {
  getAxisValue: (payload: QuantityState, field: PhysicalQuantityId): number => {
    const value = payload[field];
    if (typeof value !== "number") {
      throw new Error(`Mapped request field ${field} is not numeric.`);
    }
    return value;
  },
  setAxisValue: (
    payload: QuantityState,
    field: PhysicalQuantityId,
    valueSi: number,
  ): void => {
    payload[field] = valueSi;
  },
};

export function invokeMappedLibrary(
  fn: JsModelFn,
  inputs: readonly QuantityInputBind[],
  values: readonly QuantityResultBind[],
  si: QuantityState,
): QuantityState {
  const mapping = mappingFromBinds(inputs, values);
  const lib = mapping.toLibrary(si);
  const args = inputs.map((row) => {
    const value = lib[row.library];
    if (typeof value !== "number") {
      throw new Error(`Missing library input "${row.library}".`);
    }
    return value;
  });
  const raw = (fn as unknown as (...callArgs: unknown[]) => unknown)(
    ...args,
    LIBRARY_INVOKE_DEFAULTS,
  );
  if (raw === null || typeof raw !== "object") {
    throw new Error(`${fn.label} did not return a result object.`);
  }
  const mapped = mapping.fromLibrary(raw);
  for (const row of values) {
    if (row.from) {
      mapped[row.quantity] = row.from(si, raw);
    }
  }
  for (const row of values) {
    const value = mapped[row.quantity];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(
        `${fn.label} produced a non-finite value for ${row.quantity}: ${String(value)}.`,
      );
    }
  }
  return mapped;
}

export type LibraryInvokeFn<TResult = QuantityState> = (
  si: QuantityState,
  context: ModelCalculationContext,
  inputId: InputIdType,
) => TResult;

export type ChartInputMapper<TChartInput = unknown> = (
  si: QuantityState,
  context: ModelCalculationContext,
  inputId: InputIdType,
) => TChartInput;

export type ChartSourceBuilder<TResult, TChart> = (
  context: ModelCalculationContext,
  visibleInputIds: readonly InputIdType[],
  resultsByInput: Record<InputIdType, TResult | null>,
) => TChart;

export interface CalculateFromLibraryOptions<
  TResult = QuantityState,
  TChart = ModelChartSource<QuantityState>,
> {
  readonly invoke?: LibraryInvokeFn<TResult>;
  readonly mapChartInput?: ChartInputMapper<unknown>;
  readonly buildChartSource?: ChartSourceBuilder<TResult, TChart>;
}

export function calculateFromLibrary<
  TResult = QuantityState,
  TChart = ModelChartSource<QuantityState>,
>(
  fn: JsModelFn,
  inputs: readonly QuantityInputBind[],
  values: readonly QuantityResultBind[],
  context: ModelCalculationContext,
  visibleInputIds: readonly InputIdType[],
  options: CalculateFromLibraryOptions<TResult, TChart> = {},
): {
  resultsByInput: Record<InputIdType, TResult | null>;
  chartSource: TChart;
} {
  const resultsByInput: Record<InputIdType, TResult | null> = {
    [InputId.Input1]: null,
    [InputId.Input2]: null,
    [InputId.Input3]: null,
  };
  const chartInputs: ModelChartSource<unknown>["inputs"] = {};

  for (const inputId of visibleInputIds) {
    const si = { ...context.effectiveQuantitiesByInput[inputId] };
    const result = options.invoke
      ? options.invoke(si, context, inputId)
      : invokeMappedLibrary(fn, inputs, values, si) as TResult;
    resultsByInput[inputId] = result;
    chartInputs[inputId] = options.mapChartInput
      ? options.mapChartInput(si, context, inputId)
      : si;
  }

  if (options.buildChartSource) {
    return {
      resultsByInput,
      chartSource: options.buildChartSource(
        context,
        visibleInputIds,
        resultsByInput,
      ),
    };
  }

  return {
    resultsByInput,
    chartSource: { inputs: chartInputs } as TChart,
  };
}
