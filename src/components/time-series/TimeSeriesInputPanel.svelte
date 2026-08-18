<svelte:options runes={true} />

<script lang="ts">
  import { Button, Card, Input, Label, Select, Toggle } from "flowbite-svelte";
  import {
    PlusOutline,
    RefreshOutline,
    PlayOutline,
  } from "flowbite-svelte-icons";

  import { PhsPosture } from "../../models/phs";
  import { PhsSegmentPreset } from "../../models/timeSeries";
  import { ComfortModel } from "../../models/comfortModels";
  import { UnitSystem } from "../../models/units";
  import type { TimeSeriesController } from "../../state/timeSeries/types";
  import TimeSeriesSegmentEditor from "./TimeSeriesSegmentEditor.svelte";

  interface Props {
    controller: TimeSeriesController;
  }

  let { controller }: Props = $props();

  const modelItems = [{
    name: "Predicted Heat Strain (PHS)",
    value: ComfortModel.Phs2023,
  }];
  const postureItems = [
    { name: "Sitting", value: PhsPosture.Sitting },
    { name: "Standing", value: PhsPosture.Standing },
    { name: "Crouching", value: PhsPosture.Crouching },
  ];
  const totalDurationMinutes = $derived(controller.selectors.getTotalDurationMinutes());
  const durationOverLimit = $derived(totalDurationMinutes > 480);
  const weightUnit = $derived(controller.state.unitSystem === UnitSystem.IP ? "lb" : "kg");
  const heightUnit = $derived(controller.state.unitSystem === UnitSystem.IP ? "ft" : "m");
</script>

<Card size="none" class="w-full border-stone-300 p-4 shadow-sm">
  <header>
    <p class="text-eyebrow">PHS scenario</p>
    <h1 class="mt-1 text-xl font-semibold text-stone-950">Time-series</h1>
    <p class="mt-1 text-sm leading-6 text-stone-600">
      Build an ordered work sequence and run ISO 7933:2023 minute by minute.
    </p>
  </header>

  <div class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
    <div>
      <Label for="time-series-model" class="text-eyebrow">Model</Label>
      <Select
        id="time-series-model"
        items={modelItems}
        value={controller.state.selectedModel}
        disabled
        size="sm"
        class="mt-1.5"
        aria-label="Select time-series model"
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
        <p class={durationOverLimit ? "mt-1 text-xs font-medium text-red-700" : "mt-1 text-xs text-stone-500"}>
          {totalDurationMinutes} / 480 minutes
        </p>
      </div>
      <div class="flex gap-2">
        <Button
          color="light"
          size="xs"
          onclick={() => controller.actions.addSegment(PhsSegmentPreset.Work)}
        >
          <PlusOutline class="mr-1 h-3.5 w-3.5" /> Work
        </Button>
        <Button
          color="light"
          size="xs"
          onclick={() => controller.actions.addSegment(PhsSegmentPreset.Rest)}
        >
          <PlusOutline class="mr-1 h-3.5 w-3.5" /> Rest
        </Button>
      </div>
    </header>

    <div class="mt-3 grid gap-3">
      {#each controller.state.segments as segment, index (segment.id)}
        <TimeSeriesSegmentEditor
          {controller}
          {segment}
          {index}
          count={controller.state.segments.length}
        />
      {/each}
    </div>
  </section>

  <details class="mt-4 rounded-xl border border-stone-200 bg-stone-50" data-testid="phs-advanced-settings">
    <summary class="cursor-pointer px-4 py-3 text-sm font-semibold text-stone-800">
      Advanced person settings
    </summary>
    <div class="grid gap-3 border-t border-stone-200 p-4 sm:grid-cols-2">
      <div>
        <Label for="phs-weight" class="text-xs text-stone-600">Body weight ({weightUnit})</Label>
        <Input
          id="phs-weight"
          type="number"
          size="sm"
          step={controller.state.unitSystem === UnitSystem.IP ? 0.5 : 0.1}
          value={String(controller.selectors.getPersonDisplayValue("weightKg"))}
          class="mt-1 border-stone-300 bg-white"
          onchange={(event) => controller.actions.updatePersonNumber(
            "weightKg",
            event.currentTarget.value,
          )}
        />
      </div>
      <div>
        <Label for="phs-height" class="text-xs text-stone-600">Body height ({heightUnit})</Label>
        <Input
          id="phs-height"
          type="number"
          size="sm"
          step={0.01}
          value={String(controller.selectors.getPersonDisplayValue("heightM"))}
          class="mt-1 border-stone-300 bg-white"
          onchange={(event) => controller.actions.updatePersonNumber(
            "heightM",
            event.currentTarget.value,
          )}
        />
      </div>
      <div>
        <Label for="phs-posture" class="text-xs text-stone-600">Posture</Label>
        <Select
          id="phs-posture"
          items={postureItems}
          value={controller.state.person.posture}
          size="sm"
          class="mt-1"
          onchange={(event) => controller.actions.setPosture(
            event.currentTarget.value as PhsPosture,
          )}
        />
      </div>
      <fieldset class="grid gap-2">
        <legend class="text-xs text-stone-600">Worker assumptions</legend>
        <label class="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-700">
          Heat acclimatized
          <Toggle
            checked={controller.state.person.acclimatized}
            onchange={(event) => controller.actions.setAcclimatized(event.currentTarget.checked)}
            aria-label="Worker is heat acclimatized"
            color="teal"
            size="small"
          />
        </label>
        <label class="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-700">
          Drinking allowed
          <Toggle
            checked={controller.state.person.drinkingAllowed}
            onchange={(event) => controller.actions.setDrinkingAllowed(event.currentTarget.checked)}
            aria-label="Worker can drink freely"
            color="teal"
            size="small"
          />
        </label>
      </fieldset>
    </div>
  </details>

  {#if controller.state.validationIssues.length > 0}
    <div class="mt-4 rounded-xl border border-red-200 bg-red-50 p-3" role="alert">
      <p class="text-sm font-semibold text-red-800">Check the scenario</p>
      <ul class="mt-1 list-disc space-y-1 pl-5 text-xs leading-5 text-red-700">
        {#each controller.state.validationIssues as issue}
          <li>{issue}</li>
        {/each}
      </ul>
    </div>
  {/if}

  <footer class="mt-4 grid grid-cols-2 gap-2">
    <Button color="light" onclick={controller.actions.reset}>
      <RefreshOutline class="mr-2 h-4 w-4" /> Reset
    </Button>
    <Button
      class="bg-stone-900 text-white hover:bg-stone-800"
      onclick={controller.actions.runSimulation}
      disabled={controller.state.status === "running"}
    >
      <PlayOutline class="mr-2 h-4 w-4" />
      {controller.state.status === "running" ? "Running..." : "Run simulation"}
    </Button>
  </footer>
</Card>
