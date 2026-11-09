import { copy } from "$lib/text/copy";
import { palette } from "./palette";
import type { SlotPosition } from "./writtenSession";

/**
 * A slot's label and hue, which follow its position (ADR-0002 decision 50);
 * the label only while the session names its slots, which the session alone
 * decides. Given here once, the label's text read from `copy`, so the input
 * columns, the result table's rows, the legend, the chart's zones and
 * markers, the Input summary and the model-switch dialog's rows cannot
 * disagree about which slot is which.
 */

/**
 * The one hex a slot is drawn in, the palette's for its position (ADR-0002
 * decision 66, rule 2). Its marker, its zones' outline and their fill are
 * derived from it by the chart ink (`chartInk` in `core/bandPalette.ts`).
 */
export type SlotHue = (typeof palette.slots)[number];

export interface SlotAppearance {
  /** The slot's label while the session names its slots, and absent otherwise; whatever prints the slot prints this and decides nothing. */
  readonly label?: string;
  readonly hue: SlotHue;
}

/** The label each position gives its slot while the slots are named, as the slot buttons read it. */
export const slotLabels = [copy.slotLabel(0), copy.slotLabel(1), copy.slotLabel(2)] as const;

/** The appearance of the slot at `position`: its hue, and its label while `named`. */
export function slotAppearance(position: SlotPosition, named: boolean): SlotAppearance {
  const hue = palette.slots[position];
  return named ? { label: slotLabels[position], hue } : { hue };
}
