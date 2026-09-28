<script lang="ts">
  import { enteredBound, splitViolations, warningFor, type ViolationRow } from "$lib/core/applicability";
  import { humidityMode, temperatureMode, type HumidityMode } from "$lib/core/entryModes";
  import { enteredValue, panelQuantities } from "$lib/core/libraryInputs";
  import { hasHumidityGroup, hasTemperatureGroup, type RegisteredModel } from "$lib/core/modelDeclaration";
  import { presetsFor } from "$lib/core/presets";
  import type { Quantity } from "$lib/core/quantities";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import type { InputSlot } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import { Checkbox } from "$lib/ui/primitives/checkbox";
  import { Label } from "$lib/ui/primitives/label";
  import PresetInput from "./PresetInput.svelte";
  import QuantityInput from "./QuantityInput.svelte";

  interface Props {
    model: RegisteredModel;
    inputSlot: InputSlot;
    unitSystem: UnitSystem;
    outOfRange: readonly Quantity[];
    violations: readonly ViolationRow[];
  }

  let { model, inputSlot, unitSystem, outOfRange, violations }: Props = $props();

  const id = $props.id();

  const rows = $derived(panelQuantities(model, inputSlot));
  const showTemperatureRow = $derived(hasTemperatureGroup(model));
  const showHumidityRow = $derived(hasHumidityGroup(model));

  // Everything but the result's own bound. Entered values are gated before the call, so an `input` row
  // here comes from a value the panel did not show as an input: the relative air speed vr = v + 0.3(met − 1),
  // which the standard bounds instead of `v` — so the sentence names the relative air speed, not the entered one.
  const hints = $derived(splitViolations(violations).inputs);

  function valueOf(quantity: Quantity): number {
    return enteredValue(inputSlot, quantity, model) ?? Number.NaN;
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
      <Button size="sm" variant={variantFor(temperatureMode.separate)} onclick={() => inputSlot.setTemperatureMode(temperatureMode.separate, model)}>
        {copy.separateTemperatures}
      </Button>
      <Button size="sm" variant={variantFor(temperatureMode.operative)} onclick={() => inputSlot.setTemperatureMode(temperatureMode.operative, model)}>
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
    {@const rowProps = {
      quantity,
      value: valueOf(quantity),
      unitSystem,
      bound: enteredBound(model, quantity, inputSlot.temperature.mode),
      outOfRange: outOfRange.includes(quantity),
      oncommit: (si: number) => commit(quantity, si),
    }}
    {@const presets = presetsFor(quantity)}
    {#if presets}
      <PresetInput {...rowProps} {presets} />
    {:else}
      <QuantityInput {...rowProps} />
    {/if}
  {/each}

  <!-- Always shown and always live: whether an option applies at the entered values is the library's to say. -->
  {#each model.options as option (option)}
    <Inline gap="2" align="center">
      <Checkbox
        id="{id}-{option.key}"
        checked={inputSlot.options.get(option)}
        onCheckedChange={(checked) => inputSlot.options.set(option, checked)}
      />
      <Label for="{id}-{option.key}">{option.label}</Label>
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
