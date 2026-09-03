<script lang="ts">
  import type { Quantity } from "jsthermalcomfort/io";
  import { temperatureMode } from "$lib/core/entryModes";
  import { enteredRange } from "$lib/core/libraryInputs";
  import type { RegisteredModel } from "$lib/core/modelDeclaration";
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
  }

  let { model, inputSlot, unitSystem, outOfRange }: Props = $props();

  const temperatures: readonly Quantity[] = temperatureMode.separate.panel;

  /** The model's inputs, with its temperature rows replaced by the current mode's panel quantities. */
  const rows = $derived.by(() => {
    const result: Quantity[] = [];
    for (const [quantity] of model.inputs) {
      if (!temperatures.includes(quantity)) {
        result.push(quantity);
      } else if (quantity === temperatures[0]) {
        result.push(...inputSlot.temperature.mode.panel);
      }
    }
    return result;
  });

  function valueOf(quantity: Quantity): number {
    if (quantity === inputSlot.humidity.mode.quantity) {
      return inputSlot.humidity.value;
    }
    return inputSlot.values.get(quantity) ?? Number.NaN;
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
</script>

<Stack gap="4">
  <Inline gap="2" align="center">
    <span>{copy.temperatureInput}</span>
    <Button size="sm" variant={variantFor(temperatureMode.separate)} onclick={() => inputSlot.setTemperatureMode(temperatureMode.separate)}>
      {copy.separateTemperatures}
    </Button>
    <Button size="sm" variant={variantFor(temperatureMode.operative)} onclick={() => inputSlot.setTemperatureMode(temperatureMode.operative)}>
      {copy.operativeTemperature}
    </Button>
  </Inline>

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
</Stack>
