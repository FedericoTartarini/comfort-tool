<!--
  A quantity's row, one shape for every row (ADR-0002 decision 67, rule 3):
  the label row, then per entry a box, with a quantity's Presets inside it,
  and a caption line under it of the matching preset's name and the bound;
  an entry is a slot's, or the session's pressure.
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
    /** Allowed bound in SI; shown converted, and the box turns red outside it. A `Bound` may be min-only or max-only. */
    bound?: Bound;
    outOfRange?: boolean;
    /** The slot's name, where the row stands over several slots: the box and its Presets are named for it. */
    slotName?: string;
    oncommit: (si: number) => void;
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
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Label } from "$lib/ui/primitives/label";
  import NumberInput from "./NumberInput.svelte";
  import PresetMenuButton from "./PresetMenuButton.svelte";

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
  const presets = $derived(presetsFor(quantity));

  /** The caption line under a box: the matching preset's name and the bound, either alone where the other is not. */
  function captionOf(entry: QuantityEntry): string {
    const preset = matchingPreset(quantity, entry.value)?.label;
    const bound = entry.bound && formatBound(entry.bound, quantity, unitSystem);
    return preset && bound ? copy.rowCaption(preset, bound) : (preset ?? bound ?? "");
  }

  /** `control`'s accessible name with the entry's slot in it, where the row stands over several slots. */
  function controlNameFor(control: string, entry: QuantityEntry): string | undefined {
    return entry.slotName && copy.slotControl(control, entry.slotName);
  }
</script>

<Stack gap="1">
  <Inline gap="2" align="center">
    <Label for="{id}-0">{labelText}</Label>
    {@render besideLabel?.()}
  </Inline>
  <SlotColumns count={entries.length}>
    {#each entries as entry, index (index)}
      <Stack gap="1">
        {#if entry}
          {#snippet presetMenu()}
            {#if presets}
              <PresetMenuButton {presets} {unit} name={controlNameFor(copy.presetTrigger, entry) ?? copy.presetTrigger} oncommit={entry.oncommit} />
            {/if}
          {/snippet}
          <NumberInput
            id="{id}-{index}"
            value={entry.value}
            {unit}
            invalid={entry.outOfRange}
            ariaLabel={controlNameFor(labelText, entry)}
            end={presets ? presetMenu : undefined}
            oncommit={entry.oncommit}
          />
          <span class="caption-line">{captionOf(entry)}</span>
        {/if}
      </Stack>
    {/each}
  </SlotColumns>
</Stack>
