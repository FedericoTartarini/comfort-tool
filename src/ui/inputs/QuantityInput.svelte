<!--
  A quantity's row, one shape for every row (ADR-0002 decision 67, rule 3):
  the label row, then its boxes, each with the row's menu of its presets
  inside it and a caption line under it of the bound with its unit (ADR-0002
  decision 84, rule 10); a box is a slot's, the session's atmospheric
  pressure, or an input calculator's own input. The row is the generated
  field, and each box and its caption a field of their own, marked invalid
  while its value is out of range (the shell's spec, "The rows").
  On Compare the label row stands over the three slot columns, so it names
  the first slot's box as a label does and each box is named for its slot as
  well.
-->
<script module lang="ts">
  import type { Bound } from "$lib/core/applicability";

  /** One box in a row: a slot's, the session's atmospheric pressure, or an input calculator's own input. */
  export interface QuantityBox {
    /** Canonical SI value. */
    value: number;
    /** Allowed bound in SI; shown converted, a step stops at it, and the box turns red outside it. A `Bound` may be min-only or max-only. */
    bound?: Bound;
    outOfRange?: boolean;
    /** The label the slot's appearance carries while the slots are named: the box and its menu are named for it. */
    slotLabel?: string;
    /**
     * Whether an SI value is taken as it is: a typed one may commit on a pause in the typing, and a preset may be
     * picked (ADR-0002 decision 84, rules 2 and 5); every one, without it.
     */
    isWithinBounds?: (si: number) => boolean;
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
    boxes: readonly [QuantityBox, ...(QuantityBox | null)[]];
  }

  let { quantity, unitSystem, besideLabel, boxes }: Props = $props();

  const id = $props.id();
  const unit = $derived(displayUnitFor(quantity, unitSystem));
  const labelText = $derived(labelWithUnit(quantity, unit));
  const presets = $derived(presetsFor(quantity) ?? []);

  /** The caption line under a box: the bound with the display unit, `10 – 40 °C`, or nothing where there is none. */
  function captionOf(box: QuantityBox): string {
    return box.bound ? valueWithUnit(formatBound(box.bound, quantity, unitSystem), unit) : "";
  }

  /** `control`'s accessible name with the box's slot in it, while the slots are named. */
  function controlNameFor(control: string, box: QuantityBox): string | undefined {
    return box.slotLabel && copy.slotControl(control, box.slotLabel);
  }
</script>

<Field.Field>
  <Inline gap="2" align="center">
    <Field.Label for="{id}-0">{labelText}</Field.Label>
    {@render besideLabel?.()}
  </Inline>
  <SlotColumns count={boxes.length}>
    {#each boxes as box, index (index)}
      {#if box}
        {#snippet rowMenu()}
          <RowMenuButton {presets} {unit} slotLabel={box.slotLabel} isWithinBounds={box.isWithinBounds} oncommit={box.oncommit} />
        {/snippet}
        <Field.Field data-invalid={box.outOfRange || undefined}>
          <NumberInput
            id="{id}-{index}"
            value={box.value}
            {unit}
            bound={box.bound}
            invalid={box.outOfRange}
            isWithinBounds={box.isWithinBounds}
            ariaLabel={controlNameFor(labelText, box)}
            end={presets.length > 0 ? rowMenu : undefined}
            oncommit={box.oncommit}
          />
          <Field.Description class="caption-line">{captionOf(box)}</Field.Description>
        </Field.Field>
      {:else}
        <!-- A slot not compared keeps its column, empty. -->
        <div></div>
      {/if}
    {/each}
  </SlotColumns>
</Field.Field>
