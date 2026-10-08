<script lang="ts">
  import { kindBounds, quantities } from "$lib/core/quantities";
  import type { Session } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import CopyLinkButton from "./CopyLinkButton.svelte";
  import QuantityInput from "./QuantityInput.svelte";
  import QuestionDialog from "./QuestionDialog.svelte";
  import UnitSystemControls from "./UnitSystemControls.svelte";

  interface Props {
    /** Whose unit system and atmospheric pressure the controls show and change: the session's, on every page. */
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
  The session controls (ADR-0002 decision 67, rule 2; CONTEXT.md): what applies
  to every slot and every page, after the navigation in the left column or in
  the row the page frame makes of it, the same on both pages. Copy link and Reset stand one under the other, so Copy
  link saying the link was copied moves nothing.
-->
<Stack gap="4">
  <UnitSystemControls {session} />
  <!-- The session's pressure, not the slot's: outside the slot's rows and shown on every model (decision 49). -->
  <QuantityInput
    quantity={quantities.p_atm}
    unitSystem={session.unitSystem}
    entries={[
      {
        value: session.atmosphericPressure,
        bound: kindBounds[quantities.p_atm.kind],
        outOfRange: atmosphericPressureOutOfRange,
        oncommit: (si) => (session.atmosphericPressure = si),
      },
    ]}
  />
  <!--
    Copy link puts the page as it is on the clipboard; Reset asks first, and on
    a yes the tab shows what a new tab at this address shows (decision 63,
    rules 7 and 8).
  -->
  <Stack gap="2">
    <CopyLinkButton {link} onrefused={oncopyrefused} />
    <Button size="sm" variant="outline" onclick={() => (askingReset = true)}>{copy.reset}</Button>
  </Stack>
</Stack>
<QuestionDialog
  open={askingReset}
  title={copy.reset}
  question={copy.resetQuestion}
  acceptLabel={copy.resetAccept}
  declineLabel={copy.resetDecline}
  onaccept={acceptReset}
  ondecline={() => (askingReset = false)}
/>
