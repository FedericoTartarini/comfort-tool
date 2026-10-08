<!--
  A number typed in a display unit and committed in SI: the one number box
  of the app, shared by a quantity's row and a band's Edge, so both read with
  the one formatter and step by the displayed unit (ADR §4.6). A control the
  box carries, a row's Presets, stands inside it at its right end (ADR-0002
  decision 67, rule 3).
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { formatNumber } from "$lib/core/numberFormat";
  import type { DisplayUnit } from "$lib/core/units";
  import { Input } from "$lib/ui/primitives/input";
  import * as InputGroup from "$lib/ui/primitives/input-group";

  interface Props {
    id?: string;
    /** Canonical SI value. */
    value: number;
    unit: DisplayUnit;
    /** Marked as an out-of-range entry is. */
    invalid?: boolean;
    /** The box's accessible name, where no `<label>` names it. */
    ariaLabel?: string;
    /** A control inside the box, at its right end. */
    end?: Snippet;
    oncommit: (si: number) => void;
  }

  let { id, value, unit, invalid = false, ariaLabel, end, oncommit }: Props = $props();

  const text = $derived(formatNumber(unit.fromSi(value)));

  // Commit only when the parsed value differs from what is stored. While the
  // user types "25." the parse is still 25, nothing is committed, and the
  // displayed text is not rewritten under their cursor.
  function commit(event: Event) {
    const parsed = Number.parseFloat((event.currentTarget as HTMLInputElement).value);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const si = unit.toSi(parsed);
    if (si !== value) {
      oncommit(si);
    }
  }

  function restore(event: FocusEvent) {
    const input = event.currentTarget as HTMLInputElement;
    // A focused input taken out with its component — its page, when the
    // address moves to another — blurs just before it is removed, once the
    // component has stopped. Restore after the removal, and only an input
    // still on the page.
    queueMicrotask(() => {
      if (input.isConnected) {
        input.value = text;
      }
    });
  }

  /** The box's attributes, the same whether it stands alone or inside a group. */
  const boxAttributes = $derived({
    id,
    type: "number" as const,
    step: unit.step,
    value: text,
    "aria-label": ariaLabel,
    "aria-invalid": invalid || undefined,
    oninput: commit,
    onblur: restore,
  });
</script>

{#if end}
  <!-- The group draws the border, and the alert colour while the box inside it is invalid. -->
  <InputGroup.Root>
    <InputGroup.Input {...boxAttributes} />
    <InputGroup.Addon align="inline-end">
      {@render end()}
    </InputGroup.Addon>
  </InputGroup.Root>
{:else}
  <Input {...boxAttributes} />
{/if}
