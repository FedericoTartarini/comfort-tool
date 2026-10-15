<!--
  A row's menu: a text button inside its box, at the right end, one per slot,
  that opens the row's presets and input calculators as a searchable list
  (ADR-0002 decision 67, rule 3, and decision 75, rule 6), so a box carries
  one control. Its word is what it holds: "Presets" where it holds presets,
  with calculators or not, "Calculators" where it holds calculators alone;
  holding both, the list is in two groups under those headings. A preset is
  committed as it is chosen; a calculator opens its dialog for the slot. Under
  Compare a box has no room for the word beside its value, so the button is
  the list icon with the word as its tooltip (decision 73, rule 8's note as
  amended 2026-10-12).
-->
<script lang="ts">
  import ListIcon from "@lucide/svelte/icons/list";
  import type { Calculator } from "$lib/core/calculators";
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
    calculators: readonly Calculator[];
    /** The unit the list shows each preset's value in: the box's. */
    unit: DisplayUnit;
    /** The slot's badge's name, while the slots are named: the button is named for it. */
    slotName?: string;
    /** The list icon in place of the word, which says it in a tooltip: the box stands in one of three slot columns. */
    compact?: boolean;
    oncommit: (si: number) => void;
    onopen: (calculator: Calculator) => void;
  }

  let { presets, calculators, unit, slotName, compact = false, oncommit, onopen }: Props = $props();

  let open = $state(false);

  const word = $derived(presets.length > 0 ? copy.presetTrigger : copy.calculatorTrigger);
  const name = $derived(slotName ? copy.slotControl(word, slotName) : word);
  const grouped = $derived(presets.length > 0 && calculators.length > 0);

  function commitPreset(preset: Preset) {
    open = false;
    oncommit(preset.value);
  }

  function openCalculator(calculator: Calculator) {
    open = false;
    onopen(calculator);
  }

  // An entry's key is its position here, the presets then the calculators.
  const listGroups = $derived([
    {
      heading: grouped ? copy.presetGroup : undefined,
      items: presets.map((preset, index) => ({
        key: String(index),
        label: preset.label,
        value: formatNumber(unit.fromSi(preset.value)),
      })),
    },
    {
      heading: grouped ? copy.calculatorGroup : undefined,
      items: calculators.map((calculator, index) => ({ key: String(presets.length + index), label: calculator.label })),
    },
  ]);

  function pick(key: string) {
    const index = Number(key);
    if (index < presets.length) commitPreset(presets[index]);
    else openCalculator(calculators[index - presets.length]);
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
                {word}
              {/if}
            </InputGroup.Button>
          {/snippet}
        </Popover.Trigger>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content>{word}</Tooltip.Content>
  </Tooltip.Root>
  <ValueList groups={listGroups} search={{ placeholder: copy.presetSearchPlaceholder, empty: copy.presetEmpty }} onpick={pick} />
</Popover.Root>
