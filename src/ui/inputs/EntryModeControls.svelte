<script lang="ts">
  import {
    airSpeedMode,
    clothingMode,
    humidityMode,
    temperatureMode,
    type AirSpeedMode,
    type ClothingMode,
    type HumidityMode,
    type TemperatureMode,
  } from "$lib/core/entryModes";
  import { hasClothingGroup, hasHumidityGroup, hasTemperatureGroup, takesRelativeAirSpeed } from "$lib/core/modelDeclaration";
  import type { Session } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Button } from "$lib/ui/primitives/button";

  interface Props {
    /** Whose entry modes the controls show and change: the session's, which convert every slot (ADR-0002 decision 51). */
    session: Session;
  }

  let { session }: Props = $props();

  const showTemperatureRow = $derived(hasTemperatureGroup(session.model));
  const showHumidityRow = $derived(hasHumidityGroup(session.model));
  const showAirSpeedRow = $derived(takesRelativeAirSpeed(session.model));
  const showClothingRow = $derived(hasClothingGroup(session.model));

  function temperatureVariantFor(mode: TemperatureMode) {
    return session.temperatureMode === mode ? "default" : "outline";
  }

  function humidityVariantFor(mode: HumidityMode) {
    return session.humidityMode === mode ? "default" : "outline";
  }

  function airSpeedVariantFor(mode: AirSpeedMode) {
    return session.airSpeedMode === mode ? "default" : "outline";
  }

  function clothingVariantFor(mode: ClothingMode) {
    return session.clothingMode === mode ? "default" : "outline";
  }
</script>

<Stack gap="4">
  {#if showTemperatureRow}
    <Inline gap="2" align="center">
      <span>{copy.temperatureInput}</span>
      <Button size="sm" variant={temperatureVariantFor(temperatureMode.separate)} onclick={() => session.setTemperatureMode(temperatureMode.separate)}>
        {copy.separateTemperatures}
      </Button>
      <Button size="sm" variant={temperatureVariantFor(temperatureMode.operative)} onclick={() => session.setTemperatureMode(temperatureMode.operative)}>
        {copy.operativeTemperature}
      </Button>
    </Inline>
  {/if}

  {#if showHumidityRow}
    <Inline gap="2" align="center">
      <span>{copy.humidityInput}</span>
      {#each Object.values(humidityMode) as mode (mode)}
        <Button size="sm" variant={humidityVariantFor(mode)} onclick={() => session.setHumidityMode(mode)}>
          {mode.quantity.label}
        </Button>
      {/each}
    </Inline>
  {/if}

  {#if showAirSpeedRow}
    <Inline gap="2" align="center">
      <span>{copy.airSpeedInput}</span>
      {#each Object.values(airSpeedMode) as mode (mode)}
        <Button size="sm" variant={airSpeedVariantFor(mode)} onclick={() => session.setAirSpeedMode(mode)}>
          {mode.axis.label}
        </Button>
      {/each}
    </Inline>
  {/if}

  {#if showClothingRow}
    <Inline gap="2" align="center">
      <span>{copy.clothingInput}</span>
      {#each Object.values(clothingMode) as mode (mode)}
        <Button size="sm" variant={clothingVariantFor(mode)} onclick={() => session.setClothingMode(mode)}>
          {mode.axis.label}
        </Button>
      {/each}
    </Inline>
  {/if}
</Stack>
