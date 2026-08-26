import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { primaryInputOrder } from "./quantities";

function parseEslintRestrictedWireStrings(): string[] {
  const source = readFileSync(resolve(process.cwd(), "eslint.config.js"), "utf8");
  const match = source.match(
    /const restrictedWireStringSelectors = \[([\s\S]*?)\]\.map/,
  );
  if (!match) {
    throw new Error("Could not parse restrictedWireStringSelectors from eslint.config.js.");
  }

  return [...match[1].matchAll(/"([^"]+)"/g)].map(([, value]) => value);
}

describe("catalog wire IDs", () => {
  it("keeps eslint restricted wire literals aligned with primaryInputOrder", () => {
    const eslintWireIds = parseEslintRestrictedWireStrings();
    expect(eslintWireIds).toEqual([...primaryInputOrder]);
  });
});
