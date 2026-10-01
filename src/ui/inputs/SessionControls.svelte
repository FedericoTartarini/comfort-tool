<script lang="ts">
  import { kindBounds, quantities } from "$lib/core/quantities";
  import type { Session } from "$lib/state/session.svelte";
  import EntryModeControls from "./EntryModeControls.svelte";
  import QuantityInput from "./QuantityInput.svelte";

  interface Props {
    /** Whose atmospheric pressure and entry modes the controls show and change: the session's, on every page. */
    session: Session;
    /** Whether the session's pressure is outside its bound. */
    atmosphericPressureOutOfRange: boolean;
  }

  let { session, atmosphericPressureOutOfRange }: Props = $props();
</script>

<!--
  The session's pressure, not the slot's: outside the slot's rows and shown on
  every model (ADR-0002 decision 49). Its place and look are Phase 5c's.
-->
<QuantityInput
  quantity={quantities.p_atm}
  value={session.atmosphericPressure}
  unitSystem={session.unitSystem}
  bound={kindBounds[quantities.p_atm.kind]}
  outOfRange={atmosphericPressureOutOfRange}
  oncommit={(si) => (session.atmosphericPressure = si)}
/>
<!-- The session's entry modes, shown once: each converts every slot (ADR-0002 decision 51). -->
<EntryModeControls {session} />
