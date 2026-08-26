// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChartInstancePanelView } from "../../state/analysis/chartInstancePresentation";
import { PublicationColumn } from "../../engines/chartTheme";
import ChartExportMenu from "./ChartExportMenu.svelte";

const currentChart: ChartInstancePanelView = {
  instanceId: "pmv-ashrae-dynamic",
  name: "Dynamic",
  emptyMessage: "No chart yet.",
  allowsAxisSelection: true,
  locksYAxis: false,
  showsZoneToggle: false,
  showsLegend: true,
  usesBaselineInput: true,
};

afterEach(cleanup);

describe("ChartExportMenu", () => {
  it("offers single- and double-column PNG and SVG export profiles", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(ChartExportMenu, {
      chartInstances: [currentChart],
      currentChart,
      selectedChartInstanceId: currentChart.instanceId,
      onSelectChartInstance: vi.fn(),
      onExport,
    });

    await user.click(
      screen.getByRole("button", { name: "Select chart type and export" }),
    );

    expect(screen.getByRole("button", { name: "PNG, single column" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "PNG, double column" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "SVG, single column" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "SVG, double column" })).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "PNG, single column" }),
    );
    expect(onExport).toHaveBeenCalledWith("png", PublicationColumn.Single);
  });

  it("exports SVG at double-column width", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(ChartExportMenu, {
      chartInstances: [currentChart],
      currentChart,
      selectedChartInstanceId: currentChart.instanceId,
      onSelectChartInstance: vi.fn(),
      onExport,
    });

    await user.click(
      screen.getByRole("button", { name: "Select chart type and export" }),
    );
    await user.click(
      screen.getByRole("button", { name: "SVG, double column" }),
    );
    expect(onExport).toHaveBeenCalledWith("svg", PublicationColumn.Double);
  });
});
