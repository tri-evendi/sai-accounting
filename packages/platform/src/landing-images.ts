/**
 * GAMBAR HALAMAN DEPAN — penyimpanan & penyaji (tabel `landing_images`,
 * migration platform 0015). Mekanisme logo produk (`brand-assets.ts`) yang
 * dipakai ulang:
 *
 *   • isi berkas di basis data (ikut cadangan, kedua aplikasi membacanya);
 *   • format dibaca dari ISI berkas (`validateLandingImage`), metadata dibuang
 *     (`stripImageMetadata`) SEBELUM sidik dihitung dan disimpan;
 *   • disajikan dengan `imageResponseHeaders` — `nosniff` + CSP `sandbox`,
 *     cache peramban selamanya bila `?v=<sidik>` cocok.
 *
 * Baris tidak pernah diubah, jadi cache isi per id tidak pernah basi: tidak
 * perlu sinyal. Yang berubah (gambar MANA yang dipakai) hidup di JSON
 * `landing_settings`, di bawah sinyal `landing-settings`.
 *
 * Tanpa `server-only`, klien disuntik untuk tulisan (pola `brand-assets.ts`).
 */
import type { PrismaClient as PlatformClient } from "@sai/db/client/platform";
import { sha256Hex } from "@sai/core/image-file";
import {
  stripImageMetadata,
  validateLandingImage,
  type LandingImageKind,
  type LandingImageMime,
  type LandingImageRef,
  type LandingImageRejection,
} from "@sai/core/landing-media";

import { imageResponseHeaders } from "./brand-assets";

type Deps = { platform: PlatformClient };

export type LandingImageWriteResult =
  | { outcome: "ok"; ref: LandingImageRef; mimeType: LandingImageMime; bytes: number }
  | { outcome: "invalid"; reason: LandingImageRejection };

/** Unggah satu gambar untuk satu pemakaian. Baris baru; tidak ada yang diganti. */
export async function createLandingImage(
  deps: Deps,
  input: { bytes: Uint8Array; kind: LandingImageKind; actor: string }
): Promise<LandingImageWriteResult> {
  const checked = validateLandingImage(input.bytes, input.kind);
  if (!checked.ok) return { outcome: "invalid", reason: checked.reason };
  const bersih = stripImageMetadata(input.bytes, checked.info.mime);
  /* Pembuangan metadata tidak boleh merusak berkas: periksa ulang hasilnya. */
  const ulang = validateLandingImage(bersih, input.kind);
  const isi = ulang.ok ? bersih : input.bytes;
  const sha256 = await sha256Hex(isi);
  const row = await deps.platform.landingImage.create({
    data: {
      kind: input.kind,
      mimeType: checked.info.mime,
      content: Buffer.from(isi),
      sha256,
      width: checked.info.width,
      height: checked.info.height,
      byteSize: isi.length,
      createdBy: input.actor.slice(0, 100),
    },
    select: { id: true },
  });
  return {
    outcome: "ok",
    ref: { id: row.id, sha256, width: checked.info.width, height: checked.info.height },
    mimeType: checked.info.mime,
    bytes: isi.length,
  };
}

/**
 * Rujukan yang SAH untuk disimpan: setiap id ada, jenisnya cocok, dan sidik &
 * ukurannya diambil dari BARISNYA — bukan dari kiriman formulir. Memulangkan
 * peta id → rujukan; id yang tidak ada / jenis lain tidak masuk peta.
 */
export async function resolveLandingImageRefs(
  deps: Deps,
  wanted: { id: number; kind: LandingImageKind }[]
): Promise<Map<number, LandingImageRef>> {
  if (wanted.length === 0) return new Map();
  const rows = await deps.platform.landingImage.findMany({
    where: { id: { in: [...new Set(wanted.map((w) => w.id))] } },
    select: { id: true, kind: true, sha256: true, width: true, height: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out = new Map<number, LandingImageRef>();
  for (const w of wanted) {
    const r = byId.get(w.id);
    if (r && r.kind === w.kind) out.set(w.id, { id: r.id, sha256: r.sha256, width: r.width, height: r.height });
  }
  return out;
}

/* ── Penyaji ──────────────────────────────────────────────────────────────── */

/** Cache isi per id — baris tidak pernah berubah. Dibatasi supaya galeri
 *  besar tidak menahan memori tanpa batas. */
const ISI_MAKS = 64;
const isiCache = new Map<number, { mime: string; sha256: string; content: Uint8Array }>();

async function isiGambar(deps: Deps, id: number) {
  const ada = isiCache.get(id);
  if (ada) return ada;
  const row = await deps.platform.landingImage.findUnique({
    where: { id },
    select: { mimeType: true, sha256: true, content: true },
  });
  if (!row) return null;
  const isi = { mime: row.mimeType, sha256: row.sha256, content: new Uint8Array(row.content) };
  if (isiCache.size >= ISI_MAKS) isiCache.delete(isiCache.keys().next().value as number);
  isiCache.set(id, isi);
  return isi;
}

/** Gambar per id, atau 404. Platform tak terjangkau = 404 tanpa cache (gagal-lunak). */
export async function landingImageResponse(deps: Deps, request: Request, rawId: string): Promise<Response> {
  const tidakAda = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!/^[1-9]\d{0,9}$/.test(rawId)) return tidakAda();
  try {
    const isi = await isiGambar(deps, Number(rawId));
    if (!isi) return tidakAda();
    const v = new URL(request.url).searchParams.get("v");
    const immutable = v !== null && v.length >= 16 && isi.sha256.startsWith(v);
    return new Response(Buffer.from(isi.content), { headers: imageResponseHeaders(isi.mime, isi.sha256, immutable) });
  } catch (error) {
    console.error("[landing-images] gambar tak terbaca:", error);
    return tidakAda();
  }
}

/** Isi + MIME gambar OG untuk `opengraph-image.tsx`, atau `null`. */
export async function landingImageContent(
  deps: Deps,
  id: number
): Promise<{ mime: string; content: Uint8Array } | null> {
  try {
    const isi = await isiGambar(deps, id);
    return isi ? { mime: isi.mime, content: isi.content } : null;
  } catch (error) {
    console.error("[landing-images] gambar OG tak terbaca — memakai gambar bawaan:", error);
    return null;
  }
}
