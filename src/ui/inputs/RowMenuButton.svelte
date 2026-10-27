<!--
  A row's menu: a text button inside its box, at the right end, one per slot,
  that opens the row's presets as a searchable list (ADR-0002 decision 67,
  rule 3, and decision 75, rule 6), so a box carries one control. A preset is
  committed as it is chosen; one its slot would cut or refuse is disabled, its
  number still shown (decision 84, rule 5). The button is the word with one
  slot and with three, the input card being wide enough for it (decision 84,
  rule 12).
-->
<script lang="ts">
  import { formatNumber } from "$lib/core/numberFormat";
  import type { Preset } from "$lib/core/presets";
  import type { DisplayUnit } from "$lib/core/units";
  import { copy } from "$lib/text/copy";
  import * as InputGroup from "$lib/ui/primitives/input-group";
  import * as Popover from "$lib/ui/primitives/popover";
  import ValueList from "./ValueList.svelte";

  interface Props {
    presets: readonly Preset[];
    /** The unit the list shows each preset's value in: the box's. */
    unit: DisplayUnit;
    /** The slot's badge's name, while the slots are named: the button is named for it. */
    slotName?: string;
    /** Whether the slot takes an SI value as it is, as the box judges a typed value; every one, without it. */
    isLegal?: (si: number) => boolean;
    oncommit: (si: number) => void;
  }

  let { presets, unit, slotName, isLegal, oncommit }: Props = $props();

  let open = $state(false);

  const name = $derived(slotName ? copy.slotControl(copy.presetTrigger, slotName) : copy.presetTrigger);

  // An entry's key is its position among the presets.
  const listGroups = $derived([
    {
      items: presets.map((preset, index) => ({
        key: String(index),
        label: preset.label,
        value: formatNumber(unit.fromSi(preset.value)),
        disabled: isLegal !== undefined && !isLegal(preset.value),
      })),
    },
  ]);

  function pick(key: string) {
    open = false;
    oncommit(presets[Number(key)].value);
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <InputGroup.Button {...props} size="xs" aria-label={name}>{copy.presetTrigger}</InputGroup.Button>
    {/snippet}
  </Popover.Trigger>
  <ValueList groups={listGroups} search={{ placeholder: copy.presetSearchPlaceholder, empty: copy.presetEmpty }} onpick={pick} />
</Popover.Root>
