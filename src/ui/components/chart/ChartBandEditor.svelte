<script lang="ts">
  import { Button, Input, Label, Modal } from "flowbite-svelte";
  import { PhysicalQuantityId, getPhysicalQuantityMeta } from "../../../catalog/quantities";
  import { PlusOutline, TrashBinOutline } from "flowbite-svelte-icons";
  import type { NumericBand } from "../../../catalog/modelCapabilities";
  import { unitLabel, type UnitSystem as UnitSystemType } from "../../../catalog/units";
  import {
    normalizeNumericBands,
    validateNumericBands,
  } from "../../../engines/comfort/charts/bands";
  import {
    convertQuantityFromSi,
    convertQuantityToSi,
    formatDisplayValue,
    roundToDisplay,
  } from "../../../engines/units";

  interface Props {
    idPrefix: string;
    outputKey: PhysicalQuantityId;
    bands: readonly NumericBand[];
    defaultBands: readonly NumericBand[];
    unitSystem: UnitSystemType;
    onApply: (bands: readonly NumericBand[]) => boolean | void;
  }

  interface BandDraft {
    label: string;
    color: string;
    minValue: string;
    maxValue: string;
    minSourceSi?: number;
    maxSourceSi?: number;
    unboundedBelow: boolean;
    unboundedAbove: boolean;
  }

  let {
    idPrefix,
    outputKey,
    bands,
    defaultBands,
    unitSystem,
    onApply,
  }: Props = $props();

  let editorOpen = $state(false);
  let drafts = $state<BandDraft[]>([]);
  let listErrors = $state<string[]>([]);

  const outputMeta = $derived(getPhysicalQuantityMeta(outputKey));
  const displayUnits = $derived(unitLabel(outputMeta.siUnit, unitSystem));
  const unitSuffix = $derived(displayUnits ? ` (${displayUnits})` : "");
  const draftBands = $derived(drafts.map(draftToBand));
  const draftValidation = $derived(validateNumericBands(
    draftBands,
    { requireSorted: false },
  ));
  const rowErrors = $derived.by(() => {
    return drafts.map((_, index) => draftValidation.issues
      .filter((issue) => issue.bandIndex === index && issue.code !== "overlap")
      .map(({ message }) => message));
  });

  function formatFiniteEdge(valueSi: number): string {
    const displayValue = convertQuantityFromSi(outputKey, valueSi, unitSystem);
    return formatDisplayValue(displayValue);
  }

  function toDrafts(sourceBands: readonly NumericBand[]): BandDraft[] {
    return sourceBands.map((band) => ({
      label: band.label,
      color: band.color,
      minValue: band.min === Number.NEGATIVE_INFINITY ? "" : formatFiniteEdge(band.min),
      maxValue: band.max === Number.POSITIVE_INFINITY ? "" : formatFiniteEdge(band.max),
      minSourceSi: Number.isFinite(band.min) ? band.min : undefined,
      maxSourceSi: Number.isFinite(band.max) ? band.max : undefined,
      unboundedBelow: band.min === Number.NEGATIVE_INFINITY,
      unboundedAbove: band.max === Number.POSITIVE_INFINITY,
    }));
  }

  function updateDraft(index: number, patch: Partial<BandDraft>) {
    drafts = drafts.map((draft, draftIndex) => (
      draftIndex === index ? { ...draft, ...patch } : draft
    ));
    listErrors = [];
  }

  function parseFiniteValue(value: string, sourceValueSi?: number): number {
    if (!value.trim()) {
      return NaN;
    }

    const displayValue = roundToDisplay(Number(value));
    // An unchanged rounded display value must retain its exact SI source boundary.
    if (
      sourceValueSi !== undefined &&
      displayValue === Number(formatFiniteEdge(sourceValueSi))
    ) {
      return sourceValueSi;
    }

    return convertQuantityToSi(outputKey, displayValue, unitSystem);
  }

  function draftToBand(draft: BandDraft): NumericBand {
    return {
      label: draft.label,
      color: draft.color,
      min: draft.unboundedBelow
        ? Number.NEGATIVE_INFINITY
        : parseFiniteValue(draft.minValue, draft.minSourceSi),
      max: draft.unboundedAbove
        ? Number.POSITIVE_INFINITY
        : parseFiniteValue(draft.maxValue, draft.maxSourceSi),
    };
  }

  function openEditor() {
    drafts = toDrafts(bands);
    listErrors = [];
    editorOpen = true;
  }

  function cancelEditing() {
    editorOpen = false;
    drafts = [];
    listErrors = [];
  }

  function addBand() {
    drafts = [
      ...drafts,
      {
        label: "New band",
        color: "#94a3b8",
        minValue: "",
        maxValue: "",
        unboundedBelow: false,
        unboundedAbove: false,
      },
    ];
    listErrors = [];
  }

  function removeBand(index: number) {
    if (drafts.length <= 1) return;
    drafts = drafts.filter((_, draftIndex) => draftIndex !== index);
    listErrors = [];
  }

  function resetDrafts() {
    drafts = toDrafts(defaultBands);
    listErrors = [];
  }

  function applyDrafts() {
    if (!draftValidation.valid) {
      const validationMessages = draftValidation.issues
        .filter((issue) => issue.bandIndex === undefined || issue.code === "overlap")
        .map(({ message }) => message);
      listErrors = validationMessages.length > 0
        ? [...new Set(validationMessages)]
        : ["Resolve the highlighted band errors before applying changes."];
      return;
    }

    const nextBands = normalizeNumericBands(draftBands);
    if (onApply(nextBands) === false) {
      listErrors = ["The band changes could not be applied."];
      return;
    }

    editorOpen = false;
  }
</script>

<Button
  color="light"
  pill
  size="xs"
  aria-label="Edit chart thresholds"
  class="text-stone-700"
  onclick={openEditor}
>
  Thresholds
</Button>

<Modal
  bind:open={editorOpen}
  title="Edit chart thresholds"
  size="xl"
  autoclose={false}
  outsideclose={false}
>
  <div class="grid gap-4">
    <p class="text-sm text-stone-600">
      Bands use lower-inclusive and upper-exclusive boundaries. Gaps remain unclassified.
    </p>

    {#if listErrors.length > 0}
      <div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
        <ul class="list-disc space-y-1 pl-5">
          {#each listErrors as error}
            <li>{error}</li>
          {/each}
        </ul>
      </div>
    {/if}

    <div class="grid max-h-[55vh] gap-3 overflow-y-auto pr-1">
      {#each drafts as draft, index}
        <fieldset class="grid gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
          <legend class="px-1 text-xs font-semibold uppercase tracking-wider text-stone-500">
            Band {index + 1}
          </legend>

          <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto]">
            <div class="grid gap-1">
              <Label for={`${idPrefix}-band-${index}-label`}>Label</Label>
              <Input
                id={`${idPrefix}-band-${index}-label`}
                aria-label={`Band ${index + 1} label`}
                value={draft.label}
                oninput={(event) => updateDraft(index, { label: event.currentTarget.value })}
              />
            </div>
            <div class="grid gap-1">
              <Label for={`${idPrefix}-band-${index}-color`}>Color</Label>
              <input
                id={`${idPrefix}-band-${index}-color`}
                aria-label={`Band ${index + 1} color`}
                type="color"
                value={draft.color}
                oninput={(event) => updateDraft(index, { color: event.currentTarget.value })}
                class="h-[42px] w-full rounded-lg border border-stone-300 bg-white p-1"
              />
            </div>
            <div class="flex items-end">
              <Button
                color="light"
                size="sm"
                aria-label={`Remove band ${index + 1}`}
                disabled={drafts.length === 1}
                onclick={() => removeBand(index)}
              >
                <TrashBinOutline class="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div class="grid gap-2">
              <Label for={`${idPrefix}-band-${index}-min`}>Lower bound{unitSuffix}</Label>
              <Input
                id={`${idPrefix}-band-${index}-min`}
                type="number"
                step={outputMeta.step}
                aria-label={`Band ${index + 1} lower bound`}
                value={draft.minValue}
                disabled={draft.unboundedBelow}
                oninput={(event) => updateDraft(index, { minValue: event.currentTarget.value })}
              />
              <label class="flex items-center gap-2 text-xs text-stone-600">
                <input
                  type="checkbox"
                  aria-label={`Band ${index + 1} unbounded below`}
                  checked={draft.unboundedBelow}
                  onchange={(event) => updateDraft(index, { unboundedBelow: event.currentTarget.checked })}
                  class="rounded border-stone-300 text-teal-600 focus:ring-teal-500"
                />
                Unbounded below
              </label>
            </div>
            <div class="grid gap-2">
              <Label for={`${idPrefix}-band-${index}-max`}>Upper bound{unitSuffix}</Label>
              <Input
                id={`${idPrefix}-band-${index}-max`}
                type="number"
                step={outputMeta.step}
                aria-label={`Band ${index + 1} upper bound`}
                value={draft.maxValue}
                disabled={draft.unboundedAbove}
                oninput={(event) => updateDraft(index, { maxValue: event.currentTarget.value })}
              />
              <label class="flex items-center gap-2 text-xs text-stone-600">
                <input
                  type="checkbox"
                  aria-label={`Band ${index + 1} unbounded above`}
                  checked={draft.unboundedAbove}
                  onchange={(event) => updateDraft(index, { unboundedAbove: event.currentTarget.checked })}
                  class="rounded border-stone-300 text-teal-600 focus:ring-teal-500"
                />
                Unbounded above
              </label>
            </div>
          </div>

          {#if rowErrors[index].length > 0}
            <ul class="list-disc space-y-1 pl-5 text-xs text-red-600" aria-label={`Band ${index + 1} errors`}>
              {#each rowErrors[index] as error}
                <li>{error}</li>
              {/each}
            </ul>
          {/if}
        </fieldset>
      {/each}
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4">
      <Button color="light" size="sm" onclick={addBand}>
        <PlusOutline class="me-1 h-4 w-4" />
        Add band
      </Button>
      <div class="flex flex-wrap justify-end gap-2">
        <Button color="light" size="sm" onclick={resetDrafts}>Reset</Button>
        <Button color="light" size="sm" onclick={cancelEditing}>Cancel</Button>
        <Button color="primary" size="sm" onclick={applyDrafts}>Apply</Button>
      </div>
    </div>
  </div>
</Modal>
