import { toast } from "svelte-sonner";
import type { Notice } from "$lib/state/openSession";
import { copy } from "$lib/text/copy";

const noticeText: Record<Notice, string> = {
  linkRefused: copy.linkRefusedNotice,
  linkFilled: copy.linkFilledNotice,
  copyRefused: copy.copyRefusedNotice,
  imageFailed: copy.imageFailedNotice,
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

/** Close every toast standing, as the session they speak of is replaced. */
export function closeNotices(): void {
  toast.dismiss();
}
