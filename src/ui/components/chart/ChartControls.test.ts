// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PhysicalQuantityId } from "../../../catalog/quantities";
import { ModelOutputKey } from "../../../catalog/modelCapabilities";
import { FieldChartProfileKind } from "../../../catalog/output/fieldChartProfile";
import { UnitSystem } from "../../../catalog/units";
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
  it("shows declared axes, output choices, and threshold editor", async () => {
    const user = userEvent.setup();
    const onSelectOutput = vi.fn();
    render(ChartControls, {
      idPrefix: "test",
      controls: {
        profileBadge: {
          profileKind: FieldChartProfileKind.Explore,
          caption: "Explore caption.",
          feedback: null,
        },
        baseline: null,
        axes: {
          x: {
            selectedField: PhysicalQuantityId.DryBulbTemperature,
            options: [PhysicalQuantityId.DryBulbTemperature],
            locked: false,
            onSelect: vi.fn(),
          },
          y: {
            selectedField: PhysicalQuantityId.RelativeHumidity,
            options: [PhysicalQuantityId.RelativeHumidity],
            locked: false,
            onSelect: vi.fn(),
          },
        },
        explore: {
          profile: {
            kind: FieldChartProfileKind.Explore,
            xField: PhysicalQuantityId.DryBulbTemperature,
            yField: PhysicalQuantityId.RelativeHumidity,
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
    expect(screen.getByText("Output:")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit chart thresholds" })).toBeTruthy();
    expect(screen.queryByText("UTCI")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Select chart output" }));
    const selectedItem = screen.getByRole("button", { name: "PMV" });
    expect(selectedItem.hasAttribute("disabled")).toBe(true);
    await user.click(selectedItem);
    expect(onSelectOutput).not.toHaveBeenCalled();

    await user.click(screen.getByText("PPD (%)"));
    expect(onSelectOutput).toHaveBeenCalledWith(ModelOutputKey.Ppd);
  });

  it("hides Output but keeps thresholds for single-output Explore models", () => {
    const output = outputs[0];
    render(ChartControls, {
      idPrefix: "single-output",
      controls: {
        profileBadge: {
          profileKind: FieldChartProfileKind.Explore,
          caption: "Explore caption.",
          feedback: null,
        },
        baseline: null,
        axes: null,
        explore: {
          profile: {
            kind: FieldChartProfileKind.Explore,
            xField: PhysicalQuantityId.DryBulbTemperature,
            yField: PhysicalQuantityId.RelativeHumidity,
            zOutput: output.key,
            bands: output.defaultBands,
          },
          outputs: [output],
          defaultBands: output.defaultBands,
          unitSystem: UnitSystem.SI,
          onSelectOutput: vi.fn(),
          onApplyBands: vi.fn(() => true),
        },
      },
    });

    expect(screen.queryByText("Output:")).toBeNull();
    expect(screen.queryByRole("button", { name: "Select chart output" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit chart thresholds" })).toBeTruthy();
  });

  it("keeps axes and baseline but hides Output and thresholds in Compliance", () => {
    render(ChartControls, {
      idPrefix: "compliance",
      controls: {
        profileBadge: {
          profileKind: FieldChartProfileKind.Compliance,
          caption: "Compliance caption.",
          feedback: null,
        },
        baseline: {
          selectedInputId: "input1",
          visibleInputIds: ["input1", "input2"],
          onSelect: vi.fn(),
        },
        axes: {
          x: {
            selectedField: PhysicalQuantityId.DryBulbTemperature,
            options: [PhysicalQuantityId.DryBulbTemperature],
            locked: false,
            onSelect: vi.fn(),
          },
          y: {
            selectedField: PhysicalQuantityId.RelativeHumidity,
            options: [PhysicalQuantityId.RelativeHumidity],
            locked: false,
            onSelect: vi.fn(),
          },
        },
        explore: null,
      },
    });

    expect(screen.getByRole("button", { name: "Select chart baseline input" }))
      .toBeTruthy();
    expect(screen.getByRole("button", { name: "Select chart X axis" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select chart Y axis" })).toBeTruthy();
    expect(screen.queryByText("Output:")).toBeNull();
    expect(screen.queryByRole("button", { name: "Select chart output" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit chart thresholds" })).toBeNull();
  });
});
