import { Standard } from "jsthermalcomfort";
import type { StandardId } from "jsthermalcomfort";
import { copy } from "$lib/text/copy";

/**
 * Label and route segment for a library `Standard`, its year included, derived
 * from its key rather than written down per standard (ADR-0002 decisions 6 and 86):
 * `iso_7730_2005` → "ISO 7730:2005", `iso-7730-2005`.
 */
export interface StandardEntry {
  readonly id: StandardId;
  /** As the sidebar, the Explore select's group heading and the Input summary write it. */
  readonly label: string;
  readonly routeSegment: string;
}

const STANDARD_KEY = /^([a-z]+)_(\d+)(?:_(\d+))?_(\d{4})$/;

/**
 * Reads a `Standard` key as body, number, an optional part, and year; a part
 * joins the number with a hyphen: `en_16798_1_2019` → "EN 16798-1:2019",
 * `en-16798-1-2019`. Throws, naming the key, for any other shape.
 */
export function parseStandardKey(key: string): Omit<StandardEntry, "id"> {
  const match = STANDARD_KEY.exec(key);
  if (!match) {
    throw new Error(`Cannot parse standard key "${key}" as "<body>_<number>[_<part>]_<year>"`);
  }
  const [, body, number, part, year] = match;
  const fullNumber = part === undefined ? number : `${number}-${part}`;
  return { label: copy.standardLabel(`${body.toUpperCase()} ${fullNumber}`, year), routeSegment: `${body}-${fullNumber}-${year}` };
}

/** Every standard the library names, in `Standard`'s own key order. */
export const standards: readonly StandardEntry[] = (Object.keys(Standard) as (keyof typeof Standard)[]).map((key) => {
  const parsed = parseStandardKey(key);
  return { id: Standard[key], ...parsed };
});

/** Whether `standard`'s key reads with the body `ashrae`, as `ashrae_55_2023` does. */
export function isAshraeStandard(standard: StandardId): boolean {
  return (Object.keys(Standard) as (keyof typeof Standard)[]).some((key) => Standard[key] === standard && STANDARD_KEY.exec(key)?.[1] === "ashrae");
}

export function standardEntryFor(standard: StandardId): StandardEntry {
  const row = standards.find((entry) => entry.id === standard);
  if (!row) {
    throw new Error(`No entry declared for standard "${standard}"`);
  }
  return row;
}
