/**
 * The text the tab keeps (ADR-0002 decision 63, rule 2): one entry of the
 * tab's session storage, which lasts across a reload and is forgotten when
 * the tab closes. A browser may refuse the storage, on reading the property
 * itself or on any call to it; there the tab keeps nothing, so a read is
 * "nothing kept" and a write or a clear does nothing, and the app runs as it
 * would with no storage at all.
 */

const KEY = "comfort-tool.session";

/** The text the tab kept, or `undefined` where it kept none or the storage refuses. */
export function readKeptText(): string | undefined {
  try {
    return sessionStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Keep `text` in place of whatever the tab kept; nothing where the storage refuses. */
export function writeKeptText(text: string): void {
  try {
    sessionStorage.setItem(KEY, text);
  } catch {
    // Refused: the tab keeps nothing, which the next read reports.
  }
}

/** Keep nothing; nothing to do where the storage refuses. */
export function clearKeptText(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Refused: nothing is kept there to clear.
  }
}
