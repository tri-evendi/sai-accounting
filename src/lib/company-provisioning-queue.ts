/**
 * PENYEDIAAN PT LEWAT ANTREAN — sisi `app-customer` (Okt 2026).
 *
 * `app-customer` tidak lagi membuat basis data. Ia hanya:
 *
 *   1. MENERBITKAN satu pekerjaan `company.provision` (`enqueueCompanyProvision`),
 *   2. MENJAWAB "sudah sampai mana" dari baris `jobs` + registry
 *      (`readProvisionStatus`).
 *
 * Yang membuat basis data adalah pelari jalur `interactive` di `svc-worker`
 * (`workers/company-provision.ts` → `src/lib/company-provisioning.ts`) —
 * satu-satunya layanan yang hidup terus dan memegang kredensial PEMILIK
 * (`PROVISION_DATABASE_URL`). Alasannya di kepala `company-provisioning.ts`;
 * penjaganya `tests/provisioning-off-app-customer.test.ts`.
 *
 * ══ TIGA JANJI YANG DIPERTAHANKAN DARI VERSI HTTP ══════════════════════════
 *
 *  • **Registry paling akhir.** Perusahaan baru TERDAFTAR hanya sesudah
 *    basis datanya ada, skemanya lengkap, dan peran aplikasi dihibahi hak —
 *    urutan itu tetap milik `provisionCompany`, tidak disentuh di sini.
 *  • **Klik ganda = satu basis data.** Kunci dedupe = nama basis data
 *    (`provisionDedupeKey`). Penerbitan kedua selama yang pertama masih aktif
 *    tidak melahirkan pekerjaan kedua: ia MENEMPEL ke yang sudah ada, dan
 *    layarnya menunggu pekerjaan yang sama.
 *  • **Gagal → aman diulang.** Kunci dari pekerjaan yang sudah berakhir dilepas
 *    sebelum menerbitkan (`releaseFinishedDedupeKey`), dan pengulangan
 *    melanjutkan buku setengah jadi alih-alih menolaknya.
 *
 * ══ YANG TIDAK PERNAH MENYEBERANG KE LAYAR ═════════════════════════════════
 * `payload` dan `last_error` dibaca di sini lalu dibuang. Kegagalan sampai ke
 * pengguna sebagai KODE yang dikalimatkan kamus (`provisionErrorMessage`) —
 * teks driver (SQLSTATE, nama peran, pernyataan SQL) tetap di log dan konsol.
 */
import "server-only";

import { controlDb } from "@sai/core/control-db";
import { DEFAULT_LEGAL_FORM, isLegalForm, type LegalForm } from "@sai/core/legal-form";
import {
  jobStatus,
  publishJob,
  releaseFinishedDedupeKey,
} from "@sai/platform/job-queue";
import {
  decodeProvisionFailure,
  normalizeSlug,
  phaseFromProgress,
  ProvisionError,
  provisionDedupeKey,
  provisionErrorMessage,
  resolveDatabaseName,
  type ProvisionPhase,
} from "@/lib/company-provisioning-shared";

/**
 * Muatan `company.provision` — PARAMETER permintaan, bukan keputusan.
 *
 * `tenantId` SENGAJA tidak di sini: ia kolom `jobs.tenant_id`, diisi dari
 * penjaga tenant saat menerbitkan, dan pekerja membacanya dari kolom itu.
 * Peran pembuat di PT baru juga tidak: itu keputusan pekerja (konstanta
 * `ROLES.ADMINISTRATOR`), bukan nilai yang bisa dititipkan penerbit.
 */
export interface ProvisionJobPayload {
  slug: string;
  name: string;
  /** Eksplisit (basis data dibuat administrator lebih dulu) — atau tidak ada. */
  databaseName?: string;
  /** Bentuk usaha (24 Okt 2026). Tidak ada = `pt` (muatan dari versi lama). */
  legalForm?: LegalForm;
  /** Pengguna pembuat; ia menjadi anggota pertama PT baru. */
  createdByUserId: number;
  /** Aktor untuk jejak audit yang ditulis PEKERJA (tidak ada permintaan HTTP di sana). */
  actor: {
    userId: string;
    username: string;
    tenantRole: string;
    tenantSlug: string;
    ipAddress: string | null;
  };
}

/**
 * Urai muatan dari baris `jobs`. Pekerja tidak memercayai bentuknya — baris
 * itu ditulis `app-customer`, layanan yang menghadap internet — jadi bentuk
 * yang salah MELEMPAR, tidak pernah ditebak.
 */
export function parseProvisionPayload(raw: unknown): ProvisionJobPayload {
  const p = (raw ?? {}) as Record<string, unknown>;
  const a = (p.actor ?? {}) as Record<string, unknown>;
  const str = (v: unknown, nama: string): string => {
    if (typeof v !== "string" || v.trim() === "") throw new Error(`muatan company.provision: \`${nama}\` tidak sah`);
    return v;
  };
  if (typeof p.createdByUserId !== "number" || !Number.isInteger(p.createdByUserId) || p.createdByUserId <= 0) {
    throw new Error("muatan company.provision: `createdByUserId` tidak sah");
  }
  if (p.databaseName !== undefined && typeof p.databaseName !== "string") {
    throw new Error("muatan company.provision: `databaseName` tidak sah");
  }
  /* Nilai di luar kosakata MELEMPAR, tidak jatuh ke `pt`: muatan yang salah
     bentuk bukan muatan versi lama. Yang tidak menyebutnya sama sekali — itu
     muatan versi lama — menjadi PT. */
  if (p.legalForm !== undefined && !isLegalForm(p.legalForm)) {
    throw new Error("muatan company.provision: `legalForm` tidak sah");
  }
  return {
    slug: str(p.slug, "slug"),
    name: str(p.name, "name"),
    databaseName: (p.databaseName as string | undefined) || undefined,
    legalForm: (p.legalForm as LegalForm | undefined) ?? DEFAULT_LEGAL_FORM,
    createdByUserId: p.createdByUserId,
    actor: {
      userId: str(a.userId, "actor.userId"),
      username: str(a.username, "actor.username"),
      tenantRole: str(a.tenantRole, "actor.tenantRole"),
      tenantSlug: str(a.tenantSlug, "actor.tenantSlug"),
      ipAddress: typeof a.ipAddress === "string" ? a.ipAddress : null,
    },
  };
}

export type EnqueueResult =
  | { ok: true; jobId: number; attached: boolean }
  /** Kunci dedupe dipegang pekerjaan TENANT LAIN (hanya mungkin lewat nama eksplisit). */
  | { ok: false };

/**
 * Terbitkan satu penyediaan — atau menempel ke penyediaan AKTIF untuk basis
 * data yang sama milik tenant ini.
 */
export async function enqueueCompanyProvision(
  tenantId: number,
  payload: ProvisionJobPayload
): Promise<EnqueueResult> {
  const databaseName = resolveDatabaseName(tenantId, normalizeSlug(payload.slug), payload.databaseName);
  const dedupeKey = provisionDedupeKey(databaseName);

  /* Dua putaran: pekerjaan lama bisa berakhir TEPAT di antara pelepasan kunci
     dan penerbitan, dan putaran kedua melepasnya lagi. Lebih dari itu bukan
     balapan, melainkan sesuatu yang perlu dilihat orang. */
  for (let putaran = 0; putaran < 2; putaran++) {
    await releaseFinishedDedupeKey(dedupeKey);
    const row = await publishJob({
      kind: "company.provision",
      tenantId,
      payload: payload as unknown as Record<string, unknown>,
      dedupeKey,
    });
    if (row) return { ok: true, jobId: row.id, attached: false };

    const existing = await jobStatus({ dedupeKey });
    if (!existing) continue;
    if (existing.kind !== "company.provision" || existing.tenantId !== tenantId) return { ok: false };
    if (existing.status !== "done" && existing.status !== "dead") {
      return { ok: true, jobId: existing.id, attached: true };
    }
  }
  return { ok: false };
}

/** Status penyediaan seperti yang DIBACA layar — tanpa muatan, tanpa teks log. */
export type ProvisionStatus =
  | { state: "queued"; waitingSeconds: number }
  | { state: "running"; phase: ProvisionPhase | null; migrateProgress?: number }
  | { state: "done"; companyId: number; slug: string }
  | {
      state: "failed";
      phase: ProvisionPhase;
      error: ReturnType<typeof provisionErrorMessage>;
    };

/**
 * Status satu pekerjaan penyediaan, DILIHAT DARI TENANT `tenantId`.
 *
 * `null` untuk pekerjaan yang tidak ada, bukan penyediaan, atau milik tenant
 * lain — tiga jawaban yang sengaja tidak bisa dibedakan pemanggilnya.
 *
 * ══ REGISTRY YANG MEMUTUSKAN "SELESAI", BUKAN STATUS PEKERJAAN ═════════════
 * Perusahaan yang SUDAH terdaftar adalah perusahaan yang jadi, apa pun yang
 * terjadi pada barisnya sesudah itu (pekerja mati di antara registry dan
 * `completeJob` → baris `dead`, padahal bukunya lengkap). Yang dicocokkan:
 * tenant + slug + nama basis data, DAN lahir sesudah pekerjaan diterbitkan —
 * supaya slug yang sudah lama terpakai tidak terbaca sebagai "baru selesai".
 */
export async function readProvisionStatus(
  jobId: number,
  tenantId: number,
  now: Date = new Date()
): Promise<ProvisionStatus | null> {
  const row = await jobStatus({ id: jobId });
  if (!row || row.kind !== "company.provision" || row.tenantId !== tenantId) return null;

  let payload: ProvisionJobPayload;
  try {
    payload = parseProvisionPayload(row.payload);
  } catch {
    return null;
  }
  const slug = normalizeSlug(payload.slug);
  const databaseName = resolveDatabaseName(tenantId, slug, payload.databaseName);

  const company = await controlDb.company.findFirst({
    where: { tenantId, slug, databaseName, createdAt: { gte: row.createdAt } },
    select: { id: true, slug: true },
  });
  if (company) return { state: "done", companyId: company.id, slug: company.slug };

  const { phase, migrateProgress } = phaseFromProgress(row.progress);
  switch (row.status) {
    case "queued":
      /* `failed` yang menunggu percobaan ulang kembali ke `queued` dengan
         `attempts > 0` — itu sedang berjalan dari sudut pandang penunggu. */
      if (row.attempts > 0) return { state: "running", phase, migrateProgress };
      return {
        state: "queued",
        waitingSeconds: Math.max(0, Math.round((now.getTime() - row.createdAt.getTime()) / 1000)),
      };
    case "claimed":
    case "failed":
      return { state: "running", phase, migrateProgress };
    case "done":
    case "dead": {
      /* `done` tanpa perusahaan terdaftar: bukunya dihapus sesudahnya, atau
         sesuatu yang lebih aneh — bukan keberhasilan yang bisa dibuka. */
      const decoded = decodeProvisionFailure(row.lastError);
      const failedPhase = decoded.phase ?? phase ?? "validate";
      const error = decoded.code
        ? provisionErrorMessage(
            new ProvisionError("", failedPhase, { code: decoded.code, values: decoded.values })
          )
        : provisionErrorMessage(null);
      return { state: "failed", phase: failedPhase === "done" ? "register" : failedPhase, error };
    }
  }
}
