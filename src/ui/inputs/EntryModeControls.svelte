<script lang="ts">
  import { humidityMode, temperatureMode, type HumidityMode, type TemperatureMode } from "$lib/core/entryModes";
  import { hasHumidityGroup, hasTemperatureGroup, type RegisteredModel } from "$lib/core/modelDeclaration";
  import type { InputSlot } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Button } from "$lib/ui/primitives/button";

  interface Props {
    model: RegisteredModel;
    /** The slot the controls show and convert: slot 1, until an entry mode converts every slot. */
    inputSlot: InputSlot;
    /** The session's, in Pa: the slot converts its humidity entry at it. */
    atmosphericPressure: number;
  }

  let { model, inputSlot, atmosphericPressure }: Props = $props();

  const showTemperatureRow = $derived(hasTemperatureGroup(model));
  const showHumidityRow = $derived(hasHumidityGroup(model));

  function temperatureVariantFor(mode: TemperatureMode) {
    return inputSlot.temperature.mode === mode ? "default" : "outline";
  }

  function humidityVariantFor(mode: HumidityMode) {
    return inputSlot.humidity?.mode === mode ? "default" : "outline";
  }
</script>

<Stack gap="4">
  {#if showTemperatureRow}
    <Inline gap="2" align="center">
      <span>{copy.temperatureInput}</span>
      <Button size="sm" variant={temperatureVariantFor(temperatureMode.separate)} onclick={() => inputSlot.setTemperatureMode(temperatureMode.separate, model)}>
        {copy.separateTemperatures}
      </Button>
      <Button size="sm" variant={temperatureVariantFor(temperatureMode.operative)} onclick={() => inputSlot.setTemperatureMode(temperatureMode.operative, model)}>
        {copy.operativeTemperature}
      </Button>
    </Inline>
  {/if}

  {#if showHumidityRow}
    <Inline gap="2" align="center">
      <span>{copy.humidityInput}</span>
      {#each Object.values(humidityMode) as mode (mode)}
        <Button size="sm" variant={humidityVariantFor(mode)} onclick={() => inputSlot.setHumidityMode(mode, atmosphericPressure)}>
          {mode.quantity.label}
        </Button>
      {/each}
    </Inline>
  {/if}
</Stack>
