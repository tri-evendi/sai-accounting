/**
 * AKUN OPERATOR BASIS DATA (migration kendali 0004) — baca untuk login dan
 * penjaga, tulis untuk layar `/operator/accounts`.
 *
 * Tanpa `server-only` dan klien DISUNTIK (pola `writes.ts`): aturannya diuji
 * dengan fake in-memory. Yang menulis jejak audit operator adalah PEMANGGIL
 * (server action), sama seperti aksi konsol lainnya.
 *
 * ══ DUA ATURAN YANG MENCEGAH TERKUNCI ══════════════════════════════════════
 *   1. Operator tidak bisa MENONAKTIFKAN atau MENURUNKAN PERAN akunnya
 *      sendiri. Cara tercepat kehilangan konsol adalah satu klik pada baris
 *      milik sendiri.
 *   2. Perubahan yang menyisakan NOL owner aktif DITOLAK — owner = akun env
 *      (selalu owner) + akun basis data `owner` yang aktif. Tanpa owner tidak
 *      ada yang bisa memulihkan peran siapa pun dari layar.
 */
import { randomBytes } from "node:crypto";
import { hash } from "bcrypt";

import type { PrismaClient as ControlClient } from "@sai/db/client/control";
import { openSecret, sealSecret, encryptionKeyAvailable } from "@sai/core/settings-crypto";
import { NAME_PATTERN, type DbOperatorCredential } from "./credentials";
import type { DbOperatorState } from "./identity";
import { isOperatorRole, type OperatorRole } from "./roles";
import { otpauthUri, randomTotpSecret } from "./totp";

/** Penerbit di aplikasi authenticator — SAMA dengan `scripts/operator-credential.ts`. */
export const TOTP_ISSUER = "SAI Operator";

const BCRYPT_COST = 12;

type Deps = { control: ControlClient };

/* ── Baca: penjaga & login ────────────────────────────────────────────────── */

export async function lookupDbOperatorState(
  deps: Deps,
  name: string
): Promise<DbOperatorState | null> {
  return deps.control.operatorAccount.findUnique({
    where: { name: name.toLowerCase() },
    select: { id: true, name: true, role: true, isActive: true, sessionVersion: true },
  });
}

/**
 * Kredensial untuk verifikasi login: HANYA akun aktif, rahasia TOTP sudah
 * dibuka. Rahasia yang tidak bisa dibuka (kunci hilang/berganti, baris
 * rusak) → `null` + log: akun itu tidak bisa masuk, akun lain tidak terdampak.
 */
export async function findDbOperatorCredential(
  deps: Deps,
  name: string
): Promise<DbOperatorCredential | null> {
  const row = await deps.control.operatorAccount.findUnique({ where: { name: name.toLowerCase() } });
  if (!row || !row.isActive || !isOperatorRole(row.role)) return null;
  let totpSecret: string;
  try {
    totpSecret = openSecret({ ciphertext: row.totpCiphertext, iv: row.totpIv, tag: row.totpTag });
  } catch (error) {
    console.error(`[operator] rahasia TOTP akun ${row.name} tidak bisa dibuka:`, error);
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    passwordHash: row.passwordHash,
    totpSecret,
    sessionVersion: row.sessionVersion,
  };
}

export async function recordOperatorLogin(deps: Deps, id: number, now: Date = new Date()) {
  await deps.control.operatorAccount.update({ where: { id }, data: { lastLoginAt: now } });
}

export interface OperatorAccountRow {
  id: number;
  name: string;
  role: string;
  isActive: boolean;
  sessionVersion: number;
  lastLoginAt: Date | null;
  createdBy: string;
  createdAt: Date;
}

export async function listOperatorAccounts(deps: Deps): Promise<OperatorAccountRow[]> {
  return deps.control.operatorAccount.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      role: true,
      isActive: true,
      sessionVersion: true,
      lastLoginAt: true,
      createdBy: true,
      createdAt: true,
    },
  });
}

/* ── Tulis ────────────────────────────────────────────────────────────────── */

/** Kredensial yang ditampilkan SEKALI. Tidak disimpan dalam bentuk ini di mana pun. */
export interface IssuedCredential {
  name: string;
  password: string;
  totpSecret: string;
  otpauthUri: string;
}

async function freshCredential(name: string) {
  /* 18 byte → 24 karakter base64url: ~144 bit, tanpa karakter yang perlu
     di-escape saat disalin. */
  const password = randomBytes(18).toString("base64url");
  const totpSecret = randomTotpSecret();
  const sealed = sealSecret(totpSecret);
  return {
    issued: { name, password, totpSecret, otpauthUri: otpauthUri(TOTP_ISSUER, name, totpSecret) },
    data: {
      passwordHash: await hash(password, BCRYPT_COST),
      totpCiphertext: sealed.ciphertext,
      totpIv: sealed.iv,
      totpTag: sealed.tag,
    },
  };
}

export type CreateOperatorResult =
  | { outcome: "created"; credential: IssuedCredential; id: number }
  | { outcome: "name_invalid" }
  | { outcome: "role_invalid" }
  /** Nama sudah dipakai akun ENV — env akan selalu menang saat masuk. */
  | { outcome: "env_name" }
  | { outcome: "name_taken" }
  /** `SETTINGS_ENCRYPTION_KEY` tidak layak: rahasia TOTP tidak bisa disegel. */
  | { outcome: "key_missing" };

export async function createOperatorAccount(
  deps: Deps,
  input: { name: string; role: string; actor: string; envNames: string[] }
): Promise<CreateOperatorResult> {
  const name = input.name.trim().toLowerCase();
  if (!NAME_PATTERN.test(name)) return { outcome: "name_invalid" };
  if (!isOperatorRole(input.role)) return { outcome: "role_invalid" };
  if (input.envNames.some((n) => n.toLowerCase() === name)) return { outcome: "env_name" };
  if (!encryptionKeyAvailable()) return { outcome: "key_missing" };

  const { issued, data } = await freshCredential(name);
  try {
    const row = await deps.control.operatorAccount.create({
      data: { name, role: input.role, createdBy: input.actor.slice(0, 100), ...data },
      select: { id: true },
    });
    return { outcome: "created", credential: issued, id: row.id };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { outcome: "name_taken" };
    throw error;
  }
}

export type OperatorAccountChange =
  | { kind: "role"; role: OperatorRole }
  | { kind: "deactivate" }
  | { kind: "activate" }
  /** Cabut SEMUA sesi akun ini — naikkan `session_version`. */
  | { kind: "revoke" }
  /** Kata sandi + TOTP baru (ditampilkan sekali); sesi lama ikut dicabut. */
  | { kind: "reset" };

export type UpdateOperatorResult =
  | { outcome: "updated"; name: string; credential?: IssuedCredential; before: { role: string; isActive: boolean } }
  | { outcome: "not_found" }
  | { outcome: "self_lockout" }
  | { outcome: "last_owner" }
  | { outcome: "key_missing" }
  | { outcome: "unchanged" };

/** Apakah akun sesudah perubahan masih owner aktif. */
function remainsActiveOwner(
  before: { role: string; isActive: boolean },
  change: OperatorAccountChange
): boolean {
  const role = change.kind === "role" ? change.role : before.role;
  const isActive =
    change.kind === "deactivate" ? false : change.kind === "activate" ? true : before.isActive;
  return role === "owner" && isActive;
}

export async function updateOperatorAccount(
  deps: Deps,
  input: { id: number; change: OperatorAccountChange; actor: string; envOwnerCount: number }
): Promise<UpdateOperatorResult> {
  const row = await deps.control.operatorAccount.findUnique({
    where: { id: input.id },
    select: { id: true, name: true, role: true, isActive: true },
  });
  if (!row) return { outcome: "not_found" };
  const before = { role: row.role, isActive: row.isActive };
  const { change } = input;

  const self = row.name === input.actor.toLowerCase();
  if (self && (change.kind === "deactivate" || (change.kind === "role" && change.role !== row.role))) {
    return { outcome: "self_lockout" };
  }

  if (change.kind === "role" && change.role === row.role) return { outcome: "unchanged" };
  if (change.kind === "activate" && row.isActive) return { outcome: "unchanged" };
  if (change.kind === "deactivate" && !row.isActive) return { outcome: "unchanged" };

  const wasOwner = before.role === "owner" && before.isActive;
  if (wasOwner && !remainsActiveOwner(before, change)) {
    const otherDbOwners = await deps.control.operatorAccount.count({
      where: { role: "owner", isActive: true, id: { not: row.id } },
    });
    if (otherDbOwners + input.envOwnerCount === 0) return { outcome: "last_owner" };
  }

  if (change.kind === "reset") {
    if (!encryptionKeyAvailable()) return { outcome: "key_missing" };
    const { issued, data } = await freshCredential(row.name);
    await deps.control.operatorAccount.update({
      where: { id: row.id },
      data: { ...data, sessionVersion: { increment: 1 } },
    });
    return { outcome: "updated", name: row.name, credential: issued, before };
  }

  await deps.control.operatorAccount.update({
    where: { id: row.id },
    data:
      change.kind === "role"
        ? { role: change.role }
        : change.kind === "deactivate"
          ? /* Nonaktif juga MENCABUT sesinya — penjaga sudah menolak akun
               nonaktif, tetapi versi yang naik membuat mengaktifkan kembali
               tidak menghidupkan token lama. */
            { isActive: false, sessionVersion: { increment: 1 } }
          : change.kind === "activate"
            ? { isActive: true }
            : { sessionVersion: { increment: 1 } },
  });
  return { outcome: "updated", name: row.name, before };
}
