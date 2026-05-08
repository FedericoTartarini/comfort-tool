<script lang="ts">
  import { Button, Heading, Img, Navbar, NavBrand, NavHamburger, NavLi, NavUl } from "flowbite-svelte";
  import { LinkOutline } from "flowbite-svelte-icons";
  import { onDestroy } from "svelte";

  import { siteBrand, siteHeaderLinks } from "../models/siteShellConfig";
  import { buildShareUrl } from "../state/comfortTool/shareState";
  import type { ComfortToolController } from "../state/comfortTool/types";

  let {
    toolState,
  }: {
    toolState: ComfortToolController;
  } = $props();

  let exportStatus = $state<"idle" | "copied" | "error">("idle");
  let exportStatusTimer: number | null = null;

  function getLinkTarget(external?: boolean) {
    return external ? "_blank" : undefined;
  }

  function getLinkRel(external?: boolean) {
    return external ? "noreferrer" : undefined;
  }

  function getExportLabel() {
    if (exportStatus === "copied") {
      return "Link Copied";
    }

    if (exportStatus === "error") {
      return "Copy Failed";
    }

    return "Export Link";
  }

  function resetExportStatusLater() {
    if (exportStatusTimer !== null) {
      window.clearTimeout(exportStatusTimer);
    }

    exportStatusTimer = window.setTimeout(() => {
      exportStatus = "idle";
      exportStatusTimer = null;
    }, 2200);
  }

  async function copyTextToClipboard(value: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }

  async function handleExportLink() {
    try {
      const shareUrl = buildShareUrl(toolState.actions.exportShareSnapshot(), window.location.href);
      await copyTextToClipboard(shareUrl);
      exportStatus = "copied";
    } catch {
      exportStatus = "error";
    }

    resetExportStatusLater();
  }

  onDestroy(() => {
    if (exportStatusTimer !== null) {
      window.clearTimeout(exportStatusTimer);
    }
  });
</script>

<Navbar fluid={true} class="border-b border-stone-200 bg-white px-0 py-4">
  <div class="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between px-4 sm:px-6 lg:px-8">
    <NavBrand href="#overview" class="flex items-center gap-6 hover:opacity-95 transition-opacity">
      <div class="header-logo-container">
        <Img src={siteBrand.headerLogoSrc} alt={siteBrand.eyebrow} class="header-logo" />
      </div>

      <div class="min-w-0">
        <Heading tag="h6" class="text-eyebrow uppercase tracking-[0.2em]">{siteBrand.eyebrow}</Heading>
        <Heading tag="h1" class="truncate text-lg font-semibold tracking-tight text-stone-950 sm:text-xl">{siteBrand.title}</Heading>
      </div>
    </NavBrand>

    <div class="flex items-center gap-2 lg:order-2">
      <Button
        pill
        color={exportStatus === "copied" ? "green" : exportStatus === "error" ? "red" : "light"}
        onclick={() => void handleExportLink()}
        class="px-4 py-2 font-semibold shadow-sm"
      >
        <LinkOutline class="mr-2 h-4 w-4" strokeWidth="1.7" />
        {getExportLabel()}
      </Button>
      <NavHamburger />
    </div>

    <NavUl class="lg:order-1">
      {#each siteHeaderLinks as link}
        <NavLi
          href={link.href}
          target={getLinkTarget(link.external)}
          rel={getLinkRel(link.external)}
          class="inline-block rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:border-stone-300 hover:text-stone-950 transition-colors shadow-sm"
        >
          {link.label}
        </NavLi>
      {/each}
    </NavUl>
  </div>
</Navbar>


