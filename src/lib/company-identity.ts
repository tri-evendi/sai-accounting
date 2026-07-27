/**
 * Identitas perusahaan (nama + alamat) dari BASIS DATA, bukan dari kode.
 *
 * Kenapa ini ada: `CompanySetting` (wizard setup, issue #20) sudah lama
 * menyimpan nama & alamat perusahaan, tapi sebagian besar permukaan masih
 * membaca konstanta `COMPANY_NAME`/`COMPANY_ADDRESS` di `src/lib/constants.ts`
 * — termasuk **dokumen yang dikirim ke pelanggan** (kontrak, faktur, surat
 * jalan, retur) dan berkas Excel yang diekspor. Akibatnya identitas di kode
 * bisa berbeda dari yang diisi pengguna di wizard, dan pemasangan untuk
 * perusahaan lain akan tetap mencetak nama pemasang pertama.
 *
 * Konstanta di `constants.ts` kini berperan sebagai **nilai cadangan** saja:
 * dipakai bila wizard belum dijalankan (baris `CompanySetting` belum ada) atau
 * bila basis data tak terjangkau. Jadi layar tidak pernah kosong, tapi begitu
 * wizard terisi, yang tampil adalah data pengguna.
 *
 * SISI SERVER. Modul ini menyentuh Prisma, jadi jangan pernah diimpor komponen
 * client — pakai `useCompanyIdentity()` (`@/lib/company-identity-client`) di
 * sana. Penjaga `tests/server-only-boundary.test.ts` menegakkan batas ini.
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { COMPANY_ADDRESS, COMPANY_NAME } from "@/lib/constants";

export interface CompanyIdentity {
  name: string;
  address: string;
}

/** Nilai cadangan bila wizard belum jalan atau DB tak terjangkau. */
export const FALLBACK_COMPANY_IDENTITY: CompanyIdentity = {
  name: COMPANY_NAME,
  address: COMPANY_ADDRESS,
};

/**
 * Identitas perusahaan untuk ditampilkan/dicetak.
 *
 * Tidak pernah melempar: kegagalan DB dikembalikan sebagai nilai cadangan.
 * Alasannya konkret — fungsi ini dipakai saat mencetak dokumen dan saat
 * merender halaman masuk; gagal total di sana jauh lebih buruk daripada
 * menampilkan nama cadangan sesaat.
 */
export async function getCompanyIdentity(): Promise<CompanyIdentity> {
  try {
    const settings = await prisma.companySetting.findFirst({
      orderBy: { id: "asc" },
      select: { name: true, address: true },
    });
    return {
      name: settings?.name?.trim() || FALLBACK_COMPANY_IDENTITY.name,
      address: settings?.address?.trim() || FALLBACK_COMPANY_IDENTITY.address,
    };
  } catch {
    return FALLBACK_COMPANY_IDENTITY;
  }
}
