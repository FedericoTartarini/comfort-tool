<!--
  A quantity's row, one shape for every row (ADR-0002 decision 67, rule 3):
  the label row, then per entry a box, with the row's menu of its presets
  inside it, and a caption line under it of the bound with its unit
  (ADR-0002 decision 84, rule 10); an entry is a slot's, or the session's
  pressure. The row is the generated
  field, and each entry's box and caption a field of their own, marked
  invalid while the entry is out of range (the shell's spec, "The rows").
  On Compare the label row stands over the three slot columns, so it names
  the first slot's box as a label does and each box is named for its slot as
  well.
-->
<script module lang="ts">
  import type { Bound } from "$lib/core/applicability";

  /** One box in a row: a slot's, or the session's pressure. */
  export interface QuantityEntry {
    /** Canonical SI value. */
    value: number;
    /** Allowed bound in SI; shown converted, a step stops at it, and the box turns red outside it. A `Bound` may be min-only or max-only. */
    bound?: Bound;
    outOfRange?: boolean;
    /** The slot's badge's name, while the slots are named: the box and its menu are named for it. */
    slotName?: string;
    /**
     * Whether an SI value is taken as it is: a typed one may commit on a pause in the typing, and a preset may be
     * picked (ADR-0002 decision 84, rules 2 and 5); every one, without it.
     */
    isLegal?: (si: number) => boolean;
    /** Commit an SI value, typed, stepped or a preset's: the owner writes it, cut or refused. */
    oncommit: (si: number) => void;
  }
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { formatBound } from "$lib/core/applicability";
  import { presetsFor } from "$lib/core/presets";
  import type { Quantity } from "$lib/core/quantities";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import { displayUnitFor, labelWithUnit, valueWithUnit } from "$lib/core/units";
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
    /** One per slot column, in slot order; `null` keeps the column of a slot not compared empty. */
    entries: readonly [QuantityEntry, ...(QuantityEntry | null)[]];
  }

  let { quantity, unitSystem, besideLabel, entries }: Props = $props();

  const id = $props.id();
  const unit = $derived(displayUnitFor(quantity, unitSystem));
  const labelText = $derived(labelWithUnit(quantity, unit));
  const presets = $derived(presetsFor(quantity) ?? []);

  /** The caption line under a box: the bound with the display unit, `10 – 40 °C`, or nothing where there is none. */
  function captionOf(entry: QuantityEntry): string {
    return entry.bound ? valueWithUnit(formatBound(entry.bound, quantity, unitSystem), unit) : "";
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
          <RowMenuButton {presets} {unit} slotName={entry.slotName} isLegal={entry.isLegal} oncommit={entry.oncommit} />
        {/snippet}
        <Field.Field data-invalid={entry.outOfRange || undefined}>
          <NumberInput
            id="{id}-{index}"
            value={entry.value}
            {unit}
            bound={entry.bound}
            invalid={entry.outOfRange}
            isLegal={entry.isLegal}
            ariaLabel={controlNameFor(labelText, entry)}
            end={presets.length > 0 ? rowMenu : undefined}
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
