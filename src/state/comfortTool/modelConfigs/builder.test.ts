import { describe, expect, it } from "vitest";

import { ComfortModel } from "../../../models/comfortModels";
import { PhysicalQuantityId } from "../../../models/physicalQuantities";
import { WorkspaceCapability } from "../../../models/output/workspaceCapabilities";
import { ChartKind } from "../../../models/output/chartKinds";
import { TableLayout } from "../../../models/output/tableLayouts";
import { ModelOutputKey, type ModelOutput, type NumericBand } from "../../../models/modelCapabilities";
import {
  ComfortModelBuilder,
  createEmptyResults,
  parseEmptyOptions,
  type OutputChartDeclarationInput,
} from "./builder";

const bands: readonly NumericBand[] = [
  { min: -Infinity, max: Infinity, label: "All values", color: "#ffffff" },
];

const pmvOutput: ModelOutput = {
  key: ModelOutputKey.Pmv,
  label: "PMV",
  defaultBands: bands,
};

function createCustomOutputChart(
  instanceId: string = "pmv-ashrae-psychrometric",
): OutputChartDeclarationInput {
  return {
    instanceId,
    kind: ChartKind.Custom,
    name: "Test chart",
    emptyMessage: "No test chart yet.",
    spec: { build: () => null },
  };
}

function createExploreBuilder() {
  return new ComfortModelBuilder<unknown, unknown>(ComfortModel.PmvAshrae)
    .setLabel("Test model")
    .setDescription("Test model description.")
    .setStandardIds([])
    .setWorkspaceCapabilities([WorkspaceCapability.Explore])
    .setExploreOutputs([pmvOutput])
    .setModifiers([])
    .setOutputCharts([createCustomOutputChart()])
    .setOutputTable({
      layout: TableLayout.CompareMatrix,
      rows: [{
        id: "test-row",
        label: "Test row",
        format: () => ({ text: "value" }),
      }],
    })
    .setDefaultOptions({})
    .setOptionParser(parseEmptyOptions)
    .setCalculator(() => ({ resultsByInput: createEmptyResults<unknown>(), chartSource: null }))
    .setDynamicAxisFields([
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.RelativeHumidity,
    ])
    .setDefaultDynamicAxes({
      xAxis: PhysicalQuantityId.DryBulbTemperature,
      yAxis: PhysicalQuantityId.RelativeHumidity,
    });
}

describe("ComfortModelBuilder capabilities", () => {
  it("builds a complete minimal validated configuration snapshot", () => {
    const definition = createExploreBuilder().build();
    expect(definition.outputCharts.defaultInstanceId).toBe(
      "pmv-ashrae-psychrometric",
    );
    expect(definition.buildChart).toBeTypeOf("function");
  });

  it("requires Standard workspace for compliance profile", () => {
    expect(() => createExploreBuilder().setComplianceProfile({
      output: ModelOutputKey.Pmv,
      bands,
      legendTitle: "Bands",
      caption: "Caption",
      getFeedback: () => ({ text: "ok", passes: true }),
    }).build()).toThrow(/without Standard workspace/i);
  });


});
