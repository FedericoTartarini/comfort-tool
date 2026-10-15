<script lang="ts">
  import type { Snippet } from "svelte";
  import { gapClass, type Gap } from "./spacing";

  interface Props {
    /** A CSS `grid-template-columns` value. */
    columns: string;
    gap?: Gap;
    /** `stretch` makes every cell its row's height, so a cell can stand its content at its foot. */
    align?: "start" | "stretch";
    children: Snippet;
  }

  let { columns, gap = "4", align = "start", children }: Props = $props();

  const alignClass = { start: "items-start", stretch: "items-stretch" };
</script>

<div class="grid {alignClass[align]} {gapClass[gap]}" style:grid-template-columns={columns}>
  {@render children()}
</div>
