<!--
  A question about the whole tab, asked as a model switch asks: modal, and
  only its yes changes anything (ADR-0002 decision 63, rule 8). Reset asks
  one, and so does a share link reaching a tab that kept a session. It decides
  nothing; both answers go straight back to the caller.

  Its look is the generated dialog primitive's, at the one width every dialog
  has (ADR-0002 decision 67, rule 9); it adds no styling of its own.
-->
<script lang="ts">
  import { Button } from "$lib/ui/primitives/button";
  import * as Dialog from "$lib/ui/primitives/dialog";

  interface Props {
    /** Whether the question stands. */
    open: boolean;
    title: string;
    question: string;
    acceptLabel: string;
    declineLabel: string;
    onaccept: () => void;
    /** The decline button, and every other way the dialog closes. */
    ondecline: () => void;
  }

  let { open, title, question, acceptLabel, declineLabel, onaccept, ondecline }: Props = $props();

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
      <Dialog.Title>{title}</Dialog.Title>
    </Dialog.Header>
    <!-- The question is the dialog's description, so it is announced with the title. -->
    <Dialog.Description>{question}</Dialog.Description>
    <Dialog.Footer>
      <Button variant="outline" onclick={ondecline}>{declineLabel}</Button>
      <Button onclick={onaccept}>{acceptLabel}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
