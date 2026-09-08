<script lang="ts">
  import type { Quantity } from "jsthermalcomfort/io";
  import type { ApplicabilityLimit } from "jsthermalcomfort/reference";
  import { humidityMode, temperatureMode, type HumidityMode } from "$lib/core/entryModes";
  import { enteredQuantities, enteredRange, enteredValue } from "$lib/core/libraryInputs";
  import { hasHumidityGroup, hasTemperatureGroup, type RegisteredModel } from "$lib/core/modelDeclaration";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import type { InputSlot } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import QuantityInput from "./QuantityInput.svelte";

  interface Props {
    model: RegisteredModel;
    inputSlot: InputSlot;
    unitSystem: UnitSystem;
    outOfRange: readonly Quantity[];
    violations: readonly ApplicabilityLimit[];
  }

  let { model, inputSlot, unitSystem, outOfRange, violations }: Props = $props();

  // The panel shows the entered representation in the rh row's place; the chart keeps rh.
  const rows = $derived(
    enteredQuantities(model, inputSlot.temperature.mode).map((quantity) =>
      quantity === humidityMode.rh.quantity ? inputSlot.humidity.mode.quantity : quantity,
    ),
  );
  const showTemperatureRow = $derived(hasTemperatureGroup(model));
  const showHumidityRow = $derived(hasHumidityGroup(model));

  // Everything but the result's own bound. Entered values are gated before the call, so an `input` row
  // here comes from a value the panel did not show the library: the relative air speed vr = v + 0.3(met − 1),
  // which the kernel range-checks against the `v` row — so the sentence is the one the entered speed would give.
  const hints = $derived(violations.filter((limit) => limit.role !== "output"));

  function valueOf(quantity: Quantity): number {
    return enteredValue(inputSlot, quantity) ?? Number.NaN;
  }

  function commit(quantity: Quantity, si: number) {
    if (quantity === inputSlot.humidity.mode.quantity) {
      inputSlot.setHumidityValue(si);
    } else {
      inputSlot.values.set(quantity, si);
    }
  }

  function variantFor(mode: typeof temperatureMode.separate | typeof temperatureMode.operative) {
    return inputSlot.temperature.mode === mode ? "default" : "outline";
  }

  function humidityVariantFor(mode: HumidityMode) {
    return inputSlot.humidity.mode === mode ? "default" : "outline";
  }
</script>

<Stack gap="4">
  {#if showTemperatureRow}
    <Inline gap="2" align="center">
      <span>{copy.temperatureInput}</span>
      <Button size="sm" variant={variantFor(temperatureMode.separate)} onclick={() => inputSlot.setTemperatureMode(temperatureMode.separate)}>
        {copy.separateTemperatures}
      </Button>
      <Button size="sm" variant={variantFor(temperatureMode.operative)} onclick={() => inputSlot.setTemperatureMode(temperatureMode.operative)}>
        {copy.operativeTemperature}
      </Button>
    </Inline>
  {/if}

  {#if showHumidityRow}
    <Inline gap="2" align="center">
      <span>{copy.humidityInput}</span>
      {#each Object.values(humidityMode) as mode (mode)}
        <Button size="sm" variant={humidityVariantFor(mode)} onclick={() => inputSlot.setHumidityMode(mode)}>
          {mode.quantity.label}
        </Button>
      {/each}
    </Inline>
  {/if}

  {#each rows as quantity (quantity)}
    <QuantityInput
      {quantity}
      value={valueOf(quantity)}
      {unitSystem}
      range={enteredRange(model, quantity, inputSlot.temperature.mode)}
      outOfRange={outOfRange.includes(quantity)}
      oncommit={(si) => commit(quantity, si)}
    />
  {/each}

  {#if hints.length > 0}
    <Stack gap="1">
      <span class="hint">{copy.applicabilityHint}</span>
      {#each hints as limit (limit)}
        <span class="hint">{limit.warning}</span>
      {/each}
    </Stack>
  {/if}
</Stack>

<style>
  .hint {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }
</style>
