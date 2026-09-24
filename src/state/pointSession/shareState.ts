/** Re-export share stack: snapshot DTO, codec, and `?state=` URL helpers. */
export { normalizeCompareInputIds } from "./compareState";
export {
  type ShareStateSnapshot,
  createShareStateSnapshot,
  applyShareSnapshotToState,
} from "./share/snapshot";
export {
  SHARE_STATE_VERSION,
  serializeShareState,
  parseShareStateSnapshot,
  deserializeShareState,
} from "./share/codec";
export { buildShareUrl, readShareStateFromUrl } from "./share/url";
