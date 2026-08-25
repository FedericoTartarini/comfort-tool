// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicationColumn } from "../../services/chartTheme";
import ChartExportDropdown from "./ChartExportDropdown.svelte";

afterEach(cleanup);

describe("ChartExportDropdown", () => {
  it("offers single- and double-column PNG and SVG export profiles", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(ChartExportDropdown, {
      triggerId: "time-series-export",
      onExport,
    });

    await user.click(screen.getByRole("button", { name: "Export chart" }));

    expect(screen.getByRole("button", { name: "PNG, single column" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "PNG, double column" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "SVG, single column" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "SVG, double column" })).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "PNG, double column" }),
    );
    expect(onExport).toHaveBeenCalledWith("png", PublicationColumn.Double);
  });

  it("exports SVG at single-column width", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(ChartExportDropdown, {
      triggerId: "time-series-export-svg",
      onExport,
    });

    await user.click(screen.getByRole("button", { name: "Export chart" }));
    await user.click(
      screen.getByRole("button", { name: "SVG, single column" }),
    );
    expect(onExport).toHaveBeenCalledWith("svg", PublicationColumn.Single);
  });
});
