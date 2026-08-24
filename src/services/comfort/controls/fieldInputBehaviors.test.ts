import { describe, expect, it } from "vitest";

import { PhysicalQuantityId } from "../../../models/physicalQuantities";
import { InputControlId } from "../../../models/inputControls";
import { OptionKey, TemperatureMode } from "../../../models/inputModes";
import {
  inputDefaultsById,
  InputId,
} from "../../../models/inputSlots";
import { ModelOutputKey } from "../../../models/modelCapabilities";
import { UnitSystem } from "../../../models/units";
import { WorkspaceCapability } from "../../../models/output/workspaceCapabilities";
import { ComfortModel } from "../../../models/comfortModels";
import { ChartKind } from "../../../models/output/chartKinds";
import { TableType } from "../../../models/output/tableLayouts";
import { ComfortModelBuilder, parseEmptyOptions } from "../../../state/comfortTool/modelConfigs/builder";
import { resolveInputField } from "./fieldInputBehaviors";
import type { ControlBehaviorContext } from "./types";

describe("fieldInputBehaviors", () => {
  function createBuilder() {
    return new ComfortModelBuilder<unknown, unknown>(ComfortModel.PmvAshrae)
      .setLabel("Test")
      .setDescription("Test model")
      .setStandardIds([])
      .setWorkspaceCapabilities([WorkspaceCapability.Explore])
      .setExploreOutputs([{
        key: ModelOutputKey.Pmv,
        label: "PMV",
        defaultBands: [{ min: -1, max: 1, label: "Neutral", color: "#fff" }],
      }])
      .setModifiers([])
      .setOutputCharts([{
        instanceId: "pmv-ashrae-psychrometric",
        kind: ChartKind.Custom,
        name: "Test",
        emptyMessage: "Empty",
        spec: { build: () => null },
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
});
