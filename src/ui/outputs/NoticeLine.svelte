<!--
  The notice line (ADR-0002 decision 63, rule 6), drawn by the header between
  the title and the Documentation link, where it moves nothing (decision 73,
  rule 5; decision 67, rule 10): one notice at a time, the generated alert
  with its Close as the alert's action. Nothing is drawn while there is none.
-->
<script lang="ts">
  import type { Notice } from "$lib/state/openSession";
  import { copy } from "$lib/text/copy";
  import * as Alert from "$lib/ui/primitives/alert";
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
    <!--
      The alert's own `role="alert"` would announce the notice a second time
      inside this region. Its Close is `xs`, the size the alert's action is
      placed for (`top-2` in a 38 px alert): a generated part's own inside.
    -->
    <Alert.Root role="none">
      <Alert.Title>{noticeText[notice]}</Alert.Title>
      <Alert.Action>
        <Button size="xs" variant="outline" onclick={onclose}>{copy.closeNotice}</Button>
      </Alert.Action>
    </Alert.Root>
  {/if}
</div>
