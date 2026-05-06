<svelte:options runes={true} />

<script lang="ts">
  import {
    ClothingZone,
    type ClothingDisplayZoneId,
  } from "../../models/clothingZones";

  let {
    activeZoneId,
    onSelectZone,
  }: {
    activeZoneId: ClothingDisplayZoneId;
    onSelectZone: (zoneId: ClothingDisplayZoneId) => void;
  } = $props();

  const personPath = "M12 1a2 2 0 1 1-2 2 2 2 0 0 1 2-2zm8.79 4.546L14.776 6H9.223l-6.012-.454a.72.72 0 0 0-.168 1.428l6.106.97a.473.473 0 0 1 .395.409L10 12 6.865 22.067a.68.68 0 0 0 .313.808l.071.04a.707.707 0 0 0 .994-.338L12 13.914l3.757 8.663a.707.707 0 0 0 .994.338l.07-.04a.68.68 0 0 0 .314-.808L14 12l.456-3.647a.473.473 0 0 1 .395-.409l6.106-.97a.72.72 0 0 0-.168-1.428z";
  const clipIdBase = "clothing-zone-figure";
  const zoneVisualClasses: Record<
    Exclude<ClothingDisplayZoneId, typeof ClothingZone.Other>,
    { active: string; idle: string; hover: string }
  > = {
    [ClothingZone.UpperBody]: {
      active: "fill-[#d19a1f]",
      idle: "fill-[#f6e2a8]",
      hover: "group-hover:fill-[#e7bf57] group-focus-visible:fill-[#e7bf57]",
    },
    [ClothingZone.LowerBody]: {
      active: "fill-[#4f9dd8]",
      idle: "fill-[#cfe8fb]",
      hover: "group-hover:fill-[#88c4ee] group-focus-visible:fill-[#88c4ee]",
    },
    [ClothingZone.Footwear]: {
      active: "fill-[#8d6030]",
      idle: "fill-[#d8be98]",
      hover: "group-hover:fill-[#b98c5c] group-focus-visible:fill-[#b98c5c]",
    },
  };

  function isActive(zoneId: ClothingDisplayZoneId) {
    return zoneId === activeZoneId;
  }

  function getZoneClasses(
    zoneId: Exclude<ClothingDisplayZoneId, typeof ClothingZone.Other>,
  ) {
    const visual = zoneVisualClasses[zoneId];
    if (isActive(zoneId)) {
      return `${visual.active} transition-colors duration-150`;
    }

    return `${visual.idle} ${visual.hover} transition-colors duration-150`;
  }

  function getOtherButtonClasses() {
    return isActive(ClothingZone.Other)
      ? "bg-stone-900 text-white shadow-sm"
      : "bg-white text-stone-500 hover:bg-stone-100 hover:text-stone-800";
  }

  function handleZoneKeydown(event: KeyboardEvent, zoneId: ClothingDisplayZoneId) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onSelectZone(zoneId);
  }
</script>

<section class="panel-shell">
  <div class="panel-muted relative flex h-full min-h-[32rem] items-center justify-center px-4 py-5 xl:min-h-[36rem]">
    <svg
      viewBox="0 0 24 24"
      class="block h-auto w-full max-w-[320px] xl:max-w-[360px]"
      role="img"
      aria-label="Clothing regions"
    >
      <defs>
        <clipPath id={`${clipIdBase}-upper`} clipPathUnits="userSpaceOnUse">
          <rect x="0" y="5.15" width="24" height="6.95" rx="0.2" />
        </clipPath>
        <clipPath id={`${clipIdBase}-lower`} clipPathUnits="userSpaceOnUse">
          <rect x="0" y="12.05" width="24" height="8.65" rx="0.2" />
        </clipPath>
        <clipPath id={`${clipIdBase}-left-shoe`} clipPathUnits="userSpaceOnUse">
          <polygon points="6.55,20.62 9.15,20.62 9.02,23.4 6.28,23.4" />
        </clipPath>
        <clipPath id={`${clipIdBase}-right-shoe`} clipPathUnits="userSpaceOnUse">
          <polygon points="14.85,20.62 17.45,20.62 17.72,23.4 14.98,23.4" />
        </clipPath>
      </defs>

      <path
        d={personPath}
        class="fill-stone-100 stroke-stone-300"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="0.15"
      />

      <g
        role="button"
        tabindex="0"
        aria-label="Upper body"
        onclick={() => onSelectZone(ClothingZone.UpperBody)}
        onkeydown={(event) => handleZoneKeydown(event, ClothingZone.UpperBody)}
        class="group cursor-pointer outline-none"
      >
        <path
          d={personPath}
          clip-path={`url(#${clipIdBase}-upper)`}
          class={getZoneClasses(ClothingZone.UpperBody)}
        />
      </g>

      <g
        role="button"
        tabindex="0"
        aria-label="Lower body"
        onclick={() => onSelectZone(ClothingZone.LowerBody)}
        onkeydown={(event) => handleZoneKeydown(event, ClothingZone.LowerBody)}
        class="group cursor-pointer outline-none"
      >
        <path
          d={personPath}
          clip-path={`url(#${clipIdBase}-lower)`}
          class={getZoneClasses(ClothingZone.LowerBody)}
        />
      </g>

      <g
        role="button"
        tabindex="0"
        aria-label="Left footwear"
        onclick={() => onSelectZone(ClothingZone.Footwear)}
        onkeydown={(event) => handleZoneKeydown(event, ClothingZone.Footwear)}
        class="group cursor-pointer outline-none"
      >
        <path
          d={personPath}
          clip-path={`url(#${clipIdBase}-left-shoe)`}
          class={getZoneClasses(ClothingZone.Footwear)}
        />
        <path
          d="M6.15 20.2H9.45V23.55H6.15Z"
          class="fill-transparent stroke-transparent"
          stroke-width="0"
        />
      </g>

      <g
        role="button"
        tabindex="0"
        aria-label="Right footwear"
        onclick={() => onSelectZone(ClothingZone.Footwear)}
        onkeydown={(event) => handleZoneKeydown(event, ClothingZone.Footwear)}
        class="group cursor-pointer outline-none"
      >
        <path
          d={personPath}
          clip-path={`url(#${clipIdBase}-right-shoe)`}
          class={getZoneClasses(ClothingZone.Footwear)}
        />
        <path
          d="M14.55 20.2H17.85V23.55H14.55Z"
          class="fill-transparent stroke-transparent"
          stroke-width="0"
        />
      </g>
    </svg>

    <button
      type="button"
      class={`absolute right-5 top-4 flex h-8 w-8 items-center justify-center rounded-full transition-colors ${getOtherButtonClasses()}`}
      aria-label="Other items"
      onclick={() => onSelectZone(ClothingZone.Other)}
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4 fill-none stroke-current" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
        <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    </button>
  </div>
</section>
