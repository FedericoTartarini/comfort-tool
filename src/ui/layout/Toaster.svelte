<!--
  The app's one toaster (ADR-0002 decision 84, rule 7): `svelte-sonner`'s,
  mounted once at the root, at the top right, every toast kept until its
  close button closes it. With the page at its top, its top is the cards'
  top, under the header, so a toast covers no header link. Not shadcn-svelte's generated Sonner (`npx
  shadcn-svelte add sonner`, CLI 1.6.0, Nova), which takes its theme from
  `mode-watcher`, which wrote two entries to `localStorage` in Chromium, where
  the tool writes none. Both the user's choices,
  `.scratch/input-gate/issues/01-…md` Comments. Kept from the generated part:
  the toast's ground, text and edge in the popover's and the border's tokens.
  The theme is the light, the app's one (ADR-0001 §1).
-->
<script lang="ts">
  import { Toaster } from "svelte-sonner";
  import { copy } from "$lib/text/copy";

  const TOP_OFFSET = "calc(var(--header-height) + var(--space-page))";
</script>

<!-- Sonner writes an offset into a custom property as it is given, so it can be the page's own tokens. -->
<Toaster
  position="top-right"
  offset={{ top: TOP_OFFSET }}
  mobileOffset={{ top: TOP_OFFSET }}
  theme="light"
  duration={Number.POSITIVE_INFINITY}
  closeButton
  closeButtonAriaLabel={copy.closeToast}
  style="--normal-bg: var(--color-popover); --normal-text: var(--color-popover-foreground); --normal-border: var(--color-border);"
/>
