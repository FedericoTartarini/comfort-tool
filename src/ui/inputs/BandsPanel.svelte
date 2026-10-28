<!--
  The Bands panel on Explore (ADR-0002 decision 59): one row per band of a
  draft of the model's Band list, in the chart's order, each with its label,
  its colour and its upper Edge; the first band is open below, so no row has a
  lower Edge. Every edit goes to the draft, which calls the Band list module;
  the panel writes nothing itself, and the chart reads nothing of it until the
  dialog's Apply (decision 84, rule 6). An Edge box's verdict is whether the
  Edge stays in order: one out of order is refused at its commit, the box
  shows the Edge as it was, and the cell says why until that Edge is next
  moved or typed in. It is the table alone: the dialog it is opened in carries its title,
  Reset bands, Close and Apply (decision 73, rule 8).
-->
<script lang="ts">
  import { chartInk } from "$lib/core/bandPalette";
  import type { RegisteredModel } from "$lib/core/modelDeclaration";
  import { displayUnitFor, labelWithUnit, numberWithUnit, type DisplayUnit } from "$lib/core/units";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import type { BandListDraft, EdgeRefusal } from "$lib/state/bandListDraft.svelte";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import * as Field from "$lib/ui/primitives/field";
  import { Input } from "$lib/ui/primitives/input";
  import * as Table from "$lib/ui/primitives/table";
  import { Toggle } from "$lib/ui/primitives/toggle";
  import NumberInput from "./NumberInput.svelte";

  interface Props {
    model: RegisteredModel;
    draft: BandListDraft;
    unitSystem: UnitSystem;
  }

  let { model, draft, unitSystem }: Props = $props();

  // The number the Edges cut: the model's scanned output, read in its display unit.
  const output = $derived(model.scan?.output);
  const unit = $derived(output && displayUnitFor(output, unitSystem));
  const edgeColumn = $derived(output && unit ? copy.bandEdgeColumn(labelWithUnit(output, unit)) : "");

  /** Why an Edge was refused, its numbers in the column's unit. */
  function refusalText({ edge, below, above }: EdgeRefusal, unit: DisplayUnit): string {
    const shown = (si: number | undefined) => (si === undefined ? undefined : numberWithUnit(si, unit));
    return copy.bandEdgeRefused(numberWithUnit(edge, unit), shown(below), shown(above));
  }
</script>

{#if output && unit}
  {@const bands = draft.bands}
  <Table.Root class="bands-table">
    <Table.Header>
      <Table.Row>
        <Table.Head>{copy.bandLabelColumn}</Table.Head>
        <Table.Head>{copy.bandColorColumn}</Table.Head>
        <Table.Head>{edgeColumn}</Table.Head>
        <Table.Head></Table.Head>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      <!-- Rows by position: a band has no identity of its own, and two may share a label. -->
      {#each bands.labels as label, index (index)}
        {@const color = bands.colors[index]}
        {@const refusal = draft.refusalAt(index)}
        <Table.Row>
          <Table.Cell>
            <Input
              type="text"
              value={label}
              aria-label={copy.bandControl(copy.bandLabelColumn, index)}
              oninput={(event) => draft.setLabel(index, event.currentTarget.value)}
            />
          </Table.Cell>
          <Table.Cell>
            <Inline gap="2" align="center">
              <!-- A colour input must hold a colour: a band painted nowhere shows the ground it leaves bare. -->
              <Input
                type="color"
                value={color ?? chartInk.ground}
                aria-label={copy.bandControl(copy.bandColorColumn, index)}
                oninput={(event) => draft.setColor(index, event.currentTarget.value)}
              />
              <!-- Pressed while the band is painted nowhere; pressed again it stays so, until a colour is picked. -->
              <Toggle
                size="sm"
                variant="outline"
                aria-label={copy.bandControl(copy.bandNoColor, index)}
                bind:pressed={
                  () => color === undefined,
                  (pressed) => {
                    if (pressed) {
                      draft.setColor(index, undefined);
                    }
                  }
                }
              >
                {copy.bandNoColor}
              </Toggle>
            </Inline>
          </Table.Cell>
          <!-- A keystroke in the box begins a new value, so the words on the last one go. -->
          <Table.Cell oninput={() => draft.startTypingEdge(index)}>
            <Field.Field>
              <NumberInput
                value={bands.edges[index]}
                {unit}
                isLegal={(si) => draft.isInOrder(index, si)}
                ariaLabel={copy.bandControl(edgeColumn, index)}
                oncommit={(si) => draft.moveEdge(index, si)}
              />
              {#if refusal}
                <Field.Error>{refusalText(refusal, unit)}</Field.Error>
              {/if}
            </Field.Field>
          </Table.Cell>
          <Table.Cell>
            <Inline gap="2" align="center">
              <Button
                size="sm"
                variant="outline"
                aria-label={copy.bandControl(copy.bandAdd, index)}
                onclick={() => draft.addBand(index)}
              >
                {copy.bandAdd}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bands.labels.length === 1}
                aria-label={copy.bandControl(copy.bandRemove, index)}
                onclick={() => draft.removeBand(index)}
              >
                {copy.bandRemove}
              </Button>
            </Inline>
          </Table.Cell>
        </Table.Row>
      {/each}
    </Table.Body>
  </Table.Root>
{/if}
