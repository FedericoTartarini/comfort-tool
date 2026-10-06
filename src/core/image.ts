import type { ChartSpec } from "./charts/chartSpec";

/**
 * The printed sizes of an Image (ADR-0002 decision 64, rule 5): Elsevier's
 * column widths. A size differs from the other by its width alone. A closed
 * set in the same shape as `core/page.ts`'s, with no `id`: a size is in no
 * link, so nothing ever spells one.
 */
export interface ImageSize {
  readonly title: string;
  readonly widthMm: number;
}

export const imageSize = {
  singleColumn: { title: "Single column", widthMm: 90 },
  doubleColumn: { title: "Double column", widthMm: 190 },
} as const satisfies Record<string, ImageSize>;

/** The file formats of an Image (decision 64, rule 5), with no `id`, as {@link ImageSize} has none. */
export interface ImageFormat {
  readonly title: string;
  /** The file name's, without its dot. */
  readonly extension: string;
}

export const imageFormat = {
  png: { title: "PNG", extension: "png" },
  svg: { title: "SVG", extension: "svg" },
} as const satisfies Record<string, ImageFormat>;

/**
 * What an Image shows, built at the click and handed to the chart adapter,
 * which draws it (decision 64, rule 7). It names nothing of Plotly.
 */
export interface ImageDescription {
  /** The chart the page shows, as the page holds it. */
  readonly chart: ChartSpec;
  readonly size: ImageSize;
}

export function imageDescription(parts: { chart: ChartSpec; size: ImageSize }): ImageDescription {
  return { chart: parts.chart, size: parts.size };
}

/** The file's name where its title leaves nothing to write (decision 64, rule 8). */
const FALLBACK_FILE_NAME = "thermal-comfort-chart";

/**
 * The downloaded file's name (decision 64, rule 8): the title, then the
 * size's title, each in lower case with every run of characters outside
 * `a-z` and `0-9` one hyphen, then the format's extension. A title that
 * leaves nothing, an empty one included, is {@link FALLBACK_FILE_NAME}.
 */
export function imageFileName(title: string, size: ImageSize, format: ImageFormat): string {
  return `${toFileNamePart(title) || FALLBACK_FILE_NAME}-${toFileNamePart(size.title)}.${format.extension}`;
}

function toFileNamePart(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
