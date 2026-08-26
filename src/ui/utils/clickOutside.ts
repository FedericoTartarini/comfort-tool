export function clickOutside(node: HTMLElement, callback: () => void) {
  function handlePointerDown(event: MouseEvent) {
    if (event.target instanceof Node && !node.contains(event.target)) {
      callback();
    }
  }

  document.addEventListener("mousedown", handlePointerDown);

  return {
    destroy() {
      document.removeEventListener("mousedown", handlePointerDown);
    },
  };
}
