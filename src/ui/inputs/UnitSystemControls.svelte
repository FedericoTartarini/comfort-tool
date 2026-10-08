<script lang="ts">
  import { unitSystem, type UnitSystem } from "$lib/core/unitSystem";
  import type { Session } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import * as ToggleGroup from "$lib/ui/primitives/toggle-group";

  interface Props {
    /** Whose unit system the toggle group shows and changes: the session's, on every page. */
    session: Session;
  }

  let { session }: Props = $props();

  const id = $props.id();
  const systems: readonly UnitSystem[] = Object.values(unitSystem);
</script>

<Inline gap="2" align="center">
  <span id="{id}-units">{copy.units}</span>
  <!--
    A function binding, as the model select's: a click on the chosen item asks
    the group for no choice at all (an empty value), which the setter ignores,
    so one system is always chosen.
  -->
  <ToggleGroup.Root
    type="single"
    variant="outline"
    size="sm"
    aria-labelledby="{id}-units"
    bind:value={
      () => String(systems.indexOf(session.unitSystem)),
      (value) => {
        if (value !== "") {
          session.unitSystem = systems[Number(value)];
        }
      }
    }
  >
    {#each systems as system, index (system)}
      <ToggleGroup.Item value={String(index)}>{system.title}</ToggleGroup.Item>
    {/each}
  </ToggleGroup.Root>
</Inline>
