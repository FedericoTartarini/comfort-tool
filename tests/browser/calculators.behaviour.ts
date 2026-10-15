import { expect, test, type Locator, type Page } from "@playwright/test";
import { clo_dynamic_ashrae, clo_tout, solar_gain, Standard, t_o } from "jsthermalcomfort";
import { formatNumber } from "../../src/core/numberFormat";

/**
 * The input calculators enter by one button at the Inputs card's foot, which
 * opens one dialog with a tab per calculator the model's panel offers; Apply
 * writes slot 1 as decision 75 rule 3 converts it (ADR-0002 decision 75 rule 6
 * as noted 2026-10-15). Numbers are the library's for the same SI values, at
 * the app's two decimals.
 */

const PMV_ADDRESS = "/standard/ashrae-55/pmv-ppd-ashrae";
const ISO_ADDRESS = "/standard/iso-7730/pmv-ppd-iso";
const ADAPTIVE_ADDRESS = "/standard/ashrae-55/adaptive-ashrae";
const EXPLORE_ADDRESS = "/explore/pmv-ppd-ashrae";

const SOLAR = "Solar gain on occupants";
const ENSEMBLE = "Custom ensemble";
const CLOTHING = "Clothing from outdoor temperature";
const ALL_NAMES = `${SOLAR} · ${ENSEMBLE} · ${CLOTHING}`;
const OUTDOOR_TEMPERATURE = /^Outdoor air temperature at 6 a\.m\./;
const DASH = "—";

async function open(page: Page, address = PMV_ADDRESS) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(address);
  await expect(page.locator(".chart-plot svg").first()).toBeVisible();
}

function entryOf(page: Page) {
  return page.getByRole("button", { name: /^Input calculators/ });
}

/** The dialog, opened from the entry, on the tab named `tab` where one is given. */
async function openDialog(page: Page, tab?: string) {
  await entryOf(page).click();
  const dialog = page.getByRole("dialog");
  if (tab) {
    await dialog.getByRole("tab", { name: tab }).click();
  }
  return dialog;
}

/** The box of the row whose spinbutton is named `name`, its menu button inside it. */
function boxOf(page: Page, name: string | RegExp) {
  return page.locator('[data-slot="input-group"]').filter({ has: page.getByRole("spinbutton", { name }) });
}

/** A line of the dock, by its name; hidden tabs' docks are not found. */
function dockLine(dialog: Locator, name: string) {
  return dialog.getByRole("status", { name, exact: true });
}

/** The predicted clo at `tout` °C, as a row shows it. */
function predicted(tout: number) {
  return formatNumber(clo_tout({ tout }).clo_tout);
}

/** The library's increase at the dialog's defaults but `sharp`, unrounded as the app asks it. */
function increaseAt(sharp: number) {
  return solar_gain({
    sol_altitude: 45,
    sharp,
    sol_radiation_dir: 900,
    sol_transmittance: 0.8,
    f_svv: 0.2,
    f_bes: 0.5,
    asw: 0.7,
    posture: "sitting",
    round_output: false,
  }).delta_mrt;
}

test.describe("the entry", () => {
  test("on PMV (ASHRAE 55), the Inputs card ends with the button naming the three; the clothing box holds presets alone and the mean radiant temperature box no button", async ({ page }) => {
    await open(page);
    const entry = entryOf(page);
    await expect(entry).toContainText("Input calculators");
    await expect(entry).toContainText(ALL_NAMES);

    const presets = boxOf(page, /^Clothing insulation/).getByRole("button", { name: "Presets" });
    await expect(presets).toHaveText("Presets");
    await presets.click();
    const list = page.getByRole("listbox");
    await expect(list.getByRole("option").first()).toBeVisible();
    await expect(list.getByRole("group", { name: "Calculators" })).toHaveCount(0);
    await expect(list.getByRole("option", { name: ENSEMBLE })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await expect(boxOf(page, /^Mean radiant temperature/).getByRole("button")).toHaveCount(0);
  });

  test("on PMV (ISO 7730), the button names Custom ensemble alone and the dialog has one tab", async ({ page }) => {
    await open(page, ISO_ADDRESS);
    await expect(entryOf(page)).toContainText(ENSEMBLE);
    await expect(entryOf(page)).not.toContainText(SOLAR);
    const dialog = await openDialog(page);
    await expect(dialog.getByRole("tab")).toHaveText([ENSEMBLE]);
  });

  test("on Adaptive (ASHRAE 55), there is no button", async ({ page }) => {
    await open(page, ADAPTIVE_ADDRESS);
    await expect(page.getByRole("button", { name: "Model" })).toBeVisible();
    await expect(entryOf(page)).toHaveCount(0);
  });

  test("on Explore, the button and the dialog are the Standard page's", async ({ page }) => {
    await open(page, EXPLORE_ADDRESS);
    await expect(entryOf(page)).toContainText(ALL_NAMES);
    const dialog = await openDialog(page);
    await expect(dialog.getByRole("tab")).toHaveText([SOLAR, ENSEMBLE, CLOTHING]);
    await expect(dialog.getByText("Apply to")).toHaveCount(0);
  });
});

test.describe("the dialog", () => {
  test("is titled, opens on the first tab, reopens on the tab last used, and on the first after a reload", async ({ page }) => {
    await open(page);
    let dialog = await openDialog(page);
    await expect(dialog.getByRole("heading")).toHaveText("Input calculators");
    await expect(dialog.getByRole("tab")).toHaveText([SOLAR, ENSEMBLE, CLOTHING]);
    await expect(dialog.getByRole("tab", { name: SOLAR })).toHaveAttribute("aria-selected", "true");

    await dialog.getByRole("tab", { name: CLOTHING }).click();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(entryOf(page)).toBeFocused();

    dialog = await openDialog(page);
    await expect(dialog.getByRole("tab", { name: CLOTHING })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");

    await page.reload();
    dialog = await openDialog(page);
    await expect(dialog.getByRole("tab", { name: SOLAR })).toHaveAttribute("aria-selected", "true");
  });

  test("keeps the tab list, the dock's foot and Apply at one y on every tab", async ({ page }) => {
    await open(page);
    const dialog = await openDialog(page);
    const places: number[][] = [];
    for (const tab of [SOLAR, ENSEMBLE, CLOTHING]) {
      await dialog.getByRole("tab", { name: tab }).click();
      const panel = dialog.getByRole("tabpanel");
      const tabList = await dialog.getByRole("tablist").boundingBox();
      const dock = await panel.locator(".result-dock").boundingBox();
      const apply = await panel.getByRole("button", { name: "Apply" }).boundingBox();
      places.push([tabList!.y, dock!.y + dock!.height, apply!.y]);
    }
    expect(places[1]).toEqual(places[0]);
    expect(places[2]).toEqual(places[0]);
  });

  test("reaches the tab list, the settings, Apply, Restore defaults and Close by the keyboard in that order", async ({ page }) => {
    await open(page);
    let dialog = await openDialog(page, CLOTHING);
    // Restore defaults is enabled, and so reached, once a setting differs from its default.
    await dialog.getByRole("spinbutton", { name: OUTDOOR_TEMPERATURE }).fill("10");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    dialog = await openDialog(page);
    const panel = dialog.getByRole("tabpanel");
    const order = [
      dialog.getByRole("tab", { name: CLOTHING }),
      // The generated tabs give the panel a stop of its own, the method line being no control (WAI-ARIA tabs pattern).
      panel,
      panel.getByRole("spinbutton", { name: OUTDOOR_TEMPERATURE }),
      panel.getByRole("button", { name: "Apply" }),
      panel.getByRole("button", { name: "Restore defaults" }),
      dialog.getByRole("button", { name: "Close" }),
    ];
    await expect(order[0]).toBeFocused();
    for (const next of order.slice(1)) {
      await page.keyboard.press("Tab");
      await expect(next).toBeFocused();
    }
  });
});

test.describe("Solar gain on occupants", () => {
  const MRT_LINE = "Mean radiant temperature (°C)";

  test("opens on the method line, Posture and seven boxes with the deployed tool's labels and their ranges, and the dock", async ({ page }) => {
    await open(page);
    const dialog = await openDialog(page, SOLAR);
    const panel = dialog.getByRole("tabpanel");
    await expect(panel.getByText("The mean radiant temperature increase equivalent to the solar gain (ASHRAE 55 Normative Appendix C).")).toBeVisible();
    await expect(panel.locator('[data-slot="field-label"]')).toHaveText([
      "Posture",
      "Solar altitude above horizon (°)",
      "Solar horizontal angle relative to front of person (SHARP) (°)",
      "Direct beam (normal) solar radiation (W/m²)",
      "Total solar transmittance",
      "Sky vault view fraction",
      "Fraction of body exposed to sun",
      "Average shortwave absorptivity",
    ]);
    await expect(panel.locator(".caption-line")).toHaveText(["", "0 – 90", "0 – 180", "200 – 1000", "0 – 1", "0 – 1", "0 – 1", "0.2 – 0.9"]);
    await expect(panel.getByRole("button", { name: "Posture", exact: true })).toHaveText("Seated");

    await expect(dockLine(dialog, "ERF (W/m²)")).toBeVisible();
    await expect(dockLine(dialog, "Mean radiant temperature delta (°C)")).toHaveText(formatNumber(increaseAt(0)));
  });

  test("a box out of range is marked, the dock shows dashes and Apply is disabled", async ({ page }) => {
    await open(page);
    const dialog = await openDialog(page, SOLAR);
    const altitude = dialog.getByRole("spinbutton", { name: /^Solar altitude/ });
    await altitude.fill("95");
    await altitude.blur();
    await expect(altitude).toHaveAttribute("aria-invalid", "true");
    await expect(dockLine(dialog, "Mean radiant temperature delta (°C)")).toHaveText(DASH);
    await expect(dockLine(dialog, MRT_LINE)).toHaveText(`25 → ${DASH}`);
    await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  test("Apply raises the box by the shown delta and closes; reopened, the before is the raised value, the after past the bound is marked with it, and Apply raises again", async ({ page }) => {
    await open(page);
    const mrt = page.getByRole("spinbutton", { name: /^Mean radiant temperature/ });
    const once = formatNumber(25 + increaseAt(0));
    const twice = formatNumber(25 + 2 * increaseAt(0));

    let dialog = await openDialog(page, SOLAR);
    await expect(dockLine(dialog, MRT_LINE)).toHaveText(`25 → ${once} (limit 10 – 40)`);
    await expect(dockLine(dialog, MRT_LINE).locator(".out-of-range")).toHaveText(`${once} (limit 10 – 40)`);
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(entryOf(page)).toBeFocused();
    await expect(mrt).toHaveValue(once);
    await expect(mrt).toHaveAttribute("aria-invalid", "true");

    dialog = await openDialog(page);
    await expect(dockLine(dialog, MRT_LINE)).toHaveText(`${once} → ${twice} (limit 10 – 40)`);
    await expect(dialog.getByRole("button", { name: "Apply" })).toBeEnabled();
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(mrt).toHaveValue(twice);
  });

  test("closing without Apply changes nothing", async ({ page }) => {
    await open(page);
    const dialog = await openDialog(page, SOLAR);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("spinbutton", { name: /^Mean radiant temperature/ })).toHaveValue("25");
  });

  test("Restore defaults is disabled at the defaults, enabled after a change, and restores them", async ({ page }) => {
    await open(page);
    const dialog = await openDialog(page, SOLAR);
    const restore = dialog.getByRole("button", { name: "Restore defaults" });
    await expect(restore).toBeDisabled();

    const altitude = dialog.getByRole("spinbutton", { name: /^Solar altitude/ });
    await altitude.fill("60");
    await altitude.blur();
    await expect(restore).toBeEnabled();
    await restore.click();
    await expect(altitude).toHaveValue("45");
    await expect(restore).toBeDisabled();
  });

  test("with IP on, the direct beam stays in W/m² and the temperatures are in °F", async ({ page }) => {
    await open(page);
    await page.getByRole("radio", { name: "IP" }).click();
    const dialog = await openDialog(page, SOLAR);
    await expect(dialog.getByRole("spinbutton", { name: "Direct beam (normal) solar radiation (W/m²)" })).toHaveValue("900");
    await expect(dockLine(dialog, "Mean radiant temperature delta (°F)")).toHaveText(formatNumber((increaseAt(0) * 9) / 5));
    await expect(dockLine(dialog, "Mean radiant temperature (°F)")).toContainText("77 → ");
  });
});

test.describe("Clothing from outdoor temperature", () => {
  test("opens on the method line; its box is in °F with IP on, its prediction in the dock, and Apply writes it", async ({ page }) => {
    await open(page);
    await page.getByRole("radio", { name: "IP" }).click();
    const dialog = await openDialog(page, CLOTHING);
    await expect(dialog.getByRole("tabpanel").getByText(/\(ASHRAE 55 §5\.2\.2\.2\(f\)\)\.$/)).toBeVisible();

    const outdoor = dialog.getByRole("spinbutton", { name: "Outdoor air temperature at 6 a.m. (°F)" });
    await expect(outdoor).toHaveValue("68");
    await outdoor.fill("50");
    await outdoor.blur();
    // The prediction, then the clothing box's row, which shows it after Apply.
    const lines = dockLine(dialog, "Clothing insulation (clo)");
    await expect(lines.first()).toHaveText(predicted(10));
    await expect(lines.last()).toContainText(` → ${predicted(10)}`);

    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("spinbutton", { name: /^Clothing insulation/ })).toHaveValue(predicted(10));
  });

  test("keeps its box after a model switch, and a reload starts it at the default", async ({ page }) => {
    await open(page);
    let dialog = await openDialog(page, CLOTHING);
    await dialog.getByRole("spinbutton", { name: OUTDOOR_TEMPERATURE }).fill("5");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    const standards = page.getByRole("navigation").getByRole("group", { name: "Standard" });
    await standards.getByRole("link", { name: "ISO 7730" }).click();
    await expect(page).toHaveURL((url) => url.pathname === ISO_ADDRESS);
    await standards.getByRole("link", { name: "ASHRAE 55" }).click();
    await expect(page).toHaveURL((url) => url.pathname === PMV_ADDRESS);
    dialog = await openDialog(page, CLOTHING);
    await expect(dialog.getByRole("spinbutton", { name: OUTDOOR_TEMPERATURE })).toHaveValue("5");
    await page.keyboard.press("Escape");

    await page.reload();
    dialog = await openDialog(page, CLOTHING);
    await expect(dialog.getByRole("spinbutton", { name: OUTDOOR_TEMPERATURE })).toHaveValue("20");
  });
});

test.describe("the dock's row under the entry modes", () => {
  test("under dynamic clothing entry, it is the dynamic clothing insulation, and Apply writes the corrected value", async ({ page }) => {
    await open(page);
    await page.getByRole("spinbutton", { name: /^Metabolic rate/ }).fill("2");
    await page.getByRole("button", { name: "Clothing", exact: true }).click();
    await page.getByRole("menuitemradio", { name: /^Dynamic clothing insulation/ }).click();

    const dialog = await openDialog(page, CLOTHING);
    const corrected = formatNumber(clo_dynamic_ashrae(clo_tout({ tout: 20 }).clo_tout, 2));
    await expect(dockLine(dialog, "Dynamic clothing insulation (clo)")).toContainText(` → ${corrected}`);
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("spinbutton", { name: /^Dynamic clothing insulation/ })).toHaveValue(corrected);
  });

  test("under operative entry, it is the operative temperature, and Apply folds the raise at the model's standard", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Temperature", exact: true }).click();
    await page.getByRole("menuitemradio", { name: /^Operative temperature/ }).click();

    const dialog = await openDialog(page, SOLAR);
    const folded = formatNumber(t_o(25, 25 + increaseAt(0), 0.1, Standard.ashrae_55_2023));
    await expect(dockLine(dialog, "Operative temperature (°C)")).toHaveText(`25 → ${folded}`);
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("spinbutton", { name: /^Operative temperature/ })).toHaveValue(folded);
  });
});
