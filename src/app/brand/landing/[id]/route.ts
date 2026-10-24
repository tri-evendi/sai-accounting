/**
 * Gambar halaman depan unggahan operator (`@sai/platform/landing-images`):
 * tangkapan layar, foto testimoni, logo klien & mitra. Publik di aplikasi
 * customer — pendaratan memuatnya tanpa sesi; di konsol hanya untuk pratinjau.
 * `?v=<sidik>` yang cocok → boleh di-cache selamanya.
 */
import { landingImageResponse } from "@sai/platform/landing-images";
import { platformDb } from "@sai/platform/platform-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return landingImageResponse({ platform: platformDb }, request, id);
}
