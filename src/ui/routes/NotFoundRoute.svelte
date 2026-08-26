<script lang="ts">
  import { Card, Heading } from "flowbite-svelte";
  import { ExclamationCircleOutline } from "flowbite-svelte-icons";
  import { defaultAppRoute } from "../../state/workspace/routeDefinitions";
</script>

<div class="mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
  <Card class="max-w-3xl border-stone-200 shadow-sm">
    <ExclamationCircleOutline class="h-10 w-10 text-orange-500" />
    <p class="mt-4 text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">
      404
    </p>
    <Heading tag="h1" class="mt-2 text-3xl font-semibold tracking-tight text-stone-950">
      Page not found
    </Heading>
    <p class="mt-3 text-base leading-7 text-stone-600">
      The requested workspace does not exist.
    </p>
    <a
      href={defaultAppRoute.path}
      class="mt-5 inline-flex w-fit items-center rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300"
    >
      Return to ASHRAE 55
    </a>
  </Card>
</div>
