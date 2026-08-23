import { z } from "zod";
import { vmsg } from "@/lib/i18n/validation";

/**
 * Skema permukaan AKUN (tenant) — issue #458.
 *
 * Keduanya berdiri terpisah dengan sengaja, sebab akibatnya berbeda jauh: nama
 * tampilan hanya dipegang layar, sedangkan ALAMAT dipegang bookmark, surel
 * undangan yang sudah terkirim, dan tautan yang dibagikan ke akuntan eksternal.
 * Satu skema yang menerima keduanya adalah satu permintaan yang bisa keliru
 * mengganti alamat orang yang hanya bermaksud membetulkan ejaan namanya.
 *
 * ⚠ Aturan LENGKAP slug (bentuk ketat, daftar terlarang, jeda 30 hari,
 * pemesanan slug lama) hidup di `lib/tenant-slug.ts` dan diperiksa di server —
 * yang di sini hanya bentuk kasarnya, supaya kiriman yang jelas-jelas salah
 * ditolak sebelum menyentuh basis data.
 */
export const tenantProfileSchema = z.object({
  name: z.string().min(2, vmsg("validation.accountNameRequired")).max(150).trim(),
});

export const tenantSlugSchema = z.object({
  slug: z.string().min(2, vmsg("validation.slugInvalid")).max(50).trim().toLowerCase(),
});
