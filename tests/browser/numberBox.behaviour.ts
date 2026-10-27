import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The one number box takes only a number (ADR-0002 decision 84, rules 1 and
 * 10): a text input that admits digits, one decimal point and, where its
 * bound allows a negative or has no lower end, one leading minus; ↑ and ↓
 * step by the unit's step and stop at the bound, and so do the box's own two
 * step buttons (decision 84's note of 2026-10-27); a numeric keypad where the
 * lower end is at least 0. The line under a quantity's box is its bound with
 * the display unit, and no preset's name. A preset the slot would not take as
 * it is is disabled in the row's menu, its number still shown (rule 5).
 */

/** PMV (ASHRAE 55): dry-bulb 10 – 40 °C, air speed from 0, so neither takes a minus. */
const PMV_ADDRESS = "/standard/ashrae-55/pmv-ppd-ashrae";
const EXPLORE_ADDRESS = "/explore/pmv-ppd-ashrae";

async function open(page: Page, address: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(address);
  await expect(page.locator(".chart-plot svg").first()).toBeVisible();
}

const dryBulb = (page: Page) => page.getByRole("spinbutton", { name: /^Dry-bulb air temperature/ });

/** The line under `box`: the description of the field that holds it alone. */
function captionOf(box: Locator) {
  return box.locator('xpath=ancestor::*[@data-slot="field"][1]').locator(".caption-line");
}

/** Types `text` over `box`'s and commits it at once, as Enter does. */
async function commit(box: Locator, text: string) {
  await box.fill(text);
  await box.press("Enter");
}

/**
 * Types `keys` at the start or the end of `box`, one key at a time as a person
 * does. The caret is placed directly: Home and End do not move it in a text
 * input on macOS.
 */
async function typeAt(box: Locator, where: "start" | "end", keys: string) {
  await box.focus();
  await box.evaluate((input: HTMLInputElement, atStart) => {
    const at = atStart ? 0 : input.value.length;
    input.setSelectionRange(at, at);
  }, where === "start");
  await box.pressSequentially(keys);
}

async function enterHumidityAs(page: Page, mode: RegExp) {
  await page.getByRole("button", { name: "Humidity", exact: true }).click();
  await page.getByRole("menu").getByRole("menuitemradio", { name: mode }).click();
}

const enterDewPoint = (page: Page) => enterHumidityAs(page, /^Dew-point temperature/);

async function openBands(page: Page) {
  await open(page, EXPLORE_ADDRESS);
  await page.getByRole("button", { name: "Bands", exact: true }).click();
  return page.getByRole("dialog").getByRole("spinbutton").first();
}

test.describe("typing", () => {
  test("'e', '+', a letter and a second decimal point leave the text unchanged", async ({ page }) => {
    await open(page, PMV_ADDRESS);
    const box = dryBulb(page);
    const before = await box.inputValue();

    for (const key of ["e", "E", "+", "a"]) {
      await typeAt(box, "end", key);
      await expect(box).toHaveValue(before);
    }
    await typeAt(box, "end", "..");
    await expect(box).toHaveValue(`${before}.`);
  });

  test("a minus is not admitted where the lower end is at least 0", async ({ page }) => {
    await open(page, PMV_ADDRESS);
    for (const box of [dryBulb(page), page.getByRole("spinbutton", { name: /^Air speed/ })]) {
      const before = await box.inputValue();
      await typeAt(box, "start", "-");
      await expect(box).toHaveValue(before);
    }
  });

  test("a minus is admitted, leading only, in the dew-point box", async ({ page }) => {
    await open(page, PMV_ADDRESS);
    await enterDewPoint(page);
    const box = page.getByRole("spinbutton", { name: /^Dew-point temperature/ });
    await box.fill("10");

    await typeAt(box, "end", "-");
    await expect(box).toHaveValue("10");
    await typeAt(box, "start", "-");
    await expect(box).toHaveValue("-10");
    await typeAt(box, "start", "-");
    await expect(box).toHaveValue("-10");
  });

  test("a minus is admitted in an Edge box, which has no bound", async ({ page }) => {
    const edge = await openBands(page);
    await edge.fill("");

    await edge.pressSequentially("-");
    await expect(edge).toHaveValue("-");
  });
});

test.describe("the arrow keys", () => {
  test("↑ and ↓ step by the unit's step, each a commit", async ({ page }) => {
    await open(page, PMV_ADDRESS);
    const box = dryBulb(page);
    await commit(box, "25");

    await box.press("ArrowUp");
    await expect(box).toHaveValue("25.1");
    await box.press("ArrowUp");
    await box.press("ArrowDown");
    await box.press("ArrowDown");
    await expect(box).toHaveValue("25");
    await box.press("ArrowDown");
    // Leaving the box shows what the slot holds: the step was committed.
    await box.blur();
    await expect(box).toHaveValue("24.9");
  });

  test("↑ at the bound's upper end and ↓ at its lower end leave the value there", async ({ page }) => {
    await open(page, PMV_ADDRESS);
    const box = dryBulb(page);

    await commit(box, "40");
    await box.press("ArrowUp");
    await expect(box).toHaveValue("40");
    await commit(box, "39.95");
    await box.press("ArrowUp");
    await expect(box).toHaveValue("40");

    await commit(box, "10");
    await box.press("ArrowDown");
    await expect(box).toHaveValue("10");
  });
});

/** `box`'s step buttons, up then down: hidden from assistive technology, as the browser's spinner is. */
function stepButtons(box: Locator) {
  const buttons = box.locator('xpath=ancestor::*[@data-slot="input-group"][1]').locator(".step-buttons button");
  return { up: buttons.nth(0), down: buttons.nth(1), all: buttons };
}

test.describe("the step buttons", () => {
  test("a click steps by the unit's step, stops at the bound, and leaves the focus in the box", async ({ page }) => {
    await open(page, PMV_ADDRESS);
    const box = dryBulb(page);
    await commit(box, "39.9");
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    const { up, down } = stepButtons(box);

    await up.click();
    await expect(box).toHaveValue("40");
    await expect(box).toBeFocused();
    await up.click();
    await expect(box).toHaveValue("40");
    await down.click();
    await down.click();
    await expect(box).toHaveValue("39.8");
    await expect(box).toBeFocused();
  });

  test("every box has the two, out of the tab order", async ({ page }) => {
    await open(page, PMV_ADDRESS);
    const boxes = await page.getByRole("spinbutton").all();
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      const { all } = stepButtons(box);
      await expect(all).toHaveCount(2);
      for (const button of await all.all()) {
        await expect(button).toHaveAttribute("tabindex", "-1");
      }
    }
  });

  test("an Edge box has the two, stepping by its unit's step", async ({ page }) => {
    const edge = await openBands(page);
    // The first Edge, PMV's -2.5: a step up keeps it below the next.
    await expect(edge).toHaveValue("-2.5");
    await stepButtons(edge).up.click();
    await expect(edge).toHaveValue("-2.4");
  });
});

test.describe("the box's attributes", () => {
  /** The `inputmode` a box's caption calls for: a numeric keypad where the bound's lower end is at least 0. */
  function inputModeFor(caption: string): string | null {
    const lower = /^(-?[\d.]+) – |^≥ (-?[\d.]+)/.exec(caption);
    return lower && Number(lower[1] ?? lower[2]) >= 0 ? "decimal" : null;
  }

  async function expectAttributes(boxes: Locator) {
    const modes = [];
    for (const box of await boxes.all()) {
      await expect(box).toHaveAttribute("type", "text");
      expect(await box.getAttribute("title")).toBeNull();
      const caption = (await captionOf(box).count()) > 0 ? await captionOf(box).innerText() : "";
      const mode = await box.getAttribute("inputmode");
      expect(mode, `${await box.getAttribute("aria-label")}: "${caption}"`).toBe(inputModeFor(caption));
      modes.push(mode);
    }
    return modes;
  }

  test("every box on Standard is a text input with no title, and inputmode decimal exactly where its lower end is at least 0", async ({ page }) => {
    await open(page, PMV_ADDRESS);
    await enterDewPoint(page);
    const modes = await expectAttributes(page.getByRole("spinbutton"));
    // Both answers are met: a box from 0 and the dew point, which has no lower end.
    expect(modes).toContain("decimal");
    expect(modes).toContain(null);
  });

  test("an Edge box is a text input with no title and no inputmode", async ({ page }) => {
    await openBands(page);
    const modes = await expectAttributes(page.getByRole("dialog").getByRole("spinbutton"));
    expect(modes.length).toBeGreaterThan(0);
  });
});

test.describe("the line under the box", () => {
  test("under metabolic rate it is the bound with 'met' and no preset's name", async ({ page }) => {
    await open(page, PMV_ADDRESS);
    const box = page.getByRole("spinbutton", { name: /^Metabolic rate/ });
    // A preset's value: its name stood on this line before.
    await box.fill("1");
    await expect(captionOf(box)).toHaveText("1 – 4 met");
  });

  test("under dry-bulb temperature it is the bound with '°C' in SI and '°F' in IP", async ({ page }) => {
    await open(page, PMV_ADDRESS);
    await expect(captionOf(dryBulb(page))).toHaveText("10 – 40 °C");
    await page.getByRole("radio", { name: "IP" }).click();
    await expect(captionOf(dryBulb(page))).toHaveText("50 – 104 °F");
  });

  test("under wet-bulb temperature it is the upper end, the library's wet bulb of 100 % at the dry bulb", async ({ page }) => {
    await open(page, PMV_ADDRESS);
    await enterHumidityAs(page, /^Wet-bulb temperature/);
    const box = page.getByRole("spinbutton", { name: /^Wet-bulb temperature/ });
    // `psy_ta_rh(t, 100).t_wb` is 25 at 25 °C and 9.9 at 10 °C. The wet bulb is lowered first: a dry bulb under it is refused.
    await commit(dryBulb(page), "25");
    await expect(captionOf(box)).toHaveText("≤ 25 °C");
    await commit(box, "5");
    await commit(dryBulb(page), "10");
    await expect(captionOf(box)).toHaveText("≤ 9.9 °C");
  });
});

test.describe("the row's presets", () => {
  test("a metabolic rate past the bound is disabled in the menu with its number shown, and one within is picked", async ({ page }) => {
    await open(page, PMV_ADDRESS);
    const metabolicRate = page.getByRole("spinbutton", { name: /^Metabolic rate/ });
    await page.locator('[data-slot="input-group"]').filter({ has: metabolicRate }).getByRole("button", { name: "Presets" }).click();
    const list = page.getByRole("listbox");

    // ASHRAE 55 takes 1 – 4 met: basketball's 6.3 is past it, walking about's 1.7 within.
    const basketball = list.getByRole("option", { name: /^Basketball/ });
    await expect(basketball).toHaveAttribute("aria-disabled", "true");
    await expect(basketball).toContainText("6.3");
    await expect(basketball).toHaveCSS("opacity", "0.5");
    const walking = list.getByRole("option", { name: /^Walking about/ });
    await expect(walking).toHaveAttribute("aria-disabled", "false");

    await walking.click();
    await expect(list).toHaveCount(0);
    await expect(metabolicRate).toHaveValue("1.7");
  });
});
