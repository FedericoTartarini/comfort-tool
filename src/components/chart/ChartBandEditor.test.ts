// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ModelOutputKey,
  type NumericBand,
} from "../../models/modelCapabilities";
import { UnitSystem } from "../../models/units";
import ChartBandEditor from "./ChartBandEditor.svelte";

const bands = [
  { min: -Infinity, max: 0, label: "Cold", color: "#0000ff" },
  { min: 0, max: Infinity, label: "Warm", color: "#ff0000" },
];

function createBands(boundarySi: number, labelPrefix: string) {
  return [
    { min: -Infinity, max: boundarySi, label: `${labelPrefix} low`, color: "#0000ff" },
    { min: boundarySi, max: Infinity, label: `${labelPrefix} high`, color: "#ff0000" },
  ];
}

afterEach(cleanup);

describe("ChartBandEditor", () => {
  it("edits IP drafts and atomically commits sorted canonical-SI bands", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn((_nextBands: readonly NumericBand[]) => true);
    render(ChartBandEditor, {
      idPrefix: "test",
      outputKey: ModelOutputKey.Utci,
      bands,
      defaultBands: bands,
      unitSystem: UnitSystem.IP,
      onApply,
    });

    await user.click(screen.getByRole("button", { name: "Edit chart thresholds" }));

    expect((screen.getByLabelText("Band 1 unbounded below") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Band 2 unbounded above") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Band 1 upper bound") as HTMLInputElement).value).toBe("32");
    expect((screen.getByLabelText("Band 2 lower bound") as HTMLInputElement).value).toBe("32");

    await user.clear(screen.getByLabelText("Band 1 upper bound"));
    await user.type(screen.getByLabelText("Band 1 upper bound"), "50");
    await user.clear(screen.getByLabelText("Band 2 lower bound"));
    await user.type(screen.getByLabelText("Band 2 lower bound"), "50");
    await user.clear(screen.getByLabelText("Band 1 label"));
    await user.type(screen.getByLabelText("Band 1 label"), "Cooler");
    await fireEvent.input(screen.getByLabelText("Band 1 color"), {
      target: { value: "#00ff00" },
    });
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const appliedBands = onApply.mock.calls[0][0];
    expect(appliedBands[0]).toEqual(expect.objectContaining({
      min: -Infinity,
      max: 10,
      label: "Cooler",
      color: "#00ff00",
    }));
    expect(appliedBands[1]).toEqual(expect.objectContaining({
      min: 10,
      max: Infinity,
    }));
  });

  it.each([
    [ModelOutputKey.Utci, 12.3456, 9.8765],
    [ModelOutputKey.HeatIndex, 26.1234, 41.2345],
    [ModelOutputKey.WindChill, 1600, 1400],
    [ModelOutputKey.OperativeTemperature, 23.4567, 18.7654],
  ] as const)(
    "preserves exact %s SI edges for unchanged and reset IP drafts",
    async (outputKey, workingBoundarySi, defaultBoundarySi) => {
      const user = userEvent.setup();
      const onApply = vi.fn((_nextBands: readonly NumericBand[]) => true);
      const workingBands = createBands(workingBoundarySi, "Working");
      const defaultBands = createBands(defaultBoundarySi, "Default");
      const originalWorkingBands = workingBands.map((band) => ({ ...band }));
      const originalDefaultBands = defaultBands.map((band) => ({ ...band }));

      render(ChartBandEditor, {
        idPrefix: `test-${outputKey}`,
        outputKey,
        bands: workingBands,
        defaultBands,
        unitSystem: UnitSystem.IP,
        onApply,
      });

      await user.click(screen.getByRole("button", { name: "Edit chart thresholds" }));
      await user.click(screen.getByRole("button", { name: "Apply" }));

      expect(onApply).toHaveBeenCalledTimes(1);
      expect(onApply.mock.calls[0][0]).toEqual(workingBands);

      await user.click(screen.getByRole("button", { name: "Edit chart thresholds" }));
      await user.click(screen.getByRole("button", { name: "Reset" }));
      await user.click(screen.getByRole("button", { name: "Apply" }));

      expect(onApply).toHaveBeenCalledTimes(2);
      expect(onApply.mock.calls[1][0]).toEqual(defaultBands);
      expect(workingBands).toEqual(originalWorkingBands);
      expect(defaultBands).toEqual(originalDefaultBands);
    },
  );

  it("sorts untouched IP drafts while preserving their exact SI edges", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn((_nextBands: readonly NumericBand[]) => true);
    const boundarySi = 12.3456;
    const expectedBands = createBands(boundarySi, "Exact");
    const unsortedBands = [...expectedBands].reverse();
    const originalBands = unsortedBands.map((band) => ({ ...band }));

    render(ChartBandEditor, {
      idPrefix: "test-unsorted",
      outputKey: ModelOutputKey.Utci,
      bands: unsortedBands,
      defaultBands: unsortedBands,
      unitSystem: UnitSystem.IP,
      onApply,
    });

    await user.click(screen.getByRole("button", { name: "Edit chart thresholds" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toEqual(expectedBands);
    expect(onApply.mock.calls[0][0][0].max).toBe(boundarySi);
    expect(onApply.mock.calls[0][0][1].min).toBe(boundarySi);
    expect(unsortedBands).toEqual(originalBands);
  });

  it("supports add, remove, reset, and cancel without committing drafts", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn((_nextBands: readonly NumericBand[]) => true);
    render(ChartBandEditor, {
      idPrefix: "test",
      outputKey: ModelOutputKey.Pmv,
      bands,
      defaultBands: bands,
      unitSystem: UnitSystem.SI,
      onApply,
    });

    await user.click(screen.getByRole("button", { name: "Edit chart thresholds" }));
    await user.click(screen.getByRole("button", { name: "Add band" }));
    expect((screen.getByLabelText("Band 3 label") as HTMLInputElement).value).toBe("New band");
    expect(screen.getByLabelText("Band 3 errors").textContent)
      .toContain("Lower bounds must be numeric or unbounded below.");

    await user.click(screen.getByRole("button", { name: "Remove band 3" }));
    expect(screen.queryByLabelText("Band 3 label")).toBeNull();

    await user.clear(screen.getByLabelText("Band 1 label"));
    await user.type(screen.getByLabelText("Band 1 label"), "Changed");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect((screen.getByLabelText("Band 1 label") as HTMLInputElement).value).toBe("Cold");

    await user.clear(screen.getByLabelText("Band 1 label"));
    await user.type(screen.getByLabelText("Band 1 label"), "Cancelled");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onApply).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Edit chart thresholds" }));
    expect((screen.getByLabelText("Band 1 label") as HTMLInputElement).value).toBe("Cold");
    expect((screen.getByRole("button", { name: "Remove band 1" }) as HTMLButtonElement).disabled)
      .toBe(false);
    await user.click(screen.getByRole("button", { name: "Remove band 2" }));
    expect((screen.getByRole("button", { name: "Remove band 1" }) as HTMLButtonElement).disabled)
      .toBe(true);
  });

  it("shows validation errors and keeps invalid overlapping drafts uncommitted", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn((_nextBands: readonly NumericBand[]) => true);
    render(ChartBandEditor, {
      idPrefix: "test",
      outputKey: ModelOutputKey.Pmv,
      bands,
      defaultBands: bands,
      unitSystem: UnitSystem.SI,
      onApply,
    });

    await user.click(screen.getByRole("button", { name: "Edit chart thresholds" }));
    await user.clear(screen.getByLabelText("Band 1 upper bound"));
    await user.type(screen.getByLabelText("Band 1 upper bound"), "1");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByRole("alert").textContent).toContain("Bands cannot overlap");
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
