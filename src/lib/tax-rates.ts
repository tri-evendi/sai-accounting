/**
 * Profil pajak sebuah perusahaan, dari BASIS DATA — issue #368 (temuan F-12).
 *
 * ══ APA YANG DIPERBAIKI ════════════════════════════════════════════════════
 * Tarif PPN adalah konstanta kompilasi (`DEFAULT_TAX_RATE`). Alasannya masuk
 * akal pada zamannya dan tertulis di kepala `lib/tax.ts`, tapi dua premisnya
 * gugur begitu pendaftaran dibuka untuk umum: pelanggan NON-PKP tidak memungut
 * PPN sama sekali (bawaan 11% salah bagi mereka sejak faktur pertama), dan
 * dokumen yang dicatat MUNDUR ke bulan sebelum tarif berubah harus memakai
 * tarif pada TANGGALNYA. Ditambah satu akibat operasional: mengubah tarif
 * menuntut redeploy sepuluh menit untuk satu angka yang berubah karena
 * Peraturan Menteri.
 *
 * ══ APA YANG SUDAH BENAR DAN TIDAK DISENTUH ════════════════════════════════
 * Dokumen tersimpan membawa `tax_rate`-nya SENDIRI, dan mesin posting membaca
 * kolom itu. Riwayat karena itu sudah aman: menambah tarif baru tidak mengubah
 * satu pun faktur lama. Yang diperbaiki modul ini HANYA BAWAAN yang ditawarkan
 * formulir — sesuatu yang masih bisa diubah pemakainya sebelum menyimpan.
 *
 * SISI SERVER. Menyentuh Prisma, jadi jangan diimpor komponen client — di sana
 * pakai `useCompanyTaxProfile()` (`@/lib/tax-profile-client`), yang menerima
 * profilnya sebagai prop dari server. Dijaga `tests/server-only-boundary.test.ts`.
 *
 * ══ TIDAK ADA CACHE TINGKAT MODUL ══════════════════════════════════════════
 * Disengaja. Isinya milik SATU perusahaan, dan cache tingkat modul yang tidak
 * dikunci per `companyId` adalah persis cara buku PT A bocor ke layar PT B
 * (`docs/MULTI-COMPANY.md`). Dua query kecil per render lebih murah daripada
 * satu kelas galat yang tidak menimbulkan pesan apa pun.
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { DEFAULT_TAX_RATE, type CompanyTaxProfile, type TaxRateRow } from "@/lib/tax";

/**
 * Tanggal berlaku tarif 11% — 1 April 2022, UU HPP.
 *
 * Ini BENIH, bukan kebenaran yang dibekukan: begitu barisnya ada di basis data,
 * tabelnya yang berbicara dan konstanta ini tidak dibaca lagi.
 */
export const HPP_EFFECTIVE_FROM = "2022-04-01";

/** `Date` UTC tengah malam dari `YYYY-MM-DD` — kolomnya `@db.Date`. */
function asDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** `YYYY-MM-DD` dari kolom `@db.Date`, tanpa menyentuh zona waktu lokal. */
export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Pastikan perusahaan ini punya setidaknya satu baris tarif.
 *
 * Dipanggil saat profilnya dibaca, bukan di migration: penyemaian butuh tanggal
 * berlaku yang benar berikut alasannya, dan sebuah INSERT di migration akan
 * menanam angka tanpa cara memperbaikinya bila kelak ternyata keliru.
 *
 * Aman dijalankan berkali-kali dan aman dari dua permintaan yang berlomba —
 * `effective_from` unik, jadi yang kalah mendapat P2002 dan diam saja. Yang
 * TIDAK dilakukan: menyemai ulang tabel yang sudah pernah diisi lalu
 * dikosongkan pemakainya. `count > 0` diperiksa lebih dulu justru supaya
 * keputusan pemakai tidak dibatalkan oleh benih yang terus tumbuh kembali.
 */
export async function ensureTaxRates(): Promise<void> {
  if ((await prisma.taxRate.count()) > 0) return;
  try {
    await prisma.taxRate.create({
      data: {
        rate: DEFAULT_TAX_RATE,
        effectiveFrom: asDate(HPP_EFFECTIVE_FROM),
        note: "UU HPP — tarif PPN 11% sejak 1 April 2022 (benih otomatis).",
      },
    });
  } catch {
    /* Sudah dibuat permintaan lain. Hasil akhirnya sama persis. */
  }
}

/** Seluruh baris tarif perusahaan ini, terbaru lebih dulu. */
export async function listTaxRates(): Promise<
  Array<TaxRateRow & { id: number; note: string | null }>
> {
  await ensureTaxRates();
  const rows = await prisma.taxRate.findMany({ orderBy: { effectiveFrom: "desc" } });
  return rows.map((r) => ({
    id: r.id,
    rate: Number(r.rate),
    effectiveFrom: isoDate(r.effectiveFrom),
    note: r.note,
  }));
}

/**
 * Profil pajak perusahaan yang sedang aktif: penanda PKP + riwayat tarifnya.
 *
 * Perusahaan tanpa baris `CompanySetting` (wizard belum dijalankan) dianggap
 * PKP — nilai yang sama dengan bawaan kolomnya, sehingga layar sebelum dan
 * sesudah wizard tidak berbeda perilakunya.
 */
export async function readCompanyTaxProfile(): Promise<CompanyTaxProfile> {
  await ensureTaxRates();
  const [settings, rows] = await Promise.all([
    prisma.companySetting.findFirst({ orderBy: { id: "asc" }, select: { isPkp: true } }),
    prisma.taxRate.findMany({
      orderBy: { effectiveFrom: "desc" },
      select: { rate: true, effectiveFrom: true },
    }),
  ]);
  return {
    isPkp: settings?.isPkp ?? true,
    rates: rows.map((r) => ({ rate: Number(r.rate), effectiveFrom: isoDate(r.effectiveFrom) })),
  };
}

/**
 * Tambah/ubah tarif yang berlaku sejak sebuah tanggal.
 *
 * `upsert` atas `effective_from`, dan itu batas yang disengaja: memperbaiki
 * SALAH KETIK pada tanggal yang sama boleh, tapi setiap tanggal berlaku tetap
 * satu baris. Yang tidak disediakan modul ini adalah menyunting `effective_from`
 * sebuah baris menjadi tanggal lain — itu mengubah cara setiap dokumen di antara
 * dua tanggal dibaca ulang, yaitu menulis ulang masa lalu dari layar pengaturan.
 */
export async function upsertTaxRate(input: {
  rate: number;
  effectiveFrom: string;
  note?: string | null;
}): Promise<void> {
  const effectiveFrom = asDate(input.effectiveFrom);
  await prisma.taxRate.upsert({
    where: { effectiveFrom },
    create: { rate: input.rate, effectiveFrom, note: input.note ?? null },
    update: { rate: input.rate, note: input.note ?? null },
  });
}

/** Hapus satu baris tarif. */
export async function deleteTaxRate(id: number): Promise<void> {
  await prisma.taxRate.delete({ where: { id } });
}

/**
 * Setel penanda PKP perusahaan ini.
 *
 * Memulangkan `false` bila belum ada baris `CompanySetting` — yaitu wisaya
 * penyiapan belum dijalankan. Barisnya TIDAK dibuat di sini: `name` dan
 * `fiscal_year_start` wajib, dan mengarang keduanya demi satu boolean akan
 * menanam nama perusahaan palsu yang lalu tercetak di kepala faktur. Wisaya
 * yang membuatnya, berikut jawaban PKP-nya.
 */
export async function setCompanyPkp(isPkp: boolean): Promise<boolean> {
  const existing = await prisma.companySetting.findFirst({
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (!existing) return false;
  await prisma.companySetting.update({ where: { id: existing.id }, data: { isPkp } });
  return true;
}
