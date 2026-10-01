<!--
  A number typed in a display unit and committed in SI: the one number box
  of the app, shared by a quantity's row and a band's Edge, so both read with
  the one formatter and step by the displayed unit (ADR §4.6).
-->
<script lang="ts">
  import { formatNumber } from "$lib/core/numberFormat";
  import type { DisplayUnit } from "$lib/core/units";
  import { Input } from "$lib/ui/primitives/input";

  interface Props {
    id?: string;
    /** Canonical SI value. */
    value: number;
    unit: DisplayUnit;
    /** Marked as an out-of-range entry is. */
    invalid?: boolean;
    /** The box's accessible name, where no `<label>` names it. */
    ariaLabel?: string;
    oncommit: (si: number) => void;
  }

  let { id, value, unit, invalid = false, ariaLabel, oncommit }: Props = $props();

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
</script>

<Input
  {id}
  type="number"
  step={unit.step}
  value={text}
  aria-label={ariaLabel}
  aria-invalid={invalid || undefined}
  oninput={commit}
  onblur={restore}
/>
