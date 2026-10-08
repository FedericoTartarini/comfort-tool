<!--
  Slot columns: one alone, or on Compare a third each, whether its slot is
  enabled or not, so enabling one moves no other (ADR-0002 decision 50;
  decision 67, rule 8). Every row of the input column lays its slots out
  here, so the slot buttons, the boxes and the captions of one slot stand in
  one column; the session's pressure is one column.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import Grid from "./Grid.svelte";

  interface Props {
    count: number;
    children: Snippet;
  }

  let { count, children }: Props = $props();
</script>

<Grid columns="repeat({count}, minmax(0, 1fr))" gap="2">
  {@render children()}
</Grid>
