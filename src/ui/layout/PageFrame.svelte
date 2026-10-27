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
  of the brand's band follows the row, hand-made, as no block has one; below
  `md` the sidebar is the primitive's sheet, out of the row, and the inset
  takes the gutter its insets gave (decision 73, rule 10). The header
  and the footer run the page's width and scroll with it; wider than the
  content needs, the row and the bands' contents stand in one frame,
  `--frame-width`, centred in the window (rule 10 as revised again
  2026-10-12). The provider's Cmd/Ctrl+B is stopped at the window, so it
  writes no cookie (rule 6).
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { copy } from "$lib/text/copy";
  import * as Card from "$lib/ui/primitives/card";
  import * as Sidebar from "$lib/ui/primitives/sidebar";
  import { SIDEBAR_KEYBOARD_SHORTCUT } from "$lib/ui/primitives/sidebar/constants";
  import AppSidebar from "./AppSidebar.svelte";
  import { marks } from "./marks";
  import type { InAppLink } from "./NavGroup.svelte";
  import SiteHeader from "./SiteHeader.svelte";

  interface Props {
    /** The header's mark's link, which the page writes and follows as its navigation's (decision 73, rule 5). */
    mark: InAppLink;
    navigation: Snippet;
    sessionControls: Snippet;
    inputs: Snippet;
    /** The Inputs card's actions, at the right of its heading row as the chart card's are: Compare, on Standard. */
    inputsActions?: Snippet;
    /** The Results card's content, given the heading's id, which names the result table's scroll region. */
    results: Snippet<[headingId: string]>;
    /** The chart card's actions, at the right of its heading row (decision 73, rule 8 as revised 2026-10-12). */
    chartActions: Snippet;
    /** The chart card's content: the view row, then the plot and the legend. */
    chart: Snippet;
  }

  let { mark, navigation, sessionControls, inputs, inputsActions, results, chartActions, chart }: Props = $props();

  const id = $props.id();

  // The tool sets no cookie (decision 73, rule 6), and the sidebar provider's Cmd/Ctrl+B writes `sidebar_state`
  // whatever its `open`, at a width where the sidebar never collapses. The key stops at the window, before the
  // provider's listener hears it, and does what the browser does with it; below `md` it no longer opens the sheet,
  // which the trigger does.
  function stopSidebarShortcut(event: KeyboardEvent) {
    if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) event.stopPropagation();
  }
</script>

<svelte:window onkeydowncapture={stopSidebarShortcut} />

<!-- The middle dot the copy separates with (the Image's footer, the legend), hidden from a screen reader. -->
{#snippet separator()}
  <span aria-hidden="true">·</span>
{/snippet}

<!--
  The frame: the sidebar and the main area's `76rem`, the main area's width at
  1440 px, so a wide monitor keeps those proportions (decision 73, rule 10 as
  revised again 2026-10-12).
-->
<Sidebar.Provider class="flex-col" style="--sidebar-width: 14rem; --frame-width: calc(var(--sidebar-width) + 76rem);">
  <SiteHeader {mark} />

  <div class="mx-auto flex w-full max-inline-(--frame-width) flex-1">
    <AppSidebar {navigation} {sessionControls} />
    <!--
      The inset is the block's content area, the page's `main`, on the ground,
      and a container: two columns, the input card and the results and the
      chart beside them, while it is at least `74.5rem` wide, the input card,
      the chart card's plot and the legend's basis with their gaps (decision
      73, rule 10, the sum recomputed by decision 84, rule 12); one column
      below, the input card above the others at the left. The input card is
      `28.75rem` at every width, the narrowest at which three slots show
      Presets beside a four-character value
      (`.scratch/input-gate/issues/04-…md` Comments); its column is `auto`,
      so the card's width is written once. The page
      gutter is the spacing token on three sides; on the fourth the sidebar's
      own insets make it, so its fills stand that far from the cards and its
      first group label's top is level with theirs. Below `md` the sidebar is
      a sheet out of the row, the inset its first child, and the token makes
      the fourth side too.
    -->
    <Sidebar.Inset class="@container min-w-0 bg-transparent first:pl-(--space-page)">
      <div
        class="grid grid-cols-[minmax(0,1fr)] items-start gap-(--space-page) p-(--space-page) pl-0 @min-[74.5rem]:grid-cols-[auto_minmax(0,1fr)]"
      >
        <Card.Root class="w-[28.75rem]">
          <Card.Header class="items-center">
            <Card.Title><h2>{copy.inputs}</h2></Card.Title>
            {#if inputsActions}
              <Card.Action class="row-span-1 self-center">
                {@render inputsActions()}
              </Card.Action>
            {/if}
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
            <!-- One row: the heading, and the actions on the title's line rather than the primitive's two rows. -->
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
    right, each a link to its institution; the two sides in the frame.
  -->
  <footer
    class="bg-(--brand) text-(length:--font-size-caption) text-background [&_a]:text-background [&_a]:underline [&_a]:underline-offset-2 [&_a]:[--ring:var(--background)]"
  >
    <div class="mx-auto flex max-inline-(--frame-width) items-center justify-between gap-(--space-page) p-(--space-page)">
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
    </div>
  </footer>
</Sidebar.Provider>
