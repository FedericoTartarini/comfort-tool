<!--
  The notice line (ADR-0002 decision 63, rule 6), drawn by the page frame in
  the header between the title and the Documentation link (decision 67, rule
  10): one notice at a time, with a control to close it. Nothing is drawn
  while there is none.
-->
<script lang="ts">
  import type { Notice } from "$lib/state/openSession";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import { Button } from "$lib/ui/primitives/button";

  interface Props {
    notice: Notice | null;
    onclose: () => void;
  }

  let { notice, onclose }: Props = $props();

  const noticeText: Record<Notice, string> = {
    linkRefused: copy.linkRefusedNotice,
    linkFilled: copy.linkFilledNotice,
    copyRefused: copy.copyRefusedNotice,
    imageFailed: copy.imageFailedNotice,
  };
</script>

<!-- A live region present from the start, so a notice raised later is announced. -->
<div role="status">
  {#if notice}
    <Inline justify="between">
      <p>{noticeText[notice]}</p>
      <Button size="sm" variant="outline" onclick={onclose}>{copy.closeNotice}</Button>
    </Inline>
  {/if}
</div>
