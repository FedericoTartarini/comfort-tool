import { copy } from "$lib/text/copy";
import { palette } from "./palette";
import type { SlotPosition } from "./writtenSession";

/**
 * A slot's name and hue, which follow its position (ADR-0002 decision 50);
 * the name only while the session names its slots, which the session alone
 * decides. Given here once, the name's text read from `copy`, so the input
 * columns, the result table's rows, the legend, the chart's zones and
 * markers and the Input summary cannot disagree about which slot is which.
 */

/**
 * The one hex a slot is drawn in, the palette's for its position (ADR-0002
 * decision 66, rule 2). Its marker, its zones' outline and their fill are
 * derived from it by the chart ink (`chartInk` in `core/bandPalette.ts`).
 */
export type SlotHue = (typeof palette.slots)[number];

export interface SlotBadge {
  /** The slot's name while the session names its slots, and absent otherwise; whatever prints the slot prints this and decides nothing. */
  readonly name?: string;
  readonly hue: SlotHue;
}

/** The name each position gives its slot while the slots are named, as the slot buttons read it. */
export const slotNames = [copy.slotName(0), copy.slotName(1), copy.slotName(2)] as const;

/** The badge of the slot at `position`: its hue, and its name while `named`. */
export function slotBadge(position: SlotPosition, named: boolean): SlotBadge {
  const hue = palette.slots[position];
  return named ? { name: slotNames[position], hue } : { hue };
}
