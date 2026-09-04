<script lang="ts">
  import type { Quantity } from "jsthermalcomfort/io";
  import type { Range } from "$lib/core/modelDeclaration";
  import { formatNumber } from "$lib/core/numberFormat";
  import { displayUnitFor } from "$lib/core/units";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Input } from "$lib/ui/primitives/input";
  import { Label } from "$lib/ui/primitives/label";

  interface Props {
    quantity: Quantity;
    /** Canonical SI value. */
    value: number;
    unitSystem: UnitSystem;
    /** Allowed range in SI; shown converted, and the box turns red outside it. */
    range?: Range;
    outOfRange?: boolean;
    oncommit: (si: number) => void;
  }

  let { quantity, value, unitSystem, range, outOfRange = false, oncommit }: Props = $props();

  const id = $props.id();
  const unit = $derived(displayUnitFor(quantity, unitSystem));
  const text = $derived(formatNumber(unit.fromSi(value)));
  const labelText = $derived(unit.symbol ? `${quantity.label} (${unit.symbol})` : quantity.label);
  const rangeText = $derived(
    range ? `${formatNumber(unit.fromSi(range.min))} – ${formatNumber(unit.fromSi(range.max))}` : "",
  );

  // Commit only when the parsed value differs from what is stored. While the
  // user types "25." the parse is still 25, nothing is committed, and the
  // displayed text is not rewritten under their cursor.
  function commit(event: Event) {
    const parsed = Number.parseFloat((event.currentTarget as HTMLInputElement).value);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const si = unit.toSi(parsed);
    if (si !== value) {
      oncommit(si);
    }
  }

  function restore(event: FocusEvent) {
    (event.currentTarget as HTMLInputElement).value = text;
  }
</script>

<Stack gap="1">
  <Inline justify="between" align="baseline">
    <Label for={id}>{labelText}</Label>
    {#if rangeText}
      <span class="range">{rangeText}</span>
    {/if}
  </Inline>
  <Input
    {id}
    type="number"
    step={unit.step}
    value={text}
    aria-invalid={outOfRange || undefined}
    oninput={commit}
    onblur={restore}
  />
</Stack>

<style>
  .range {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }
</style>
