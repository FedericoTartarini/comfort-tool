<script lang="ts">
  import { unitSystem, type UnitSystem } from "$lib/core/unitSystem";
  import type { Session } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import { Button } from "$lib/ui/primitives/button";

  interface Props {
    /** Whose unit system the buttons show and change: the session's, on every page. */
    session: Session;
  }

  let { session }: Props = $props();

  function unitVariantFor(system: UnitSystem) {
    return session.unitSystem === system ? "default" : "outline";
  }
</script>

<Inline gap="2" align="center">
  <span>{copy.units}</span>
  {#each Object.values(unitSystem) as system (system)}
    <Button size="sm" variant={unitVariantFor(system)} onclick={() => (session.unitSystem = system)}>
      {system.title}
    </Button>
  {/each}
</Inline>
