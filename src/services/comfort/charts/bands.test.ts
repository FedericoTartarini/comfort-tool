import { describe, expect, it } from "vitest";

import type { NumericBand } from "../../../models/modelCapabilities";
import {
  cloneNumericBands,
  normalizeNumericBands,
  validateNumericBands,
} from "./bands";

const validBands: readonly NumericBand[] = [
  { min: -Infinity, max: 0, label: "Low", color: "#0000ff" },
  { min: 0, max: 10, label: "Middle", color: "#00ff00" },
  { min: 12, max: Infinity, label: "High", color: "#ff0000" },
];

describe("numeric Explore bands", () => {
  it("accepts sorted touching or gapped half-open bands", () => {
    expect(validateNumericBands(validBands)).toEqual({ valid: true, issues: [] });
    expect(validateNumericBands([
      { ...validBands[0], max: 5 },
      { ...validBands[1], min: 5 },
    ])).toEqual({ valid: true, issues: [] });
  });

  it("rejects empty, malformed, reversed, unsorted, and overlapping bands", () => {
    expect(validateNumericBands([]).issues[0].code).toBe("empty");
    expect(validateNumericBands([
      { min: NaN, max: 1, label: "Bad", color: "#000000" },
    ]).issues.map(({ code }) => code)).toContain("invalid-edge");
    expect(validateNumericBands([
      { min: 0, max: 1, label: " ", color: " " },
    ]).issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "missing-label",
      "missing-color",
    ]));
    expect(validateNumericBands([
      { min: 2, max: 1, label: "Bad", color: "#000000" },
    ]).issues.map(({ code }) => code)).toContain("invalid-range");
    expect(validateNumericBands([
      { min: 1, max: 2, label: "Later", color: "#000000" },
      { min: 0, max: 1, label: "Earlier", color: "#ffffff" },
    ]).issues.map(({ code }) => code)).toEqual(["unsorted"]);
    expect(validateNumericBands([
      { min: 0, max: 2, label: "One", color: "#000000" },
      { min: 1, max: 3, label: "Two", color: "#ffffff" },
    ]).issues.map(({ code }) => code)).toContain("overlap");
  });

  it("checks unsorted drafts for geometric overlap after ordering valid bands", () => {
    const unsortedNonOverlapping = [
      { min: 10, max: Infinity, label: "High", color: "#ff0000" },
      { min: -Infinity, max: 0, label: "Low", color: "#0000ff" },
      { min: 0, max: 10, label: "Middle", color: "#00ff00" },
    ];
    const unsortedOverlapping = [
      { min: 10, max: Infinity, label: "High", color: "#ff0000" },
      { min: -Infinity, max: 11, label: "Low", color: "#0000ff" },
    ];

    expect(validateNumericBands(
      unsortedNonOverlapping,
      { requireSorted: false },
    )).toEqual({ valid: true, issues: [] });
    expect(validateNumericBands(
      unsortedOverlapping,
      { requireSorted: false },
    ).issues.map(({ code }) => code)).toEqual(["overlap"]);
  });

  it("does not report overlap for bands with invalid geometry", () => {
    const validation = validateNumericBands([
      { min: NaN, max: 10, label: "NaN", color: "#000000" },
      { min: 0, max: 5, label: "Valid", color: "#ffffff" },
      { min: 4, max: 3, label: "Reversed", color: "#ff0000" },
    ], { requireSorted: false });

    expect(validation.issues.map(({ code }) => code)).toEqual([
      "invalid-edge",
      "invalid-range",
    ]);
  });

  it("allows only semantic lower and upper infinities", () => {
    expect(validateNumericBands([
      { min: Infinity, max: Infinity, label: "Bad", color: "#000000" },
    ]).valid).toBe(false);
    expect(validateNumericBands([
      { min: -Infinity, max: -Infinity, label: "Bad", color: "#000000" },
    ]).valid).toBe(false);
  });

  it("sorts and trims a clone without mutating the source", () => {
    const source: NumericBand[] = [
      { min: 10, max: Infinity, label: " High ", color: " #f00 " },
      { min: -Infinity, max: 10, label: " Low ", color: " #00f " },
    ];
    const clone = cloneNumericBands(source);
    const normalized = normalizeNumericBands(source);

    expect(clone[0]).not.toBe(source[0]);
    expect(normalized.map(({ label }) => label)).toEqual(["Low", "High"]);
    expect(source[0].min).toBe(10);
  });
});
