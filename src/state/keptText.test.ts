/**
 * The tab's kept text (ADR-0002 decision 63, rule 2) against the test
 * environment's session storage: what is written is read back, cleared reads
 * as nothing, and a storage that refuses reads as nothing and takes a write
 * without an error.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearKeptText, readKeptText, writeKeptText } from "./keptText";

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe("the kept text", () => {
  it("is nothing in a tab that kept none", () => {
    expect(readKeptText()).toBeUndefined();
  });

  it("is what was last written", () => {
    writeKeptText("v1.first");
    writeKeptText("v1.second");

    expect(readKeptText()).toBe("v1.second");
  });

  it("is nothing once cleared", () => {
    writeKeptText("v1.kept");
    clearKeptText();

    expect(readKeptText()).toBeUndefined();
  });

  it("is nothing, and takes a write and a clear without an error, where the browser refuses the storage itself", () => {
    writeKeptText("v1.before");
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });

    expect(() => writeKeptText("v1.refused")).not.toThrow();
    expect(readKeptText()).toBeUndefined();
    expect(() => clearKeptText()).not.toThrow();

    vi.restoreAllMocks();
    expect(readKeptText()).toBe("v1.before");
  });

  it("is nothing where the storage refuses a read, and keeps nothing of a write it refuses", () => {
    writeKeptText("v1.before");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Access is denied.", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    expect(() => writeKeptText("v1.refused")).not.toThrow();
    expect(readKeptText()).toBeUndefined();

    vi.restoreAllMocks();
    expect(readKeptText()).toBe("v1.before");
  });
});
