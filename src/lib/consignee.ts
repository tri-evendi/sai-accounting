/**
 * Consignee master helpers (issue #22).
 *
 * `normalizeConsigneeName` is the single place a consignee name is cleaned up so
 * the same company entered with stray/uneven whitespace collapses to one value —
 * matching how the 0016 backfill deduped legacy `contracts.consignee` text into
 * master rows. Trims the ends and collapses any internal whitespace run to a
 * single space; returns "" for nullish/blank input.
 */
export function normalizeConsigneeName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.trim().replace(/\s+/g, " ");
}
