<!--
  Root shell: the one session, opened at the first address from its share
  link or what the tab kept, and kept for every page after it, until Reset
  replaces it (ADR-0002 decisions 57 and 63); beside it what the notice line
  says, which each page draws; the router renders the page for the current URL.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import type { Address } from "$lib/core/page";
  import { narrowedToPage, toText } from "$lib/core/shareLink";
  import { registeredModels } from "$lib/models";
  import { followAddress, Router, shareLinkTo } from "$lib/routes/navigation";
  import { Outputs } from "$lib/state/compute.svelte";
  import { firstLoadAt } from "$lib/state/firstLoad";
  import { clearKeptText, readKeptText, writeKeptText } from "$lib/state/keptText";
  import { setOpenSession, setTabControls, type Notice, type OpenSession } from "$lib/state/openSession";

  /**
   * Set by the first address, and again by each replacement. `$state.raw` so
   * the effect below, which runs before the router has loaded that address,
   * runs again when it is set; a page reads it once, when it is created.
   */
  let opened = $state.raw<OpenSession>();
  /**
   * Counts the replacements of the session. A page reads the open session
   * once, when it is created, so a new one is not told to it: the router is
   * created again, and the page with it (ADR-0002 decision 63, rule 8).
   */
  let replacements = $state(0);
  /** What the notice line says: the tab's, beside the session and not in it (ADR-0002 decision 63, rule 6). */
  let notice = $state<Notice | null>(null);

  /**
   * Run the first address's load at `address`, with the share link's text it
   * carried if any: the link's session, the session the tab kept, or the
   * model's defaults, and the notice the load raises. Until a link can be
   * asked about (ticket 06), a link over a kept session is left unopened.
   */
  function openAt(address: Address, link: string | undefined) {
    const load = firstLoadAt(address, { link, kept: readKeptText() }, registeredModels);
    opened = { session: load.session, outputs: new Outputs(load.session) };
    notice = load.notice;
  }

  /**
   * The URL names the page and the model: the first address opens the
   * session on them, from its link or what the tab kept, and every one after
   * it — a typed URL, the back button — moves the session there. This is the
   * address's path, and it never asks.
   */
  function onAddress(address: Address, link: string | undefined) {
    if (opened) {
      opened.session.setAddress(address);
      return;
    }
    openAt(address, link);
  }

  /**
   * Replace the tab's session (ADR-0002 decision 63, rule 8): forget what the
   * tab kept and run the first address's load again on the page and model
   * the session is on, which then finds nothing kept and builds the defaults.
   * Reset is its caller, and so holds no list of what it resets.
   */
  function replaceSession() {
    if (!opened) {
      throw new Error("The session was replaced before the address opened it");
    }
    const { page, model } = opened.session;
    clearKeptText();
    openAt({ page, model }, undefined);
    replacements += 1;
  }

  /** The share link to the page the session is on: its address, and the session narrowed to it (ADR-0002 decision 63, rule 5). */
  function linkToPage(): string {
    if (!opened) {
      throw new Error("A link was asked for before the address opened the session");
    }
    const { session } = opened;
    return shareLinkTo(session, toText(narrowedToPage(session.toWrittenSession(), session.page), registeredModels));
  }

  onDestroy(followAddress(onAddress));

  // The tab keeps the whole session, written again at every change of it
  // (ADR-0002 decision 63, rule 2): external synchronisation, assigning no state.
  $effect(() => {
    if (opened) {
      writeKeptText(toText(opened.session.toWrittenSession(), registeredModels));
    }
  });

  setOpenSession(() => {
    if (!opened) {
      throw new Error("A page was created before the address opened the session");
    }
    return opened;
  });
  setTabControls({
    reset: replaceSession,
    link: linkToPage,
    get notice() {
      return notice;
    },
    raiseNotice: (raised) => (notice = raised),
    closeNotice: () => (notice = null),
  });
</script>

{#key replacements}
  <Router />
{/key}
