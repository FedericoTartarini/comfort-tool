<!--
  A quantity's row, one shape for every row (ADR-0002 decision 67, rule 3):
  the label row, then per entry a box, with the row's menu of its presets and
  input calculators inside it, and a caption line under it of the matching
  preset's name and the bound; an entry is a slot's, or the session's
  pressure. The row is the generated
  field, and each entry's box and caption a field of their own, marked
  invalid while the entry is out of range (the shell's spec, "The rows").
  On Compare the label row stands over the three slot columns, so it names
  the first slot's box as a label does and each box is named for its slot as
  well.
-->
<script module lang="ts">
  import type { Bound } from "$lib/core/applicability";
  import type { Calculator } from "$lib/core/calculators";

  /** One box in a row: a slot's, or the session's pressure. */
  export interface QuantityEntry {
    /** Canonical SI value. */
    value: number;
    /** Allowed bound in SI; shown converted, and the box turns red outside it. A `Bound` may be min-only or max-only. */
    bound?: Bound;
    outOfRange?: boolean;
    /** The slot's badge's name, while the slots are named: the box and its menu are named for it. */
    slotName?: string;
    oncommit: (si: number) => void;
    /** Opens `calculator`'s dialog for this entry's slot: an entry of a row with calculators. */
    onopen?: (calculator: Calculator) => void;
  }
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { formatBound } from "$lib/core/applicability";
  import { matchingPreset, presetsFor } from "$lib/core/presets";
  import type { Quantity } from "$lib/core/quantities";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import { displayUnitFor, labelWithUnit } from "$lib/core/units";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import SlotColumns from "$lib/ui/layout/SlotColumns.svelte";
  import * as Field from "$lib/ui/primitives/field";
  import NumberInput from "./NumberInput.svelte";
  import RowMenuButton from "./RowMenuButton.svelte";

  interface Props {
    quantity: Quantity;
    unitSystem: UnitSystem;
    /**
     * Drawn beside the label: a row that can be entered in another mode has
     * its entry group's menu button there (ADR-0002 decision 72).
     */
    besideLabel?: Snippet;
    /** The input calculators the row offers, in its menu beside its presets (ADR-0002 decision 75). */
    calculators?: readonly Calculator[];
    /** One per slot column, in slot order; `null` keeps the column of a slot not compared empty. */
    entries: readonly [QuantityEntry, ...(QuantityEntry | null)[]];
  }

  let { quantity, unitSystem, besideLabel, calculators = [], entries }: Props = $props();

  const id = $props.id();
  const unit = $derived(displayUnitFor(quantity, unitSystem));
  const labelText = $derived(labelWithUnit(quantity, unit));
  const presets = $derived(presetsFor(quantity) ?? []);
  const hasMenu = $derived(presets.length > 0 || calculators.length > 0);

  /** The caption line under a box: the matching preset's name and the bound, either alone where the other is not. */
  function captionOf(entry: QuantityEntry): string {
    const preset = matchingPreset(quantity, entry.value)?.label;
    const bound = entry.bound && formatBound(entry.bound, quantity, unitSystem);
    return preset && bound ? copy.rowCaption(preset, bound) : (preset ?? bound ?? "");
  }

  /** `control`'s accessible name with the entry's slot in it, while the slots are named. */
  function controlNameFor(control: string, entry: QuantityEntry): string | undefined {
    return entry.slotName && copy.slotControl(control, entry.slotName);
  }
</script>

<Field.Field>
  <Inline gap="2" align="center">
    <Field.Label for="{id}-0">{labelText}</Field.Label>
    {@render besideLabel?.()}
  </Inline>
  <SlotColumns count={entries.length}>
    {#each entries as entry, index (index)}
      {#if entry}
        {#snippet rowMenu()}
          <RowMenuButton
            {presets}
            {calculators}
            {unit}
            slotName={entry.slotName}
            compact={entries.length > 1}
            oncommit={entry.oncommit}
            onopen={(calculator) => entry.onopen?.(calculator)}
          />
        {/snippet}
        <Field.Field data-invalid={entry.outOfRange || undefined}>
          <NumberInput
            id="{id}-{index}"
            value={entry.value}
            {unit}
            invalid={entry.outOfRange}
            ariaLabel={controlNameFor(labelText, entry)}
            end={hasMenu ? rowMenu : undefined}
            oncommit={entry.oncommit}
          />
          <Field.Description class="caption-line">{captionOf(entry)}</Field.Description>
        </Field.Field>
      {:else}
        <!-- A slot not compared keeps its column, empty. -->
        <div></div>
      {/if}
    {/each}
  </SlotColumns>
</Field.Field>
