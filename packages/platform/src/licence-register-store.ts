/**
 * Baca & tulis REGISTER LISENSI ON-PREMISE (migration platform 0006).
 *
 * SATU-SATUNYA modul yang menyentuh tabel `licence_customers` /
 * `licence_register_entries`, dan pemanggilnya hanya konsol operator. Register
 * adalah ARSIP penerbitan, bukan kewenangan: tidak satu pun kode di
 * `app-customer` boleh mengimpor modul ini atau membaca tabelnya untuk
 * memutuskan status lisensi (rancangan §8; dijaga
 * `tests/licence-register-archive.test.ts`).
 *
 * Yang dikerjakan di sini hanya MEMVERIFIKASI berkas yang ditandatangani di
 * laptop luring — dengan kunci PUBLIK yang ditanam di `@sai/core/licence`.
 * Tidak ada penandatanganan dan tidak ada kunci privat.
 *
 * Tanpa `server-only`, klien disuntik (pola `writes.ts`) supaya bisa diuji.
 */
import { randomUUID } from "node:crypto";

import type { PrismaClient as PlatformClient } from "@sai/db/client/platform";
import { LICENCE_PUBLIC_KEY_PEM, licenceKeyInstalled, verifyLicence } from "@sai/core/licence";
import {
  LICENCE_FILE_MAX_BYTES,
  compareLicenceToTerms,
  formatModules,
  licenceFileSha256,
  normaliseLicenceFile,
  parseModules,
  type LicenceEntryStatus,
  type LicenceTermMismatch,
  type LicenceTerms,
} from "@sai/core/licence-register";

type Deps = { platform: PlatformClient };

export interface LicenceEntryView {
  id: number;
  version: number;
  status: LicenceEntryStatus;
  terms: LicenceTerms;
  notes: string | null;
  fileSha256: string | null;
  issuedAt: Date | null;
  uploadedBy: string | null;
  uploadedAt: Date | null;
  revokedBy: string | null;
  revokedAt: Date | null;
  revokeReason: string | null;
  createdBy: string;
  createdAt: Date;
}

export interface LicenceCustomerView {
  id: number;
  name: string;
  contact: string | null;
  sourceTenantId: number | null;
  /** Terbaru dulu. */
  entries: LicenceEntryView[];
}

type EntryRow = {
  id: number;
  version: number;
  status: string;
  licenceId: string;
  licenseeName: string;
  maxCompanies: number;
  maxUsers: number;
  modules: string;
  supportEndsOn: Date | null;
  maxVersion: string | null;
  notes: string | null;
  fileSha256: string | null;
  issuedAt: Date | null;
  uploadedBy: string | null;
  uploadedAt: Date | null;
  revokedBy: string | null;
  revokedAt: Date | null;
  revokeReason: string | null;
  createdBy: string;
  createdAt: Date;
};

/** Kolom `DATE` datang sebagai tengah malam UTC — ambil bagian tanggalnya saja. */
const tanggal = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export function termsOf(row: Pick<EntryRow, "licenceId" | "licenseeName" | "maxCompanies" | "maxUsers" | "modules" | "supportEndsOn" | "maxVersion">): LicenceTerms {
  return {
    licenceId: row.licenceId,
    customer: row.licenseeName,
    maxCompanies: row.maxCompanies,
    maxUsers: row.maxUsers,
    /* Kolom ditulis hanya lewat `createLicenceDraft` (yang memvalidasi); bentuk
       yang tak terurai dipajang apa adanya sebagai satu "modul". */
    modules: parseModules(row.modules) ?? [row.modules],
    supportEndsOn: tanggal(row.supportEndsOn),
    maxVersion: row.maxVersion,
  };
}

function viewOf(row: EntryRow): LicenceEntryView {
  return {
    id: row.id,
    version: row.version,
    status: row.status as LicenceEntryStatus,
    terms: termsOf(row),
    notes: row.notes,
    fileSha256: row.fileSha256,
    issuedAt: row.issuedAt,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt,
    revokedBy: row.revokedBy,
    revokedAt: row.revokedAt,
    revokeReason: row.revokeReason,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

const ENTRY_SELECT = {
  id: true,
  version: true,
  status: true,
  licenceId: true,
  licenseeName: true,
  maxCompanies: true,
  maxUsers: true,
  modules: true,
  supportEndsOn: true,
  maxVersion: true,
  notes: true,
  fileSha256: true,
  issuedAt: true,
  uploadedBy: true,
  uploadedAt: true,
  revokedBy: true,
  revokedAt: true,
  revokeReason: true,
  createdBy: true,
  createdAt: true,
} as const;

/** Seluruh register, customer yang terakhir disentuh dulu. Isi berkas TIDAK ikut. */
export async function readLicenceRegister(deps: Deps): Promise<LicenceCustomerView[]> {
  const rows = await deps.platform.licenceCustomer.findMany({
    where: { isActive: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 500,
    select: {
      id: true,
      name: true,
      contact: true,
      sourceTenantId: true,
      entries: { orderBy: { version: "desc" }, select: ENTRY_SELECT },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    contact: c.contact,
    sourceTenantId: c.sourceTenantId,
    entries: c.entries.map(viewOf),
  }));
}

export interface LicenceDraftInput {
  /** Kosong = customer BARU; terisi = versi baru untuk customer itu. */
  customerId?: number | null;
  customer: string;
  contact?: string | null;
  sourceTenantId?: number | null;
  maxCompanies: number;
  maxUsers: number;
  /** `all` atau daftar berkoma — sudah lolos `parseModules`. */
  modules: string;
  supportEndsOn: string | null;
  maxVersion: string | null;
  notes?: string | null;
  actor: string;
}

export type CreateDraftResult =
  | { outcome: "ok"; entryId: number; customerId: number; version: number; licenceId: string }
  | { outcome: "invalid_modules" | "customer_not_found" };

/**
 * Buat DRAF penerbitan. Customer baru dibuat bila `customerId` kosong; bila
 * terisi, draf menjadi versi berikutnya customer itu dan nama tampilannya ikut
 * nama di lisensi terbaru.
 */
export async function createLicenceDraft(deps: Deps, input: LicenceDraftInput): Promise<CreateDraftResult> {
  const modules = parseModules(input.modules);
  if (!modules) return { outcome: "invalid_modules" };
  const licenceId = randomUUID();

  return deps.platform.$transaction(async (tx) => {
    let customerId: number;
    let version = 1;
    if (input.customerId) {
      const ada = await tx.licenceCustomer.findUnique({
        where: { id: input.customerId },
        select: { id: true, isActive: true },
      });
      if (!ada || !ada.isActive) return { outcome: "customer_not_found" as const };
      customerId = ada.id;
      const last = await tx.licenceRegisterEntry.findFirst({
        where: { customerId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      version = (last?.version ?? 0) + 1;
      await tx.licenceCustomer.update({
        where: { id: customerId },
        data: {
          name: input.customer,
          ...(input.contact !== undefined ? { contact: input.contact || null } : {}),
        },
      });
    } else {
      const baru = await tx.licenceCustomer.create({
        data: {
          name: input.customer,
          contact: input.contact || null,
          sourceTenantId: input.sourceTenantId ?? null,
          createdBy: input.actor,
        },
        select: { id: true },
      });
      customerId = baru.id;
    }

    const entry = await tx.licenceRegisterEntry.create({
      data: {
        customerId,
        version,
        status: "draft",
        licenceId,
        licenseeName: input.customer,
        maxCompanies: input.maxCompanies,
        maxUsers: input.maxUsers,
        modules: formatModules(modules),
        supportEndsOn: input.supportEndsOn ? new Date(`${input.supportEndsOn}T00:00:00.000Z`) : null,
        maxVersion: input.maxVersion || null,
        notes: input.notes || null,
        createdBy: input.actor,
      },
      select: { id: true },
    });
    return { outcome: "ok" as const, entryId: entry.id, customerId, version, licenceId };
  });
}

export type AttachResult =
  | { outcome: "ok"; licenceId: string; sha256: string; superseded: number }
  | { outcome: "key_not_set" }
  | { outcome: "not_found" }
  | { outcome: "not_draft" }
  | { outcome: "too_large" }
  | { outcome: "bad_signature"; reason: string }
  | { outcome: "mismatch"; mismatches: LicenceTermMismatch[] };

/**
 * Lampirkan berkas `.sai` hasil laptop luring ke DRAF-nya.
 *
 * Urutan pemeriksaan: kunci publik tertanam → ukuran → tanda tangan (Ed25519,
 * kunci publik di kode) → isi cocok dengan draf. Hanya bila semuanya lulus
 * draf menjadi `issued`, dan penerbitan `issued` lain milik customer yang sama
 * menjadi `superseded`.
 *
 * @param publicKeyPem HANYA untuk tes (pola `verifyLicence`).
 */
export async function attachIssuedLicence(
  deps: Deps,
  input: { entryId: number; fileText: string; actor: string },
  publicKeyPem: string = LICENCE_PUBLIC_KEY_PEM,
  now: Date = new Date()
): Promise<AttachResult> {
  if (!licenceKeyInstalled(publicKeyPem)) return { outcome: "key_not_set" };
  if (Buffer.byteLength(input.fileText, "utf8") > LICENCE_FILE_MAX_BYTES) return { outcome: "too_large" };

  const row = await deps.platform.licenceRegisterEntry.findUnique({
    where: { id: input.entryId },
    select: { ...ENTRY_SELECT, customerId: true },
  });
  if (!row) return { outcome: "not_found" };
  if (row.status !== "draft") return { outcome: "not_draft" };

  const verdict = verifyLicence(input.fileText, publicKeyPem, now);
  if (!verdict.ok) return { outcome: "bad_signature", reason: verdict.reason };

  const mismatches = compareLicenceToTerms(verdict.licence, termsOf(row));
  if (mismatches.length > 0) return { outcome: "mismatch", mismatches };

  const sha256 = licenceFileSha256(input.fileText);
  const [, lama] = await deps.platform.$transaction([
    deps.platform.licenceRegisterEntry.update({
      where: { id: row.id },
      data: {
        status: "issued",
        fileContent: normaliseLicenceFile(input.fileText),
        fileSha256: sha256,
        payloadJson: JSON.stringify(verdict.licence),
        issuedAt: new Date(verdict.licence.issuedAt),
        uploadedBy: input.actor,
        uploadedAt: now,
      },
    }),
    deps.platform.licenceRegisterEntry.updateMany({
      where: { customerId: row.customerId, status: "issued", id: { not: row.id } },
      data: { status: "superseded" },
    }),
  ]);
  return { outcome: "ok", licenceId: row.licenceId, sha256, superseded: lama.count };
}

export type RevokeResult = { outcome: "ok"; licenceId: string } | { outcome: "not_found" | "not_issued" };

/**
 * Tandai `revoked` — CATATAN SAJA. Lisensi luring tidak bisa dicabut dari
 * jauh: berkas yang sudah dipasang customer tetap sah di mesinnya. Yang
 * berubah hanya register ini (mis. kontrak diputus, berkas bocor).
 */
export async function markLicenceRevoked(
  deps: Deps,
  input: { entryId: number; reason: string; actor: string },
  now: Date = new Date()
): Promise<RevokeResult> {
  const row = await deps.platform.licenceRegisterEntry.findUnique({
    where: { id: input.entryId },
    select: { status: true, licenceId: true },
  });
  if (!row) return { outcome: "not_found" };
  if (row.status !== "issued" && row.status !== "superseded") return { outcome: "not_issued" };
  await deps.platform.licenceRegisterEntry.update({
    where: { id: input.entryId },
    data: { status: "revoked", revokedAt: now, revokedBy: input.actor, revokeReason: input.reason },
  });
  return { outcome: "ok", licenceId: row.licenceId };
}

export type DiscardResult = { outcome: "ok"; licenceId: string } | { outcome: "not_found" | "not_draft" };

/**
 * Buang DRAF (salah ketik sebelum ditandatangani). Hanya draf — penerbitan yang
 * sudah ditandatangani adalah riwayat dan tidak pernah dihapus. Customer yang
 * tinggal tanpa satu penerbitan pun ikut dihapus: ia lahir dari draf ini.
 */
export async function discardLicenceDraft(deps: Deps, input: { entryId: number }): Promise<DiscardResult> {
  const row = await deps.platform.licenceRegisterEntry.findUnique({
    where: { id: input.entryId },
    select: { status: true, licenceId: true, customerId: true },
  });
  if (!row) return { outcome: "not_found" };
  if (row.status !== "draft") return { outcome: "not_draft" };
  await deps.platform.$transaction(async (tx) => {
    await tx.licenceRegisterEntry.delete({ where: { id: input.entryId } });
    const sisa = await tx.licenceRegisterEntry.count({ where: { customerId: row.customerId } });
    if (sisa === 0) await tx.licenceCustomer.delete({ where: { id: row.customerId } });
  });
  return { outcome: "ok", licenceId: row.licenceId };
}

/** Berkas arsip untuk diunduh ulang (dikirim ulang ke customer). */
export async function readLicenceFile(
  deps: Deps,
  entryId: number
): Promise<{ fileName: string; content: string; licenceId: string; sha256: string } | null> {
  const row = await deps.platform.licenceRegisterEntry.findUnique({
    where: { id: entryId },
    select: { fileContent: true, fileSha256: true, licenceId: true },
  });
  if (!row?.fileContent || !row.fileSha256) return null;
  return {
    /* Nama yang dipasang di mesin customer adalah `licence.sai` — lihat
       docs/ONPREM-SERAH-TERIMA.md §1. */
    fileName: "licence.sai",
    content: row.fileContent,
    licenceId: row.licenceId,
    sha256: row.fileSha256,
  };
}
