<!--
  Root shell: the tab (`state/tab.svelte.ts`) holds the one session, opened at
  the first address from its share link or what the tab kept, and kept for
  every page after it, until Reset or a link's yes replaces it (ADR-0002
  decisions 57 and 63); beside it the question a waiting link asks, and the
  one toaster every notice is raised in (decision 84, rule 7), both drawn
  here; the router renders the page for the current URL.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { narrowedToPage, toText } from "$lib/core/shareLink";
  import { registeredModels } from "$lib/models";
  import { followAddress, Router, shareLinkTo } from "$lib/routes/navigation";
  import { writeKeptText } from "$lib/state/keptText";
  import { setOpenSession, setTabControls } from "$lib/state/openSession";
  import { Tab } from "$lib/state/tab.svelte";
  import { copy } from "$lib/text/copy";
  import QuestionDialog from "$lib/ui/inputs/QuestionDialog.svelte";
  import Toaster from "$lib/ui/layout/Toaster.svelte";
  import { closeNotices, raiseNotice } from "$lib/ui/outputs/notices";

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

  setOpenSession(() => {
    if (!tab.opened) {
      throw new Error("A page was created before the address opened the session");
    }
    return tab.opened;
  });
  // Reset closes the toasts standing, which speak of the session it replaces
  // (the user's ruling, `.scratch/input-gate/issues/01-…md` Comments). A
  // link's yes need not: its question stands only at the first address,
  // whose load raises nothing while a link waits.
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
