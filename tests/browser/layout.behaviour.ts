import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The page answers the window intrinsically (ADR-0002 decision 73, rule 10):
 * at one width, a click moves no region and not the plot; the legend stands
 * beside the plot while the room there holds its basis; the input card goes
 * above the others below the two-column threshold; the sidebar is the
 * primitive's sheet below `md`. Geometry is read off the page and compared
 * with itself before and after a click; nothing is a screenshot.
 */

/** ASHRAE 55's two models: PMV has a chart of both types, and a switch from Adaptive can ask. */
const PMV_ADDRESS = "/standard/ashrae-55/pmv-ppd-ashrae";
const ADAPTIVE_ADDRESS = "/standard/ashrae-55/adaptive-ashrae";
/** The default model's Standard page, where the header's mark goes: PMV (ASHRAE 55)'s. */
const DEFAULT_ADDRESS = PMV_ADDRESS;
/** PMV (ISO 7730), whose bounds the default model's do not all contain: metabolic rate from 0.8 met, not 1. */
const ISO_ADDRESS = "/standard/iso-7730/pmv-ppd-iso";
/** Explore, whose model select offers every registered model. */
const EXPLORE_ADDRESS = "/explore/pmv-ppd-ashrae";

/** A box as the test compares it: where it starts and how wide it is, its height being its content's. */
interface Box {
  x: number;
  y: number;
  width: number;
}

/** The five regions, the plot and the legend. */
interface Boxes {
  header: Box;
  sidebar: Box;
  inputs: Box;
  results: Box;
  footer: Box;
  plot: Box & { height: number };
  legend: Box & { height: number };
}

function card(page: Page, heading: string) {
  return page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: heading, exact: true }) });
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error(`${locator} has no box`);
  }
  return box;
}

async function boxes(page: Page): Promise<Boxes> {
  const region = async (locator: Locator) => {
    const { x, y, width } = await boxOf(locator);
    return { x, y, width };
  };
  return {
    header: await region(page.getByRole("banner")),
    sidebar: await region(page.locator('[data-slot="sidebar-content"]').locator("..")),
    inputs: await region(card(page, "Inputs")),
    // The result column: the Results card and the Chart card under it.
    results: await region(card(page, "Results").locator("..")),
    footer: await region(page.getByRole("contentinfo")),
    plot: await boxOf(page.locator(".chart-plot")),
    legend: await boxOf(page.locator(".chart-legend")),
  };
}

/**
 * What a click must leave in place: every region's start and width, the
 * footer's apart from its height on the page, which follows the content's;
 * the plot's start and size. Compare may move the plot down, by the Results
 * card's new rows (the user's call, `.scratch/shell/issues/09-…md`
 * Comments), so its check leaves the plot's `y` out.
 */
function inPlace({ header, sidebar, inputs, results, footer, plot }: Boxes, plotMayDrop = false) {
  return {
    header,
    sidebar,
    inputs,
    results,
    footer: { x: footer.x, width: footer.width },
    plot: { x: plot.x, width: plot.width, height: plot.height, ...(plotMayDrop ? {} : { y: plot.y }) },
  };
}

/** Whether the legend is a column to the plot's right, at the plot's height. */
function isLegendBesidePlot({ plot, legend }: Boxes) {
  return legend.x >= plot.x + plot.width && legend.y < plot.y + plot.height && legend.y + legend.height > plot.y;
}

async function openStandard(page: Page, width: number, address = PMV_ADDRESS) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(address);
  await expect(page.locator(".chart-plot svg").first()).toBeVisible();
}

/**
 * Records the boxes as they are, with the legend beside the plot; the check
 * it returns runs a click, which waits for its own effect, and expects the
 * page to settle with every held box where it was and the legend still
 * beside the plot.
 */
async function holdBoxes(page: Page) {
  const before = await boxes(page);
  expect(isLegendBesidePlot(before)).toBe(true);
  return async (click: () => Promise<void>, plotMayDrop = false) => {
    await click();
    await expect.poll(async () => inPlace(await boxes(page), plotMayDrop)).toEqual(inPlace(before, plotMayDrop));
    expect(isLegendBesidePlot(await boxes(page))).toBe(true);
  };
}

for (const width of [1440, 1366]) {
  test(`at ${width} px, on PMV in two columns, no click moves a region, only Compare moves the plot down, and the legend stays beside it`, async ({ page }) => {
    await openStandard(page, width);
    const inputs = await boxOf(card(page, "Inputs"));
    expect(inputs.x + inputs.width).toBeLessThanOrEqual((await boxOf(card(page, "Results"))).x);
    const expectInPlace = await holdBoxes(page);

    const compare = page.getByRole("switch", { name: "Compare", exact: true });
    await expectInPlace(async () => {
      await compare.click();
      await expect(page.getByRole("row", { name: /^Input 2/ })).toBeVisible();
    }, true);
    await expectInPlace(async () => {
      await compare.click();
      await expect(page.getByRole("row", { name: /^Input 2/ })).toHaveCount(0);
    });

    const menu = page.getByRole("menu");
    await expectInPlace(async () => {
      await page.getByRole("button", { name: "Humidity", exact: true }).click();
      await expect(menu).toBeVisible();
    });
    await expectInPlace(async () => {
      await menu.getByRole("menuitemradio", { checked: false }).first().click();
      await expect(menu).toBeHidden();
    });

    const exportDialog = page.getByRole("dialog");
    await expectInPlace(async () => {
      await page.getByRole("button", { name: "Export image" }).click();
      await expect(exportDialog).toBeVisible();
    });
    await expectInPlace(async () => {
      await page.keyboard.press("Escape");
      await expect(exportDialog).toBeHidden();
    });

    // A clipboard that refuses raises the notice line's copyRefused.
    await page.evaluate(() => {
      navigator.clipboard.writeText = () => Promise.reject(new Error("Refused for the test"));
    });
    const notice = page.getByRole("banner").getByRole("status");
    await expectInPlace(async () => {
      await page.getByRole("button", { name: "Copy link" }).click();
      await expect(notice).not.toBeEmpty();
    });
    await expectInPlace(async () => {
      await notice.getByRole("button", { name: "Close" }).click();
      await expect(notice).toBeEmpty();
    });

    const chartType = (name: string) => page.getByRole("group", { name: "Chart type" }).getByRole("radio", { name });
    await expectInPlace(async () => {
      await chartType("Dynamic").click();
      await expect(page.getByLabel("X axis")).toBeVisible();
    });
    await expectInPlace(async () => {
      await chartType("Psychrometric").click();
      await expect(page.getByLabel("X axis")).toHaveCount(0);
    });
  });

  test(`at ${width} px, the switch question opens and closes moving no region or the plot`, async ({ page }) => {
    await openStandard(page, width, ADAPTIVE_ADDRESS);
    // 2 m/s is Adaptive's top; PMV's bound at the default metabolic rate is lower, so the switch asks.
    await page.getByRole("spinbutton", { name: /^Air speed/ }).fill("2");
    const expectInPlace = await holdBoxes(page);
    const question = page.getByRole("dialog");

    await expectInPlace(async () => {
      await page.getByRole("button", { name: "Model", exact: true }).click();
      await expect(page.getByRole("option", { name: /^PMV/ })).toBeVisible();
    });
    await expectInPlace(async () => {
      await page.getByRole("option", { name: /^PMV/ }).click();
      await expect(question).toBeVisible();
    });
    await expectInPlace(async () => {
      await question.getByRole("button", { name: /^No/ }).click();
      await expect(question).toBeHidden();
    });
  });
}

for (const width of [1280, 1024]) {
  test(`at ${width} px, the input card is above the result card and the legend beside the plot`, async ({ page }) => {
    await openStandard(page, width);
    const inputs = await boxOf(card(page, "Inputs"));
    const results = await boxOf(card(page, "Results"));

    expect(inputs.y + inputs.height).toBeLessThanOrEqual(results.y);
    expect(isLegendBesidePlot(await boxes(page))).toBe(true);
  });
}

/**
 * Wider than the content needs, the page stops growing: the sidebar and the
 * main grid are one frame, as wide as at 1440 px and centred in the window,
 * and the header's and footer's contents stand in it, while their bands run
 * the window's width (decision 73, rule 10 as revised again 2026-10-12). The
 * frame's width is read at 1440 px rather than restated.
 */
async function frame(page: Page, width: number) {
  const banner = page.getByRole("banner");
  const footer = page.getByRole("contentinfo");
  const frameStart = (await boxOf(page.locator('[data-slot="sidebar-content"]').locator(".."))).x;
  const grid = await boxOf(card(page, "Inputs").locator(".."));
  const frameEnd = grid.x + grid.width;
  const fromStart = async (locator: Locator) => (await boxOf(locator)).x - frameStart;
  const toEnd = async (locator: Locator) => {
    const box = await boxOf(locator);
    return frameEnd - (box.x + box.width);
  };
  return {
    margins: { start: frameStart, end: width - frameEnd },
    /** The frame's width and how far inside it each band's first and last item stands. */
    inside: {
      width: frameEnd - frameStart,
      markFromStart: await fromStart(banner.getByRole("link", { name: "Center for the Built Environment" })),
      documentationToEnd: await toEnd(banner.getByRole("link", { name: "Documentation" })),
      footerTextFromStart: await fromStart(footer.locator("p").first()),
      footerMarksToEnd: await toEnd(footer.getByRole("link", { name: "University of California, Berkeley" })),
    },
  };
}

for (const width of [1920, 2560]) {
  test(`at ${width} px, the sidebar, the main grid and the bands' contents are the 1440 px frame centred in the window, the legend beside the plot`, async ({ page }) => {
    await openStandard(page, 1440);
    const at1440 = await frame(page, 1440);

    await openStandard(page, width);
    const { margins, inside } = await frame(page, width);

    expect(inside).toEqual(at1440.inside);
    expect(margins.start).toBe(margins.end);
    expect(isLegendBesidePlot(await boxes(page))).toBe(true);
  });
}

for (const width of [2560, 1920, 1440, 1366, 1280, 1024, 768, 767]) {
  test(`at ${width} px, the header and footer bands span the window`, async ({ page }) => {
    await openStandard(page, width);

    for (const band of [page.getByRole("banner"), page.getByRole("contentinfo")]) {
      expect(await boxOf(band)).toMatchObject({ x: 0, width });
    }
  });
}

test("at 768 px, the sidebar is fixed and the header has no trigger", async ({ page }) => {
  await openStandard(page, 768);

  await expect(page.getByRole("group", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle Sidebar" })).toHaveCount(0);
  expect((await boxOf(page.getByRole("main"))).x).toBeGreaterThan(0);
});

test("below 768 px, the sidebar is a sheet that its trigger in the header opens and Escape closes", async ({ page }) => {
  await openStandard(page, 767);
  const trigger = page.getByRole("banner").getByRole("button", { name: "Toggle Sidebar" });
  const sheet = page.getByRole("dialog", { name: "Sidebar" });

  expect((await boxOf(page.getByRole("main"))).x).toBe(0);
  await expect(page.getByRole("group", { name: "Settings" })).toHaveCount(0);
  expect((await boxOf(trigger)).x).toBeLessThan(
    (await boxOf(page.getByRole("link", { name: "Center for the Built Environment" }).first())).x,
  );

  // The trigger is the page's first stop by keyboard.
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("group", { name: "Settings" })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Explore" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("at 1440 px, the sidebar's Standard items read ASHRAE 55 then ISO 7730, the registry's order", async ({ page }) => {
  await openStandard(page, 1440);

  await expect(page.getByRole("navigation").getByRole("group", { name: "Standard" }).getByRole("link")).toHaveText([
    "ASHRAE 55",
    "ISO 7730",
  ]);
});

test("at 1440 px, Explore's model select lists its models under ASHRAE 55, ISO 7730 and Other, Heat Index under the last", async ({ page }) => {
  await openStandard(page, 1440, EXPLORE_ADDRESS);
  await page.getByRole("button", { name: "Model", exact: true }).click();
  const list = page.getByRole("listbox");

  await expect(list.locator('[data-slot="select-group-heading"]')).toHaveText(["ASHRAE 55", "ISO 7730", "Other"]);
  // The heading names its group, as a screen reader announces it.
  await expect(list.getByRole("group", { name: "Other" }).getByRole("option")).toHaveText(["Heat Index (Rothfusz)"]);
});

test("at 1440 px, the Standard page's model select lists its models under no heading", async ({ page }) => {
  await openStandard(page, 1440);
  await page.getByRole("button", { name: "Model", exact: true }).click();
  const list = page.getByRole("listbox");

  await expect(list.getByRole("option")).toHaveCount(2);
  await expect(list.locator('[data-slot="select-group-heading"]')).toHaveCount(0);
});

/**
 * A slot is named only on the Standard page while Compare is on (ADR-0002
 * decision 50): the result table's Input column with each row's name and
 * swatch, the legend's marker entries by name, and the switch question's slot
 * column come and go together.
 */
test.describe("the slots' names", () => {
  const resultTable = (page: Page) => card(page, "Results").getByRole("table");
  const inputColumn = (page: Page) => resultTable(page).getByRole("columnheader", { name: "Input", exact: true });
  const markerEntries = (page: Page) => page.locator(".chart-legend li").filter({ has: page.locator(".swatch-marker") });

  async function expectUnnamed(page: Page) {
    await expect(inputColumn(page)).toHaveCount(0);
    await expect(resultTable(page).getByRole("row", { name: /^Input 1/ })).toHaveCount(0);
    await expect(markerEntries(page)).toHaveText(["Input"]);
  }

  test("at 1440 px, appear with Compare and go with it", async ({ page }) => {
    await openStandard(page, 1440);
    await expectUnnamed(page);

    const compare = page.getByRole("switch", { name: "Compare", exact: true });
    await compare.click();
    await expect(inputColumn(page)).toHaveCount(1);
    for (const name of ["Input 1", "Input 2"]) {
      await expect(resultTable(page).getByRole("row", { name: new RegExp(`^${name}`) }).locator(".swatch-marker")).toHaveCount(1);
    }
    await expect(markerEntries(page)).toHaveText(["Input 1", "Input 2"]);

    await compare.click();
    await expectUnnamed(page);
  });

  test("at 1440 px, are absent on Explore while the session's Compare is on", async ({ page }) => {
    await openStandard(page, 1440);
    await page.getByRole("switch", { name: "Compare", exact: true }).click();
    await expect(markerEntries(page)).toHaveText(["Input 1", "Input 2"]);

    await openStandard(page, 1440, EXPLORE_ADDRESS);
    await expectUnnamed(page);

    // The tab kept the session, Compare on, and Standard names its slots again.
    await openStandard(page, 1440);
    await expect(page.getByRole("switch", { name: "Compare", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(markerEntries(page)).toHaveText(["Input 1", "Input 2"]);
  });

  test("at 1440 px, name the switch question's slot column with Compare on, slots 2 and 3 disabled too, and none with it off", async ({ page }) => {
    const question = page.getByRole("dialog");
    // 2 m/s is Adaptive's top; PMV's bound at the default metabolic rate is lower, so the switch asks.
    async function askSwitch(airSpeed: Locator) {
      await airSpeed.fill("2");
      await page.getByRole("button", { name: "Model", exact: true }).click();
      await page.getByRole("option", { name: /^PMV/ }).click();
      await expect(question).toBeVisible();
    }
    async function decline() {
      await question.getByRole("button", { name: /^No/ }).click();
      await expect(question).toBeHidden();
    }

    await openStandard(page, 1440, ADAPTIVE_ADDRESS);
    await askSwitch(page.getByRole("spinbutton", { name: /^Air speed/ }));
    await expect(question.getByRole("columnheader")).toHaveCount(3);
    await expect(question.getByRole("cell", { name: /^Input \d$/ })).toHaveCount(0);
    await decline();

    // Compare enables slot 2 on first use; slot 3 stays disabled.
    await page.getByRole("switch", { name: "Compare", exact: true }).click();
    await page.getByRole("spinbutton", { name: /^Air speed.*, Input 2$/ }).fill("2");
    await askSwitch(page.getByRole("spinbutton", { name: /^Air speed.*, Input 1$/ }));
    await expect(question.getByRole("columnheader")).toHaveCount(4);
    await expect(question.getByRole("cell", { name: /^Input \d$/ })).toHaveText(["Input 1", "Input 2"]);
    await decline();

    const slot2 = page.getByRole("button", { name: "Input 2", exact: true });
    await slot2.click();
    await expect(slot2).toHaveAttribute("aria-pressed", "false");
    await askSwitch(page.getByRole("spinbutton", { name: /^Air speed.*, Input 1$/ }));
    await expect(question.getByRole("columnheader")).toHaveCount(4);
    await expect(question.getByRole("cell", { name: /^Input \d$/ })).toHaveText(["Input 1"]);
    await decline();
  });
});

/**
 * A control by the question it answers (ADR-0002 decision 76): a setting on
 * or off at once is a switch, Compare in the Inputs heading row and a model's
 * option under the row it qualifies; every checkbox's and switch's edge holds
 * 3:1 against the paper; the sidebar's settings are headed "Settings".
 */
test.describe("controls by their question", () => {
  const OPTION = "Occupants have local control of the air speed";
  const compareSwitch = (page: Page) => page.getByRole("switch", { name: "Compare", exact: true });

  /**
   * WCAG 2.1's contrast ratio of an element's top border colour against white, the paper, the colour laid on the
   * paper by its alpha first, so a transparent edge reads as the paper's and not as black.
   */
  async function edgeContrast(control: Locator) {
    return control.evaluate((element) => {
      const [r, g, b, alpha = 1] = getComputedStyle(element).borderTopColor.match(/\d+(\.\d+)?/g)!.map(Number);
      const linear = (channel: number) => {
        const c = (alpha * channel + (1 - alpha) * 255) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
      return 1.05 / (luminance + 0.05);
    });
  }

  test("at 1440 px, Compare is a switch at the Inputs heading row's right end, one place on every Standard model; every heading row is at least 1.75rem and the Inputs and Results titles are level", async ({ page }) => {
    const places = [];
    for (const address of [PMV_ADDRESS, ADAPTIVE_ADDRESS, ISO_ADDRESS]) {
      await openStandard(page, 1440, address);
      const header = card(page, "Inputs").locator('[data-slot="card-header"]');
      const compare = header.getByRole("switch", { name: "Compare", exact: true });
      const label = header.getByText("Compare", { exact: true });
      const title = await boxOf(header.getByRole("heading", { name: "Inputs", exact: true }));
      const switchBox = await boxOf(compare);
      const labelBox = await boxOf(label);

      // The label after its switch, at the row's end, the title at its start.
      expect(switchBox.x).toBeGreaterThan(title.x + title.width);
      expect(labelBox.x).toBeGreaterThan(switchBox.x);
      const contentEnd = await header.evaluate((element) => {
        const { right } = element.getBoundingClientRect();
        return right - parseFloat(getComputedStyle(element).paddingRight);
      });
      expect(labelBox.x + labelBox.width).toBeCloseTo(contentEnd, 0);
      places.push({ switchBox, labelBox });

      for (const row of await page.locator('[data-slot="card-header"]').all()) {
        expect((await boxOf(row)).height).toBeGreaterThanOrEqual(28);
      }
      const results = await boxOf(card(page, "Results").getByRole("heading", { name: "Results", exact: true }));
      expect(title.y).toBe(results.y);
    }
    expect(places[1]).toEqual(places[0]);
    expect(places[2]).toEqual(places[0]);
  });

  test("at 1440 px, the Inputs card reads Model, a rule, the rows and the Input calculators button, on Standard and Explore", async ({ page }) => {
    for (const address of [PMV_ADDRESS, EXPLORE_ADDRESS]) {
      await openStandard(page, 1440, address);
      const inputs = card(page, "Inputs").locator('[data-slot="card-content"]');
      const model = await boxOf(inputs.getByRole("button", { name: "Model", exact: true }));
      const rule = await boxOf(inputs.locator('[data-slot="separator"]'));
      const firstRow = await boxOf(inputs.getByRole("spinbutton").first());
      const entry = await boxOf(inputs.getByRole("button", { name: /^Input calculators/ }));

      expect(rule.y).toBeGreaterThan(model.y + model.height);
      expect(firstRow.y).toBeGreaterThan(rule.y);
      expect(entry.y).toBeGreaterThan(firstRow.y);
    }
  });

  test("at 1440 px, the option is a switch under the air speed row at the field gap, under either air-speed mode", async ({ page }) => {
    await openStandard(page, 1440);
    const option = page.getByRole("switch", { name: OPTION, exact: true });
    const airSpeedRow = page
      .locator('[data-slot="field"]')
      .filter({ has: page.getByRole("spinbutton", { name: /^(Relative a|A)ir speed/ }) })
      .first();

    for (const mode of ["Air speed", "Relative air speed"]) {
      await expect(page.getByRole("spinbutton", { name: new RegExp(`^${mode} `) })).toBeVisible();
      const row = await boxOf(airSpeedRow);
      // The option's line: its switch and its label.
      const line = await boxOf(option.locator(".."));
      // The field gap, `--space-field`.
      expect(line.y - (row.y + row.height)).toBeCloseTo(4, 0);
      await expect(page.getByText(OPTION, { exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Air speed", exact: true }).click();
      await page.getByRole("menu").getByRole("menuitemradio", { checked: false }).first().click();
    }
  });

  test("at 1440 px, under Compare each column's switch is named by its slot, with On or Off beside it, hidden from assistive technology", async ({ page }) => {
    await openStandard(page, 1440);
    await compareSwitch(page).click();

    for (const slot of ["Input 1", "Input 2"]) {
      const option = page.getByRole("switch", { name: `${OPTION}, ${slot}`, exact: true });
      const state = option.locator("..").locator('[aria-hidden="true"]');
      await expect(option).toHaveAttribute("aria-checked", "false");
      await expect(state).toHaveText("Off");
      await option.click();
      await expect(option).toHaveAttribute("aria-checked", "true");
      await expect(state).toHaveText("On");
    }
    await expect(page.getByText(OPTION, { exact: true })).toHaveCount(1);
  });

  test("at 1440 px, an off switch's and an unchecked checkbox's edge is 3:1 against the paper, a focused switch's and a checked checkbox's the primitive's own", async ({ page }) => {
    await openStandard(page, 1440);
    expect(await edgeContrast(compareSwitch(page))).toBeGreaterThanOrEqual(3);
    expect(await edgeContrast(page.getByRole("switch", { name: OPTION, exact: true }))).toBeGreaterThanOrEqual(3);
    // Focused from the keyboard, the primitive's own edge, the ring's colour, stands; polled, as the switch's edge
    // changes by a transition.
    await page.keyboard.press("Tab");
    await compareSwitch(page).focus();
    await expect
      .poll(() =>
        compareSwitch(page).evaluate((element) => {
          const probe = document.createElement("span");
          probe.style.color = getComputedStyle(element).getPropertyValue("--ring");
          document.body.append(probe);
          const ring = getComputedStyle(probe).color;
          probe.remove();
          return element.matches(":focus-visible") && getComputedStyle(element).borderTopColor === ring;
        }),
      )
      .toBe(true);

    // Apply to under Compare: Input 1 checked, Input 2 not.
    await compareSwitch(page).click();
    await page.getByRole("button", { name: /^Input calculators/ }).click();
    const applyTo = page.getByRole("dialog").getByRole("tabpanel");
    const unchecked = applyTo.getByRole("checkbox", { name: "Input 2" });
    const checked = applyTo.getByRole("checkbox", { name: "Input 1" });
    await expect(unchecked).toHaveAttribute("aria-checked", "false");
    expect(await edgeContrast(unchecked)).toBeGreaterThanOrEqual(3);
    await expect(checked).toHaveAttribute("aria-checked", "true");
    expect(await checked.evaluate((element) => getComputedStyle(element).borderTopColor)).toBe(
      await checked.evaluate((element) => getComputedStyle(element).backgroundColor),
    );
  });

  test("at 1440 px, the sidebar's settings are headed Settings, ruled off from Copy link and Reset", async ({ page }) => {
    await openStandard(page, 1440);
    const settings = page.getByRole("group", { name: "Settings" });
    const pressure = await boxOf(settings.getByRole("spinbutton", { name: /^Atmospheric pressure/ }));
    const rule = await boxOf(settings.locator('[data-slot="separator"]'));
    const copyLink = await boxOf(settings.getByRole("button", { name: "Copy link" }));

    expect(rule.y).toBeGreaterThan(pressure.y + pressure.height);
    expect(copyLink.y).toBeGreaterThan(rule.y);
  });
});

test("a row's Presets is the word at the box's end, and its list's values end at one x, as far from the right edge as the names from the left", async ({ page }) => {
  await openStandard(page, 1440);
  const box = page
    .locator('[data-slot="input-group"]')
    .filter({ has: page.getByRole("spinbutton", { name: /^Metabolic rate/ }) });
  const presets = box.getByRole("button", { name: "Presets" });

  await expect(presets).toHaveText("Presets");
  await expect(presets.locator("svg")).toHaveCount(0);

  await presets.click();
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  // The popover zooms in; read the boxes once it stands at its size.
  await list.evaluate((element) =>
    Promise.all(element.closest('[data-slot="popover-content"]')!.getAnimations().map((animation) => animation.finished)),
  );
  // Each item's name and value as far from its two edges, read off their text, not their boxes: a box may run past
  // its text.
  const insets = await list.getByRole("option").evaluateAll((items) =>
    items.map((item) => {
      const textOf = (element: Element) => {
        const text = document.createRange();
        text.selectNodeContents(element);
        return text.getBoundingClientRect();
      };
      const edges = item.getBoundingClientRect();
      const [name, value] = item.querySelectorAll("span");
      return [Math.round(textOf(name).left - edges.left), Math.round(edges.right - textOf(value).right)];
    }),
  );
  expect(insets.length).toBeGreaterThan(1);
  expect(new Set(insets.flat()).size).toBe(1);
});

test("under Compare with three slots, a row's Presets is the list icon saying the word in a tooltip, and no value beside it is clipped", async ({ page }) => {
  await openStandard(page, 1440);
  await page.getByRole("switch", { name: "Compare", exact: true }).click();
  for (const slot of ["Input 2", "Input 3"]) {
    const toggle = page.getByRole("button", { name: slot, exact: true });
    if ((await toggle.getAttribute("aria-pressed")) !== "true") {
      await toggle.click();
    }
  }

  for (const slot of ["Input 1", "Input 2", "Input 3"]) {
    const clothing = page.getByRole("spinbutton", { name: `Clothing insulation (clo), ${slot}` });
    const presets = page
      .locator('[data-slot="input-group"]')
      .filter({ has: clothing })
      .getByRole("button", { name: `Presets, ${slot}` });
    await expect(presets).toHaveText("");
    await expect(presets.locator("svg")).toHaveCount(1);

    for (const value of ["0.57", "25.55"]) {
      await clothing.fill(value);
      expect(await clothing.evaluate((box: HTMLInputElement) => box.scrollWidth <= box.clientWidth)).toBe(true);
    }
  }

  await page.getByRole("button", { name: "Presets, Input 1" }).first().hover();
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText("Presets");
});

/**
 * The header's mark is a link to the default model's address, and a plain
 * click on it is an in-app switch as a Standard link's is (ADR-0002 decision
 * 73, rule 5): the values travel, and a value the default model cannot judge
 * is asked about.
 */
test.describe("the header's mark", () => {
  const mark = (page: Page) => page.getByRole("banner").getByRole("link", { name: "Center for the Built Environment" });
  const dryBulb = (page: Page) => page.getByRole("spinbutton", { name: /^Dry-bulb air temperature/ });
  const metabolicRate = (page: Page) => page.getByRole("spinbutton", { name: /^Metabolic rate/ });

  test("links to the default model's address, and the footer's marks to their institutions", async ({ page }) => {
    await openStandard(page, 1440);
    const footer = page.getByRole("contentinfo");

    await expect(mark(page)).toHaveAttribute("href", DEFAULT_ADDRESS);
    await expect(footer.getByRole("link", { name: "Center for the Built Environment" })).toHaveAttribute(
      "href",
      "https://cbe.berkeley.edu/",
    );
    await expect(footer.getByRole("link", { name: "University of California, Berkeley" })).toHaveAttribute(
      "href",
      "https://www.berkeley.edu/",
    );
  });

  test("on PMV (ISO 7730), a click switches to the default model with a value inside both models' bounds kept", async ({ page }) => {
    await openStandard(page, 1440, ISO_ADDRESS);
    await dryBulb(page).fill("26");

    await mark(page).click();

    await expect(page).toHaveURL((url) => url.pathname === DEFAULT_ADDRESS);
    await expect(dryBulb(page)).toHaveValue("26");
  });

  test("on PMV (ISO 7730), with a metabolic rate below the default model's bound, a click asks, and No leaves everything as it was", async ({ page }) => {
    await openStandard(page, 1440, ISO_ADDRESS);
    await metabolicRate(page).fill("0.9");
    const question = page.getByRole("dialog");

    await mark(page).click();
    await expect(question).toBeVisible();
    await question.getByRole("button", { name: /^No/ }).click();

    await expect(question).toBeHidden();
    await expect(page).toHaveURL((url) => url.pathname === ISO_ADDRESS);
    await expect(metabolicRate(page)).toHaveValue("0.9");
  });
});

/**
 * A Comfort zone is what the standard accepts (ADR-0002 decision 77, rule 1): on PMV (ASHRAE 55)'s air-speed chart,
 * switching local control of the air speed off caps the zone where the library's air-speed rule breaks, and switching
 * it on lifts the cap. The zone is read off the chart's own traces, as Plotly was handed them.
 */
test.describe("the air-speed chart's Comfort zone", () => {
  const OPTION = "Occupants have local control of the air speed";

  /**
   * The area the drawn zone fills, in the axes' units: each named filled scatter's rings, separated by `null`
   * (`ui/charts/plotlyFigure.ts`), by the shoelace formula, a hole wound opposite counting against its outer ring. The
   * cover above saturation is unnamed, and this chart draws none.
   */
  function zoneArea(page: Page): Promise<number> {
    return page.locator(".chart-plot.js-plotly-plot").evaluate((node) => {
      interface PathData {
        type: string;
        fill?: string;
        name?: string;
        x: (number | null)[];
        y: (number | null)[];
      }
      const fills = (node as unknown as { data: PathData[] }).data.filter((trace) => trace.type === "scatter" && trace.fill === "toself" && trace.name);
      let area = 0;
      for (const { x, y } of fills) {
        let start = 0;
        for (let end = 0; end <= x.length; end += 1) {
          if (end < x.length && x[end] !== null) {
            continue;
          }
          for (let index = start; index < end; index += 1) {
            const next = index + 1 < end ? index + 1 : start;
            area += (Number(x[index]) * Number(y[next]) - Number(x[next]) * Number(y[index])) / 2;
          }
          start = end + 1;
        }
      }
      return area;
    });
  }

  test("at PMV (ASHRAE 55)'s defaults, follows local control of the air speed off, on and off again", async ({ page }) => {
    await openStandard(page, 1440);
    await page.getByRole("group", { name: "Chart type" }).getByRole("radio", { name: "Dynamic" }).click();
    await expect(page.getByLabel("X axis")).toBeVisible();
    const option = page.getByRole("switch", { name: OPTION, exact: true });
    await expect(option).toHaveAttribute("aria-checked", "false");
    const capped = await zoneArea(page);
    expect(capped).toBeGreaterThan(0);

    await option.click();
    await expect.poll(() => zoneArea(page)).toBeGreaterThan(capped);

    await option.click();
    await expect.poll(() => zoneArea(page)).toBe(capped);
  });
});

test.describe("the applicability summary", () => {
  test("at 1440 px, an air speed typed out of range shows Not calculated between the Results heading and the table, the focus staying in the box, and back in range it goes", async ({ page }) => {
    await openStandard(page, 1440);
    const results = card(page, "Results");
    const summary = results.getByRole("alert");
    await expect(summary).toHaveCount(0);
    const airSpeed = page.getByRole("spinbutton", { name: /^Air speed/ });

    await airSpeed.fill("5");

    await expect(summary).toContainText("Not calculated, outside these limits:");
    await expect(summary).toContainText(/Air speed must be .* m\/s/);
    await expect(summary).toContainText("Showing the last valid result.");
    await expect(airSpeed).toBeFocused();
    const heading = await boxOf(results.getByRole("heading", { name: "Results", exact: true }));
    const alert = await boxOf(summary);
    const table = await boxOf(results.getByRole("table"));
    expect(alert.y).toBeGreaterThanOrEqual(heading.y + heading.height);
    expect(table.y).toBeGreaterThanOrEqual(alert.y + alert.height);

    await airSpeed.fill("0.1");

    await expect(summary).toHaveCount(0);
  });

  test("at 1440 px, two entries out of range over a kept result are one list under Not calculated, outside these limits:, the sentence on the result after it, every line at the heading's left edge", async ({ page }) => {
    await openStandard(page, 1440);
    const summary = card(page, "Results").getByRole("alert");

    await page.getByRole("spinbutton", { name: /^Dry-bulb air temperature/ }).fill("50");
    await page.getByRole("spinbutton", { name: /^Air speed/ }).fill("5");

    const title = summary.locator('[data-slot="alert-title"]');
    await expect(title).toHaveText("Not calculated, outside these limits:");
    const items = summary.getByRole("listitem");
    await expect(items).toHaveText([/Dry-bulb air temperature must be /, /Air speed must be /]);
    const sentence = summary.getByText("Showing the last valid result.", { exact: true });
    await expect(items.filter({ hasText: "Showing" })).toHaveCount(0);
    const left = (await boxOf(title)).x;
    for (const line of [...(await items.all()), sentence]) {
      expect((await boxOf(line)).x).toBe(left);
    }
    const list = await boxOf(summary.getByRole("list"));
    expect((await boxOf(sentence)).y).toBeGreaterThanOrEqual(list.y + list.height);
  });

  test("at 1440 px under Compare, two slots out of range are one list holding both slots' lines, a sentence on the result per slot after it", async ({ page }) => {
    await openStandard(page, 1440);
    await page.getByRole("switch", { name: "Compare", exact: true }).click();
    await expect(page.getByRole("row", { name: /^Input 2/ })).toBeVisible();
    const summary = card(page, "Results").getByRole("alert");

    for (const slot of ["Input 1", "Input 2"]) {
      await page.getByRole("spinbutton", { name: new RegExp(`^Air speed.*, ${slot}$`) }).fill("5");
    }

    await expect(summary.getByRole("list")).toHaveCount(1);
    await expect(summary.getByRole("listitem")).toHaveText([/Input 1: Air speed must be /, /Input 2: Air speed must be /]);
    const sentences = summary.getByText(/Input \d: Showing the last valid result\./);
    await expect(sentences).toHaveText(["Input 1: Showing the last valid result.", "Input 2: Showing the last valid result."]);
    // Every line and every sentence carries its slot's swatch.
    await expect(summary.locator(".swatch")).toHaveCount(4);
    const list = await boxOf(summary.getByRole("list"));
    for (const sentence of await sentences.all()) {
      expect((await boxOf(sentence)).y).toBeGreaterThanOrEqual(list.y + list.height);
    }
  });

  test("at 1440 px, PMV (ASHRAE 55) at 0.9 m/s without local control shows the ink part between the Results heading and the table, and the Inputs card holds no status alert, on Standard and Explore", async ({ page }) => {
    for (const address of [PMV_ADDRESS, EXPLORE_ADDRESS]) {
      await openStandard(page, 1440, address);
      const results = card(page, "Results");
      const summary = results.getByRole("status");
      await page.getByRole("spinbutton", { name: /^Air speed/ }).fill("0.9");

      await expect(summary, address).toContainText("Calculated, but outside these limits:");
      await expect(summary.getByRole("listitem"), address).toHaveText([/Relative air speed must be ≤ .* m\/s/]);
      // Lettered in ink, the page's text colour, its lines too: no hue and not the muted caption grey.
      const ink = await page.locator("body").evaluate((body) => getComputedStyle(body).color);
      await expect(summary.locator('[data-slot="alert-description"]'), address).toHaveCSS("color", ink);
      await expect(results.getByRole("alert"), address).toHaveCount(0);
      await expect(card(page, "Inputs").getByRole("status"), address).toHaveCount(0);
      const heading = await boxOf(results.getByRole("heading", { name: "Results", exact: true }));
      const part = await boxOf(summary);
      const table = await boxOf(results.getByRole("table"));
      expect(part.y, address).toBeGreaterThanOrEqual(heading.y + heading.height);
      expect(table.y, address).toBeGreaterThanOrEqual(part.y + part.height);
    }
  });

  test("at 1440 px, PMV (ASHRAE 55) at 0.9 m/s without local control marks the compliance dash with the icon, named, and no input row, on Standard and Explore; at the defaults no dash is marked", async ({ page }) => {
    for (const address of [PMV_ADDRESS, EXPLORE_ADDRESS]) {
      await openStandard(page, 1440, address);
      const table = card(page, "Results").getByRole("table");
      const marked = table.getByRole("cell").filter({ has: page.getByRole("img", { name: "The result is outside a limit" }) });
      await expect(table.getByRole("cell", { name: "Yes", exact: true }), address).toHaveCount(1);
      await expect(marked, address).toHaveCount(0);

      const airSpeed = page.getByRole("spinbutton", { name: /^Air speed/ });
      await airSpeed.fill("0.9");

      await expect(marked, address).toHaveCount(1);
      await expect(marked, address).toHaveText("—");
      // The icon is found where it stands, the Results card's, so none in the Inputs card is a finding.
      const icon = "svg.lucide-triangle-alert";
      await expect(card(page, "Results").locator(icon).first(), address).toBeVisible();
      await expect(card(page, "Inputs").locator(icon), address).toHaveCount(0);
      // The tab keeps its session across pages, so the next page opens at the default again only once it is typed back.
      await airSpeed.fill("0.1");
    }
  });

  test("at 1440 px under Compare, only the slot at 0.9 m/s without local control has its compliance dash marked", async ({ page }) => {
    await openStandard(page, 1440);
    await page.getByRole("switch", { name: "Compare", exact: true }).click();
    const table = card(page, "Results").getByRole("table");
    const [first, second] = [/^Input 1/, /^Input 2/].map((name) => table.getByRole("row", { name }));
    await expect(second).toBeVisible();
    const mark = page.getByRole("img", { name: "The result is outside a limit" });

    await page.getByRole("spinbutton", { name: /^Air speed.*, Input 2$/ }).fill("0.9");

    await expect(table.getByRole("cell").filter({ has: mark })).toHaveCount(1);
    await expect(second.getByRole("cell").filter({ has: mark })).toHaveText("—");
    await expect(first.getByRole("cell", { name: "Yes", exact: true })).toHaveCount(1);
  });
});

/** A slot whose Comfort zones are all empty says so under the plot (ADR-0002 decision 83, rule 1, as noted 2026-10-22). */
test.describe("the empty-zone line", () => {
  test("at 1440 px, PMV (ASHRAE 55) at 0.9 m/s without local control says under the psychrometric plot that there is no comfort zone, and at the defaults says nothing", async ({ page }) => {
    await openStandard(page, 1440);
    const chart = card(page, "Chart");
    await expect(page.getByRole("group", { name: "Chart type" }).getByRole("radio", { name: "Psychrometric" })).toHaveAttribute("aria-checked", "true");
    const line = chart.getByText("No comfort zone at these inputs.", { exact: true });
    await expect(line).toHaveCount(0);

    await page.getByRole("spinbutton", { name: /^Air speed/ }).fill("0.9");

    await expect(line).toBeVisible();
    const plot = await boxOf(chart.locator(".chart-plot"));
    expect((await boxOf(line)).y).toBeGreaterThanOrEqual(plot.y + plot.height);
  });
});
