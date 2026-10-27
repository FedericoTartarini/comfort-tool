/**
 * The version check (docs/rewrite-plan.md, "Version bump and deploy"): a deploy
 * proceeds only when package.json's version is above the last deployed one,
 * and the author chooses the level. Run as `node scripts/versionBump.ts <git
 * ref>`; it compares package.json's version against the one package.json has
 * at the ref.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function versionParts(version: string): number[] {
  const match = SEMVER.exec(version);
  if (!match) throw new Error(`"${version}" is not a MAJOR.MINOR.PATCH version.`);
  return match.slice(1).map(Number);
}

/** The refusal when `current` is not above `previous`, else undefined. */
export function bumpError(previous: string, current: string): string | undefined {
  const previousParts = versionParts(previous);
  const currentParts = versionParts(current);
  const index = currentParts.findIndex((part, i) => part !== previousParts[i]);
  if (index !== -1 && currentParts[index] > previousParts[index]) return undefined;
  return `package.json's version ${current} is not above the previous ${previous}. Run npm version patch|minor|major and commit package.json and package-lock.json.`;
}

if (import.meta.main) {
  const ref = process.argv[2];
  if (!ref) throw new Error("Usage: node scripts/versionBump.ts <git ref>");
  const previous = JSON.parse(execFileSync("git", ["show", `${ref}:package.json`], { encoding: "utf8" })).version;
  const current = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  const error = bumpError(previous, current);
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log(`Version ${current} is above ${previous}.`);
}
