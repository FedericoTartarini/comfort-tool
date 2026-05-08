export const ClothingZone = {
  UpperBody: "upperBody",
  LowerBody: "lowerBody",
  Footwear: "footwear",
  WholeBody: "wholeBody",
  BaseLayer: "baseLayer",
  Other: "other",
} as const;

export type ClothingZoneId = (typeof ClothingZone)[keyof typeof ClothingZone];
export type ClothingDisplayZoneId =
  | typeof ClothingZone.UpperBody
  | typeof ClothingZone.LowerBody
  | typeof ClothingZone.Footwear
  | typeof ClothingZone.Other;

export interface ClothingZoneMeta {
  id: ClothingZoneId;
  label: string;
  shortLabel: string;
  description: string;
}

export const clothingZoneOrder: ClothingZoneId[] = [
  ClothingZone.UpperBody,
  ClothingZone.LowerBody,
  ClothingZone.Footwear,
  ClothingZone.WholeBody,
  ClothingZone.BaseLayer,
  ClothingZone.Other,
];

export const clothingDisplayZoneOrder: ClothingDisplayZoneId[] = [
  ClothingZone.UpperBody,
  ClothingZone.LowerBody,
  ClothingZone.Footwear,
  ClothingZone.Other,
];

export const clothingZoneMetaById: Record<ClothingZoneId, ClothingZoneMeta> = {
  [ClothingZone.UpperBody]: {
    id: ClothingZone.UpperBody,
    label: "Upper body",
    shortLabel: "Upper",
    description: "Shirts, layers, outerwear, and tops.",
  },
  [ClothingZone.LowerBody]: {
    id: ClothingZone.LowerBody,
    label: "Lower body",
    shortLabel: "Lower",
    description: "Trousers, shorts, skirts, and legwear.",
  },
  [ClothingZone.Footwear]: {
    id: ClothingZone.Footwear,
    label: "Footwear",
    shortLabel: "Feet",
    description: "Shoes, socks, boots, and foot coverings.",
  },
  [ClothingZone.WholeBody]: {
    id: ClothingZone.WholeBody,
    label: "Whole body",
    shortLabel: "Whole",
    description: "Garments that cover most of the body.",
  },
  [ClothingZone.BaseLayer]: {
    id: ClothingZone.BaseLayer,
    label: "Base layer",
    shortLabel: "Base",
    description: "Underwear and close-to-skin clothing.",
  },
  [ClothingZone.Other]: {
    id: ClothingZone.Other,
    label: "Other",
    shortLabel: "Other",
    description: "Seats and special items that still affect clo.",
  },
};
