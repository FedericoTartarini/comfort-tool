<script lang="ts">
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import { splitViolations, warningFor } from "$lib/core/applicability";
  import type { SummaryLine } from "$lib/core/applicabilitySummary";
  import { chartInk } from "$lib/core/bandPalette";
  import type { RegisteredModel } from "$lib/core/modelDeclaration";
  import { classifiedOutputs, formatResultCell } from "$lib/core/resultCell";
  import { standardCaptionFor } from "$lib/core/standard";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import type { SlotOutputs } from "$lib/state/compute.svelte";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import * as Alert from "$lib/ui/primitives/alert";
  import * as Table from "$lib/ui/primitives/table";

  interface Props {
    model: RegisteredModel;
    /**
     * One row per compared slot, in slot order. While their badges carry names, the table has an Input column naming
     * each row beside its swatch, and the applicability summary names the slot each line is about.
     */
    rows: readonly SlotOutputs[];
    unitSystem: UnitSystem;
    /** The id of the Results heading, which names the table's scroll region (ADR-0002 decision 70, rule 2). */
    labelledby: string;
  }

  let { model, rows, unitSystem, labelledby }: Props = $props();

  /** One listed slot's lines in a part of the applicability summary. */
  interface SlotLines {
    readonly row: SlotOutputs;
    readonly lines: readonly SummaryLine[];
  }

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
  const notCalculatedParts = $derived(
    rows.flatMap((row): (SlotLines & { readonly result: string })[] => {
      const part = row.applicabilitySummary.notCalculated;
      return part ? [{ row, lines: part.lines, result: part.result }] : [];
    }),
  );
  const outsideLimitsParts = $derived(
    rows.flatMap((row): SlotLines[] => {
      const lines = row.applicabilitySummary.outsideLimits;
      return lines.length > 0 ? [{ row, lines }] : [];
    }),
  );
  const standardCaption = $derived(model.standard ? standardCaptionFor(model.standard) : undefined);

  function slotLine(row: SlotOutputs, text: string): string {
    return row.badge.name === undefined ? text : copy.slotNote(row.badge.name, text);
  }
</script>

<!-- A slot's swatch is its chart marker's. -->
{#snippet slotSwatch(row: SlotOutputs)}
  <span class="swatch swatch-marker" style:--swatch-color={chartInk.marker(row.badge.hue)}></span>
{/snippet}

<!-- A slot's sentence in the summary, named and with its swatch while the slots are named. -->
{#snippet slotSentence(row: SlotOutputs, text: string)}
  <span class="swatch-label">
    {#if row.badge.name !== undefined}
      {@render slotSwatch(row)}
    {/if}
    {slotLine(row, text)}
  </span>
{/snippet}

<!-- One part's bound lines as one list: every listed slot's, in slot order. The part's one description holds it, since
     the alert's grid places only its first description beside the icon (decision 83, rule 2's note of 2026-10-22). -->
{#snippet boundList(parts: readonly SlotLines[])}
  <ul>
    {#each parts as { row, lines } (row)}
      {#each lines as line (line)}
        <li>{@render slotSentence(row, line.text)}</li>
      {/each}
    {/each}
  </ul>
{/snippet}

<Stack gap="2">
  <!-- The applicability summary, under the Results heading and above the table (ADR-0002 decision 83, rule 2), each
       part one alert holding every compared slot's lines. Its "Not calculated, outside these limits:" part is the one
       place the page asks the person to act: the generated alert in its destructive variant, announced at once
       (decision 73, rule 9). Its "Calculated, but outside these limits:" part is the default variant in ink with the
       same icon, told apart by its heading and its colour, and announced politely (`status`), so a caveat interrupts
       no one's typing. -->
  {#if notCalculatedParts.length > 0}
    <Alert.Root variant="destructive">
      <TriangleAlertIcon />
      <Alert.Title>{copy.notCalculated}</Alert.Title>
      <Alert.Description>
        {@render boundList(notCalculatedParts)}
        <!-- Whether a result is kept is a slot's, so each listed slot says it after the list, not under the heading. -->
        {#each notCalculatedParts as { row, result } (row)}
          <div>{@render slotSentence(row, result)}</div>
        {/each}
      </Alert.Description>
    </Alert.Root>
  {/if}
  {#if outsideLimitsParts.length > 0}
    <Alert.Root role="status" class="outside-limits">
      <TriangleAlertIcon />
      <Alert.Title>{copy.outsideLimits}</Alert.Title>
      <Alert.Description>{@render boundList(outsideLimitsParts)}</Alert.Description>
    </Alert.Root>
  {/if}

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
          <!-- A row kept from an earlier run is marked, so its numbers read as not current (decision 73, rule 9). -->
          <Table.Row data-kept={row.notCalculated || undefined}>
            {#if namesRows}
              <Table.Cell>
                <span class="swatch-label">
                  {@render slotSwatch(row)}
                  {row.badge.name}
                </span>
              </Table.Cell>
            {/if}
            {#if hasCompliance}
              <Table.Cell>
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
              </Table.Cell>
            {/if}
            {#each model.table as quantity (quantity)}
              {@const cell = formatResultCell(row.result, quantity, unitSystem, row.violations)}
              <!-- A dash standing for a violation carries the summary's icon, named for screen readers; a dash for no
                   value carries none, so the icon keeps one meaning (decision 83, rule 3). -->
              <Table.Cell class="value">
                {#if cell.violation}
                  <TriangleAlertIcon role="img" aria-label={copy.violationMark} />
                {/if}
                {cell.text}
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
