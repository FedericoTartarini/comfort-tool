<script lang="ts">
  import type { Bound } from "$lib/core/applicability";
  import { formatNumber } from "$lib/core/numberFormat";
  import { matchingPreset, presetsFor, type Preset } from "$lib/core/presets";
  import type { Quantity } from "$lib/core/quantities";
  import { displayUnitFor } from "$lib/core/units";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import * as Command from "$lib/ui/primitives/command";
  import * as Popover from "$lib/ui/primitives/popover";
  import QuantityInput from "./QuantityInput.svelte";

  interface Props {
    quantity: Quantity;
    /** Canonical SI value. */
    value: number;
    unitSystem: UnitSystem;
    bound?: Bound;
    outOfRange?: boolean;
    oncommit: (si: number) => void;
  }

  let { quantity, value, unitSystem, bound, outOfRange = false, oncommit }: Props = $props();

  let open = $state(false);

  // `presetsFor` only returns undefined for a quantity InputPanel would not
  // have routed here for; the fallback keeps the template total.
  const presets = $derived(presetsFor(quantity) ?? []);
  const unit = $derived(displayUnitFor(quantity, unitSystem));
  const caption = $derived(matchingPreset(quantity, value)?.label);

  function pick(preset: Preset) {
    oncommit(preset.value);
    open = false;
  }
</script>

<Stack gap="1">
  <Inline gap="2" align="baseline">
    <QuantityInput {quantity} {value} {unitSystem} {bound} {outOfRange} {oncommit} />
    <Popover.Root bind:open>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Button {...props} variant="outline" size="sm">{copy.presetTrigger}</Button>
        {/snippet}
      </Popover.Trigger>
      <Popover.Content class="preset-popover">
        <Command.Root>
          <Command.Input placeholder={copy.presetSearchPlaceholder} />
          <Command.List>
            <Command.Empty>{copy.presetEmpty}</Command.Empty>
            {#each presets as preset (preset.label)}
              <Command.Item value={preset.label} onSelect={() => pick(preset)}>
                <span>{preset.label}</span>
                <span class="value">{formatNumber(unit.fromSi(preset.value))}</span>
              </Command.Item>
            {/each}
          </Command.List>
        </Command.Root>
      </Popover.Content>
    </Popover.Root>
  </Inline>
  {#if caption}
    <span class="caption">{caption}</span>
  {/if}
</Stack>

<style>
  :global(.preset-popover) {
    padding: 0;
  }

  .value {
    margin-left: auto;
    color: var(--muted-foreground);
  }

  .caption {
    font-size: var(--font-size-caption);
    color: var(--muted-foreground);
  }
</style>
