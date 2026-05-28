<script lang="ts">
  import {
    Modal,
    Button,
    Table,
    TableBody,
    TableBodyCell,
    TableBodyRow,
    TableHead,
    TableHeadCell,
  } from "flowbite-svelte";
  import { ExclamationCircleOutline } from "flowbite-svelte-icons";
  import type { ComfortToolController } from "../../state/comfortTool/types";
  import { getComfortModelConfig } from "../../state/comfortTool/modelConfigs";

  interface Props {
    toolState: ComfortToolController;
  }

  let {
    toolState,
  }: Props = $props();

  const pending = $derived(toolState.selectors.getPendingModelSwitch());
  const isOpen = $derived(!!pending);

  function handleConfirm() {
    toolState.actions.confirmModelSwitch();
  }

  function handleCancel() {
    toolState.actions.cancelModelSwitch();
  }

  function getModelLabel(modelId: any) {
    if (!modelId) return "";
    return getComfortModelConfig(modelId).label;
  }
</script>

<Modal
  title="Boundary Range Warning"
  open={isOpen}
  size="lg"
  autoclose={false}
  outsideclose={false}
  on:close={handleCancel}
>
  <div class="text-center">
    <ExclamationCircleOutline class="mx-auto mb-4 h-12 w-12 text-orange-500" />
    <h3 class="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">
      Switching to <strong
        >{pending ? getModelLabel(pending.targetModel) : ""}</strong
      > will cause some values to fall outside their allowed range.
    </h3>

    {#if pending && pending.violations.length > 0}
      <div class="mb-6 overflow-hidden rounded-lg border border-gray-200">
        <Table hoverable={true}>
          <TableHead>
            <TableHeadCell>Input</TableHeadCell>
            <TableHeadCell>Current</TableHeadCell>
            <TableHeadCell>Allowed Range</TableHeadCell>
          </TableHead>
          <TableBody>
            {#each pending.violations as violation}
              <TableBodyRow>
                <TableBodyCell class="font-medium text-gray-900"
                  >{violation.label}</TableBodyCell
                >
                <TableBodyCell class="text-orange-600 font-semibold"
                  >{violation.currentValue}{violation.displayUnits}</TableBodyCell
                >
                <TableBodyCell
                  >{violation.minAllowed} ~ {violation.maxAllowed}{violation.displayUnits}</TableBodyCell
                >
              </TableBodyRow>
            {/each}
          </TableBody>
        </Table>
      </div>
    {/if}

    <p class="mb-5 text-sm text-gray-500">
      Would you like to switch and automatically adjust them to the closest
      allowed values?
    </p>

    <div class="flex justify-center gap-4">
      <Button color="yellow" onclick={handleConfirm}
        >Yes, switch and adjust</Button
      >
      <Button color="alternative" onclick={handleCancel}>No, stay here</Button>
    </div>
  </div>
</Modal>
