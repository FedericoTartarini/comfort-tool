<script lang="ts">
  import type { RegisteredModel } from "$lib/core/modelDeclaration";
  import { standards } from "$lib/core/standard";
  import { unitSystem } from "$lib/core/unitSystem";
  import { Outputs } from "$lib/state/compute.svelte";
  import { Session } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import ChartLegend from "$lib/ui/charts/ChartLegend.svelte";
  import PlotlyChart from "$lib/ui/charts/PlotlyChart.svelte";
  import ChartControls from "$lib/ui/inputs/ChartControls.svelte";
  import InputPanel from "$lib/ui/inputs/InputPanel.svelte";
  import ModelSwitchDialog from "$lib/ui/inputs/ModelSwitchDialog.svelte";
  import Grid from "$lib/ui/layout/Grid.svelte";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import ResultTable from "$lib/ui/outputs/ResultTable.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import { Label } from "$lib/ui/primitives/label";
  import * as Select from "$lib/ui/primitives/select";
  import { defaultModel, modelFromRoute, modelsOf, navigateTo, pathTo, requireStandard } from "./navigation";

  const id = $props.id();
  const session = new Session(modelFromRoute() ?? defaultModel());
  const outputs = new Outputs(session);

  // The URL names the model; an unknown URL falls back to the default. This is
  // the address's path — a typed URL, the back button, a share link — and it
  // never asks. After an in-app switch it finds the model already current and
  // does nothing.
  $effect(() => {
    const model = modelFromRoute();
    if (model) {
      session.setModel(model);
    } else {
      navigateTo(defaultModel());
    }
  });

  /**
   * Switching from inside the app: the session is asked first and the address
   * is told after, which is the order ADR-0002 decision 32 needs. Navigating
   * first would make the address the thing that switches the model, leaving no
   * moment at which the session could ask about the switch. No effect follows
   * the session with the address, because the handlers that switch can say
   * both things themselves.
   */
  function switchModel(model: RegisteredModel) {
    session.requestModel(model);
    navigateToSessionModel();
  }

  function acceptSwitch() {
    session.acceptSwitch();
    navigateToSessionModel();
  }

  /**
   * The address follows the session, never the other way round. A request the
   * session held a question about changed no model, so there is nothing to
   * tell the address until the question has been answered with a yes.
   */
  function navigateToSessionModel() {
    if (session.model !== modelFromRoute()) {
      navigateTo(session.model);
    }
  }

  const navigation = $derived(
    standards
      .map((entry) => ({ standard: entry, models: modelsOf(entry.id) }))
      .filter((group) => group.models.length > 0),
  );

  const modelChoices = $derived(modelsOf(requireStandard(session.model)));

  function unitVariant(system: typeof unitSystem.si | typeof unitSystem.ip) {
    return session.unitSystem === system ? "default" : "outline";
  }
</script>

<main>
  <Stack gap="6">
    <Inline justify="between" align="center">
      <h1>{copy.appTitle}</h1>
      <Inline gap="2" align="center">
        <span>{copy.units}</span>
        <Button size="sm" variant={unitVariant(unitSystem.si)} onclick={() => (session.unitSystem = unitSystem.si)}>
          {unitSystem.si.title}
        </Button>
        <Button size="sm" variant={unitVariant(unitSystem.ip)} onclick={() => (session.unitSystem = unitSystem.ip)}>
          {unitSystem.ip.title}
        </Button>
      </Inline>
    </Inline>

    <Grid columns="12rem minmax(0, 24rem) minmax(0, 1fr)" gap="6">
      <nav>
        <Stack gap="2">
          {#each navigation as group (group.standard.id)}
            <strong>{group.standard.displayName}</strong>
            {#each group.models as model (model)}
              <a href={pathTo(model)} aria-current={session.model === model ? "page" : undefined}>
                {model.info.label}
              </a>
            {/each}
          {/each}
        </Stack>
      </nav>

      <section>
        <Stack gap="4">
          <h2>{copy.inputs}</h2>
          <Inline gap="2" align="center">
            <Label for="{id}-model">{copy.model}</Label>
            <!--
              A function binding, not a value plus a change handler: the
              session, not the select, decides which model is current, and a
              switch the person declines has to leave the select where it was.
              With a one-way `value` the select would keep the model it had
              offered, disagree with the page behind the dialog, and refuse to
              offer that model a second time.
            -->
            <Select.Root
              type="single"
              bind:value={
                () => String(modelChoices.indexOf(session.model)),
                (value) => switchModel(modelChoices[Number(value)])
              }
            >
              <Select.Trigger id="{id}-model">{session.model.info.label}</Select.Trigger>
              <Select.Content>
                {#each modelChoices as model, index (model)}
                  <Select.Item value={String(index)} label={model.info.label} />
                {/each}
              </Select.Content>
            </Select.Root>
          </Inline>
          <InputPanel
            model={session.model}
            inputSlot={session.slots[0]}
            unitSystem={session.unitSystem}
            outOfRange={outputs.outOfRange}
            violations={outputs.violations}
          />
          <ModelSwitchDialog
            pending={session.pendingSwitch}
            unitSystem={session.unitSystem}
            onaccept={acceptSwitch}
            ondecline={() => session.declineSwitch()}
          />
        </Stack>
      </section>

      <section>
        <Stack gap="4">
          <ResultTable
            model={session.model}
            result={outputs.perSlot[0]}
            unitSystem={session.unitSystem}
            slotName={copy.slotName(0)}
            outOfRange={outputs.outOfRange.length > 0}
            violations={outputs.violations}
          />

          <ChartControls model={session.model} inputSlot={session.slots[0]} chart={session.chart} />

          {#if outputs.chart}
            <Stack gap="2">
              <PlotlyChart spec={outputs.chart} />
              <ChartLegend entries={outputs.chart.legend} />
            </Stack>
          {/if}
        </Stack>
      </section>
    </Grid>
  </Stack>
</main>

<style>
  main {
    padding: 1.5rem;
  }

  h1 {
    font-size: 1.25rem;
    font-weight: 600;
  }

  h2 {
    font-size: 1rem;
    font-weight: 600;
  }

  nav a {
    color: var(--muted-foreground);
    text-decoration: none;
  }

  nav a[aria-current="page"] {
    color: var(--foreground);
    font-weight: 500;
  }
</style>
