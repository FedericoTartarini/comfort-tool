import { expect, test, type Locator, type Page } from "@playwright/test";
import { CLO_INDIVIDUAL_GARMENT_GROUPS, clo_dynamic_ashrae, clo_individual_garments, clo_tout, solar_gain, Standard, t_o } from "jsthermalcomfort";
import { formatNumber } from "../../src/core/numberFormat";

/**
 * The input calculators enter by one button at the Inputs card's foot, which
 * opens one dialog with a tab per calculator the model's panel offers; Apply
 * writes slot 1, or under Compare the slots checked under "Apply to", as
 * decision 75 rule 3 converts it (ADR-0002 decision 75 rule 6 as noted
 * 2026-10-15). Numbers are the library's for the same SI values, at the app's
 * two decimals.
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
const MRT_LINE = "Mean radiant temperature (°C)";

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

/** Compare on with its three slots enabled: Compare enables slot 2 on first use, and slot 3 by its button. */
async function compareThreeSlots(page: Page) {
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await page.getByRole("button", { name: "Input 3", exact: true }).click();
  await expect(mrtOf(page, "Input 3")).toBeVisible();
}

/** The mean radiant temperature box of the slot named `slotName`, under Compare. */
function mrtOf(page: Page, slotName: string) {
  return page.getByRole("spinbutton", { name: new RegExp(`^Mean radiant temperature.*, ${slotName}$`) });
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

  test("keeps the tab list, the dock's foot and Apply at one y on every tab, with three slots chosen too", async ({ page }) => {
    await open(page);
    async function placesOnEveryTab(dialog: Locator) {
      const places: number[][] = [];
      for (const tab of [SOLAR, ENSEMBLE, CLOTHING]) {
        await dialog.getByRole("tab", { name: tab }).click();
        const panel = dialog.getByRole("tabpanel");
        const tabList = await dialog.getByRole("tablist").boundingBox();
        const dock = await panel.locator(".result-dock").boundingBox();
        const apply = await panel.getByRole("button", { name: "Apply" }).boundingBox();
        places.push([tabList!.y, dock!.y + dock!.height, apply!.y]);
      }
      return places;
    }
    let dialog = await openDialog(page);
    const [first, ...rest] = await placesOnEveryTab(dialog);
    expect(rest).toEqual([first, first]);
    await page.keyboard.press("Escape");

    await compareThreeSlots(page);
    dialog = await openDialog(page, SOLAR);
    for (const name of ["Input 2", "Input 3"]) {
      await dialog.getByRole("tabpanel").getByRole("checkbox", { name }).click();
    }
    expect(await placesOnEveryTab(dialog)).toEqual([first, first, first]);
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

test.describe("Custom ensemble", () => {
  const SUM_LINE = "Ensemble insulation (clo)";
  const CLOTHING_LINE = "Clothing insulation (clo)";

  /** The sum of the library's values of `garments`, as the dock shows it. */
  function sumOf(...garments: string[]) {
    return formatNumber(garments.reduce((total, garment) => total + clo_individual_garments[garment], 0));
  }

  /** The library's garments of the group headed `heading`. */
  function garmentsOf(heading: string) {
    return CLO_INDIVIDUAL_GARMENT_GROUPS.find(({ group }) => group === heading)!.garments;
  }

  /** The row of the garment group headed `group`. */
  function rowOf(panel: Locator, group: string) {
    return panel.getByRole("group", { name: group, exact: true });
  }

  /** Wears `garment` from its row's list, the row headed `group`, whose button reads `word`. */
  async function wearFromRow(page: Page, panel: Locator, group: string, garment: string, word = "Add") {
    await rowOf(panel, group).getByRole("button", { name: `${word} ${group}` }).click();
    await page.getByRole("listbox").getByRole("option", { name: new RegExp(`^${garment.replace(/[()]/g, "\\$&")}`) }).click();
    await expect(page.getByRole("listbox")).toHaveCount(0);
  }

  test("is a row per garment group in the library's order, Chairs last with the standard's caption under it", async ({ page }) => {
    await open(page);
    const dialog = await openDialog(page, ENSEMBLE);
    const panel = dialog.getByRole("tabpanel");
    await expect(panel.getByText("The sum of the garments' and the chair's insulation (ASHRAE 55 §5.2.2.2(c) and (d)).")).toBeVisible();
    const groups = CLO_INDIVIDUAL_GARMENT_GROUPS.map(({ group }) => group);
    expect(groups[groups.length - 1]).toBe("Chairs");
    let above = -Infinity;
    for (const group of groups) {
      const box = await rowOf(panel, group).boundingBox();
      expect(box!.y).toBeGreaterThan(above);
      above = box!.y;
    }
    // The standard's condition stands in the Chairs row, under its list button.
    const chairsList = await rowOf(panel, "Chairs").getByRole("button", { name: "Add Chairs" }).boundingBox();
    const caption = await rowOf(panel, "Chairs").getByText("ASHRAE 55 Table 5.2.2.2C: for ensembles of 0.5 to 1.2 clo; optional").boundingBox();
    expect(caption!.y).toBeGreaterThanOrEqual(chairsList!.y + chairsList!.height);

    // Every row's list button stands at one x and one width.
    const buttons = await Promise.all(groups.map((group) => rowOf(panel, group).getByRole("button", { name: `Add ${group}` }).boundingBox()));
    for (const button of buttons) {
      expect([button!.x, button!.width]).toEqual([buttons[0]!.x, buttons[0]!.width]);
    }
  });

  test("a row's list holds its garments not worn with their clo; choosing one wears it as a chip and closes the list; its × takes it off", async ({ page }) => {
    await open(page);
    const dialog = await openDialog(page, ENSEMBLE);
    const panel = dialog.getByRole("tabpanel");
    await expect(dockLine(dialog, SUM_LINE)).toHaveText(DASH);
    await expect(dockLine(dialog, CLOTHING_LINE)).toHaveText(`0.5 → ${DASH}`);
    await expect(panel.getByRole("button", { name: "Apply" })).toBeDisabled();

    const footwear = rowOf(panel, "Footwear");
    await footwear.getByRole("button", { name: "Add Footwear" }).click();
    const list = page.getByRole("listbox");
    await expect(list.getByRole("option")).toHaveCount(garmentsOf("Footwear").length);
    await expect(list.getByRole("option", { name: /^Ankle socks/ })).toContainText("0.02");
    await list.getByRole("option", { name: /^Ankle socks/ }).click();
    await expect(list).toHaveCount(0);
    await expect(footwear.getByRole("button", { name: "Remove Ankle socks" })).toBeVisible();
    await wearFromRow(page, panel, "Footwear", "Shoes or sandals");
    await expect(dockLine(dialog, SUM_LINE)).toHaveText(sumOf("Ankle socks", "Shoes or sandals"));
    await expect(panel.getByRole("button", { name: "Apply" })).toBeEnabled();

    await footwear.getByRole("button", { name: "Add Footwear" }).click();
    await expect(list.getByRole("option")).toHaveCount(garmentsOf("Footwear").length - 2);
    await expect(list.getByRole("option", { name: /^Ankle socks/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(list).toHaveCount(0);

    await footwear.getByRole("button", { name: "Remove Ankle socks" }).click();
    await expect(footwear.getByRole("button", { name: "Remove Ankle socks" })).toHaveCount(0);
    await expect(dockLine(dialog, SUM_LINE)).toHaveText(sumOf("Shoes or sandals"));
  });

  test("the search's results float over the rows, mark a worn garment, and Enter wears one and clears the query", async ({ page }) => {
    await open(page);
    const dialog = await openDialog(page, ENSEMBLE);
    const panel = dialog.getByRole("tabpanel");
    await wearFromRow(page, panel, "Footwear", "Calf length socks");
    const search = panel.getByPlaceholder("Search garments…");
    await expect(panel.getByRole("option")).toHaveCount(0);

    const before = await rowOf(panel, "Underwear").boundingBox();
    await search.fill("sock");
    const results = panel.getByRole("option");
    await expect(results).toHaveCount(Object.keys(clo_individual_garments).filter((garment) => garment.includes("sock")).length);
    await expect(results.first()).toContainText("Ankle socks");
    await expect(panel.getByRole("option", { name: /^Calf length socks/ })).toHaveAttribute("aria-checked", "true");
    await expect(results.first()).toHaveAttribute("aria-checked", "false");
    expect(await rowOf(panel, "Underwear").boundingBox()).toEqual(before);
    // The results stand over the rows, drawn above them: the point at a result's centre is the result's.
    const list = await panel.getByRole("listbox").boundingBox();
    expect(list!.y).toBeLessThan(before!.y + before!.height);
    const onTop = await results.first().evaluate((result) => {
      const { x, y, width, height } = result.getBoundingClientRect();
      return result.contains(document.elementFromPoint(x + width / 2, y + height / 2));
    });
    expect(onTop).toBe(true);

    await page.keyboard.press("Enter");
    await expect(search).toHaveValue("");
    await expect(panel.getByRole("option")).toHaveCount(0);
    await expect(rowOf(panel, "Footwear").getByRole("button", { name: "Remove Ankle socks" })).toBeVisible();
    await expect(dockLine(dialog, SUM_LINE)).toHaveText(sumOf("Calf length socks", "Ankle socks"));
  });

  test("Chairs holds one chair, a second replacing the first, and its button reads Change while one is worn", async ({ page }) => {
    await open(page);
    const dialog = await openDialog(page, ENSEMBLE);
    const panel = dialog.getByRole("tabpanel");
    const chairs = rowOf(panel, "Chairs");
    await wearFromRow(page, panel, "Chairs", "Executive chair");
    await expect(chairs.getByRole("button", { name: "Change Chairs" })).toHaveText("Change");
    await wearFromRow(page, panel, "Chairs", "Wooden stool", "Change");
    await expect(chairs.getByRole("button", { name: /^Remove / })).toHaveCount(1);
    await expect(chairs.getByRole("button", { name: "Remove Wooden stool" })).toBeVisible();
    await expect(dockLine(dialog, SUM_LINE)).toHaveText(sumOf("Wooden stool"));

    // A chair found by the search replaces the chair worn too.
    await panel.getByPlaceholder("Search garments…").fill("office");
    await panel.getByRole("option", { name: /^Standard office chair/ }).click();
    await expect(chairs.getByRole("button", { name: /^Remove / })).toHaveCount(1);
    await expect(chairs.getByRole("button", { name: "Remove Standard office chair" })).toBeVisible();

    await chairs.getByRole("button", { name: "Remove Standard office chair" }).click();
    await expect(chairs.getByRole("button", { name: "Add Chairs" })).toHaveText("Add");
  });

  test("Clear is disabled with nothing worn and empties every row", async ({ page }) => {
    await open(page);
    const dialog = await openDialog(page, ENSEMBLE);
    const panel = dialog.getByRole("tabpanel");
    const clear = panel.getByRole("button", { name: "Clear" });
    await expect(clear).toBeDisabled();
    await wearFromRow(page, panel, "Underwear", "T-shirt");
    await wearFromRow(page, panel, "Chairs", "Metal chair");
    await expect(clear).toBeEnabled();
    await clear.click();
    await expect(panel.getByRole("button", { name: /^Remove / })).toHaveCount(0);
    await expect(clear).toBeDisabled();
    await expect(panel.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  test("Apply writes the sum into the clothing box and closes", async ({ page }) => {
    await open(page);
    const dialog = await openDialog(page, ENSEMBLE);
    const panel = dialog.getByRole("tabpanel");
    const outfit = ["Men's underwear", "Long-sleeve dress shirt", "Thick trousers", "Standard office chair"];
    await wearFromRow(page, panel, "Underwear", outfit[0]);
    await wearFromRow(page, panel, "Shirts and Blouses", outfit[1]);
    await wearFromRow(page, panel, "Trousers and Coveralls", outfit[2]);
    await wearFromRow(page, panel, "Chairs", outfit[3]);
    await expect(dockLine(dialog, CLOTHING_LINE)).toHaveText(`0.5 → ${sumOf(...outfit)}`);
    await panel.getByRole("button", { name: "Apply" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("spinbutton", { name: /^Clothing insulation/ })).toHaveValue(sumOf(...outfit));
  });

  test("scrolls nothing at 1440 × 900 with three slots chosen and a garment in every row", async ({ page }) => {
    await open(page);
    await compareThreeSlots(page);
    const dialog = await openDialog(page, ENSEMBLE);
    const panel = dialog.getByRole("tabpanel");
    for (const name of ["Input 2", "Input 3"]) {
      await panel.getByRole("checkbox", { name }).click();
    }
    for (const { group, garments } of CLO_INDIVIDUAL_GARMENT_GROUPS) {
      await wearFromRow(page, panel, group, garments[0]);
    }
    const settings = panel.locator(".calculator-settings");
    expect(await settings.evaluate((region) => region.scrollHeight - region.clientHeight)).toBeLessThanOrEqual(0);
  });

  test("keeps what is worn across models, and a reload starts it empty", async ({ page }) => {
    await open(page);
    let dialog = await openDialog(page, ENSEMBLE);
    await wearFromRow(page, dialog.getByRole("tabpanel"), "Footwear", "Boots");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    const standards = page.getByRole("navigation").getByRole("group", { name: "Standard" });
    await standards.getByRole("link", { name: "ISO 7730" }).click();
    await expect(page).toHaveURL((url) => url.pathname === ISO_ADDRESS);
    dialog = await openDialog(page);
    await expect(dialog.getByRole("button", { name: "Remove Boots" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.reload();
    dialog = await openDialog(page);
    await expect(dialog.getByRole("button", { name: /^Remove / })).toHaveCount(0);
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

test.describe("Apply to, under Compare", () => {
  const increase = increaseAt(0);
  const mrtLine = (slotName: string) => `Mean radiant temperature, ${slotName} (°C)`;

  test("lists the enabled slots with Input 1 checked, a dock line per checked slot read from that slot, and is not remembered", async ({ page }) => {
    await open(page);
    // With Compare off there is no Apply to, and the dock's line names no slot.
    let dialog = await openDialog(page, SOLAR);
    await expect(dialog.getByText("Apply to")).toHaveCount(0);
    await expect(dockLine(dialog, MRT_LINE)).toBeVisible();
    await page.keyboard.press("Escape");

    await compareThreeSlots(page);
    await mrtOf(page, "Input 2").fill("30");

    dialog = await openDialog(page, SOLAR);
    let panel = dialog.getByRole("tabpanel");
    const applyTo = panel.getByRole("group", { name: "Apply to" });
    await expect(applyTo.getByRole("checkbox")).toHaveCount(3);
    for (const [name, checked] of [["Input 1", true], ["Input 2", false], ["Input 3", false]] as const) {
      await expect(applyTo.getByRole("checkbox", { name })).toHaveAttribute("aria-checked", String(checked));
    }
    await expect(dockLine(dialog, mrtLine("Input 1"))).toContainText(`25 → ${formatNumber(25 + increase)}`);
    await expect(dockLine(dialog, mrtLine("Input 2"))).toHaveCount(0);
    await expect(dockLine(dialog, MRT_LINE)).toHaveCount(0);

    await applyTo.getByRole("checkbox", { name: "Input 2" }).click();
    await expect(dockLine(dialog, mrtLine("Input 2"))).toContainText(`30 → ${formatNumber(30 + increase)}`);

    await page.keyboard.press("Escape");
    dialog = await openDialog(page);
    panel = dialog.getByRole("tabpanel");
    await expect(panel.getByRole("checkbox", { name: "Input 1" })).toHaveAttribute("aria-checked", "true");
    await expect(panel.getByRole("checkbox", { name: "Input 2" })).toHaveAttribute("aria-checked", "false");
  });

  test("one Apply writes every checked slot and closes, the unchecked slot unchanged", async ({ page }) => {
    await open(page);
    await compareThreeSlots(page);
    const dialog = await openDialog(page, SOLAR);
    await dialog.getByRole("tabpanel").getByRole("checkbox", { name: "Input 3" }).click();
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(mrtOf(page, "Input 1")).toHaveValue(formatNumber(25 + increase));
    await expect(mrtOf(page, "Input 2")).toHaveValue("25");
    await expect(mrtOf(page, "Input 3")).toHaveValue(formatNumber(25 + increase));
  });

  test("offers no disabled slot, and with no slot checked, Apply is disabled", async ({ page }) => {
    await open(page);
    // Compare enables slot 2 on first use; slot 3 stays disabled.
    await page.getByRole("button", { name: "Compare", exact: true }).click();
    const dialog = await openDialog(page, SOLAR);
    const panel = dialog.getByRole("tabpanel");
    await expect(panel.getByRole("checkbox")).toHaveCount(2);
    await expect(panel.getByRole("checkbox", { name: "Input 3" })).toHaveCount(0);
    await panel.getByRole("checkbox", { name: "Input 1" }).click();
    await expect(panel.getByRole("button", { name: "Apply" })).toBeDisabled();
    await panel.getByRole("checkbox", { name: "Input 2" }).click();
    await expect(panel.getByRole("button", { name: "Apply" })).toBeEnabled();
  });

  test("is reached by the keyboard after the settings and before Apply", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Compare", exact: true }).click();
    const dialog = await openDialog(page, CLOTHING);
    const panel = dialog.getByRole("tabpanel");
    await dialog.getByRole("tab", { name: CLOTHING }).focus();
    const order = [
      panel,
      panel.getByRole("spinbutton", { name: OUTDOOR_TEMPERATURE }),
      panel.getByRole("checkbox", { name: "Input 1" }),
      panel.getByRole("checkbox", { name: "Input 2" }),
      panel.getByRole("button", { name: "Apply" }),
    ];
    for (const next of order) {
      await page.keyboard.press("Tab");
      await expect(next).toBeFocused();
    }
  });

  test("on Explore with the session's Compare on, there is no Apply to and the dock's line names no slot", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Compare", exact: true }).click();
    await open(page, EXPLORE_ADDRESS);
    const dialog = await openDialog(page, SOLAR);
    await expect(dialog.getByText("Apply to")).toHaveCount(0);
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);
    await expect(dockLine(dialog, MRT_LINE)).toContainText(`25 → ${formatNumber(25 + increase)}`);
  });
});
