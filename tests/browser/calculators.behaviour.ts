import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  CLO_INDIVIDUAL_GARMENT_GROUPS,
  clo_dynamic_ashrae,
  clo_individual_garments,
  clo_tout,
  solar_gain,
  Standard,
  t_o,
} from "jsthermalcomfort";
import { formatNumber } from "../../src/core/numberFormat";

/**
 * A row's menu holds its presets and its input calculators, and a
 * calculator's dialog writes its result into the slot whose box opened it
 * (ADR-0002 decision 75 rules 3 and 6). Numbers are the library's for the
 * same SI values, at the app's two decimals.
 */

const PMV_ADDRESS = "/standard/ashrae-55/pmv-ppd-ashrae";
const ISO_ADDRESS = "/standard/iso-7730/pmv-ppd-iso";
const ADAPTIVE_ADDRESS = "/standard/ashrae-55/adaptive-ashrae";
const EXPLORE_ADDRESS = "/explore/pmv-ppd-ashrae";

const CALCULATOR = "Clothing from outdoor temperature";
const OUTDOOR_TEMPERATURE = /^Outdoor air temperature at 6 a\.m\./;

async function open(page: Page, address = PMV_ADDRESS) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(address);
  await expect(page.locator(".chart-plot svg").first()).toBeVisible();
}

/** The box of the row whose spinbutton is named `name`, its menu button inside it. */
function boxOf(page: Page, name: string | RegExp) {
  return page.locator('[data-slot="input-group"]').filter({ has: page.getByRole("spinbutton", { name }) });
}

/** The predicted clo at `tout` °C, as a row shows it. */
function predicted(tout: number) {
  return formatNumber(clo_tout({ tout }).clo_tout);
}

async function openCalculator(menuButton: Locator, calculator = CALCULATOR) {
  await menuButton.click();
  await menuButton.page().getByRole("listbox").getByRole("option", { name: calculator }).click();
  return menuButton.page().getByRole("dialog");
}

async function compareThreeSlots(page: Page) {
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  for (const slot of ["Input 2", "Input 3"]) {
    const toggle = page.getByRole("button", { name: slot, exact: true });
    if ((await toggle.getAttribute("aria-pressed")) !== "true") {
      await toggle.click();
    }
  }
}

test.describe("the row menu", () => {
  test("on PMV (ASHRAE 55), the clothing box's list has a Calculators group of two under the Presets group", async ({ page }) => {
    await open(page);
    const presets = boxOf(page, /^Clothing insulation/).getByRole("button", { name: "Presets" });
    await expect(presets).toHaveText("Presets");

    await presets.click();
    const groups = page.getByRole("listbox").getByRole("group");
    await expect(groups).toHaveCount(2);
    await expect(groups.nth(0)).toHaveAccessibleName("Presets");
    await expect(groups.nth(1)).toHaveAccessibleName("Calculators");
    await expect(groups.nth(1).getByRole("option")).toHaveText(["Custom ensemble", CALCULATOR]);
  });

  test("on PMV (ISO 7730), the clothing box's Calculators group has one entry", async ({ page }) => {
    await open(page, ISO_ADDRESS);
    await boxOf(page, /^Clothing insulation/).getByRole("button", { name: "Presets" }).click();
    await expect(page.getByRole("listbox").getByRole("group", { name: "Calculators" }).getByRole("option")).toHaveText(["Custom ensemble"]);
  });

  test("on Explore, the clothing box's list is the Standard page's", async ({ page }) => {
    await open(page, EXPLORE_ADDRESS);
    await boxOf(page, /^Clothing insulation/).getByRole("button", { name: "Presets" }).click();
    await expect(page.getByRole("listbox").getByRole("group", { name: "Calculators" }).getByRole("option")).toHaveText(["Custom ensemble", CALCULATOR]);
  });

  test("on Adaptive (ASHRAE 55), no box has a menu button", async ({ page }) => {
    await open(page, ADAPTIVE_ADDRESS);
    await expect(page.locator('[data-slot="input-group"]').getByRole("button")).toHaveCount(0);
  });

  test("a row with presets alone keeps its one ungrouped list", async ({ page }) => {
    await open(page);
    await boxOf(page, /^Metabolic rate/).getByRole("button", { name: "Presets" }).click();
    await expect(page.getByRole("listbox").getByRole("group", { name: "Calculators" })).toHaveCount(0);
    await expect(page.getByRole("listbox").getByRole("option").first()).toBeVisible();
  });
});

test.describe("Clothing from outdoor temperature", () => {
  test("opens a titled dialog whose result moves with its box, and Apply writes it and closes", async ({ page }) => {
    await open(page);
    const dialog = await openCalculator(boxOf(page, /^Clothing insulation/).getByRole("button", { name: "Presets" }));
    await expect(dialog.getByRole("heading")).toHaveText(CALCULATOR);

    const outdoor = dialog.getByRole("spinbutton", { name: OUTDOOR_TEMPERATURE });
    await expect(outdoor).toHaveValue("20");
    const result = dialog.getByRole("status", { name: "Clothing insulation (clo)" });
    await expect(result).toHaveText(predicted(20));
    await outdoor.fill("10");
    await expect(result).toHaveText(predicted(10));

    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("spinbutton", { name: /^Clothing insulation/ })).toHaveValue(predicted(10));
  });

  test("closing without Apply changes nothing, and reopening shows the typed value", async ({ page }) => {
    await open(page);
    const clothing = page.getByRole("spinbutton", { name: /^Clothing insulation/ });
    const before = await clothing.inputValue();
    const menu = boxOf(page, /^Clothing insulation/).getByRole("button", { name: "Presets" });

    let dialog = await openCalculator(menu);
    await dialog.getByRole("spinbutton", { name: OUTDOOR_TEMPERATURE }).fill("5");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(clothing).toHaveValue(before);

    dialog = await openCalculator(menu);
    await expect(dialog.getByRole("spinbutton", { name: OUTDOOR_TEMPERATURE })).toHaveValue("5");
    await expect(dialog.getByRole("status", { name: "Clothing insulation (clo)" })).toHaveText(predicted(5));
  });

  test("keeps its box after a model switch, and a reload starts it at the default", async ({ page }) => {
    await open(page);
    let dialog = await openCalculator(boxOf(page, /^Clothing insulation/).getByRole("button", { name: "Presets" }));
    await dialog.getByRole("spinbutton", { name: OUTDOOR_TEMPERATURE }).fill("5");
    await page.keyboard.press("Escape");

    const standards = page.getByRole("navigation").getByRole("group", { name: "Standard" });
    await standards.getByRole("link", { name: "ISO 7730" }).click();
    await expect(page).toHaveURL((url) => url.pathname === ISO_ADDRESS);
    await standards.getByRole("link", { name: "ASHRAE 55" }).click();
    await expect(page).toHaveURL((url) => url.pathname === PMV_ADDRESS);
    dialog = await openCalculator(boxOf(page, /^Clothing insulation/).getByRole("button", { name: "Presets" }));
    await expect(dialog.getByRole("spinbutton", { name: OUTDOOR_TEMPERATURE })).toHaveValue("5");
    await page.keyboard.press("Escape");

    await page.reload();
    dialog = await openCalculator(boxOf(page, /^Clothing insulation/).getByRole("button", { name: "Presets" }));
    await expect(dialog.getByRole("spinbutton", { name: OUTDOOR_TEMPERATURE })).toHaveValue("20");
  });

  test("its box is in °F with IP on", async ({ page }) => {
    await open(page);
    await page.getByRole("radio", { name: "IP" }).click();
    const dialog = await openCalculator(boxOf(page, /^Clothing insulation/).getByRole("button", { name: "Presets" }));
    const outdoor = dialog.getByRole("spinbutton", { name: /^Outdoor air temperature at 6 a\.m\. \(°F\)/ });
    await expect(outdoor).toHaveValue("68");
    await outdoor.fill("50");
    await expect(dialog.getByRole("status", { name: "Clothing insulation (clo)" })).toHaveText(predicted(10));
  });

  test("under Compare with three slots, names the slot and writes that column alone", async ({ page }) => {
    await open(page);
    await compareThreeSlots(page);
    for (const slot of ["Input 1", "Input 2", "Input 3"]) {
      await expect(boxOf(page, `Clothing insulation (clo), ${slot}`).getByRole("button", { name: `Presets, ${slot}` })).toBeVisible();
    }
    const before = await page.getByRole("spinbutton", { name: "Clothing insulation (clo), Input 1" }).inputValue();

    const dialog = await openCalculator(boxOf(page, "Clothing insulation (clo), Input 2").getByRole("button", { name: "Presets, Input 2" }));
    await expect(dialog.getByRole("heading")).toHaveText(`${CALCULATOR}, Input 2`);
    await dialog.getByRole("spinbutton", { name: OUTDOOR_TEMPERATURE }).fill("10");
    await dialog.getByRole("button", { name: "Apply" }).click();

    await expect(page.getByRole("spinbutton", { name: "Clothing insulation (clo), Input 2" })).toHaveValue(predicted(10));
    for (const slot of ["Input 1", "Input 3"]) {
      await expect(page.getByRole("spinbutton", { name: `Clothing insulation (clo), ${slot}` })).toHaveValue(before);
    }
  });

  test("under dynamic clothing entry, the dynamic box offers it and Apply writes the corrected value", async ({ page }) => {
    await open(page);
    await page.getByRole("spinbutton", { name: /^Metabolic rate/ }).fill("2");
    await page.getByRole("button", { name: "Clothing", exact: true }).click();
    await page.getByRole("menuitemradio", { name: /^Dynamic clothing insulation/ }).click();

    // The dynamic row holds no presets: its button says what it holds, and its list is the two calculators ungrouped.
    const menu = boxOf(page, /^Dynamic clothing insulation/).getByRole("button", { name: "Calculators" });
    await expect(menu).toHaveText("Calculators");
    await menu.click();
    await expect(page.getByRole("listbox").getByRole("option")).toHaveText(["Custom ensemble", CALCULATOR]);
    await page.keyboard.press("Escape");

    const dialog = await openCalculator(menu);
    await dialog.getByRole("button", { name: "Apply" }).click();
    const corrected = clo_dynamic_ashrae(clo_tout({ tout: 20 }).clo_tout, 2);
    await expect(page.getByRole("spinbutton", { name: /^Dynamic clothing insulation/ })).toHaveValue(formatNumber(corrected));
  });
});

test.describe("Solar gain on occupants", () => {
  const SOLAR = "Solar gain on occupants";
  /** The library's increase at the dialog's defaults but `sharp` and `posture`, unrounded as the app asks it. */
  const increaseAt = (sharp: number, posture: "sitting" | "standing" = "sitting") =>
    solar_gain({
      sol_altitude: 45,
      sharp,
      sol_radiation_dir: 900,
      sol_transmittance: 0.8,
      f_svv: 0.2,
      f_bes: 0.5,
      asw: 0.7,
      posture,
      round_output: false,
    }).delta_mrt;
  const mrtMenu = (page: Page, name: string | RegExp = /^Mean radiant temperature/, button = "Calculators") =>
    boxOf(page, name).getByRole("button", { name: button });
  const status = (dialog: Locator, name: string) => dialog.getByRole("status", { name });

  test("the mean radiant temperature box holds it alone under Calculators, and PMV (ISO 7730)'s holds none", async ({ page }) => {
    await open(page);
    const menu = mrtMenu(page);
    await expect(menu).toHaveText("Calculators");
    await menu.click();
    await expect(page.getByRole("listbox").getByRole("option")).toHaveText([SOLAR]);

    await open(page, ISO_ADDRESS);
    await expect(boxOf(page, /^Mean radiant temperature/).getByRole("button")).toHaveCount(0);
  });

  test("asks the posture and seven boxes with their ranges, and shows the result before and after", async ({ page }) => {
    await open(page);
    const dialog = await openCalculator(mrtMenu(page), SOLAR);
    await expect(dialog.getByRole("heading")).toHaveText(SOLAR);
    await expect(dialog.getByRole("button", { name: "Posture", exact: true })).toHaveText("Seated");
    await dialog.getByRole("button", { name: "Posture", exact: true }).click();
    await expect(page.getByRole("listbox").getByRole("option")).toHaveText(["Seated", "Standing", "Supine"]);
    await page.keyboard.press("Escape");
    // bits-ui 2.19.0 reads a list's z-index a frame after it mounts: reopened while the last one still closes, the
    // list stacks under the dialog. Reopen once it has gone, as a person does.
    await expect(page.getByRole("listbox")).toHaveCount(0);

    await expect(dialog.getByRole("spinbutton")).toHaveCount(7);
    const captions = dialog.locator(".caption-line");
    await expect(captions).toHaveText(["0 – 90", "0 – 180", "200 – 1000", "0 – 1", "0 – 1", "0 – 1", "0.2 – 0.9"]);

    const increase = increaseAt(0);
    await expect(status(dialog, "Mean radiant temperature increase (°C)")).toHaveText(formatNumber(increase));
    await expect(status(dialog, "Effective radiant field (W/m²)")).toBeVisible();
    await expect(status(dialog, "Mean radiant temperature before (°C)")).toHaveText("25");
    await expect(status(dialog, "Mean radiant temperature after (°C)")).toHaveText(formatNumber(25 + increase));

    await dialog.getByRole("button", { name: "Posture", exact: true }).click();
    await page.getByRole("option", { name: "Standing" }).click();
    await expect(status(dialog, "Mean radiant temperature increase (°C)")).toHaveText(formatNumber(increaseAt(0, "standing")));
  });

  test("a box out of range is marked, the result cleared and Apply disabled", async ({ page }) => {
    await open(page);
    const dialog = await openCalculator(mrtMenu(page), SOLAR);
    const altitude = dialog.getByRole("spinbutton", { name: /^Solar altitude/ });
    await altitude.fill("95");
    await expect(altitude).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByRole("status")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  test("at the defaults Apply raises the box by the shown increase, past its bound and marked; reopened, it starts from there, keeps its inputs and raises again", async ({ page }) => {
    await open(page);
    const mrt = page.getByRole("spinbutton", { name: /^Mean radiant temperature/ });
    let dialog = await openCalculator(mrtMenu(page), SOLAR);
    const shownAfter = await status(dialog, "Mean radiant temperature after (°C)").textContent();
    await expect(status(dialog, "Mean radiant temperature increase (°C)")).toHaveText(formatNumber(increaseAt(0)));
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(mrt).toHaveValue(shownAfter!);
    await expect(mrt).toHaveAttribute("aria-invalid", "true");

    dialog = await openCalculator(mrtMenu(page), SOLAR);
    await expect(status(dialog, "Mean radiant temperature before (°C)")).toHaveText(shownAfter!);
    await dialog.getByRole("spinbutton", { name: /^Solar horizontal angle/ }).fill("30");
    await page.keyboard.press("Escape");
    await expect(mrt).toHaveValue(shownAfter!);

    dialog = await openCalculator(mrtMenu(page), SOLAR);
    await expect(dialog.getByRole("spinbutton", { name: /^Solar horizontal angle/ })).toHaveValue("30");
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(mrt).toHaveValue(formatNumber(25 + increaseAt(0) + increaseAt(30)));
  });

  test("with IP on, the direct beam stays in W/m² and the temperatures are in °F", async ({ page }) => {
    await open(page);
    await page.getByRole("radio", { name: "IP" }).click();
    const dialog = await openCalculator(mrtMenu(page), SOLAR);
    await expect(dialog.getByRole("spinbutton", { name: "Direct-beam solar radiation (W/m²)" })).toHaveValue("900");
    await expect(status(dialog, "Mean radiant temperature increase (°F)")).toHaveText(formatNumber((increaseAt(0) * 9) / 5));
    await expect(status(dialog, "Mean radiant temperature before (°F)")).toHaveText("77");
  });

  test("under Compare, the title names the slot and Apply writes that column alone", async ({ page }) => {
    await open(page);
    await compareThreeSlots(page);
    const dialog = await openCalculator(mrtMenu(page, "Mean radiant temperature (°C), Input 3", "Calculators, Input 3"), SOLAR);
    await expect(dialog.getByRole("heading")).toHaveText(`${SOLAR}, Input 3`);
    await dialog.getByRole("button", { name: "Apply" }).click();

    await expect(page.getByRole("spinbutton", { name: "Mean radiant temperature (°C), Input 3" })).toHaveValue(formatNumber(25 + increaseAt(0)));
    for (const slot of ["Input 1", "Input 2"]) {
      await expect(page.getByRole("spinbutton", { name: `Mean radiant temperature (°C), ${slot}` })).toHaveValue("25");
    }
  });

  test("under operative entry, the operative row holds it and Apply folds the raised temperature at the model's standard", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Temperature", exact: true }).click();
    await page.getByRole("menuitemradio", { name: /^Operative temperature/ }).click();

    const dialog = await openCalculator(mrtMenu(page, /^Operative temperature/), SOLAR);
    await expect(status(dialog, "Mean radiant temperature before (°C)")).toHaveText("25");
    await dialog.getByRole("button", { name: "Apply" }).click();
    const folded = t_o(25, 25 + increaseAt(0), 0.1, Standard.ashrae_55_2023);
    await expect(page.getByRole("spinbutton", { name: /^Operative temperature/ })).toHaveValue(formatNumber(folded));
  });
});

test.describe("Custom ensemble", () => {
  const ENSEMBLE = "Custom ensemble";
  const SUM = "Ensemble insulation (clo)";
  /** The library's sum of `garments`, and that sum at the app's two decimals. */
  const totalOf = (...garments: string[]) => garments.reduce((total, garment) => total + clo_individual_garments[garment], 0);
  const sumOf = (...garments: string[]) => formatNumber(totalOf(...garments));
  /** A garment's entry, by the key it shows: some keys begin others, so matched whole. */
  const garment = (dialog: Locator, key: string) => dialog.getByRole("option").filter({ has: dialog.page().getByText(key, { exact: true }) });
  const chips = (dialog: Locator) => dialog.getByRole("button", { name: /^Remove / });
  const clothingMenu = (page: Page, name: string | RegExp = /^Clothing insulation/, button = "Presets") =>
    boxOf(page, name).getByRole("button", { name: button });

  test("on PMV (ISO 7730) lists every garment once under the library's groups, in their order with Chairs last, valued in clo", async ({ page }) => {
    await open(page, ISO_ADDRESS);
    const dialog = await openCalculator(clothingMenu(page), ENSEMBLE);
    await expect(dialog.getByRole("heading")).toHaveText(ENSEMBLE);

    const groups = dialog.getByRole("listbox").getByRole("group");
    const headings = CLO_INDIVIDUAL_GARMENT_GROUPS.map(({ group }) => group);
    expect(headings[headings.length - 1]).toBe("Chairs");
    await expect(groups).toHaveCount(headings.length);
    for (const [index, { group, garments }] of CLO_INDIVIDUAL_GARMENT_GROUPS.entries()) {
      await expect(groups.nth(index)).toHaveAccessibleName(group);
      await expect(groups.nth(index).getByRole("option")).toHaveText(
        garments.map((key) => `${key} ${formatNumber(clo_individual_garments[key])}`),
      );
    }
    await expect(dialog.getByRole("option")).toHaveCount(Object.keys(clo_individual_garments).length);
  });

  test("searching narrows the list across the groups", async ({ page }) => {
    await open(page, ISO_ADDRESS);
    const dialog = await openCalculator(clothingMenu(page), ENSEMBLE);
    await dialog.getByRole("combobox").fill("shoes");
    const groups = dialog.getByRole("listbox").getByRole("group");
    await expect(groups).toHaveCount(1);
    await expect(groups).toHaveAccessibleName("Footwear");
    await expect(dialog.getByRole("option")).toHaveCount(1);
    await expect(garment(dialog, "Shoes or sandals")).toBeVisible();
  });

  test("checking adds a chip and the sum, a chip removes its garment, and Apply writes the sum and closes", async ({ page }) => {
    await open(page);
    const dialog = await openCalculator(clothingMenu(page), ENSEMBLE);
    const apply = dialog.getByRole("button", { name: "Apply" });
    await expect(apply).toBeDisabled();

    await garment(dialog, "Thin trousers").click();
    await garment(dialog, "Long-sleeve dress shirt").click();
    await garment(dialog, "Shoes or sandals").click();
    await expect(chips(dialog)).toHaveCount(3);
    await expect(garment(dialog, "Thin trousers")).toBeChecked();
    await expect(dialog.getByRole("status", { name: SUM })).toHaveText(sumOf("Thin trousers", "Long-sleeve dress shirt", "Shoes or sandals"));

    await dialog.getByRole("button", { name: "Remove Long-sleeve dress shirt" }).click();
    await expect(chips(dialog)).toHaveCount(2);
    await expect(garment(dialog, "Long-sleeve dress shirt")).not.toBeChecked();
    await expect(dialog.getByRole("status", { name: SUM })).toHaveText(sumOf("Thin trousers", "Shoes or sandals"));

    await apply.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("spinbutton", { name: /^Clothing insulation/ })).toHaveValue(sumOf("Thin trousers", "Shoes or sandals"));
  });

  test("checking a chosen garment again unchecks it, and with nothing chosen Apply is disabled", async ({ page }) => {
    await open(page);
    const dialog = await openCalculator(clothingMenu(page), ENSEMBLE);
    await garment(dialog, "Boots").click();
    await expect(dialog.getByRole("button", { name: "Apply" })).toBeEnabled();
    await garment(dialog, "Boots").click();
    await expect(chips(dialog)).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  test("closing without Apply changes nothing; the chosen set is kept for another model and starts empty on a reload", async ({ page }) => {
    await open(page);
    const clothing = page.getByRole("spinbutton", { name: /^Clothing insulation/ });
    const before = await clothing.inputValue();
    let dialog = await openCalculator(clothingMenu(page), ENSEMBLE);
    await garment(dialog, "Thick skirt").click();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(clothing).toHaveValue(before);

    const standards = page.getByRole("navigation").getByRole("group", { name: "Standard" });
    await standards.getByRole("link", { name: "ISO 7730" }).click();
    await expect(page).toHaveURL((url) => url.pathname === ISO_ADDRESS);
    dialog = await openCalculator(clothingMenu(page), ENSEMBLE);
    await expect(chips(dialog)).toHaveText(["Thick skirt"]);
    await page.keyboard.press("Escape");

    await page.reload();
    dialog = await openCalculator(clothingMenu(page), ENSEMBLE);
    await expect(chips(dialog)).toHaveCount(0);
  });

  test("under Compare, the title names the slot, Apply writes that column alone, and another slot's dialog holds the same set", async ({ page }) => {
    await open(page);
    await compareThreeSlots(page);
    const before = await page.getByRole("spinbutton", { name: "Clothing insulation (clo), Input 1" }).inputValue();
    let dialog = await openCalculator(clothingMenu(page, "Clothing insulation (clo), Input 2", "Presets, Input 2"), ENSEMBLE);
    await expect(dialog.getByRole("heading")).toHaveText(`${ENSEMBLE}, Input 2`);
    await garment(dialog, "Sweatpants").click();
    await garment(dialog, "Long-sleeve sweat shirt").click();
    await dialog.getByRole("button", { name: "Apply" }).click();

    await expect(page.getByRole("spinbutton", { name: "Clothing insulation (clo), Input 2" })).toHaveValue(sumOf("Sweatpants", "Long-sleeve sweat shirt"));
    for (const slot of ["Input 1", "Input 3"]) {
      await expect(page.getByRole("spinbutton", { name: `Clothing insulation (clo), ${slot}` })).toHaveValue(before);
    }

    dialog = await openCalculator(clothingMenu(page, "Clothing insulation (clo), Input 3", "Presets, Input 3"), ENSEMBLE);
    await expect(chips(dialog)).toHaveText(["Sweatpants", "Long-sleeve sweat shirt"]);
  });

  test("under dynamic clothing entry, Apply writes the corrected sum into the dynamic box", async ({ page }) => {
    await open(page);
    await page.getByRole("spinbutton", { name: /^Metabolic rate/ }).fill("2");
    await page.getByRole("button", { name: "Clothing", exact: true }).click();
    await page.getByRole("menuitemradio", { name: /^Dynamic clothing insulation/ }).click();

    const dialog = await openCalculator(clothingMenu(page, /^Dynamic clothing insulation/, "Calculators"), ENSEMBLE);
    await garment(dialog, "Thin trousers").click();
    await garment(dialog, "Short-sleeve knit shirt").click();
    await dialog.getByRole("button", { name: "Apply" }).click();
    const corrected = clo_dynamic_ashrae(totalOf("Thin trousers", "Short-sleeve knit shirt"), 2);
    await expect(page.getByRole("spinbutton", { name: /^Dynamic clothing insulation/ })).toHaveValue(formatNumber(corrected));
  });
});
