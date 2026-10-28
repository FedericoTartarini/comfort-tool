<!--
  The sidebar (ADR-0002 decision 73, rule 6): shadcn-svelte's sidebar-16
  block's `app-sidebar.svelte` (`npx shadcn-svelte add sidebar-16`, CLI 1.6.0,
  Nova), changed for the tool. Kept: a `Sidebar.Root` of a `Sidebar.Content`
  of groups, and below `md` the primitive's offcanvas sheet (rule 10).
  Changed: below `md` the sheet shows the sheet primitive's own Close, which
  the sidebar primitive hides; at every other width the root is
  `collapsible="none"`, chosen by the primitive's own mobile check, a fixed
  column below the header rather than the block's offcanvas container pinned
  under a sticky one, not rendered at all while the header's toggle has
  collapsed it (decision 87, rule 1), as tall as
  the page beside it (`h-auto`, `self-stretch`), not shrunk by it,
  transparent on the ground, and inset `p-1`, so with a group's own `p-2` its
  fills stand on the 12 px line the header's mark and the footer's text stand
  on; no brand tile in a `Sidebar.Header` (the header
  holds the mark), no user menu in a `Sidebar.Footer` (the page's footer
  holds the versions); the block's sample groups are the navigation the page
  hands in, then a `Sidebar.Separator`, inset as far as the rule inside
  Settings (the group's `p-2` and its content's `px-2`), and the Settings
  group, which holds the session controls whole, inset as a menu item's text
  is, its label an `h2` in ink as a `NavGroup`'s is (decision 87, rule 5).
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { copy } from "$lib/text/copy";
  import * as Sidebar from "$lib/ui/primitives/sidebar";

  interface Props {
    /** Whether the column stands on a desktop; below `md` the sheet stands whatever it is. */
    open: boolean;
    /** The navigation's groups, each a `NavGroup`. */
    navigation: Snippet;
    sessionControls: Snippet;
  }

  let { open, navigation, sessionControls }: Props = $props();

  const id = $props.id();
  const sidebar = Sidebar.useSidebar();
</script>

<!--
  The sheet keeps the primitive's own ground and insets; the column's are the fixed sidebar's. The sheet's Close is
  shown: `[&>button]:inline-flex`, the button's own display, replaces the primitive's `[&>button]:hidden` in its merge.
-->
{#if open || sidebar.isMobile}
  <Sidebar.Root
    collapsible={sidebar.isMobile ? "offcanvas" : "none"}
    class={sidebar.isMobile ? "[&>button]:inline-flex" : "h-auto shrink-0 self-stretch bg-transparent p-1"}
  >
    <Sidebar.Content>
      {@render navigation()}
      <!-- The primitive's `w-auto` loses to the base separator's `data-horizontal:w-full`, which would push the inset line past the column. -->
      <Sidebar.Separator class="mx-4 data-horizontal:w-auto" />
      <Sidebar.Group role="group" aria-labelledby="{id}-settings">
        <Sidebar.GroupLabel id="{id}-settings" class="text-foreground"><h2>{copy.settings}</h2></Sidebar.GroupLabel>
        <Sidebar.GroupContent class="px-2 pt-1">
          {@render sessionControls()}
        </Sidebar.GroupContent>
      </Sidebar.Group>
    </Sidebar.Content>
  </Sidebar.Root>
{/if}
