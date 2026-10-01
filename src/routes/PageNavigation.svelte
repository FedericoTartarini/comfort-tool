<!--
  The navigation (ADR-0002 decision 57): two groups of links, each link a
  (page, model) address. Under Standard one link per standard, opening that
  standard's first registered model; then one Explore link, keeping the current
  model. The link to where the person is is the current one.
-->
<script lang="ts">
  import { page, type Address } from "$lib/core/page";
  import type { Session } from "$lib/state/session.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { interceptLinkClick, pathTo, standardLinks } from "./navigation";

  interface Props {
    session: Session;
    /** Follow a link from inside the app: the session is asked first. */
    onfollow: (target: Address) => void;
  }

  let { session, onfollow }: Props = $props();

  const links = standardLinks();
  const exploreLink = $derived<Address>({ page: page.explore, model: session.model });
</script>

{#snippet link(target: Address, label: string)}
  <!--
    A link that keeps its address, so a new tab and a copied address still
    work, and that asks the session first when it is the page the click
    belongs to. A click the navigation module declines to hand over is the
    browser's, and arrives as an address.
  -->
  <a
    href={pathTo(target)}
    aria-current={target.page === session.page && target.model === session.model ? "page" : undefined}
    onclick={(event) => {
      if (interceptLinkClick(event)) {
        onfollow(target);
      }
    }}
  >
    {label}
  </a>
{/snippet}

<nav>
  <Stack gap="2">
    <strong>{page.standard.title}</strong>
    {#each links as { standard, address } (standard.id)}
      {@render link(address, standard.displayName)}
    {/each}
    {@render link(exploreLink, page.explore.title)}
  </Stack>
</nav>
