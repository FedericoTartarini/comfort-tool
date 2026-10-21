<script module lang="ts">
  import type { SlotOutputs } from "$lib/state/compute.svelte";
  import type { InputSlot } from "$lib/state/session.svelte";

  /** One slot's column: what the slot holds and what its outputs say of it. */
  export interface SlotColumn {
    inputSlot: InputSlot;
    outputs: SlotOutputs;
  }
</script>

<script lang="ts">
  import { enteredBound } from "$lib/core/applicability";
  import type { OptionSpec, RegisteredModel } from "$lib/core/modelDeclaration";
  import type { Quantity } from "$lib/core/quantities";
  import { enteredValue, panelRows, rowEntryGroupOf, type PanelRow } from "$lib/core/slot";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import SlotColumns from "$lib/ui/layout/SlotColumns.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Label } from "$lib/ui/primitives/label";
  import { Switch } from "$lib/ui/primitives/switch";
  import EntryGroupMenuButton, { type EntryModeSetters } from "./EntryGroupMenuButton.svelte";
  import QuantityInput, { type QuantityEntry } from "./QuantityInput.svelte";

  interface Props {
    model: RegisteredModel;
    /**
     * One per slot column, in slot order: slot 1 alone, or on Compare the
     * three, `null` for a slot not compared, whose column stays empty.
     */
    columns: readonly [SlotColumn, ...(SlotColumn | null)[]];
    unitSystem: UnitSystem;
    /** The session's, in Pa: a slot converts its humidity entry at it. */
    atmosphericPressure: number;
    /** The session's: a row's entry group menu button converts every slot (ADR-0002 decision 51). */
    entryModeSetters: EntryModeSetters;
  }

  let { model, columns, unitSystem, atmosphericPressure, entryModeSetters }: Props = $props();

  const id = $props.id();

  // Every slot is in the session's entry modes (ADR-0002 decision 51), so slot 1's rows and groups are every slot's.
  const firstSlot = $derived(columns[0].inputSlot);
  const rows = $derived(panelRows(model, firstSlot));
  /** Over several columns an option's switches stand in the slot columns under its label, a layout question. */
  const inColumns = $derived(columns.length > 1);

  /** A row's key is what it lists, which stays the same object while the rows re-derive. */
  function keyOf(row: PanelRow): Quantity | OptionSpec {
    return "option" in row ? row.option : row.quantity;
  }

  function entryOf(column: SlotColumn, quantity: Quantity): QuantityEntry {
    const { inputSlot, outputs } = column;
    return {
      value: enteredValue(inputSlot, quantity, model, atmosphericPressure) ?? Number.NaN,
      bound: enteredBound(model, quantity, inputSlot, atmosphericPressure),
      outOfRange: outputs.outOfRangeQuantities.includes(quantity),
      slotName: outputs.badge.name,
      oncommit: (si) => inputSlot.setEntered(quantity, si),
    };
  }

  function entriesOf(quantity: Quantity): readonly [QuantityEntry, ...(QuantityEntry | null)[]] {
    const [head, ...rest] = columns;
    return [entryOf(head, quantity), ...rest.map((column) => column && entryOf(column, quantity))];
  }
</script>

<!-- Always shown and always live: whether an option applies at the entered values is the library's to say.
     Addressed by its row's position: an option's key is the library's and the share link's string, not the markup's.
     A setting on or off at once, so a switch (ADR-0002 decision 76, rule 1); under Compare each column's says its
     state beside it, its name already saying it to a screen reader (rule 2). -->
{#snippet optionRow(option: OptionSpec, index: number)}
  {#if inColumns}
    <Stack gap="1">
      <Label for="{id}-option-{index}-0">{option.label}</Label>
      <SlotColumns count={columns.length}>
        {#each columns as column, position (position)}
          <div>
            {#if column}
              {@const isOn = column.inputSlot.options.get(option)}
              <Inline gap="2" align="center">
                <Switch
                  id="{id}-option-{index}-{position}"
                  aria-label={column.outputs.badge.name && copy.slotControl(option.label, column.outputs.badge.name)}
                  checked={isOn}
                  onCheckedChange={(checked) => column.inputSlot.setOption(option, checked)}
                />
                <span class="caption" aria-hidden="true">{isOn ? copy.on : copy.off}</span>
              </Inline>
            {/if}
          </div>
        {/each}
      </SlotColumns>
    </Stack>
  {:else}
    <Inline gap="2" align="center">
      <Switch
        id="{id}-option-{index}-0"
        checked={firstSlot.options.get(option)}
        onCheckedChange={(checked) => firstSlot.setOption(option, checked)}
      />
      <Label for="{id}-option-{index}-0">{option.label}</Label>
    </Inline>
  {/if}
{/snippet}

<Stack gap="4">
  <!-- An option's switch stands where its declaration lists it among the rows, tucked under the row it qualifies
       (ADR-0002 decision 36). -->
  {#each rows as row, index (keyOf(row))}
    {#if "option" in row}
      <div class="option-row">
        {@render optionRow(row.option, index)}
      </div>
    {:else}
      {@const group = rowEntryGroupOf(model, firstSlot, row.quantity)}
      <!-- A row that offers an entry group's modes has the group's menu button beside its label (ADR-0002 decision 72). -->
      {#snippet entryGroupMenuButton()}
        {#if group}
          <EntryGroupMenuButton {group} setters={entryModeSetters} />
        {/if}
      {/snippet}
      <QuantityInput
        quantity={row.quantity}
        {unitSystem}
        besideLabel={group ? entryGroupMenuButton : undefined}
        entries={entriesOf(row.quantity)}
      />
    {/if}
  {/each}
</Stack>

