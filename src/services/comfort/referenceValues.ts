import {
  clo_individual_garments,
  clo_typical_ensembles,
  met_typical_tasks,
} from "jsthermalcomfort";

import { ClothingZone, type ClothingZoneId } from "../../models/clothingZones";

type NumericReferenceMap = Record<string, number>;
type TypicalEnsembleLabel = Parameters<typeof clo_typical_ensembles>[0];

export interface MetabolicActivityOption {
  id: string;
  label: string;
  met: number;
}

export interface ClothingEnsembleOption {
  id: string;
  label: string;
  clo: number;
}

export interface ClothingGarmentOption {
  id: string;
  article: string;
  clo: number;
  zone: ClothingZoneId;
}

const metabolicActivityValues = met_typical_tasks as NumericReferenceMap;
const clothingGarmentValues = clo_individual_garments as NumericReferenceMap;

const metabolicActivityMeta = [
  ["Sleeping", "Sleeping"],
  ["Reclining", "Reclining"],
  ["Seated_Cquiet", "Seated, quiet"],
  ["Reading_seated", "Reading, seated"],
  ["Writing", "Writing"],
  ["Typing", "Typing"],
  ["Standing_relaxed", "Standing, relaxed"],
  ["Filing_seated", "Filing, seated"],
  ["Flying_aircraft_routine", "Flying aircraft, routine"],
  ["Filing_standing", "Filing, standing"],
  ["Driving_a_car", "Driving a car"],
  ["Walking_about", "Walking about"],
  ["Cooking", "Cooking"],
  ["Table_sawing", "Table sawing"],
  ["Walking_2mph_3_2kmh", "Walking 2 mph (3.2 km/h)"],
  ["Lifting_packing", "Lifting / packing"],
  ["Seated_heavy_limb_movement", "Seated, heavy limb movement"],
  ["Light_machine_work", "Light machine work"],
  ["Flying_aircraft_combat", "Flying aircraft, combat"],
  ["Walking_3mph_4_8kmh", "Walking 3 mph (4.8 km/h)"],
  ["House_cleaning", "House cleaning"],
  ["Driving_heavy_vehicle", "Driving, heavy vehicle"],
  ["Dancing", "Dancing"],
  ["Calisthenics", "Calisthenics"],
  ["Walking_4mph_6_4kmh", "Walking 4 mph (6.4 km/h)"],
  ["Tennis", "Tennis"],
  ["Heavy_machine_work", "Heavy machine work"],
  ["Handling_100lb_45_kg_bags", "Handling 100 lb (45 kg) bags"],
  ["Pick_and_shovel_work", "Pick and shovel work"],
  ["Basketball", "Basketball"],
  ["Wrestling", "Wrestling"],
] as const;

const clothingTypicalEnsembleMeta = [
  ["Walking shorts, short-sleeve shirt", "Walking shorts, short-sleeve shirt"],
  ["Typical summer indoor clothing", "Typical summer indoor clothing"],
  ["Knee-length skirt, short-sleeve shirt, sandals, underwear", "Knee-length skirt, short-sleeve shirt, sandals, underwear"],
  ["Trousers, short-sleeve shirt, socks, shoes, underwear", "Trousers, short-sleeve shirt, socks, shoes, underwear"],
  ["Trousers, long-sleeve shirt", "Trousers, long-sleeve shirt"],
  ["Knee-length skirt, long-sleeve shirt, full slip", "Knee-length skirt, long-sleeve shirt, full slip"],
  ["Sweat pants, long-sleeve sweatshirt", "Sweat pants, long-sleeve sweatshirt"],
  ["Jacket, Trousers, long-sleeve shirt", "Jacket, trousers, long-sleeve shirt"],
  ["Typical winter indoor clothing", "Typical winter indoor clothing"],
] as const satisfies ReadonlyArray<readonly [TypicalEnsembleLabel, string]>;

const clothingGarmentMeta = [
  ["Metal_chair", "Metal chair", ClothingZone.Other],
  ["Bra", "Bra", ClothingZone.BaseLayer],
  ["Wooden_stool", "Wooden stool", ClothingZone.Other],
  ["Ankle_socks", "Ankle socks", ClothingZone.Footwear],
  ["Shoes_or_sandals", "Shoes or sandals", ClothingZone.Footwear],
  ["Slippers", "Slippers", ClothingZone.Footwear],
  ["Panty_hose", "Panty hose", ClothingZone.BaseLayer],
  ["Calf_length_socks", "Calf length socks", ClothingZone.Footwear],
  ["Women_underwear", "Women's underwear", ClothingZone.BaseLayer],
  ["Men_underwear", "Men's underwear", ClothingZone.BaseLayer],
  ["Knee_socks_thick", "Knee socks (thick)", ClothingZone.Footwear],
  ["Short_shorts", "Short shorts", ClothingZone.LowerBody],
  ["Walking_shorts", "Walking shorts", ClothingZone.LowerBody],
  ["T_shirt", "T-shirt", ClothingZone.UpperBody],
  ["Standard_office_chair", "Standard office chair", ClothingZone.Other],
  ["Executive_chair", "Executive chair", ClothingZone.Other],
  ["Boots", "Boots", ClothingZone.Footwear],
  ["Sleeveless_scoop_neck_blouse", "Sleeveless scoop-neck blouse", ClothingZone.UpperBody],
  ["Half_slip", "Half slip", ClothingZone.BaseLayer],
  ["Long_underwear_bottoms", "Long underwear bottoms", ClothingZone.BaseLayer],
  ["Full_slip", "Full slip", ClothingZone.BaseLayer],
  ["Short_sleeve_knit_shirt", "Short-sleeve knit shirt", ClothingZone.UpperBody],
  ["Sleeveless_vest_thin", "Sleeveless vest (thin)", ClothingZone.UpperBody],
  ["Sleeveless_vest_thick", "Sleeveless vest (thick)", ClothingZone.UpperBody],
  ["Sleeveless_short_gown_thin", "Sleeveless short gown (thin)", ClothingZone.WholeBody],
  ["Short_sleeve_dress_shirt", "Short-sleeve dress shirt", ClothingZone.UpperBody],
  ["Sleeveless_long_gown_thin", "Sleeveless long gown (thin)", ClothingZone.WholeBody],
  ["Long_underwear_top", "Long underwear top", ClothingZone.BaseLayer],
  ["Thick_skirt", "Thick skirt", ClothingZone.LowerBody],
  ["Long_sleeve_dress_shirt", "Long-sleeve dress shirt", ClothingZone.UpperBody],
  ["Long_sleeve_flannel_shirt", "Long-sleeve flannel shirt", ClothingZone.UpperBody],
  ["Long_sleeve_sweat_shirt", "Long-sleeve sweat shirt", ClothingZone.UpperBody],
  ["Short_sleeve_hospital_gown", "Short-sleeve hospital gown", ClothingZone.WholeBody],
  ["Short_sleeve_short_robe_thin", "Short-sleeve short robe (thin)", ClothingZone.WholeBody],
  ["Short_sleeve_pajamas", "Short-sleeve pajamas", ClothingZone.WholeBody],
  ["Long_sleeve_long_gown", "Long-sleeve long gown", ClothingZone.WholeBody],
  ["Long_sleeve_short_wrap_robe_thick", "Long-sleeve short wrap robe (thick)", ClothingZone.WholeBody],
  ["Long_sleeve_pajamas_thick", "Long-sleeve pajamas (thick)", ClothingZone.WholeBody],
  ["Long_sleeve_long_wrap_robe_thick", "Long-sleeve long wrap robe (thick)", ClothingZone.WholeBody],
  ["Thin_trousers", "Thin trousers", ClothingZone.LowerBody],
  ["Thick_trousers", "Thick trousers", ClothingZone.LowerBody],
  ["Sweatpants", "Sweatpants", ClothingZone.LowerBody],
  ["Overalls", "Overalls", ClothingZone.WholeBody],
  ["Coveralls", "Coveralls", ClothingZone.WholeBody],
  ["Thin_skirt", "Thin skirt", ClothingZone.LowerBody],
  ["Long_sleeve_shirt_dress_thin", "Long-sleeve shirtdress (thin)", ClothingZone.WholeBody],
  ["Long_sleeve_shirt_dress_thick", "Long-sleeve shirtdress (thick)", ClothingZone.WholeBody],
  ["Short_sleeve_shirt_dress", "Short-sleeve shirtdress", ClothingZone.WholeBody],
  ["Sleeveless_scoop_neck_shirt_thin", "Sleeveless, scoop-neck shirt (thin)", ClothingZone.UpperBody],
  ["Sleeveless_scoop_neck_shirt_thick", "Sleeveless, scoop-neck shirt (thick)", ClothingZone.UpperBody],
  ["Long_sleeve_shirt_thin", "Long sleeve shirt (thin)", ClothingZone.UpperBody],
  ["Long_sleeve_shirt_thick", "Long sleeve shirt (thick)", ClothingZone.UpperBody],
  ["Single_breasted_coat_thin", "Single-breasted coat (thin)", ClothingZone.UpperBody],
  ["Single_breasted_coat_thick", "Single-breasted coat (thick)", ClothingZone.UpperBody],
  ["Double_breasted_coat_thin", "Double-breasted coat (thin)", ClothingZone.UpperBody],
  ["Double_breasted_coat_thick", "Double-breasted coat (thick)", ClothingZone.UpperBody],
] as const;

function createReferenceId(sourceKey: string): string {
  return sourceKey.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function getReferenceValue(referenceMap: NumericReferenceMap, sourceKey: string, label: string): number {
  const value = referenceMap[sourceKey];

  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Missing jsthermalcomfort reference value for "${label}".`);
  }

  return value;
}

export const metabolicActivityOptions: MetabolicActivityOption[] = metabolicActivityMeta.map(([sourceKey, label]) => ({
  id: createReferenceId(sourceKey),
  label,
  met: getReferenceValue(metabolicActivityValues, sourceKey, label),
}));

export const clothingTypicalEnsembles: ClothingEnsembleOption[] = clothingTypicalEnsembleMeta.map(([sourceLabel, label]) => ({
  id: createReferenceId(sourceLabel),
  label,
  clo: clo_typical_ensembles(sourceLabel),
}));

export const clothingGarmentOptions: ClothingGarmentOption[] = clothingGarmentMeta.map(([sourceKey, article, zone]) => ({
  id: createReferenceId(sourceKey),
  article,
  clo: getReferenceValue(clothingGarmentValues, sourceKey, article),
  zone,
}));
