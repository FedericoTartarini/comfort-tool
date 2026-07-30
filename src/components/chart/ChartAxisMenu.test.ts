// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FieldKey } from "../../models/fieldKeys";
import { ChartMode, ModelOutputKey } from "../../models/modelCapabilities";
import { UnitSystem } from "../../models/units";
import ChartAxisMenu from "./ChartAxisMenu.svelte";

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

describe("ChartAxisMenu Explore composition", () => {
  it("shows only declared Display choices alongside the threshold editor", async () => {
    const user = userEvent.setup();
    const onSelectOutput = vi.fn();
    render(ChartAxisMenu, {
      idPrefix: "test",
      dynamicXAxis: FieldKey.DryBulbTemperature,
      dynamicYAxis: FieldKey.RelativeHumidity,
      dynamicXAxisOptions: [FieldKey.DryBulbTemperature],
      dynamicYAxisOptions: [FieldKey.RelativeHumidity],
      onSelectXAxis: vi.fn(),
      onSelectYAxis: vi.fn(),
      fieldChartConfig: {
        mode: ChartMode.Explore,
        xField: FieldKey.DryBulbTemperature,
        yField: FieldKey.RelativeHumidity,
        zOutput: ModelOutputKey.Pmv,
        bands: outputs[0].defaultBands,
      },
      chartableOutputs: outputs,
      defaultBands: outputs[0].defaultBands,
      unitSystem: UnitSystem.SI,
      onSelectOutput,
      onApplyBands: vi.fn(() => true),
    });

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
