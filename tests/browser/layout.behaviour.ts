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
/** The default model's Standard page, where the header's mark goes. */
const DEFAULT_ADDRESS = "/standard/iso-7730/pmv-ppd-iso";

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

    const compare = page.getByRole("button", { name: "Compare", exact: true });
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

  await expect(page.getByRole("group", { name: "Session" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle Sidebar" })).toHaveCount(0);
  expect((await boxOf(page.getByRole("main"))).x).toBeGreaterThan(0);
});

test("below 768 px, the sidebar is a sheet that its trigger in the header opens and Escape closes", async ({ page }) => {
  await openStandard(page, 767);
  const trigger = page.getByRole("banner").getByRole("button", { name: "Toggle Sidebar" });
  const sheet = page.getByRole("dialog", { name: "Sidebar" });

  expect((await boxOf(page.getByRole("main"))).x).toBe(0);
  await expect(page.getByRole("group", { name: "Session" })).toHaveCount(0);
  expect((await boxOf(trigger)).x).toBeLessThan(
    (await boxOf(page.getByRole("link", { name: "Center for the Built Environment" }).first())).x,
  );

  // The trigger is the page's first stop by keyboard.
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("group", { name: "Session" })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Explore" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("a row's Presets is the word at the box's end, and its list's values end at one x", async ({ page }) => {
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
  // Where each value's text ends, not its box: the box may run past its digits.
  const rightEdges = await list
    .getByRole("option")
    .locator(".item-value")
    .evaluateAll((values) =>
      values.map((value) => {
        const text = document.createRange();
        text.selectNodeContents(value);
        return Math.round(text.getBoundingClientRect().right);
      }),
    );
  expect(rightEdges.length).toBeGreaterThan(1);
  expect(new Set(rightEdges).size).toBe(1);
});

test("under Compare with three slots, a row's Presets is the list icon saying the word in a tooltip, and no value beside it is clipped", async ({ page }) => {
  await openStandard(page, 1440);
  await page.getByRole("button", { name: "Compare", exact: true }).click();
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

  test("on PMV (ASHRAE 55), a click switches to the default model with a value inside both models' bounds kept", async ({ page }) => {
    await openStandard(page, 1440);
    await dryBulb(page).fill("26");

    await mark(page).click();

    await expect(page).toHaveURL((url) => url.pathname === DEFAULT_ADDRESS);
    await expect(dryBulb(page)).toHaveValue("26");
  });

  test("on PMV (ASHRAE 55), with a dry-bulb temperature past the default model's bound, a click asks, and No leaves everything as it was", async ({ page }) => {
    await openStandard(page, 1440);
    await dryBulb(page).fill("32");
    const question = page.getByRole("dialog");

    await mark(page).click();
    await expect(question).toBeVisible();
    await question.getByRole("button", { name: /^No/ }).click();

    await expect(question).toBeHidden();
    await expect(page).toHaveURL((url) => url.pathname === PMV_ADDRESS);
    await expect(dryBulb(page)).toHaveValue("32");
  });
});
