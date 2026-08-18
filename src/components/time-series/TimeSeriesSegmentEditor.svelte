<svelte:options runes={true} />

<script lang="ts">
  import { Button, Input, Label } from "flowbite-svelte";
  import {
    ChevronDownOutline,
    ChevronUpOutline,
    FileCopyOutline,
    TrashBinOutline,
  } from "flowbite-svelte-icons";

  import type { TimeSeriesSegmentViewModel } from "../../models/timeSeries";
  import type { TimeSeriesController } from "../../state/timeSeries/types";

  interface Props {
    controller: TimeSeriesController;
    segment: TimeSeriesSegmentViewModel;
    index: number;
    count: number;
  }

  let { controller, segment, index, count }: Props = $props();
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
      aria-label={"Segment " + (index + 1) + " name"}
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
        aria-label={"Move " + segment.name + " up"}
        onclick={() => controller.actions.moveSegment(segment.id, -1)}
      >
        <ChevronUpOutline class="h-3.5 w-3.5" />
      </Button>
      <Button
        color="light"
        size="xs"
        disabled={index === count - 1}
        aria-label={"Move " + segment.name + " down"}
        onclick={() => controller.actions.moveSegment(segment.id, 1)}
      >
        <ChevronDownOutline class="h-3.5 w-3.5" />
      </Button>
      <Button
        color="light"
        size="xs"
        aria-label={"Duplicate " + segment.name}
        onclick={() => controller.actions.duplicateSegment(segment.id)}
      >
        <FileCopyOutline class="h-3.5 w-3.5" />
      </Button>
      <Button
        color="light"
        size="xs"
        disabled={count === 1}
        aria-label={"Remove " + segment.name}
        onclick={() => controller.actions.removeSegment(segment.id)}
      >
        <TrashBinOutline class="h-3.5 w-3.5" />
      </Button>
    </div>
  </header>

  <div class="mt-3 grid grid-cols-2 gap-2">
    <div>
      <Label for={segment.id + "-duration"} class="text-xs text-stone-600">
        Duration (min)
      </Label>
      <Input
        id={segment.id + "-duration"}
        aria-label={segment.name + " duration"}
        type="number"
        min={1}
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
    {#each segment.controls as control (control.id)}
      <div>
        <Label for={segment.id + "-" + control.id} class="text-xs text-stone-600">
          {control.label}{control.displayUnits ? " (" + control.displayUnits + ")" : ""}
        </Label>
        <Input
          id={segment.id + "-" + control.id}
          aria-label={segment.name + " " + control.label}
          type="number"
          min={control.min}
          max={control.max}
          step={control.step}
          size="sm"
          value={String(control.value)}
          class="mt-1 border-stone-300 bg-white"
          onchange={(event) => controller.actions.updateSegmentControl(
            segment.id,
            control.id,
            event.currentTarget.value,
          )}
        />
      </div>
    {/each}
  </div>
</article>
