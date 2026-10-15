<!--
  A row's menu: a text button inside its box, at the right end, one per slot,
  that opens the row's presets as a searchable list (ADR-0002 decision 67,
  rule 3, and decision 75, rule 6), so a box carries one control. A preset is
  committed as it is chosen. Under Compare a box has no room for the word
  beside its value, so the button is the list icon with the word as its
  tooltip (decision 73, rule 8's note as amended 2026-10-12).
-->
<script lang="ts">
  import ListIcon from "@lucide/svelte/icons/list";
  import { formatNumber } from "$lib/core/numberFormat";
  import type { Preset } from "$lib/core/presets";
  import type { DisplayUnit } from "$lib/core/units";
  import { copy } from "$lib/text/copy";
  import * as InputGroup from "$lib/ui/primitives/input-group";
  import * as Popover from "$lib/ui/primitives/popover";
  import * as Tooltip from "$lib/ui/primitives/tooltip";
  import ValueList from "./ValueList.svelte";

  interface Props {
    presets: readonly Preset[];
    /** The unit the list shows each preset's value in: the box's. */
    unit: DisplayUnit;
    /** The slot's badge's name, while the slots are named: the button is named for it. */
    slotName?: string;
    /** The list icon in place of the word, which says it in a tooltip: the box stands in one of three slot columns. */
    compact?: boolean;
    oncommit: (si: number) => void;
  }

  let { presets, unit, slotName, compact = false, oncommit }: Props = $props();

  let open = $state(false);

  const name = $derived(slotName ? copy.slotControl(copy.presetTrigger, slotName) : copy.presetTrigger);

  // An entry's key is its position among the presets.
  const listGroups = $derived([
    { items: presets.map((preset, index) => ({ key: String(index), label: preset.label, value: formatNumber(unit.fromSi(preset.value)) })) },
  ]);

  function pick(key: string) {
    open = false;
    oncommit(presets[Number(key)].value);
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
  <ValueList groups={listGroups} search={{ placeholder: copy.presetSearchPlaceholder, empty: copy.presetEmpty }} onpick={pick} />
</Popover.Root>
