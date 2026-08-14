import { expect, test, type Page } from "@playwright/test";

async function openModifierDialog(page: Page, visibleInputs: 1 | 3) {
  await page.goto("/ASHRAE-55/");
  if (visibleInputs === 3) {
    await page.getByRole("checkbox", { name: "Enable input comparison" })
      .setChecked(true, { force: true });
    await page.getByRole("button", { name: "Input 3", exact: true }).click();
  }

  await page.getByRole("button", { name: "Open input modifiers" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Measured air speed", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Morning clothing estimate", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Dynamic clothing", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Solar gain on occupant", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Apply changes" })).toBeVisible();
  return dialog;
}

test.describe("input modifier modal", () => {
  test("shows the single-input transactional editor", async ({ page }) => {
    const dialog = await openModifierDialog(page, 1);
    await expect(dialog.getByRole("spinbutton", {
      name: "Input 1 Measured air speed",
    })).toBeVisible();
    await expect(dialog.getByRole("spinbutton", {
      name: "Input 2 Measured air speed",
    })).toHaveCount(0);
    await expect(dialog).toHaveScreenshot("input-modifiers-single.png");
  });

  test("uses a three-column compare-input matrix", async ({ page }) => {
    const dialog = await openModifierDialog(page, 3);
    for (const inputNumber of [1, 2, 3]) {
      await expect(dialog.getByRole("spinbutton", {
        name: `Input ${inputNumber} Measured air speed`,
      })).toBeVisible();
    }
    await expect(dialog).toHaveScreenshot("input-modifiers-compare.png");
  });

  test("uses one active colour for all enabled modifiers", async ({ page }) => {
    const dialog = await openModifierDialog(page, 1);
    const fieldValues = [
      ["Input 1 Measured air speed", "0.6"],
      ["Input 1 Outdoor air temperature at 6 a.m.", "10"],
      ["Input 1 Solar altitude", "45"],
      ["Input 1 Solar horizontal angle (SHARP)", "90"],
      ["Input 1 Direct-beam solar radiation", "600"],
      ["Input 1 Total solar transmittance", "0.5"],
      ["Input 1 Sky-vault view fraction", "0.5"],
      ["Input 1 Body surface exposed to sun", "0.5"],
    ] as const;

    for (const [name, value] of fieldValues) {
      const input = dialog.getByRole("spinbutton", { name });
      await input.fill(value);
      await input.blur();
    }

    const activeTrackColours: string[] = [];
    for (const modifierLabel of [
      "Measured air speed",
      "Morning clothing estimate",
      "Dynamic clothing",
      "Solar gain on occupant",
    ]) {
      const toggle = dialog.getByRole("checkbox", {
        name: `Input 1 ${modifierLabel}`,
      });
      await expect(toggle).toBeEnabled();
      const track = toggle.locator("xpath=following-sibling::span[1]");
      await track.click();
      await expect(toggle).toBeChecked();
      await expect(toggle.locator("xpath=..")).toHaveCSS("filter", "none");
      activeTrackColours.push(await track.evaluate((element) => (
        getComputedStyle(element).backgroundColor
      )));
      await toggle.blur();
    }
    expect(new Set(activeTrackColours).size).toBe(1);

    const applyButton = dialog.getByRole("button", { name: "Apply changes" });
    await applyButton.focus();
    await expect(applyButton).toBeFocused();
    await page.mouse.move(0, 0);

    await expect(dialog).toHaveScreenshot("input-modifiers-all-active.png");
  });
});
