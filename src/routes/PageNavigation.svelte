<!--
  The navigation (ADR-0002 decision 57), the sidebar menu's groups (decision
  73, rule 6), each item a (page, model) address. Under Standard one item per
  standard the app's table lists, opening that standard's first registered
  model; under Tools the Explore item, keeping the current model. A
  standard's item is drawn current on any of its models, the Explore item on
  Explore; `aria-current` says `page` only on the item whose address is the
  session's (decision 67, rule 2).
-->
<script lang="ts">
  import { page, type Address } from "$lib/core/page";
  import type { Session } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import NavGroup, { type NavItem } from "$lib/ui/layout/NavGroup.svelte";
  import { ariaCurrentOf, interceptLinkClick, pathTo, standardLinks } from "./navigation";

  interface Props {
    session: Session;
    /** Follow a link from inside the app: the session is asked first. */
    onfollow: (target: Address) => void;
  }

  let { session, onfollow }: Props = $props();

  /**
   * An item that keeps its address, so a new tab and a copied address still
   * work, and that asks the session first when it is the page the click
   * belongs to. A click the navigation module declines to hand over is the
   * browser's, and arrives as an address.
   */
  function itemTo(target: Address, label: string): NavItem {
    return {
      label,
      href: pathTo(target),
      current: ariaCurrentOf(target, session),
      onclick: (event) => {
        if (interceptLinkClick(event)) {
          onfollow(target);
        }
      },
    };
  }

  const standardItems = $derived(standardLinks().map(({ standard, address }) => itemTo(address, standard.displayName)));
  const toolItems = $derived([itemTo({ page: page.explore, model: session.model }, page.explore.title)]);
</script>

<nav>
  <NavGroup label={page.standard.title} items={standardItems} />
  <NavGroup label={copy.tools} items={toolItems} />
</nav>
