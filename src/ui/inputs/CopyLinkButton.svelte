<!--
  Copy link (ADR-0002 decision 63, rule 7): writes the share link to the
  clipboard inside the click, and says so on itself for a moment; a clipboard
  that refuses is the caller's to report. The page and the address bar are
  left as they were. Its place and look are Phase 5c's.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { copy } from "$lib/text/copy";
  import { Button } from "$lib/ui/primitives/button";

  interface Props {
    /** The link to the page as it is now, asked at each click. */
    link: () => string;
    /** The clipboard refused the link, or the browser offers none. */
    onrefused: () => void;
  }

  let { link, onrefused }: Props = $props();

  /** How long the button says the link was copied. */
  const COPIED_FOR_MS = 2000;

  /** Whether the button says the link was copied: its own, as nothing else reads it. */
  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  async function copyLink() {
    const text = link();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Refused by the browser or the person, or no clipboard outside a secure context.
      onrefused();
      return;
    }
    copied = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied = false), COPIED_FOR_MS);
  }

  onDestroy(() => clearTimeout(copiedTimer));
</script>

<Button size="sm" variant="outline" onclick={copyLink}>{copied ? copy.linkCopied : copy.copyLink}</Button>
