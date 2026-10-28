import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * What is typed in a box is a draft (ADR-0002 decision 84, rules 1, 2 and 7):
 * a legal one commits 400 ms after the last keystroke, Enter and leaving the
 * box commit at once, and nothing moves before; a draft past its bound is
 * marked once the typing pauses, never while it is typed, and waits, and is
 * cut to the bound's end on leaving the box; a draft that would put a
 * humidity entry out of range is refused, and an air speed past the model's
 * row under a metabolic rate is not: the run is calculated and its broken
 * limit shown on its result row, with the toast a newly broken limit raises.
 * A refusal raises a toast, a cut none (decision 84's note of 2026-10-28). The page's clock is paused once it has drawn, so a pause in
 * the typing is the time the test runs the clock for.
 */

/** PMV (ASHRAE 55): dry-bulb 10 – 40 °C. */
const PMV_ADDRESS = "/standard/ashrae-55-2023/pmv-ppd-ashrae";

/** How long typing pauses before a legal draft commits, [ms]: the box's `COMMIT_PAUSE_MS`. */
const COMMIT_PAUSE = 400;

async function open(page: Page) {
  await page.clock.install();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(PMV_ADDRESS);
  await expect(page.locator(".chart-plot svg").first()).toBeVisible();
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1000);
}

const dryBulb = (page: Page) => page.getByRole("spinbutton", { name: /^Dry-bulb air temperature/ });

const resultTable = (page: Page) =>
  page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: "Results", exact: true }) }).getByRole("table");

/** The toasts standing: a closed one stays a moment for Sonner's exit animation, marked `data-removed`. */
function toasts(page: Page) {
  return page.getByRole("region", { name: /^Notifications/ }).locator('li[data-sonner-toast]:not([data-removed="true"])');
}

/** The line under `box`: the description of the field that holds it alone. */
function captionOf(box: Locator) {
  return box.locator('xpath=ancestor::*[@data-slot="field"][1]').locator(".caption-line");
}

/** Types `text` over `box`'s and commits it at once, as Enter does. */
async function commit(box: Locator, text: string) {
  await box.fill(text);
  await box.press("Enter");
}

/** The result table's text, every cell's run together. */
async function textOf(table: Locator): Promise<string> {
  return (await table.textContent()) ?? "";
}

/** The result table's text once it differs from `before`: what a commit made of it. */
async function changedFrom(table: Locator, before: string): Promise<string> {
  await expect.poll(() => textOf(table)).not.toBe(before);
  return textOf(table);
}

/** Expects the result table's text to be `text`. */
async function expectText(table: Locator, text: string) {
  await expect.poll(() => textOf(table)).toBe(text);
}

/**
 * Starts recording the result table's text at every change, and returns the
 * reader of what it has recorded, the text it started at first, each text once
 * in turn.
 */
async function recordTexts(table: Locator): Promise<() => Promise<(string | null)[]>> {
  await table.evaluate((node) => {
    const seen = [node.textContent];
    (window as unknown as { recordedTexts: (string | null)[] }).recordedTexts = seen;
    new MutationObserver(() => {
      const text = node.textContent;
      if (text !== seen[seen.length - 1]) {
        seen.push(text);
      }
    }).observe(node, { subtree: true, childList: true, characterData: true });
  });
  return () => table.page().evaluate(() => (window as unknown as { recordedTexts: (string | null)[] }).recordedTexts);
}

test.describe("a legal draft", () => {
  test("typing 16 over 19, under 400 ms between keystrokes, commits 16 once, and the result does not change before the pause ends", async ({ page }) => {
    await open(page);
    const box = dryBulb(page);
    const table = resultTable(page);
    const at25 = await textOf(table);
    await commit(box, "19");
    const at19 = await changedFrom(table, at25);
    const recorded = await recordTexts(table);

    await box.selectText();
    await box.press("1");
    await page.clock.runFor(COMMIT_PAUSE - 100);
    await box.press("6");
    await page.clock.runFor(COMMIT_PAUSE - 100);
    await expectText(table, at19);

    await page.clock.runFor(100);
    const at16 = await changedFrom(table, at19);
    expect(await recorded()).toEqual([at19, at16]);
    await expect(box).toHaveValue("16");
  });

  test("Enter commits at once", async ({ page }) => {
    await open(page);
    const table = resultTable(page);
    const before = await textOf(table);

    await commit(dryBulb(page), "16");

    // No time has run: the pause did not commit it.
    await changedFrom(table, before);
  });

  test("leaving the box commits at once", async ({ page }) => {
    await open(page);
    const box = dryBulb(page);
    const table = resultTable(page);
    const before = await textOf(table);

    await box.fill("16");
    await box.blur();

    await changedFrom(table, before);
    await expect(box).toHaveValue("16");
  });
});

test.describe("a draft past its bound", () => {
  test("of 10 – 40 °C, 45 is not marked while it is typed and is marked once the typing pauses, the line under it and the result unchanged; a further keystroke takes the mark away until the next pause", async ({ page }) => {
    await open(page);
    const box = dryBulb(page);
    const table = resultTable(page);
    const caption = captionOf(box);
    const before = await textOf(table);
    const captionColor = await caption.evaluate((node) => getComputedStyle(node).color);

    await box.fill("45");
    await page.clock.runFor(COMMIT_PAUSE - 100);
    await expect(box).not.toHaveAttribute("aria-invalid", "true");

    await page.clock.runFor(100);
    await expect(box).toHaveAttribute("aria-invalid", "true");
    await expect(box).toHaveValue("45");
    await expect(caption).toHaveText("10 – 40 °C");
    expect(await caption.evaluate((node) => getComputedStyle(node).color)).toBe(captionColor);
    await expectText(table, before);

    await box.press("0");
    await expect(box).not.toHaveAttribute("aria-invalid", "true");
    await page.clock.runFor(COMMIT_PAUSE - 100);
    await expect(box).not.toHaveAttribute("aria-invalid", "true");
    await page.clock.runFor(100);
    await expect(box).toHaveAttribute("aria-invalid", "true");
    await expect(box).toHaveValue("450");
    await expectText(table, before);
  });

  test("leaving the box with 45 cuts it to 40: the box shows 40 over the bound, the result is for 40, and no toast is raised", async ({ page }) => {
    await open(page);
    const box = dryBulb(page);
    const table = resultTable(page);
    const at25 = await textOf(table);
    await commit(box, "40");
    const at40 = await changedFrom(table, at25);
    await commit(box, "25");
    await expectText(table, at25);

    await box.fill("45");
    await box.blur();

    await expect(box).toHaveValue("40");
    await expect(captionOf(box)).toHaveText("10 – 40 °C");
    await expect(box).not.toHaveAttribute("aria-invalid", "true");
    await expectText(table, at40);
    await expect(toasts(page)).toHaveCount(0);
  });
});

test.describe("a draft that would put a humidity entry out of range", () => {
  test("a dry-bulb temperature below the held dew point is marked once the typing pauses and refused on Enter: the box shows the committed value and a toast at the top right says why until it is closed", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Change humidity", exact: true }).click();
    await page.getByRole("menu").getByRole("menuitemradio", { name: /^Dew-point temperature/ }).click();
    await commit(page.getByRole("spinbutton", { name: /^Dew-point temperature/ }), "15");
    const box = dryBulb(page);
    const table = resultTable(page);
    const before = await textOf(table);

    await box.fill("12");
    await page.clock.runFor(COMMIT_PAUSE - 100);
    await expect(box).not.toHaveAttribute("aria-invalid", "true");
    await page.clock.runFor(100);
    await expect(box).toHaveAttribute("aria-invalid", "true");
    await box.press("Enter");

    await expect(box).toHaveValue("25");
    await expect(box).not.toHaveAttribute("aria-invalid", "true");
    await expectText(table, before);
    const toast = toasts(page);
    await expect(toast).toHaveCount(1);
    await expect(toast).toContainText("Dry-bulb air temperature was not changed to 12 °C");
    await expect(toast).toContainText("Dew-point temperature must be ≤ 12 °C");
    const banner = await page.getByRole("banner").boundingBox();
    const toastBox = await toast.boundingBox();
    expect(banner && toastBox && banner.x + banner.width - (toastBox.x + toastBox.width)).toBeLessThanOrEqual(32);
    // Past Sonner's own four seconds, which a toast that times out would not outlive.
    await page.clock.runFor(10_000);
    await expect(toast).toBeVisible();
  });
});

test.describe("an air speed held under a metabolic rate", () => {
  test("on PMV (ASHRAE 55) at 1.5 m/s, 3 met is taken, the lines under the air speed and the clothing read ≥ 0 with their units, and the result row shows the relative air speed's limit broken", async ({ page }) => {
    await open(page);
    const airSpeed = page.getByRole("spinbutton", { name: /^Air speed/ });
    await commit(airSpeed, "1.5");
    const box = page.getByRole("spinbutton", { name: /^Metabolic rate/ });
    const table = resultTable(page);
    const before = await textOf(table);

    await commit(box, "3");

    await expect(box).toHaveValue("3");
    await changedFrom(table, before);
    await expect(captionOf(airSpeed)).toHaveText("≥ 0 m/s");
    await expect(captionOf(page.getByRole("spinbutton", { name: /^Clothing insulation/ }))).toHaveText("≥ 0 clo");
    // 1.5 m/s at 3 met is a relative air speed of 2.1 m/s, past the model's 2.
    await expect(table.getByRole("img", { name: "Calculated, but outside these limits:" })).toHaveAttribute("title", "Calculated, but outside these limits:\nRelative air speed must be 0 – 2 m/s");
    // One toast, the air speed's own commit's, past the limit without local control at 1.1 met; the metabolic rate
    // keeps the relative air speed's limit broken, so it raises none.
    await expect(toasts(page)).toHaveCount(1);
    await expect(toasts(page)).toContainText("Relative air speed must be ≤ 0.64 m/s");
  });
});
