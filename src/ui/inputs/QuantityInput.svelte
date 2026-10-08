<script module lang="ts">
  import type { Snippet } from "svelte";
  import type { Bound } from "$lib/core/applicability";
  import type { Quantity } from "$lib/core/quantities";
  import type { UnitSystem } from "$lib/core/unitSystem";

  export interface Props {
    quantity: Quantity;
    /** Canonical SI value. */
    value: number;
    unitSystem: UnitSystem;
    /** Allowed bound in SI; shown converted, and the box turns red outside it. A `Bound` may be min-only or max-only. */
    bound?: Bound;
    outOfRange?: boolean;
    /**
     * Drawn beside the label: a row that can be entered in another mode has
     * its entry group's menu button there (ADR-0002 decision 72).
     */
    besideLabel?: Snippet;
    oncommit: (si: number) => void;
  }
</script>

<script lang="ts">
  import { formatBound } from "$lib/core/applicability";
  import { displayUnitFor, labelWithUnit } from "$lib/core/units";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Label } from "$lib/ui/primitives/label";
  import NumberInput from "./NumberInput.svelte";

  let { quantity, value, unitSystem, bound, outOfRange = false, besideLabel, oncommit }: Props = $props();

  const id = $props.id();
  const unit = $derived(displayUnitFor(quantity, unitSystem));
  const labelText = $derived(labelWithUnit(quantity, unit));
  const boundText = $derived(bound ? formatBound(bound, quantity, unitSystem) : "");
</script>

<Stack gap="1">
  <Inline justify="between" align="baseline">
    <Inline gap="2" align="center">
      <Label for={id}>{labelText}</Label>
      {@render besideLabel?.()}
    </Inline>
    {#if boundText}
      <span class="bound">{boundText}</span>
    {/if}
  </Inline>
  <NumberInput {id} {value} {unit} invalid={outOfRange} {oncommit} />
</Stack>

<style>
  .bound {
    font-size: var(--font-size-caption);
    color: var(--muted-foreground);
  }
</style>
