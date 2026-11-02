<!--
  A link to another site (ADR-0002 decision 89, rules 1 and 2): it opens a
  new tab, and its name ends in words that say so to a screen reader alone,
  after its text or its image's text alternative; no icon. No `rel`: every
  browser at the app's floor treats `target="_blank"` as `rel="noopener"`
  (MDN browser-compat-data, `html.elements.a.implicit_noopener`: Chrome 88,
  Firefox 79, Safari 12.1).
-->
<script lang="ts">
  import type { HTMLAnchorAttributes } from "svelte/elements";
  import type { Snippet } from "svelte";
  import { copy } from "$lib/text/copy";

  interface Props extends Omit<HTMLAnchorAttributes, "target"> {
    href: string;
    children: Snippet;
  }

  let { children, ...rest }: Props = $props();
</script>

<!--
  The space before the words is inside their span, out of the flow, so no underline runs past the link's text;
  written into the expression, since Svelte drops whitespace that opens an element.
-->
<a {...rest} target="_blank">{@render children()}<span class="opens-in-new-tab">{` ${copy.opensInNewTab}`}</span></a>
