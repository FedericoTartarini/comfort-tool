import { describe, expect, it } from "vitest";
import { PhysicalQuantityId } from "../../../catalog/quantities";

import { InputControlId } from "../../../catalog/inputControls";
import { OptionKey, TemperatureMode } from "../../../catalog/inputModes";
import {
  inputDefaultsById,
  InputId,
} from "../../../catalog/inputSlots";
import { UnitSystem } from "../../../catalog/units";
import { ModelId } from "../../../catalog/modelIds";
import { ChartType } from "../../../catalog/chartTypes";
import { InputWidget } from "../../../catalog/inputWidgets";
import {
  defineModel,
  inputQuantity,
  parseEmptyOptions,
  resultQuantity,
} from "../../../state/modelRegistry/builder";
import "../../../state/modelRegistry";
import { convertMassFromSi } from "../../units/physicalQuantities";
import { resolveInputField, declaredSiRangeForInputField, inputFieldControlId, primaryQuantityIdsForInputField } from "./fieldInputBehaviors";
import type { ControlBehaviorContext } from "./types";

describe("fieldInputBehaviors", () => {
  function testLibrary() {
    return {};
  }
  testLibrary.label = "Test";
  testLibrary.description = "Test model";

  function defineTestModel(
    inputs: Parameters<typeof defineModel>[1]["inputs"],
  ) {
    return defineModel(testLibrary, {
      id: ModelId.PmvAshrae,
      standardIds: [],
      exploreMode: true,
      inputs,
      response: {
        values: [
          resultQuantity("pmv", PhysicalQuantityId.PredictedMeanVote),
        ],
      },
      tables: {
        results: [{
          id: "row",
          label: "Row",
          format: () => ({ text: "x" }),
        }],
      },
      charts: [{
        type: ChartType.Dynamic,
        emptyMessage: "Empty",
        spec: {
          title: "Test",
          axes: {
            x: PhysicalQuantityId.DryBulbTemperature,
            y: PhysicalQuantityId.RelativeHumidity,
          },
          axisFields: [
            PhysicalQuantityId.DryBulbTemperature,
            PhysicalQuantityId.RelativeHumidity,
          ],
          evaluate: () => ({}),
          getOutputValue: () => 0,
          requestAdapter: {
            getAxisValue: () => 0,
            setAxisValue: () => undefined,
          },
        },
      }],
      features: {
        exploreOutputs: [{
          key: PhysicalQuantityId.PredictedMeanVote,
          label: "PMV",
          defaultBands: [{ min: -1, max: 1, label: "Neutral", color: "#fff" }],
        }],
        invoke: () => ({}),
        defaultOptions: {},
        parseOptions: parseEmptyOptions,
      },
    });
  }

  it("registers psychrometric index controls", () => {
    const config = defineTestModel([
      inputQuantity("tdb", PhysicalQuantityId.DryBulbTemperature, {
        minValue: 20,
        maxValue: 50,
      }),
      inputQuantity("rh", PhysicalQuantityId.RelativeHumidity, {
        minValue: 0,
        maxValue: 100,
      }),
    ]);

    expect(config.controls.map(({ id }) => id)).toEqual([
      InputControlId.Temperature,
      InputControlId.Humidity,
    ]);
    expect(config.inputFields.map(inputFieldControlId)).toEqual(
      config.controls.map(({ id }) => id),
    );
  });

  it("registers outdoor wind index controls", () => {
    const config = defineTestModel([
      inputQuantity("tdb", PhysicalQuantityId.DryBulbTemperature, {
        minValue: -45,
        maxValue: 0,
      }),
      inputQuantity("v", PhysicalQuantityId.WindSpeed, {
        minValue: 1,
        maxValue: 20,
      }),
    ]);

    expect(config.controls.map(({ id }) => id)).toEqual([
      InputControlId.Temperature,
      InputControlId.WindSpeed,
    ]);
  });

  it("hides radiant temperature in operative mode for UTCI controls", () => {
    const config = defineTestModel([
      inputQuantity("tdb", PhysicalQuantityId.DryBulbTemperature, {
        widget: InputWidget.OperativeTemperature,
        minValue: -30,
        maxValue: 50,
      }),
      inputQuantity("tr", PhysicalQuantityId.MeanRadiantTemperature, {
        hideWhen: "operative",
        minValue: -30,
        maxValue: 50,
      }),
      inputQuantity("v", PhysicalQuantityId.WindSpeed, {
        widget: InputWidget.Numeric,
        minValue: 0,
        maxValue: 17,
      }),
      inputQuantity("rh", PhysicalQuantityId.RelativeHumidity, {
        minValue: 0,
        maxValue: 100,
      }),
    ]);
    const radiant = config.controls.find(({ id }) => id === InputControlId.RadiantTemperature);
    const context: ControlBehaviorContext = {
      quantitiesByInput: inputDefaultsById,
      options: { [OptionKey.TemperatureMode]: TemperatureMode.Operative },
      unitSystem: UnitSystem.SI,
      visibleInputIds: [InputId.Input1],
    };

    expect(radiant?.behavior.buildViewModel(context).hidden).toBe(true);
  });

  it("shows radiant temperature in air mode for operative temperature controls", () => {
    const config = defineTestModel([
      inputQuantity("tdb", PhysicalQuantityId.DryBulbTemperature, {
        widget: InputWidget.OperativeTemperature,
        minValue: 10,
        maxValue: 40,
      }),
      inputQuantity("tr", PhysicalQuantityId.MeanRadiantTemperature, {
        hideWhen: "operative",
        minValue: 10,
        maxValue: 40,
      }),
    ]);
    const radiant = config.controls.find(({ id }) => id === InputControlId.RadiantTemperature);
    const context: ControlBehaviorContext = {
      quantitiesByInput: inputDefaultsById,
      options: { [OptionKey.TemperatureMode]: TemperatureMode.Air },
      unitSystem: UnitSystem.SI,
      visibleInputIds: [InputId.Input1],
    };

    expect(radiant?.behavior.buildViewModel(context).hidden).toBe(false);
  });

  it("registers dry-bulb temperature with declared SI limits", () => {
    const control = resolveInputField({
      kind: "numeric",
      controlId: InputControlId.Temperature,
      fieldKey: PhysicalQuantityId.DryBulbTemperature,
      minValue: 10,
      maxValue: 40,
    });

    expect(control.behavior.buildViewModel({
      quantitiesByInput: inputDefaultsById,
      options: {},
      unitSystem: UnitSystem.SI,
      visibleInputIds: [InputId.Input1],
    }).minValue).toBe(10);
  });

  it("converts catalog quantities from catalog SI units without model id branches", () => {
    const control = resolveInputField({
      kind: "quantity",
      quantityId: PhysicalQuantityId.BodyWeight,
      minValue: 30,
      maxValue: 200,
    });
    const context: ControlBehaviorContext = {
      quantitiesByInput: {
        ...inputDefaultsById,
        [InputId.Input1]: {
          ...inputDefaultsById[InputId.Input1],
          [PhysicalQuantityId.BodyWeight]: 75,
        },
      },
      options: {},
      unitSystem: UnitSystem.IP,
      visibleInputIds: [InputId.Input1],
    };

    const viewModel = control.behavior.buildViewModel(context);
    expect(viewModel.label).toBe("Body weight");
    expect(viewModel.displayUnits).toBe("lb");
    expect(viewModel.numericValuesByInput[InputId.Input1])
      .toBeCloseTo(convertMassFromSi(75000), 8);

    const applyInput = control.behavior.applyInput;
    if (!applyInput) {
      throw new Error("quantity controls must apply numeric input.");
    }
    const patch = applyInput(
      context,
      InputId.Input1,
      String(viewModel.numericValuesByInput[InputId.Input1]),
    );
    expect(
      patch?.quantitiesPatch?.[InputId.Input1]?.[PhysicalQuantityId.BodyWeight] ?? 75,
    ).toBeCloseTo(75, 8);
  });

  it("maps each input field kind to its control id, primary quantities, and SI range", () => {
    expect(inputFieldControlId({ kind: "simpleHumidity", minValue: 0, maxValue: 100 })).toBe(InputControlId.Humidity);
    expect(primaryQuantityIdsForInputField({ kind: "simpleHumidity", minValue: 0, maxValue: 100 })).toEqual([
      PhysicalQuantityId.RelativeHumidity,
    ]);
    expect(declaredSiRangeForInputField(
      { kind: "simpleHumidity", minValue: 0, maxValue: 100 },
      PhysicalQuantityId.RelativeHumidity,
    )).toEqual({ minSi: 0, maxSi: 100 });

    const windChillTemperature = {
      kind: "numeric" as const,
      controlId: InputControlId.Temperature,
      fieldKey: PhysicalQuantityId.DryBulbTemperature,
      minValue: -45,
      maxValue: 0,
    };
    expect(inputFieldControlId(windChillTemperature)).toBe(InputControlId.Temperature);
    expect(primaryQuantityIdsForInputField(windChillTemperature)).toEqual([
      PhysicalQuantityId.DryBulbTemperature,
    ]);
    expect(declaredSiRangeForInputField(
      windChillTemperature,
      PhysicalQuantityId.DryBulbTemperature,
    )).toEqual({ minSi: -45, maxSi: 0 });

    expect(primaryQuantityIdsForInputField({
      kind: "quantity",
      quantityId: PhysicalQuantityId.BodyWeight,
      minValue: 30,
      maxValue: 200,
    })).toEqual([PhysicalQuantityId.BodyWeight]);
    expect(inputFieldControlId({
      kind: "quantity",
      quantityId: PhysicalQuantityId.BodyWeight,
      minValue: 30,
      maxValue: 200,
    })).toBe(PhysicalQuantityId.BodyWeight);
  });

  it("constructs a quantity control from a catalog id plus SI range", () => {
    expect(() => resolveInputField({
      kind: "quantity",
      quantityId: PhysicalQuantityId.BodyWeight,
      minValue: 30,
      maxValue: 200,
    })).not.toThrow();
  });
});
