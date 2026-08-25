// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InputControlId } from "../../models/inputControls";
import { InputId } from "../../models/inputSlots";
import type { InputFieldRowViewModel } from "../../state/comfortTool/types";
import InputFieldRow from "./InputFieldRow.svelte";

function createField(
  overrides: Partial<InputFieldRowViewModel> = {},
): InputFieldRowViewModel {
  return {
    control: {
      id: InputControlId.Temperature,
      label: "Air temperature",
      displayUnits: "C",
      rangeText: "From 10 to 40",
      minValue: 10,
      maxValue: 40,
      hidden: false,
      disabled: false,
      editorKind: "number",
      step: 0.1,
      menu: null,
      presetOptions: [],
      presetDecimals: 1,
      showClothingBuilder: false,
      displayValuesByInput: { [InputId.Input1]: "25" },
      numericValuesByInput: { [InputId.Input1]: 25 },
    },
    visibleInputIds: [InputId.Input1],
    activeInputId: InputId.Input1,
    onActivateInput: vi.fn(),
    onCommitValue: vi.fn(() => "26"),
    onCommitPreset: vi.fn(),
    onSelectOption: vi.fn(),
    ...overrides,
  };
}

afterEach(cleanup);

describe("InputFieldRow", () => {
  it("commits typed values through the field view model", async () => {
    const user = userEvent.setup();
    const field = createField();
    render(InputFieldRow, { field });

    const input = screen.getByRole("spinbutton", {
      name: "Input 1 Air temperature",
    });
    await user.clear(input);
    await user.type(input, "28");
    await user.tab();

    expect(field.onCommitValue).toHaveBeenCalledWith(InputId.Input1, "28");
  });

  it("restores the projected display value when commit is rejected", async () => {
    const user = userEvent.setup();
    const field = createField({
      onCommitValue: vi.fn(() => null),
    });
    render(InputFieldRow, { field });

    const input = screen.getByRole("spinbutton", {
      name: "Input 1 Air temperature",
    }) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "abc");
    await user.tab();

    expect(field.onCommitValue).toHaveBeenCalled();
    expect(input.value).toBe("25");
  });
});
