<svelte:options runes={true} />

<script lang="ts">
  import { Button, Card, Input, Label, Select, Toggle } from "flowbite-svelte";
  import { PlusOutline, RefreshOutline } from "flowbite-svelte-icons";

  import { UnitSystem } from "../../models/units";
  import type { TimeSeriesModelId } from "../../state/timeSeries/modelConfigs";
  import type { TimeSeriesController } from "../../state/timeSeries/types";
  import TimeSeriesSegmentEditor from "./TimeSeriesSegmentEditor.svelte";

  interface Props {
    controller: TimeSeriesController;
  }

  let { controller }: Props = $props();

  const modelItems = $derived(controller.selectors.getModelOptions());
  const currentModel = $derived(controller.selectors.getCurrentModel());
  const editor = $derived(controller.selectors.getEditor());
  const totalDurationMinutes = $derived(controller.selectors.getTotalDurationMinutes());
  const totalDurationHours = $derived(totalDurationMinutes / 60);
  const status = $derived(controller.selectors.getStatus());
  const progress = $derived(controller.selectors.getProgress());
  const errors = $derived(controller.selectors.getErrors());
  const statusText = $derived(
    status === "updating" && progress > 0
      ? "Updating " + Math.round(progress * 100) + "%"
      : status.charAt(0).toUpperCase() + status.slice(1),
  );
  const statusClass = $derived(
    status === "ready"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "error"
        ? "border-red-200 bg-red-50 text-red-800"
        : status === "updating"
          ? "border-sky-200 bg-sky-50 text-sky-800"
          : "border-amber-200 bg-amber-50 text-amber-800",
  );
</script>

<Card size="none" class="w-full border-stone-300 p-4 shadow-sm">
  <header>
    <p class="text-eyebrow">{currentModel.label} scenario</p>
    <h1 class="mt-1 text-xl font-semibold text-stone-950">Time-series</h1>
    <p class="mt-1 text-sm leading-6 text-stone-600">{currentModel.description}</p>
  </header>

  <div class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
    <div>
      <Label for="time-series-model" class="text-eyebrow">Model</Label>
      <Select
        id="time-series-model"
        items={[...modelItems]}
        value={controller.state.selectedModel}
        size="sm"
        class="mt-1.5"
        aria-label="Select time-series model"
        onchange={(event) => controller.actions.selectModel(
          event.currentTarget.value as TimeSeriesModelId,
        )}
      />
    </div>
    <fieldset>
      <legend class="text-eyebrow">Units</legend>
      <div class="mt-1.5 flex h-[38px] items-center justify-between rounded-lg border border-stone-300 bg-stone-50 px-3">
        <span class={controller.state.unitSystem === UnitSystem.SI ? "text-xs font-semibold text-stone-900" : "text-xs text-stone-500"}>SI</span>
        <Toggle
          checked={controller.state.unitSystem === UnitSystem.IP}
          onchange={controller.actions.toggleUnitSystem}
          aria-label="Use IP units for time-series"
          color="teal"
          size="small"
        />
        <span class={controller.state.unitSystem === UnitSystem.IP ? "text-xs font-semibold text-stone-900" : "text-xs text-stone-500"}>IP</span>
      </div>
    </fieldset>
  </div>

  <section class="mt-5" aria-labelledby="scenario-segments-heading">
    <header class="flex items-end justify-between gap-3">
      <div>
        <h2 id="scenario-segments-heading" class="text-sm font-semibold text-stone-900">
          Scenario segments
        </h2>
        <p class="mt-1 text-xs text-stone-500">
          {totalDurationMinutes} minutes ({totalDurationHours.toFixed(2)} hours)
        </p>
      </div>
      <div class="flex gap-2">
        {#each editor.presets as preset (preset.id)}
          <Button
            color="light"
            size="xs"
            onclick={() => controller.actions.addSegment(preset.id)}
          >
            <PlusOutline class="mr-1 h-3.5 w-3.5" /> {preset.label}
          </Button>
        {/each}
      </div>
    </header>

    <div class="mt-3 grid gap-3">
      {#each editor.segments as segment, index (segment.id)}
        <TimeSeriesSegmentEditor
          {controller}
          {segment}
          {index}
          count={editor.segments.length}
        />
      {/each}
    </div>
  </section>

  {#each editor.settingsSections as section (section.id)}
    <details
      class="mt-4 rounded-xl border border-stone-200 bg-stone-50"
      data-testid={section.testId}
    >
      <summary class="cursor-pointer px-4 py-3 text-sm font-semibold text-stone-800">
        {section.title}
      </summary>
      <div class="grid gap-3 border-t border-stone-200 p-4 sm:grid-cols-2">
        {#each section.controls as control (control.id)}
          {#if control.kind === "number"}
            <div>
              <Label for={control.id} class="text-xs text-stone-600">
                {control.label}{control.displayUnits ? " (" + control.displayUnits + ")" : ""}
              </Label>
              <Input
                id={control.id}
                type="number"
                size="sm"
                min={control.min}
                max={control.max}
                step={control.step}
                value={String(control.value)}
                class="mt-1 border-stone-300 bg-white"
                onchange={(event) => controller.actions.updateSettingControl(
                  control.id,
                  event.currentTarget.value,
                )}
              />
            </div>
          {:else if control.kind === "select"}
            <div>
              <Label for={control.id} class="text-xs text-stone-600">{control.label}</Label>
              <Select
                id={control.id}
                items={[...control.items]}
                value={control.value}
                size="sm"
                class="mt-1"
                onchange={(event) => controller.actions.updateSettingControl(
                  control.id,
                  event.currentTarget.value,
                )}
              />
            </div>
          {:else}
            <label class="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-700">
              {control.label}
              <Toggle
                checked={control.value}
                onchange={(event) => controller.actions.updateSettingControl(
                  control.id,
                  event.currentTarget.checked,
                )}
                aria-label={control.label}
                color="teal"
                size="small"
              />
            </label>
          {/if}
        {/each}
      </div>
    </details>
  {/each}

  {#if errors.length > 0}
    <div class="mt-4 rounded-xl border border-red-200 bg-red-50 p-3" role="alert">
      <p class="text-sm font-semibold text-red-800">
        {status === "error" ? "Calculation error" : "Check the scenario"}
      </p>
      <ul class="mt-1 list-disc space-y-1 pl-5 text-xs leading-5 text-red-700">
        {#each errors as error}
          <li>{error}</li>
        {/each}
      </ul>
    </div>
  {/if}

  <footer class="mt-4 flex items-center justify-between gap-3">
    <span
      class={"inline-flex rounded-full border px-3 py-1 text-xs font-semibold " + statusClass}
      data-testid="time-series-status"
      role="status"
    >
      {statusText}
    </span>
    <Button color="light" onclick={controller.actions.reset}>
      <RefreshOutline class="mr-2 h-4 w-4" /> Reset
    </Button>
  </footer>
</Card>
