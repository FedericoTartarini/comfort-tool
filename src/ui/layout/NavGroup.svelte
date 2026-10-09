<!--
  A group of the sidebar's menu (ADR-0002 decision 73, rule 6): shadcn-svelte's
  sidebar-16 block's `nav-secondary.svelte` (`npx shadcn-svelte add sidebar-16`,
  CLI 1.6.0, Nova), changed for the tool. Kept: a `Sidebar.Group` of a
  `Sidebar.Menu` whose items are `Sidebar.MenuButton`s with a link for their
  child. Changed: the group has a label, which names it (`role="group"`); no
  icons, the item's name alone; an item carries `aria-current`, is drawn
  active while it has one, and hands its click to the caller; the menu's
  items are `gap-1` (Vega's and Maia's sidebar menu; Nova's is `gap-0`); the
  buttons are the default size, not `sm`.
-->
<script lang="ts" module>
  import type { HTMLAnchorAttributes } from "svelte/elements";

  /** A menu item: a link that keeps its address, and what its click does first. */
  export interface NavItem {
    label: string;
    href: string;
    current: HTMLAnchorAttributes["aria-current"];
    onclick: (event: MouseEvent) => void;
  }
</script>

<script lang="ts">
  import * as Sidebar from "$lib/ui/primitives/sidebar";

  interface Props {
    label: string;
    items: readonly NavItem[];
  }

  let { label, items }: Props = $props();

  const id = $props.id();
</script>

<Sidebar.Group role="group" aria-labelledby="{id}-label">
  <Sidebar.GroupLabel id="{id}-label">{label}</Sidebar.GroupLabel>
  <Sidebar.GroupContent>
    <Sidebar.Menu class="gap-1">
      {#each items as item (item.href)}
        <Sidebar.MenuItem>
          <Sidebar.MenuButton isActive={item.current !== undefined}>
            {#snippet child({ props })}
              <a {...props} href={item.href} aria-current={item.current} onclick={item.onclick}>
                <span>{item.label}</span>
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      {/each}
    </Sidebar.Menu>
  </Sidebar.GroupContent>
</Sidebar.Group>
