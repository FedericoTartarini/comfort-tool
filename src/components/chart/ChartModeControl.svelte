<script lang="ts">
  import { Button, ButtonGroup } from "flowbite-svelte";
  import {
    CheckCircleOutline,
    CloseCircleOutline,
    ExclamationCircleOutline,
  } from "flowbite-svelte-icons";
  import { ComplianceStatus } from "../../models/comfortModels";
  import { ChartMode, type ChartMode as ChartModeType } from "../../models/modelCapabilities";
  import type { ChartModeControlViewModel } from "../../state/comfortTool/types";

  interface Props {
    control: ChartModeControlViewModel;
  }

  let { control }: Props = $props();

  const hasModeChoice = $derived(control.modes.length === 2);
  const selectedLabel = $derived(getModeLabel(control.selectedMode));
  const feedbackClass = $derived(
    control.feedback?.passes
      ? "text-emerald-700"
      : control.feedback?.text === ComplianceStatus.OutOfRange
        ? "text-amber-700"
        : "text-red-700",
  );
  const feedbackText = $derived(
    control.feedback
      ? `${control.feedback.inputLabel ? `${control.feedback.inputLabel}: ` : ""}${control.feedback.text}`
      : "",
  );

  function getModeLabel(mode: ChartModeType): string {
    return mode === ChartMode.Compliance ? "Compliance" : "Explore";
  }
</script>

<div class="min-w-0 space-y-1.5">
  <div class="flex flex-wrap items-center gap-2">
    {#if hasModeChoice}
      <ButtonGroup role="group" aria-label="Chart mode" size="xs">
        {#each control.modes as mode}
          <Button
            size="xs"
            color={control.selectedMode === mode ? "dark" : "light"}
            aria-pressed={control.selectedMode === mode}
            onclick={() => control.onSelect(mode)}
          >
            {getModeLabel(mode)}
          </Button>
        {/each}
      </ButtonGroup>
    {:else}
      <span class="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
        {selectedLabel}
      </span>
    {/if}
    <p class="text-xs leading-5 text-stone-600">{control.caption}</p>
  </div>

  {#if control.feedback}
    <p
      aria-live="polite"
      class={`flex items-center gap-1.5 text-xs font-semibold ${feedbackClass}`}
    >
      {#if control.feedback.passes}
        <CheckCircleOutline class="h-4 w-4 shrink-0" aria-hidden="true" />
      {:else if control.feedback.text === ComplianceStatus.OutOfRange}
        <ExclamationCircleOutline class="h-4 w-4 shrink-0" aria-hidden="true" />
      {:else}
        <CloseCircleOutline class="h-4 w-4 shrink-0" aria-hidden="true" />
      {/if}
      <span>{feedbackText}</span>
    </p>
  {/if}
</div>
