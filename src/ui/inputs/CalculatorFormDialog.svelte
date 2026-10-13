<!--
  An input calculator whose dialog is a form (ADR-0002 decision 75, rules 4
  to 6): each quantity it asks is the panel's row, one box, in the session's
  unit system, held to the calculator's bound and marked out of range outside
  it; under them the result, live, at the app's two decimals. Apply hands the
  result back for the slot whose box opened the dialog, and is disabled while
  a box is out of range, the result cleared; every other way out changes
  nothing. Titled by the calculator, and by the slot while the slots are
  named (decision 50).

  Its look is the generated dialog primitive's, at the one width every dialog
  has (ADR-0002 decision 67, rule 9); it adds no styling of its own.
-->
<script module lang="ts">
  import { SvelteMap } from "svelte/reactivity";
  import type { CalculatorInputs, FormCalculator } from "$lib/core/calculators";

  /**
   * What each calculator's dialog holds, one set per calculator, whichever
   * slot or model opened it, for as long as the app is loaded: in no session,
   * no link and no kept tab (decision 75, rule 6; ADR-0001 §4.1.5).
   */
  const keptInputs = new SvelteMap<FormCalculator, CalculatorInputs>();
</script>

<script lang="ts">
  import { calculatorBound, outOfRangeCalculatorInputs } from "$lib/core/applicability";
  import { startingInputs, type CalculatorResult } from "$lib/core/calculators";
  import { formatNumber } from "$lib/core/numberFormat";
  import type { Quantity } from "$lib/core/quantities";
  import { requireValue } from "$lib/core/slot";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import { displayUnitFor, labelWithUnit } from "$lib/core/units";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import * as Dialog from "$lib/ui/primitives/dialog";
  import QuantityInput from "./QuantityInput.svelte";

  interface Props {
    calculator: FormCalculator;
    /** The slot's badge's name, while the slots are named. */
    slotName?: string;
    unitSystem: UnitSystem;
    onapply: (result: CalculatorResult) => void;
    /** The close button, the Escape key and a click outside. */
    onclose: () => void;
  }

  let { calculator, slotName, unitSystem, onapply, onclose }: Props = $props();

  const id = $props.id();

  const inputs = $derived(keptInputs.get(calculator) ?? startingInputs(calculator));
  const outOfRange = $derived(outOfRangeCalculatorInputs(calculator, inputs));
  const result = $derived(outOfRange.length > 0 ? null : calculator.compute(inputs));
  const title = $derived(slotName ? copy.slotControl(calculator.label, slotName) : calculator.label);

  function setValue(quantity: Quantity, si: number) {
    keptInputs.set(calculator, { ...inputs, values: new Map([...inputs.values, [quantity, si]]) });
  }

  function onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      onclose();
    }
  }
</script>

<Dialog.Root open {onOpenChange}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
    </Dialog.Header>
    <Stack gap="4">
      {#each calculator.asks as { quantity } (quantity)}
        <QuantityInput
          {quantity}
          {unitSystem}
          entries={[
            {
              value: requireValue(inputs.values, quantity),
              bound: calculatorBound(calculator, quantity),
              outOfRange: outOfRange.includes(quantity),
              oncommit: (si) => setValue(quantity, si),
            },
          ]}
        />
      {/each}
      {#if result}
        <Stack gap="1">
          {#each result.outputs as [quantity, value] (quantity)}
            {@const unit = displayUnitFor(quantity, unitSystem)}
            <Inline gap="2" justify="between">
              <!-- Named by its label, so the number is announced with what it is. -->
              <span id="{id}-{quantity.key}">{labelWithUnit(quantity, unit)}</span>
              <output aria-labelledby="{id}-{quantity.key}">{formatNumber(unit.fromSi(value))}</output>
            </Inline>
          {/each}
        </Stack>
      {/if}
    </Stack>
    <Dialog.Footer>
      <Button disabled={result === null} onclick={() => result && onapply(result)}>{copy.calculatorApply}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
