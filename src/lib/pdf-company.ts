/**
 * `PdfCompany` SISI SERVER — identitas perusahaan beserta logonya, siap
 * diserahkan ke generator PDF mana pun.
 *
 * ══ KENAPA SATU TEMPAT, DAN BUKAN DIRAKIT DI TIAP RUTE ═════════════════════
 * Perakitan ini sudah ada sekali di `invoice-send.ts` (#465), dan tahap 1c
 * memindahkan generator PDF kedua ke server — jadi ia akan ada DUA kali. Dua
 * perakitan untuk satu benda akan menyimpang pada perbaikan berikutnya: yang
 * satu memuat logo, yang lain lupa, dan gejalanya kertas yang berbeda untuk
 * satu PT tanpa satu galat pun.
 *
 * ══ LOGO GAGAL-LUNAK, DENGAN SENGAJA ══════════════════════════════════════
 * Logo yang tak terbaca TIDAK menggagalkan dokumennya. Alasannya sudah
 * terbukti di jalur faktur: laporan tanpa logo tetap laporan yang benar,
 * sementara laporan yang menolak terbit karena satu gambar adalah laporan yang
 * tidak bisa dicetak orang pada hari ia membutuhkannya. Kegagalannya DICATAT,
 * bukan ditelan diam-diam.
 */
import "server-only";

import { getCompanyIdentity } from "@/lib/company-identity";
import { readCompanyLogo } from "@/lib/company-logo";
import type { PdfCompany } from "@/lib/pdf/company-header";

export async function serverPdfCompany(label: string): Promise<PdfCompany> {
  const [{ toPdfLogo }, company, logo] = await Promise.all([
    import("@/lib/pdf/company-header"),
    getCompanyIdentity(),
    readCompanyLogo().catch((error) => {
      console.error(`[${label}] logo perusahaan tak terbaca:`, error);
      return null;
    }),
  ]);

  return {
    ...company,
    logo: logo
      ? toPdfLogo({ ...logo.meta, base64: Buffer.from(logo.content).toString("base64") })
      : null,
  };
}
