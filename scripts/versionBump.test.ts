import { describe, expect, it } from "vitest";
import { bumpError } from "./versionBump.ts";

describe("bumpError", () => {
  it("accepts a patch, minor or major raise", () => {
    expect(bumpError("0.1.0", "0.1.1")).toBeUndefined();
    expect(bumpError("0.1.9", "0.2.0")).toBeUndefined();
    expect(bumpError("0.9.9", "1.0.0")).toBeUndefined();
  });

  it("compares each part as a number, not as text", () => {
    expect(bumpError("0.9.0", "0.10.0")).toBeUndefined();
    expect(bumpError("0.10.0", "0.9.0")).toBeDefined();
  });

  it("refuses an unchanged version and names the three bump commands", () => {
    expect(bumpError("0.1.0", "0.1.0")).toMatch("npm version patch|minor|major");
  });

  it("refuses a lowered version", () => {
    expect(bumpError("1.0.0", "0.99.99")).toBeDefined();
  });

  it("throws on a string that is not MAJOR.MINOR.PATCH", () => {
    expect(() => bumpError("", "0.1.0")).toThrow();
    expect(() => bumpError("v0.1.0", "0.1.1")).toThrow();
    expect(() => bumpError("0.1.0", "0.2.0-beta.1")).toThrow();
  });
});
