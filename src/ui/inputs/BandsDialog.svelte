<!--
  The Bands dialog on Explore, opened by its button on the chart card's
  heading row (ADR-0002 decision 73, rule 8): each opening edits a fresh draft
  of the model's Band list in the Bands panel (decision 84, rule 6). Reset
  bands, at the footer's left, resets the draft; Apply, at its right, writes
  it through the chart settings and closes; the corner's Close and Escape drop
  it, so the footer has no Close of its own. The chart never reads the draft.
  A model with no Band list has nothing to edit, and its button is disabled.
-->
<script lang="ts">
  import type { RegisteredModel } from "$lib/core/modelDeclaration";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import type { BandListDraft } from "$lib/state/bandListDraft.svelte";
  import type { ChartState } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import { Button } from "$lib/ui/primitives/button";
  import * as Dialog from "$lib/ui/primitives/dialog";
  import BandsPanel from "./BandsPanel.svelte";

  interface Props {
    model: RegisteredModel;
    chart: ChartState;
    unitSystem: UnitSystem;
  }

  let { model, chart, unitSystem }: Props = $props();

  let open = $state(false);
  /** The draft the open dialog edits, built at each opening; one left by a closed dialog is never read again. */
  let draft = $state.raw<BandListDraft | null>(null);

  function onOpenChange(isOpen: boolean) {
    if (isOpen) {
      draft = chart.draftBands();
    }
  }

  function apply() {
    draft?.apply();
    open = false;
  }
</script>

<Dialog.Root bind:open {onOpenChange}>
  <Dialog.Trigger disabled={chart.bands === null}>
    {#snippet child({ props })}
      <Button {...props} size="sm" variant="outline">{copy.bands}</Button>
    {/snippet}
  </Dialog.Trigger>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{copy.bands}</Dialog.Title>
    </Dialog.Header>
    {#if draft}
      {@const openDraft = draft}
      <BandsPanel {model} draft={openDraft} {unitSystem} />
      <Dialog.Footer>
        <Button variant="outline" class="footer-start" onclick={() => openDraft.reset()}>{copy.bandsReset}</Button>
        <Button onclick={apply}>{copy.bandsApply}</Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
