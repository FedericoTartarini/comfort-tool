import { toast } from "svelte-sonner";
import { boundSentence, warningFor, type OutOfRangeRow, type Verdict, type ViolationRow } from "$lib/core/applicability";
import type { Quantity } from "$lib/core/quantities";
import { displayUnitFor, numberWithUnit } from "$lib/core/units";
import type { UnitSystem } from "$lib/core/unitSystem";
import type { Notice } from "$lib/state/openSession";
import type { SlotPosition } from "$lib/state/session.svelte";
import { copy } from "$lib/text/copy";

const noticeText: Record<Notice, string> = {
  linkRefused: copy.linkRefusedNotice,
  linkFilled: copy.linkFilledNotice,
  copyRefused: copy.copyRefusedNotice,
  imageFailed: copy.imageFailedNotice,
  valuesCut: copy.valuesCutNotice,
};

/**
 * Give `notice` as a toast (ADR-0002 decision 84, rule 7), held by the app's
 * one toaster at the top right until its close button closes it. The notice
 * is the toast's id, so the same notice raised again replaces its own toast
 * rather than stacking a second.
 */
export function raiseNotice(notice: Notice): void {
  toast(noticeText[notice], { id: notice });
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
  toast(copy.refusedNotice(subject, numberWithUnit(value, unit), reasons));
}

/**
 * Tell the person that the run of the slot at `position` broke a limit it did
 * not break before (ADR-0002 decision 84, rule 8): every limit it breaks now,
 * `rows`, under `slotName` its slot's name. The slot's toast replaces its
 * earlier one, which named fewer.
 */
export function raiseLimitsBroken(
  position: SlotPosition,
  rows: readonly ViolationRow[],
  unitSystem: UnitSystem,
  slotName?: string,
): void {
  const text = copy.limitsBrokenNotice(rows.map((row) => warningFor(row, unitSystem)));
  toast(slotName ? copy.slotNote(slotName, text) : text, { id: `limits-broken-${position}` });
}

/** Close every toast standing, as the session they speak of is replaced. */
export function closeNotices(): void {
  toast.dismiss();
}
