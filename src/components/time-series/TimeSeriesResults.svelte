<svelte:options runes={true} />

<script lang="ts">
  import { Badge, Card } from "flowbite-svelte";

  import { ModelOutputKey } from "../../models/modelCapabilities";
  import { PhsLimitingCriterion } from "../../models/phs";
  import {
    convertModelOutputFromSi,
    formatDisplayValue,
    getModelOutputDisplayMeta,
  } from "../../services/units";
  import type { TimeSeriesController } from "../../state/timeSeries/types";
  import PlotlyCanvas from "../chart/PlotlyCanvas.svelte";

  interface Props {
    controller: TimeSeriesController;
  }

  let { controller }: Props = $props();

  const result = $derived(controller.state.lastSuccessfulResult);
  const charts = $derived(controller.selectors.getCharts());
  const temperatureChart = $derived(charts?.primary ?? null);
  const waterLossChart = $derived(charts?.secondary ?? null);
  const temperatureMeta = $derived(getModelOutputDisplayMeta(
    ModelOutputKey.PhsRectalTemperature,
    controller.state.unitSystem,
  ));
  const waterLossMeta = $derived(getModelOutputDisplayMeta(
    ModelOutputKey.PhsWaterLoss,
    controller.state.unitSystem,
  ));

  function formatMinute(minute: number | null): string {
    return minute === null ? "Not reached" : `${(minute / 60).toFixed(2)} h`;
  }

  function limitingCriterionLabel(): string {
    if (!result || result.limitingCriterion === PhsLimitingCriterion.None) {
      return "No limit reached";
    }
    return result.limitingCriterion === PhsLimitingCriterion.RectalTemperature
      ? "Rectal temperature"
      : "Water loss";
  }
</script>

<div class="grid gap-4">
  {#if controller.selectors.hasStaleResult()}
    <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
      Inputs have changed. The charts below show the last successful run.
    </div>
  {/if}

  <section aria-labelledby="phs-summary-heading">
    <header class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p class="text-eyebrow">Simulation results</p>
        <h2 id="phs-summary-heading" class="mt-1 text-xl font-semibold text-stone-950">
          Exposure summary
        </h2>
      </div>
      <Badge color="blue">ISO 7933:2023</Badge>
    </header>

    <div class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Card size="none" class="border-stone-200 p-3 shadow-sm">
        <p class="text-xs font-medium text-stone-500">Peak rectal temperature</p>
        <p class="mt-2 text-lg font-semibold text-stone-950">
          {#if result}
            {formatDisplayValue(
              convertModelOutputFromSi(
                ModelOutputKey.PhsRectalTemperature,
                result.peakRectalTemperatureC,
                controller.state.unitSystem,
              ),
              temperatureMeta.decimals,
            )} {temperatureMeta.displayUnits}
          {:else}—{/if}
        </p>
      </Card>
      <Card size="none" class="border-stone-200 p-3 shadow-sm">
        <p class="text-xs font-medium text-stone-500">First 38 °C exceedance</p>
        <p class="mt-2 text-lg font-semibold text-stone-950">
          {result ? formatMinute(result.firstRectalLimitMinute) : "—"}
        </p>
      </Card>
      <Card size="none" class="border-stone-200 p-3 shadow-sm">
        <p class="text-xs font-medium text-stone-500">Final water loss</p>
        <p class="mt-2 text-lg font-semibold text-stone-950">
          {#if result}
            {formatDisplayValue(
              convertModelOutputFromSi(
                ModelOutputKey.PhsWaterLoss,
                result.finalWaterLossG,
                controller.state.unitSystem,
              ),
              waterLossMeta.decimals,
            )} {waterLossMeta.displayUnits}
          {:else}—{/if}
        </p>
      </Card>
      <Card size="none" class="border-stone-200 p-3 shadow-sm">
        <p class="text-xs font-medium text-stone-500">Water-loss limit</p>
        <p class="mt-2 text-lg font-semibold text-stone-950">
          {result ? formatMinute(result.firstWaterLossLimitMinute) : "—"}
        </p>
      </Card>
      <Card size="none" class="border-stone-200 p-3 shadow-sm">
        <p class="text-xs font-medium text-stone-500">Limiting criterion</p>
        <p class="mt-2 text-lg font-semibold text-stone-950">
          {result ? limitingCriterionLabel() : "—"}
        </p>
        {#if result?.limitingMinute !== null && result?.limitingMinute !== undefined}
          <p class="mt-1 text-xs text-stone-500">{formatMinute(result.limitingMinute)}</p>
        {/if}
      </Card>
    </div>
  </section>

  <Card size="none" class="border-stone-300 p-3 shadow-sm">
    <header class="px-1 pt-1">
      <h2 class="text-base font-semibold text-stone-900">Body temperature</h2>
      <p class="mt-1 text-xs text-stone-500">
        Matches the CBE PHS chart structure: rectal temperature, optional core temperature, and the 38 °C limit.
      </p>
    </header>
    <div class="mt-2 min-h-[390px] overflow-hidden rounded-lg bg-white" data-testid="phs-temperature-chart">
      <PlotlyCanvas
        chartResult={temperatureChart}
        isLoading={controller.state.status === "running"}
        emptyMessage="Run the simulation to generate the PHS temperature chart."
        heightClass="h-[390px]"
      />
    </div>
  </Card>

  <Card size="none" class="border-stone-300 p-3 shadow-sm">
    <header class="px-1 pt-1">
      <h2 class="text-base font-semibold text-stone-900">Predicted water loss</h2>
      <p class="mt-1 text-xs text-stone-500">
        The limit is 5% of body mass when drinking is allowed and 3% otherwise.
      </p>
    </header>
    <div class="mt-2 min-h-[360px] overflow-hidden rounded-lg bg-white" data-testid="phs-water-loss-chart">
      <PlotlyCanvas
        chartResult={waterLossChart}
        isLoading={controller.state.status === "running"}
        emptyMessage="Run the simulation to generate the water-loss chart."
        heightClass="h-[360px]"
      />
    </div>
  </Card>

  <p class="text-xs leading-5 text-stone-500">
    Visual reference:
    <a
      class="font-medium text-sky-700 underline underline-offset-2"
      href="https://comfort.cbe.berkeley.edu/phs"
      target="_blank"
      rel="noreferrer"
    >CBE Thermal Comfort Tool PHS</a>.
    This draft calculates ISO 7933:2023; the reference page documents the older 2004 edition.
  </p>
</div>
