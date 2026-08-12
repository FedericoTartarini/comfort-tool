// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { ComplianceStatus } from "../../models/comfortModels";
import { ChartMode } from "../../models/modelCapabilities";
import ChartModeControl from "./ChartModeControl.svelte";

afterEach(cleanup);

describe("ChartModeControl", () => {
  it("renders the route-selected mode as a read-only summary", () => {
    render(ChartModeControl, {
      control: {
        selectedMode: ChartMode.Compliance,
        caption: "Locked standard limits.",
        feedback: null,
      },
    });

    expect(screen.queryByRole("group", { name: "Chart mode" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Compliance" })).toBeNull();
    expect(screen.getByText("Compliance")).toBeTruthy();
    expect(screen.getByText("Locked standard limits.")).toBeTruthy();
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
        selectedMode,
        caption,
        feedback: null,
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
        selectedMode: ChartMode.Compliance,
        caption: "Locked limits.",
        feedback: { text, passes, inputLabel: "Input 2" },
      },
    });

    const feedback = screen.getByLabelText(`Input 2: ${text}`);
    expect(feedback.getAttribute("aria-live")).toBe("polite");
    expect(feedback.closest("p")?.textContent).toContain("Locked limits.");
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("labels single-input feedback as Your input on the caption line", () => {
    render(ChartModeControl, {
      control: {
        selectedMode: ChartMode.Compliance,
        caption: "Locked limits.",
        feedback: { text: ComplianceStatus.Compliant, passes: true },
      },
    });

    expect(screen.getByLabelText("Your input: Compliant").getAttribute("aria-live"))
      .toBe("polite");
  });
});
