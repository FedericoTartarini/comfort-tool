import { standards, type StandardRef } from "jsthermalcomfort/reference";

/**
 * Route path segment for each library standard. The standard itself is the
 * library's `reference.standards` object; the app adds only the segment
 * (ADR §4.2). Order here is the navigation order.
 */
export const standardPath = [
  { standard: standards.ashrae55, pathSegment: "ashrae-55" },
  { standard: standards.iso7730, pathSegment: "iso-7730" },
  { standard: standards.en16798, pathSegment: "en-16798" },
] as const;

export function pathSegmentFor(standard: StandardRef): string {
  const row = standardPath.find((entry) => entry.standard === standard);
  if (!row) {
    throw new Error(`No route segment declared for ${standard.name}`);
  }
  return row.pathSegment;
}

export function standardFromPath(segment: string): StandardRef | undefined {
  return standardPath.find((entry) => entry.pathSegment === segment)?.standard;
}
