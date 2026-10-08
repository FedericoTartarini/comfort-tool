<!--
  A row's Presets: a menu button inside its box, at the right end, one per
  slot, that opens the quantity's presets as a searchable list (ADR-0002
  decision 67, rule 3). Phase 5b's calculators are entries of the same menu,
  so a box carries one control.
-->
<script lang="ts">
  import ListIcon from "@lucide/svelte/icons/list";
  import { formatNumber } from "$lib/core/numberFormat";
  import type { Preset } from "$lib/core/presets";
  import type { DisplayUnit } from "$lib/core/units";
  import { copy } from "$lib/text/copy";
  import * as Command from "$lib/ui/primitives/command";
  import * as InputGroup from "$lib/ui/primitives/input-group";
  import * as Popover from "$lib/ui/primitives/popover";

  interface Props {
    presets: readonly Preset[];
    /** The unit the list shows each preset's value in: the box's. */
    unit: DisplayUnit;
    /** The button's accessible name. */
    name: string;
    oncommit: (si: number) => void;
  }

  let { presets, unit, name, oncommit }: Props = $props();

  let open = $state(false);

  function pick(preset: Preset) {
    oncommit(preset.value);
    open = false;
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <InputGroup.Button {...props} size="icon-xs" aria-label={name}>
        <ListIcon />
      </InputGroup.Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="list-popover">
    <Command.Root>
      <Command.Input placeholder={copy.presetSearchPlaceholder} />
      <Command.List>
        <Command.Empty>{copy.presetEmpty}</Command.Empty>
        {#each presets as preset (preset.label)}
          <Command.Item value={preset.label} onSelect={() => pick(preset)}>
            <span>{preset.label}</span>
            <span class="item-value">{formatNumber(unit.fromSi(preset.value))}</span>
          </Command.Item>
        {/each}
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
