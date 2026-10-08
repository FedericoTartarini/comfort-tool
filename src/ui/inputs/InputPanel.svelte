<script lang="ts">
  import { enteredBound, splitViolations, warningFor, type ViolationRow } from "$lib/core/applicability";
  import type { RegisteredModel } from "$lib/core/modelDeclaration";
  import { presetsFor } from "$lib/core/presets";
  import type { Quantity } from "$lib/core/quantities";
  import { enteredValue, panelQuantities, rowEntryGroupOf } from "$lib/core/slot";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import type { InputSlot } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Checkbox } from "$lib/ui/primitives/checkbox";
  import { Label } from "$lib/ui/primitives/label";
  import EntryModeSelect, { type EntryModeSetters } from "./EntryModeSelect.svelte";
  import PresetInput from "./PresetInput.svelte";
  import QuantityInput from "./QuantityInput.svelte";

  interface Props {
    model: RegisteredModel;
    inputSlot: InputSlot;
    unitSystem: UnitSystem;
    /** The session's, in Pa: the slot converts its humidity entry at it. */
    atmosphericPressure: number;
    outOfRangeQuantities: readonly Quantity[];
    violations: readonly ViolationRow[];
    /** The session's: a row's entry-mode select converts every slot (ADR-0002 decision 51). */
    entryModeSetters: EntryModeSetters;
  }

  let { model, inputSlot, unitSystem, atmosphericPressure, outOfRangeQuantities, violations, entryModeSetters }: Props = $props();

  const id = $props.id();

  const rows = $derived(panelQuantities(model, inputSlot));

  // Everything but the result's own bound. Entered values are gated before the call against every row of the
  // model's info, so an `input` row here is a limit the info does not carry: PMV (ASHRAE 55)'s on the relative
  // air speed at the operative temperature — so the sentence names the relative air speed, under either air-speed mode.
  const hints = $derived(splitViolations(violations).inputs);

  function shownValueFor(quantity: Quantity): number {
    return enteredValue(inputSlot, quantity, model, atmosphericPressure) ?? Number.NaN;
  }
</script>

<Stack gap="4">
  {#each rows as quantity (quantity)}
    {@const group = rowEntryGroupOf(model, inputSlot, quantity)}
    <!-- A row that offers an entry group's modes has their select for its label (ADR-0002 decision 68). -->
    {#snippet entryModeLabel(labelText: string)}
      {#if group}
        <EntryModeSelect {group} {labelText} setters={entryModeSetters} />
      {/if}
    {/snippet}
    {@const rowProps = {
      quantity,
      value: shownValueFor(quantity),
      unitSystem,
      bound: enteredBound(model, quantity, inputSlot, atmosphericPressure),
      outOfRange: outOfRangeQuantities.includes(quantity),
      labelControl: group ? entryModeLabel : undefined,
      oncommit: (si: number) => inputSlot.setEntered(quantity, si),
    }}
    {@const presets = presetsFor(quantity)}
    {#if presets}
      <PresetInput {...rowProps} {presets} />
    {:else}
      <QuantityInput {...rowProps} />
    {/if}
  {/each}

  <!-- Always shown and always live: whether an option applies at the entered values is the library's to say.
       Addressed by position: an option's key is the library's and the share link's string, not the markup's. -->
  {#each model.options as option, index (option)}
    <Inline gap="2" align="center">
      <Checkbox
        id="{id}-option-{index}"
        checked={inputSlot.options.get(option)}
        onCheckedChange={(checked) => inputSlot.setOption(option, checked)}
      />
      <Label for="{id}-option-{index}">{option.label}</Label>
    </Inline>
  {/each}

  {#if hints.length > 0}
    <Stack gap="1">
      <span class="hint">{copy.applicabilityHint}</span>
      {#each hints as violation (violation)}
        <span class="hint">{warningFor(violation, unitSystem)}</span>
      {/each}
    </Stack>
  {/if}
</Stack>

<style>
  .hint {
    font-size: var(--font-size-caption);
    color: var(--muted-foreground);
  }
</style>
