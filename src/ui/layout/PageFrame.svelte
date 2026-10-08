<!--
  The page frame every page composes (ADR-0002 decision 65, rule 4; decision
  67): a header of the title and the Documentation link with the notice line
  between them, three columns with a rule between each, the left one the
  navigation and, under a rule, the session controls, and a footer of the
  versions, the licence, the code and the citation. The header's least
  height, `min-h-8`, is above the notice line's, a line of text beside a
  small button, so a notice appearing or closing moves nothing (rule 10)
  while its text keeps to one line.
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
  <header class="grid min-h-8 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-6 border-b px-6 py-3 box-content">
    <h1>{copy.appTitle}</h1>
    <div class="flex justify-center">
      <NoticeLine {notice} onclose={onclosenotice} />
    </div>
    <a href={copy.documentationAddress}>{copy.documentation}</a>
  </header>

  <div class="grid flex-1 grid-cols-[13rem_minmax(0,1fr)]">
    <div class="flex flex-col gap-6 border-r p-6">
      {@render navigation()}
      <div class="border-t pt-6">
        {@render sessionControls()}
      </div>
    </div>
    <main class="grid grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <section class="border-r p-6">
        {@render inputs()}
      </section>
      <section class="p-6">
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
