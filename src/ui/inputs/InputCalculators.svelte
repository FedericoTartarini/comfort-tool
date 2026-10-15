<!--
  The input calculators' one entry and their dialog (ADR-0002 decision 75,
  rule 6 as noted 2026-10-15). The entry is a full-width button at the Inputs
  card's foot, "Input calculators" over the names of the calculators the
  model's panel offers; there is none where it offers none. It opens one
  dialog of one width and one fixed height, a tab per calculator in the
  panel's row order: the tab's settings, the one region that scrolls; the
  result dock, the result and the row Apply writes before and after; and the
  footer with Apply, which writes slot 1 and closes. Closing any other way
  changes nothing.

  Its look is the generated dialog's and tabs' (the `line` variant), with the
  shared `.calculator-entry`, `.dialog-fixed` and `.result-dock` rules.
-->
<script module lang="ts">
  import type { Calculator } from "$lib/core/calculators";
  import type { Quantity } from "$lib/core/quantities";

  /** One line of a calculator's result in the dock: its name, and its SI value, not a number while there is none. */
  export interface ResultLine {
    readonly quantity: Quantity;
    readonly name: string;
    readonly value: number;
  }

  /**
   * The tab last used, the one the dialog opens on, for as long as the app
   * is loaded: in no session, no link and no kept tab, as the tabs' inputs
   * are (decision 75, rule 6; ADR-0001 §4.1.5).
   */
  let lastUsed: Calculator | null = $state.raw(null);
</script>

<script lang="ts">
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import { formatBound } from "$lib/core/applicability";
  import { panelCalculators, shownRow, withCalculatorResult, type CalculatorResult } from "$lib/core/calculators";
  import type { RegisteredModel } from "$lib/core/modelDeclaration";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import { displayUnitFor, nameWithUnit, numberInUnit } from "$lib/core/units";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import * as Dialog from "$lib/ui/primitives/dialog";
  import * as Tabs from "$lib/ui/primitives/tabs";
  import CalculatorEnsembleTab from "./CalculatorEnsembleTab.svelte";
  import CalculatorFormTab from "./CalculatorFormTab.svelte";
  import type { SlotColumn } from "./InputPanel.svelte";

  interface Props {
    model: RegisteredModel;
    /** The page's slot columns, as the input panel takes them; Apply writes the first. */
    columns: readonly [SlotColumn, ...(SlotColumn | null)[]];
    unitSystem: UnitSystem;
    /** The session's, in Pa: a slot's row is read in its entry mode at it. */
    atmosphericPressure: number;
  }

  let { model, columns, unitSystem, atmosphericPressure }: Props = $props();

  const id = $props.id();

  const target = $derived(columns[0].inputSlot);
  // Every slot is in the session's entry modes (ADR-0002 decision 51), so slot 1's calculators are every slot's.
  const calculators = $derived(panelCalculators(model, target));
  const current = $derived(lastUsed && calculators.includes(lastUsed) ? lastUsed : calculators[0]);

  let open = $state(false);

  /** Apply: the result written into the slot as decision 75 rule 3 converts it, then gated by its row as a typed value. */
  function apply(calculator: Calculator, result: CalculatorResult) {
    target.replaceWith(withCalculatorResult(target, calculator, result, model));
    open = false;
  }
</script>

{#if calculators.length > 0}
  <Dialog.Root bind:open>
    <!-- Its border parts it from the rows above, with no rule (decision 75, rule 6 (a)); focus comes back to it on close. -->
    <Dialog.Trigger>
      {#snippet child({ props })}
        <Button {...props} variant="outline" class="calculator-entry">
          <span class="calculator-entry-text">
            <span class="calculator-entry-title">{copy.inputCalculators}</span>
            <span class="calculator-entry-names">{copy.calculatorNames(calculators.map((calculator) => calculator.label))}</span>
          </span>
          <ChevronRightIcon />
        </Button>
      {/snippet}
    </Dialog.Trigger>
    <Dialog.Content class="dialog-fixed">
      <Dialog.Header>
        <Dialog.Title>{copy.inputCalculators}</Dialog.Title>
      </Dialog.Header>
      <!--
        Every tab stays mounted, the inactive ones hidden, so a tab's settings
        survive a switch; a tab's value is its calculator's position.
      -->
      <Tabs.Root bind:value={() => String(calculators.indexOf(current)), (value) => (lastUsed = calculators[Number(value)])}>
        <Tabs.List variant="line">
          {#each calculators as calculator, index (calculator)}
            <Tabs.Trigger value={String(index)}>{calculator.label}</Tabs.Trigger>
          {/each}
        </Tabs.List>
        {#each calculators as calculator, index (calculator)}
          <!-- The dock and the footer, drawn by the tab after its settings, which hands in its result and its lines. -->
          {#snippet dock(result: CalculatorResult | null, lines: readonly ResultLine[])}
            {@const row = shownRow(target, calculator, result ?? undefined, model, atmosphericPressure)}
            {@const unit = displayUnitFor(row.quantity, unitSystem)}
            {@const after = numberInUnit(row.after, unit)}
            <div class="result-dock">
              <Stack gap="1">
                {#each lines as line (line.quantity)}
                  {@const lineUnit = displayUnitFor(line.quantity, unitSystem)}
                  {@render dockLine(`${index}-${line.quantity.key}`, nameWithUnit(line.name, lineUnit), numberInUnit(line.value, lineUnit))}
                {/each}
                {@render dockLine(
                  `${index}-row`,
                  nameWithUnit(row.quantity.label, unit),
                  numberInUnit(row.before, unit),
                  row.brokenBound ? copy.calculatorBrokenBound(after, formatBound(row.brokenBound, row.quantity, unitSystem)) : after,
                  row.brokenBound !== undefined,
                )}
              </Stack>
            </div>
            <Dialog.Footer>
              <Button disabled={result === null} onclick={() => result && apply(calculator, result)}>{copy.calculatorApply}</Button>
            </Dialog.Footer>
          {/snippet}
          <Tabs.Content value={String(index)}>
            {#if calculator.asks}
              <CalculatorFormTab {calculator} {unitSystem} {dock} />
            {:else}
              <CalculatorEnsembleTab {calculator} {dock} />
            {/if}
          </Tabs.Content>
        {/each}
      </Tabs.Root>
    </Dialog.Content>
  </Dialog.Root>
{/if}

<!--
  A line of the dock, named by its label, so the value is announced with what it is; a slot's row line has its value
  after Apply too, in the out-of-range colour where it breaks the row's bound.
-->
{#snippet dockLine(key: string, label: string, value: string, after?: string, outOfRange = false)}
  <Inline gap="2" justify="between">
    <span id="{id}-{key}">{label}</span>
    <output aria-labelledby="{id}-{key}"
      >{value}{#if after !== undefined}{copy.calculatorChangeJoiner}<span class={{ "out-of-range": outOfRange }}>{after}</span
        >{/if}</output
    >
  </Inline>
{/snippet}
