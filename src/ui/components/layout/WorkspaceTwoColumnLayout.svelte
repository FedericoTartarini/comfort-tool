<svelte:options runes={true} />

<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    gridColsClass?: string;
    asideId?: string;
    asideClass?: string;
    mainClass?: string;
    aside: Snippet;
    main: Snippet;
  }

  let {
    gridColsClass = "xl:grid-cols-[24rem_minmax(0,1fr)]",
    asideId,
    asideClass = "min-w-0",
    mainClass = "min-w-0",
    aside,
    main,
  }: Props = $props();
</script>

<div class="mx-auto grid w-full max-w-screen-2xl items-start gap-4 {gridColsClass}">
  <aside id={asideId} class={asideClass}>
    {@render aside()}
  </aside>
  <section class={mainClass}>
    {@render main()}
  </section>
</div>
