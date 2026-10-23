/**
 * Sambungan e-Faktur (PJAP) SETIAP perusahaan aktif — bacaan halaman `/efaktur`
 * konsol (docs/EFAKTUR.md).
 *
 * Yang dibaca: penyedia, sandbox/produksi, ADA-TIDAKNYA kredensial, dan jumlah
 * kiriman per status. TIDAK PERNAH isi kredensial — kontrak dan rahasia PJAP
 * milik PT, dan operator tidak butuh keduanya untuk menjawab "PT mana yang
 * kirimannya macet".
 *
 * Koneksi pendek `@sai/db/server` per buku (pola `backups.ts`), bukan
 * `getCompanyClient`: membuka klien Prisma untuk setiap buku dari satu halaman
 * operator mengusir klien buku yang sedang dipakai pelanggan dari kolamnya.
 */
import "server-only";

import { bukaBasisData, type RingkasanEfaktur } from "@sai/db/server";
import {
  COMPANY_DATABASE_TARGET_SELECT,
  companyServerConnection,
  toCompanyDatabaseTarget,
} from "@sai/db/company-url";
import { controlDb } from "@sai/core/control-db";

export interface EfakturConnectionRow {
  label: string;
  /** `null` = buku tak terbaca (belum bermigrasi 0004, atau tak terjangkau). */
  ringkasan: RingkasanEfaktur | null;
}

const PARALEL = 4;

/** `null` = registry tak terbaca / `CONTROL_DATABASE_URL` tidak diset. */
export async function efakturConnectionsForOperator(): Promise<EfakturConnectionRow[] | null> {
  const controlUrl = process.env.CONTROL_DATABASE_URL;
  if (!controlUrl) return null;
  let companies;
  try {
    companies = await controlDb.company.findMany({
      where: { isActive: true },
      orderBy: { databaseName: "asc" },
      select: { slug: true, ...COMPANY_DATABASE_TARGET_SELECT, tenant: { select: { slug: true } } },
    });
  } catch (error) {
    console.error("[operator-efaktur] daftar perusahaan tak terbaca:", error);
    return null;
  }

  const hasil: EfakturConnectionRow[] = new Array(companies.length);
  let berikut = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARALEL, companies.length) }, async () => {
      while (berikut < companies.length) {
        const i = berikut++;
        const c = companies[i]!;
        const label = c.tenant ? `${c.tenant.slug} / ${c.slug}` : c.slug;
        let ringkasan: RingkasanEfaktur | null = null;
        try {
          const url = companyServerConnection(toCompanyDatabaseTarget(c), controlUrl).serverUrl;
          const db = await bukaBasisData(url, c.databaseName);
          try {
            ringkasan = await db.ringkasanEfaktur();
          } finally {
            await db.tutup();
          }
        } catch (error) {
          console.warn(`[operator-efaktur] ${c.databaseName} tak terbaca: ${String(error)}`);
        }
        hasil[i] = { label, ringkasan };
      }
    })
  );
  return hasil;
}
