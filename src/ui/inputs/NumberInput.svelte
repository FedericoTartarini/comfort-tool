<!--
  A number typed in a display unit and committed in SI: the one number box
  of the app, shared by a quantity's row and a band's Edge, so both read with
  the one formatter and step by the displayed unit (ADR §4.6). A control the
  box carries, a row's Presets, stands inside it at its right end (ADR-0002
  decision 67, rule 3). It takes only a number (decision 84, rules 1 and 10):
  a text input, so no spinner, wheel or browser validation, that admits digits,
  one decimal point and a leading minus where its bound allows a negative;
  ↑ and ↓ step it, and so do its own two step buttons in place of the
  browser's spinner (decision 84's note of 2026-10-27). It keeps the
  spinbutton's role the number input had, which tells assistive technology
  the arrows step it, so the buttons are hidden from it, as the browser's are.
-->
<script lang="ts">
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
  import type { Snippet } from "svelte";
  import type { Bound } from "$lib/core/applicability";
  import { formatNumber } from "$lib/core/numberFormat";
  import type { DisplayUnit } from "$lib/core/units";
  import * as InputGroup from "$lib/ui/primitives/input-group";

  interface Props {
    id?: string;
    /** Canonical SI value. */
    value: number;
    unit: DisplayUnit;
    /** The bound in SI an arrow step stops at and the minus is admitted by; none for a band's Edge. */
    bound?: Bound;
    /** Marked as an out-of-range entry is. */
    invalid?: boolean;
    /** The box's accessible name, where no `<label>` names it. */
    ariaLabel?: string;
    /** A control inside the box, at its right end. */
    end?: Snippet;
    oncommit: (si: number) => void;
  }

  let { id, value, unit, bound, invalid = false, ariaLabel, end, oncommit }: Props = $props();

  const text = $derived(formatNumber(unit.fromSi(value)));

  let box = $state<HTMLInputElement | null>(null);

  /** A negative is allowed where the lower end, in the display unit, is below 0 or there is none. */
  const allowsNegative = $derived(bound?.min === undefined || unit.fromSi(bound.min) < 0);
  /** A number as it may stand while typed: digits, one decimal point, and the minus only in front. */
  const typedNumber = $derived(allowsNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/);

  // Refuse an insertion whose text would not be a number being typed, before
  // it lands; a deletion from such a text leaves one.
  function admit(event: InputEvent) {
    if (!event.inputType.startsWith("insert")) {
      return;
    }
    const input = event.currentTarget as HTMLInputElement;
    const from = input.selectionStart ?? input.value.length;
    const to = input.selectionEnd ?? from;
    const inserted = event.data ?? event.dataTransfer?.getData("text/plain") ?? "";
    if (!typedNumber.test(input.value.slice(0, from) + inserted + input.value.slice(to))) {
      event.preventDefault();
    }
  }

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

  // A step moves the committed value by the unit's step, held to the bound in
  // SI so a step to the end lands on the end itself, and commits only when it
  // moves the way it points: none at the end, and none back from a value
  // already past it.
  function stepBy(direction: 1 | -1) {
    const stepped = unit.toSi(unit.fromSi(value) + direction * unit.step);
    const si = Math.min(Math.max(stepped, bound?.min ?? -Infinity), bound?.max ?? Infinity);
    if (Math.sign(si - value) === direction) {
      oncommit(si);
    }
  }

  // ↑ and ↓ step; a modified arrow keeps the caret's own meaning.
  function stepByKey(event: KeyboardEvent) {
    const direction = ({ ArrowUp: 1, ArrowDown: -1 } as const)[event.key];
    if (direction === undefined || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    event.preventDefault();
    stepBy(direction);
  }

  // A step button focuses the box, as the browser's spinner does, and takes no
  // focus itself: its mousedown is prevented, and its click focuses the box.
  function keepFocus(event: MouseEvent) {
    event.preventDefault();
  }

  function stepByButton(direction: 1 | -1) {
    box?.focus();
    stepBy(direction);
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
    type: "text" as const,
    role: "spinbutton" as const,
    inputmode: allowsNegative ? undefined : ("decimal" as const),
    autocomplete: "off" as const,
    value: text,
    "aria-label": ariaLabel,
    "aria-invalid": invalid || undefined,
    onbeforeinput: admit,
    oninput: commit,
    onkeydown: stepByKey,
    onblur: restore,
  });
</script>

<!-- The group draws the border, and the alert colour while the box inside it is invalid. -->
<InputGroup.Root>
  <InputGroup.Input bind:ref={box} {...boxAttributes} />
  <InputGroup.Addon align="inline-end">
    <div class="step-buttons" aria-hidden="true">
      <InputGroup.Button size="icon-xs" tabindex={-1} onmousedown={keepFocus} onclick={() => stepByButton(1)}>
        <ChevronUpIcon />
      </InputGroup.Button>
      <InputGroup.Button size="icon-xs" tabindex={-1} onmousedown={keepFocus} onclick={() => stepByButton(-1)}>
        <ChevronDownIcon />
      </InputGroup.Button>
    </div>
    {@render end?.()}
  </InputGroup.Addon>
</InputGroup.Root>
