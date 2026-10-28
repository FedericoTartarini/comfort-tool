import { Standard } from "jsthermalcomfort";
import { copy } from "$lib/text/copy";

/**
 * Name and route segment for a library `Standard`, its year included, derived
 * from its key rather than written down per standard (ADR-0002 decisions 6 and 86):
 * `iso_7730_2005` → "ISO 7730:2005", `iso-7730-2005`.
 */
export interface StandardEntry {
  readonly id: Standard;
  /** As the sidebar, the Explore select's group heading and the Input summary write it. */
  readonly name: string;
  readonly routeSegment: string;
}

const STANDARD_KEY = /^([a-z]+)_(\d+)_(\d{4})$/;

function parseStandardKey(key: string): Omit<StandardEntry, "id"> {
  const match = STANDARD_KEY.exec(key);
  if (!match) {
    throw new Error(`Cannot parse standard key "${key}" as "<body>_<number>_<year>"`);
  }
  const [, body, number, year] = match;
  return { name: copy.standardName(`${body.toUpperCase()} ${number}`, year), routeSegment: `${body}-${number}-${year}` };
}

/** Every standard the library names, in `Standard`'s own key order. */
export const standards: readonly StandardEntry[] = (Object.keys(Standard) as (keyof typeof Standard)[]).map((key) => {
  const parsed = parseStandardKey(key);
  return { id: Standard[key], ...parsed };
});

export function standardEntryFor(standard: Standard): StandardEntry {
  const row = standards.find((entry) => entry.id === standard);
  if (!row) {
    throw new Error(`No entry declared for standard "${standard}"`);
  }
  return row;
}
