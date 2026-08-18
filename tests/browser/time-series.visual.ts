import { expect, test } from "@playwright/test";

test("calculates the PHS reference sequence automatically and preserves stale results", async ({ page }) => {
  await page.goto("/Time-Series/");

  await expect(page.getByRole("heading", { name: "Time-series" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Select time-series model" }))
    .toBeEnabled();
  await expect(page.getByRole("button", { name: "Run simulation" })).toHaveCount(0);
  await expect(page.getByTestId("phs-advanced-settings")).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("time-series-segment")).toHaveCount(1);
  await expect(page.getByLabel("CBE reference exposure Air temperature"))
    .toHaveValue("35");
  await expect(page.getByTestId("time-series-status")).toHaveText("Ready");

  const plots = page.getByTestId("comfort-chart-plot");
  await expect(plots).toHaveCount(2);
  await expect(plots.nth(0)).toHaveClass(/js-plotly-plot/);
  await expect(plots.nth(1)).toHaveClass(/js-plotly-plot/);
  await expect(plots.nth(0).getByText("Rectal temperature", { exact: true }))
    .toBeVisible();
  await expect(plots.nth(0).getByText("Core temperature", { exact: true }))
    .toBeVisible();
  await expect(page.getByTestId("phs-temperature-chart"))
    .toHaveScreenshot("phs-temperature-chart-si.png");

  const duration = page.getByLabel("CBE reference exposure duration");
  await duration.fill("60");
  await duration.press("Tab");
  await expect(page.getByTestId("time-series-status")).toHaveText("Waiting");
  await expect(page.getByText(
    "Waiting to update the scenario. The charts below show the last successful calculation.",
  )).toBeVisible();
  await expect(page.getByTestId("time-series-status")).toHaveText("Ready");

  await duration.fill("0");
  await duration.press("Tab");
  await expect(page.getByRole("alert")).toContainText("positive whole number");
  await expect(plots.nth(0)).toHaveClass(/js-plotly-plot/);

  const revisionBeforeUnits = await page.getByTestId("time-series-status").textContent();
  await page.getByLabel("Use IP units for time-series").setChecked(true, { force: true });
  await expect(page.getByLabel("CBE reference exposure Air temperature"))
    .toHaveValue("95");
  expect(await page.getByTestId("time-series-status").textContent())
    .toBe(revisionBeforeUnits);
});

test("supports uncapped ordered phases and draws synchronized boundaries", async ({ page }) => {
  await page.goto("/Time-Series/");
  await expect(page.getByTestId("time-series-status")).toHaveText("Ready");
  await page.getByText("Advanced person settings", { exact: true }).click();
  await expect(page.getByLabel("Body weight (kg)")).toBeVisible();
  await expect(page.getByLabel("Heat acclimatized")).toBeChecked();
  await expect(page.getByLabel("Drinking allowed")).toBeChecked();

  const duration = page.getByLabel("CBE reference exposure duration");
  await duration.fill("600");
  await duration.press("Tab");
  await page.getByRole("button", { name: "Rest" }).click();
  await expect(page.getByTestId("time-series-segment")).toHaveCount(2);
  await expect(page.getByText("615 minutes (10.25 hours)", { exact: true })).toBeVisible();
  await expect(page.getByTestId("time-series-status")).toHaveText("Ready");
  await expect(page.getByRole("alert")).toHaveCount(0);

  const traceNames = await page.getByTestId("comfort-chart-plot").nth(0).evaluate(
    (element) => (
      (element as HTMLElement & { data?: Array<{ name?: string }> }).data
        ?.map(({ name }) => name) ?? []
    ),
  );
  expect(traceNames).toContain("Segment boundaries");
});
