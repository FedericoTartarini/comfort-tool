<script lang="ts">
  import { standardPath } from "$lib/core/standard";
  import { unitSystem } from "$lib/core/unitSystem";
  import { Outputs, observeSession } from "$lib/state/compute.svelte";
  import { Session } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import InputPanel from "$lib/ui/inputs/InputPanel.svelte";
  import Grid from "$lib/ui/layout/Grid.svelte";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import ResultTable from "$lib/ui/outputs/ResultTable.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import { defaultModel, modelFromRoute, navigateTo, pathTo, standardModels } from "./navigation";

  const session = new Session(modelFromRoute() ?? defaultModel());
  const outputs = new Outputs();
  observeSession(session, outputs);

  // The URL names the model; an unknown URL falls back to the default.
  $effect(() => {
    const model = modelFromRoute();
    if (model) {
      session.model = model;
    } else {
      navigateTo(defaultModel());
    }
  });

  const navigation = $derived(
    standardPath
      .map((row) => ({
        standard: row.standard,
        models: standardModels().filter((model) => model.model.standard === row.standard),
      }))
      .filter((group) => group.models.length > 0),
  );

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
          {#each navigation as group (group.standard)}
            <strong>{group.standard.name}</strong>
            {#each group.models as model (model)}
              <a href={pathTo(model)} aria-current={session.model === model ? "page" : undefined}>
                {model.model.label}
              </a>
            {/each}
          {/each}
        </Stack>
      </nav>

      <section>
        <Stack gap="4">
          <h2>{copy.inputs}</h2>
          <InputPanel
            model={session.model}
            inputSlot={session.slots[0]}
            unitSystem={session.unitSystem}
            outOfRange={outputs.outOfRange}
          />
        </Stack>
      </section>

      <section>
        <ResultTable
          model={session.model}
          measures={outputs.perSlot[0]}
          unitSystem={session.unitSystem}
          slotName={copy.slotName(0)}
          outOfRange={outputs.outOfRange.length > 0}
        />
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
