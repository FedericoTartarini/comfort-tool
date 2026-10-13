<!--
  Custom ensemble's dialog (ADR-0002 decision 75, rules 6 and 7): a
  searchable checklist of the library's garments under the library's
  headings, in its order, the chairs last, each entry the garment's key as the
  library prints it and its value in clo (decision 20). The chosen garments
  stand above the list as chips, each removed by one click, beside their
  sum. Apply writes the sum for the slot whose box opened the dialog, and is
  disabled while nothing is chosen; every other way out changes nothing.
  Titled by the calculator, and by the slot while the slots are named
  (decision 50).

  Its look is the generated dialog primitive's, at the one width every dialog
  has (ADR-0002 decision 67, rule 9), and the generated command list's, whose
  check mark the shared `.checklist` rule keeps in one column.
-->
<script module lang="ts">
  import { SvelteMap } from "svelte/reactivity";
  import type { GarmentCalculator } from "$lib/core/calculators";

  /**
   * The garments each calculator's dialog has chosen, in the order chosen,
   * whichever slot or model opened it, for as long as the app is loaded: in
   * no session, no link and no kept tab (decision 75, rule 6; ADR-0001 §4.1.5).
   */
  const keptGarments = new SvelteMap<GarmentCalculator, readonly string[]>();
</script>

<script lang="ts">
  import XIcon from "@lucide/svelte/icons/x";
  import { outputOf, requireGarment, type CalculatorResult } from "$lib/core/calculators";
  import { formatNumber } from "$lib/core/numberFormat";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import { displayUnitFor, nameWithUnit } from "$lib/core/units";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import * as Command from "$lib/ui/primitives/command";
  import * as Dialog from "$lib/ui/primitives/dialog";

  interface Props {
    calculator: GarmentCalculator;
    /** The slot's badge's name, while the slots are named. */
    slotName?: string;
    unitSystem: UnitSystem;
    onapply: (result: CalculatorResult) => void;
    /** The close button, the Escape key and a click outside. */
    onclose: () => void;
  }

  let { calculator, slotName, unitSystem, onapply, onclose }: Props = $props();

  const id = $props.id();

  let search: HTMLInputElement | null = $state(null);

  const chosen = $derived(keptGarments.get(calculator) ?? []);
  const result = $derived(calculator.compute(chosen));
  const unit = $derived(displayUnitFor(calculator.output, unitSystem));
  const title = $derived(slotName ? copy.slotControl(calculator.label, slotName) : calculator.label);

  function toggle(garment: string) {
    keptGarments.set(calculator, chosen.includes(garment) ? chosen.filter((other) => other !== garment) : [...chosen, garment]);
  }

  /**
   * The list's filter score, 1 for a garment whose name holds the query and 0
   * otherwise, where the list's default matches letters in order: "shoes"
   * would keep "Short-sleeve shirt dress".
   */
  function scoreByName(value: string, query: string): number {
    return value.toLowerCase().includes(query.trim().toLowerCase()) ? 1 : 0;
  }

  /** Focus goes to the search box, ahead of the chips a reopened dialog shows first. */
  function onOpenAutoFocus(event: Event) {
    event.preventDefault();
    search?.focus();
  }

  function onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      onclose();
    }
  }
</script>

<Dialog.Root open {onOpenChange}>
  <Dialog.Content {onOpenAutoFocus}>
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
    </Dialog.Header>
    <Stack gap="4">
      <Inline gap="2" justify="between">
        <Inline gap="1">
          {#each chosen as garment (garment)}
            <Button variant="secondary" size="xs" aria-label={copy.ensembleRemove(garment)} onclick={() => toggle(garment)}>
              {garment}
              <XIcon />
            </Button>
          {/each}
        </Inline>
        <Inline gap="2">
          <span id="{id}-sum">{nameWithUnit(copy.ensembleInsulation, unit)}</span>
          <output aria-labelledby="{id}-sum">{formatNumber(unit.fromSi(outputOf(calculator, result)))}</output>
        </Inline>
      </Inline>
      <Command.Root class="checklist" filter={scoreByName}>
        <Command.Input bind:ref={search} placeholder={copy.ensembleSearchPlaceholder} />
        <Command.List>
          <Command.Empty>{copy.ensembleEmpty}</Command.Empty>
          {#each calculator.groups as { group, garments } (group)}
            <Command.Group heading={group}>
              {#each garments as garment (garment)}
                {@const isChosen = chosen.includes(garment)}
                <Command.Item value={garment} aria-checked={isChosen} data-checked={isChosen} onSelect={() => toggle(garment)}>
                  <span>{garment}</span>
                  <span class="item-value">{formatNumber(requireGarment(garment))}</span>
                </Command.Item>
              {/each}
            </Command.Group>
          {/each}
        </Command.List>
      </Command.Root>
    </Stack>
    <Dialog.Footer>
      <Button disabled={chosen.length === 0} onclick={() => onapply(result)}>{copy.calculatorApply}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
