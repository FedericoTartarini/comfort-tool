<script lang="ts">
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import { limitsBrokenLines } from "$lib/core/applicability";
  import { chartInk } from "$lib/core/bandPalette";
  import type { RegisteredModel } from "$lib/core/modelDeclaration";
  import { formatResultCell, type ResultCell } from "$lib/core/resultCell";
  import { standardCaptionFor } from "$lib/core/standard";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import type { SlotOutputs } from "$lib/state/compute.svelte";
  import { copy } from "$lib/text/copy";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Badge } from "$lib/ui/primitives/badge";
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

  const namesRows = $derived(rows.some((row) => row.badge.name !== undefined));
  const standardCaption = $derived(model.standard ? standardCaptionFor(model.standard) : undefined);
</script>

<!-- A slot's swatch is its chart marker's. -->
{#snippet slotSwatch(row: SlotOutputs)}
  <span class="swatch swatch-marker" style:--swatch-color={chartInk.marker(row.badge.hue)}></span>
{/snippet}

<!-- A Band badge's fill and lettering are its band's, set here as a swatch's colour is; a band without a colour is
     outlined. -->
{#snippet resultCell(cell: ResultCell)}
  {#if cell.kind === "text"}
    {cell.text}
  {:else if cell.paint}
    <Badge class="band-badge" style="--band-fill: {cell.paint.fill}; --band-lettering: {cell.paint.lettering}">{cell.label}</Badge>
  {:else}
    <Badge variant="outline">{cell.label}</Badge>
  {/if}
{/snippet}

<!-- A row whose run broke a limit carries an amber icon named by the limits it broke, in the bound sentence's words,
     one per line: a mouse reads them on hover, a screen reader as the image's name. It is no control (ADR-0002
     decision 85, rule 5); the toast and the Image's Input summary carry the words for a keyboard and a touch. A row
     that broke none has none. -->
{#snippet limitsIcon(row: SlotOutputs)}
  {#if row.violations.length > 0}
    <span class="limits-icon" role="img" title={limitsBrokenLines(row.violations, unitSystem).join("\n")}>
      <TriangleAlertIcon aria-hidden="true" />
    </span>
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
          {#each model.table as quantity (quantity)}
            <Table.Head class="value">{quantity.label}</Table.Head>
          {/each}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        <!-- A row's limits icon stands first in its first cell: the Input cell before the swatch while the rows are
             named, else the first value cell. -->
        {#each rows as row (row)}
          <Table.Row>
            {#if namesRows}
              <Table.Cell>
                <span class="swatch-label">
                  {@render limitsIcon(row)}
                  {@render slotSwatch(row)}
                  {row.badge.name}
                </span>
              </Table.Cell>
            {/if}
            {#each model.table as quantity, index (quantity)}
              <!-- A dash standing for a violation carries no icon of its own: the row's limits icon explains it. -->
              <Table.Cell class="value">
                {#if !namesRows && index === 0}
                  {@render limitsIcon(row)}
                {/if}
                {@render resultCell(formatResultCell(model, row.result, quantity, unitSystem, row.violations))}
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
