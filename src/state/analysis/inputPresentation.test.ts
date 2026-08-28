import { describe, expect, it, vi } from "vitest";

import { ModelId } from "../../catalog/modelIds";
import { InputControlId } from "../../catalog/inputControls";
import { InputId } from "../../catalog/inputSlots";
import { createAnalysisState } from "./createAnalysisState.svelte";
import {
  clampDisplayValue,
  normalizeInputFieldDisplayValue,
} from "./inputPresentation";

function getPanel(
  toolState: ReturnType<typeof createAnalysisState>,
  allowedModelIds: readonly ModelId[] = [toolState.state.setting.selectedModel],
) {
  return toolState.selectors.getInputPanelViewModel(allowedModelIds, vi.fn());
}

describe("input panel display-value projection", () => {
  it("clamps to inclusive display bounds and rejects non-numeric input", () => {
    expect(clampDisplayValue(12, 10, 20)).toBe(12);
    expect(clampDisplayValue(9, 10, 20)).toBe(10);
    expect(clampDisplayValue(21, 10, 20)).toBe(20);
    expect(normalizeInputFieldDisplayValue({ minValue: 10, maxValue: 20 }, " 21 "))
      .toBe("20");
    expect(normalizeInputFieldDisplayValue({ minValue: 10, maxValue: 20 }, "abc"))
      .toBeNull();
    expect(normalizeInputFieldDisplayValue({ minValue: 10, maxValue: 20 }, "  "))
      .toBeNull();
  });
});

describe("buildInputPanelViewModel", () => {
  it("projects tool options, Compare toggles, and field callbacks like chart controls", () => {
    const onSelectModel = vi.fn();
    const toolState = createAnalysisState();
    const panel = toolState.selectors.getInputPanelViewModel(
      [ModelId.PmvAshrae, ModelId.Utci],
      onSelectModel,
    );

    expect(panel.tool.selectedModel).toBe(ModelId.PmvAshrae);
    expect(panel.tool.modelOptions.map((option) => option.value)).toEqual([
      ModelId.PmvAshrae,
      ModelId.Utci,
    ]);
    expect(panel.compare).toBeNull();
    expect(panel.fields.length).toBeGreaterThan(0);
    expect(panel.clothingBuilder?.maxValue).toBeGreaterThan(0);
    expect(panel.modifiers?.availableCount).toBeGreaterThan(0);

    panel.tool.onSelectModel(ModelId.Utci);
    expect(onSelectModel).toHaveBeenCalledWith(ModelId.Utci);

    toolState.actions.setCompareEnabled(true);
    const compared = getPanel(toolState);
    expect(compared.compare?.visibleInputIds).toEqual([
      InputId.Input1,
      InputId.Input2,
    ]);
  });

  it("omits clothing builder and modifiers for models that do not declare them", () => {
    const toolState = createAnalysisState();
    toolState.state.setting.selectedModel = ModelId.Utci;
    const panel = getPanel(toolState);

    expect(panel.clothingBuilder).toBeNull();
    expect(panel.modifiers).toBeNull();
    expect(panel.fields.some((field) => field.control.showClothingBuilder))
      .toBe(false);
  });

  it("clamps committed field values in the projection, not the component", () => {
    const toolState = createAnalysisState();
    const panel = getPanel(toolState);
    const temperature = panel.fields.find(
      (field) => field.control.id === InputControlId.Temperature,
    );
    if (!temperature) {
      throw new Error("Expected a temperature field view model.");
    }

    const maxValue = temperature.control.maxValue;
    if (maxValue === undefined) {
      throw new Error("Expected temperature display max.");
    }

    expect(temperature.onCommitValue(InputId.Input1, String(maxValue + 15)))
      .toBe(String(maxValue));
    expect(temperature.onCommitValue(InputId.Input1, "not-a-number")).toBeNull();

    const after = toolState.selectors.getInputControls().find(
      (control) => control.id === InputControlId.Temperature,
    );
    expect(after?.numericValuesByInput[InputId.Input1]).toBe(maxValue);
  });
});
