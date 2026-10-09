<!--
  The page frame every page composes (ADR-0002 decision 65, rule 4; decision
  73, rules 1, 5 and 6): the sidebar-16 block's page (`sidebar-16/+page.svelte`,
  `npx shadcn-svelte add sidebar-16`, CLI 1.6.0, Nova), changed for the tool.
  Kept: the sidebar primitive's provider holding the header, then a row of
  the sidebar and the inset, with `--header-height` at the block's `3.5rem`.
  Changed: that height is set on the provider, not on a wrapper around it;
  the sidebar is `14rem`, not the primitive's `16rem`; the inset holds the
  inputs and the results, not the block's sample panels; a footer of the
  brand's band follows the row, hand-made, as no block has one. The header
  and the footer run the page's width and scroll with it. The header's row
  is that fixed height, so a notice appearing or closing in it moves nothing
  (decision 67, rule 10).
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Notice } from "$lib/state/openSession";
  import { copy } from "$lib/text/copy";
  import * as Sidebar from "$lib/ui/primitives/sidebar";
  import AppSidebar from "./AppSidebar.svelte";
  import { marks } from "./marks";
  import SiteHeader from "./SiteHeader.svelte";

  interface Props {
    notice: Notice | null;
    onclosenotice: () => void;
    navigation: Snippet;
    sessionControls: Snippet;
    inputs: Snippet;
    results: Snippet;
  }

  let { notice, onclosenotice, navigation, sessionControls, inputs, results }: Props = $props();
</script>

<!-- The middle dot the copy separates with (the Image's footer, the legend), hidden from a screen reader. -->
{#snippet separator()}
  <span aria-hidden="true">·</span>
{/snippet}

<Sidebar.Provider class="flex-col [--header-height:calc(--spacing(14))]" style="--sidebar-width: 14rem;">
  <SiteHeader {notice} {onclosenotice} />

  <div class="flex flex-1">
    <AppSidebar {navigation} {sessionControls} />
    <!--
      The inset is the block's content area, the page's `main`. Inside it the
      inputs and the results, two columns from `lg` with a rule between, one
      below it, where the chart's height is a ratio of its width (`cqw`
      against the result column): 0.65, about the `26rem` chart's at 1280 px.
    -->
    <Sidebar.Inset class="min-w-0">
      <div class="grid flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <section class="border-b p-6 lg:border-b-0 lg:border-r">
          {@render inputs()}
        </section>
        <section class="@container p-6 max-lg:[--chart-height:65cqw]">
          {@render results()}
        </section>
      </div>
    </Sidebar.Inset>
  </div>

  <!--
    A band of the brand as the header is (decision 73, rule 5): decision 67
    rule 6's two lines at the left, its links in the band's white and
    underlined, as the CBE tools' footers draw them; the two marks at the
    right, each a link to its institution.
  -->
  <footer
    class="flex items-center justify-between gap-3 bg-(--brand) p-3 text-(length:--font-size-caption) text-background [&_a]:text-background [&_a]:underline [&_a]:underline-offset-2 [&_a]:[--ring:var(--background)]"
  >
    <div>
      <p>
        {copy.footerTool(copy.appTitle, __APP_VERSION__)}
        {@render separator()}
        {copy.footerTool(copy.libraryName, __LIBRARY_VERSION__)}
        {@render separator()}
        <a href={copy.licenceAddress}>{copy.licence}</a>
        {@render separator()}
        <a href={copy.codeAddress}>{copy.code}</a>
      </p>
      <p>
        {copy.citation}
        <a href={copy.citationAddress}>{copy.citationAddress}</a>
      </p>
    </div>
    <div class="flex shrink-0 items-center gap-3">
      <a href={copy.cbeAddress}>
        <img src={marks.cbe.src} alt={copy.cbeName} width={marks.cbe.width} height={marks.cbe.height} class="h-9 w-auto" />
      </a>
      <a href={copy.berkeleyAddress}>
        <img
          src={marks.berkeley.src}
          alt={copy.berkeleyName}
          width={marks.berkeley.width}
          height={marks.berkeley.height}
          class="h-7 w-auto"
        />
      </a>
    </div>
  </footer>
</Sidebar.Provider>
