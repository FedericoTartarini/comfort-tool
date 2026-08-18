<svelte:options runes={true} />

<script lang="ts">
  import { Button, Input, Label } from "flowbite-svelte";
  import {
    ChevronDownOutline,
    ChevronUpOutline,
    FileCopyOutline,
    TrashBinOutline,
  } from "flowbite-svelte-icons";

  import type { PhsTimeSeriesSegment } from "../../models/phs";
  import { FieldKey, type FieldKey as FieldKeyType } from "../../models/fieldKeys";
  import { fieldMetaByKey } from "../../models/inputFieldsMeta";
  import { convertFieldValueFromSi } from "../../services/units";
  import type { TimeSeriesController } from "../../state/timeSeries/types";

  interface Props {
    controller: TimeSeriesController;
    segment: PhsTimeSeriesSegment;
    index: number;
    count: number;
  }

  let { controller, segment, index, count }: Props = $props();

  const fields = [
    { key: FieldKey.DryBulbTemperature, label: "Air temperature", min: 15, max: 50 },
    { key: FieldKey.MeanRadiantTemperature, label: "Radiant temperature", min: 0, max: 60 },
    { key: FieldKey.WindSpeed, label: "Air speed", min: 0, max: 3 },
    { key: FieldKey.RelativeHumidity, label: "Relative humidity", min: 0, max: 100 },
    { key: FieldKey.MetabolicRate, label: "Metabolic rate", min: 0.9, max: 3.9 },
    { key: FieldKey.ClothingInsulation, label: "Clothing insulation", min: 0.1, max: 1 },
  ] as const satisfies readonly {
    key: FieldKeyType;
    label: string;
    min: number;
    max: number;
  }[];

  type SegmentField = (typeof fields)[number]["key"];

  function fieldUnits(field: SegmentField): string {
    return fieldMetaByKey[field].displayUnits[controller.state.unitSystem];
  }

  function fieldStep(field: SegmentField): number {
    return fieldMetaByKey[field].step;
  }

  function displayedBoundary(field: SegmentField, valueSi: number): number {
    return convertFieldValueFromSi(field, valueSi, controller.state.unitSystem);
  }
</script>

<article
  class="rounded-xl border border-stone-200 bg-white p-3 shadow-sm"
  data-testid="time-series-segment"
>
  <header class="flex items-center gap-2">
    <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700">
      {index + 1}
    </span>
    <Input
      aria-label={`Segment ${index + 1} name`}
      value={segment.name}
      size="sm"
      class="min-w-0 flex-1 border-stone-300 bg-white font-medium"
      onchange={(event) => controller.actions.updateSegmentName(
        segment.id,
        event.currentTarget.value,
      )}
    />
    <div class="flex shrink-0 items-center gap-1">
      <Button
        color="light"
        size="xs"
        disabled={index === 0}
        aria-label={`Move ${segment.name} up`}
        onclick={() => controller.actions.moveSegment(segment.id, -1)}
      >
        <ChevronUpOutline class="h-3.5 w-3.5" />
      </Button>
      <Button
        color="light"
        size="xs"
        disabled={index === count - 1}
        aria-label={`Move ${segment.name} down`}
        onclick={() => controller.actions.moveSegment(segment.id, 1)}
      >
        <ChevronDownOutline class="h-3.5 w-3.5" />
      </Button>
      <Button
        color="light"
        size="xs"
        aria-label={`Duplicate ${segment.name}`}
        onclick={() => controller.actions.duplicateSegment(segment.id)}
      >
        <FileCopyOutline class="h-3.5 w-3.5" />
      </Button>
      <Button
        color="light"
        size="xs"
        disabled={count === 1}
        aria-label={`Remove ${segment.name}`}
        onclick={() => controller.actions.removeSegment(segment.id)}
      >
        <TrashBinOutline class="h-3.5 w-3.5" />
      </Button>
    </div>
  </header>

  <div class="mt-3 grid grid-cols-2 gap-2">
    <div>
      <Label for={`${segment.id}-duration`} class="text-xs text-stone-600">
        Duration (min)
      </Label>
      <Input
        id={`${segment.id}-duration`}
        aria-label={`${segment.name} duration`}
        type="number"
        min={1}
        max={480}
        step={1}
        size="sm"
        value={String(segment.durationMinutes)}
        class="mt-1 border-stone-300 bg-white"
        onchange={(event) => controller.actions.updateSegmentDuration(
          segment.id,
          event.currentTarget.value,
        )}
      />
    </div>
    {#each fields as field}
      <div>
        <Label for={`${segment.id}-${field.key}`} class="text-xs text-stone-600">
          {field.label} ({fieldUnits(field.key)})
        </Label>
        <Input
          id={`${segment.id}-${field.key}`}
          aria-label={`${segment.name} ${field.label}`}
          type="number"
          min={displayedBoundary(field.key, field.min)}
          max={displayedBoundary(field.key, field.max)}
          step={fieldStep(field.key)}
          size="sm"
          value={String(controller.selectors.getSegmentDisplayValue(segment, field.key))}
          class="mt-1 border-stone-300 bg-white"
          onchange={(event) => controller.actions.updateSegmentField(
            segment.id,
            field.key,
            event.currentTarget.value,
          )}
        />
      </div>
    {/each}
  </div>
</article>
