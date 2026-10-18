import { NextResponse } from "next/server";

import { controlDb } from "@sai/core/control-db";
import { platformDb } from "@sai/platform/platform-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Kesiapan container KONSOL, untuk healthcheck Docker & Traefik.
 *
 * Doktrinnya sama dengan `/api/health` aplikasi pelanggan: hanya basis data
 * KENDALI yang memutuskan 503 — tanpanya tidak ada operator yang bisa masuk
 * dan tidak ada tenant yang bisa dibaca. `sai_platform` DILAPORKAN, tidak ikut
 * memutuskan (doktrin #137: penagihan mati ≠ konsol mati; justru konsollah
 * yang dipakai untuk melihat penagihan yang mati).
 *
 * Sengaja lebih sempit: tidak menyentuh basis data perusahaan (konsol tidak
 * membuka buku lewat pool aplikasi), penjadwal, cadangan, atau surel — itu
 * bidang `/api/health` aplikasi pelanggan, yang tetap menjadi sumber
 * pemantauan isi.
 */
export async function GET() {
  try {
    await controlDb.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
  let platform: "ok" | "unknown" = "unknown";
  try {
    await platformDb.$queryRaw`SELECT 1`;
    platform = "ok";
  } catch {
    /* dilaporkan, tidak memutuskan */
  }
  return NextResponse.json({ status: "ok", control: { status: "ok" }, platform: { status: platform } });
}
