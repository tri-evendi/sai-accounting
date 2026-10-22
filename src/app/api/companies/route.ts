/**
 * Membuat perusahaan baru — MENERBITKAN penyediaan, tidak mengerjakannya.
 *
 * ══ SEJAK OKT 2026: 202 + PEKERJAAN, BUKAN ALIRAN NDJSON ═══════════════════
 * Sampai Okt 2026 route ini membuat basis data di dalam permintaannya sendiri
 * dan mengalirkan kemajuannya sebagai NDJSON. Itu menuntut `app-customer`
 * memegang kredensial PEMILIK PostgreSQL (`PROVISION_DATABASE_URL`) — satu
 * RCE di container yang menghadap internet = DDL di setiap buku PT. Kini route
 * ini hanya menerbitkan pekerjaan `company.provision` dan menjawab
 * `202 { jobId }`; pekerjanya pelari jalur `interactive` di `svc-worker`, dan
 * layar menunggu lewat `GET /api/companies/provisioning/[id]`. Alasan lengkap:
 * `lib/company-provisioning.ts`; janji dedupe & pengulangan:
 * `lib/company-provisioning-queue.ts`.
 *
 * ══ PENJAGANYA TINGKAT TENANT (issue #135) ═════════════════════════════════
 * `company.create` pindah ke matriks tenant: membuat PT adalah kewenangan
 * customer (owner/admin tenant), bukan peran di salah satu PT — dan pemilik
 * tenant TANPA satu pun perusahaan justru pemakai terpenting route ini.
 * `requireTenantApiPermission` karena itu TIDAK menuntut konteks perusahaan,
 * dan tenant pemilik perusahaan baru diambil dari keanggotaan PEMBUATNYA.
 */
import { NextResponse } from "next/server";

import { requireTenantApiPermission } from "@/lib/tenant-guard";
import { getRequestI18n } from "@sai/platform/i18n/server";
import { translateFieldErrors } from "@sai/core/i18n/validation";
import { companyCreateSchema } from "@/lib/validations/company";
import { enqueueCompanyProvision } from "@/lib/company-provisioning-queue";
import { getClientIp } from "@/lib/audit";
import { controlDb } from "@sai/core/control-db";
import { refuseProvisioning } from "@sai/core/registration";
import { creationQuotaFor } from "@/lib/entitlement-source";

export async function POST(request: Request) {
  const result = await requireTenantApiPermission("company.create");
  if (!result.authorized) return result.response;

  /*
   * ══ GERBANG KUOTA & STATUS — DI SERVER, SEBELUM PEKERJAAN DITERBITKAN ══
   * (issue #138, §9). Dengan pendaftaran mandiri, siapa pun yang lolos
   * verifikasi bisa meminta pembuatan SEBUAH BASIS DATA — dan `db:migrate:all`
   * menyusuri semuanya pada setiap rilis. Kuota `max_companies` adalah
   * snapshot di baris tenant (#134); status di luar trialing/active tidak
   * boleh menumbuhkan buku baru (suspended = hanya-baca, §7.4). Keputusannya
   * murni (`refuseProvisioning`, teruji); jumlah dihitung DI SINI supaya UI
   * yang menyembunyikan tombol tidak pernah dianggap pagar.
   */
  /*
   * Angka batasnya lewat SATU pintu entitlement (`creationQuotaFor`): di SaaS
   * snapshot paket tenant ini, persis seperti sebelumnya; di on-premise angka
   * LISENSI, dihitung atas seluruh pemasangan. Yang dibatasi hanya PT BARU —
   * buku yang sudah ada tidak pernah ditutup oleh lisensi (licence.ts).
   */
  const tenantRow = await controlDb.tenant.findUnique({
    where: { id: result.tenant.tenantId },
    select: { status: true, maxCompanies: true, maxUsers: true },
  });
  const quota = tenantRow ? await creationQuotaFor(tenantRow) : null;
  const companyCount = await controlDb.company.count(
    quota?.scope === "installation" ? undefined : { where: { tenantId: result.tenant.tenantId } }
  );
  const refusal =
    tenantRow && quota
      ? refuseProvisioning({
          status: tenantRow.status,
          maxCompanies: quota.maxCompanies,
          companyCount,
        })
      : "tenant_not_active";
  if (refusal) {
    const { t } = await getRequestI18n();
    return NextResponse.json(
      {
        error:
          refusal === "company_quota_reached"
            ? quota?.source === "licence"
              ? t("errors.companyLicenceLimitReached", { max: quota.maxCompanies })
              : t("errors.companyQuotaReached")
            : t("errors.tenantNotActive"),
        code: refusal,
      },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = companyCreateSchema.safeParse(body);
  if (!parsed.success) {
    const { dictionary, t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("validation.invalidInput"), details: translateFieldErrors(parsed.error, dictionary) },
      { status: 400 }
    );
  }

  const session = result.session;
  const userId = Number.parseInt(session.user.id, 10);

  const queued = await enqueueCompanyProvision(result.tenant.tenantId, {
    slug: parsed.data.slug,
    name: parsed.data.name,
    databaseName: parsed.data.databaseName,
    createdByUserId: userId,
    actor: {
      userId: session.user.id,
      username: session.user.name ?? session.user.email ?? session.user.id,
      tenantRole: result.tenant.role,
      tenantSlug: result.tenant.tenantSlug,
      /* Diturunkan DI SINI, satu-satunya tempat yang punya permintaan HTTP —
         pekerja yang menulis jejak auditnya tidak punya. */
      ipAddress: getClientIp(request),
    },
  });

  if (!queued.ok) {
    /* Kunci dedupe (= nama basis data) sedang dipegang penyediaan lain yang
       bukan milik tenant ini — hanya mungkin lewat nama basis data EKSPLISIT.
       Jawabannya sama dengan nama yang sudah terdaftar, supaya tidak ada
       bentuk respons yang membedakan keduanya. */
    const { t } = await getRequestI18n();
    const database = parsed.data.databaseName ?? "";
    return NextResponse.json(
      { error: t("companies.errDatabaseTaken", { database }), code: "database_taken" },
      { status: 409 }
    );
  }

  /* 202: diterima, belum selesai. `attached` = klik ganda / tab kedua yang
     menempel ke penyediaan yang SAMA — layarnya menunggu pekerjaan itu. */
  return NextResponse.json(
    { queued: true, jobId: queued.jobId, attached: queued.attached },
    { status: 202 }
  );
}
