/**
 * Ikon tab — dinamis supaya mengikuti logo produk yang diunggah di konsol.
 * Tanpa unggahan: lambang bawaan digambar dari `@sai/ui/brand/mark`.
 */
import { brandIconResponse } from "@sai/platform/brand-routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return brandIconResponse(48);
}
