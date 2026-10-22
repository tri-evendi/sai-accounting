"use server";

/**
 * Server action REGISTER LISENSI ON-PREMISE (izin `licence.register`) dan
 * PENANDA KONSOL (izin `licence.sign`, owner saja — migration platform 0007).
 *
 * Register: catat draf, VERIFIKASI berkas luring dengan kunci publik
 * tertanam, unduh ulang arsip, catatan pencabutan.
 *
 * Penanda (keputusan pemilik 22 Okt 2026, 06-KEAMANAN §3.7): buat kunci
 * tersegel, dan tandatangani draf dengan frasa sandi yang diketik SETIAP KALI.
 * Ini SATU-SATUNYA tempat kunci penanda dibuka — `tests/licence-register-archive.test.ts`
 * menolak pengimpor lain `@sai/platform/licence-signing-key-store`. Frasa sandi
 * tidak pernah ditulis ke jejak audit, log, maupun jawaban; kunci privat tidak
 * pernah keluar dari store. Percobaan dibatasi lajunya per operator.
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getT } from "@sai/platform/i18n/server";
import { writeOperatorAuditLog } from "@op/lib/operator/audit";
import { requireOperatorActionSession } from "@op/lib/operator/guard";
import {
  licenceDraftSchema,
  licenceEntryIdSchema,
  licenceKeyCreateSchema,
  licenceRevokeSchema,
  licenceSignSchema,
  licenceUploadSchema,
} from "@op/lib/validations/operator";
import { clientIpFrom } from "@sai/core/operator-plane";
import type { DictionaryKey } from "@sai/core/i18n/dictionary";
import type { LicenceTermField } from "@sai/core/licence-register";
import { platformDb } from "@sai/platform/platform-db";
import {
  attachIssuedLicence,
  createLicenceDraft,
  discardLicenceDraft,
  markLicenceRevoked,
  readLicenceFile,
} from "@sai/platform/licence-register-store";
import {
  generateConsoleSigningKey,
  issueLicenceWithConsoleKey,
} from "@sai/platform/licence-signing-key-store";
import { checkSharedRateLimit } from "@sai/platform/rate-limit-shared";

export interface LicenceMismatchLine {
  label: string;
  expected: string;
  actual: string;
}

export interface LicenceActionResult {
  ok: boolean;
  message: string;
  /** Isian yang berbeda antara draf dan berkas — kalimat sudah diterjemahkan. */
  mismatches?: LicenceMismatchLine[];
}

export type LicenceKeyCreateResult =
  | { ok: true; message: string; fingerprint: string; publicKeyPem: string }
  | { ok: false; message: string };

export type LicenceSignResult =
  | { ok: true; message: string; fileName: string; content: string }
  | { ok: false; message: string; mismatches?: LicenceMismatchLine[] };

/**
 * Anggaran percobaan tanda tangan per operator: 10 per 15 menit. Penerbitan
 * lisensi adalah pekerjaan manusia yang jarang, jadi angka ini tidak pernah
 * terasa — tetapi sesi yang dibajak tidak bisa memakai konsol sebagai mesin
 * penebak frasa sandi (setiap tebakan juga membayar scrypt ±128 MiB).
 */
const SIGN_RATE_LIMIT = { windowMs: 15 * 60 * 1000, maxAttempts: 10 };

export type LicenceDownloadResult =
  | { ok: true; fileName: string; content: string }
  | { ok: false; message: string };

/** Peta statis isian → kunci kamus (penjaga kunci yatim membaca teks, bukan templat). */
const LABEL: Record<LicenceTermField, DictionaryKey> = {
  licenceId: "operator.licences.field.licenceId",
  customer: "operator.licences.field.customer",
  maxCompanies: "operator.licences.field.maxCompanies",
  maxUsers: "operator.licences.field.maxUsers",
  modules: "operator.licences.field.modules",
  supportEndsAt: "operator.licences.field.supportEndsOn",
  maxVersion: "operator.licences.field.maxVersion",
};

/** `YYYY-MM-DD` yang benar-benar ada di kalender (bukan 31 Februari). */
function realDate(v: string): boolean {
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function revalidate() {
  revalidatePath("/licences");
}

export async function operatorCreateLicenceDraft(input: unknown): Promise<LicenceActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("licence.register");
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const parsed = licenceDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("operator.licences.errInvalid") };
  const d = parsed.data;
  if (d.supportEndsOn && !realDate(d.supportEndsOn)) {
    return { ok: false, message: t("operator.licences.errInvalid") };
  }

  const result = await createLicenceDraft(
    { platform: platformDb },
    {
      customerId: d.customerId ? Number(d.customerId) : null,
      customer: d.customer,
      contact: d.contact,
      sourceTenantId: d.sourceTenantId ? Number(d.sourceTenantId) : null,
      maxCompanies: Number(d.maxCompanies),
      maxUsers: Number(d.maxUsers),
      modules: d.modules,
      supportEndsOn: d.supportEndsOn || null,
      maxVersion: d.maxVersion || null,
      notes: d.notes,
      actor: session.operator.name,
    }
  );
  if (result.outcome !== "ok") return { ok: false, message: t("operator.licences.errInvalid") };

  await writeOperatorAuditLog({
    operator: session.operator.name,
    action: "operator.licence.create",
    ipAddress: clientIpFrom(await headers()),
    details: {
      entryId: result.entryId,
      customerId: result.customerId,
      version: result.version,
      licenceId: result.licenceId,
      customer: d.customer,
      maxCompanies: Number(d.maxCompanies),
      maxUsers: Number(d.maxUsers),
      modules: d.modules,
      supportEndsOn: d.supportEndsOn || null,
      maxVersion: d.maxVersion || null,
    },
  });
  revalidate();
  return { ok: true, message: t("operator.licences.created") };
}

export async function operatorUploadLicenceFile(input: unknown): Promise<LicenceActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("licence.register");
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const parsed = licenceUploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("operator.licences.err.empty") };

  const result = await attachIssuedLicence(
    { platform: platformDb },
    { entryId: parsed.data.entryId, fileText: parsed.data.fileText, actor: session.operator.name }
  );
  const ip = clientIpFrom(await headers());

  if (result.outcome === "ok") {
    await writeOperatorAuditLog({
      operator: session.operator.name,
      action: "operator.licence.upload",
      ipAddress: ip,
      details: {
        entryId: parsed.data.entryId,
        licenceId: result.licenceId,
        sha256: result.sha256,
        superseded: result.superseded,
      },
    });
    revalidate();
    return { ok: true, message: t("operator.licences.uploaded") };
  }

  /* Penolakan ikut dicatat: unggahan berkas yang tanda tangannya tidak cocok
     adalah peristiwa yang layak ditinjau, bukan sekadar salah klik. */
  await writeOperatorAuditLog({
    operator: session.operator.name,
    action: "operator.licence.upload.rejected",
    ipAddress: ip,
    details: {
      entryId: parsed.data.entryId,
      outcome: result.outcome,
      ...(result.outcome === "bad_signature" ? { reason: result.reason } : {}),
      ...(result.outcome === "mismatch" ? { fields: result.mismatches.map((m) => m.field) } : {}),
    },
  });

  switch (result.outcome) {
    case "key_not_set":
      return { ok: false, message: t("operator.licences.keyNotSet") };
    case "too_large":
      return { ok: false, message: t("operator.licences.err.tooLarge") };
    case "not_found":
    case "not_draft":
      return { ok: false, message: t("operator.licences.err.notDraft") };
    case "bad_signature":
      return { ok: false, message: t("operator.licences.err.badSignature", { reason: result.reason }) };
    case "mismatch":
      return {
        ok: false,
        message: t("operator.licences.err.mismatch"),
        mismatches: result.mismatches.map((m) => ({
          label: t(LABEL[m.field]),
          expected: m.expected,
          actual: m.actual,
        })),
      };
  }
}

export async function operatorRevokeLicence(input: unknown): Promise<LicenceActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("licence.register");
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const parsed = licenceRevokeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("operator.licences.errInvalid") };

  const result = await markLicenceRevoked(
    { platform: platformDb },
    { entryId: parsed.data.entryId, reason: parsed.data.reason, actor: session.operator.name }
  );
  if (result.outcome !== "ok") return { ok: false, message: t("operator.licences.errInvalid") };

  await writeOperatorAuditLog({
    operator: session.operator.name,
    action: "operator.licence.revoke",
    ipAddress: clientIpFrom(await headers()),
    details: { entryId: parsed.data.entryId, licenceId: result.licenceId, reason: parsed.data.reason },
  });
  revalidate();
  return { ok: true, message: t("operator.licences.revoked") };
}

export async function operatorDiscardLicenceDraft(input: unknown): Promise<LicenceActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("licence.register");
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const parsed = licenceEntryIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("operator.licences.errInvalid") };

  const result = await discardLicenceDraft({ platform: platformDb }, parsed.data);
  if (result.outcome !== "ok") return { ok: false, message: t("operator.licences.err.notDraft") };

  await writeOperatorAuditLog({
    operator: session.operator.name,
    action: "operator.licence.discard",
    ipAddress: clientIpFrom(await headers()),
    details: { entryId: parsed.data.entryId, licenceId: result.licenceId },
  });
  revalidate();
  return { ok: true, message: t("operator.licences.discarded") };
}

/**
 * Unduh ulang berkas arsip. Server action, bukan route: konsol hanya
 * mengizinkan satu route unduhan (`tests/authz-coverage.test.ts`), dan berkas
 * lisensi < 1 KB teks — peramban menyusun unduhannya sendiri dari isi ini.
 */
export async function operatorDownloadLicence(input: unknown): Promise<LicenceDownloadResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("licence.register");
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const parsed = licenceEntryIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("operator.licences.errInvalid") };

  const file = await readLicenceFile({ platform: platformDb }, parsed.data.entryId);
  if (!file) return { ok: false, message: t("operator.licences.errInvalid") };

  await writeOperatorAuditLog({
    operator: session.operator.name,
    action: "operator.licence.download",
    ipAddress: clientIpFrom(await headers()),
    details: { entryId: parsed.data.entryId, licenceId: file.licenceId, sha256: file.sha256 },
  });
  return { ok: true, fileName: file.fileName, content: file.content };
}

/**
 * Buat KUNCI PENANDA tersegel (sekali). Jawabannya memuat kunci PUBLIK dan
 * sidiknya untuk ditempel ke `LICENCE_PUBLIC_KEY_PEM` — tidak pernah kunci
 * privat. Frasa sandi tidak ikut tercatat di mana pun.
 */
export async function operatorCreateLicenceSigningKey(input: unknown): Promise<LicenceKeyCreateResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("licence.sign");
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const parsed = licenceKeyCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("operator.licences.key.errPassphrase") };

  const result = await generateConsoleSigningKey(
    { platform: platformDb },
    { passphrase: parsed.data.passphrase, actor: session.operator.name }
  );
  const ip = clientIpFrom(await headers());

  if (result.outcome !== "ok") {
    await writeOperatorAuditLog({
      operator: session.operator.name,
      action: "operator.licence.key.rejected",
      ipAddress: ip,
      details: { outcome: result.outcome },
    });
    switch (result.outcome) {
      case "weak_passphrase":
        return { ok: false, message: t("operator.licences.key.errPassphrase") };
      case "key_exists":
        return { ok: false, message: t("operator.licences.key.errExists") };
      case "compiled_key_present":
        return { ok: false, message: t("operator.licences.key.errCompiled") };
    }
  }

  await writeOperatorAuditLog({
    operator: session.operator.name,
    action: "operator.licence.key.create",
    ipAddress: ip,
    details: {
      fingerprint: result.fingerprint,
      kdf: result.kdf.name,
      kdfCost: result.kdf.cost,
      kdfBlockSize: result.kdf.blockSize,
      kdfParallelism: result.kdf.parallelism,
    },
  });
  revalidate();
  return {
    ok: true,
    message: t("operator.licences.key.created"),
    fingerprint: result.fingerprint,
    publicKeyPem: result.publicKeyPem,
  };
}

/**
 * Tandatangani DRAF di konsol. Berhasil → draf menjadi `issued` lewat
 * pemeriksaan yang sama dengan unggahan luring, dan isi berkas dipulangkan
 * untuk diunduh peramban (pola `operatorDownloadLicence`).
 */
export async function operatorSignLicence(input: unknown): Promise<LicenceSignResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("licence.sign");
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const parsed = licenceSignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("operator.licences.errInvalid") };
  const { entryId, passphrase } = parsed.data;
  const ip = clientIpFrom(await headers());

  const limit = await checkSharedRateLimit(`licence-sign:${session.operator.name}`, SIGN_RATE_LIMIT);
  if (!limit.allowed) {
    await writeOperatorAuditLog({
      operator: session.operator.name,
      action: "operator.licence.sign.failed",
      ipAddress: ip,
      details: { entryId, outcome: "rate_limited" },
    });
    return { ok: false, message: t("operator.licences.sign.errRateLimited") };
  }

  const result = await issueLicenceWithConsoleKey(
    { platform: platformDb },
    { entryId, passphrase, actor: session.operator.name }
  );

  if (result.outcome === "ok") {
    await writeOperatorAuditLog({
      operator: session.operator.name,
      action: "operator.licence.sign",
      ipAddress: ip,
      details: {
        entryId,
        licenceId: result.licenceId,
        fingerprint: result.fingerprint,
        sha256: result.sha256,
        superseded: result.superseded,
      },
    });
    revalidate();
    return { ok: true, message: t("operator.licences.sign.done"), fileName: result.fileName, content: result.content };
  }

  await writeOperatorAuditLog({
    operator: session.operator.name,
    action: "operator.licence.sign.failed",
    ipAddress: ip,
    details: {
      entryId,
      outcome: result.outcome,
      fingerprint: result.fingerprint ?? null,
      ...(result.outcome === "sign_failed" ? { reason: result.reason } : {}),
      ...(result.outcome === "mismatch" ? { fields: result.mismatches.map((m) => m.field) } : {}),
    },
  });

  switch (result.outcome) {
    case "wrong_passphrase":
      /* Satu kalimat untuk frasa salah DAN segel rusak — store memang tidak
         membedakannya, dan layar tidak boleh menebak. */
      return { ok: false, message: t("operator.licences.sign.errPassphrase") };
    case "no_key":
      return { ok: false, message: t("operator.licences.sign.errNoKey") };
    case "key_not_installed":
      return { ok: false, message: t("operator.licences.sign.errNotInstalled") };
    case "key_mismatch":
      return { ok: false, message: t("operator.licences.sign.errMismatchKey") };
    case "not_found":
    case "not_draft":
      return { ok: false, message: t("operator.licences.err.notDraft") };
    case "sign_failed":
      return { ok: false, message: t("operator.licences.sign.errFailed", { reason: result.reason }) };
    case "mismatch":
      return {
        ok: false,
        message: t("operator.licences.err.mismatch"),
        mismatches: result.mismatches.map((m) => ({
          label: t(LABEL[m.field]),
          expected: m.expected,
          actual: m.actual,
        })),
      };
  }
}
