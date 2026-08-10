import { describe, expect, expectTypeOf, it } from "vitest";

import {
  FieldKey,
  canonicalInputFieldOrder,
  type CanonicalInputState,
} from "../../models/fieldKeys";
import { InputId, inputDefaultsById } from "../../models/inputSlots";
import type { ModelCalculationContext } from "../../models/modelCalculation";
import {
  calculatePerInput,
  createFieldRequestAdapter,
} from "./requestMapping";

interface DemoRequest {
  temperature: number;
  humidity: number;
}

function createInputState(
  values: Partial<CanonicalInputState>,
): CanonicalInputState {
  return {
    ...inputDefaultsById[InputId.Input1],
    ...values,
  };
}

function createContext(): ModelCalculationContext {
  return {
    inputsByInput: {
      [InputId.Input1]: createInputState({
        [FieldKey.DryBulbTemperature]: 21.5,
        [FieldKey.RelativeHumidity]: 45,
      }),
      [InputId.Input2]: createInputState({
        [FieldKey.DryBulbTemperature]: 23,
        [FieldKey.RelativeHumidity]: 50,
      }),
      [InputId.Input3]: createInputState({
        [FieldKey.DryBulbTemperature]: 26.25,
        [FieldKey.RelativeHumidity]: 60,
      }),
    },
    options: {},
  };
}

describe("request mapping", () => {
  const adapter = createFieldRequestAdapter<DemoRequest>({
    temperature: FieldKey.DryBulbTemperature,
    humidity: FieldKey.RelativeHumidity,
  });

  it("maps explicitly selected canonical-SI fields", () => {
    const request = adapter.mapRequest(createContext(), InputId.Input1);

    expect(request).toEqual({ temperature: 21.5, humidity: 45 });
    expectTypeOf(adapter.mapRequest).returns.toEqualTypeOf<DemoRequest>();
  });

  it("uses the same declaration for bidirectional chart-axis mapping", () => {
    const request = { temperature: 21.5, humidity: 45 };

    expect(adapter.getAxisValue(request, FieldKey.RelativeHumidity)).toBe(45);
    adapter.setAxisValue(request, FieldKey.DryBulbTemperature, 27);
    expect(request).toEqual({ temperature: 27, humidity: 45 });
    expect(() => adapter.getAxisValue(request, FieldKey.WindSpeed))
      .toThrow(/unsupported request field/i);
  });

  it("declares exactly the persisted canonical input keys", () => {
    expect(canonicalInputFieldOrder).toEqual([
      FieldKey.DryBulbTemperature,
      FieldKey.MeanRadiantTemperature,
      FieldKey.RelativeAirSpeed,
      FieldKey.WindSpeed,
      FieldKey.RelativeHumidity,
      FieldKey.MetabolicRate,
      FieldKey.ClothingInsulation,
      FieldKey.ExternalWork,
      FieldKey.PrevailingMeanOutdoorTemperature,
    ]);
    expect(canonicalInputFieldOrder).not.toContain(FieldKey.HumidityRatio);
    expect(canonicalInputFieldOrder).not.toContain(FieldKey.OperativeTemperature);
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

  it("makes incomplete DTO mappings a type error", () => {
    // @ts-expect-error DemoRequest also requires humidity.
    const incompleteMapper = createFieldRequestAdapter<DemoRequest>({
      temperature: FieldKey.DryBulbTemperature,
    });
    const mapperWithExtraProperty = createFieldRequestAdapter<DemoRequest>({
      temperature: FieldKey.DryBulbTemperature,
      humidity: FieldKey.RelativeHumidity,
      // @ts-expect-error DTO mappings cannot add undeclared request properties.
      wind: FieldKey.WindSpeed,
    });
    void incompleteMapper;
    void mapperWithExtraProperty;
  });
});
