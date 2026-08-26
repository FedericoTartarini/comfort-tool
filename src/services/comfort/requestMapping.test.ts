import { describe, expect, expectTypeOf, it } from "vitest";

import { PhysicalQuantityId, primaryInputOrder, type PrimaryInputState } from "../../models/quantities";
import { InputId, inputDefaultsById } from "../../models/inputSlots";
import {
  ModelCalculationContext,
  createModelCalculationContext,
} from "../../models/modelCalculation";
import { createAuxiliaryQuantitiesByInput } from "../../services/comfort/quantityStateRouting";
import {
  calculatePerInput,
  calculatePerInputWithExtensions,
  createFieldRequestAdapter,
} from "./requestMapping";

interface DemoRequest {
  temperature: number;
  humidity: number;
}

interface DemoChartRequest extends DemoRequest {
  humidityPoints: number;
}

interface DemoChartSource {
  inputs: Partial<Record<InputId, DemoChartRequest>>;
  humidityTotals: Partial<Record<InputId, number>>;
}

function createInputState(
  values: Partial<PrimaryInputState>,
): PrimaryInputState {
  return {
    ...inputDefaultsById[InputId.Input1],
    ...values,
  };
}

function createContext(): ModelCalculationContext {
  const quantitiesByInput = {
    [InputId.Input1]: createInputState({
      [PhysicalQuantityId.DryBulbTemperature]: 21.5,
      [PhysicalQuantityId.RelativeHumidity]: 45,
    }),
    [InputId.Input2]: createInputState({
      [PhysicalQuantityId.DryBulbTemperature]: 23,
      [PhysicalQuantityId.RelativeHumidity]: 50,
    }),
    [InputId.Input3]: createInputState({
      [PhysicalQuantityId.DryBulbTemperature]: 26.25,
      [PhysicalQuantityId.RelativeHumidity]: 60,
    }),
  };
  return createModelCalculationContext({
    effectiveQuantitiesByInput: quantitiesByInput,
    auxiliaryQuantitiesByInput: createAuxiliaryQuantitiesByInput(),
    modelInputs: {},
    options: {},
  });
}

describe("request mapping", () => {
  const adapter = createFieldRequestAdapter<DemoRequest>({
    temperature: PhysicalQuantityId.DryBulbTemperature,
    humidity: PhysicalQuantityId.RelativeHumidity,
  });

  it("maps explicitly selected canonical-SI fields", () => {
    const request = adapter.mapRequest(createContext(), InputId.Input1);

    expect(request).toEqual({ temperature: 21.5, humidity: 45 });
    expectTypeOf(adapter.mapRequest).returns.toEqualTypeOf<DemoRequest>();
  });

  it("uses the same declaration for bidirectional chart-axis mapping", () => {
    const request = { temperature: 21.5, humidity: 45 };

    expect(adapter.getAxisValue(request, PhysicalQuantityId.RelativeHumidity)).toBe(45);
    adapter.setAxisValue(request, PhysicalQuantityId.DryBulbTemperature, 27);
    expect(request).toEqual({ temperature: 27, humidity: 45 });
    expect(() => adapter.getAxisValue(request, PhysicalQuantityId.WindSpeed))
      .toThrow(/unsupported request field/i);
  });

  it("declares exactly the persisted canonical input keys", () => {
    expect(primaryInputOrder).toEqual([
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.MeanRadiantTemperature,
      PhysicalQuantityId.RelativeAirSpeed,
      PhysicalQuantityId.WindSpeed,
      PhysicalQuantityId.RelativeHumidity,
      PhysicalQuantityId.MetabolicRate,
      PhysicalQuantityId.ClothingInsulation,
      PhysicalQuantityId.ExternalWork,
      PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
    ]);
    expect(primaryInputOrder).not.toContain(PhysicalQuantityId.HumidityRatio);
    expect(primaryInputOrder).not.toContain(PhysicalQuantityId.OperativeTemperature);
  });

  it("calculates visible inputs and initializes every result slot", () => {
    const calculated = calculatePerInput({
      context: createContext(),
      visibleInputIds: [InputId.Input1, InputId.Input3],
      mapRequest: adapter.mapRequest,
      calculate: (request) => ({
        index: request.temperature + request.humidity,
      }),
    });

    expect(calculated.resultsByInput).toEqual({
      [InputId.Input1]: { index: 66.5 },
      [InputId.Input2]: null,
      [InputId.Input3]: { index: 86.25 },
    });
    expect(calculated.chartSource).toEqual({
      inputs: {
        [InputId.Input1]: { temperature: 21.5, humidity: 45 },
        [InputId.Input3]: { temperature: 26.25, humidity: 60 },
      },
    });
  });

  it("accumulates chart-source extensions after each visible input", () => {
    const calculated = calculatePerInputWithExtensions({
      context: createContext(),
      visibleInputIds: [InputId.Input1, InputId.Input3],
      mapRequest: adapter.mapRequest,
      mapChartRequest: (request) => ({
        ...request,
        humidityPoints: 10,
      }),
      calculate: (request) => ({
        index: request.temperature + request.humidity,
      }),
      createChartSource: (): DemoChartSource => ({
        inputs: {},
        humidityTotals: {},
      }),
      afterCalculate: ({ inputId, result, chartSource }) => {
        chartSource.humidityTotals[inputId] = result.index;
      },
    });

    expect(calculated.resultsByInput[InputId.Input2]).toBeNull();
    expect(calculated.chartSource).toEqual({
      inputs: {
        [InputId.Input1]: { temperature: 21.5, humidity: 45, humidityPoints: 10 },
        [InputId.Input3]: { temperature: 26.25, humidity: 60, humidityPoints: 10 },
      },
      humidityTotals: {
        [InputId.Input1]: 66.5,
        [InputId.Input3]: 86.25,
      },
    });
  });

  it("makes incomplete DTO mappings a type error", () => {
    // @ts-expect-error DemoRequest also requires humidity.
    const incompleteMapper = createFieldRequestAdapter<DemoRequest>({
      temperature: PhysicalQuantityId.DryBulbTemperature,
    });
    const mapperWithExtraProperty = createFieldRequestAdapter<DemoRequest>({
      temperature: PhysicalQuantityId.DryBulbTemperature,
      humidity: PhysicalQuantityId.RelativeHumidity,
      // @ts-expect-error DTO mappings cannot add undeclared request properties.
      wind: PhysicalQuantityId.WindSpeed,
    });
    void incompleteMapper;
    void mapperWithExtraProperty;
  });
});
