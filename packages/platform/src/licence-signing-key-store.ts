/**
 * KUNCI PENANDA LISENSI di konsol (migration platform 0007; keputusan pemilik
 * 22 Okt 2026) — buat kunci tersegel, dan tandatangani DRAF register dengan
 * frasa sandi yang diketik operator.
 *
 * SATU-SATUNYA modul yang menyentuh tabel `licence_signing_keys`, dan
 * pengimpornya hanya server action `/licences` di konsol operator. Tidak satu
 * pun kode `app-customer` boleh mengimpornya (dijaga
 * `tests/licence-register-archive.test.ts`).
 *
 * ══ TIGA INVARIAN ══════════════════════════════════════════════════════════
 * 1. **Satu kunci aktif, dan tidak dibuat bila kunci tertanam sudah ada.**
 *    Kunci kedua berarti lisensi yang ditandatangani kunci pertama tidak lagi
 *    terverifikasi oleh rilis yang memuat kunci kedua (alasan yang sama dengan
 *    penolakan menimpa di `licence:keygen`). Kunci tertanam yang sudah ada
 *    (jalur luring) berarti kunci konsol tidak akan pernah cocok dengannya.
 * 2. **Hanya menandatangani bila sidik kunci aktif = sidik kunci tertanam**
 *    (`LICENCE_PUBLIC_KEY_PEM`). Konsol tidak pernah menerbitkan lisensi yang
 *    tidak diterima kode yang berjalan — dan pemasangan on-premise tetap
 *    memverifikasi terhadap konstanta di kode, tidak pernah terhadap baris ini.
 * 3. **Kunci privat & frasa sandi tidak pernah dipulangkan atau dicatat.**
 *    Hasil fungsi di sini hanya memuat sidik, PEM publik, dan berkas lisensi.
 *
 * Penandatanganan berakhir di `attachIssuedLicence` — pemeriksaan yang SAMA
 * dengan unggahan berkas luring (verifikasi kunci tertanam + cocok dengan
 * draf), jadi dua jalur tidak bisa menyimpang.
 *
 * Tanpa `server-only`, klien disuntik (pola `licence-register-store.ts`)
 * supaya bisa diuji.
 */
import type { PrismaClient as PlatformClient } from "@sai/db/client/platform";
import { LICENCE_PUBLIC_KEY_PEM, licenceKeyInstalled } from "@sai/core/licence";
import { licenceFromTerms, type LicenceTermMismatch } from "@sai/core/licence-register";

import { attachIssuedLicence, readLicenceEntryTerms } from "./licence-register-store";
import {
  DEFAULT_SIGNING_KDF,
  createSealedSigningKey,
  openSealedSigningKey,
  passphraseProblem,
  publicKeyFingerprint,
  signLicenceFile,
  type SealedSigningKey,
  type SigningKdf,
} from "./licence-signing";

type Deps = { platform: PlatformClient };

/** Bagaimana kunci konsol berdiri terhadap kunci yang ditanam di kode. */
export type CompiledKeyRelation = "not_set" | "matches" | "differs";

export interface SigningKeyView {
  fingerprint: string;
  publicKeyPem: string;
  createdBy: string;
  createdAt: Date;
}

export interface SigningKeyStatus {
  key: SigningKeyView | null;
  compiled: CompiledKeyRelation;
  /** Sidik kunci tertanam — `null` bila belum ditanam atau tak terbaca. */
  compiledFingerprint: string | null;
}

function compiledFingerprintOf(compiledPem: string): string | null {
  if (!licenceKeyInstalled(compiledPem)) return null;
  try {
    return publicKeyFingerprint(compiledPem);
  } catch {
    return null;
  }
}

function relationOf(keyFingerprint: string | null, compiledPem: string): CompiledKeyRelation {
  const compiled = compiledFingerprintOf(compiledPem);
  if (compiled === null) return "not_set";
  return keyFingerprint !== null && keyFingerprint === compiled ? "matches" : "differs";
}

/** Keadaan kunci untuk layar — TANPA kolom segel. */
export async function readSigningKeyStatus(
  deps: Deps,
  compiledPem: string = LICENCE_PUBLIC_KEY_PEM
): Promise<SigningKeyStatus> {
  const row = await deps.platform.licenceSigningKey.findFirst({
    where: { isActive: true },
    select: { fingerprint: true, publicKeyPem: true, createdBy: true, createdAt: true },
  });
  return {
    key: row,
    compiled: relationOf(row?.fingerprint ?? null, compiledPem),
    compiledFingerprint: compiledFingerprintOf(compiledPem),
  };
}

export type GenerateKeyResult =
  | { outcome: "ok"; fingerprint: string; publicKeyPem: string; kdf: SigningKdf }
  | { outcome: "weak_passphrase" | "key_exists" | "compiled_key_present" };

const isUniqueViolation = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";

/**
 * Buat pasangan kunci baru, segel dengan frasa sandi, simpan. Kunci privat
 * hanya pernah ada di memori proses ini, di dalam `createSealedSigningKey`.
 *
 * @param kdf HANYA untuk tes (parameter lebih murah); produksi memakai bawaan.
 */
export async function generateConsoleSigningKey(
  deps: Deps,
  input: { passphrase: string; actor: string },
  compiledPem: string = LICENCE_PUBLIC_KEY_PEM,
  kdf: SigningKdf = DEFAULT_SIGNING_KDF
): Promise<GenerateKeyResult> {
  if (passphraseProblem(input.passphrase)) return { outcome: "weak_passphrase" };
  if (licenceKeyInstalled(compiledPem)) return { outcome: "compiled_key_present" };

  const existing = await deps.platform.licenceSigningKey.count({ where: { isActive: true } });
  if (existing > 0) return { outcome: "key_exists" };

  const sealed = await createSealedSigningKey(input.passphrase, kdf);
  try {
    await deps.platform.licenceSigningKey.create({
      data: {
        fingerprint: sealed.fingerprint,
        publicKeyPem: sealed.publicKeyPem,
        kdfName: sealed.kdf.name,
        kdfCost: sealed.kdf.cost,
        kdfBlockSize: sealed.kdf.blockSize,
        kdfParallelism: sealed.kdf.parallelism,
        kdfSalt: sealed.kdf.salt,
        privateKeyCiphertext: sealed.ciphertext,
        privateKeyIv: sealed.iv,
        privateKeyTag: sealed.tag,
        isActive: true,
        createdBy: input.actor,
      },
    });
  } catch (e) {
    /* Dua operator menekan tombol bersamaan: indeks unik parsial yang
       memutuskan, dan yang kalah mendapat jawaban yang sama dengan "sudah ada". */
    if (isUniqueViolation(e)) return { outcome: "key_exists" };
    throw e;
  }
  const { name, cost, blockSize, parallelism } = sealed.kdf;
  return {
    outcome: "ok",
    fingerprint: sealed.fingerprint,
    publicKeyPem: sealed.publicKeyPem,
    kdf: { name, cost, blockSize, parallelism },
  };
}

export type ConsoleSignResult =
  | {
      outcome: "ok";
      licenceId: string;
      fingerprint: string;
      sha256: string;
      superseded: number;
      fileName: string;
      content: string;
    }
  | { outcome: "no_key" | "key_not_installed" | "not_found" | "not_draft"; fingerprint?: string }
  | { outcome: "key_mismatch" | "wrong_passphrase"; fingerprint: string }
  | { outcome: "sign_failed"; fingerprint: string; reason: string }
  | { outcome: "mismatch"; fingerprint: string; mismatches: LicenceTermMismatch[] };

/**
 * Tandatangani DRAF `entryId` dengan kunci konsol.
 *
 * Urutan: draf ada & masih draf → kunci aktif ada → sidiknya = kunci tertanam
 * → segel terbuka dengan frasa sandi → tanda tangan diverifikasi dengan kunci
 * tertanam → `attachIssuedLicence` (verifikasi + cocok draf + catat terbit).
 * Pemeriksaan yang murah dan tidak menyentuh rahasia didahulukan, jadi frasa
 * sandi tidak pernah diuji terhadap draf yang toh akan ditolak.
 *
 * @param compiledPem kunci tertanam — produksi memakai bawaan; tes menyuntik.
 */
export async function issueLicenceWithConsoleKey(
  deps: Deps,
  input: { entryId: number; passphrase: string; actor: string },
  compiledPem: string = LICENCE_PUBLIC_KEY_PEM,
  now: Date = new Date()
): Promise<ConsoleSignResult> {
  const entry = await readLicenceEntryTerms(deps, input.entryId);
  if (!entry) return { outcome: "not_found" };
  if (entry.status !== "draft") return { outcome: "not_draft" };

  const keyRow = await deps.platform.licenceSigningKey.findFirst({ where: { isActive: true } });
  if (!keyRow) return { outcome: "no_key" };
  const fingerprint = keyRow.fingerprint;

  const relation = relationOf(fingerprint, compiledPem);
  if (relation === "not_set") return { outcome: "key_not_installed", fingerprint };
  if (relation === "differs") return { outcome: "key_mismatch", fingerprint };

  const sealed: SealedSigningKey = {
    fingerprint,
    publicKeyPem: keyRow.publicKeyPem,
    kdf: {
      name: keyRow.kdfName as SigningKdf["name"],
      cost: keyRow.kdfCost,
      blockSize: keyRow.kdfBlockSize,
      parallelism: keyRow.kdfParallelism,
      salt: keyRow.kdfSalt,
    },
    ciphertext: keyRow.privateKeyCiphertext,
    iv: keyRow.privateKeyIv,
    tag: keyRow.privateKeyTag,
  };

  const privateKey = await openSealedSigningKey(sealed, input.passphrase);
  if (!privateKey) return { outcome: "wrong_passphrase", fingerprint };

  const signed = signLicenceFile(licenceFromTerms(entry.terms, now), privateKey, compiledPem);
  if (!signed.ok) return { outcome: "sign_failed", fingerprint, reason: signed.reason };

  const attached = await attachIssuedLicence(
    deps,
    { entryId: input.entryId, fileText: signed.file, actor: input.actor },
    compiledPem,
    now
  );
  switch (attached.outcome) {
    case "ok":
      return {
        outcome: "ok",
        licenceId: attached.licenceId,
        fingerprint,
        sha256: attached.sha256,
        superseded: attached.superseded,
        /* Nama yang dipasang di mesin customer — docs/ONPREM-SERAH-TERIMA.md §1. */
        fileName: "licence.sai",
        content: `${signed.file}\n`,
      };
    case "mismatch":
      return { outcome: "mismatch", fingerprint, mismatches: attached.mismatches };
    case "bad_signature":
      return { outcome: "sign_failed", fingerprint, reason: attached.reason };
    case "key_not_set":
      return { outcome: "key_not_installed", fingerprint };
    case "too_large":
      return { outcome: "sign_failed", fingerprint, reason: "berkas melampaui batas ukuran" };
    case "not_found":
    case "not_draft":
      return { outcome: attached.outcome, fingerprint };
  }
}
