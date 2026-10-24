/**
 * Bentuk usaha perusahaan AKTIF — baca/tulis registry kendali (control 0014).
 *
 * Sengaja TIDAK lewat cache `company-registry`: dibaca jarang (wisaya, tutup
 * buku, Pengaturan, Laporan Perubahan Ekuitas), dan bentuk yang baru diubah
 * harus langsung berlaku pada tutup buku berikutnya — bukan setelah satu TTL.
 */
import "server-only";

import { controlDb } from "@sai/core/control-db";
import { parseLegalForm, type LegalForm } from "@sai/core/legal-form";
import { currentCompanyId } from "@/lib/current-company";
import { invalidateCompany } from "@/lib/company-registry";

/** Bentuk usaha sebuah perusahaan (bawaan: perusahaan dari permintaan ini). */
export async function getCompanyLegalForm(companyId?: number): Promise<LegalForm> {
  const id = companyId ?? (await currentCompanyId());
  const row = await controlDb.company.findUnique({
    where: { id },
    select: { legalForm: true },
  });
  return parseLegalForm(row?.legalForm);
}

/** Tulis bentuk usaha. Pemanggil yang menulis jejak audit. */
export async function setCompanyLegalForm(companyId: number, legalForm: LegalForm): Promise<void> {
  await controlDb.company.update({ where: { id: companyId }, data: { legalForm } });
  invalidateCompany(companyId);
}
