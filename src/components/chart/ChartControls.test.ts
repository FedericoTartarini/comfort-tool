// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FieldKey } from "../../models/fieldKeys";
import { ChartMode, ModelOutputKey } from "../../models/modelCapabilities";
import { UnitSystem } from "../../models/units";
import ChartControls from "./ChartControls.svelte";

const outputs = [
  {
    key: ModelOutputKey.Pmv,
    label: "PMV",
    defaultBands: [{ min: -Infinity, max: Infinity, label: "All", color: "#fff" }],
  },
  {
    key: ModelOutputKey.Ppd,
    label: "PPD (%)",
    defaultBands: [{ min: -Infinity, max: Infinity, label: "All", color: "#fff" }],
  },
];

afterEach(cleanup);

describe("ChartControls Explore composition", () => {
  it("shows declared axes, display choices, and threshold editor", async () => {
    const user = userEvent.setup();
    const onSelectOutput = vi.fn();
    render(ChartControls, {
      idPrefix: "test",
      controls: {
        baseline: null,
        axes: {
          x: {
            selectedField: FieldKey.DryBulbTemperature,
            options: [FieldKey.DryBulbTemperature],
            locked: false,
            onSelect: vi.fn(),
          },
          y: {
            selectedField: FieldKey.RelativeHumidity,
            options: [FieldKey.RelativeHumidity],
            locked: false,
            onSelect: vi.fn(),
          },
        },
        explore: {
          config: {
            mode: ChartMode.Explore,
            xField: FieldKey.DryBulbTemperature,
            yField: FieldKey.RelativeHumidity,
            zOutput: ModelOutputKey.Pmv,
            bands: outputs[0].defaultBands,
          },
          outputs,
          defaultBands: outputs[0].defaultBands,
          unitSystem: UnitSystem.SI,
          onSelectOutput,
          onApplyBands: vi.fn(() => true),
        },
      },
    });

    expect(screen.getByRole("button", { name: "Select chart X axis" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select chart Y axis" })).toBeTruthy();
    expect(screen.getByText("Display:")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit chart thresholds" })).toBeTruthy();
    expect(screen.queryByText("UTCI")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Select chart display output" }));
    const selectedItem = screen.getByRole("button", { name: "PMV" });
    expect(selectedItem.hasAttribute("disabled")).toBe(true);
    await user.click(selectedItem);
    expect(onSelectOutput).not.toHaveBeenCalled();

    await user.click(screen.getByText("PPD (%)"));
    expect(onSelectOutput).toHaveBeenCalledWith(ModelOutputKey.Ppd);
  });
});
