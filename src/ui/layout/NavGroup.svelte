<!--
  A group of the sidebar's menu (ADR-0002 decision 73, rule 6): shadcn-svelte's
  sidebar-16 block's `nav-secondary.svelte` (`npx shadcn-svelte add sidebar-16`,
  CLI 1.6.0, Nova), changed for the tool. Kept: a `Sidebar.Group` of a
  `Sidebar.Menu` whose items are `Sidebar.MenuButton`s with a link for their
  child. Changed: the group has a label, which names it (`role="group"`), an
  `h2` inside it as a card title's is, in ink (decision 87, rule 5); no
  icons, the item's label alone; an in-app item carries `aria-current`, is
  drawn active while it has one, and hands its click to the caller, while a
  plain link, an external address, is neither and has no click of its own
  (decision 87, rule 2), and one that leaves the app opens a new tab and says
  so (decision 89, rule 2); the menu's
  items are `gap-1` (Vega's and Maia's sidebar menu; Nova's is `gap-0`); the
  buttons are the default size, not `sm`.
-->
<script lang="ts" module>
  import type { HTMLAnchorAttributes } from "svelte/elements";

  /** A link that keeps its address, and what its click does first: a menu item's, or the header's mark's. */
  export interface InAppLink {
    href: string;
    onclick: (event: MouseEvent) => void;
  }

  /** A menu item that is an in-app link: its label, its link, and whether it is current. */
  export interface InAppItem extends InAppLink {
    label: string;
    current: HTMLAnchorAttributes["aria-current"];
  }

  /** A menu item that is a plain link, whose click the browser follows: its label, its address, and whether it leaves the app. */
  export interface PlainItem {
    label: string;
    href: string;
    leavesApp?: boolean;
  }

  export type NavItem = InAppItem | PlainItem;
</script>

<script lang="ts">
  import * as Sidebar from "$lib/ui/primitives/sidebar";
  import ExternalLink from "./ExternalLink.svelte";

  interface Props {
    label: string;
    items: readonly NavItem[];
  }

  let { label, items }: Props = $props();

  const id = $props.id();
</script>

<Sidebar.Group role="group" aria-labelledby="{id}-label">
  <Sidebar.GroupLabel id="{id}-label" class="text-foreground"><h2>{label}</h2></Sidebar.GroupLabel>
  <Sidebar.GroupContent>
    <Sidebar.Menu class="gap-1">
      {#each items as item (item.href)}
        {@const inApp = "onclick" in item ? item : undefined}
        {@const leavesApp = "leavesApp" in item && item.leavesApp}
        <Sidebar.MenuItem>
          <Sidebar.MenuButton isActive={inApp?.current !== undefined}>
            {#snippet child({ props })}
              {#if leavesApp}
                <ExternalLink {...props} href={item.href}><span>{item.label}</span></ExternalLink>
              {:else}
                <a {...props} href={item.href} aria-current={inApp?.current} onclick={inApp?.onclick}>
                  <span>{item.label}</span>
                </a>
              {/if}
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      {/each}
    </Sidebar.Menu>
  </Sidebar.GroupContent>
</Sidebar.Group>
