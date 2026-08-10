// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { tick } from "svelte";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ComfortModel } from "../../models/comfortModels";
import { ModifierFieldKey, ModifierId } from "../../models/inputModifiers";
import { InputId } from "../../models/inputSlots";
import { createComfortToolState } from "../../state/comfortTool/createComfortToolState.svelte";
import InputModifiers from "./InputModifiers.svelte";

const originalAnimate = Element.prototype.animate;

beforeAll(() => {
  // Flowbite's accordion transition uses the Web Animations API, which jsdom omits.
  Element.prototype.animate = (() => {
    const animation = {
      cancel() {},
      currentTime: 0,
      effect: null,
      onfinish: null as Animation["onfinish"],
      playState: "finished" as AnimationPlayState,
    };
    queueMicrotask(() => animation.onfinish?.call(
      animation as Animation,
      new Event("finish") as AnimationPlaybackEvent,
    ));
    return animation as Animation;
  }) as typeof Element.prototype.animate;
});

afterAll(() => {
  Element.prototype.animate = originalAnimate;
});

afterEach(cleanup);

describe("InputModifiers", () => {
  it("starts collapsed and prevents activation until required inputs are complete", async () => {
    const user = userEvent.setup();
    const toolState = createComfortToolState();
    render(InputModifiers, { toolState });

    const disclosure = screen.getByRole("button", {
      name: "Optional input modifiers",
    });
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("spinbutton", {
      name: "Input 1 Measured air speed",
    })).toBeNull();

    await user.click(disclosure);

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
      [ModifierId.DynamicClothing]).toBe(true);
    expect(screen.getByRole("region", { name: "Optional input modifiers" }).textContent)
      .toContain("Effective clothing insulation:");

    await user.type(measuredInput, "0.6");
    await user.tab();
    await tick();

    expect(toolState.state.modifierInputsByInput[InputId.Input1]
      [ModifierId.MeasuredAirSpeed][ModifierFieldKey.MeasuredAirSpeed]).toBe(0.6);
    await waitFor(() => {
      expect(screen.getByRole("checkbox", {
        name: "Input 1 Measured air speed",
      }).hasAttribute("disabled")).toBe(false);
    });

    await user.click(screen.getByRole("checkbox", {
      name: "Input 1 Measured air speed",
    }));
    await tick();

    expect(toolState.state.activeModifiersByInput[InputId.Input1]
      [ModifierId.MeasuredAirSpeed]).toBe(true);
    expect(screen.getByRole("region", { name: "Optional input modifiers" }).textContent)
      .toContain("Effective air speed:");
  });

  it("uses the compare-input layout and renders only for supporting models", async () => {
    const user = userEvent.setup();
    const toolState = createComfortToolState();
    toolState.state.ui.compareEnabled = true;
    render(InputModifiers, { toolState });

    await user.click(screen.getByRole("button", {
      name: "Optional input modifiers",
    }));

    expect(screen.getByRole("spinbutton", {
      name: "Input 1 Measured air speed",
    })).toBeTruthy();
    expect(screen.getByRole("spinbutton", {
      name: "Input 2 Measured air speed",
    })).toBeTruthy();

    toolState.state.ui.selectedModel = ComfortModel.Utci;
    await tick();
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Optional input modifiers" }))
        .toBeNull();
    });

    toolState.state.ui.selectedModel = ComfortModel.PmvIso;
    await tick();
    expect(screen.getByRole("region", { name: "Optional input modifiers" }))
      .toBeTruthy();
  });
});
