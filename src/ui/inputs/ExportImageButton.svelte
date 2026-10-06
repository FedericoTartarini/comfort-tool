<!--
  Export image (ADR-0002 decision 64, rules 6 to 8): downloads the chart the
  page shows as an Image, built at the click; disabled while the page shows
  none. An image that cannot be made is the caller's to report. Until the
  dialog asks for them, the image is a double column, a PNG, with no title.
  Its place and look are Phase 5c's.
-->
<script lang="ts">
  import type { ChartSpec } from "$lib/core/charts/chartSpec";
  import { imageDescription, imageFileName, imageFormat, imageSize } from "$lib/core/image";
  import { copy } from "$lib/text/copy";
  import { downloadImage } from "$lib/ui/charts/plotlyImage";
  import { Button } from "$lib/ui/primitives/button";

  interface Props {
    /** The chart the page shows, or `null` while it shows none. */
    chart: ChartSpec | null;
    /** The image could not be made. */
    onfailed: () => void;
  }

  let { chart, onfailed }: Props = $props();

  async function exportImage(shown: ChartSpec) {
    const size = imageSize.doubleColumn;
    const format = imageFormat.png;
    try {
      await downloadImage(imageDescription({ chart: shown, size }), format, imageFileName("", size, format));
    } catch {
      onfailed();
    }
  }
</script>

<Button size="sm" variant="outline" disabled={chart === null} onclick={() => chart && exportImage(chart)}>
  {copy.exportImage}
</Button>
