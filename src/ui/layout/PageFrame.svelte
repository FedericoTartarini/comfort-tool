<!--
  The page frame every page composes (ADR-0002 decision 65, rule 4; decision
  67): a header of the title and the Documentation link with the notice line
  between them, three columns with a rule between each, the left one the
  navigation and, under a rule, the session controls, and a footer of the
  versions, the licence, the code and the citation. The row the notice line
  stands in holds a least height, `min-h-8`, above the line's own, a line of
  text beside a small button, so a notice appearing or closing moves nothing
  (rule 10) while its text keeps to one line.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Notice } from "$lib/state/openSession";
  import { copy } from "$lib/text/copy";
  import NoticeLine from "$lib/ui/outputs/NoticeLine.svelte";

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

<div class="flex min-h-screen flex-col">
  <!--
    Below `xl` the title stands alone and the notice line has the width under
    it, beside the Documentation link, holding the same least height there.
  -->
  <header
    class="grid min-h-8 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-6 border-b px-6 py-3 box-content max-xl:grid-cols-[minmax(0,1fr)_auto] max-xl:gap-y-2"
  >
    <h1 class="max-xl:col-span-2">{copy.appTitle}</h1>
    <div class="flex justify-center max-xl:min-h-8 max-xl:items-center max-xl:justify-start">
      <NoticeLine {notice} onclose={onclosenotice} />
    </div>
    <a href={copy.documentationAddress}>{copy.documentation}</a>
  </header>

  <!--
    The breakpoints (decision 67, rule 8), here alone: from `xl` the left
    column; below it the navigation and the session controls are one row
    under the header, the stack each one is built of turned along it (the
    navigation's under its `nav`, the session controls' their root), so the
    two components know nothing of the width. From `lg` the inputs and the
    results are two columns, below it one, where the chart's height is a
    ratio of its width (`cqw` against the result column): 0.65, about the
    `26rem` chart's at 1280 px.
  -->
  <div class="grid flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr] xl:grid-cols-[13rem_minmax(0,1fr)] xl:grid-rows-1">
    <div class="flex flex-wrap items-center gap-x-8 gap-y-4 border-b px-6 py-4 xl:flex-col xl:flex-nowrap xl:items-stretch xl:gap-6 xl:border-b-0 xl:border-r xl:p-6">
      <div class="max-xl:[&_nav>*]:flex-row max-xl:[&_nav>*]:gap-x-4">
        {@render navigation()}
      </div>
      <div class="max-xl:*:flex-row max-xl:*:items-center max-xl:*:gap-x-6 max-xl:border-l max-xl:pl-8 xl:border-t xl:pt-6">
        {@render sessionControls()}
      </div>
    </div>
    <main class="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <section class="border-b p-6 lg:border-b-0 lg:border-r">
        {@render inputs()}
      </section>
      <section class="@container p-6 max-lg:[--chart-height:65cqw]">
        {@render results()}
      </section>
    </main>
  </div>

  <footer class="caption border-t px-6 py-3">
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
  </footer>
</div>
