import { copy } from "$lib/text/copy";

/**
 * A slot's name and hue, which follow its position (ADR-0002 decision 50).
 * Given here once, the name's text read from `copy`, so the input columns,
 * the result table's rows, the legend and the chart's zones and markers
 * cannot disagree about which slot is which.
 */

/**
 * The inks one slot is drawn in. Slot 1's are the ones the charts were drawn
 * in before Compare, so a session whose Compare is off draws as it did; which
 * colours slots 2 and 3 take is Phase 5c's, and they only have to be told
 * apart from each other and from slot 1.
 */
export interface SlotHue {
  readonly marker: string;
  /** A Comfort zone's outline. */
  readonly zoneLine: string;
  /** A Comfort zone's fill as `r, g, b`: the opacity is the zone's level (`chartInk.zoneFill`). */
  readonly zoneFillRgb: string;
}

export interface SlotBadge {
  readonly name: string;
  readonly hue: SlotHue;
}

/** One badge per slot of the session, by position. */
export const slotBadges = [
  { name: copy.slotName(0), hue: { marker: "#111827", zoneLine: "#4c78a8", zoneFillRgb: "146, 197, 222" } },
  { name: copy.slotName(1), hue: { marker: "#7c2d12", zoneLine: "#f28e2b", zoneFillRgb: "255, 190, 125" } },
  { name: copy.slotName(2), hue: { marker: "#14532d", zoneLine: "#59a14f", zoneFillRgb: "140, 209, 125" } },
] as const satisfies readonly SlotBadge[];
