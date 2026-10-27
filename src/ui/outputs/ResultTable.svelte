<script lang="ts">
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import { splitViolations, warningFor } from "$lib/core/applicability";
  import { chartInk } from "$lib/core/bandPalette";
  import type { RegisteredModel } from "$lib/core/modelDeclaration";
  import { classifiedOutputs, formatResultCell } from "$lib/core/resultCell";
  import { standardCaptionFor } from "$lib/core/standard";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import type { SlotOutputs } from "$lib/state/compute.svelte";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import * as Popover from "$lib/ui/primitives/popover";
  import * as Table from "$lib/ui/primitives/table";

  interface Props {
    model: RegisteredModel;
    /**
     * One row per compared slot, in slot order. While their badges carry names, the table has an Input column naming
     * each row beside its swatch.
     */
    rows: readonly SlotOutputs[];
    unitSystem: UnitSystem;
    /** The id of the Results heading, which names the table's scroll region (ADR-0002 decision 70, rule 2). */
    labelledby: string;
  }

  let { model, rows, unitSystem, labelledby }: Props = $props();

  // ADR §4.3: the Compliance column appears only when the model has a
  // classified output or a broken output row. An output-role violation also
  // opens the column: a PMV of 2.4 is shown, with the row it broke as its caveat.
  const tableRows = $derived(
    rows.map((row) => ({
      row,
      classified: classifiedOutputs(model, row.result),
      caveats: splitViolations(row.violations).outputs,
    })),
  );
  const namesRows = $derived(rows.some((row) => row.badge.name !== undefined));
  const hasCompliance = $derived(tableRows.some((entry) => entry.classified.length > 0 || entry.caveats.length > 0));
  // A row's limits button stands first in its first cell, the Input cell before the swatch while the rows are named.
  const limitsInCompliance = $derived(!namesRows && hasCompliance);
  const limitsInFirstValue = $derived(!namesRows && !hasCompliance);
  const standardCaption = $derived(model.standard ? standardCaptionFor(model.standard) : undefined);
</script>

<!-- A slot's swatch is its chart marker's. -->
{#snippet slotSwatch(row: SlotOutputs)}
  <span class="swatch swatch-marker" style:--swatch-color={chartInk.marker(row.badge.hue)}></span>
{/snippet}

<!-- A row whose run broke a limit opens, by its button, the limits it broke in the bound sentence's words (ADR-0002
     decision 84, rule 8): activated, not hovered, so a keyboard and a touch reach it. A row that broke none has none. -->
{#snippet limitsButton(row: SlotOutputs)}
  {#if row.violations.length > 0}
    {@const name = row.badge.name === undefined ? copy.limitsBroken : copy.slotControl(copy.limitsBroken, row.badge.name)}
    <Popover.Root>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Button {...props} variant="ghost" size="icon-xs" class="limits-button" aria-label={name}>
            <TriangleAlertIcon />
          </Button>
        {/snippet}
      </Popover.Trigger>
      <Popover.Content align="start">
        <Popover.Header>
          <Popover.Title>{copy.limitsBrokenHeading}</Popover.Title>
        </Popover.Header>
        <ul>
          {#each row.violations as violation (violation)}
            <li>{warningFor(violation, unitSystem)}</li>
          {/each}
        </ul>
      </Popover.Content>
    </Popover.Root>
  {/if}
{/snippet}

<Stack gap="2">
  <!-- The table scrolls inside its region, not the page, by keyboard too (ADR-0002 decision 70): a scroll region
       is focusable so the arrow keys reach the columns to the right, which Svelte's rule does not except. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="table-scroll" role="region" tabindex="0" aria-labelledby={labelledby}>
    <Table.Root class="result-table">
      <Table.Header>
        <Table.Row>
          {#if namesRows}
            <Table.Head>{copy.inputColumn}</Table.Head>
          {/if}
          {#if hasCompliance}
            <Table.Head>{copy.complianceColumn}</Table.Head>
          {/if}
          {#each model.table as quantity (quantity)}
            <Table.Head class="value">{quantity.label}</Table.Head>
          {/each}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each tableRows as { row, classified, caveats } (row)}
          <Table.Row>
            {#if namesRows}
              <Table.Cell>
                <span class="swatch-label">
                  {@render limitsButton(row)}
                  {@render slotSwatch(row)}
                  {row.badge.name}
                </span>
              </Table.Cell>
            {/if}
            {#if hasCompliance}
              <Table.Cell>
                <!-- The button beside the entries, never wrapped above them: the cell is as wide as its widest entry. -->
                <span class="limits-lead">
                  {#if limitsInCompliance}
                    {@render limitsButton(row)}
                  {/if}
                  <Inline gap="2">
                    {#each classified as entry (entry.quantity)}
                      <span class="swatch-label">
                        {#if entry.color}
                          <span class="swatch swatch-fill" style:--swatch-color={entry.color}></span>
                        {/if}
                        {entry.quantity.label}: {entry.category}
                      </span>
                    {/each}
                    {#each caveats as violation (violation)}
                      <span class="caption caveat">{warningFor(violation, unitSystem)}</span>
                    {/each}
                  </Inline>
                </span>
              </Table.Cell>
            {/if}
            {#each model.table as quantity, index (quantity)}
              <!-- A dash standing for a violation carries no icon of its own: the row's limits button explains it. -->
              <Table.Cell class="value">
                {#if limitsInFirstValue && index === 0}
                  {@render limitsButton(row)}
                {/if}
                {formatResultCell(row.result, quantity, unitSystem, row.violations)}
              </Table.Cell>
            {/each}
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>

  {#if standardCaption}
    <span class="caption">{standardCaption}</span>
  {/if}
</Stack>
