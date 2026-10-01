<!--
  Root shell: the one session, created at the first address and kept for every
  page after it (ADR-0002 decision 57); the router renders the page for the
  current URL.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import type { Address } from "$lib/core/page";
  import { followAddress, Router } from "$lib/routes/navigation";
  import { Outputs } from "$lib/state/compute.svelte";
  import { setOpenSession, type OpenSession } from "$lib/state/openSession";
  import { Session } from "$lib/state/session.svelte";

  let opened: OpenSession | undefined;

  /**
   * The URL names the page and the model: the first address opens the
   * session on them, and every one after it — a typed URL, the back button, a
   * share link — moves the session there. This is the address's path, and it
   * never asks. A plain variable, not `$state`: only a page reads it, once,
   * when it is created, and every page is created after the first address.
   */
  function onAddress(address: Address) {
    if (!opened) {
      const session = new Session(address.model);
      opened = { session, outputs: new Outputs(session) };
    }
    opened.session.setAddress(address);
  }

  onDestroy(followAddress(onAddress));

  setOpenSession(() => {
    if (!opened) {
      throw new Error("A page was created before the address opened the session");
    }
    return opened;
  });
</script>

<Router />
