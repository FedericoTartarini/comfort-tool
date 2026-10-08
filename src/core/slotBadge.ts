import { copy } from "$lib/text/copy";
import { palette } from "./palette";

/**
 * A slot's name and hue, which follow its position (ADR-0002 decision 50).
 * Given here once, the name's text read from `copy`, so the input columns,
 * the result table's rows, the legend and the chart's zones and markers
 * cannot disagree about which slot is which.
 */

/**
 * The one hex a slot is drawn in, the palette's for its position (ADR-0002
 * decision 66, rule 2). Its marker, its zones' outline and their fill are
 * derived from it by the chart ink (`chartInk` in `core/bandPalette.ts`).
 */
export type SlotHue = (typeof palette.slots)[number];

export interface SlotBadge {
  readonly name: string;
  readonly hue: SlotHue;
}

/**
 * Whether a chart of `drawn` slots names each by its slot: while it draws
 * more than one, so three zones of one kind can be told apart, and not while
 * it draws one, so a session whose Compare is off reads as it did (ADR-0002
 * decision 50). The legend and the Input summary both ask it.
 */
export function namesSlots(drawn: number): boolean {
  return drawn > 1;
}

/** One badge per slot of the session, by position. */
export const slotBadges = [
  { name: copy.slotName(0), hue: palette.slots[0] },
  { name: copy.slotName(1), hue: palette.slots[1] },
  { name: copy.slotName(2), hue: palette.slots[2] },
] as const satisfies readonly SlotBadge[];
