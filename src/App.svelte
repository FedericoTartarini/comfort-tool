<!--
  Root shell: the tab (`state/tab.svelte.ts`) holds the one session, opened at
  the first address from its share link or what the tab kept, and kept for
  every page after it, until Reset or a link's yes replaces it (ADR-0002
  decisions 57 and 63); beside it the question a waiting link asks, and the
  one toaster every notice is raised in (decision 84, rule 7), both drawn
  here, with the toast a compared slot raises when its run breaks a new
  limit, on whichever page; the router renders the page for the current URL.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { breaksNewLimit, type ViolationRow } from "$lib/core/applicability";
  import { narrowedToPage, toText } from "$lib/core/shareLink";
  import { registeredModels } from "$lib/models";
  import { followAddress, Router, shareLinkTo } from "$lib/routes/navigation";
  import { writeKeptText } from "$lib/state/keptText";
  import { setOpenSession, setTabControls, type OpenSession } from "$lib/state/openSession";
  import type { SlotPosition } from "$lib/state/session.svelte";
  import { Tab } from "$lib/state/tab.svelte";
  import { copy } from "$lib/text/copy";
  import QuestionDialog from "$lib/ui/inputs/QuestionDialog.svelte";
  import Toaster from "$lib/ui/layout/Toaster.svelte";
  import { closeNotices, raiseLimitsBroken, raiseNotice } from "$lib/ui/outputs/notices";

  const tab = new Tab(registeredModels, raiseNotice);

  /** The share link to the page the session is on: its address, and the session narrowed to it (ADR-0002 decision 63, rule 5). */
  function linkToPage(): string {
    if (!tab.opened) {
      throw new Error("A link was asked for before the address opened the session");
    }
    const { session } = tab.opened;
    return shareLinkTo(session, toText(narrowedToPage(session.toWrittenSession(), session.page), registeredModels));
  }

  onDestroy(followAddress((address, link) => tab.arrive(address, link)));

  // The tab keeps the whole session, written again at every change of it
  // (ADR-0002 decision 63, rule 2): external synchronisation, assigning no state.
  $effect(() => {
    if (tab.opened) {
      writeKeptText(toText(tab.opened.session.toWrittenSession(), registeredModels));
    }
  });

  // A compared slot's toast when the limits its run breaks gain one against
  // its run at the last change, a switch's and an arrival's too, and not
  // while they hold or shrink (ADR-0002 decision 84, rule 8): external
  // synchronisation, assigning no state. What was broken is remembered in a
  // plain variable per slot, a slot not compared keeping what it had, so one
  // compared again with nothing changed is no news; it is forgotten when the
  // session is replaced, so the new session's first runs are news.
  let watched: OpenSession | null = null;
  let brokenBefore: ReadonlyMap<SlotPosition, readonly ViolationRow[]> = new Map();
  $effect(() => {
    const opened = tab.opened;
    if (!opened) {
      return;
    }
    if (opened !== watched) {
      watched = opened;
      brokenBefore = new Map();
    }
    for (const slot of opened.outputs.slots) {
      if (breaksNewLimit(brokenBefore.get(slot.position) ?? [], slot.violations)) {
        raiseLimitsBroken(slot.position, slot.violations, opened.session.unitSystem, slot.badge.name);
      }
    }
    brokenBefore = new Map([...brokenBefore, ...opened.outputs.slots.map((slot) => [slot.position, slot.violations] as const)]);
  });

  setOpenSession(() => {
    if (!tab.opened) {
      throw new Error("A page was created before the address opened the session");
    }
    return tab.opened;
  });
  // Reset closes the toasts standing, which speak of the session it replaces
  // (the user's ruling, `.scratch/input-gate/issues/01-…md` Comments). A
  // link's yes closes none, so a limit toast the kept session raised while
  // the question waited stands after it (`.scratch/open-points.md` B30).
  setTabControls({
    reset: () => {
      closeNotices();
      tab.reset();
    },
    link: linkToPage,
  });
</script>

{#key tab.replacements}
  <Router />
{/key}
<!--
  Asked over the kept session, which the page shows meanwhile at the link's
  address (rule 8). Its yes replaces the session and so builds the page again;
  the question is the tab's, so it is drawn here and not by the page.
-->
<QuestionDialog
  open={tab.waitingLink !== null}
  title={copy.linkQuestionTitle}
  question={copy.linkQuestion}
  acceptLabel={copy.linkAccept}
  declineLabel={copy.linkDecline}
  onaccept={() => tab.acceptLink()}
  ondecline={() => tab.declineLink()}
/>
<Toaster />
