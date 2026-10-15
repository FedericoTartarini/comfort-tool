<!--
  A form calculator's tab in the Input calculators dialog (ADR-0002 decision
  75, rules 4 to 6): the line naming the standard's method; then its choice,
  the posture, where it asks one, and each quantity it asks as the panel's
  row, one box, in the session's unit system, held to the calculator's bound
  and marked out of range outside it, the cells in two columns, a row's boxes
  level. These settings are the one region that scrolls. The dialog's dock and
  footer follow, handed the result, which is none while a box is out of range.
  Restore defaults, at the title's right, is enabled once the settings differ
  from where they start; it is drawn last, so the keyboard reaches it after
  Apply and before the dialog's Close.
-->
<script module lang="ts">
  import { SvelteMap } from "svelte/reactivity";
  import type { CalculatorInputs, FormCalculator } from "$lib/core/calculators";

  /**
   * What each calculator's tab holds, one set per calculator, whichever
   * slot or model it is opened for, for as long as the app is loaded: in no
   * session, no link and no kept tab (decision 75, rule 6; ADR-0001 §4.1.5).
   */
  const keptInputs = new SvelteMap<FormCalculator, CalculatorInputs>();
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { calculatorBound, outOfRangeCalculatorInputs } from "$lib/core/applicability";
  import { startingInputs, type CalculatorResult, type PostureOption } from "$lib/core/calculators";
  import type { Quantity } from "$lib/core/quantities";
  import { requireValue } from "$lib/core/slot";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import { copy } from "$lib/text/copy";
  import Grid from "$lib/ui/layout/Grid.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import * as Field from "$lib/ui/primitives/field";
  import ChoiceSelect from "./ChoiceSelect.svelte";
  import type { ResultLine } from "./InputCalculators.svelte";
  import QuantityInput from "./QuantityInput.svelte";

  interface Props {
    calculator: FormCalculator;
    unitSystem: UnitSystem;
    /** The dialog's dock and footer, for the result, none while a box is out of range, and its lines. */
    dock: Snippet<[result: CalculatorResult | null, lines: readonly ResultLine[]]>;
  }

  let { calculator, unitSystem, dock }: Props = $props();

  const id = $props.id();

  const starting = $derived(startingInputs(calculator));
  const inputs = $derived(keptInputs.get(calculator) ?? starting);
  const outOfRange = $derived(outOfRangeCalculatorInputs(calculator, inputs));
  const result = $derived(outOfRange.length > 0 ? null : calculator.compute(inputs));
  const lines = $derived(
    calculator.outputs.map((quantity) => ({ quantity, name: quantity.label, value: result?.outputs.get(quantity) ?? Number.NaN })),
  );
  const changed = $derived(
    inputs.posture !== starting.posture || [...inputs.values].some(([quantity, value]) => starting.values.get(quantity) !== value),
  );

  function setValue(quantity: Quantity, si: number) {
    keptInputs.set(calculator, { ...inputs, values: new Map([...inputs.values, [quantity, si]]) });
  }

  function setPosture(posture: PostureOption["value"]) {
    keptInputs.set(calculator, { ...inputs, posture });
  }
</script>

<div class="calculator-settings">
  <Stack gap="4">
    <p class="caption">{calculator.method}</p>
    <!-- Every cell ends with its box and a caption line, so a row's boxes stand level under labels of one or two lines. -->
    <div class="calculator-form">
      <Grid columns="repeat(2, minmax(0, 1fr))" align="stretch">
        {#if calculator.postures}
          {@render postureSelect(calculator.postures)}
        {/if}
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
      </Grid>
    </div>
  </Stack>
</div>
{@render dock(result, lines)}
<Button variant="ghost" size="sm" class="dialog-title-action" disabled={!changed} onclick={() => keptInputs.delete(calculator)}>
  {copy.restoreDefaults}
</Button>

<!-- The posture chosen by its position among the library's postures, in the Model row's select, a column wide. -->
{#snippet postureSelect(postures: readonly PostureOption[])}
  {@const chosen = postures.find((posture) => posture.value === inputs.posture) ?? postures[0]}
  <Field.Field>
    <Field.Label for="{id}-posture">{copy.posture}</Field.Label>
    <ChoiceSelect
      id="{id}-posture"
      groups={[{ options: postures.map((posture, index) => ({ key: String(index), label: posture.label })) }]}
      chosen={String(postures.indexOf(chosen))}
      onchoose={(key) => setPosture(postures[Number(key)].value)}
    />
    <Field.Description class="caption-line"></Field.Description>
  </Field.Field>
{/snippet}
