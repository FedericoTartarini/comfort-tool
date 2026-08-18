import { expect, test } from "@playwright/test";

test("runs the PHS reference sequence and preserves stale results", async ({ page }) => {
  await page.goto("/Time-Series/");

  await expect(page.getByRole("heading", { name: "Time-series" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Select time-series model" }))
    .toBeDisabled();
  await expect(page.getByTestId("phs-advanced-settings")).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("time-series-segment")).toHaveCount(1);
  await expect(page.getByLabel("CBE reference exposure Air temperature"))
    .toHaveValue("35");
  await expect(page.getByText(
    "Run the simulation to generate the PHS temperature chart.",
  )).toBeVisible();

  await page.getByRole("button", { name: "Run simulation" }).click();
  const plots = page.getByTestId("comfort-chart-plot");
  await expect(plots).toHaveCount(2);
  await expect(plots.nth(0)).toHaveClass(/js-plotly-plot/);
  await expect(plots.nth(1)).toHaveClass(/js-plotly-plot/);
  await expect(plots.nth(0).getByText("Rectal temperature", { exact: true }))
    .toBeVisible();
  await expect(plots.nth(0).getByText("Core temperature", { exact: true }))
    .toBeVisible();
  await expect(page.getByText("Rectal temperature", { exact: true }).first())
    .toBeVisible();
  await expect(page.getByTestId("phs-temperature-chart"))
    .toHaveScreenshot("phs-temperature-chart-si.png");

  const duration = page.getByLabel("CBE reference exposure duration");
  await duration.fill("60");
  await duration.press("Tab");
  await expect(page.getByText(
    "Inputs have changed. The charts below show the last successful run.",
  )).toBeVisible();

  await page.getByLabel("Use IP units for time-series")
    .setChecked(true, { force: true });
  await expect(page.getByLabel("CBE reference exposure Air temperature"))
    .toHaveValue("95");
});

test("edits advanced person settings and validates the 480-minute cap", async ({ page }) => {
  await page.goto("/Time-Series/");
  await page.getByText("Advanced person settings", { exact: true }).click();
  await expect(page.getByLabel("Body weight (kg)")).toBeVisible();
  await expect(page.getByLabel("Worker is heat acclimatized")).toBeChecked();
  await expect(page.getByLabel("Worker can drink freely")).toBeChecked();

  await page.getByRole("button", { name: "Rest" }).click();
  await expect(page.getByTestId("time-series-segment")).toHaveCount(2);
  await expect(page.getByText("495 / 480 minutes", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Total scenario duration cannot exceed 480 minutes.",
  );
});
