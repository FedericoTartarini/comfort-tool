<script lang="ts">
  import type { Snippet } from "svelte";
  import { gapClass, type Gap } from "./spacing";

  interface Props {
    gap?: Gap;
    children: Snippet;
  }

  let { gap = "4", children }: Props = $props();
</script>

<div class="flex flex-col {gapClass[gap]}">
  {@render children()}
</div>
