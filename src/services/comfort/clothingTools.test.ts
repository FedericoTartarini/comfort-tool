import { describe, expect, it } from "vitest";

import { ClothingZone } from "../../models/clothingZones";
import { UnitSystem } from "../../models/units";
import {
  buildSelectedClothingSections,
  filterClothingGarments,
  getGarmentDisplayZoneIds,
  predictClothingInsulation,
  sumSelectedGarmentClo,
} from "./clothingTools";
import { clothingGarmentOptions } from "./referenceValues";

describe("clothing tools", () => {
  it("assigns every garment to a stable zone", () => {
    expect(clothingGarmentOptions.every((garment) => garment.zone)).toBe(true);
    expect(clothingGarmentOptions.find((garment) => garment.article === "T-shirt")?.zone).toBe(ClothingZone.UpperBody);
    expect(clothingGarmentOptions.find((garment) => garment.article === "Thin trousers")?.zone).toBe(ClothingZone.LowerBody);
    expect(clothingGarmentOptions.find((garment) => garment.article === "Shoes or sandals")?.zone).toBe(ClothingZone.Footwear);
    expect(clothingGarmentOptions.find((garment) => garment.article === "Coveralls")?.zone).toBe(ClothingZone.WholeBody);
    expect(clothingGarmentOptions.find((garment) => garment.article === "Women's underwear")?.zone).toBe(ClothingZone.BaseLayer);
    expect(clothingGarmentOptions.find((garment) => garment.article === "Metal chair")?.zone).toBe(ClothingZone.Other);
  });

  it("filters garments by zone and search query", () => {
    const upperBodyGarments = filterClothingGarments(
      clothingGarmentOptions,
      ClothingZone.UpperBody,
      "",
    );
    const lowerBodyGarments = filterClothingGarments(
      clothingGarmentOptions,
      ClothingZone.LowerBody,
      "",
    );
    const coatMatches = filterClothingGarments(
      clothingGarmentOptions,
      ClothingZone.UpperBody,
      "coat",
    );

    expect(upperBodyGarments.some((garment) => garment.article === "Overalls")).toBe(true);
    expect(lowerBodyGarments.some((garment) => garment.article === "Overalls")).toBe(true);
    expect(coatMatches.length).toBeGreaterThan(0);
    expect(coatMatches.every((garment) => garment.article.toLowerCase().includes("coat"))).toBe(true);
  });

  it("maps garments into display zones for the simplified figure", () => {
    const braZones = getGarmentDisplayZoneIds(
      clothingGarmentOptions.find((garment) => garment.article === "Bra")!,
    );
    const pantyHoseZones = getGarmentDisplayZoneIds(
      clothingGarmentOptions.find((garment) => garment.article === "Panty hose")!,
    );
    const fullSlipZones = getGarmentDisplayZoneIds(
      clothingGarmentOptions.find((garment) => garment.article === "Full slip")!,
    );

    expect(braZones).toEqual([ClothingZone.UpperBody]);
    expect(pantyHoseZones).toEqual([ClothingZone.LowerBody, ClothingZone.Footwear]);
    expect(fullSlipZones).toEqual([ClothingZone.UpperBody, ClothingZone.LowerBody]);
  });

  it("sums selected garment clo values with stable rounding", () => {
    const selectedGarments = clothingGarmentOptions
      .filter((garment) => ["T-shirt", "Thin trousers", "Shoes or sandals"].includes(garment.article));
    const totalClothingValue = sumSelectedGarmentClo(
      selectedGarments.map((garment) => garment.id),
      clothingGarmentOptions,
    );

    const expectedValue = Number(
      selectedGarments.reduce((sum, garment) => sum + garment.clo, 0).toFixed(2),
    );

    expect(totalClothingValue).toBe(expectedValue);
  });

  it("groups selected garments by zone order", () => {
    const selectedGarmentIds = clothingGarmentOptions
      .filter((garment) => ["T-shirt", "Thin trousers", "Shoes or sandals", "Metal chair"].includes(garment.article))
      .map((garment) => garment.id);
    const selectedSections = buildSelectedClothingSections(selectedGarmentIds, clothingGarmentOptions);

    expect(selectedSections.map((section) => section.zoneId)).toEqual([
      ClothingZone.UpperBody,
      ClothingZone.LowerBody,
      ClothingZone.Footwear,
      ClothingZone.Other,
    ]);
  });

  it("wraps predictive clothing estimation through the service boundary", () => {
    const predictedClothing = predictClothingInsulation(10, UnitSystem.SI);

    expect(predictedClothing).toBeTypeOf("number");
    expect(predictedClothing).toBeGreaterThan(0);
  });
});
