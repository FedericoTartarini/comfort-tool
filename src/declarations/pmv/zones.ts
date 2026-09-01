import { pmv_ppd_ashrae, pmv_ppd_iso } from "jsthermalcomfort";
import {
  bandsFromJsBins,
  bandsFromJsBounds,
  requireMappedCategory,
  thermalZonesFromBands,
} from "../../catalog/classifierBins";
import { bandsFromThermalZones } from "../../catalog/modelCapabilities";
import { resolveZoneAppearance, ZoneToken } from "../../catalog/zoneTokens";

const PMV_TSV_TOKENS: Readonly<Record<string, ZoneToken>> = {
  Cold: ZoneToken.Cold,
  Cool: ZoneToken.Cool,
  "Slightly Cool": ZoneToken.SlightlyCool,
  Neutral: ZoneToken.Neutral,
  "Slightly Warm": ZoneToken.SlightlyWarm,
  Warm: ZoneToken.Warm,
  Hot: ZoneToken.Hot,
};

const ASHRAE_COMPLIANCE_TOKENS: Readonly<Record<string, ZoneToken>> = {
  [ZoneToken.Acceptable]: ZoneToken.Acceptable,
  [ZoneToken.FailFill]: ZoneToken.FailFill,
};

function tokenForTsv(label: string): ZoneToken {
  const token = PMV_TSV_TOKENS[label];
  if (token === undefined) {
    throw new Error(`Unknown PMV TSV category: ${label}`);
  }
  return token;
}

export function pmvTsvAppearance(label: string) {
  return resolveZoneAppearance(tokenForTsv(label));
}

export function classifyAshraeTsv(pmv: number): string {
  return requireMappedCategory(pmv_ppd_ashrae.tsv(pmv), "ASHRAE PMV TSV");
}

export function classifyIsoTsv(pmv: number): string {
  return requireMappedCategory(pmv_ppd_iso.tsv(pmv), "ISO PMV TSV");
}

export function isAshraeAcceptablePmv(pmv: number): boolean {
  return pmv_ppd_ashrae.compliance(pmv) === true;
}

export function isIsoNeutralPmv(pmv: number): boolean {
  return classifyIsoTsv(pmv) === "Neutral";
}

const ashraeTsvBands = bandsFromJsBins(pmv_ppd_ashrae.tsv.bins, PMV_TSV_TOKENS);
const isoTsvNumericBands = bandsFromJsBins(pmv_ppd_iso.tsv.bins, PMV_TSV_TOKENS);

export const ashraeTsvZonesList = thermalZonesFromBands(ashraeTsvBands, PMV_TSV_TOKENS);
export const isoTsvZonesList = thermalZonesFromBands(isoTsvNumericBands, PMV_TSV_TOKENS);

export const ashraeComplianceBands = bandsFromJsBounds(
  pmv_ppd_ashrae.compliance.bounds,
  { label: ZoneToken.Acceptable, token: ZoneToken.Acceptable },
  { label: ZoneToken.FailFill, token: ZoneToken.FailFill },
);

export const ashraeComplianceZonesList = thermalZonesFromBands(
  ashraeComplianceBands,
  ASHRAE_COMPLIANCE_TOKENS,
);

export const isoTsvBands = bandsFromThermalZones(isoTsvZonesList);

export const ashraeComfortIsolineTargets = [
  -pmv_ppd_ashrae.COMPLIANCE_LIMIT,
  pmv_ppd_ashrae.COMPLIANCE_LIMIT,
] as const;

const isoNeutralBand = isoTsvNumericBands.find(({ label }) => label === "Neutral");
if (!isoNeutralBand) {
  throw new Error("ISO TSV bins did not produce a Neutral band.");
}

export const isoComfortIsolineTargets = [
  isoNeutralBand.min,
  isoNeutralBand.max,
] as const;
