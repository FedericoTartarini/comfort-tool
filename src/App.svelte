<!--
  Root shell: the one session, opened at the first address from what the tab
  kept and kept for every page after it (ADR-0002 decisions 57 and 63); the
  router renders the page for the current URL.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import type { Address } from "$lib/core/page";
  import { toText } from "$lib/core/shareLink";
  import { registeredModels } from "$lib/models";
  import { followAddress, Router } from "$lib/routes/navigation";
  import { Outputs } from "$lib/state/compute.svelte";
  import { firstLoadAt } from "$lib/state/firstLoad";
  import { readKeptText, writeKeptText } from "$lib/state/keptText";
  import { setOpenSession, type OpenSession } from "$lib/state/openSession";

  /**
   * Set once, by the first address. `$state.raw` so the effect below, which
   * runs before the router has loaded that address, runs again when it is
   * set; a page reads it once, when it is created, after the first address.
   */
  let opened = $state.raw<OpenSession>();

  /**
   * The URL names the page and the model: the first address opens the
   * session the tab kept, or the model's defaults, on them, and every one
   * after it — a typed URL, the back button, a share link — moves the session
   * there. This is the address's path, and it never asks.
   */
  function onAddress(address: Address) {
    if (opened) {
      opened.session.setAddress(address);
      return;
    }
    const { session } = firstLoadAt(address, { kept: readKeptText() }, registeredModels);
    opened = { session, outputs: new Outputs(session) };
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
</script>

<Router />
