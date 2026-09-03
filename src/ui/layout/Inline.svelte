<script lang="ts">
  import type { Snippet } from "svelte";
  import { gapClass, type Gap } from "./spacing";

  interface Props {
    gap?: Gap;
    align?: "center" | "baseline" | "start";
    justify?: "start" | "between";
    children: Snippet;
  }

  let { gap = "2", align = "center", justify = "start", children }: Props = $props();

  const alignClass = { center: "items-center", baseline: "items-baseline", start: "items-start" };
  const justifyClass = { start: "justify-start", between: "justify-between" };
</script>

<div class="flex flex-row flex-wrap {gapClass[gap]} {alignClass[align]} {justifyClass[justify]}">
  {@render children()}
</div>
