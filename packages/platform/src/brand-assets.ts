/**
 * LOGO PRODUK yang diunggah operator (tabel `brand_assets`, migration platform
 * 0005). Tanpa baris aktif, lambang bawaan dari kode
 * (`packages/ui/src/brand/mark.ts`) yang tampil.
 *
 * Pembaca dipakai setiap muatan halaman di kedua aplikasi (root layout, rute
 * `/brand/mark`, favicon, manifest, gambar OG), jadi metadatanya di-cache 60
 * detik per proses. Cache ini GLOBAL, bukan per perusahaan: isinya milik
 * platform. Konsol mengosongkan cache-nya sendiri sesudah menulis dan
 * menaikkan sinyal `brand-mark` (`cache-signals.ts`); aplikasi pelanggan
 * menyusul dalam `CACHE_SIGNAL_POLL_SECONDS` — atau seketika bila bus
 * invalidasi tahap 2 menyala (`cache-bus.ts`). 60 detik tinggal sebagai jaring
 * bila sinyalnya tak terbaca.
 *
 * Fail-soft (doktrin #137): `sai_platform` yang tak terjangkau berarti
 * lambang bawaan, bukan halaman yang gagal.
 *
 * Tanpa `server-only`, klien disuntik untuk tulisan (pola `writes.ts`).
 */
import type { PrismaClient as PlatformClient } from "@sai/db/client/platform";
import { sha256Hex, validateLogo, type ImageMime, type LogoRejection } from "@sai/core/image-file";

import { registerSharedCache } from "./cache-bus";
import { bumpCacheSignal, cacheSignalVersion, signalAllows } from "./cache-signals";

type Deps = { platform: PlatformClient };

/** Sisi minimum logo produk: ia juga dipakai sebagai favicon dan ikon aplikasi. */
export const BRAND_MARK_MIN_SIDE = 256;

export interface BrandMarkMeta {
  sha256: string;
  mimeType: ImageMime;
  width: number;
  height: number;
  createdBy: string;
  createdAt: Date;
}

export async function readActiveBrandMark(deps: Deps): Promise<BrandMarkMeta | null> {
  const row = await deps.platform.brandAsset.findFirst({
    where: { kind: "mark", isActive: true },
    select: { sha256: true, mimeType: true, width: true, height: true, createdBy: true, createdAt: true },
  });
  return row ? { ...row, mimeType: row.mimeType as ImageMime } : null;
}

const TTL_MS = 60 * 1000;
let metaCache: { at: number; version: number | null; meta: BrandMarkMeta | null } | null = null;
let contentCache: { sha256: string; content: Uint8Array } | null = null;

/**
 * Tahap 2: penulisnya konsol operator, pembacanya setiap replika — lewat bus.
 * `contentCache` dikunci SIDIK isinya, jadi ia tidak pernah basi; yang perlu
 * dibagi hanya metadata "logo mana yang aktif".
 */
const shared = registerSharedCache("brand-mark", () => {
  metaCache = null;
  contentCache = null;
});

/** Metadata logo aktif, ber-cache dan fail-soft (`null` = pakai lambang bawaan). */
export async function cachedBrandMark(deps: Deps, now: number = Date.now()): Promise<BrandMarkMeta | null> {
  const version = await cacheSignalVersion(deps.platform, "brand-mark", now);
  if (metaCache && now - metaCache.at < TTL_MS && shared.usable() && signalAllows(metaCache.version, version)) {
    return metaCache.meta;
  }
  try {
    const meta = await readActiveBrandMark(deps);
    metaCache = { at: now, version, meta };
    return meta;
  } catch (error) {
    console.error("[brand] logo produk tak terbaca — memakai lambang bawaan:", error);
    // Yang terakhir diketahui lebih benar daripada lambang bawaan saat platform tersendat sebentar.
    return metaCache?.meta ?? null;
  }
}

/** Isi berkas logo aktif (ber-cache per sidik), atau `null`. */
export async function cachedBrandMarkContent(deps: Deps): Promise<{ meta: BrandMarkMeta; content: Uint8Array } | null> {
  const meta = await cachedBrandMark(deps);
  if (!meta) return null;
  if (contentCache?.sha256 === meta.sha256) return { meta, content: contentCache.content };
  try {
    const row = await deps.platform.brandAsset.findFirst({
      where: { kind: "mark", isActive: true, sha256: meta.sha256 },
      select: { content: true },
    });
    if (!row) return null;
    const content = new Uint8Array(row.content);
    contentCache = { sha256: meta.sha256, content };
    return { meta, content };
  } catch (error) {
    console.error("[brand] isi logo produk tak terbaca — memakai lambang bawaan:", error);
    return null;
  }
}

export function invalidateBrandMarkCache(): void {
  metaCache = null;
  contentCache = null;
  shared.publish();
}

/** URL logo aktif untuk `<img>`/`<link>`. Sidik di kueri membuat cache peramban aman selamanya. */
export function brandMarkUrl(meta: Pick<BrandMarkMeta, "sha256">): string {
  return `/brand/mark?v=${meta.sha256.slice(0, 16)}`;
}

export type BrandMarkWriteResult =
  | { outcome: "ok"; meta: BrandMarkMeta }
  | { outcome: "invalid"; reason: LogoRejection };

/** Unggah logo baru: yang lama dinonaktifkan dan yang baru dibuat dalam satu transaksi. */
export async function setBrandMark(
  deps: Deps,
  input: { bytes: Uint8Array; actor: string }
): Promise<BrandMarkWriteResult> {
  const checked = validateLogo(input.bytes, { minSide: BRAND_MARK_MIN_SIDE });
  if (!checked.ok) return { outcome: "invalid", reason: checked.reason };
  const sha256 = await sha256Hex(input.bytes);
  const created = await deps.platform.$transaction(async (tx) => {
    await tx.brandAsset.updateMany({ where: { kind: "mark", isActive: true }, data: { isActive: false } });
    return tx.brandAsset.create({
      data: {
        kind: "mark",
        mimeType: checked.info.mime,
        content: Buffer.from(input.bytes),
        sha256,
        width: checked.info.width,
        height: checked.info.height,
        byteSize: input.bytes.length,
        createdBy: input.actor.slice(0, 100),
      },
      select: { sha256: true, mimeType: true, width: true, height: true, createdBy: true, createdAt: true },
    });
  });
  invalidateBrandMarkCache();
  await bumpCacheSignal(deps.platform, "brand-mark");
  return { outcome: "ok", meta: { ...created, mimeType: created.mimeType as ImageMime } };
}

/** Kembali ke lambang bawaan. Riwayat unggahan tetap tersimpan (nonaktif). */
export async function resetBrandMark(deps: Deps): Promise<{ deactivated: number }> {
  const result = await deps.platform.brandAsset.updateMany({
    where: { kind: "mark", isActive: true },
    data: { isActive: false },
  });
  invalidateBrandMarkCache();
  await bumpCacheSignal(deps.platform, "brand-mark");
  return { deactivated: result.count };
}

/**
 * Kepala HTTP untuk gambar logo yang disajikan dari basis data. `nosniff` dan
 * CSP `sandbox` sebagai lapis tambahan: yang tersimpan hanya PNG/JPEG yang
 * sudah divalidasi isinya, tetapi rute publik tidak boleh pernah menjadi
 * dokumen yang bisa menjalankan apa pun.
 */
export function imageResponseHeaders(mime: string, sha256: string, immutable: boolean): Headers {
  return new Headers({
    "Content-Type": mime,
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=300",
    ETag: `"${sha256.slice(0, 32)}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });
}
