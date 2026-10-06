<script lang="ts">
  import { kindBounds, quantities } from "$lib/core/quantities";
  import type { Session } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import { Button } from "$lib/ui/primitives/button";
  import CopyLinkButton from "./CopyLinkButton.svelte";
  import EntryModeControls from "./EntryModeControls.svelte";
  import QuantityInput from "./QuantityInput.svelte";
  import QuestionDialog from "./QuestionDialog.svelte";

  interface Props {
    /** Whose atmospheric pressure and entry modes the controls show and change: the session's, on every page. */
    session: Session;
    /** Whether the session's pressure is outside its bound. */
    atmosphericPressureOutOfRange: boolean;
    /** Replace the tab's session with the defaults, once the person has said yes. */
    onreset: () => void;
    /** The share link to the page as it is now. */
    link: () => string;
    /** The clipboard refused the link. */
    oncopyrefused: () => void;
  }

  let { session, atmosphericPressureOutOfRange, onreset, link, oncopyrefused }: Props = $props();

  /** Whether Reset's question stands: the button's own, as nothing else reads it. */
  let askingReset = $state(false);

  // The question is closed before the session is replaced, which builds the
  // page, and these controls with it, again on the new one.
  function acceptReset() {
    askingReset = false;
    onreset();
  }
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
<!--
  Copy link puts the page as it is on the clipboard; Reset asks first, and on
  a yes the tab shows what a new tab at this address shows (ADR-0002 decision
  63, rules 7 and 8). Their place and look are Phase 5c's.
-->
<CopyLinkButton {link} onrefused={oncopyrefused} />
<Button size="sm" variant="outline" onclick={() => (askingReset = true)}>{copy.reset}</Button>
<QuestionDialog
  open={askingReset}
  title={copy.reset}
  question={copy.resetQuestion}
  acceptLabel={copy.resetAccept}
  declineLabel={copy.resetDecline}
  onaccept={acceptReset}
  ondecline={() => (askingReset = false)}
/>
