/** Ikon layar depan iOS — dinamis, mengikuti logo produk dari konsol (lihat `favicon.ico/route.ts`). */
import { brandIconResponse } from "@sai/platform/brand-routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return brandIconResponse(180);
}
