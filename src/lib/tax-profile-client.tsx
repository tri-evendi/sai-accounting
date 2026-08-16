"use client";

/**
 * Sisi CLIENT dari profil pajak perusahaan — issue #368 (temuan F-12).
 *
 * ══ KENAPA PROP DARI SERVER, BUKAN `fetch` SEPERTI `company-identity-client` ══
 * Pola tetangganya (`CompanyIdentityProvider`) mengambil datanya lewat
 * `GET /api/…` sesudah terpasang, dengan nilai cadangan sementara menunggu. Itu
 * benar untuk nama & alamat: cadangan yang salah sesaat hanya salah di layar.
 *
 * Di sini tidak. Nilai cadangannya adalah TARIF PPN, dan formulir faktur bisa
 * dikirim sebelum jawabannya tiba — perusahaan non-PKP akan menyimpan faktur
 * ber-PPN 11% karena satu jendela waktu selebar satu permintaan jaringan.
 * Server sudah tahu jawabannya saat merender tata letaknya, jadi ia
 * menurunkannya sebagai prop dan tidak pernah ada keadaan "belum tahu".
 *
 * Konsekuensinya: nilai di sini ikut umur tata letak. Tarif yang baru disunting
 * di Pengaturan tampak di formulir sesudah muat penuh berikutnya, bukan seketika
 * — dan itu memang yang diinginkan untuk angka yang berubah beberapa tahun
 * sekali.
 */

import { createContext, useContext } from "react";

import { DEFAULT_TAX_RATE, companyTaxRateOn, type CompanyTaxProfile } from "@/lib/tax";

/**
 * Cadangan untuk pohon komponen tanpa provider — yaitu HANYA uji unit dan
 * layar di luar `/t/{tenant}/{company}/…`. Ia sengaja sama dengan perilaku
 * sebelum #368, sehingga ketiadaan provider tidak pernah membuat layar rusak,
 * cuma membuatnya kembali memakai bawaan statuter.
 */
const FALLBACK: CompanyTaxProfile = {
  isPkp: true,
  rates: [{ rate: DEFAULT_TAX_RATE, effectiveFrom: "2022-04-01" }],
};

const TaxProfileContext = createContext<CompanyTaxProfile>(FALLBACK);

export function TaxProfileProvider({
  profile,
  children,
}: {
  profile: CompanyTaxProfile;
  children: React.ReactNode;
}) {
  return <TaxProfileContext.Provider value={profile}>{children}</TaxProfileContext.Provider>;
}

/** Profil pajak perusahaan aktif. Selalu mengembalikan nilai. */
export function useCompanyTaxProfile(): CompanyTaxProfile {
  return useContext(TaxProfileContext);
}

/**
 * Tarif PPN bawaan untuk dokumen bertanggal `date` (`YYYY-MM-DD`).
 *
 * Tanggalnya WAJIB, dan itu inti temuannya: bawaan sebuah dokumen bergantung
 * pada tanggal dokumen itu, bukan pada hari ini. Formulir yang tanggalnya
 * diubah pemakai ke bulan sebelum tarif berganti akan mengikuti tarif lama,
 * karena `date` yang diberikan ikut berubah.
 */
export function useDefaultTaxRate(date: string): number {
  return companyTaxRateOn(date, useContext(TaxProfileContext));
}
