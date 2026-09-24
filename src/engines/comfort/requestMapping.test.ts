import { describe, expect, expectTypeOf, it } from "vitest";

import { PhysicalQuantityId, type QuantityState } from "../../catalog/quantities";
import { InputId, inputDefaultsById } from "../../catalog/inputSlots";
import {
  ModelCalculationContext,
  createModelCalculationContext,
} from "../../catalog/modelCalculation";
import {
  calculatePerInput,
  calculatePerInputWithExtensions,
  defineLibraryQuantityMapping,
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
  values: QuantityState,
): QuantityState {
  return {
    ...inputDefaultsById[InputId.Input1],
    ...values,
  };
}

function createContext(): ModelCalculationContext {
  const quantitiesByInput = {
    [InputId.Input1]: createInputState({ [PhysicalQuantityId.DryBulbTemperature]: 21.5, [PhysicalQuantityId.RelativeHumidity]: 45 }),
    [InputId.Input2]: createInputState({ [PhysicalQuantityId.DryBulbTemperature]: 23, [PhysicalQuantityId.RelativeHumidity]: 50 }),
    [InputId.Input3]: createInputState({ [PhysicalQuantityId.DryBulbTemperature]: 26.25, [PhysicalQuantityId.RelativeHumidity]: 60 }),
  };
  return createModelCalculationContext({
    effectiveQuantitiesByInput: quantitiesByInput,
    options: {},
  });
}

describe("request mapping", () => {
  const mapping = defineLibraryQuantityMapping<DemoRequest>({
    temperature: PhysicalQuantityId.DryBulbTemperature,
    humidity: PhysicalQuantityId.RelativeHumidity,
  });

  it("maps explicitly selected canonical-SI fields", () => {
    const request = mapping.mapRequest(createContext(), InputId.Input1);

    expect(request).toEqual({ temperature: 21.5, humidity: 45 });
    expectTypeOf(mapping.mapRequest).returns.toEqualTypeOf<DemoRequest>();
  });

  it("uses the same declaration for bidirectional chart-axis mapping", () => {
    const request = { temperature: 21.5, humidity: 45 };

    expect(mapping.getAxisValue(request, PhysicalQuantityId.RelativeHumidity)).toBe(45);
    mapping.setAxisValue(request, PhysicalQuantityId.DryBulbTemperature, 27);
    expect(request).toEqual({ temperature: 27, humidity: 45 });
    expect(() => mapping.getAxisValue(request, PhysicalQuantityId.WindSpeed))
      .toThrow(/unsupported request field/i);
  });

  it("calculates visible inputs and initializes every result slot", () => {
    const calculated = calculatePerInput({
      context: createContext(),
      visibleInputIds: [InputId.Input1, InputId.Input3],
      mapRequest: mapping.mapRequest,
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
      mapRequest: mapping.mapRequest,
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

  it("copies SI in either direction and omits unmapped bag keys from requests", () => {
    const mapping = defineLibraryQuantityMapping<DemoRequest>({
      temperature: PhysicalQuantityId.DryBulbTemperature,
      humidity: PhysicalQuantityId.RelativeHumidity,
      hi: PhysicalQuantityId.HeatIndex,
    });
    expect(mapping.toLibrary({
      [PhysicalQuantityId.DryBulbTemperature]: 21.5,
      [PhysicalQuantityId.RelativeHumidity]: 45,
      [PhysicalQuantityId.HeatIndex]: 32,
    })).toEqual({ temperature: 21.5, humidity: 45, hi: 32 });
    expect(mapping.fromLibrary({ temperature: 21.5, humidity: 45, hi: 32 })).toEqual({
      [PhysicalQuantityId.DryBulbTemperature]: 21.5,
      [PhysicalQuantityId.RelativeHumidity]: 45,
      [PhysicalQuantityId.HeatIndex]: 32,
    });

    const request = mapping.mapRequest(createContext(), InputId.Input1);
    expect(request).toEqual({ temperature: 21.5, humidity: 45 });
    expect(() => mapping.setAxisValue(request, PhysicalQuantityId.HeatIndex, 30))
      .toThrow(/not on this object/i);
  });
});
