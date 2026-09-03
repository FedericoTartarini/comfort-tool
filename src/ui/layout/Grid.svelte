<script lang="ts">
  import type { Snippet } from "svelte";
  import { gapClass, type Gap } from "./spacing";

  interface Props {
    /** A CSS `grid-template-columns` value. */
    columns: string;
    gap?: Gap;
    children: Snippet;
  }

  let { columns, gap = "4", children }: Props = $props();
</script>

<div class="grid items-start {gapClass[gap]}" style:grid-template-columns={columns}>
  {@render children()}
</div>
