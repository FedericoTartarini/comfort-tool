<!--
  The Bands panel on Explore (ADR-0002 decision 59): one row per band of the
  model's Band list, in the chart's order, each with its label, its colour and
  its upper Edge; the first band is open below, so no row has a lower Edge.
  Every edit is effective at once and goes through the chart settings, which
  call the Band list module; the panel writes nothing itself. A model
  that scans nothing has no Band list, and the panel shows nothing for it.
  It is the table alone: the dialog the page opens it in carries its title
  and Reset bands (decision 73, rule 8).
-->
<script lang="ts">
  import { chartInk } from "$lib/core/bandPalette";
  import type { RegisteredModel } from "$lib/core/modelDeclaration";
  import { displayUnitFor, labelWithUnit } from "$lib/core/units";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import type { ChartState } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import { Input } from "$lib/ui/primitives/input";
  import * as Table from "$lib/ui/primitives/table";
  import { Toggle } from "$lib/ui/primitives/toggle";
  import NumberInput from "./NumberInput.svelte";

  interface Props {
    model: RegisteredModel;
    chart: ChartState;
    unitSystem: UnitSystem;
  }

  let { model, chart, unitSystem }: Props = $props();

  // The number the Edges cut: the model's scanned output, read in its display unit.
  const output = $derived(model.scan?.output);
  const unit = $derived(output && displayUnitFor(output, unitSystem));
  const edgeColumn = $derived(output && unit ? copy.bandEdgeColumn(labelWithUnit(output, unit)) : "");

  // The band whose typed Edge was just refused: marked until the box is left,
  // which shows the old value again, or an Edge is taken.
  let refused = $state<number | null>(null);

  function commitEdge(index: number, si: number) {
    refused = chart.moveBandEdge(index, si) ? null : index;
  }
</script>

{#if chart.bands && output && unit}
  {@const bands = chart.bands}
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
        <Table.Row>
          <Table.Cell>
            <Input
              type="text"
              value={label}
              aria-label={copy.bandControl(copy.bandLabelColumn, index)}
              oninput={(event) => chart.setBandLabel(index, event.currentTarget.value)}
            />
          </Table.Cell>
          <Table.Cell>
            <Inline gap="2" align="center">
              <!-- A colour input must hold a colour: a band painted nowhere shows the ground it leaves bare. -->
              <Input
                type="color"
                value={color ?? chartInk.ground}
                aria-label={copy.bandControl(copy.bandColorColumn, index)}
                oninput={(event) => chart.setBandColor(index, event.currentTarget.value)}
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
                      chart.setBandColor(index, undefined);
                    }
                  }
                }
              >
                {copy.bandNoColor}
              </Toggle>
            </Inline>
          </Table.Cell>
          <Table.Cell onfocusout={() => (refused = null)}>
            <NumberInput
              value={bands.edges[index]}
              {unit}
              invalid={refused === index}
              ariaLabel={copy.bandControl(edgeColumn, index)}
              oncommit={(si) => commitEdge(index, si)}
            />
          </Table.Cell>
          <Table.Cell>
            <Inline gap="2" align="center">
              <Button
                size="sm"
                variant="outline"
                aria-label={copy.bandControl(copy.bandAdd, index)}
                onclick={() => chart.addBand(index)}
              >
                {copy.bandAdd}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bands.labels.length === 1}
                aria-label={copy.bandControl(copy.bandRemove, index)}
                onclick={() => chart.removeBand(index)}
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
