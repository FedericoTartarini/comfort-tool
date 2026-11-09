import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * The page answers the window (ADR-0002 decision 73, rule 10): at one width,
 * a click moves no region, and the plot only down or back by a row that comes
 * or goes; the legend stands above the plot, which fills the chart card
 * (decision 89, rules 3 and 4); a desktop keeps two columns and
 * scrolls sideways where they do not fit, and a phone, the sidebar
 * primitive's check, stands the cards in one column (decision 87, rules 2 and
 * 3); the sidebar is the
 * primitive's sheet below `md`, and the header's toggle collapses it above
 * (rule 1). Geometry is read off the page and compared
 * with itself before and after a click; nothing is a screenshot.
 */

/** ASHRAE 55's two models: PMV has a chart of both types, and a switch from Adaptive can ask. */
const PMV_ADDRESS = "/standard/ashrae-55-2023/pmv-ppd-ashrae";
const ADAPTIVE_ADDRESS = "/standard/ashrae-55-2023/adaptive-ashrae";
/** The default model's Standard page, where the header's mark goes: PMV (ASHRAE 55)'s. */
const DEFAULT_ADDRESS = PMV_ADDRESS;
/** PMV (ISO 7730), whose bounds the default model's do not all contain: metabolic rate from 0.8 met, not 1. */
const ISO_ADDRESS = "/standard/iso-7730-2025/pmv-ppd-iso";
/** Explore, whose model select offers every registered model. */
const EXPLORE_ADDRESS = "/explore/pmv-ppd-ashrae";
/** PMV (ISO 7730) on Explore, which draws the same result table as Standard. */
const ISO_EXPLORE_ADDRESS = "/explore/pmv-ppd-iso";

/** The words that end a link to another site, a screen reader's alone (ADR-0002 decision 89, rule 2). */
const NEW_TAB = "(opens in a new tab)";
/** Documentation's whole accessible name, in the header and in the sheet. */
const DOCUMENTATION = `Documentation ${NEW_TAB}`;

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

/** Where an element's content starts and ends across: its box less its padding on each side. */
function contentEdgesOf(locator: Locator) {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { left: box.left + parseFloat(style.paddingLeft), right: box.right - parseFloat(style.paddingRight) };
  });
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
 * Comments), and a chart with axes by its view row (decision 89, rule 6), so
 * their checks leave the plot's `y` out.
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

/** Whether the legend is a row above the plot, from the plot's left edge and no wider than it (decision 89, rule 3). */
function isLegendAbovePlot({ plot, legend }: Pick<Boxes, "plot" | "legend">) {
  return legend.y + legend.height <= plot.y && Math.abs(legend.x - plot.x) < 0.5 && legend.width <= plot.width;
}

/** The page's width: the root's box, the window less the scrollbar's gutter. */
function pageWidth(page: Page) {
  return page.evaluate(() => document.documentElement.getBoundingClientRect().width);
}

async function openStandard(page: Page, width: number, address = PMV_ADDRESS) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(address);
  await expect(page.locator(".chart-plot svg").first()).toBeVisible();
}

/**
 * Chooses a chart type by its select and waits for the list to close: the
 * select reopened while its list is still leaving scrolls the window.
 */
async function chooseChartType(page: Page, name: string) {
  await page.getByRole("button", { name: "Chart type", exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

/**
 * Records the boxes as they are, with the legend above the plot; the check
 * it returns runs a click, which waits for its own effect, and expects the
 * page to settle with every held box where it was and the legend still
 * above the plot.
 */
async function holdBoxes(page: Page) {
  const before = await boxes(page);
  expect(isLegendAbovePlot(before)).toBe(true);
  return async (click: () => Promise<void>, plotMayDrop = false) => {
    await click();
    await expect.poll(async () => inPlace(await boxes(page), plotMayDrop)).toEqual(inPlace(before, plotMayDrop));
    expect(isLegendAbovePlot(await boxes(page))).toBe(true);
  };
}

/**
 * The scrollbar's gutter the root always keeps (decision 84, rule 12), in
 * Playwright's Chromium: the page is the window less it.
 */
const SCROLLBAR_GUTTER = 15;

/** Whether the result and chart cards stand to the input card's right, their tops level, not under it. */
async function isResultBesideInputs(page: Page) {
  const inputs = await boxOf(card(page, "Inputs"));
  const results = await boxOf(card(page, "Results"));
  return inputs.x + inputs.width <= results.x && results.y === inputs.y;
}

/**
 * Whether the page is wider than the root's box, so it scrolls sideways: the
 * box, as {@link pageWidth} reads it, since headless Chromium counts the hidden
 * scrollbar's gutter in the root's `clientWidth`.
 */
function scrollsSideways(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.getBoundingClientRect().width;
  });
}

// 1440 px, and 1280 px, the narrowest desktop width here that does not scroll sideways (a click's scroll into view
// would move every box), the plot there 533 px wide, just wider than the cap's 4:3.
for (const width of [1440, 1280]) {
  test(`at ${width} px, on PMV in two columns, no click moves a region, only Compare and Dynamic's view row move the plot down, and the legend stays above it`, async ({ page }) => {
    await openStandard(page, width);
    expect(await isResultBesideInputs(page)).toBe(true);
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
      await page.getByRole("button", { name: "Change humidity", exact: true }).click();
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

    // A clipboard that refuses raises copyRefused's toast.
    await page.evaluate(() => {
      navigator.clipboard.writeText = () => Promise.reject(new Error("Refused for the test"));
    });
    const toast = page.getByRole("region", { name: /^Notifications/ }).getByRole("listitem");
    await expectInPlace(async () => {
      await page.getByRole("button", { name: "Share" }).click();
      await expect(toast).toHaveCount(1);
    });
    await expectInPlace(async () => {
      await toast.getByRole("button", { name: "Close" }).click();
      await expect(toast).toHaveCount(0);
    });

    const psychrometricPlot = (await boxes(page)).plot;
    await expectInPlace(async () => {
      await chooseChartType(page, "Dynamic");
      await expect(page.getByLabel("X axis")).toBeVisible();
    }, true);
    expect((await boxes(page)).plot.y).toBeGreaterThan(psychrometricPlot.y);
    await expectInPlace(async () => {
      await chooseChartType(page, "Psychrometric");
      await expect(page.getByLabel("X axis")).toHaveCount(0);
    });
  });

  test(`at ${width} px, the switch question opens and closes moving no region or the plot`, async ({ page }) => {
    await openStandard(page, width);
    // PMV holds an air speed to its kind's bound alone; 3 m/s is past Adaptive's 2, so the switch asks.
    // Committed before the boxes are held: the run it gives breaks a bound, which its result row shows.
    const airSpeed = page.getByRole("spinbutton", { name: /^Air speed/ });
    await airSpeed.fill("3");
    await airSpeed.press("Enter");
    await expect(card(page, "Results").getByRole("img", { name: "Calculated, but outside these limits:" })).toBeVisible();
    const expectInPlace = await holdBoxes(page);
    const question = page.getByRole("dialog");

    await expectInPlace(async () => {
      await page.getByRole("button", { name: "Model", exact: true }).click();
      await expect(page.getByRole("option", { name: /^PMV/ })).toBeVisible();
    });
    await expectInPlace(async () => {
      await page.getByRole("option", { name: /^Adaptive/ }).click();
      await expect(question).toBeVisible();
    });
    await expectInPlace(async () => {
      await question.getByRole("button", { name: /^No/ }).click();
      await expect(question).toBeHidden();
    });
  });
}

/**
 * A desktop keeps two columns at every width (decision 87, rule 3): on a
 * laptop with the sidebar open the result and chart cards stand beside the
 * input card, and Compare moves neither card sideways.
 */
for (const width of [1366, 1280]) {
  test(`at ${width} px, the result card is beside the input card, nothing scrolls sideways, and Compare off and on move neither card sideways`, async ({ page }) => {
    await openStandard(page, width);
    expect(await isResultBesideInputs(page)).toBe(true);
    expect(await scrollsSideways(page)).toBe(false);
    const horizontalBoxes = async () => {
      const { inputs, results } = await boxes(page);
      return { inputs: { x: inputs.x, width: inputs.width }, results: { x: results.x, width: results.width } };
    };
    const off = await horizontalBoxes();

    const compare = page.getByRole("switch", { name: "Compare", exact: true });
    await compare.click();
    await expect(page.getByRole("row", { name: /^Input 2/ })).toBeVisible();
    expect(await horizontalBoxes()).toEqual(off);
    await compare.click();
    await expect(page.getByRole("row", { name: /^Input 2/ })).toHaveCount(0);
    expect(await horizontalBoxes()).toEqual(off);
  });
}

// The bands' width at 1024 px is the bands' test's below.
test("at 1024 px, the page scrolls sideways and the result and chart column is 33.5rem with the plot at its full size", async ({ page }) => {
  await openStandard(page, 1024);
  expect(await isResultBesideInputs(page)).toBe(true);
  expect(await scrollsSideways(page)).toBe(true);

  const { results, plot } = await boxes(page);
  expect(results.width).toBe(33.5 * 16);
  // The column at its least, so the plot is at 4:3 and the cap, `24rem`, tall.
  expect({ width: plot.width, height: plot.height }).toEqual({ width: 32 * 16, height: 24 * 16 });
});

/** The chart card's plot and legend boxes, and where its content starts and ends across. */
async function chartAreaOf(page: Page) {
  const chart = card(page, "Chart");
  return {
    plot: await boxOf(chart.locator(".chart-plot")),
    legend: await boxOf(chart.locator(".chart-legend")),
    content: await contentEdgesOf(chart.locator('[data-slot="card-content"]')),
  };
}

// The legend is a row above the plot, and the plot fills the chart card's content width at a height of
// `min(width × 3/4, 24rem)` (ADR-0002 decision 89, rules 3 and 4), on both pages.
for (const address of [PMV_ADDRESS, EXPLORE_ADDRESS]) {
  test(`at 1440 × 900 on ${address}, the legend stands above a plot that fills the card, 384 px tall, with the sidebar open and collapsed`, async ({ page }) => {
    await openStandard(page, 1440, address);
    const open = await chartAreaOf(page);
    expect(isLegendAbovePlot(open)).toBe(true);
    expect(open.plot.x).toBeCloseTo(open.content.left, 0);
    expect(open.plot.x + open.plot.width).toBeCloseTo(open.content.right, 0);
    expect(open.plot.height).toBe(24 * 16);

    await sidebarToggle(page).click();
    await expect.poll(async () => (await chartAreaOf(page)).plot.width).toBeGreaterThan(open.plot.width);
    const collapsed = await chartAreaOf(page);
    expect(isLegendAbovePlot(collapsed)).toBe(true);
    expect(collapsed.plot.x + collapsed.plot.width).toBeCloseTo(collapsed.content.right, 0);
    expect(collapsed.plot.height).toBe(24 * 16);
  });
}

/**
 * Where the plot's y tick labels stand against its plot area, Plotly's drag
 * surface: every one past the area's right edge, every one short of its left
 * edge, or neither.
 */
async function yTicksSideOf(page: Page) {
  const plot = page.locator(".chart-plot");
  const area = await boxOf(plot.locator(".nsewdrag"));
  const ticks = await plot.locator("g.ytick text").evaluateAll((texts) =>
    texts.map((text) => {
      const box = text.getBoundingClientRect();
      return { left: box.left, right: box.right };
    }),
  );
  expect(ticks.length).toBeGreaterThan(0);
  if (ticks.every((tick) => tick.left >= area.x + area.width)) {
    return "right";
  }
  return ticks.every((tick) => tick.right <= area.x) ? "left" : "neither";
}

// The psychrometric chart draws the humidity ratio on the right, the Dynamic chart its y axis on the left (ADR-0002
// decision 89, rule 7), on both pages.
for (const address of [PMV_ADDRESS, EXPLORE_ADDRESS]) {
  test(`at 1440 px on ${address}, the psychrometric chart's humidity-ratio ticks stand right of the plot area and the Dynamic chart's y ticks left of it`, async ({ page }) => {
    await openStandard(page, 1440, address);
    expect(await yTicksSideOf(page)).toBe("right");
    await chooseChartType(page, "Dynamic");
    await expect.poll(() => yTicksSideOf(page)).toBe("left");
  });
}

test("at 375 px, the plot fills the card at 4:3", async ({ page }) => {
  await openStandard(page, 375);
  const { plot, legend, content } = await chartAreaOf(page);
  expect(isLegendAbovePlot({ plot, legend })).toBe(true);
  expect(plot.x + plot.width).toBeCloseTo(content.right, 0);
  expect(plot.height).toBeCloseTo((plot.width * 3) / 4, 0);
});

test("at 1440 px with three compared slots, the legend wraps above the plot and every entry is in view", async ({ page }) => {
  await openStandard(page, 1440);
  const oneLine = (await chartAreaOf(page)).legend.height;
  await page.getByRole("switch", { name: "Compare", exact: true }).click();
  await page.getByRole("button", { name: "Input 3", exact: true }).click();
  await expect(page.getByRole("row", { name: /^Input 3/ })).toBeVisible();

  const area = await chartAreaOf(page);
  expect(isLegendAbovePlot(area)).toBe(true);
  expect(area.legend.height).toBeGreaterThan(oneLine);
  const entries = card(page, "Chart").locator(".chart-legend li");
  expect(await entries.count()).toBeGreaterThan(3);
  for (const entry of await entries.all()) {
    await expect(entry).toBeInViewport();
    const box = await boxOf(entry);
    expect(box.x).toBeGreaterThanOrEqual(area.legend.x);
    expect(box.x + box.width).toBeLessThanOrEqual(area.legend.x + area.legend.width + 0.5);
  }
});

/** A box in an Image's SVG, in its px from the file's top left. */
interface FileBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Where an Image's parts land, read off its SVG drawn in a page of its own. */
interface ImageParts {
  height: number;
  /** Plotly's plot area: its axes' clip, in whole px. */
  plotArea: FileBox;
  /** Plotly's legend box, padded around its rows. */
  legend: FileBox;
  /** What the legend draws: its labels and swatches. */
  legendInk: FileBox;
  yTicks: FileBox[];
  /** From the top tick label to the x axis's title, the plot area with its axes. */
  chart: FileBox;
  /** Every annotation drawn outside the plot area: the title, the Input summary and the footer, top to bottom. */
  textBlocks: FileBox[];
}

/**
 * Downloads the chart shown as an SVG Image through Export image's dialog at
 * `size`, with its default title and the Input summary and footer, or with
 * neither, and reads its parts.
 */
async function downloadedImageOf(page: Page, size: string, titleSummaryAndFooter: boolean): Promise<ImageParts> {
  await page.getByRole("button", { name: "Export image" }).click();
  const dialog = page.getByRole("dialog");
  if (!titleSummaryAndFooter) {
    await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("");
  }
  await dialog.getByRole("radio", { name: size, exact: true }).click();
  await dialog.getByRole("radio", { name: "SVG", exact: true }).click();
  await dialog.getByRole("checkbox").setChecked(titleSummaryAndFooter);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  const svg = readFileSync((await download.path())!, "utf8");
  const view = await page.context().newPage();
  try {
    await view.setContent(`<body style="margin: 0">${svg}</body>`);
    return await view.evaluate(() => {
      const boxOf = (element: Element): FileBox => {
        const { top, bottom, left, right } = element.getBoundingClientRect();
        return { top, bottom, left, right };
      };
      const boxesOf = (selector: string) => [...document.querySelectorAll(selector)].map(boxOf);
      const extentOf = (boxes: FileBox[]) => ({
        top: Math.min(...boxes.map((box) => box.top)),
        bottom: Math.max(...boxes.map((box) => box.bottom)),
        left: Math.min(...boxes.map((box) => box.left)),
        right: Math.max(...boxes.map((box) => box.right)),
      });
      const clip = document.querySelector('clipPath.axesclip[id$="xy"] rect')!;
      const [x, y, width, height] = ["x", "y", "width", "height"].map((name) => Number(clip.getAttribute(name)));
      const plotArea = { top: y, bottom: y + height, left: x, right: x + width };
      const yTicks = boxesOf("g.ytick text");
      const xTitle = boxOf(document.querySelector(".g-xtitle text")!);
      const chartTop = Math.min(plotArea.top, ...yTicks.map((tick) => tick.top));
      const textBlocks = boxesOf(".annotation-text")
        .filter((box) => box.bottom <= plotArea.top || box.top >= plotArea.bottom)
        .sort((a, b) => a.top - b.top);
      return {
        height: Number(document.querySelector("svg")!.getAttribute("height")),
        plotArea,
        legend: boxOf(document.querySelector("g.legend rect.bg")!),
        legendInk: extentOf(boxesOf("g.legend .legendtext, g.legend .legendsymbols")),
        yTicks,
        chart: { ...plotArea, top: chartTop, bottom: xTitle.bottom },
        textBlocks,
      };
    });
  } finally {
    await view.close();
  }
}

/** The most room, in px, an Image leaves over its first part and under its last: its margin, no empty band. */
const IMAGE_EDGE_ROOM = 10;

/** True where `upper` ends at or above `lower`'s top. */
function isAbove(upper: FileBox, lower: FileBox) {
  return upper.bottom <= lower.top;
}

// An Image reads, from the top, the title, the legend, the chart, then the Input summary and the footer, its plot area
// 4:3 in a single column and 16:9 in a double one, the humidity ratio on the right (ADR-0002 decision 89, rules 3, 5
// and 7).
for (const [size, ratio] of [["Single column", 4 / 3], ["Double column", 16 / 9]] as const) {
  test(`Export image's SVG at ${size}, with no title, summary or footer, is its legend over its plot area at its ratio, the humidity-ratio ticks right of it, with no empty band`, async ({ page }) => {
    await openStandard(page, 1440);
    const image = await downloadedImageOf(page, size, false);
    const { plotArea } = image;
    const width = plotArea.right - plotArea.left;
    const height = plotArea.bottom - plotArea.top;
    expect(Math.abs(height - width / ratio)).toBeLessThanOrEqual(1);
    expect(isAbove(image.legend, plotArea)).toBe(true);
    expect(image.textBlocks).toHaveLength(0);
    expect(image.legendInk.top).toBeLessThanOrEqual(IMAGE_EDGE_ROOM);
    expect(image.height - image.chart.bottom).toBeLessThanOrEqual(IMAGE_EDGE_ROOM);
    expect(image.yTicks.length).toBeGreaterThan(0);
    for (const tick of image.yTicks) {
      expect(tick.left).toBeGreaterThanOrEqual(plotArea.right);
    }
  });

  test(`Export image's SVG at ${size} with three compared slots and the Input summary stands its parts one under another, none overlapping`, async ({ page }) => {
    await openStandard(page, 1440);
    await page.getByRole("switch", { name: "Compare", exact: true }).click();
    await page.getByRole("button", { name: "Input 3", exact: true }).click();
    await expect(page.getByRole("row", { name: /^Input 3/ })).toBeVisible();
    const image = await downloadedImageOf(page, size, true);

    // The title, then the summary and the footer.
    expect(image.textBlocks).toHaveLength(3);
    const [title, summary, footer] = image.textBlocks;
    const parts = [title, image.legendInk, image.chart, summary, footer];
    for (const [upper, lower] of parts.slice(1).map((lower, index) => [parts[index], lower])) {
      expect(isAbove(upper, lower), JSON.stringify({ upper, lower })).toBe(true);
    }
    expect(title.top).toBeLessThanOrEqual(IMAGE_EDGE_ROOM);
    expect(footer.bottom).toBeLessThanOrEqual(image.height);
    expect(image.height - footer.bottom).toBeLessThanOrEqual(IMAGE_EDGE_ROOM);
  });
}

/**
 * A phone, a window under 768 px, stands the input, result and chart cards
 * in one column at the left, in that order (decision 87, rule 2); at 768 px
 * they are a desktop's two columns.
 */
for (const width of [767, 375]) {
  test(`at ${width} px, the input, result and chart cards are one column`, async ({ page }) => {
    await openStandard(page, width);
    const [inputs, results, chart] = await Promise.all(["Inputs", "Results", "Chart"].map((name) => boxOf(card(page, name))));

    expect(results.x).toBe(inputs.x);
    expect(chart.x).toBe(inputs.x);
    expect(inputs.y + inputs.height).toBeLessThanOrEqual(results.y);
    expect(results.y + results.height).toBeLessThanOrEqual(chart.y);
  });
}

/**
 * The input card has one width at every Compare state and window width, and
 * Compare moves nothing sideways (ADR-0002 decision 84, rule 12).
 */
test.describe("the input card's width", () => {
  // Playwright's headless Chromium hides its scrollbars, which then take no room (the gutter is still reserved), so
  // without the gutter Compare would move nothing there either; this test launches one that shows them.
  test("at 1600 × 960, where Compare makes the page scroll, the input card's left edge and width are the same with Compare off and on", async ({ playwright, baseURL }) => {
    const browser = await playwright.chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      // The page is about 930 px tall with Compare off and 990 px with it on, so 960 scrolls only under Compare.
      const page = await browser.newPage({ baseURL, viewport: { width: 1600, height: 960 } });
      await page.goto(PMV_ADDRESS);
      await expect(page.locator(".chart-plot svg").first()).toBeVisible();
      const scrolls = () => page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
      const inputsBox = async () => {
        const { x, width } = await boxOf(card(page, "Inputs"));
        return { x, width };
      };
      expect(await scrolls()).toBe(false);
      const off = await inputsBox();

      await page.getByRole("switch", { name: "Compare", exact: true }).click();
      await expect(page.getByRole("row", { name: /^Input 2/ })).toBeVisible();

      expect(await scrolls()).toBe(true);
      expect(await inputsBox()).toEqual(off);
    } finally {
      await browser.close();
    }
  });

  test("with Compare on and three slots, every Presets reads Presets and no four-character value beside it is cut off", async ({ page }) => {
    await openStandard(page, 1440);
    await page.getByRole("switch", { name: "Compare", exact: true }).click();
    for (const slot of ["Input 2", "Input 3"]) {
      const toggle = page.getByRole("button", { name: slot, exact: true });
      if ((await toggle.getAttribute("aria-pressed")) !== "true") {
        await toggle.click();
      }
    }

    // The rows that have presets, each with a four-character value its bound admits; clothing's `0.00` is the widest
    // such text in the box's font (the ticket's Comments). The whole number commits, and the decimals that follow
    // parse to it, so the box keeps them as typed.
    const rows = [
      { label: "Metabolic rate (met)", whole: "3" },
      { label: "Clothing insulation (clo)", whole: "0" },
    ];
    const isCut = (element: HTMLElement) => element.scrollWidth > element.clientWidth;
    for (const slot of ["Input 1", "Input 2", "Input 3"]) {
      for (const { label, whole } of rows) {
        const box = page.getByRole("spinbutton", { name: `${label}, ${slot}` });
        const presets = page
          .locator('[data-slot="input-group"]')
          .filter({ has: box })
          .getByRole("button", { name: `Presets, ${slot}` });
        await expect(presets).toHaveText("Presets");
        expect(await presets.evaluate(isCut)).toBe(false);

        await box.fill(whole);
        await box.pressSequentially(".00");
        await expect(box).toHaveValue(`${whole}.00`);
        expect(await box.evaluate(isCut)).toBe(false);
      }
    }
  });
});

/**
 * Wider than the content needs, the page stops growing: the sidebar and the
 * main grid are one frame, as wide as on a 1440 px page and centred in the
 * page, and the header's and footer's contents stand in it, while their bands
 * run the page's width (decision 73, rule 10 as revised again 2026-10-12). The
 * frame's width is read on a 1440 px page rather than restated.
 */
async function frame(page: Page) {
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
    margins: { start: frameStart, end: (await pageWidth(page)) - frameEnd },
    /** The frame's width and how far inside it each band's first and last item stands. */
    inside: {
      width: frameEnd - frameStart,
      markFromStart: await fromStart(banner.getByRole("link", { name: "Center for the Built Environment" })),
      documentationToEnd: await toEnd(banner.getByRole("link", { name: DOCUMENTATION, exact: true })),
      footerTextFromStart: await fromStart(footer.locator("p").first()),
      footerMarksToEnd: await toEnd(footer.getByRole("link", { name: "University of California, Berkeley" })),
    },
  };
}

for (const width of [1920, 2560]) {
  test(`at ${width} px, the sidebar, the main grid and the bands' contents are the 1440 px page's frame centred in the page, the legend above the plot`, async ({ page }) => {
    await openStandard(page, 1440 + SCROLLBAR_GUTTER);
    const at1440 = await frame(page);

    await openStandard(page, width);
    const { margins, inside } = await frame(page);

    expect(inside).toEqual(at1440.inside);
    expect(margins.start).toBe(margins.end);
    expect(isLegendAbovePlot(await boxes(page))).toBe(true);
  });
}

// Where the page scrolls sideways, at 1024 and 768 px, the page's scroll width is wider than the window.
for (const width of [2560, 1920, 1440, 1366, 1280, 1024, 768, 767]) {
  test(`at ${width} px, the header and footer bands span the page's scroll width`, async ({ page }) => {
    await openStandard(page, width);
    expect(await pageWidth(page)).toBe(width - SCROLLBAR_GUTTER);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);

    for (const band of [page.getByRole("banner"), page.getByRole("contentinfo")]) {
      expect(await boxOf(band)).toMatchObject({ x: 0, width: scrollWidth });
    }
  });
}

/** The header's toggle of the sidebar (decision 87, rule 1). */
function sidebarToggle(page: Page) {
  return page.getByRole("banner").getByRole("button", { name: "Sidebar", exact: true });
}

test("at 768 px, the sidebar is the column, open, as the header's toggle says, and the cards are two columns", async ({ page }) => {
  await openStandard(page, 768);

  await expect(page.getByRole("group", { name: "Settings" })).toBeVisible();
  await expect(sidebarToggle(page)).toHaveAttribute("aria-expanded", "true");
  expect((await boxOf(page.getByRole("main"))).x).toBeGreaterThan(0);
  expect(await isResultBesideInputs(page)).toBe(true);
});

test("below 768 px, the sidebar is a sheet that the header's toggle opens and Escape closes", async ({ page }) => {
  await openStandard(page, 767);
  const toggle = sidebarToggle(page);
  const sheet = page.getByRole("dialog", { name: "Sidebar" });

  expect((await boxOf(page.getByRole("main"))).x).toBe(0);
  await expect(page.getByRole("group", { name: "Settings" })).toHaveCount(0);
  expect((await boxOf(toggle)).x).toBeLessThan(
    (await boxOf(page.getByRole("link", { name: "Center for the Built Environment" }).first())).x,
  );
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  // The toggle is the page's first stop by keyboard.
  await page.keyboard.press("Tab");
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sheet).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(sheet.getByRole("group", { name: "Settings" })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Explore" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("at 375 × 800, the header's first control is the toggle, and the sheet shows the sheet primitive's Close, which closes it as Escape does", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PMV_ADDRESS);
  const toggle = sidebarToggle(page);
  const sheet = page.getByRole("dialog", { name: "Sidebar" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await page.keyboard.press("Tab");
  await expect(toggle).toBeFocused();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const close = sheet.getByRole("button", { name: "Close" });
  await expect(close).toBeVisible();

  await close.click();
  await expect(sheet).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

/**
 * On a phone the header holds the toggle, the mark and the title, which may
 * wrap to two lines inside the band, and Documentation is the sheet's last
 * Tools item; the footer's marks wrap under its text. On a desktop
 * Documentation ends the header and the footer is one row (decision 87,
 * rules 2 and 8).
 */
test.describe("the header and the footer on a phone and on a desktop", () => {
  /** The footer's text and its marks, the two items of its row. */
  async function footerParts(page: Page) {
    const footer = page.getByRole("contentinfo");
    return {
      text: await boxOf(footer.locator("p").first().locator("..")),
      marks: await boxOf(footer.getByRole("link", { name: "Center for the Built Environment" }).locator("..")),
    };
  }

  for (const width of [767, 375, 320]) {
    test(`at ${width} px, the header's controls and the title end inside the window, the title on at most two lines in the band, and Documentation is the sheet's last Tools item`, async ({ page }) => {
      await openStandard(page, width);
      const banner = page.getByRole("banner");
      const title = banner.getByRole("heading", { level: 1 });
      const inWindow = await pageWidth(page);

      await expect(banner.getByRole("link", { name: DOCUMENTATION, exact: true })).toHaveCount(0);
      for (const item of [sidebarToggle(page), banner.getByRole("link", { name: "Center for the Built Environment" }), title]) {
        const box = await boxOf(item);
        expect(box.x + box.width).toBeLessThanOrEqual(inWindow);
      }
      const band = await boxOf(banner);
      const titleBox = await boxOf(title);
      const lineHeight = await title.evaluate((heading) => parseFloat(getComputedStyle(heading).lineHeight));
      expect(titleBox.height).toBeLessThanOrEqual(2 * lineHeight);
      expect(titleBox.y).toBeGreaterThanOrEqual(band.y);
      expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(band.y + band.height);

      await sidebarToggle(page).click();
      const tools = page.getByRole("dialog", { name: "Sidebar" }).getByRole("group", { name: "Tools" }).getByRole("link");
      await expect(tools).toHaveText(["Explore", DOCUMENTATION]);
      await expect(tools.last()).toHaveAttribute("href", /\/docs\/user-guide\.md$/);
      await expect(tools.last()).not.toHaveAttribute("aria-current");
    });
  }

  for (const width of [767, 375]) {
    test(`at ${width} px, the footer's marks end inside the window`, async ({ page }) => {
      await openStandard(page, width);
      const footer = page.getByRole("contentinfo");
      const inWindow = await pageWidth(page);

      for (const name of ["Center for the Built Environment", "University of California, Berkeley"]) {
        const mark = await boxOf(footer.getByRole("link", { name }));
        expect(mark.x + mark.width).toBeLessThanOrEqual(inWindow);
      }
    });
  }

  test("at 375 px, the footer's marks stand under its text", async ({ page }) => {
    await openStandard(page, 375);
    const { text, marks } = await footerParts(page);
    expect(marks.y).toBeGreaterThanOrEqual(text.y + text.height);
  });

  for (const width of [768, 1440]) {
    test(`at ${width} px, Documentation ends the header and is not in the sidebar, and the footer is one row`, async ({ page }) => {
      await openStandard(page, width);
      const banner = await boxOf(page.getByRole("banner"));
      const documentation = await boxOf(page.getByRole("banner").getByRole("link", { name: DOCUMENTATION, exact: true }));

      // The row's end, inside the gutter.
      expect(documentation.x + documentation.width).toBe(banner.x + banner.width - 0.75 * 16);
      await expect(page.getByRole("navigation").getByRole("link", { name: DOCUMENTATION, exact: true })).toHaveCount(0);
      const { text, marks } = await footerParts(page);
      expect(marks.x).toBeGreaterThanOrEqual(text.x + text.width);
      expect(marks.y).toBeLessThan(text.y + text.height);
    });
  }
});

/**
 * A link to another site opens a new tab, and its name ends in words that
 * say so to a screen reader and take no room on the page; the app's own
 * links and the model select stay in the tab (ADR-0002 decision 89, rules 1
 * and 2). Each link is found by its whole name, which is the name check.
 */
test.describe("links to other sites", () => {
  /** The user guide's address while the rewrite is on its branch (the rewrite plan's Phase 6 item 6 moves it). */
  const USER_GUIDE = "https://github.com/FedericoTartarini/comfort-tool/blob/rewrite/v1/docs/user-guide.md";

  /** Where the link's visible content, its text or its image without the words, starts and ends. */
  function visibleEdges(link: Locator) {
    return link.evaluate((anchor, words) => {
      const boxes: DOMRect[] = [];
      const walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        if (node instanceof HTMLImageElement) {
          boxes.push(node.getBoundingClientRect());
        } else if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent ?? "";
          const shown = text.trim();
          if (shown !== "" && shown !== words) {
            const range = document.createRange();
            range.setStart(node, text.indexOf(shown));
            range.setEnd(node, text.indexOf(shown) + shown.length);
            boxes.push(range.getBoundingClientRect());
          }
        }
      }
      return { start: Math.min(...boxes.map((box) => box.left)), end: Math.max(...boxes.map((box) => box.right)) };
    }, NEW_TAB);
  }

  /** Opens a new tab, its words in a box of a pixel. */
  async function expectNewTab(link: Locator) {
    await expect(link).toHaveAttribute("target", "_blank");
    const words = await boxOf(link.getByText(NEW_TAB, { exact: true }));
    expect(words.width).toBeLessThanOrEqual(1);
    expect(words.height).toBeLessThanOrEqual(1);
  }

  /** A link whose box hugs its content, as the header's and the footer's do, is as wide as before: no space underlined after it. */
  async function expectNoRoomTaken(link: Locator) {
    const box = await boxOf(link);
    const content = await visibleEdges(link);
    expect(Math.abs(box.x - content.start)).toBeLessThan(0.5);
    expect(Math.abs(box.x + box.width - content.end)).toBeLessThan(0.5);
  }

  test("at 1440 px, Documentation in the header and the footer's five links open a new tab and say so", async ({ page }) => {
    await openStandard(page, 1440);
    const documentation = page.getByRole("banner").getByRole("link", { name: DOCUMENTATION, exact: true });
    await expect(documentation).toHaveAttribute("href", USER_GUIDE);
    await expectNewTab(documentation);
    await expectNoRoomTaken(documentation);

    const footer = page.getByRole("contentinfo");
    const names = ["Licence", "Code", "https://doi.org/10.1016/j.softx.2020.100563", "Center for the Built Environment", "University of California, Berkeley"];
    for (const name of names) {
      const link = footer.getByRole("link", { name: `${name} ${NEW_TAB}`, exact: true });
      await expectNewTab(link);
      await expectNoRoomTaken(link);
    }
  });

  test("at 375 px, Documentation in the sheet opens a new tab and says so, and the sheet's page links do not", async ({ page }) => {
    await openStandard(page, 375);
    await sidebarToggle(page).click();
    const sheet = page.getByRole("dialog", { name: "Sidebar" });
    const documentation = sheet.getByRole("link", { name: DOCUMENTATION, exact: true });

    await expect(documentation).toHaveAttribute("href", USER_GUIDE);
    await expectNewTab(documentation);
    const pageLinks = sheet.getByRole("navigation").getByRole("link").filter({ hasNot: page.getByText(NEW_TAB, { exact: true }) });
    await expect(pageLinks).not.toHaveCount(0);
    for (const link of await pageLinks.all()) {
      await expect(link).not.toHaveAttribute("target");
    }
  });

  test("at 1440 px, the model select and the sidebar's page links open in the same tab", async ({ page, context }) => {
    await openStandard(page, 1440, ISO_EXPLORE_ADDRESS);
    const navigation = page.getByRole("navigation");

    await page.getByRole("button", { name: "Model", exact: true }).click();
    await page.getByRole("option", { name: /^PMV \/ PPD \(ASHRAE 55/ }).click();
    await expect(page).toHaveURL((url) => url.pathname === EXPLORE_ADDRESS);
    await navigation.getByRole("link", { name: "ISO 7730:2025", exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === ISO_ADDRESS);
    await navigation.getByRole("link", { name: "Explore", exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === ISO_EXPLORE_ADDRESS);

    expect(context.pages()).toEqual([page]);
    for (const link of await navigation.getByRole("link").all()) {
      await expect(link).not.toHaveAttribute("target");
    }
  });
});

/**
 * The header's toggle collapses the sidebar on a desktop, and only it: one
 * state in the page frame, open at a load, kept by a page switch and by
 * Reset, in no cookie, no storage entry and no share link (ADR-0002 decision
 * 87, rule 1).
 */
test.describe("the sidebar's toggle", () => {
  const sidebar = (page: Page) => page.locator('[data-slot="sidebar-content"]');

  test("at 1440 px, the header's first control collapses the sidebar, the input card at the gutter and the result and chart cards wider, and a second click restores the page", async ({ page }) => {
    await openStandard(page, 1440);
    const toggle = sidebarToggle(page);
    await page.keyboard.press("Tab");
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const before = await boxes(page);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(sidebar(page)).toHaveCount(0);
    // The toggle stands at the header row's gutter; the input card is now as far in.
    expect((await boxOf(card(page, "Inputs"))).x).toBe((await boxOf(toggle)).x);
    expect((await boxOf(card(page, "Results").locator(".."))).width).toBeGreaterThan(before.results.width);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => boxes(page)).toEqual(before);
  });

  test("collapsed, the header's mark keeps it collapsed, Reset's yes leaves it collapsed, and a reload opens it", async ({ page }) => {
    await openStandard(page, 1440, EXPLORE_ADDRESS);
    const toggle = sidebarToggle(page);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await page.getByRole("banner").getByRole("link", { name: "Center for the Built Environment" }).click();
    await expect(page).toHaveURL((url) => url.pathname === DEFAULT_ADDRESS);
    await expect(card(page, "Inputs")).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(sidebar(page)).toHaveCount(0);

    // At a desktop width Reset stands in the sidebar; collapsed there, it is reached in the sheet.
    await page.setViewportSize({ width: 375, height: 900 });
    await toggle.click();
    await page.getByRole("dialog", { name: "Sidebar" }).getByRole("button", { name: "Reset" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Yes, reset" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(sidebar(page)).toHaveCount(0);

    await page.reload();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(sidebar(page)).toBeVisible();
  });

  test("a collapse and a reopen set no cookie, write no storage entry beyond the session's, and leave the share link as it was", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await openStandard(page, 1440);
    const share = async () => {
      await page.getByRole("group", { name: "Settings" }).getByRole("button", { name: "Share" }).click();
      return page.evaluate(() => navigator.clipboard.readText());
    };
    const stored = async () => ({
      cookies: await page.context().cookies(),
      ...(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }))),
    });
    const link = await share();
    const before = await stored();
    expect(before.cookies).toEqual([]);

    const toggle = sidebarToggle(page);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    expect(await stored()).toEqual(before);
    expect(await share()).toBe(link);
  });

  // The column reads the frame's state, not the provider's, so only the cookie shows whether the key reached it.
  test("at 1440 px, Cmd/Ctrl+B sets no cookie", async ({ page }) => {
    await openStandard(page, 1440);
    await page.keyboard.press("ControlOrMeta+b");

    expect(await page.context().cookies()).toEqual([]);
  });
});

test("at 1440 px, the sidebar's Standard items read ASHRAE 55:2023 then ISO 7730:2025, the registry's order", async ({ page }) => {
  await openStandard(page, 1440);

  await expect(page.getByRole("navigation").getByRole("group", { name: "Standard" }).getByRole("link")).toHaveText([
    "ASHRAE 55:2023",
    "ISO 7730:2025",
  ]);
});

/** A standard's route segment carries its year, and an address without one names no model (ADR-0002 decision 86, rules 2 and 5). */
test("at 1440 px, a click on the sidebar's ISO 7730:2025 puts its segment with the year in the address bar", async ({ page }) => {
  await openStandard(page, 1440);

  await page.getByRole("navigation").getByRole("group", { name: "Standard" }).getByRole("link", { name: "ISO 7730:2025" }).click();

  await expect(page).toHaveURL((url) => url.pathname === ISO_ADDRESS);
});

test("an address in the old form, without a year, opens the default model with the address corrected", async ({ page }) => {
  await openStandard(page, 1440, "/standard/iso-7730/pmv-ppd-iso");

  await expect(page).toHaveURL((url) => url.pathname === DEFAULT_ADDRESS);
  await expect(page.getByRole("button", { name: "Model", exact: true })).toHaveText("PMV / PPD (ASHRAE 55)");
});

test("at 1440 px, Explore's model select lists its models under ASHRAE 55:2023, ISO 7730:2025 and Other, Heat Index under the last", async ({ page }) => {
  await openStandard(page, 1440, EXPLORE_ADDRESS);
  await page.getByRole("button", { name: "Model", exact: true }).click();
  const list = page.getByRole("listbox");

  await expect(list.locator('[data-slot="select-group-heading"]')).toHaveText(["ASHRAE 55:2023", "ISO 7730:2025", "Other"]);
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
 * decision 50): the result table's Input heading's word and each row's name and
 * swatch, the legend's marker entries by name, and the switch question's slot
 * column come and go together. The Input column itself stays, its heading
 * named for a screen reader alone (decision 85, as amended 2026-10-28).
 */
test.describe("the slots' names", () => {
  const resultTable = (page: Page) => card(page, "Results").getByRole("table");
  const inputColumn = (page: Page) => resultTable(page).getByRole("columnheader", { name: "Input", exact: true });
  const markerEntries = (page: Page) => page.locator(".chart-legend li").filter({ has: page.locator(".swatch-marker") });

  async function expectUnnamed(page: Page) {
    await expect(inputColumn(page)).toHaveCount(1);
    // The heading's word stands in a box too small to show it.
    const word = await boxOf(inputColumn(page).getByText("Input", { exact: true }));
    expect(Math.max(word.width, word.height)).toBeLessThanOrEqual(1);
    await expect(resultTable(page).getByRole("row", { name: /^Input 1/ })).toHaveCount(0);
    await expect(resultTable(page).getByRole("cell", { name: /Input/ })).toHaveCount(0);
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

  test("at 1440 px, name the switch question's slot column by position while the session holds more than one slot, Compare on or off and slot 2 disabled too, and none while it holds one", async ({ page }) => {
    const question = page.getByRole("dialog");
    // PMV holds an air speed to its kind's bound alone; 3 m/s is past Adaptive's 2, so the switch asks.
    async function askSwitch(airSpeed: Locator) {
      await airSpeed.fill("3");
      await page.getByRole("button", { name: "Model", exact: true }).click();
      await page.getByRole("option", { name: /^Adaptive/ }).click();
      await expect(question).toBeVisible();
    }
    async function decline() {
      await question.getByRole("button", { name: /^No/ }).click();
      await expect(question).toBeHidden();
    }

    await openStandard(page, 1440);
    await askSwitch(page.getByRole("spinbutton", { name: /^Air speed/ }));
    await expect(question.getByRole("columnheader")).toHaveCount(3);
    await expect(question.getByRole("cell", { name: /^Input \d$/ })).toHaveCount(0);
    await decline();

    // Compare enables slot 2 on first use; slot 3 stays disabled.
    await page.getByRole("switch", { name: "Compare", exact: true }).click();
    await page.getByRole("spinbutton", { name: /^Air speed.*, Input 2$/ }).fill("3");
    await askSwitch(page.getByRole("spinbutton", { name: /^Air speed.*, Input 1$/ }));
    await expect(question.getByRole("columnheader")).toHaveCount(4);
    await expect(question.getByRole("cell", { name: /^Input \d$/ })).toHaveText(["Input 1", "Input 2"]);
    await decline();

    const slot2 = page.getByRole("button", { name: "Input 2", exact: true });
    await slot2.click();
    await expect(slot2).toHaveAttribute("aria-pressed", "false");
    await askSwitch(page.getByRole("spinbutton", { name: /^Air speed.*, Input 1$/ }));
    await expect(question.getByRole("columnheader")).toHaveCount(4);
    await expect(question.getByRole("cell", { name: /^Input \d$/ })).toHaveText(["Input 1", "Input 2"]);
    await decline();

    await page.getByRole("switch", { name: "Compare", exact: true }).click();
    await askSwitch(page.getByRole("spinbutton", { name: /^Air speed/ }));
    await expect(question.getByRole("columnheader")).toHaveCount(4);
    await expect(question.getByRole("cell", { name: /^Input \d$/ })).toHaveText(["Input 1", "Input 2"]);
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
      expect(labelBox.x + labelBox.width).toBeCloseTo((await contentEdgesOf(header)).right, 0);
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

  test("at 1440 px, on PMV (ASHRAE 55) every entry group's button reads Change, is named for its group, and its menu chooses a mode, Compare off and on", async ({ page }) => {
    await openStandard(page, 1440);
    for (const compareOn of [false, true]) {
      if (compareOn) {
        await compareSwitch(page).click();
        await expect(page.getByRole("row", { name: /^Input 2/ })).toBeVisible();
      }
      for (const group of ["temperature", "humidity", "air speed", "clothing"]) {
        const button = page.getByRole("button", { name: `Change ${group}`, exact: true });
        await expect(button).toHaveText("Change");

        const menu = page.getByRole("menu");
        await button.click();
        const choice = menu.getByRole("menuitemradio", { checked: false }).first();
        const chosen = (await choice.textContent()) ?? "";
        await choice.click();
        await expect(menu).toBeHidden();
        await button.click();
        await expect(menu.getByRole("menuitemradio", { checked: true })).toHaveText(chosen);
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
      }
    }
  });

  test("at 1440 px, the chart card's heading row reads Chart, the select named Chart type, then Bands on Explore and Export image at its right end; the psychrometric chart has no view row, Dynamic's axis selects stand under the heading row, and Tab follows that order, on Standard and Explore; the Model select keeps its own height", async ({ page }) => {
    for (const [address, actions] of [
      [PMV_ADDRESS, ["Export image"]],
      [EXPLORE_ADDRESS, ["Bands", "Export image"]],
    ] as const) {
      await openStandard(page, 1440, address);
      const chart = card(page, "Chart");
      const header = chart.locator('[data-slot="card-header"]');
      const chartType = header.getByRole("button", { name: "Chart type", exact: true });
      await expect(chartType).toHaveText("Psychrometric");
      const headerBox = await boxOf(header);
      const row = [
        await boxOf(header.getByRole("heading", { name: "Chart", exact: true })),
        await boxOf(chartType),
        ...(await Promise.all(actions.map((name) => boxOf(header.getByRole("button", { name, exact: true }))))),
      ];

      // One line, left to right, each control after the last; the last at the row's content end.
      for (const [index, box] of row.entries()) {
        expect(box.y + box.height / 2).toBeCloseTo(headerBox.y + headerBox.height / 2, 0);
        if (index > 0) expect(box.x).toBeGreaterThan(row[index - 1].x + row[index - 1].width);
      }
      const last = row[row.length - 1];
      expect(last.x + last.width).toBeCloseTo((await contentEdgesOf(header)).right, 0);
      expect((await boxOf(card(page, "Inputs").getByRole("button", { name: "Model", exact: true }))).height).toBeGreaterThan(row[1].height);

      // The psychrometric chart has no view row: the chart's area is the card's content's first line.
      await expect(chart.getByLabel("X axis")).toHaveCount(0);
      const content = chart.locator('[data-slot="card-content"]');
      expect((await boxOf(chart.locator(".chart-area"))).y).toBeCloseTo((await boxOf(content)).y, 0);

      await chooseChartType(page, "Dynamic");
      await expect(chartType).toHaveText("Dynamic");
      const xAxis = await boxOf(chart.getByLabel("X axis"));
      const yAxis = await boxOf(chart.getByLabel("Y axis"));
      const plot = await boxOf(chart.locator(".chart-plot"));
      for (const axis of [xAxis, yAxis]) {
        expect(axis.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
        expect(axis.y + axis.height).toBeLessThanOrEqual(plot.y);
      }
      expect(xAxis.x + xAxis.width).toBeLessThan(yAxis.x);

      // Tab: the chart type, the actions, then the axis selects.
      await chartType.focus();
      for (const name of actions) {
        await page.keyboard.press("Tab");
        await expect(header.getByRole("button", { name, exact: true })).toBeFocused();
      }
      for (const label of ["X axis", "Y axis"]) {
        await page.keyboard.press("Tab");
        await expect(chart.getByLabel(label)).toBeFocused();
      }

      await chooseChartType(page, "Psychrometric");
      await expect(chartType).toHaveText("Psychrometric");
      await expect(chart.getByLabel("X axis")).toHaveCount(0);
    }
  });

  // 768 px is the narrowest desktop (decision 87, rule 2), where the chart card is at its least width, the result
  // column's 33.5rem; at 375 px Explore's heading row no longer fits one line.
  for (const width of [768, 375]) {
    test(`at ${width} px, every control of the chart card's heading row lies inside the card's content, wrapping where it must, on Standard and Explore`, async ({ page }) => {
      for (const address of [PMV_ADDRESS, EXPLORE_ADDRESS]) {
        await openStandard(page, width, address);
        const header = card(page, "Chart").locator('[data-slot="card-header"]');
        const { left, right } = await contentEdgesOf(header);
        const controls = [header.getByRole("heading"), ...(await header.getByRole("button").all())];
        expect(controls.length).toBe(address === EXPLORE_ADDRESS ? 4 : 3);
        for (const control of controls) {
          const box = await boxOf(control);
          expect(box.x).toBeGreaterThanOrEqual(left);
          expect(box.x + box.width).toBeLessThanOrEqual(right);
        }
      }
    });
  }

  test("at 1440 px, Heat Index on Explore, with one chart type, shows a chart type select of that one option", async ({ page }) => {
    await openStandard(page, 1440, "/explore/heat-index-rothfusz");
    const chartType = card(page, "Chart").getByRole("button", { name: "Chart type", exact: true });
    await expect(chartType).toHaveText("Dynamic");
    await chartType.click();
    await expect(page.getByRole("option")).toHaveText(["Dynamic"]);
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

      await page.getByRole("button", { name: "Change air speed", exact: true }).click();
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

  test("at 1440 px, the sidebar's settings are headed Settings, ruled off from Share and Reset", async ({ page }) => {
    await openStandard(page, 1440);
    const settings = page.getByRole("group", { name: "Settings" });
    const pressure = await boxOf(settings.getByRole("spinbutton", { name: /^Atmospheric pressure/ }));
    const rule = await boxOf(settings.locator('[data-slot="separator"]'));
    const share = await boxOf(settings.getByRole("button", { name: "Share" }));

    expect(rule.y).toBeGreaterThan(pressure.y + pressure.height);
    expect(share.y).toBeGreaterThan(rule.y);
  });

  test("the sidebar's Share puts the link to the page on the clipboard and says Link copied", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await openStandard(page, 1440);
    const settings = page.getByRole("group", { name: "Settings" });
    await settings.getByRole("button", { name: "Share" }).click();

    await expect(settings.getByRole("button", { name: "Link copied" })).toBeVisible();
    const prefix = `${new URL(page.url()).origin}${PMV_ADDRESS}?share=v1.`;
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link.slice(0, prefix.length)).toBe(prefix);
  });

  test("at 1440 px, the sidebar's line above Settings starts and ends where the line inside Settings does", async ({ page }) => {
    await openStandard(page, 1440);
    const outer = await boxOf(page.locator('[data-slot="sidebar-separator"]'));
    const inner = await boxOf(page.getByRole("group", { name: "Settings" }).locator('[data-slot="separator"]'));

    expect(Math.abs(outer.x - inner.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(outer.x + outer.width - (inner.x + inner.width))).toBeLessThanOrEqual(1);
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

/**
 * The sidebar's groups are headings in the cards' title style, and every panel
 * has the one radius but the checkbox (ADR-0002 decision 87, rules 5 and 10).
 */
test.describe("the sidebar's headings and the one radius", () => {
  for (const [name, address] of [
    ["Standard", PMV_ADDRESS],
    ["Explore", EXPLORE_ADDRESS],
  ]) {
    test(`at 1440 px on ${name}, the sidebar's groups are level-two headings Standard, Tools and Settings, 14 px at 600 in ink, and the Units and Atmospheric pressure labels share one weight`, async ({ page }) => {
      await openStandard(page, 1440, address);
      const sidebar = page.locator('[data-slot="sidebar-content"]');
      const headings = sidebar.getByRole("heading", { level: 2 });

      await expect(headings).toHaveText(["Standard", "Tools", "Settings"]);
      const ink = await page.evaluate(() => getComputedStyle(document.body).color);
      for (const heading of await headings.all()) {
        expect(await heading.evaluate((element) => {
          const { fontSize, fontWeight, color } = getComputedStyle(element);
          return { fontSize, fontWeight, color };
        })).toEqual({ fontSize: "14px", fontWeight: "600", color: ink });
      }
      // The groups keep their names.
      for (const group of ["Standard", "Tools", "Settings"]) {
        await expect(sidebar.getByRole("group", { name: group, exact: true })).toHaveCount(1);
      }

      const settings = sidebar.getByRole("group", { name: "Settings" });
      const weightOf = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).fontWeight);
      expect(await weightOf(settings.getByText("Units", { exact: true }))).toBe(
        await weightOf(settings.locator('[data-slot="field-label"]').filter({ hasText: /^Atmospheric pressure/ })),
      );
    });
  }

  test("at 1440 px, Reset's dialog and a toast are rounded as a card is, and a checkbox keeps 4 px", async ({ page }) => {
    await openStandard(page, 1440);
    const radiusOf = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).borderTopLeftRadius);
    const cardRadius = await radiusOf(card(page, "Inputs"));
    expect(cardRadius).toBe("6px");

    const settings = page.getByRole("group", { name: "Settings" });
    await settings.getByRole("button", { name: "Reset" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await radiusOf(dialog)).toBe(cardRadius);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // A clipboard that refuses raises copyRefused's toast.
    await page.evaluate(() => {
      navigator.clipboard.writeText = () => Promise.reject(new Error("Refused for the test"));
    });
    await settings.getByRole("button", { name: "Share" }).click();
    const toast = page.getByRole("region", { name: /^Notifications/ }).getByRole("listitem");
    await expect(toast).toHaveCount(1);
    expect(await radiusOf(toast)).toBe(cardRadius);
    await toast.getByRole("button", { name: "Close" }).click();

    // Apply to under Compare holds the checkboxes.
    await page.getByRole("switch", { name: "Compare", exact: true }).click();
    await page.getByRole("button", { name: /^Input calculators/ }).click();
    expect(await radiusOf(page.getByRole("dialog").getByRole("checkbox", { name: "Input 1" }))).toBe("4px");
  });
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

/** A filled path's points, as Plotly was handed them: rings separated by `null`. */
interface FillPoints {
  x: (number | null)[];
  y: (number | null)[];
}

/**
 * Every Comfort zone fill the chart draws, read off its own traces as Plotly was handed them: each named filled
 * scatter (`ui/charts/plotlyFigure.ts`). The cover above saturation is unnamed, so it is not among them.
 */
function zoneFills(page: Page): Promise<FillPoints[]> {
  return page.locator(".chart-plot.js-plotly-plot").evaluate((node) => {
    interface PathData extends FillPoints {
      type: string;
      fill?: string;
      name?: string;
    }
    const traces = (node as unknown as { data: PathData[] }).data;
    return traces.filter((trace) => trace.type === "scatter" && trace.fill === "toself" && trace.name).map(({ x, y }) => ({ x, y }));
  });
}

/**
 * A Comfort zone is what the standard accepts (ADR-0002 decision 77, rule 1): on PMV (ASHRAE 55)'s air-speed chart,
 * switching local control of the air speed off caps the zone where the library's air-speed rule breaks, and switching
 * it on lifts the cap.
 */
test.describe("the air-speed chart's Comfort zone", () => {
  const OPTION = "Occupants have local control of the air speed";

  /**
   * The area the drawn zone fills, in the axes' units: each fill's rings by the shoelace formula, a hole wound
   * opposite counting against its outer ring.
   */
  async function zoneArea(page: Page): Promise<number> {
    let area = 0;
    for (const { x, y } of await zoneFills(page)) {
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
  }

  test("at PMV (ASHRAE 55)'s defaults, follows local control of the air speed off, on and off again", async ({ page }) => {
    await openStandard(page, 1440);
    await chooseChartType(page, "Dynamic");
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

/**
 * Every slot marker the chart draws, in drawing order, read off its own traces as Plotly was handed them: each
 * markers-only scatter (`ui/charts/plotlyFigure.ts`).
 */
function markerPoints(page: Page): Promise<{ x: number; y: number }[]> {
  return page.locator(".chart-plot.js-plotly-plot").evaluate((node) => {
    interface PointData {
      type: string;
      mode?: string;
      x: number[];
      y: number[];
    }
    const traces = (node as unknown as { data: PointData[] }).data;
    return traces.filter((trace) => trace.type === "scatter" && trace.mode === "markers").map(({ x, y }) => ({ x: x[0], y: y[0] }));
  });
}

/**
 * A slot first enabled starts from slot 1's values, each moved up by a share of its axis range, so its marker and its
 * Comfort zone do not lie on slot 1's, and a value the move carries past its bound is cut to it with no toast
 * (GLOSSARY.md, **Slot offset**; ADR-0002 decision 89's revision of rule 8).
 */
test.describe("compared slots that start apart", () => {
  const metabolicRate = (page: Page, slot: string) => page.getByRole("spinbutton", { name: new RegExp(`^Metabolic rate.*, ${slot}$`) });
  const toasts = (page: Page) => page.getByRole("region", { name: /^Notifications/ }).locator('li[data-sonner-toast]:not([data-removed="true"])');

  test("at 1440 px on PMV (ASHRAE 55), turning Compare on shows Input 2's metabolic rate as 1.25, two Comfort zones that are not the same, and two markers at different places on the psychrometric chart", async ({ page }) => {
    await openStandard(page, 1440);
    await expect.poll(() => zoneFills(page)).toHaveLength(1);

    await page.getByRole("switch", { name: "Compare", exact: true }).click();

    await expect(metabolicRate(page, "Input 1")).toHaveValue("1.1");
    await expect(metabolicRate(page, "Input 2")).toHaveValue("1.25");
    await expect.poll(() => zoneFills(page)).toHaveLength(2);
    const [first, second] = await zoneFills(page);
    expect(second).not.toEqual(first);
    await expect.poll(() => markerPoints(page)).toHaveLength(2);
    const [firstMarker, secondMarker] = await markerPoints(page);
    expect(secondMarker).not.toEqual(firstMarker);
  });

  test("at 1440 px on PMV (ASHRAE 55), Input 3 enabled with Input 1's metabolic rate at its upper end holds that end, and no toast appears", async ({ page }) => {
    await openStandard(page, 1440);
    await page.getByRole("switch", { name: "Compare", exact: true }).click();
    await metabolicRate(page, "Input 1").fill("4");
    await metabolicRate(page, "Input 1").press("Enter");
    await expect(metabolicRate(page, "Input 1")).toHaveValue("4");
    await expect(toasts(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Input 3", exact: true }).click();

    await expect(metabolicRate(page, "Input 3")).toHaveValue("4");
    await expect(toasts(page)).toHaveCount(0);
  });
});

/**
 * A classified output is a column of its own, first in the table, its cell its
 * band's label; no column is headed "Compliance" but a yes or no about
 * compliance (ADR-0002 decision 85, rules 1, 2 and 7).
 */
test.describe("the result table's columns", () => {
  const headings = (page: Page) => card(page, "Results").getByRole("table").getByRole("columnheader");
  /** How many lines `locator`'s text stands on: the distinct tops of its line boxes. */
  const linesOf = (locator: Locator) =>
    locator.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    });

  for (const [name, ashrae, iso] of [
    ["Standard", PMV_ADDRESS, ISO_ADDRESS],
    ["Explore", EXPLORE_ADDRESS, ISO_EXPLORE_ADDRESS],
  ] as const) {
    test(`at 1440 × 900 on ${name}, PMV (ASHRAE 55) reads Input, Thermal sensation, PMV, PPD and Compliance on one line, an empty Input cell, a Band badge reading Neutral at the defaults with no swatch beside it, and PMV (ISO 7730) Input, Thermal sensation, Category, PMV and PPD`, async ({ page }) => {
      await openStandard(page, 1440, ashrae);
      await expect(headings(page)).toHaveText(["Input", "Thermal sensation", "PMV", "PPD", "Compliance"]);
      // The Input heading shows no word with Compare off; each value heading stands on one line.
      for (const heading of (await headings(page).all()).slice(1)) {
        expect(await linesOf(heading), (await heading.textContent()) ?? undefined).toBe(1);
      }
      const cells = card(page, "Results").getByRole("table").getByRole("row").nth(1).getByRole("cell");
      await expect(cells.first()).toHaveText("");
      await expect(cells.first().getByRole("img")).toHaveCount(0);
      await expect(cells.nth(1).locator('[data-slot="badge"]')).toHaveText("Neutral");
      await expect(cells.nth(1).locator(".swatch")).toHaveCount(0);

      await openStandard(page, 1440, iso);
      await expect(headings(page)).toHaveText(["Input", "Thermal sensation", "Category", "PMV", "PPD"]);
      await expect(headings(page).filter({ hasText: "Compliance" })).toHaveCount(0);
    });
  }

  // The Input column is as wide as what it holds, the value columns share the rest (decision 85, as amended
  // 2026-10-28), and the heading row is as tall as its line and the body cells' padding, not the primitive's 40 px.
  // Explore compares slot 1 alone, so it has no Compare to turn on.
  for (const [name, address, compares] of [
    ["Standard", PMV_ADDRESS, ["off", "on"]],
    ["Explore", EXPLORE_ADDRESS, ["off"]],
  ] as const) {
    test(`at 1440 × 900 on ${name}, PMV (ASHRAE 55) at its defaults, Compare ${compares.join(" and ")}, has an Input column narrower than any value column, value columns within 1 px of one another and a one-line heading row under 40 px`, async ({ page }) => {
      await openStandard(page, 1440, address);
      for (const compare of compares) {
        if (compare === "on") {
          await page.getByRole("switch", { name: "Compare", exact: true }).click();
          await expect(card(page, "Results").getByRole("row", { name: /Input 2/ })).toBeVisible();
        }
        const [input, ...values] = await Promise.all((await headings(page).all()).map(async (heading) => (await boxOf(heading)).width));
        const widest = Math.max(...values);
        const narrowest = Math.min(...values);
        expect(input, `Compare ${compare}`).toBeLessThan(narrowest);
        expect(widest - narrowest, `Compare ${compare}: ${values.join(", ")}`).toBeLessThanOrEqual(1);
        expect((await boxOf(headings(page).first())).height, `Compare ${compare}`).toBeLessThan(40);
      }
    });
  }
});

/** The Results card holds the result table only: no line under the table names the standard (ADR-0002 decision 86, rule 4). */
test("at 1440 px, PMV (ASHRAE 55)'s Results card names no standard and ends at the table's last row, Compare off and on", async ({ page }) => {
  await openStandard(page, 1440, PMV_ADDRESS);
  const results = card(page, "Results");
  for (const compare of ["off", "on"]) {
    if (compare === "on") {
      await page.getByRole("switch", { name: "Compare", exact: true }).click();
      await expect(results.getByRole("row", { name: /Input 2/ })).toBeVisible();
    }
    await expect(results, `Compare ${compare}`).not.toContainText("ASHRAE 55");
    const content = await boxOf(results.locator('[data-slot="card-content"]'));
    const lastRow = await boxOf(results.getByRole("row").last());
    expect(content.y + content.height - (lastRow.y + lastRow.height), `Compare ${compare}`).toBeLessThanOrEqual(1);
  }
});

/**
 * A run that broke a bound is marked on its result row (ADR-0002 decision 85, rule 5), and the Results card has no
 * alert. Every row keeps the icon's room, so no value column moves when it appears (decision 87, rule 9).
 */
test.describe("the result row's bounds icon", () => {
  test("at 1440 px, PMV (ASHRAE 55) at 0.9 m/s without local control puts the icon in the row's Input cell and in no value cell, the table straight under the Results heading and the compliance dash with no icon of its own, and back within the bound leaves no image in the Input cell, on Standard and Explore", async ({ page }) => {
    for (const address of [PMV_ADDRESS, EXPLORE_ADDRESS]) {
      await openStandard(page, 1440, address);
      const results = card(page, "Results");
      const table = results.getByRole("table");
      const inputHeading = table.getByRole("columnheader", { name: "Input", exact: true });
      const cells = table.getByRole("row").nth(1).getByRole("cell");
      const inputCell = cells.first();
      const headingBottom = async () => {
        const heading = await boxOf(results.getByRole("heading", { name: "Results", exact: true }));
        return heading.y + heading.height;
      };
      const gap = (await boxOf(table)).y - (await headingBottom());
      await expect(table.getByRole("cell", { name: "Yes", exact: true }), address).toHaveCount(1);
      await expect(inputHeading, address).toHaveCount(1);
      await expect(inputCell, address).toHaveText("");
      await expect(inputCell.getByRole("img"), address).toHaveCount(0);

      const airSpeed = page.getByRole("spinbutton", { name: /^Air speed/ });
      await airSpeed.fill("0.9");
      await airSpeed.press("Enter");

      const icon = results.getByRole("img", { name: "Calculated, but outside these limits:" });
      await expect(icon, address).toBeVisible();
      await expect(inputCell.getByRole("img", { name: "Calculated, but outside these limits:" }), address).toHaveCount(1);
      await expect(inputCell, address).toHaveText("");
      // The Input cell's icon is the table's one drawing: no value cell holds an icon.
      await expect(table.locator("svg"), address).toHaveCount(1);
      // Before the band's badge, and on the badge's line.
      await expect(cells.nth(1), address).toHaveText("Slightly Cool");
      const box = await boxOf(icon);
      const label = await boxOf(cells.nth(1).locator('[data-slot="badge"]'));
      expect(box.x + box.width, address).toBeLessThanOrEqual(label.x);
      expect(box.y + box.height / 2, address).toBeGreaterThan(label.y);
      expect(box.y + box.height / 2, address).toBeLessThan(label.y + label.height);
      await expect(results.getByRole("alert"), address).toHaveCount(0);
      await expect(results.getByRole("status"), address).toHaveCount(0);
      expect((await boxOf(table)).y - (await headingBottom()), address).toBe(gap);
      const dash = table.getByRole("cell", { name: "—", exact: true });
      await expect(dash, address).toHaveCount(1);
      await expect(dash.locator("svg"), address).toHaveCount(0);
      await expect(card(page, "Inputs").locator("svg.lucide-triangle-alert"), address).toHaveCount(0);
      // The tab keeps its session across pages, so the next page opens at the default again only once it is typed back.
      await airSpeed.fill("0.1");
      await airSpeed.press("Enter");
      await expect(icon, address).toHaveCount(0);
      await expect(inputHeading, address).toHaveCount(1);
      await expect(inputCell, address).toHaveText("");
      await expect(inputCell.getByRole("img"), address).toHaveCount(0);
    }
  });

  // Explore compares slot 1 alone, so it has no Compare to turn on.
  for (const [name, address, compares] of [
    ["Standard", PMV_ADDRESS, ["off", "on"]],
    ["Explore", EXPLORE_ADDRESS, ["off"]],
  ] as const) {
    test(`at 1440 px on ${name}, PMV (ASHRAE 55) at 0.9 m/s without local control and back moves no value column's left edge, Compare ${compares.join(" and ")}`, async ({ page }) => {
      await openStandard(page, 1440, address);
      const results = card(page, "Results");
      const icon = results.getByRole("img", { name: "Calculated, but outside these limits:" });
      const valueEdges = async () =>
        Promise.all((await results.getByRole("columnheader").all()).slice(1).map(async (heading) => (await boxOf(heading)).x));
      for (const compare of compares) {
        if (compare === "on") {
          await page.getByRole("switch", { name: "Compare", exact: true }).click();
          await expect(results.getByRole("row", { name: /Input 2/ })).toBeVisible();
        }
        const airSpeed = page.getByRole("spinbutton", { name: /^Air speed/ }).first();
        const edges = await valueEdges();

        await airSpeed.fill("0.9");
        await airSpeed.press("Enter");
        await expect(icon, `Compare ${compare}`).toBeVisible();
        expect(await valueEdges(), `Compare ${compare}, the icon shown`).toEqual(edges);

        await airSpeed.fill("0.1");
        await airSpeed.press("Enter");
        await expect(icon, `Compare ${compare}`).toHaveCount(0);
        expect(await valueEdges(), `Compare ${compare}, the icon gone`).toEqual(edges);
      }
    });
  }

  test("at 1440 px under Compare, the slot at 0.9 m/s without local control has its icon before its swatch and its compliance dash, and slot 1 neither", async ({ page }) => {
    await openStandard(page, 1440);
    await page.getByRole("switch", { name: "Compare", exact: true }).click();
    const table = card(page, "Results").getByRole("table");
    const [first, second] = [/^Input 1/, /Input 2/].map((name) => table.getByRole("row", { name }));
    await expect(second).toBeVisible();

    const airSpeed = page.getByRole("spinbutton", { name: /^Air speed.*, Input 2$/ });
    await airSpeed.fill("0.9");
    await airSpeed.press("Enter");

    const icon = second.getByRole("img", { name: "Calculated, but outside these limits:" });
    await expect(icon).toBeVisible();
    expect((await boxOf(icon)).x).toBeLessThan((await boxOf(second.locator(".swatch-marker"))).x);
    await expect(second.getByRole("cell", { name: "—", exact: true })).toHaveCount(1);
    // Slot 1's icon keeps its room but is no image to a screen reader (decision 87, rule 9).
    await expect(first.getByRole("img")).toHaveCount(0);
    await expect(first.getByRole("cell", { name: "Yes", exact: true })).toHaveCount(1);
  });
});

/** A slot whose Comfort zones are all empty says so under the plot (ADR-0002 decision 83, rule 1, as noted 2026-10-22). */
test.describe("the empty-zone line", () => {
  test("at 1440 px, PMV (ASHRAE 55) at 0.9 m/s without local control says under the psychrometric plot that there is no comfort zone, and at the defaults says nothing", async ({ page }) => {
    await openStandard(page, 1440);
    const chart = card(page, "Chart");
    await expect(chart.getByRole("button", { name: "Chart type", exact: true })).toHaveText("Psychrometric");
    const line = chart.getByText("No comfort zone at these inputs.", { exact: true });
    await expect(line).toHaveCount(0);

    await page.getByRole("spinbutton", { name: /^Air speed/ }).fill("0.9");

    await expect(line).toBeVisible();
    const plot = await boxOf(chart.locator(".chart-plot"));
    expect((await boxOf(line)).y).toBeGreaterThanOrEqual(plot.y + plot.height);
  });
});
