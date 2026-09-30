<!--
  The question a switch asks before it changes anything (ADR-0002 decisions 32
  and 52). It renders the session's pending switch and decides nothing: which
  values are listed is the pre-call gate's answer for each compared slot,
  carried on the pending switch, and both buttons hand the answer straight back
  to the session. While more than one slot is compared, the rows are grouped by
  slot with the slot's name in a column of its own; otherwise the dialog has no
  such column.

  Its look is provisional — the designed version is Phase 5c's — so it composes
  the generated dialog and table primitives and adds no styling of its own.
-->
<script lang="ts">
  import { formatBound } from "$lib/core/applicability";
  import { slotBadges } from "$lib/core/slotBadge";
  import { displayUnitFor, numberWithUnit } from "$lib/core/units";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import type { PendingSwitch } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import { Button } from "$lib/ui/primitives/button";
  import * as Dialog from "$lib/ui/primitives/dialog";
  import * as Table from "$lib/ui/primitives/table";

  interface Props {
    /** The session's pending switch. The dialog is open exactly while there is one. */
    pending: PendingSwitch | null;
    /** Whether each row names its slot: while more than one slot is compared. */
    namesSlots: boolean;
    unitSystem: UnitSystem;
    onaccept: () => void;
    /** "No, stay here", and every other way the dialog closes. */
    ondecline: () => void;
  }

  let { pending, namesSlots, unitSystem, onaccept, ondecline }: Props = $props();

  // Each value as the input panel shows it: converted to the display unit and
  // formatted by the same formatters, so the dialog and the boxes behind it
  // never read differently. The symbol rides on the current value alone — the
  // allowed range is character for character the one printed under the box.
  const groups = $derived(
    (pending?.slots ?? [])
      .filter(({ listedRows }) => listedRows.length > 0)
      .map(({ position, listedRows }) => ({
        position,
        name: slotBadges[position].name,
        rows: listedRows.map((row) => {
          const unit = displayUnitFor(row.quantity, unitSystem);
          return {
            quantity: row.quantity,
            current: numberWithUnit(row.value, unit),
            allowed: formatBound(row.bound, row.quantity, unitSystem),
          };
        }),
      })),
  );

  // The close button, the Escape key and a click outside all arrive here, and
  // all of them mean "No, stay here": there is no third outcome.
  function onOpenChange(open: boolean) {
    if (!open) {
      ondecline();
    }
  }
</script>

<Dialog.Root open={pending !== null} {onOpenChange}>
  {#if pending}
    <Dialog.Content>
      <Dialog.Header>
        <Dialog.Title>{copy.boundaryWarningTitle}</Dialog.Title>
      </Dialog.Header>
      <p>{copy.boundaryWarningIntro(pending.model.info.label)}</p>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            {#if namesSlots}
              <Table.Head></Table.Head>
            {/if}
            <Table.Head>{copy.boundaryWarningInputColumn}</Table.Head>
            <Table.Head>{copy.boundaryWarningCurrentColumn}</Table.Head>
            <Table.Head>{copy.boundaryWarningAllowedColumn}</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each groups as group (group.position)}
            {#each group.rows as row, index (row.quantity)}
              <Table.Row>
                {#if namesSlots && index === 0}
                  <Table.Cell rowspan={group.rows.length}>{group.name}</Table.Cell>
                {/if}
                <Table.Cell>{row.quantity.label}</Table.Cell>
                <Table.Cell>{row.current}</Table.Cell>
                <Table.Cell>{row.allowed}</Table.Cell>
              </Table.Row>
            {/each}
          {/each}
        </Table.Body>
      </Table.Root>
      <!-- The question is the dialog's description, so it is announced with the title. -->
      <Dialog.Description>{copy.boundaryWarningQuestion}</Dialog.Description>
      <Dialog.Footer>
        <Button variant="outline" onclick={ondecline}>{copy.boundaryWarningDecline}</Button>
        <Button onclick={onaccept}>{copy.boundaryWarningAccept}</Button>
      </Dialog.Footer>
    </Dialog.Content>
  {/if}
</Dialog.Root>
