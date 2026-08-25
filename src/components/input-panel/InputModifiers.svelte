<svelte:options runes={true} />

<script lang="ts">
  import { Button, Modal } from "flowbite-svelte";
  import { AdjustmentsHorizontalOutline } from "flowbite-svelte-icons";

  import type {
    InputModifierDraftEntry,
    InputModifiersViewModel,
  } from "../../state/comfortTool/types";
  import InputModifierEditor from "./InputModifierEditor.svelte";

  interface Props {
    modifiers: InputModifiersViewModel;
  }

  let { modifiers }: Props = $props();

  let editorOpen = $state(false);
  let editorContextKey = $state("");
  let draft = $state<InputModifierDraftEntry[]>([]);
  let applyError = $state("");

  const editorContextMatches = $derived(
    editorOpen && editorContextKey === modifiers.editorContextKey,
  );
  const draftControls = $derived.by(() => editorContextMatches
    ? modifiers.projectDraft(draft)
    : modifiers.controls);

  $effect(() => {
    if (editorOpen && editorContextKey !== modifiers.editorContextKey) {
      closeAndDiscard();
    }
  });

  function openEditor() {
    draft = modifiers.getDraft();
    editorContextKey = modifiers.editorContextKey;
    applyError = "";
    editorOpen = true;
  }

  function closeAndDiscard() {
    editorOpen = false;
    editorContextKey = "";
    draft = [];
    applyError = "";
  }

  function applyDraft() {
    if (!editorContextMatches) {
      closeAndDiscard();
      return;
    }
    if (!modifiers.applyDraft(draft)) {
      applyError = "These modifier changes could not be applied. Reopen the editor and try again.";
      return;
    }
    closeAndDiscard();
  }
</script>

<section class="mt-4 border-t border-stone-200 pt-3" aria-label="Input modifiers">
  <Button
    color="none"
    class="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-left text-stone-700 hover:border-stone-300 hover:bg-white focus:ring-2 focus:ring-teal-200"
    aria-label="Open input modifiers"
    onclick={openEditor}
  >
    <span class="flex min-w-0 items-center gap-2.5">
      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-teal-700 shadow-sm">
        <AdjustmentsHorizontalOutline class="h-4 w-4" strokeWidth="2" />
      </span>
      <span class="min-w-0">
        <span class="block text-sm font-semibold text-stone-900">Input modifiers</span>
        <span class="block text-xs font-normal text-stone-500">
          Adjust effective inputs without changing their base values.
        </span>
      </span>
    </span>
    <span class="ml-3 shrink-0 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-600">
      {modifiers.activeCount > 0
        ? `${modifiers.activeCount} active`
        : `${modifiers.availableCount} available`}
    </span>
  </Button>
</section>

<Modal
  bind:open={editorOpen}
  title="Input modifiers"
  size="xl"
  autoclose={false}
  outsideclose={true}
  class="modal-shell-soft"
  classHeader="items-start justify-between gap-4 px-5 py-4 md:px-6"
  classBody="max-h-[84svh] overflow-hidden p-0"
  on:close={closeAndDiscard}
>
  {#if editorContextMatches}
    <InputModifierEditor
      modifierControls={draftControls}
      visibleInputIds={modifiers.visibleInputIds}
      {draft}
      {applyError}
      onSetDraftEnabled={modifiers.setDraftEnabled}
      onUpdateDraftInput={modifiers.updateDraftInput}
      onDraftChange={(nextDraft) => {
        draft = nextDraft;
        applyError = "";
      }}
      onCancel={closeAndDiscard}
      onApply={applyDraft}
    />
  {/if}
</Modal>
