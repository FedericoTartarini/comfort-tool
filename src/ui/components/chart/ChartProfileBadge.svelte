<script lang="ts">
  import {
    CheckCircleOutline,
    CloseCircleOutline,
    ExclamationCircleOutline,
  } from "flowbite-svelte-icons";
  import { ComplianceStatus } from "../../../catalog/modelIds";
  import {
    FieldChartProfileKind,
    type FieldChartProfileKind as FieldChartProfileKindType,
  } from "../../../catalog/fieldChartProfile";
  import type { ChartProfileBadgeViewModel } from "../../../state/pointSession/types";

  interface Props {
    control: ChartProfileBadgeViewModel;
  }

  let { control }: Props = $props();

  const selectedLabel = $derived(getProfileKindLabel(control.profileKind));
  const feedbackClass = $derived(
    control.feedback?.passes
      ? "text-emerald-700"
      : control.feedback?.text === ComplianceStatus.OutOfRange
        ? "text-amber-700"
        : "text-red-700",
  );
  const feedbackLabel = $derived(control.feedback?.inputLabel ?? "Your input");

  function getProfileKindLabel(kind: FieldChartProfileKindType): string {
    return kind === FieldChartProfileKind.Compliance ? "Compliance" : "Explore";
  }
</script>



<div
  class="flex min-w-0 flex-wrap items-center gap-2"
  data-testid="chart-profile-summary"
>
  <span class="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
    {selectedLabel}
  </span>
  {#if control.feedback}
    <span
      aria-live="polite"
      aria-label={`${feedbackLabel}: ${control.feedback.text}`}
      class={`inline-flex items-center gap-1 text-xs font-semibold ${feedbackClass}`}
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
</div>
