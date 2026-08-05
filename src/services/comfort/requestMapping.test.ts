import { describe, expect, expectTypeOf, it } from "vitest";

import { ComfortModel } from "../../models/comfortModels";
import { FieldKey, type FieldKey as FieldKeyType } from "../../models/fieldKeys";
import { InputId } from "../../models/inputSlots";
import type { ModelCalculationContext } from "../../models/modelCalculation";
import {
  calculatePerInput,
  createFieldRequestMapper,
} from "./requestMapping";

interface DemoRequest {
  temperature: number;
  humidity: number;
}

function createInputState(
  values: Partial<Record<FieldKeyType, number>>,
): Record<FieldKeyType, number> {
  return {
    ...Object.fromEntries(Object.values(FieldKey).map((fieldKey) => [fieldKey, 0])),
    ...values,
  } as Record<FieldKeyType, number>;
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
    modelOptionsByModel: Object.fromEntries(
      Object.values(ComfortModel).map((modelId) => [modelId, {}]),
    ) as ModelCalculationContext["modelOptionsByModel"],
  };
}

describe("request mapping", () => {
  const mapRequest = createFieldRequestMapper<DemoRequest>({
    temperature: FieldKey.DryBulbTemperature,
    humidity: FieldKey.RelativeHumidity,
  });

  it("maps explicitly selected canonical-SI fields", () => {
    const request = mapRequest(createContext(), InputId.Input1);

    expect(request).toEqual({ temperature: 21.5, humidity: 45 });
    expectTypeOf(mapRequest).returns.toEqualTypeOf<DemoRequest>();
  });

  it("calculates visible inputs and initializes every result slot", () => {
    const calculated = calculatePerInput({
      context: createContext(),
      visibleInputIds: [InputId.Input1, InputId.Input3],
      mapRequest,
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
    const incompleteMapper = createFieldRequestMapper<DemoRequest>({
      temperature: FieldKey.DryBulbTemperature,
    });
    const mapperWithExtraProperty = createFieldRequestMapper<DemoRequest>({
      temperature: FieldKey.DryBulbTemperature,
      humidity: FieldKey.RelativeHumidity,
      // @ts-expect-error DTO mappings cannot add undeclared request properties.
      wind: FieldKey.WindSpeed,
    });
    void incompleteMapper;
    void mapperWithExtraProperty;
  });
});
