<!--
  The navigation (ADR-0002 decision 57): two groups of links, each link a
  (page, model) address. Under Standard one link per standard the app's table
  lists, opening that standard's first registered model; then one Explore link,
  keeping the current model. A standard's link is current on any of its
  models, the Explore link on Explore. Explore is a group of its own, so its
  link reads as Standard's heading does, one level above the standards' links.
-->
<script lang="ts">
  import { page, type Address } from "$lib/core/page";
  import type { Session } from "$lib/state/session.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { interceptLinkClick, isCurrentLink, pathTo, standardLinks } from "./navigation";

  interface Props {
    session: Session;
    /** Follow a link from inside the app: the session is asked first. */
    onfollow: (target: Address) => void;
  }

  let { session, onfollow }: Props = $props();

  const links = standardLinks();
  const exploreLink = $derived<Address>({ page: page.explore, model: session.model });
</script>

{#snippet link(target: Address, label: string, levelClass: "nav-group" | "nav-item")}
  <!--
    A link that keeps its address, so a new tab and a copied address still
    work, and that asks the session first when it is the page the click
    belongs to. A click the navigation module declines to hand over is the
    browser's, and arrives as an address.
  -->
  <a
    class={levelClass}
    href={pathTo(target)}
    aria-current={isCurrentLink(target, session) ? "page" : undefined}
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
    <strong class="nav-group">{page.standard.title}</strong>
    {#each links as { standard, address } (standard.id)}
      {@render link(address, standard.displayName, "nav-item")}
    {/each}
    {@render link(exploreLink, page.explore.title, "nav-group")}
  </Stack>
</nav>
