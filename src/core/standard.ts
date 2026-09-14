import { Standard } from "jsthermalcomfort";

/**
 * Display name, edition year and route segment for a library `Standard`,
 * derived from its key rather than written down per standard (ADR-0002
 * decision 5): `iso_7730_2005` → "ISO 7730", "2005", `iso-7730`.
 */
export interface StandardEntry {
  readonly id: Standard;
  readonly displayName: string;
  readonly year: string;
  readonly pathSegment: string;
}

const STANDARD_KEY = /^([a-z]+)_(\d+)_(\d{4})$/;

function parseStandardKey(key: string): Omit<StandardEntry, "id"> {
  const match = STANDARD_KEY.exec(key);
  if (!match) {
    throw new Error(`Cannot parse standard key "${key}" as "<body>_<number>_<year>"`);
  }
  const [, body, number, year] = match;
  return { displayName: `${body.toUpperCase()} ${number}`, year, pathSegment: `${body}-${number}` };
}

/** Every standard the library names, in `Standard`'s own key order. */
export const standards: readonly StandardEntry[] = (Object.keys(Standard) as (keyof typeof Standard)[]).map((key) => {
  const parsed = parseStandardKey(key);
  return { id: Standard[key], ...parsed };
});

export function pathSegmentFor(standard: Standard): string {
  const row = standards.find((entry) => entry.id === standard);
  if (!row) {
    throw new Error(`No route segment declared for standard "${standard}"`);
  }
  return row.pathSegment;
}

export function standardFromPath(segment: string): Standard | undefined {
  return standards.find((entry) => entry.pathSegment === segment)?.id;
}
