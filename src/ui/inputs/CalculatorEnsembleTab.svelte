<!--
  Custom ensemble's tab in the Input calculators dialog (ADR-0002 decision
  75, rules 6 and 7): the line naming the standard's method, then a
  searchable checklist of the library's garments under the library's
  headings, in its order, the chairs last, each entry the garment's key as
  the library prints it and its value in clo (decision 20). The chosen
  garments stand above the list as chips, each removed by one click. These
  settings are the one region that scrolls. The dialog's dock and footer
  follow, handed the sum, which is none while nothing is chosen.

  The generated command list's check mark is kept in one column by the shared
  `.checklist` rule.
-->
<script module lang="ts">
  import { SvelteMap } from "svelte/reactivity";
  import type { GarmentCalculator } from "$lib/core/calculators";

  /**
   * The garments each calculator's tab has chosen, in the order chosen,
   * whichever slot or model it is opened for, for as long as the app is
   * loaded: in no session, no link and no kept tab (decision 75, rule 6;
   * ADR-0001 §4.1.5).
   */
  const keptGarments = new SvelteMap<GarmentCalculator, readonly string[]>();
</script>

<script lang="ts">
  import XIcon from "@lucide/svelte/icons/x";
  import type { Snippet } from "svelte";
  import { outputOf, requireGarment, type CalculatorResult } from "$lib/core/calculators";
  import { formatNumber } from "$lib/core/numberFormat";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import * as Command from "$lib/ui/primitives/command";
  import type { ResultLine } from "./InputCalculators.svelte";

  interface Props {
    calculator: GarmentCalculator;
    /** The dialog's dock and footer, for the sum, none while nothing is chosen, and its line. */
    dock: Snippet<[result: CalculatorResult | null, lines: readonly ResultLine[]]>;
  }

  let { calculator, dock }: Props = $props();

  const chosen = $derived(keptGarments.get(calculator) ?? []);
  const result = $derived(chosen.length > 0 ? calculator.compute(chosen) : null);
  const lines = $derived([
    { quantity: calculator.output, name: copy.ensembleInsulation, value: result ? outputOf(calculator, result) : Number.NaN },
  ]);

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
</script>

<div class="calculator-settings">
  <Stack gap="4">
    <p class="caption">{calculator.method}</p>
    {#if chosen.length > 0}
      <Inline gap="1">
        {#each chosen as garment (garment)}
          <Button variant="secondary" size="xs" aria-label={copy.ensembleRemove(garment)} onclick={() => toggle(garment)}>
            {garment}
            <XIcon />
          </Button>
        {/each}
      </Inline>
    {/if}
    <Command.Root class="checklist" filter={scoreByName}>
      <Command.Input placeholder={copy.ensembleSearchPlaceholder} />
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
</div>
{@render dock(result, lines)}
