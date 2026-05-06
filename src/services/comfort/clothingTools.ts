import { clo_tout } from "jsthermalcomfort";

import {
  ClothingZone,
  type ClothingDisplayZoneId,
  clothingZoneMetaById,
  clothingZoneOrder,
  type ClothingZoneId,
} from "../../models/clothingZones";
import type { UnitSystem } from "../../models/units";
import type { ClothingGarmentOption } from "./referenceValues";

export interface ClothingSelectionSection {
  zoneId: ClothingZoneId;
  label: string;
  garments: ClothingGarmentOption[];
}

const garmentDisplayZoneOverrides: Record<string, ClothingDisplayZoneId[]> = {
  bra: [ClothingZone.UpperBody],
  "panty-hose": [ClothingZone.LowerBody, ClothingZone.Footwear],
  "women-s-underwear": [ClothingZone.LowerBody],
  "men-s-underwear": [ClothingZone.LowerBody],
  "half-slip": [ClothingZone.LowerBody],
  "long-underwear-bottoms": [ClothingZone.LowerBody],
  "full-slip": [ClothingZone.UpperBody, ClothingZone.LowerBody],
  "long-underwear-top": [ClothingZone.UpperBody],
};

export function roundClothingValue(value: number): number {
  return Number(value.toFixed(2));
}

export function predictClothingInsulation(
  outdoorTemperature: number,
  unitSystem: UnitSystem,
): number {
  return clo_tout(outdoorTemperature, unitSystem).clo_tout;
}

export function filterClothingGarments(
  garments: ClothingGarmentOption[],
  zoneId: ClothingDisplayZoneId,
  query: string,
): ClothingGarmentOption[] {
  const normalizedQuery = query.trim().toLowerCase();

  return garments.filter((garment) => {
    const visibleZones = getGarmentDisplayZoneIds(garment);

    if (!visibleZones.includes(zoneId)) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return garment.article.toLowerCase().includes(normalizedQuery);
  });
}

export function getGarmentDisplayZoneIds(
  garment: ClothingGarmentOption,
): ClothingDisplayZoneId[] {
  const overrideZones = garmentDisplayZoneOverrides[garment.id];
  if (overrideZones) {
    return overrideZones;
  }

  switch (garment.zone) {
    case ClothingZone.UpperBody:
      return [ClothingZone.UpperBody];
    case ClothingZone.LowerBody:
      return [ClothingZone.LowerBody];
    case ClothingZone.Footwear:
      return [ClothingZone.Footwear];
    case ClothingZone.WholeBody:
      return [ClothingZone.UpperBody, ClothingZone.LowerBody];
    case ClothingZone.Other:
      return [ClothingZone.Other];
    case ClothingZone.BaseLayer:
      return [];
    default:
      return [];
  }
}

export function sumSelectedGarmentClo(
  selectedGarmentIds: string[],
  garments: ClothingGarmentOption[],
): number {
  const selectedSet = new Set(selectedGarmentIds);
  const total = garments.reduce((accumulator, garment) => (
    selectedSet.has(garment.id) ? accumulator + garment.clo : accumulator
  ), 0);

  return roundClothingValue(total);
}

export function getSelectedClothingGarments(
  selectedGarmentIds: string[],
  garments: ClothingGarmentOption[],
): ClothingGarmentOption[] {
  const selectedSet = new Set(selectedGarmentIds);
  return garments.filter((garment) => selectedSet.has(garment.id));
}

export function buildSelectedClothingSections(
  selectedGarmentIds: string[],
  garments: ClothingGarmentOption[],
): ClothingSelectionSection[] {
  const selectedGarments = getSelectedClothingGarments(selectedGarmentIds, garments);

  return clothingZoneOrder.reduce((sections, zoneId) => {
    const garmentsInZone = selectedGarments.filter((garment) => garment.zone === zoneId);

    if (garmentsInZone.length === 0) {
      return sections;
    }

    sections.push({
      zoneId,
      label: clothingZoneMetaById[zoneId].label,
      garments: garmentsInZone,
    });

    return sections;
  }, [] as ClothingSelectionSection[]);
}
