import { toast } from "svelte-sonner";
import { boundSentence, violationSentence, type OutOfRangeRow, type Verdict, type ViolationRow } from "$lib/core/applicability";
import type { Quantity } from "$lib/core/quantities";
import { displayUnitFor, numberWithUnit } from "$lib/core/units";
import type { UnitSystem } from "$lib/core/unitSystem";
import type { Toast } from "$lib/state/openSession";
import type { SlotPosition } from "$lib/state/session.svelte";
import { copy } from "$lib/text/copy";

const toastText: Record<Toast, string> = {
  linkRefused: copy.linkRefusedToast,
  copyRefused: copy.copyRefusedToast,
  imageFailed: copy.imageFailedToast,
  valuesCut: copy.valuesCutToast,
};

/**
 * Raise the toast `id` (ADR-0002 decision 84, rule 7), held by the app's one
 * toaster at the top right until its close button closes it. `id` is the
 * toast's Sonner id, so the same toast raised again replaces itself rather
 * than stacking a second.
 */
export function raiseToast(id: Toast): void {
  toast(toastText[id], { id });
}

/** The box a value was committed in: its quantity, and its slot's name while the slots are named. */
export interface CommittedBox {
  readonly quantity: Quantity;
  readonly slotName?: string;
}

/**
 * Tell the person what committing the SI `value` in `box` did, by its
 * `verdict` (ADR-0002 decision 84, rules 2 and 7, and its note of
 * 2026-10-28): nothing for a value written as it is, nor for a cut, which
 * the box shows at the bound's end over the bound; for a refusal, the bound
 * each row would break at it, under `slotNameOf` its slot's name. Each toast
 * stands until it is closed, a later commit's beside it.
 */
export function raiseVerdict<Row extends OutOfRangeRow>(
  verdict: Verdict<Row>,
  box: CommittedBox,
  value: number,
  unitSystem: UnitSystem,
  slotNameOf: (row: Row) => string | undefined = () => undefined,
): void {
  if (verdict.kind !== "refused") {
    return;
  }
  const subject = box.slotName ? copy.slotControl(box.quantity.label, box.slotName) : box.quantity.label;
  const unit = displayUnitFor(box.quantity, unitSystem);
  const reasons = verdict.rows.map((row) => {
    const sentence = boundSentence(row.quantity, row.bound, unitSystem);
    const slotName = slotNameOf(row);
    return slotName ? copy.slotNote(slotName, sentence) : sentence;
  });
  toast(copy.refusedToast(subject, numberWithUnit(value, unit), reasons));
}

/**
 * Tell the person that the run of the slot at `position` broke a bound it did
 * not break before (ADR-0002 decision 84, rule 8): every bound it breaks now,
 * `rows`, under `slotName` its slot's name. The slot's toast replaces its
 * earlier one, which named fewer.
 */
export function raiseBoundsBroken(
  position: SlotPosition,
  rows: readonly ViolationRow[],
  unitSystem: UnitSystem,
  slotName?: string,
): void {
  const text = copy.boundsBrokenToast(rows.map((row) => violationSentence(row, unitSystem)));
  toast(slotName ? copy.slotNote(slotName, text) : text, { id: `bounds-broken-${position}` });
}

/** Close every toast standing, as the session they speak of is replaced. */
export function closeToasts(): void {
  toast.dismiss();
}
