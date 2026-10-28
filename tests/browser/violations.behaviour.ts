import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * A run that breaks a limit is calculated and shown, and its row in the
 * result table carries an amber icon named by the limits it broke, no control
 * (ADR-0002 decision 84, rules 8 and 9; decision 85, rule 5); the Results card
 * has no alert above the table. A slot's toast is raised when its run breaks a
 * limit it did not break before, not again while the same limits stay broken.
 * Both pages draw the row's icon; Compare, and so a slot's own icon, is
 * Standard's alone.
 */

const STANDARD_ADDRESS = "/standard/ashrae-55-2023/pmv-ppd-ashrae";
const EXPLORE_ADDRESS = "/explore/pmv-ppd-ashrae";

/**
 * An air speed past what PMV (ASHRAE 55) allows occupants without local control at the defaults' 25 °C operative
 * temperature, 0.64 m/s, and one further past it, which breaks the same limit.
 */
const PAST_NO_CONTROL = "0.9";
const FURTHER_PAST_NO_CONTROL = "1";
const NO_CONTROL_LIMIT = "Relative air speed must be ≤ 0.64 m/s";
const LIMITS_HEADING = "Calculated, but outside these limits:";

async function open(page: Page, address: string) {
  await page.clock.install();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(address);
  await expect(page.locator(".chart-plot svg").first()).toBeVisible();
}

const resultsCard = (page: Page) =>
  page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: "Results", exact: true }) });

/** The toasts standing: a closed one stays a moment for Sonner's exit animation, marked `data-removed`. */
function toasts(page: Page) {
  return page.getByRole("region", { name: /^Notifications/ }).locator('li[data-sonner-toast]:not([data-removed="true"])');
}

/** The air speed's box, of `slotName`'s slot under Compare. */
function airSpeedOf(page: Page, slotName?: string) {
  return page.getByRole("spinbutton", { name: slotName ? new RegExp(`^Air speed.*, ${slotName}$`) : /^Air speed/ });
}

/** Types `text` over `box`'s and commits it at once, as Enter does. */
async function commit(box: Locator, text: string) {
  await box.fill(text);
  await box.press("Enter");
}

/** The icons standing for broken limits in `scope`. */
const limitsIcons = (scope: Locator) => scope.getByRole("img", { name: LIMITS_HEADING });

/**
 * Expects `row` to carry one icon, first in its first cell, named by the heading and the no-control limit on the
 * line under it; to hold no control and no caption beside the limit; and the icon, clicked, to open nothing.
 */
async function expectIconOf(page: Page, row: Locator) {
  const icon = limitsIcons(row);
  await expect(icon).toHaveCount(1);
  await expect(icon).toHaveAccessibleName(`${LIMITS_HEADING} ${NO_CONTROL_LIMIT}`);
  await expect(icon).toHaveAttribute("title", `${LIMITS_HEADING}\n${NO_CONTROL_LIMIT}`);
  // Nothing the cell shows, text or a swatch, stands before the icon.
  const before = await row.getByRole("cell").first().evaluate((cell) => {
    const range = document.createRange();
    range.setStart(cell, 0);
    range.setEndBefore(cell.querySelector('[role="img"]')!);
    return { text: range.toString().trim(), swatches: range.cloneContents().querySelectorAll(".swatch").length };
  });
  expect(before).toEqual({ text: "", swatches: 0 });
  await expect(row.getByRole("button")).toHaveCount(0);
  await expect(row).not.toContainText(NO_CONTROL_LIMIT);
  await icon.click();
  await expect(page.locator(`[data-slot="popover-content"]`)).toHaveCount(0);
}

for (const [name, address] of [["Standard", STANDARD_ADDRESS], ["Explore", EXPLORE_ADDRESS]] as const) {
  test(`on ${name}, a run past the air-speed limit without local control carries the row's icon, named by the limit and opening nothing, the card has no alert, and one toast appears; a commit keeping the same limit broken raises none`, async ({ page }) => {
    await open(page, address);
    const card = resultsCard(page);
    await expect(limitsIcons(card)).toHaveCount(0);

    await commit(airSpeedOf(page), PAST_NO_CONTROL);

    await expectIconOf(page, card.getByRole("table").getByRole("row").nth(1));
    await expect(card.getByRole("alert")).toHaveCount(0);
    await expect(card.getByRole("status")).toHaveCount(0);
    await expect(toasts(page)).toHaveCount(1);
    await expect(toasts(page)).toContainText(NO_CONTROL_LIMIT);

    await toasts(page).getByRole("button", { name: "Close" }).click();
    await expect(toasts(page)).toHaveCount(0);
    await commit(airSpeedOf(page), FURTHER_PAST_NO_CONTROL);

    await expect(airSpeedOf(page)).toHaveValue(FURTHER_PAST_NO_CONTROL);
    await expect(limitsIcons(card)).toHaveCount(1);
    // Past the moment a toast the commit raised would have shown.
    await page.clock.runFor(1000);
    await expect(toasts(page)).toHaveCount(0);
  });
}

test("under Compare, only the slot whose run breaks a limit carries the icon, its toast names it, and Compare off and on again raises none", async ({ page }) => {
  await open(page, STANDARD_ADDRESS);
  await page.getByRole("switch", { name: "Compare", exact: true }).click();

  await commit(airSpeedOf(page, "Input 2"), PAST_NO_CONTROL);

  const card = resultsCard(page);
  const second = card.getByRole("row", { name: /Input 2/ });
  await expect(limitsIcons(card)).toHaveCount(1);
  await expect(toasts(page)).toHaveCount(1);
  await expect(toasts(page)).toContainText(`Input 2: Calculated, but outside a limit. ${NO_CONTROL_LIMIT}.`);
  await expectIconOf(page, second);

  await toasts(page).getByRole("button", { name: "Close" }).click();
  await expect(toasts(page)).toHaveCount(0);
  const compare = page.getByRole("switch", { name: "Compare", exact: true });
  await compare.click();
  await compare.click();

  await expect(limitsIcons(second)).toHaveCount(1);
  // Past the moment a toast Compare raised would have shown.
  await page.clock.runFor(1000);
  await expect(toasts(page)).toHaveCount(0);
});
