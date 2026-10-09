<!--
  The sidebar (ADR-0002 decision 73, rule 6): shadcn-svelte's sidebar-16
  block's `app-sidebar.svelte` (`npx shadcn-svelte add sidebar-16`, CLI 1.6.0,
  Nova), changed for the tool. Kept: a `Sidebar.Root` of a `Sidebar.Content`
  of groups, and below `md` the primitive's offcanvas sheet (rule 10).
  Changed: at every other width the root is `collapsible="none"`, chosen by
  the primitive's own mobile check, a fixed column below the header rather
  than the block's offcanvas container pinned under a sticky one, as tall as
  the page beside it (`h-auto`, `self-stretch`), not shrunk by it,
  transparent on the ground, and inset `p-1`, so with a group's own `p-2` its
  fills stand on the 12 px line the header's mark and the footer's text stand
  on; no brand tile in a `Sidebar.Header` (the header
  holds the mark), no user menu in a `Sidebar.Footer` (the page's footer
  holds the versions); the block's sample groups are the navigation the page
  hands in, then a `Sidebar.Separator` and the Session group, which holds the
  session controls whole, inset as a menu item's text is.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { copy } from "$lib/text/copy";
  import * as Sidebar from "$lib/ui/primitives/sidebar";

  interface Props {
    /** The navigation's groups, each a `NavGroup`. */
    navigation: Snippet;
    sessionControls: Snippet;
  }

  let { navigation, sessionControls }: Props = $props();

  const id = $props.id();
  const sidebar = Sidebar.useSidebar();
</script>

<!-- The sheet keeps the primitive's own ground and insets; the column's are the fixed sidebar's. -->
<Sidebar.Root
  collapsible={sidebar.isMobile ? "offcanvas" : "none"}
  class={sidebar.isMobile ? undefined : "h-auto shrink-0 self-stretch bg-transparent p-1"}
>
  <Sidebar.Content>
    {@render navigation()}
    <Sidebar.Separator />
    <Sidebar.Group role="group" aria-labelledby="{id}-session">
      <Sidebar.GroupLabel id="{id}-session">{copy.session}</Sidebar.GroupLabel>
      <Sidebar.GroupContent class="px-2 pt-1">
        {@render sessionControls()}
      </Sidebar.GroupContent>
    </Sidebar.Group>
  </Sidebar.Content>
</Sidebar.Root>
