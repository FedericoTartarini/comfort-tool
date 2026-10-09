<!--
  The header (ADR-0002 decision 73, rule 5): shadcn-svelte's sidebar-16
  block's `site-header.svelte` (`npx shadcn-svelte add sidebar-16`, CLI 1.6.0,
  Nova), changed for the tool. Kept: the header, its one row at
  `--header-height`, the sidebar's trigger first, the vertical `Separator`.
  Changed: a band of the brand, its text in the paper's white, with no rule
  under it and not sticky, so it scrolls away with the page; the row's inset
  and gap are the page's spacing token; the trigger stands only below `md`,
  where the sidebar is the primitive's sheet (rule 10), and is gone while it
  is fixed; the CBE mark, a link, follows it; the separator stands after the
  mark, not the trigger, `h-6` in the band's white at 30 %; the breadcrumb is the
  title, the `h1`; the search form is the notice line, centred in the room
  between the title and Documentation, the last item. The band's own links
  and the trigger ring in the paper's white on focus, where the brand's ring
  would not show; the notice keeps the brand's, on its own white.
-->
<script lang="ts">
  import type { Notice } from "$lib/state/openSession";
  import { copy } from "$lib/text/copy";
  import NoticeLine from "$lib/ui/outputs/NoticeLine.svelte";
  import { Separator } from "$lib/ui/primitives/separator";
  import * as Sidebar from "$lib/ui/primitives/sidebar";
  import { marks } from "./marks";

  interface Props {
    notice: Notice | null;
    onclosenotice: () => void;
  }

  let { notice, onclosenotice }: Props = $props();

  const sidebar = Sidebar.useSidebar();
</script>

<header class="flex w-full items-center bg-(--brand) text-background">
  <div class="flex h-(--header-height) w-full items-center gap-(--space-page) px-(--space-page)">
    {#if sidebar.isMobile}
      <Sidebar.Trigger class="shrink-0 [--ring:var(--background)]" />
    {/if}
    <a href={copy.cbeAddress} class="flex shrink-0 items-center [--ring:var(--background)]">
      <img src={marks.cbe.src} alt={copy.cbeName} width={marks.cbe.width} height={marks.cbe.height} class="h-8 w-auto" />
    </a>
    <Separator orientation="vertical" class="bg-background/30 data-vertical:h-6 data-vertical:self-auto" />
    <h1 class="shrink-0">{copy.appTitle}</h1>
    <div class="flex min-w-0 flex-1 justify-center">
      <NoticeLine {notice} onclose={onclosenotice} />
    </div>
    <a href={copy.documentationAddress} class="shrink-0 text-background [--ring:var(--background)]">{copy.documentation}</a>
  </div>
</header>
