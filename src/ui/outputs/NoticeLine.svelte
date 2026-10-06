<!--
  The notice line at the top of every page (ADR-0002 decision 63, rule 6): one
  notice at a time, with a control to close it. Nothing is drawn while there
  is none. Its look is Phase 5c's.
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
