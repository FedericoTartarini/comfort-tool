import { expect, test, type Locator, type Page } from "@playwright/test";

async function selectDropdownOption(
  page: Page,
  triggerName: string,
  optionName: string,
) {
  const trigger = page.getByRole("button", { name: triggerName });
  await trigger.click();
  const option = page.getByRole("button", { name: optionName, exact: true });
  await expect(option).toBeVisible();
  await option.click();
  await expect(trigger).toContainText(optionName);
  await page.mouse.click(1, 1);
  await expect(option).toBeHidden();
}

async function expectChartAxes(
  plot: Locator,
  xTitle: string,
  yTitle: string,
) {
  await expect.poll(() => plot.evaluate((element) => {
    const layout = (element as HTMLElement & {
      _fullLayout?: {
        xaxis?: { title?: { text?: string } };
        yaxis?: { title?: { text?: string } };
      };
    })._fullLayout;
    return {
      x: layout?.xaxis?.title?.text ?? "",
      y: layout?.yaxis?.title?.text ?? "",
    };
  })).toEqual({
    x: expect.stringContaining(xTitle),
    y: expect.stringContaining(yTitle),
  });
  await expect.poll(() => plot.evaluate((element) => {
    const traces = (element as HTMLElement & {
      data?: Array<{ type?: string; z?: number[][] }>;
    }).data ?? [];
    return traces.some((trace) => (
      trace.type === "contour" && trace.z?.some((row) => row.some(Number.isFinite))
    ));
  })).toBe(true);
}

test("PMV exposes and renders every component/operative axis direction", async ({ page }) => {
  await page.goto("/standard/ashrae-55/");
  await selectDropdownOption(page, "Select chart type and export", "Dynamic");
  await expect(page.getByRole("button", { name: "Select chart type and export" }))
    .toContainText("Dynamic");

  const plot = page.getByTestId("comfort-chart-plot");
  await selectDropdownOption(page, "Select chart Y axis", "Operative temperature");
  await expectChartAxes(plot, "Air temperature", "Operative temperature");

  await selectDropdownOption(page, "Select chart X axis", "Radiant temperature");
  await expectChartAxes(plot, "Radiant temperature", "Operative temperature");

  await selectDropdownOption(page, "Select chart X axis", "Operative temperature");
  await expectChartAxes(plot, "Operative temperature", "Radiant temperature");

  await selectDropdownOption(page, "Select chart Y axis", "Air temperature");
  await expectChartAxes(plot, "Operative temperature", "Air temperature");
});
