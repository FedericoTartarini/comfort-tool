<!--
  The app's one toaster (ADR-0002 decision 84, rule 7): `svelte-sonner`'s,
  mounted once at the root, at the window's top right at Sonner's own offset,
  over the header's right end while the page is at its top (the user's ruling
  of 2026-10-28, `.scratch/input-gate/issues/11-…md` Comments, superseding
  ticket 01's "under the header"), every toast kept until its
  close button closes it. Not shadcn-svelte's generated Sonner (`npx
  shadcn-svelte add sonner`, CLI 1.6.0, Nova), which takes its theme from
  `mode-watcher`, which wrote two entries to `localStorage` in Chromium, where
  the tool writes none. Both the user's choices,
  `.scratch/input-gate/issues/01-…md` Comments. Kept from the generated part:
  the toast's ground, text and edge in the popover's and the border's tokens.
  Its radius is the one radius, where Sonner's is 8 px (decision 87, rule 10).
  The theme is the light, the app's one (ADR-0001 §1).
-->
<script lang="ts">
  import { Toaster } from "svelte-sonner";
  import { copy } from "$lib/text/copy";
</script>

<Toaster
  position="top-right"
  theme="light"
  duration={Number.POSITIVE_INFINITY}
  closeButton
  closeButtonAriaLabel={copy.closeToast}
  style="--normal-bg: var(--color-popover); --normal-text: var(--color-popover-foreground); --normal-border: var(--color-border); --border-radius: var(--radius);"
/>
