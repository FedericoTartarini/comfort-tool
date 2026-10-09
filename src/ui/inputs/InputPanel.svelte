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
  import { enteredBound, splitViolations, warningFor } from "$lib/core/applicability";
  import type { RegisteredModel } from "$lib/core/modelDeclaration";
  import type { Quantity } from "$lib/core/quantities";
  import { enteredValue, panelQuantities, rowEntryGroupOf } from "$lib/core/slot";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import SlotColumns from "$lib/ui/layout/SlotColumns.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import * as Alert from "$lib/ui/primitives/alert";
  import { Checkbox } from "$lib/ui/primitives/checkbox";
  import { Label } from "$lib/ui/primitives/label";
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
  const rows = $derived(panelQuantities(model, firstSlot));
  /** Over several slots each control is named for its slot as well. */
  const namesSlots = $derived(columns.length > 1);

  function entryOf({ inputSlot, outputs }: SlotColumn, quantity: Quantity): QuantityEntry {
    return {
      value: enteredValue(inputSlot, quantity, model, atmosphericPressure) ?? Number.NaN,
      bound: enteredBound(model, quantity, inputSlot, atmosphericPressure),
      outOfRange: outputs.outOfRangeQuantities.includes(quantity),
      slotName: namesSlots ? outputs.badge.name : undefined,
      oncommit: (si) => inputSlot.setEntered(quantity, si),
    };
  }

  function entriesOf(quantity: Quantity): readonly [QuantityEntry, ...(QuantityEntry | null)[]] {
    const [head, ...rest] = columns;
    return [entryOf(head, quantity), ...rest.map((column) => column && entryOf(column, quantity))];
  }

  // Everything but the result's own bound. Entered values are gated before the call against every row of the
  // model's info, so an `input` row here is a limit the info does not carry: PMV (ASHRAE 55)'s on the relative
  // air speed at the operative temperature — so the sentence names the relative air speed, under either air-speed mode.
  const hints = $derived(columns.map((column) => (column ? splitViolations(column.outputs.violations).inputs : [])));
  const hasHints = $derived(hints.some((slotHints) => slotHints.length > 0));
</script>

<Stack gap="4">
  {#each rows as quantity (quantity)}
    {@const group = rowEntryGroupOf(model, firstSlot, quantity)}
    <!-- A row that offers an entry group's modes has the group's menu button beside its label (ADR-0002 decision 72). -->
    {#snippet entryGroupMenuButton()}
      {#if group}
        <EntryGroupMenuButton {group} setters={entryModeSetters} />
      {/if}
    {/snippet}
    <QuantityInput
      {quantity}
      {unitSystem}
      besideLabel={group ? entryGroupMenuButton : undefined}
      entries={entriesOf(quantity)}
    />
  {/each}

  <!-- Always shown and always live: whether an option applies at the entered values is the library's to say.
       Addressed by position: an option's key is the library's and the share link's string, not the markup's. -->
  {#each model.options as option, index (option)}
    {#if namesSlots}
      <Stack gap="1">
        <Label for="{id}-option-{index}-0">{option.label}</Label>
        <SlotColumns count={columns.length}>
          {#each columns as column, position (position)}
            <div>
              {#if column}
                <Checkbox
                  id="{id}-option-{index}-{position}"
                  aria-label={copy.slotControl(option.label, column.outputs.badge.name)}
                  checked={column.inputSlot.options.get(option)}
                  onCheckedChange={(checked) => column.inputSlot.setOption(option, checked)}
                />
              {/if}
            </div>
          {/each}
        </SlotColumns>
      </Stack>
    {:else}
      <Inline gap="2" align="center">
        <Checkbox
          id="{id}-option-{index}-0"
          checked={firstSlot.options.get(option)}
          onCheckedChange={(checked) => firstSlot.setOption(option, checked)}
        />
        <Label for="{id}-option-{index}-0">{option.label}</Label>
      </Inline>
    {/if}
  {/each}

  <!-- A slot's applicability hints are the generated alert (the shell's spec, "The result table"), in its default
       variant, which leaves red to the kept rows' note: the lead as its title, one hint a line. -->
  {#if hasHints}
    <SlotColumns count={columns.length}>
      {#each hints as slotHints, position (position)}
        <div>
          {#if slotHints.length > 0}
            <Alert.Root>
              <Alert.Title>{copy.applicabilityHint}</Alert.Title>
              {#each slotHints as violation (violation)}
                <Alert.Description>{warningFor(violation, unitSystem)}</Alert.Description>
              {/each}
            </Alert.Root>
          {/if}
        </div>
      {/each}
    </SlotColumns>
  {/if}
</Stack>
