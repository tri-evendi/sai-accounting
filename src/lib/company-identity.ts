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
import { getCompanyContext } from "@/lib/company-context";
import { currentCompany } from "@/lib/current-company";
import { getCompany } from "@/lib/company-registry";

export interface CompanyIdentity {
  name: string;
  address: string;
}

/**
 * Nilai cadangan TERAKHIR — dipakai hanya bila basis data kendali pun tak
 * terjangkau (mis. halaman masuk, yang memang belum punya perusahaan).
 *
 * Sejak #104 ia BUKAN lagi "nama perusahaan ini": isinya nama pemasang
 * pertama. Urutan yang benar ada di `getCompanyIdentity()` — setting perusahaan
 * dulu, lalu nama di registry, baru konstanta ini.
 */
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
/**
 * URUTAN SUMBER NAMA — dipisah jadi fungsi murni supaya bisa DIBUKTIKAN tes,
 * bukan sekadar dijanjikan komentar (issue #104).
 *
 *  1. **Setting perusahaan** (diisi wizard) — satu-satunya sumber yang memang
 *     dimaksudkan sebagai identitas resmi, lengkap dengan alamatnya.
 *  2. **Nama di registry kendali** — dipakai saat wizard belum diisi. Sejak
 *     #104 itu keadaan yang lumrah: setiap PT baru lahir dengan tabel setting
 *     kosong, sementara namanya sudah dikenal (itu yang dipilih pengguna saat
 *     masuk). Alamat tidak ada di registry, dan MENGOSONGKANNYA jauh lebih
 *     benar daripada meminjam alamat perusahaan lain — alamat di dokumen resmi
 *     bukan hiasan.
 *  3. **Konstanta di `constants.ts`** — hanya bila keduanya tak terjangkau.
 *
 * Kenapa urutan ini penting: langkah 2 dulu tidak ada, sehingga perusahaan yang
 * belum menjalankan wizard mencetak nama badan hukum PEMASANG PERTAMA di kop
 * faktur, kontrak, dan surat jalannya sendiri — kekeliruan yang tidak terlihat
 * seperti bug, melainkan seperti dokumen yang sah.
 */
export function pickIdentity(source: {
  settingName?: string | null;
  settingAddress?: string | null;
  registryName?: string | null;
}): CompanyIdentity {
  const settingName = source.settingName?.trim();
  if (settingName) {
    return {
      name: settingName,
      address: source.settingAddress?.trim() || FALLBACK_COMPANY_IDENTITY.address,
    };
  }

  const registryName = source.registryName?.trim();
  if (registryName) return { name: registryName, address: "" };

  return FALLBACK_COMPANY_IDENTITY;
}

export async function getCompanyIdentity(): Promise<CompanyIdentity> {
  try {
    const settings = await prisma.companySetting.findFirst({
      orderBy: { id: "asc" },
      select: { name: true, address: true },
    });

    // Registry hanya ditanya bila memang dibutuhkan — halaman yang sudah punya
    // setting tidak perlu membayar satu query ke basis data kendali.
    // Konteks dicari seperti pembaca lain: ALS dulu, lalu SESI —
    // `enterWith` tidak dijamin merambat di setiap permintaan HTTP
    // (docs/MULTI-COMPANY.md), dan tanpa fallback sesi perusahaan tanpa wizard
    // diam-diam jatuh ke konstanta pemasang pertama alih-alih nama registry-nya
    // sendiri.
    let registryName: string | null = null;
    if (!settings?.name?.trim()) {
      let companyId = getCompanyContext()?.companyId ?? null;
      if (companyId == null) {
        try {
          companyId = (await currentCompany()).companyId;
        } catch {
          // Belum log in (halaman masuk memakai endpoint ini) — biarkan null.
        }
      }
      if (companyId != null) registryName = (await getCompany(companyId))?.name ?? null;
    }

    return pickIdentity({
      settingName: settings?.name,
      settingAddress: settings?.address,
      registryName,
    });
  } catch {
    return FALLBACK_COMPANY_IDENTITY;
  }
}
