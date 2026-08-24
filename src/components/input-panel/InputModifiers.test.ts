// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { tick } from "svelte";
import { afterEach, describe, expect, it } from "vitest";

import { ComfortModel } from "../../models/comfortModels";
import { ModifierId } from "../../models/inputModifiers";
import { PhysicalQuantityId } from "../../models/physicalQuantities";
import { InputId } from "../../models/inputSlots";
import { createComfortToolState } from "../../state/comfortTool/createComfortToolState.svelte";
import InputModifiers from "./InputModifiers.svelte";

afterEach(cleanup);

describe("InputModifiers", () => {
  it("keeps modal edits in a draft and commits every change on Apply", async () => {
    const user = userEvent.setup();
    const toolState = createComfortToolState();
    render(InputModifiers, { toolState });

    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Open input modifiers" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Solar gain on occupant", { exact: true })).toBeTruthy();
    const measuredInput = screen.getByRole("spinbutton", {
      name: "Input 1 Measured air speed",
    });
    const measuredToggle = screen.getByRole("checkbox", {
      name: "Input 1 Measured air speed",
    });
    expect(measuredToggle.hasAttribute("disabled")).toBe(true);

    const dynamicClothingToggle = screen.getByRole("checkbox", {
      name: "Input 1 Dynamic clothing",
    });
    expect(dynamicClothingToggle.hasAttribute("disabled")).toBe(false);
    await user.click(dynamicClothingToggle);
    await tick();

    expect(toolState.state.activeModifiersByInput[InputId.Input1]
      [ModifierId.DynamicClothing]).toBe(false);
    expect(screen.getByRole("dialog").textContent)
      .toContain("Effective clothing insulation:");

    await user.type(measuredInput, "0.6");
    await user.tab();
    await waitFor(() => {
      expect(screen.getByRole("checkbox", {
        name: "Input 1 Measured air speed",
      }).hasAttribute("disabled")).toBe(false);
    });
    const enabledMeasuredToggle = screen.getByRole("checkbox", {
      name: "Input 1 Measured air speed",
    });
    expect(enabledMeasuredToggle.closest("label")?.classList.contains("grayscale"))
      .toBe(false);
    expect(enabledMeasuredToggle.closest("label")?.classList.contains("contrast-50"))
      .toBe(false);
    await user.click(enabledMeasuredToggle);
    await tick();

    expect((enabledMeasuredToggle as HTMLInputElement).checked).toBe(true);
    expect(dynamicClothingToggle.closest("label")?.classList.contains("grayscale"))
      .toBe(false);

    expect(toolState.state.auxiliaryQuantitiesByInput[InputId.Input1]
      [PhysicalQuantityId.ModifierMeasuredAirSpeed]).toBeUndefined();
    expect(toolState.state.activeModifiersByInput[InputId.Input1]
      [ModifierId.MeasuredAirSpeed]).toBe(false);
    expect(screen.getByRole("dialog").textContent).toContain("Effective air speed:");

    await user.click(screen.getByRole("button", { name: "Apply changes" }));
    await tick();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(toolState.state.auxiliaryQuantitiesByInput[InputId.Input1]
      [PhysicalQuantityId.ModifierMeasuredAirSpeed]).toBe(0.6);
    expect(toolState.state.activeModifiersByInput[InputId.Input1]
      [ModifierId.MeasuredAirSpeed]).toBe(true);
    expect(toolState.state.activeModifiersByInput[InputId.Input1]
      [ModifierId.DynamicClothing]).toBe(true);
    expect(screen.getByRole("button", { name: "Open input modifiers" }).textContent)
      .toContain("2 active");
  });

  it("discards Cancel and Escape edits without changing calculation state", async () => {
    const user = userEvent.setup();
    const toolState = createComfortToolState();
    render(InputModifiers, { toolState });

    await user.click(screen.getByRole("button", { name: "Open input modifiers" }));
    const morningInput = screen.getByRole("spinbutton", {
      name: "Input 1 Outdoor air temperature at 6 a.m.",
    });
    await user.type(morningInput, "10");
    await user.tab();
    await user.click(screen.getByRole("checkbox", {
      name: "Input 1 Morning clothing estimate",
    }));
    await user.clear(morningInput);
    await user.tab();
    await waitFor(() => {
      const disabledMorningToggle = screen.getByRole("checkbox", {
        name: "Input 1 Morning clothing estimate",
      }) as HTMLInputElement;
      expect(disabledMorningToggle.checked).toBe(false);
      expect(disabledMorningToggle.hasAttribute("disabled")).toBe(true);
      expect(disabledMorningToggle.closest("label")?.classList.contains("grayscale"))
        .toBe(true);
    });
    expect(toolState.state.activeModifiersByInput[InputId.Input1]
      [ModifierId.MorningClothingEstimate]).toBe(false);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(toolState.state.auxiliaryQuantitiesByInput[InputId.Input1]
      [PhysicalQuantityId.ModifierMorningOutdoorTemperature]).toBeUndefined();
    expect(toolState.state.activeModifiersByInput[InputId.Input1]
      [ModifierId.MorningClothingEstimate]).toBe(false);

    await user.click(screen.getByRole("button", { name: "Open input modifiers" }));
    expect((screen.getByRole("spinbutton", {
      name: "Input 1 Outdoor air temperature at 6 a.m.",
    }) as HTMLInputElement).value).toBe("");
    await user.click(screen.getByRole("checkbox", {
      name: "Input 1 Dynamic clothing",
    }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(toolState.state.activeModifiersByInput[InputId.Input1]
      [ModifierId.DynamicClothing]).toBe(false);
  });

  it("uses visible compare inputs and closes a stale draft when context changes", async () => {
    const user = userEvent.setup();
    const toolState = createComfortToolState();
    toolState.state.ui.compareEnabled = true;
    render(InputModifiers, { toolState });

    await user.click(screen.getByRole("button", { name: "Open input modifiers" }));
    expect(screen.getByRole("spinbutton", {
      name: "Input 1 Measured air speed",
    })).toBeTruthy();
    expect(screen.getByRole("spinbutton", {
      name: "Input 2 Measured air speed",
    })).toBeTruthy();

    toolState.actions.toggleUnitSystem();
    await tick();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    toolState.state.ui.selectedModel = ComfortModel.Utci;
    await tick();
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Input modifiers" })).toBeNull();
    });
  });

  it("does not render an entry for models without declared modifiers", () => {
    const toolState = createComfortToolState();
    toolState.state.ui.selectedModel = ComfortModel.Utci;
    render(InputModifiers, { toolState });

    expect(screen.queryByRole("region", { name: "Input modifiers" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open input modifiers" })).toBeNull();
  });
});
