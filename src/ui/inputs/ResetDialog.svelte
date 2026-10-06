<!--
  Reset's question (ADR-0002 decision 63, rule 8), asked as a model switch
  asks: modal, and only its yes changes anything. It decides nothing; both
  answers go straight back to the caller.

  Its look is provisional — the designed version is Phase 5c's — so it composes
  the generated dialog primitive and adds no styling of its own.
-->
<script lang="ts">
  import { copy } from "$lib/text/copy";
  import { Button } from "$lib/ui/primitives/button";
  import * as Dialog from "$lib/ui/primitives/dialog";

  interface Props {
    /** Whether the question stands. */
    open: boolean;
    onaccept: () => void;
    /** "No, keep everything", and every other way the dialog closes. */
    ondecline: () => void;
  }

  let { open, onaccept, ondecline }: Props = $props();

  // The close button, the Escape key and a click outside all arrive here, and
  // all of them are a no: there is no third outcome.
  function onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      ondecline();
    }
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{copy.reset}</Dialog.Title>
    </Dialog.Header>
    <!-- The question is the dialog's description, so it is announced with the title. -->
    <Dialog.Description>{copy.resetQuestion}</Dialog.Description>
    <Dialog.Footer>
      <Button variant="outline" onclick={ondecline}>{copy.resetDecline}</Button>
      <Button onclick={onaccept}>{copy.resetAccept}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
