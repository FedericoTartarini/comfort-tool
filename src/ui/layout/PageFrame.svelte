<!--
  The page frame every page composes (ADR-0002 decision 65, rule 4; decision
  73, rules 1, 5 and 6): the sidebar-16 block's page (`sidebar-16/+page.svelte`,
  `npx shadcn-svelte add sidebar-16`, CLI 1.6.0, Nova), changed for the tool.
  Kept: the sidebar primitive's provider holding the header, then a row of
  the sidebar and the inset, with `--header-height` at the block's `3.5rem`.
  Changed: that height is the stylesheet's token, not set on a wrapper;
  the sidebar is `14rem`, not the primitive's `16rem`; the inset holds the
  three modules, Inputs, Results and Chart, each a generated card titled by
  its heading (decision 73, rule 4), not the block's sample panels; a footer
  of the brand's band follows the row, hand-made, as no block has one. The header
  and the footer run the page's width and scroll with it. The header's row
  is that fixed height, so a notice appearing or closing in it moves nothing
  (decision 67, rule 10).
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Notice } from "$lib/state/openSession";
  import { copy } from "$lib/text/copy";
  import * as Card from "$lib/ui/primitives/card";
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
    /** The Results card's content, given the heading's id, which names the result table's scroll region. */
    results: Snippet<[headingId: string]>;
    /** The chart card's controls, at the right of its heading row (decision 73, rule 8). */
    chartActions: Snippet;
    chart: Snippet;
  }

  let { notice, onclosenotice, navigation, sessionControls, inputs, results, chartActions, chart }: Props = $props();

  const id = $props.id();
</script>

<!-- The middle dot the copy separates with (the Image's footer, the legend), hidden from a screen reader. -->
{#snippet separator()}
  <span aria-hidden="true">·</span>
{/snippet}

<Sidebar.Provider class="flex-col" style="--sidebar-width: 14rem;">
  <SiteHeader {notice} {onclosenotice} />

  <div class="flex flex-1">
    <AppSidebar {navigation} {sessionControls} />
    <!--
      The inset is the block's content area, the page's `main`, on the ground,
      and a container: two columns, the inputs at `24rem` and the results and
      the chart beside them, while it is at least `70rem` wide, the input
      column, the chart card's plot and the legend's basis with their gaps
      (decision 73, rule 10); one column below, the input card above. The page
      gutter is the spacing token on three sides; on the fourth the sidebar's
      own insets make it, so its fills stand that far from the cards and its
      first group label's top is level with theirs.
    -->
    <Sidebar.Inset class="@container min-w-0 bg-transparent">
      <div
        class="grid grid-cols-[minmax(0,1fr)] items-start gap-(--space-page) p-(--space-page) pl-0 @min-[70rem]:grid-cols-[24rem_minmax(0,1fr)]"
      >
        <Card.Root>
          <Card.Header>
            <Card.Title><h2>{copy.inputs}</h2></Card.Title>
          </Card.Header>
          <Card.Content>
            {@render inputs()}
          </Card.Content>
        </Card.Root>
        <div class="grid min-w-0 gap-(--space-page)">
          <Card.Root>
            <Card.Header>
              <Card.Title><h2 id="{id}-results">{copy.results}</h2></Card.Title>
            </Card.Header>
            <Card.Content>
              {@render results(`${id}-results`)}
            </Card.Content>
          </Card.Root>
          <Card.Root>
            <!-- One row: the heading, and the controls on the title's line rather than the primitive's two rows. -->
            <Card.Header class="items-center">
              <Card.Title><h2>{copy.chart}</h2></Card.Title>
              <Card.Action class="row-span-1 self-center">
                {@render chartActions()}
              </Card.Action>
            </Card.Header>
            <Card.Content>
              {@render chart()}
            </Card.Content>
          </Card.Root>
        </div>
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
    class="flex items-center justify-between gap-(--space-page) bg-(--brand) p-(--space-page) text-(length:--font-size-caption) text-background [&_a]:text-background [&_a]:underline [&_a]:underline-offset-2 [&_a]:[--ring:var(--background)]"
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
    <div class="flex shrink-0 items-center gap-(--space-page)">
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
