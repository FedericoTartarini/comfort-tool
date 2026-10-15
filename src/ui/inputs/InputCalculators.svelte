<!--
  The input calculators' one entry and their dialog (ADR-0002 decision 75,
  rule 6 as noted 2026-10-15). The entry is a full-width button at the Inputs
  card's foot, "Input calculators" over the names of the calculators the
  model's panel offers; there is none where it offers none. It opens one
  dialog of one width and one fixed height, a tab per calculator in the
  panel's row order: the tab's settings, the one region that scrolls; the
  result dock, the result and, for each slot Apply writes, that slot's row
  before and after; and the footer with Apply, which writes and closes. While
  the slots are named (decision 50), the footer's "Apply to" checks the slots
  Apply writes, slot 1 alone on opening; otherwise it writes slot 1. Closing
  any other way changes nothing.

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
  import { chartInk } from "$lib/core/bandPalette";
  import { panelCalculators, shownRow, withCalculatorResult, type CalculatorResult } from "$lib/core/calculators";
  import type { RegisteredModel } from "$lib/core/modelDeclaration";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import { displayUnitFor, nameWithUnit, numberInUnit } from "$lib/core/units";
  import type { SlotPosition } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import { Checkbox } from "$lib/ui/primitives/checkbox";
  import * as Dialog from "$lib/ui/primitives/dialog";
  import { Label } from "$lib/ui/primitives/label";
  import * as Tabs from "$lib/ui/primitives/tabs";
  import CalculatorEnsembleTab from "./CalculatorEnsembleTab.svelte";
  import CalculatorFormTab from "./CalculatorFormTab.svelte";
  import type { SlotColumn } from "./InputPanel.svelte";

  interface Props {
    model: RegisteredModel;
    /** The page's slot columns, as the input panel takes them, `null` for a slot not compared: the others are those Apply can write. */
    columns: readonly [SlotColumn, ...(SlotColumn | null)[]];
    unitSystem: UnitSystem;
    /** The session's, in Pa: a slot's row is read in its entry mode at it. */
    atmosphericPressure: number;
  }

  let { model, columns, unitSystem, atmosphericPressure }: Props = $props();

  const id = $props.id();

  // Every slot is in the session's entry modes (ADR-0002 decision 51), so slot 1's calculators are every slot's.
  const calculators = $derived(panelCalculators(model, columns[0].inputSlot));
  const current = $derived(lastUsed && calculators.includes(lastUsed) ? lastUsed : calculators[0]);

  const enabled = $derived(columns.filter((column) => column !== null));
  /** Whether the slots carry names, Standard with Compare on (decision 50): only then does the footer ask which Apply writes. */
  const named = $derived(columns[0].outputs.badge.name !== undefined);
  /** The slots "Apply to" has checked, by position, slot 1 alone each time the dialog opens. */
  let checked: readonly SlotPosition[] = $state.raw([0]);
  /** The slots Apply writes, in slot order: the checked ones while the slots are named, and slot 1 otherwise. */
  const targets = $derived(named ? enabled.filter((column) => checked.includes(column.outputs.position)) : [columns[0]]);

  let open = $state(false);

  function onOpenChange(isOpen: boolean) {
    if (isOpen) {
      checked = [0];
    }
  }

  function check(position: SlotPosition, isChecked: boolean) {
    checked = isChecked ? [...checked, position] : checked.filter((other) => other !== position);
  }

  /** Apply: the result written into each target as decision 75 rule 3 converts it, then gated by its row as a typed value. */
  function apply(calculator: Calculator, result: CalculatorResult) {
    for (const { inputSlot } of targets) {
      inputSlot.replaceWith(withCalculatorResult(inputSlot, calculator, result, model));
    }
    open = false;
  }
</script>

{#if calculators.length > 0}
  <Dialog.Root bind:open {onOpenChange}>
    <!-- Its border parts it from the rows above, with no rule (decision 75, rule 6 (a)); focus comes back to it on close. -->
    <Dialog.Trigger>
      {#snippet child({ props })}
        <Button {...props} variant="outline" class="calculator-entry">
          <span class="calculator-entry-text">
            <span>{copy.inputCalculators}</span>
            <span class="caption calculator-entry-names">{copy.calculatorNames(calculators.map((calculator) => calculator.label))}</span>
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
        Every tab stays mounted, the inactive ones hidden, so a tab keeps its
        scroll and the ensemble its search across a switch; its settings are
        kept by the tab's module. A tab's value is its calculator's position.
      -->
      <Tabs.Root bind:value={() => String(calculators.indexOf(current)), (value) => (lastUsed = calculators[Number(value)])}>
        <Tabs.List variant="line">
          {#each calculators as calculator, index (calculator)}
            <Tabs.Trigger value={String(index)}>{calculator.label}</Tabs.Trigger>
          {/each}
        </Tabs.List>
        {#each calculators as calculator, index (calculator)}
          <!--
            The dock and the footer, drawn by the tab after its settings, which hands in its result and its lines.
            The dock has a line per target, the row that slot shows in its own entry mode, named by the slot while
            the slots are named. The footer is drawn once per tab, every tab mounted, so its ids carry the tab's.
          -->
          {#snippet dock(result: CalculatorResult | null, lines: readonly ResultLine[])}
            <div class="result-dock">
              <Stack gap="1">
                {#each lines as line (line.quantity)}
                  {@const lineUnit = displayUnitFor(line.quantity, unitSystem)}
                  {@render dockLine(`${index}-${line.quantity.key}`, nameWithUnit(line.name, lineUnit), numberInUnit(line.value, lineUnit))}
                {/each}
                {#each targets as { inputSlot, outputs } (outputs.position)}
                  {@const row = shownRow(inputSlot, calculator, result ?? undefined, model, atmosphericPressure)}
                  {@const unit = displayUnitFor(row.quantity, unitSystem)}
                  {@const after = numberInUnit(row.after, unit)}
                  {@render dockLine(
                    `${index}-row-${outputs.position}`,
                    nameWithUnit(outputs.badge.name ? copy.slotControl(row.quantity.label, outputs.badge.name) : row.quantity.label, unit),
                    numberInUnit(row.before, unit),
                    row.brokenBound ? copy.calculatorBrokenBound(after, formatBound(row.brokenBound, row.quantity, unitSystem)) : after,
                    row.brokenBound !== undefined,
                  )}
                {/each}
              </Stack>
            </div>
            <Dialog.Footer>
              {#if named}
                {@render applyTo(`${id}-${index}-apply-to`)}
              {/if}
              <Button disabled={result === null || targets.length === 0} onclick={() => result && apply(calculator, result)}>
                {copy.calculatorApply}
              </Button>
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
  The footer's "Apply to": a checkbox per enabled slot, any number of them checked, which Apply confirms (decision 76,
  rule 1), each labelled by the slot's swatch and name as its slot button is. `prefix` is the tab's, keeping ids unique.
-->
{#snippet applyTo(prefix: string)}
  <div class="apply-to" role="group" aria-labelledby="{prefix}-heading">
    <Inline gap="2">
      <span id="{prefix}-heading" class="apply-to-heading">{copy.calculatorApplyTo}</span>
      {#each enabled as { outputs } (outputs.position)}
        <Inline gap="2">
          <Checkbox
            id="{prefix}-{outputs.position}"
            checked={checked.includes(outputs.position)}
            onCheckedChange={(isChecked) => check(outputs.position, isChecked)}
          />
          <Label for="{prefix}-{outputs.position}">
            <span class="swatch swatch-marker" style:--swatch-color={chartInk.marker(outputs.badge.hue)}></span>
            {outputs.badge.name}
          </Label>
        </Inline>
      {/each}
    </Inline>
  </div>
{/snippet}

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
