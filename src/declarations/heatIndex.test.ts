/**
 * Unit tests for the Heat Index calculation service.
 */
import { describe, expect, it } from "vitest";
import { heat_index } from "jsthermalcomfort";
import { PhysicalQuantityId, type QuantityState } from "../catalog/quantities";
import { heatIndexModelConfig } from "./heatIndex";
import { invokeMappedLibrary } from "../engines/comfort/libraryInvoke";
import { inputQuantity, resultQuantity } from "../state/modelRegistry/builder";
import { ModelId } from "../catalog/modelIds";
import { UnitSystem } from "../catalog/units";
import { convertQuantityFromSi } from "../engines/units";
import { InputId } from "../catalog/inputSlots";
import { buildChartPlotly } from "../testSupport/modelChartTestHelpers";
import { type ChartBuildContext } from "../catalog/modelCapabilities";
import { FieldChartProfileKind } from "../catalog/fieldChartProfile";
import { InputControlId } from "../catalog/inputControls";
import {
  requiredControlIdsByModel,
  requiredPrimaryQuantitiesByModel,
} from "../testSupport/requiredModelControls";
import {
  inputFieldControlId,
  primaryQuantityIdsForInputField,
} from "../engines/comfort/controls/fieldInputBehaviors";

function calculateHeatIndex(request: QuantityState) {
  return invokeMappedLibrary(
    heat_index,
    [
      inputQuantity("tdb", PhysicalQuantityId.DryBulbTemperature, {
        minValue: 20,
        maxValue: 50,
      }),
      inputQuantity("rh", PhysicalQuantityId.RelativeHumidity, {
        minValue: 0,
        maxValue: 100,
      }),
    ],
    [resultQuantity("hi", PhysicalQuantityId.HeatIndex)],
    request,
  );
}

describe("heatIndex service", () => {
  it("rejects a non-finite result instead of assigning the first zone", () => {
    expect(() => calculateHeatIndex({ tdb: Number.MAX_VALUE, rh: 50 }))
      .toThrow(/Heat Index.*non-finite/i);
  });

  it("calculates Heat Index correctly in SI format", () => {
    // 35°C, 70% RH -> HI should be ~50°C (Danger)
    const result = calculateHeatIndex({
      tdb: 35,
      rh: 70,
    });

    expect(result.hi).toBeGreaterThan(45);
    expect(heat_index.mapping(result.hi!)).toBe("danger");
  });

  it("evaluates Heat Index below the Rothfusz applicability threshold", () => {
    const result = calculateHeatIndex({ tdb: 25, rh: 50 });

    expect(result.hi).toBeGreaterThan(20);
    expect(result.hi).toBeLessThan(27);
    expect(heat_index.mapping(result.hi!)).toBe("no risk");
  });

  it("converts the SI Heat Index result for IP display", () => {
    // 35 °C is 95 °F; the apparent temperature is about 122 °F.
    const result = calculateHeatIndex({
      tdb: 35,
      rh: 70,
    });

    const hiF = convertQuantityFromSi(
      PhysicalQuantityId.HeatIndex,
      result.hi!,
      UnitSystem.IP,
    );
    expect(hiF).toBeGreaterThan(115);
    expect(hiF).toBeLessThan(125);
    expect(heat_index.mapping(result.hi!)).toBe("danger");
  });

  it("maps Python right-closed Heat Index thresholds", () => {
    expect(heat_index.mapping(27)).toBe("no risk");
    expect(heat_index.mapping(32)).toBe("caution");
    expect(heat_index.mapping(41)).toBe("extreme caution");
    expect(heat_index.mapping(54)).toBe("danger");
  });

  it("identifies Extreme Danger threshold accurately", () => {
    // 40.56 °C is 105 °F; at 75% RH this is Extreme Danger.
    const result = calculateHeatIndex({
      tdb: 40.56,
      rh: 75,
    });

    expect(heat_index.mapping(result.hi!)).toBe("extreme danger");
  });

  it("builds static and dynamic chart results through the typed grid strategy", () => {
    const request = { tdb: 35, rh: 70 };
    const result = calculateHeatIndex(request);
    const chartSource = {
      inputs: { [InputId.Input1]: request },
    };
    const resultsByInput = {
      [InputId.Input1]: result,
      [InputId.Input2]: null,
      [InputId.Input3]: null,
    };
    const fixedContext = {
      unitSystem: UnitSystem.SI,
      baselineInputId: InputId.Input1,
      fieldChartConfig: { profileKind: FieldChartProfileKind.Explore, xField: PhysicalQuantityId.DryBulbTemperature, yField: PhysicalQuantityId.RelativeHumidity, zOutput: heatIndexModelConfig.exploreOutputs[0].key, bands: heatIndexModelConfig.exploreOutputs[0].defaultBands },
    } satisfies ChartBuildContext;

    const dynamicChart = buildChartPlotly(heatIndexModelConfig,
      "dynamic",
      chartSource,
      resultsByInput,
      fixedContext,
    );

    expect(dynamicChart?.traces[0].type).toBe("scatter");
    expect(dynamicChart?.traces[0].fill).toBe("toself");
    expect(dynamicChart?.traces.some((trace) => trace.type === "contour")).toBe(false);
    expect(dynamicChart?.layout.height).toBe(480);
    expect(dynamicChart?.traces.some((trace) => trace.type === "scatter")).toBe(true);
    expect(dynamicChart?.traces.find(({ name }) => name?.endsWith("hover"))).toBeUndefined();
    expect(dynamicChart?.traces.find(({ name }) => name === "Input 1")?.hovertemplate)
      .toContain("Heat Index");
  });

  it("trusts the state-owned dynamic-axis invariant without revalidating it", () => {
    const request = { tdb: 35, rh: 70 };
    const result = calculateHeatIndex(request);

    const chart = buildChartPlotly(heatIndexModelConfig,
      "dynamic",
      {
        inputs: { [InputId.Input1]: request },
      },
      {
        [InputId.Input1]: result,
        [InputId.Input2]: null,
        [InputId.Input3]: null,
      },
      {
        unitSystem: UnitSystem.SI,
        baselineInputId: InputId.Input1,
        fieldChartConfig: { profileKind: FieldChartProfileKind.Explore, xField: PhysicalQuantityId.DryBulbTemperature, yField: PhysicalQuantityId.DryBulbTemperature, zOutput: heatIndexModelConfig.exploreOutputs[0].key, bands: heatIndexModelConfig.exploreOutputs[0].defaultBands },
      },
    );

    expect(chart).not.toBeNull();
    expect(chart?.layout.xaxis.title).toBe(chart?.layout.yaxis.title);
  });

  it("applies edited Explore bands to fixed-view fills and input hover", () => {
    const request = { tdb: 35, rh: 70 };
    const result = calculateHeatIndex(request);
    const bands = [
      {
        min: -Infinity,
        max: result.hi!,
        label: "Below target",
        color: "#123456",
      },
      {
        min: result.hi!,
        max: Infinity,
        label: "At or above target",
        color: "#abcdef",
      },
    ];
    const chart = buildChartPlotly(heatIndexModelConfig,
      "dynamic",
      { inputs: { [InputId.Input1]: request } },
      {
        [InputId.Input1]: result,
        [InputId.Input2]: null,
        [InputId.Input3]: null,
      },
      {
        unitSystem: UnitSystem.SI,
        baselineInputId: InputId.Input1,
        fieldChartConfig: { profileKind: FieldChartProfileKind.Explore, xField: PhysicalQuantityId.DryBulbTemperature, yField: PhysicalQuantityId.RelativeHumidity, zOutput: PhysicalQuantityId.HeatIndex, bands },
      },
    );
    const fillTraces = chart?.traces.filter(
      ({ name, fill }) => typeof name === "string" && name.startsWith("Heat Index bands:") && fill === "toself",
    );
    const inputTrace = chart?.traces.find(({ name }) => name === "Input 1");

    expect(fillTraces?.map(({ fillcolor }) => fillcolor))
      .toEqual(expect.arrayContaining(["#123456", "#abcdef"]));
    expect(inputTrace?.hoverinfo).toBe("all");
    expect(String(chart?.layout.xaxis.title)).toContain("Air temperature");
    expect(String(chart?.layout.yaxis.title)).toContain("Relative humidity");
  });

  it("declares a single Dynamic chart from defineModel", () => {
    expect(heatIndexModelConfig.id).toBe(ModelId.HeatIndex);
    expect(heatIndexModelConfig.chartInstances.defaultInstanceId).toBe("dynamic");
    expect(heatIndexModelConfig.chartInstances.entries.map(({ instanceId, type }) => ({
      instanceId,
      type,
    }))).toEqual([
      { instanceId: "dynamic", type: "dynamic" },
    ]);
  });

  it("pins required Analysis controls independently of inputFields", () => {
    expect(heatIndexModelConfig.controls.map(({ id }) => id)).toEqual([
      ...requiredControlIdsByModel[ModelId.HeatIndex],
    ]);
  });

  it("fails if Heat Index drops the required humidity field", () => {
    const requiredControlIds = [...requiredControlIdsByModel[ModelId.HeatIndex]];
    const requiredQuantities = [...requiredPrimaryQuantitiesByModel[ModelId.HeatIndex]];
    const withoutHumidity = heatIndexModelConfig.inputFields.filter(
      (spec) => spec.kind !== "simpleHumidity",
    );
    const droppedControlIds = withoutHumidity.map(inputFieldControlId);
    const droppedQuantities = withoutHumidity.flatMap((spec) => [
      ...primaryQuantityIdsForInputField(spec),
    ]);

    expect(droppedControlIds).not.toEqual(requiredControlIds);
    expect(droppedQuantities).not.toContain(PhysicalQuantityId.RelativeHumidity);
    expect(requiredQuantities).toContain(PhysicalQuantityId.RelativeHumidity);
    expect(droppedControlIds).not.toContain(InputControlId.Humidity);
    expect(heatIndexModelConfig.controls.map(({ id }) => id)).toEqual(requiredControlIds);
  });
});
