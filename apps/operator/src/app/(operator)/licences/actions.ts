"use server";

/**
 * Server action REGISTER LISENSI ON-PREMISE (izin `licence.register`).
 *
 * Tidak satu pun action di sini menandatangani apa pun, dan tidak satu pun
 * menerima kunci privat: penandatanganan terjadi di laptop luring lewat
 * `bun run licence:issue` (06-KEAMANAN §3.7). Yang ada hanya: catat draf,
 * VERIFIKASI berkas hasilnya dengan kunci publik tertanam, unduh ulang arsip,
 * dan catatan pencabutan.
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getT } from "@sai/platform/i18n/server";
import { writeOperatorAuditLog } from "@op/lib/operator/audit";
import { requireOperatorActionSession } from "@op/lib/operator/guard";
import {
  licenceDraftSchema,
  licenceEntryIdSchema,
  licenceRevokeSchema,
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
