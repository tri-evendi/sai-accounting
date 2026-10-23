/**
 * GERBANG KUOTA & STATUS penyediaan PT — SATU pembacaan untuk DUA pemanggil.
 *
 * Pemanggil pertama `POST /api/companies`, sebelum pekerjaan diterbitkan
 * (issue #138). Pemanggil kedua pekerja `company.provision`, sesaat sebelum
 * basis data dibuat — dan yang kedua itulah alasan berkas ini ada.
 *
 * ══ KENAPA DIPERIKSA DUA KALI ═════════════════════════════════════════════
 * Sejak penyediaan pindah ke antrean (#714), jumlah PT tenant baru bertambah
 * saat pekerjaannya SELESAI, bukan saat diterima. Di antara keduanya ada
 * antrean: N permintaan dengan slug berbeda yang tiba sebelum pekerjaan
 * pertama selesai semuanya membaca hitungan yang sama, semuanya lolos, dan
 * kuota terlampaui tanpa satu galat pun. Kunci dedupe (nama basis data) tidak
 * menolongnya — slug berbeda = kunci berbeda.
 *
 * Pemeriksaan ulang di pekerja menutup celah itu untuk penyebaran satu-replika:
 * pelari jalur `interactive` mengerjakan satu pekerjaan pada satu saat, jadi
 * hitungan yang dibacanya sudah memuat setiap PT yang selesai sebelumnya.
 * Sisa celah yang TIDAK ditutup — disebut, bukan disembunyikan: dua replika
 * `svc-worker` (profil HA) yang menyediakan PT milik tenant yang sama pada
 * detik yang sama. Penutupnya kunci per tenant di sekitar hitung+daftar, dan
 * ia baru sepadan bila profil HA dipakai untuk pendaftaran mandiri.
 */
import "server-only";

import { controlDb } from "@sai/core/control-db";
import type { CreationQuota } from "@sai/core/entitlement";
import { refuseProvisioning, type ProvisionRefusal } from "@sai/core/registration";
import { creationQuotaFor } from "@/lib/entitlement-source";

export interface ProvisioningVerdict {
  refusal: ProvisionRefusal;
  /** `null` bila tenantnya tidak ada — yang juga berarti ditolak. */
  quota: CreationQuota | null;
}

/** Bolehkah tenant ini menumbuhkan satu PT lagi — SEKARANG. */
export async function provisioningVerdict(tenantId: number): Promise<ProvisioningVerdict> {
  const tenantRow = await controlDb.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true, maxCompanies: true, maxUsers: true },
  });
  const quota = tenantRow ? await creationQuotaFor(tenantRow) : null;
  const companyCount = await controlDb.company.count(
    quota?.scope === "installation" ? undefined : { where: { tenantId } }
  );
  const refusal =
    tenantRow && quota
      ? refuseProvisioning({
          status: tenantRow.status,
          maxCompanies: quota.maxCompanies,
          companyCount,
        })
      : "tenant_not_active";
  return { refusal, quota };
}
