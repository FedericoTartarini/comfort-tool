/** Pathname is identity; `?state=` is the JSON→Base64URL snapshot of input+setting. */
import { serializeShareState, deserializeShareState, SHARE_STATE_PARAM } from "./codec";
import type { ShareStateSnapshot } from "./snapshot";

function toUrl(source: URL | Location | string): URL {
  return new URL(typeof source === "string" ? source : source.href);
}

export function buildShareUrl(
  snapshot: ShareStateSnapshot,
  locationSource: URL | Location | string,
): string {
  const url = toUrl(locationSource);
  url.searchParams.set(SHARE_STATE_PARAM, serializeShareState(snapshot));
  return url.toString();
}

export function readShareStateFromUrl(
  locationSource: URL | Location | string,
): ShareStateSnapshot | null {
  const encodedSnapshot =
    toUrl(locationSource).searchParams.get(SHARE_STATE_PARAM);
  return encodedSnapshot ? deserializeShareState(encodedSnapshot) : null;
}
