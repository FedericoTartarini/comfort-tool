<!--
  A row's Presets: a text button reading "Presets" inside its box, at the
  right end, one per slot, that opens the quantity's presets as a searchable
  list (ADR-0002 decision 67, rule 3). Phase 5b's calculators are entries of
  the same menu, so a box carries one control. Under Compare a box has no
  room for the word beside its value, so the button is the list icon with the
  word as its tooltip (decision 73, rule 8's note as amended 2026-10-12).
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
  import * as Tooltip from "$lib/ui/primitives/tooltip";

  interface Props {
    presets: readonly Preset[];
    /** The unit the list shows each preset's value in: the box's. */
    unit: DisplayUnit;
    /** The button's accessible name. */
    name: string;
    /** The list icon in place of the word, which says it in a tooltip: the box stands in one of three slot columns. */
    compact?: boolean;
    oncommit: (si: number) => void;
  }

  let { presets, unit, name, compact = false, oncommit }: Props = $props();

  let open = $state(false);

  function pick(preset: Preset) {
    oncommit(preset.value);
    open = false;
  }
</script>

<Popover.Root bind:open>
  <!--
    The tooltip is always there and says the word only where the icon stands
    for it: Compare switches the button's content, never the triggers around
    it, which taken out and put back left the popover reading the old one.
  -->
  <Tooltip.Root disabled={!compact}>
    <Tooltip.Trigger>
      {#snippet child({ props: tooltipProps })}
        <Popover.Trigger {...tooltipProps}>
          {#snippet child({ props })}
            <InputGroup.Button {...props} size={compact ? "icon-xs" : "xs"} aria-label={name}>
              {#if compact}
                <ListIcon />
              {:else}
                {copy.presetTrigger}
              {/if}
            </InputGroup.Button>
          {/snippet}
        </Popover.Trigger>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content>{copy.presetTrigger}</Tooltip.Content>
  </Tooltip.Root>
  <Popover.Content class="list-popover">
    <!--
      No initial scroll: on mount the list scrolls its first item into view
      while the popover is still unpositioned far above the page, which
      scrolled the whole window to the top.
    -->
    <Command.Root disableInitialScroll>
      <Command.Input placeholder={copy.presetSearchPlaceholder} />
      <Command.List>
        <Command.Empty>{copy.presetEmpty}</Command.Empty>
        <!-- The items inside a Group, as every generated example has them: the group's inset parts them from the search box. -->
        <Command.Group>
          {#each presets as preset (preset.label)}
            <Command.Item value={preset.label} onSelect={() => pick(preset)}>
              <span>{preset.label}</span>
              <span class="item-value">{formatNumber(unit.fromSi(preset.value))}</span>
            </Command.Item>
          {/each}
        </Command.Group>
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
