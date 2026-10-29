<!--
  The navigation (ADR-0002 decision 57), the sidebar menu's groups (decision
  73, rule 6), each in-app item a (page, model) address. Under Standard one
  item per standard with a registered model, in the registry's order, opening
  that standard's first registered model (decision 74); under Tools the
  Explore item, keeping the current model, and, while the sidebar is the sheet,
  Documentation, which the header holds at a desktop, a plain link (decision
  87, rule 2). A standard's item is drawn current on any of its models, the
  Explore item on Explore; `aria-current` says `page` only on the item whose
  address is the session's (decision 67, rule 2).
-->
<script lang="ts">
  import { page, type Address } from "$lib/core/page";
  import type { Session } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import NavGroup, { type InAppItem, type NavItem } from "$lib/ui/layout/NavGroup.svelte";
  import * as Sidebar from "$lib/ui/primitives/sidebar";
  import { inAppLinkTo } from "./inAppSwitch";
  import { ariaCurrentOf, standardLinks } from "./navigation";

  interface Props {
    session: Session;
    /** Follow a link from inside the app: the session is asked first. */
    onfollow: (target: Address) => void;
  }

  let { session, onfollow }: Props = $props();

  const sidebar = Sidebar.useSidebar();

  /** An item that is an in-app link to `target`, drawn current by the route models' reader. */
  function itemTo(target: Address, label: string): InAppItem {
    return { label, current: ariaCurrentOf(target, session), ...inAppLinkTo(target, onfollow) };
  }

  const standardItems = $derived(standardLinks().map(({ standard, address }) => itemTo(address, standard.name)));
  const toolItems: NavItem[] = $derived([
    itemTo({ page: page.explore, model: session.model }, page.explore.title),
    ...(sidebar.isMobile ? [{ label: copy.documentation, href: copy.documentationAddress }] : []),
  ]);
</script>

<nav>
  <NavGroup label={page.standard.title} items={standardItems} />
  <NavGroup label={copy.tools} items={toolItems} />
</nav>
