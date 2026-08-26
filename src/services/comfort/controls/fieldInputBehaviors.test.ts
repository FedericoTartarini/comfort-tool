import { describe, expect, it } from "vitest";

import { PhysicalQuantityId } from "../../../models/quantities";
import { PhsQuantityId } from "../../../models/phs";
import { InputControlId } from "../../../models/inputControls";
import { OptionKey, TemperatureMode } from "../../../models/inputModes";
import {
  inputDefaultsById,
  InputId,
} from "../../../models/inputSlots";
import { ModelOutputKey } from "../../../models/modelCapabilities";
import { UnitSystem } from "../../../models/units";
import { WorkspaceId } from "../../../models/workspaces";
import { ModelId } from "../../../models/modelIds";
import { ChartEngine } from "../../../models/output/chartKinds";
import { TableType } from "../../../models/output/tableLayouts";
import { ComfortModelBuilder, parseEmptyOptions } from "../../../state/comfortTool/modelConfigs/builder";
import "../../../state/comfortTool/modelConfigs";
import { convertMassFromSi } from "../../units/physicalQuantities";
import { resolveInputField, declaredSiRangeForInputField, inputFieldControlId, primaryQuantityIdsForInputField } from "./fieldInputBehaviors";
import type { ControlBehaviorContext } from "./types";

describe("fieldInputBehaviors", () => {
  function createBuilder() {
    return new ComfortModelBuilder<unknown, unknown>(ModelId.PmvAshrae)
      .setLabel("Test")
      .setDescription("Test model")
      .setStandardIds([])
      .setWorkspaceCapabilities([WorkspaceId.Explore])
      .setExploreOutputs([{
        key: ModelOutputKey.Pmv,
        label: "PMV",
        defaultBands: [{ min: -1, max: 1, label: "Neutral", color: "#fff" }],
      }])
      .setModifiers([])
      .setCharts([{
        id: "test-dynamic-field",
        engine: ChartEngine.DynamicField,
        name: "Test",
        emptyMessage: "Empty",
        spec: {
          title: "Test",
          axisFields: [
            PhysicalQuantityId.DryBulbTemperature,
            PhysicalQuantityId.RelativeHumidity,
          ],
          resolveGridSpec: () => ({
            output: {
              key: ModelOutputKey.Pmv,
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
        analysis: {
          type: TableType.Analysis,
          rows: [{
            id: "row",
            label: "Row",
            format: () => ({ text: "x" }),
          }],
        },
      })
      .setCalculator(() => ({
        resultsByInput: { input1: null, input2: null, input3: null },
        chartSource: null,
      }))
      .setDynamicAxisFields([PhysicalQuantityId.DryBulbTemperature, PhysicalQuantityId.RelativeHumidity])
      .setDefaultDynamicAxes({
        xAxis: PhysicalQuantityId.DryBulbTemperature,
        yAxis: PhysicalQuantityId.RelativeHumidity,
      })
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

  it("converts model-scoped quantities from catalog SI units without model id branches", () => {
    const control = resolveInputField({
      kind: "modelQuantity",
      quantityId: PhsQuantityId.BodyWeight,
    });
    const context = {
      quantitiesByInput: inputDefaultsById,
      auxiliaryQuantitiesByInput: {
        input1: {},
        input2: {},
        input3: {},
      },
      modelInputs: { [PhsQuantityId.BodyWeight]: 75 },
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
      throw new Error("modelQuantity controls must apply numeric input.");
    }
    const patch = applyInput(
      context,
      InputId.Input1,
      String(viewModel.numericValuesByInput[InputId.Input1]),
    );
    expect(patch?.modelInputsPatch?.[PhsQuantityId.BodyWeight]).toBeCloseTo(75, 8);
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
      kind: "modelQuantity",
      quantityId: PhsQuantityId.BodyWeight,
    })).toEqual([]);
    expect(inputFieldControlId({
      kind: "modelQuantity",
      quantityId: PhsQuantityId.BodyWeight,
    })).toBe(PhsQuantityId.BodyWeight);
  });

  it("constructs a modelQuantity control before the quantity is in the catalog", () => {
    expect(() => resolveInputField({
      kind: "modelQuantity",
      quantityId: "audit.exampleMass",
    })).not.toThrow();
  });
});
