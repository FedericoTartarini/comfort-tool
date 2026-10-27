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
  What is typed is a draft (decision 84, rules 1 and 2, and its note of
  2026-10-28): on a pause in the typing one its owner calls legal commits,
  and one it does not is marked invalid and waits, never marked while it is
  typed; Enter and leaving the box commit either, the owner cutting or
  refusing it, after which the box shows what was committed.
-->
<script lang="ts">
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
  import { tick, type Snippet } from "svelte";
  import type { Bound } from "$lib/core/applicability";
  import { formatNumber } from "$lib/core/numberFormat";
  import type { DisplayUnit } from "$lib/core/units";
  import * as InputGroup from "$lib/ui/primitives/input-group";

  interface Props {
    id?: string;
    /** Canonical SI value. */
    value: number;
    unit: DisplayUnit;
    /** The bound in SI a step stops at and the minus and the keypad are judged by; none for a band's Edge. */
    bound?: Bound;
    /** Marked as an out-of-range entry is. */
    invalid?: boolean;
    /** Whether a draft of this SI value may commit on a pause; every draft may, without it. */
    isLegal?: (si: number) => boolean;
    /** The box's accessible name, where no `<label>` names it. */
    ariaLabel?: string;
    /** A control inside the box, at its right end. */
    end?: Snippet;
    oncommit: (si: number) => void;
  }

  let { id, value, unit, bound, invalid = false, isLegal, ariaLabel, end, oncommit }: Props = $props();

  /** How long typing pauses before a legal draft commits or an illegal one is marked, [ms]. */
  const COMMIT_PAUSE_MS = 400;

  const text = $derived(formatNumber(unit.fromSi(value)));

  let box = $state<HTMLInputElement | null>(null);

  /** The draft's commit or mark waiting on the pause, while one does. */
  let pause: ReturnType<typeof setTimeout> | undefined;
  /** Whether the draft in the box is one its owner does not call legal. */
  let draftIllegal = $state(false);

  // A pause cut short by the box's removal commits nothing.
  $effect(() => () => clearTimeout(pause));

  /**
   * A negative is allowed where the lower end, in the display unit, is below 0
   * or there is none; elsewhere a phone shows the decimal keypad, which has no
   * minus.
   */
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

  /**
   * The draft in `input` in SI, or `undefined` where there is nothing to
   * commit: a text that is not yet a number, or the value already stored.
   * While the user types "25." the parse is still 25, nothing is committed,
   * and the displayed text is not rewritten under their cursor.
   */
  function draftOf(input: HTMLInputElement): number | undefined {
    const parsed = Number.parseFloat(input.value);
    const si = Number.isFinite(parsed) ? unit.toSi(parsed) : undefined;
    return si === value ? undefined : si;
  }

  /** The draft dropped: nothing waits on the pause, and the box is not marked for it. */
  function dropDraft() {
    clearTimeout(pause);
    draftIllegal = false;
  }

  // Once the typing pauses, a legal draft commits and an illegal one is marked
  // and waits; while it is typed, no draft is marked.
  function judgeDraft(event: Event) {
    dropDraft();
    const si = draftOf(event.currentTarget as HTMLInputElement);
    if (si === undefined) {
      return;
    }
    pause = setTimeout(() => {
      if (isLegal && !isLegal(si)) {
        draftIllegal = true;
      } else {
        oncommit(si);
      }
    }, COMMIT_PAUSE_MS);
  }

  // Enter and leaving the box commit whatever the draft is, and the box then
  // shows what the owner committed, the draft cut or refused.
  function commitDraft(input: HTMLInputElement) {
    dropDraft();
    const si = draftOf(input);
    if (si !== undefined) {
      oncommit(si);
    }
    void showCommitted(input);
  }

  /**
   * `input` showing the committed value, once the owner's commit has reached
   * it. A focused input taken out with its component — its page, when the
   * address moves to another — blurs just before it is removed, once the
   * component has stopped: only an input still on the page is written.
   */
  async function showCommitted(input: HTMLInputElement) {
    await tick();
    if (input.isConnected) {
      input.value = text;
    }
  }

  // A step moves the committed value by the unit's step, held to the bound in
  // SI so a step to the end lands on the end itself, and commits only when it
  // moves the way it points: none at the end, and none back from a value
  // already past it.
  function stepBy(direction: 1 | -1) {
    dropDraft();
    const stepped = unit.toSi(unit.fromSi(value) + direction * unit.step);
    const si = Math.min(Math.max(stepped, bound?.min ?? -Infinity), bound?.max ?? Infinity);
    if (Math.sign(si - value) === direction) {
      oncommit(si);
    }
    if (box) {
      void showCommitted(box);
    }
  }

  // Enter commits the draft; ↑ and ↓ step, a modified arrow keeping the caret's own meaning.
  function commitOrStepByKey(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.isComposing) {
      commitDraft(event.currentTarget as HTMLInputElement);
      return;
    }
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


  /**
   * The box's attributes, the same whether it stands alone or inside a group.
   * The input binds its value, so a new object writes `text` over the draft:
   * what changes while a draft is typed, its marking, is kept out of it.
   */
  const boxAttributes = $derived({
    id,
    type: "text" as const,
    role: "spinbutton" as const,
    inputmode: allowsNegative ? undefined : ("decimal" as const),
    autocomplete: "off" as const,
    value: text,
    "aria-label": ariaLabel,
    onbeforeinput: admit,
    oninput: judgeDraft,
    onkeydown: commitOrStepByKey,
    onblur: (event: FocusEvent) => commitDraft(event.currentTarget as HTMLInputElement),
  });
</script>

<!-- The group draws the border, and the alert colour while the box inside it is invalid. -->
<InputGroup.Root>
  <InputGroup.Input bind:ref={box} {...boxAttributes} aria-invalid={invalid || draftIllegal || undefined} />
  <InputGroup.Addon align="inline-end" class="box-end">
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
