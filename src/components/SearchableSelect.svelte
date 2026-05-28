<svelte:options runes={true} />

<script lang="ts">
  import { Button, Heading } from "flowbite-svelte";
  import { ChevronDownOutline, ChevronUpOutline } from "flowbite-svelte-icons";
  import { clickOutside } from "../utils/clickOutside";

  type SelectOption<TValue> = {
    name: string | number;
    value: TValue;
    description?: string;
    disabled?: boolean;
  };

  interface Props {
    items?: SelectOption<string>[];
    value?: string;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyMessage?: string;
    disabled?: boolean;
    onSelect?: ((value: string) => void) | undefined;
    class?: string;
  }

  let {
    items = [],
    value = "",
    placeholder = "Select option",
    searchPlaceholder = "Search...",
    emptyMessage = "No matching options.",
    disabled = false,
    onSelect = undefined,
    class: className = "",
  }: Props = $props();

  let rootElement = $state<HTMLElement | null>(null);
  let searchInput = $state<HTMLInputElement | null>(null);
  let isOpen = $state(false);
  let query = $state("");
  let highlightedIndex = $state(-1);
  const listboxId = `searchable-select-listbox-${Math.random().toString(36).slice(2, 10)}`;

  const selectedItem = $derived(items.find((item) => item.value === value) ?? null);
  const filteredItems = $derived(
    items.filter((item) => `${item.name}`.toLowerCase().includes(query.trim().toLowerCase())),
  );
  const inputValue = $derived(
    isOpen ? query : (selectedItem ? `${selectedItem.name}` : ""),
  );

  function openDropdown() {
    if (disabled) {
      return;
    }
    isOpen = true;
    query = "";
    highlightedIndex = filteredItems.findIndex((item) => item.value === value && !item.disabled);
    queueMicrotask(() => {
      searchInput?.focus();
    });
  }

  function toggleDropdown() {
    if (isOpen) {
      closeDropdown();
      return;
    }
    openDropdown();
  }

  function closeDropdown() {
    isOpen = false;
    query = "";
    highlightedIndex = -1;
  }

  function handleSelect(nextValue: string) {
    onSelect?.(nextValue);
    closeDropdown();
  }

  function handleInput(event: Event) {
    query = (event.currentTarget as HTMLInputElement).value;
    if (!isOpen) {
      isOpen = true;
    }
    highlightedIndex = filteredItems.findIndex((item) => !item.disabled);
  }

  function highlightNextOption(direction: 1 | -1) {
    if (filteredItems.length === 0) {
      highlightedIndex = -1;
      return;
    }

    let nextIndex = highlightedIndex;
    for (let attempts = 0; attempts < filteredItems.length; attempts += 1) {
      nextIndex = (nextIndex + direction + filteredItems.length) % filteredItems.length;
      if (!filteredItems[nextIndex]?.disabled) {
        highlightedIndex = nextIndex;
        return;
      }
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen && (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter")) {
      event.preventDefault();
      openDropdown();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      highlightNextOption(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      highlightNextOption(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const highlightedItem = filteredItems[highlightedIndex];
      if (highlightedItem && !highlightedItem.disabled) {
        handleSelect(highlightedItem.value);
        return;
      }

      const exactMatch = filteredItems.find((item) => `${item.name}`.toLowerCase() === query.trim().toLowerCase() && !item.disabled);
      if (exactMatch) {
        handleSelect(exactMatch.value);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeDropdown();
    }
  }

</script>

<div class={`relative w-full min-w-0 ${className}`} bind:this={rootElement} use:clickOutside={closeDropdown}>
  <input
    bind:this={searchInput}
    type="text"
    value={inputValue}
    placeholder={placeholder}
    class={`w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 pr-10 text-sm text-stone-900 focus:border-sky-600 focus:outline-none ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    onfocus={openDropdown}
    oninput={handleInput}
    onkeydown={handleKeydown}
    role="combobox"
    aria-expanded={isOpen}
    aria-haspopup="listbox"
    aria-controls={listboxId}
    aria-autocomplete="list"
    disabled={disabled}
    autocomplete="off"
    spellcheck="false"
  />
  <Button
    color="none"
    class="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-stone-500 focus:ring-0"
    onclick={toggleDropdown}
    tabindex={-1}
    aria-label={isOpen ? "Close options" : "Open options"}
    disabled={disabled}
  >
    {#if isOpen}
      <ChevronUpOutline class="h-4 w-4" strokeWidth="2" />
    {:else}
      <ChevronDownOutline class="h-4 w-4" strokeWidth="2" />
    {/if}
  </Button>

  {#if isOpen}
    <div id={listboxId} role="listbox" class="absolute z-20 mt-1 w-full rounded-lg border border-stone-300 bg-white p-2 shadow-lg">
      <Heading tag="h6" class="text-eyebrow px-1 pb-2">
        {searchPlaceholder}
      </Heading>
      <ul class="max-h-64 overflow-y-auto">
        {#if filteredItems.length > 0}
          {#each filteredItems as item, index}
            <li>
              <Button
                color="none"
                class={`flex w-full flex-col items-start rounded-md px-2 py-2 text-left text-sm ${
                  item.value === value
                    ? "bg-sky-50 text-sky-900"
                    : index === highlightedIndex
                      ? "bg-stone-100 text-stone-900"
                      : "text-stone-700 hover:bg-stone-100"
                } ${item.disabled ? "cursor-not-allowed opacity-50" : ""} focus:ring-0`}
                onclick={() => !item.disabled && handleSelect(item.value)}
                onmouseenter={() => {
                  if (!item.disabled) {
                    highlightedIndex = index;
                  }
                }}
                disabled={item.disabled}
              >
                <span class="font-semibold">{item.name}</span>
                {#if item.description}
                  <span class="text-xs opacity-70">{item.description}</span>
                {/if}
              </Button>
            </li>
          {/each}
        {:else}
          <li class="px-2 py-2 text-sm text-stone-500">{emptyMessage}</li>
        {/if}
      </ul>
    </div>
  {/if}
</div>
