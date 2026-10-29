<!--
  The header (ADR-0002 decision 73, rule 5): shadcn-svelte's sidebar-16
  block's `site-header.svelte` (`npx shadcn-svelte add sidebar-16`, CLI 1.6.0,
  Nova), changed for the tool. Kept: the header, its one row at
  `--header-height`, a toggle of the sidebar first, the vertical `Separator`.
  Changed: a band of the brand, its text in the paper's white, with no rule
  under it and not sticky, so it scrolls away with the page; the row's inset
  and gap are the page's spacing token; the toggle stands at every width
  (decision 87, rule 1): the generated button, ghost at its small icon size
  with the panel-left icon the primitive's trigger draws, in place of that
  trigger, which writes a cookie on a desktop and names itself in a string of
  its own; named from the copy, its `aria-expanded` the sidebar's state, on a
  desktop it collapses and reopens the sidebar's column, which `PageFrame`
  holds, and below `md` it opens and closes the primitive's sheet; the CBE
  mark follows it, a link to the default model's address
  that the page follows as an in-app switch (rule 5 as revised again
  2026-10-12), handed in as the navigation's items are; the separator stands
  after the mark, not the toggle, `h-6` in the band's white at 30 %; the
  breadcrumb is the title, the `h1`, which on a phone wraps to two lines; the
  search form goes, and Documentation, the last item, stands at the row's end
  (decision 84, rule 7: every notice is a toast, so the header holds none),
  and below `md` leaves the header for the sheet's Tools group (decision 87,
  rule 2); the row stands in the page's frame,
  `--frame-width`, which `PageFrame` sets beside the sidebar's width, the
  band's ground the window's width (rule 10 as revised again 2026-10-12).
  The band's own links and the toggle ring in the paper's white on focus,
  where the brand's ring would not show.
-->
<script lang="ts">
  import PanelLeftIcon from "@lucide/svelte/icons/panel-left";
  import { copy } from "$lib/text/copy";
  import { Button } from "$lib/ui/primitives/button";
  import { Separator } from "$lib/ui/primitives/separator";
  import * as Sidebar from "$lib/ui/primitives/sidebar";
  import { marks } from "./marks";
  import type { InAppLink } from "./NavGroup.svelte";

  interface Props {
    /** The mark's link: the default model's address, and what its click does first. */
    mark: InAppLink;
    /** Whether the sidebar's column stands on a desktop, which the toggle flips there. */
    sidebarOpen: boolean;
  }

  let { mark, sidebarOpen = $bindable() }: Props = $props();

  const sidebar = Sidebar.useSidebar();

  function toggleSidebar() {
    if (sidebar.isMobile) {
      sidebar.setOpenMobile(!sidebar.openMobile);
    } else {
      sidebarOpen = !sidebarOpen;
    }
  }
</script>

<header class="flex w-full items-center bg-(--brand) text-background">
  <div class="mx-auto flex h-(--header-height) w-full max-inline-(--frame-width) items-center gap-(--space-page) px-(--space-page)">
    <Button
      variant="ghost"
      size="icon-sm"
      class="shrink-0 [--ring:var(--background)]"
      aria-label={copy.sidebar}
      aria-expanded={sidebar.isMobile ? sidebar.openMobile : sidebarOpen}
      onclick={toggleSidebar}
    >
      <PanelLeftIcon class="cn-rtl-flip" />
    </Button>
    <a href={mark.href} onclick={mark.onclick} class="flex shrink-0 items-center [--ring:var(--background)]">
      <img src={marks.cbe.src} alt={copy.cbeName} width={marks.cbe.width} height={marks.cbe.height} class="h-8 w-auto" />
    </a>
    <Separator orientation="vertical" class="bg-background/30 data-vertical:h-6 data-vertical:self-auto" />
    <!-- The one item that shrinks, wrapping between words: two lines fit the band on a phone. -->
    <h1>{copy.appTitle}</h1>
    {#if !sidebar.isMobile}
      <a href={copy.documentationAddress} class="ms-auto shrink-0 text-background [--ring:var(--background)]">{copy.documentation}</a>
    {/if}
  </div>
</header>
