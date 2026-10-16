<!--
  Custom ensemble's tab in the Input calculators dialog (ADR-0002 decision
  75, rule 7 as noted 2026-10-15): the line naming the standard's method; a
  search box, whose results float over the rows while a query is typed; then
  one row per garment group of the library's, in its order, the chairs last,
  each garment the key as the library prints it with its value in clo
  (decision 20). A row is its group's name, a list button at one width in
  every row, the Presets list (`ValueList`) of the group's garments not yet
  worn, then the worn garments as chips, each taken off by one click. Chairs
  holds one, a chosen chair replacing it, and carries the standard's condition
  under it. These settings are the one region that scrolls. The dialog's dock
  and footer follow, handed the sum, which is none while nothing is worn;
  Clear, at the title's right, is drawn last, so the keyboard reaches it after
  Apply and before the dialog's Close.

  Its look is the shared `.garment-search`, `.garment-row-name` and
  `.garment-list-trigger` rules.
-->
<script module lang="ts">
  import { SvelteMap } from "svelte/reactivity";
  import type { GarmentCalculator } from "$lib/core/calculators";

  /**
   * The garments each calculator's tab has worn, in the order worn,
   * whichever slot or model it is opened for, for as long as the app is
   * loaded: in no session, no link and no kept tab (decision 75, rule 6;
   * ADR-0001 §4.1.5).
   */
  const keptGarments = new SvelteMap<GarmentCalculator, readonly string[]>();
</script>

<script lang="ts">
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import XIcon from "@lucide/svelte/icons/x";
  import type { Snippet } from "svelte";
  import { outputOf, requireGarment, wearGarment, type CalculatorResult, type GarmentGroup } from "$lib/core/calculators";
  import { formatNumber } from "$lib/core/numberFormat";
  import { copy } from "$lib/text/copy";
  import Grid from "$lib/ui/layout/Grid.svelte";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import * as Command from "$lib/ui/primitives/command";
  import * as Popover from "$lib/ui/primitives/popover";
  import type { ResultLine } from "./InputCalculators.svelte";
  import ValueList from "./ValueList.svelte";

  interface Props {
    calculator: GarmentCalculator;
    /** The dialog's dock and footer, for the sum, none while nothing is worn, and its line. */
    dock: Snippet<[result: CalculatorResult | null, lines: readonly ResultLine[]]>;
  }

  let { calculator, dock }: Props = $props();

  const id = $props.id();

  let query = $state("");
  /** The group whose list is open, one at a time. */
  let openGroup: GarmentGroup | null = $state.raw(null);

  const worn = $derived(keptGarments.get(calculator) ?? []);
  const result = $derived(worn.length > 0 ? calculator.compute(worn) : null);
  const lines = $derived([
    { quantity: calculator.output, name: copy.ensembleInsulation, value: result ? outputOf(calculator, result) : Number.NaN },
  ]);
  const searching = $derived(query.trim() !== "");

  function wear(garment: string) {
    keptGarments.set(calculator, wearGarment(calculator, worn, garment));
  }

  function takeOff(garment: string) {
    keptGarments.set(calculator, worn.filter((other) => other !== garment));
  }

  /** A row's list opened, or closed; closing it leaves another row's list that has opened since. */
  function setListOpen(group: GarmentGroup, isOpen: boolean) {
    if (isOpen) {
      openGroup = group;
    } else if (openGroup === group) {
      openGroup = null;
    }
  }

  /** A garment chosen from its row's list: worn, and the list closed. */
  function pick(garment: string) {
    wear(garment);
    openGroup = null;
  }

  /** A garment chosen among the search's results: worn, and the query cleared, which hides them. */
  function pickFound(garment: string) {
    wear(garment);
    query = "";
  }

  /** A garment's insulation in clo, as a list's entry ends with it. */
  function shownInsulationOf(garment: string): string {
    return formatNumber(requireGarment(garment));
  }

  /**
   * The search's filter score, 1 for a garment whose name holds the query and
   * 0 otherwise, where the list's default matches letters in order: "shoes"
   * would keep "Short-sleeve shirt dress".
   */
  function scoreByName(value: string, search: string): number {
    return value.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0;
  }
</script>

<div class="calculator-settings">
  <Stack gap="4">
    <p class="caption">{calculator.method}</p>
    <Command.Root class="garment-search" filter={scoreByName}>
      <Command.Input bind:value={query} placeholder={copy.ensembleSearchPlaceholder} />
      {#if searching}
        <Command.List>
          <Command.Empty>{copy.ensembleEmpty}</Command.Empty>
          {#each calculator.groups as { group, garments } (group)}
            <Command.Group heading={group}>
              {#each garments as garment (garment)}
                {@const isWorn = worn.includes(garment)}
                <Command.Item value={garment} aria-checked={isWorn} data-checked={isWorn} onSelect={() => pickFound(garment)}>
                  <span>{garment}</span>
                  <span class="item-value">{shownInsulationOf(garment)}</span>
                </Command.Item>
              {/each}
            </Command.Group>
          {/each}
        </Command.List>
      {/if}
    </Command.Root>
    <Stack gap="2">
      {#each calculator.groups as group, index (group)}
        {@render garmentRow(group, `${id}-${index}`)}
      {/each}
    </Stack>
  </Stack>
</div>
{@render dock(result, lines)}
<Button variant="ghost" size="sm" class="dialog-title-action" disabled={worn.length === 0} onclick={() => keptGarments.delete(calculator)}>
  {copy.ensembleClear}
</Button>

<!--
  A group's row, named by the group: its list first, at one width in every row, so wearing a garment moves it not;
  the worn garments follow as chips, wrapping, the list and the chips at the panel's small-control height. Chairs' button reads "Change" while a
  chair is worn.
-->
{#snippet garmentRow(group: GarmentGroup, rowId: string)}
  {@const wornHere = worn.filter((garment) => group.garments.includes(garment))}
  {@const isChairs = group === calculator.chairs}
  <div role="group" aria-labelledby="{rowId}-name">
    <Grid columns="10rem minmax(0, 1fr)" gap="2">
      <span id="{rowId}-name" class="garment-row-name">{group.group}</span>
      <Inline gap="1">
        {@render garmentList(
          group,
          rowId,
          isChairs && wornHere.length > 0 ? copy.ensembleChange : copy.ensembleAdd,
          group.garments.filter((garment) => !wornHere.includes(garment)),
        )}
        {#each wornHere as garment (garment)}
          <Button variant="secondary" size="sm" aria-label={copy.ensembleRemove(garment)} onclick={() => takeOff(garment)}>
            {garment}
            <XIcon />
          </Button>
        {/each}
      </Inline>
    </Grid>
  </div>
{/snippet}

<!-- The row's list button, named by its word and the group, "Add Footwear", opening the group's garments not worn. -->
{#snippet garmentList(group: GarmentGroup, rowId: string, word: string, garments: readonly string[])}
  <Popover.Root bind:open={() => openGroup === group, (isOpen) => setListOpen(group, isOpen)}>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button {...props} variant="outline" size="sm" class="garment-list-trigger" aria-labelledby="{rowId}-word {rowId}-name">
          <span id="{rowId}-word">{word}</span>
          <ChevronDownIcon />
        </Button>
      {/snippet}
    </Popover.Trigger>
    <ValueList
      groups={[{ items: garments.map((garment) => ({ key: garment, label: garment, value: shownInsulationOf(garment) })) }]}
      align="start"
      onpick={pick}
    />
  </Popover.Root>
{/snippet}
