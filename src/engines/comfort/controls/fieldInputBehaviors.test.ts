import { describe, expect, it } from "vitest";
import { PhysicalQuantityId } from "../../../catalog/quantities";

import { InputControlId } from "../../../catalog/inputControls";
import { OptionKey, TemperatureMode } from "../../../catalog/inputModes";
import {
  inputDefaultsById,
  InputId,
} from "../../../catalog/inputSlots";
import { UnitSystem } from "../../../catalog/units";
import { SurfaceId } from "../../../catalog/surfaces";
import { ModelId } from "../../../catalog/modelIds";
import { ChartType } from "../../../catalog/chartTypes";
import { ComfortModelBuilder, parseEmptyOptions } from "../../../state/analysis/modelConfigs/builder";
import "../../../state/analysis/modelConfigs";
import { convertMassFromSi } from "../../units/physicalQuantities";
import { resolveInputField, declaredSiRangeForInputField, inputFieldControlId, primaryQuantityIdsForInputField } from "./fieldInputBehaviors";
import type { ControlBehaviorContext } from "./types";

describe("fieldInputBehaviors", () => {
  function createBuilder() {
    return new ComfortModelBuilder<unknown, unknown>(ModelId.PmvAshrae)
      .setLabel("Test")
      .setDescription("Test model")
      .setStandardIds([])
      .setWorkspaceCapabilities([SurfaceId.Explore])
      .setExploreOutputs([{
        key: PhysicalQuantityId.Pmv,
        label: "PMV",
        defaultBands: [{ min: -1, max: 1, label: "Neutral", color: "#fff" }],
      }])
      .setModifiers([])
      .setCharts([{
        id: "test-dynamic-field",
        type: ChartType.Dynamic,
        emptyMessage: "Empty",
        spec: {
          title: "Test",
          axisFields: [
            PhysicalQuantityId.DryBulbTemperature,
            PhysicalQuantityId.RelativeHumidity,
          ],
          resolveGridSpec: () => ({
            output: {
              key: PhysicalQuantityId.Pmv,
              label: "PMV",
              defaultBands: [{ min: -1, max: 1, label: "Neutral", color: "#fff" }],
            },
            requestAdapter: {
              getAxisValue: () => 0,
              setAxisValue: () => undefined,
            },
            evaluate: () => null,
            getOutputValue: () => 0,
          }),
        },
      }])
      .setTables({
        results: [{
          id: "row",
          label: "Row",
          format: () => ({ text: "x" }),
        }],
      })
      .setCalculator(() => ({
        resultsByInput: { input1: null, input2: null, input3: null },
        chartSource: null,
      }))
      .setDynamicAxisFields([PhysicalQuantityId.DryBulbTemperature, PhysicalQuantityId.RelativeHumidity])
      .setDefaultDynamicAxes({ xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.RelativeHumidity })
      .setDefaultOptions({})
      .setOptionParser(parseEmptyOptions);
  }

  it("registers psychrometric index controls", () => {
    const builder = createBuilder();
    builder.setInputFields([
      {
        kind: "numeric",
        controlId: InputControlId.Temperature,
        fieldKey: PhysicalQuantityId.DryBulbTemperature,
        minValue: 20,
        maxValue: 50,
      },
      { kind: "simpleHumidity" },
    ]);
    const config = builder.build();

    expect(config.controls.map(({ id }) => id)).toEqual([
      InputControlId.Temperature,
      InputControlId.Humidity,
    ]);
    expect(config.inputFields.map(inputFieldControlId)).toEqual(
      config.controls.map(({ id }) => id),
    );
  });

  it("registers outdoor wind index controls", () => {
    const builder = createBuilder();
    builder.setInputFields([
      {
        kind: "numeric",
        controlId: InputControlId.Temperature,
        fieldKey: PhysicalQuantityId.DryBulbTemperature,
        minValue: -45,
        maxValue: 0,
      },
      {
        kind: "outdoorWindSpeed",
        minValue: 1,
        maxValue: 20,
      },
    ]);
    const config = builder.build();

    expect(config.controls.map(({ id }) => id)).toEqual([
      InputControlId.Temperature,
      InputControlId.WindSpeed,
    ]);
  });

  it("hides radiant temperature in operative mode for UTCI controls", () => {
    const builder = createBuilder();
    builder.setInputFields([
      {
        kind: "operativeTemperature",
        minValue: -30,
        maxValue: 50,
      },
      {
        kind: "radiantTemperature",
        minValue: -30,
        maxValue: 50,
        hideWhen: "operative",
      },
      {
        kind: "numeric",
        controlId: InputControlId.WindSpeed,
        fieldKey: PhysicalQuantityId.WindSpeed,
      },
      { kind: "simpleHumidity" },
    ]);
    const config = builder.build();
    const radiant = config.controls.find(({ id }) => id === InputControlId.RadiantTemperature);
    const context = {
      quantitiesByInput: inputDefaultsById,
      auxiliaryQuantitiesByInput: {
        input1: {},
        input2: {},
        input3: {},
      },
      modelInputs: {},
      options: { [OptionKey.TemperatureMode]: TemperatureMode.Operative },
      unitSystem: UnitSystem.SI,
      visibleInputIds: [InputId.Input1],
    } as ControlBehaviorContext;

    expect(radiant?.behavior.buildViewModel(context).hidden).toBe(true);
  });

  it("shows radiant temperature in air mode for operative temperature controls", () => {
    const builder = createBuilder();
    builder.setInputFields([
      { kind: "operativeTemperature" },
      { kind: "radiantTemperature", hideWhen: "operative" },
    ]);
    const config = builder.build();
    const radiant = config.controls.find(({ id }) => id === InputControlId.RadiantTemperature);
    const context = {
      quantitiesByInput: inputDefaultsById,
      auxiliaryQuantitiesByInput: {
        input1: {},
        input2: {},
        input3: {},
      },
      modelInputs: {},
      options: { [OptionKey.TemperatureMode]: TemperatureMode.Air },
      unitSystem: UnitSystem.SI,
      visibleInputIds: [InputId.Input1],
    } as ControlBehaviorContext;

    expect(radiant?.behavior.buildViewModel(context).hidden).toBe(false);
  });

  it("registers dry-bulb temperature with optional limits", () => {
    const control = resolveInputField({
      kind: "numeric",
      controlId: InputControlId.Temperature,
      fieldKey: PhysicalQuantityId.DryBulbTemperature,
      minValue: 10,
      maxValue: 40,
    });

    expect(control.behavior.buildViewModel({
      quantitiesByInput: inputDefaultsById,
      auxiliaryQuantitiesByInput: {
        input1: {},
        input2: {},
        input3: {},
      },
      modelInputs: {},
      options: {},
      unitSystem: UnitSystem.SI,
      visibleInputIds: [InputId.Input1],
    } as ControlBehaviorContext).minValue).toBe(10);
  });

  it("converts extra catalog quantities from catalog SI units without model id branches", () => {
    const control = resolveInputField({
      kind: "quantity",
      quantityId: PhysicalQuantityId.BodyWeight,
    });
    const context = {
      quantitiesByInput: inputDefaultsById,
      auxiliaryQuantitiesByInput: {
        input1: {},
        input2: {},
        input3: {},
      },
      modelInputs: { [PhysicalQuantityId.BodyWeight]: 75 },
      options: {},
      unitSystem: UnitSystem.IP,
      visibleInputIds: [InputId.Input1],
    } as ControlBehaviorContext;

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
      patch?.modelInputsPatch?.[PhysicalQuantityId.BodyWeight] ?? 75,
    ).toBeCloseTo(75, 8);
  });

  it("maps each input field kind to its control id, primary quantities, and SI range", () => {
    expect(inputFieldControlId({ kind: "simpleHumidity" })).toBe(InputControlId.Humidity);
    expect(primaryQuantityIdsForInputField({ kind: "simpleHumidity" })).toEqual([
      PhysicalQuantityId.RelativeHumidity,
    ]);
    expect(declaredSiRangeForInputField(
      { kind: "simpleHumidity" },
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
    })).toEqual([]);
    expect(inputFieldControlId({
      kind: "quantity",
      quantityId: PhysicalQuantityId.BodyWeight,
    })).toBe(PhysicalQuantityId.BodyWeight);
  });

  it("constructs a quantity control from catalog Extra ids", () => {
    expect(() => resolveInputField({
      kind: "quantity",
      quantityId: PhysicalQuantityId.BodyWeight,
    })).not.toThrow();
  });
});
