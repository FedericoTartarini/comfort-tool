<script lang="ts">
  import { Card, Heading } from "flowbite-svelte";
  import { ClockOutline } from "flowbite-svelte-icons";
</script>

<div class="mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
  <Card class="max-w-3xl border-stone-200 shadow-sm">
    <ClockOutline class="h-10 w-10 text-sky-600" />
    <Heading tag="h1" class="mt-4 text-3xl font-semibold tracking-tight text-stone-950">
      Time-series
    </Heading>
    <p class="mt-3 text-base leading-7 text-stone-600">
      Time-series inputs, model support, and chart visualizations have not been
      implemented yet. This workspace will become available in a future release.
    </p>
  </Card>
</div>
