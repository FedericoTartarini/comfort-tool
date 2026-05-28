<svelte:options runes={true} />

<script lang="ts">
  import type { Snippet } from "svelte";

  import SiteFooter from "./SiteFooter.svelte";
  import SiteHeader from "./SiteHeader.svelte";
  import type { ComfortToolController } from "../state/comfortTool/types";

  interface Props {
    toolState: ComfortToolController;
    children: Snippet;
  }

  let {
    toolState,
    children,
  }: Props = $props();
</script>

<div class="flex min-h-screen flex-col bg-stone-950">
  <SiteHeader {toolState} />

  <main class="flex-1 bg-stone-50">
    {@render children?.()}
  </main>

  <SiteFooter />
</div>
