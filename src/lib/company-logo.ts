/**
 * LOGO PERUSAHAAN (tabel `company_logos` di buku setiap PT, migration company
 * 0002). Diunggah pemilik PT di Pengaturan (`company_setting.manage`) dan
 * dicetak di kepala dokumen PDF.
 *
 * Semua fungsi memakai `prisma` — klien buku PT AKTIF — jadi konteks
 * perusahaan wajib sudah ditegakkan pemanggil (penjaga rute). Sengaja TANPA
 * cache tingkat modul: isinya milik satu perusahaan, dan pembacaannya jarang
 * (pengaturan, pembuatan PDF), tidak di setiap muatan halaman.
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { sha256Hex, validateLogo, type ImageMime, type LogoRejection } from "@sai/core/image-file";

/** Sisi minimum logo perusahaan — cukup untuk kepala dokumen. */
export const COMPANY_LOGO_MIN_SIDE = 64;

export interface CompanyLogoMeta {
  sha256: string;
  mimeType: ImageMime;
  width: number;
  height: number;
}

const META = { sha256: true, mimeType: true, width: true, height: true } as const;

export async function readCompanyLogoMeta(): Promise<CompanyLogoMeta | null> {
  const row = await prisma.companyLogo.findFirst({ where: { isActive: true }, select: META });
  return row ? { ...row, mimeType: row.mimeType as ImageMime } : null;
}

export async function readCompanyLogo(): Promise<{ meta: CompanyLogoMeta; content: Uint8Array } | null> {
  const row = await prisma.companyLogo.findFirst({ where: { isActive: true }, select: { ...META, content: true } });
  if (!row) return null;
  const { content, ...meta } = row;
  return { meta: { ...meta, mimeType: meta.mimeType as ImageMime }, content: new Uint8Array(content) };
}

export type CompanyLogoWriteResult =
  | { outcome: "ok"; meta: CompanyLogoMeta }
  | { outcome: "invalid"; reason: LogoRejection };

/** Unggah logo baru: yang lama dinonaktifkan dan yang baru dibuat dalam satu transaksi. */
export async function setCompanyLogo(input: { bytes: Uint8Array; userId: number | null }): Promise<CompanyLogoWriteResult> {
  const checked = validateLogo(input.bytes, { minSide: COMPANY_LOGO_MIN_SIDE });
  if (!checked.ok) return { outcome: "invalid", reason: checked.reason };
  const sha256 = await sha256Hex(input.bytes);
  const created = await prisma.$transaction(async (tx) => {
    await tx.companyLogo.updateMany({ where: { isActive: true }, data: { isActive: false } });
    return tx.companyLogo.create({
      data: {
        mimeType: checked.info.mime,
        content: Buffer.from(input.bytes),
        sha256,
        width: checked.info.width,
        height: checked.info.height,
        byteSize: input.bytes.length,
        createdByUserId: input.userId,
      },
      select: META,
    });
  });
  return { outcome: "ok", meta: { ...created, mimeType: created.mimeType as ImageMime } };
}

/** Hapus logo: dokumen kembali tanpa logo. Riwayat unggahan tetap tersimpan (nonaktif). */
export async function removeCompanyLogo(): Promise<{ deactivated: number }> {
  const r = await prisma.companyLogo.updateMany({ where: { isActive: true }, data: { isActive: false } });
  return { deactivated: r.count };
}
