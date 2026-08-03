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
  const feedbackLabel = $derived(control.feedback?.inputLabel ?? "Your input");

  function getModeLabel(mode: ChartModeType): string {
    return mode === ChartMode.Compliance ? "Compliance" : "Explore";
  }
</script>

<div class="min-w-0">
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
    <p class="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs leading-5 text-stone-600">
      <span>{control.caption}</span>
      {#if control.feedback}
        <span
          aria-live="polite"
          aria-label={`${feedbackLabel}: ${control.feedback.text}`}
          class={`inline-flex items-center gap-1 font-semibold ${feedbackClass}`}
        >
          <span>{feedbackLabel}:</span>
          {#if control.feedback.passes}
            <CheckCircleOutline class="h-4 w-4 shrink-0" aria-hidden="true" />
          {:else if control.feedback.text === ComplianceStatus.OutOfRange}
            <ExclamationCircleOutline class="h-4 w-4 shrink-0" aria-hidden="true" />
          {:else}
            <CloseCircleOutline class="h-4 w-4 shrink-0" aria-hidden="true" />
          {/if}
          <span>{control.feedback.text}</span>
        </span>
      {/if}
    </p>
  </div>
</div>
