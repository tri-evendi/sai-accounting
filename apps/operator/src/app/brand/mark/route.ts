/** Logo produk unggahan operator (`@sai/platform/brand-routes`). Publik: ia tampil di halaman masuk dan pendaratan. */
import { brandMarkResponse } from "@sai/platform/brand-routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return brandMarkResponse(request);
}
