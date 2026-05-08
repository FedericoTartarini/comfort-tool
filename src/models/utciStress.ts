export const UtciStressCategory = {
  ExtremeColdStress: "extreme cold stress",
  VeryStrongColdStress: "very strong cold stress",
  StrongColdStress: "strong cold stress",
  ModerateColdStress: "moderate cold stress",
  SlightColdStress: "slight cold stress",
  NoThermalStress: "no thermal stress",
  ModerateHeatStress: "moderate heat stress",
  StrongHeatStress: "strong heat stress",
  VeryStrongHeatStress: "very strong heat stress",
  ExtremeHeatStress: "extreme heat stress",
} as const;

export type UtciStressCategory = (typeof UtciStressCategory)[keyof typeof UtciStressCategory];

export const utciStressCategoryOrder: UtciStressCategory[] = [
  UtciStressCategory.ExtremeColdStress,
  UtciStressCategory.VeryStrongColdStress,
  UtciStressCategory.StrongColdStress,
  UtciStressCategory.ModerateColdStress,
  UtciStressCategory.SlightColdStress,
  UtciStressCategory.NoThermalStress,
  UtciStressCategory.ModerateHeatStress,
  UtciStressCategory.StrongHeatStress,
  UtciStressCategory.VeryStrongHeatStress,
  UtciStressCategory.ExtremeHeatStress,
];

interface UtciStressBand {
  minimum: number;
  maximum: number;
  category: UtciStressCategory;
  label: string;
  color: string;
}

export const utciStressBands: UtciStressBand[] = [
  {
    minimum: -50,
    maximum: -40,
    category: UtciStressCategory.ExtremeColdStress,
    label: "Extreme Cold Stress",
    color: "#0f172a",
  },
  {
    minimum: -40,
    maximum: -27,
    category: UtciStressCategory.VeryStrongColdStress,
    label: "Very Strong Cold Stress",
    color: "#1d4ed8",
  },
  {
    minimum: -27,
    maximum: -13,
    category: UtciStressCategory.StrongColdStress,
    label: "Strong Cold Stress",
    color: "#2563eb",
  },
  {
    minimum: -13,
    maximum: 0,
    category: UtciStressCategory.ModerateColdStress,
    label: "Moderate Cold Stress",
    color: "#3b82f6",
  },
  {
    minimum: 0,
    maximum: 9,
    category: UtciStressCategory.SlightColdStress,
    label: "Slight Cold Stress",
    color: "#7dd3fc",
  },
  {
    minimum: 9,
    maximum: 26,
    category: UtciStressCategory.NoThermalStress,
    label: "No Thermal Stress",
    color: "#34d399",
  },
  {
    minimum: 26,
    maximum: 32,
    category: UtciStressCategory.ModerateHeatStress,
    label: "Moderate Heat Stress",
    color: "#fbbf24",
  },
  {
    minimum: 32,
    maximum: 38,
    category: UtciStressCategory.StrongHeatStress,
    label: "Strong Heat Stress",
    color: "#fb923c",
  },
  {
    minimum: 38,
    maximum: 46,
    category: UtciStressCategory.VeryStrongHeatStress,
    label: "Very Strong Heat Stress",
    color: "#f97316",
  },
  {
    minimum: 46,
    maximum: 55,
    category: UtciStressCategory.ExtremeHeatStress,
    label: "Extreme Heat Stress",
    color: "#dc2626",
  },
];

export const utciStressShortLabelByCategory: Record<UtciStressCategory, string> = {
  [UtciStressCategory.ExtremeColdStress]: "Ext.<br>cold",
  [UtciStressCategory.VeryStrongColdStress]: "V strong<br>cold",
  [UtciStressCategory.StrongColdStress]: "Strong<br>cold",
  [UtciStressCategory.ModerateColdStress]: "Moderate<br>cold",
  [UtciStressCategory.SlightColdStress]: "Slight<br>cold",
  [UtciStressCategory.NoThermalStress]: "No<br>stress",
  [UtciStressCategory.ModerateHeatStress]: "Moderate<br>heat",
  [UtciStressCategory.StrongHeatStress]: "Strong<br>heat",
  [UtciStressCategory.VeryStrongHeatStress]: "V strong<br>heat",
  [UtciStressCategory.ExtremeHeatStress]: "Ext.<br>heat",
};
