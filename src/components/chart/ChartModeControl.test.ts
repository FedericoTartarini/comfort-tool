// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ComplianceStatus } from "../../models/comfortModels";
import { ChartMode } from "../../models/modelCapabilities";
import ChartModeControl from "./ChartModeControl.svelte";

afterEach(cleanup);

describe("ChartModeControl", () => {
  it("renders an accessible two-mode segmented control and supports keyboard activation", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(ChartModeControl, {
      control: {
        modes: [ChartMode.Compliance, ChartMode.Explore],
        selectedMode: ChartMode.Compliance,
        caption: "Locked standard limits.",
        feedback: null,
        onSelect,
      },
    });

    expect(screen.getByRole("group", { name: "Chart mode" })).toBeTruthy();
    const compliance = screen.getByRole("button", { name: "Compliance" });
    const explore = screen.getByRole("button", { name: "Explore" });
    expect(compliance.getAttribute("aria-pressed")).toBe("true");
    expect(explore.getAttribute("aria-pressed")).toBe("false");

    explore.focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(ChartMode.Explore);
  });

  it.each([
    [ChartMode.Compliance, "Compliance", "Standard-specific compliance caption."],
    [ChartMode.Explore, "Explore", "Explore output caption."],
  ])("shows a %s caption without a fake toggle for single-mode models", (
    selectedMode,
    label,
    caption,
  ) => {
    render(ChartModeControl, {
      control: {
        modes: [selectedMode],
        selectedMode,
        caption,
        feedback: null,
        onSelect: vi.fn(),
      },
    });

    expect(screen.queryByRole("group", { name: "Chart mode" })).toBeNull();
    expect(screen.queryByRole("button", { name: label })).toBeNull();
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText(caption)).toBeTruthy();
  });

  it.each([
    [ComplianceStatus.Compliant, true],
    [ComplianceStatus.NonCompliant, false],
    [ComplianceStatus.OutOfRange, false],
  ])("shows text and an icon for %s feedback", (text, passes) => {
    const { container } = render(ChartModeControl, {
      control: {
        modes: [ChartMode.Compliance],
        selectedMode: ChartMode.Compliance,
        caption: "Locked limits.",
        feedback: { text, passes, inputLabel: "Input 2" },
        onSelect: vi.fn(),
      },
    });

    const feedback = screen.getByText(`Input 2: ${text}`);
    expect(feedback.parentElement?.getAttribute("aria-live")).toBe("polite");
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
