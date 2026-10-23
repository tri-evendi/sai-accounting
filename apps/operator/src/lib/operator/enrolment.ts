/**
 * MASUK KONSOL + PEMASANGAN AUTHENTICATOR WAJIB.
 *
 * ══ TIGA JALUR ═════════════════════════════════════════════════════════════
 *   • `OPERATOR_MFA=off` → kata sandi saja, seperti sebelumnya.
 *   • MFA hidup, akun SUDAH terkonfirmasi untuk rahasia yang berlaku →
 *     kata sandi + kode TOTP. Kode salah/kosong = gagal seragam.
 *   • MFA hidup, akun BELUM terkonfirmasi (belum pernah, atau rahasianya sudah
 *     berganti sejak konfirmasi terakhir) → kata sandi benar menerbitkan SESI
 *     PEMASANGAN (`session.ts`), bukan sesi konsol. Sesi itu hanya membuka
 *     `/login/authenticator`: QR + rahasia teks, satu kode, lalu sesi konsol.
 *
 * "Terkonfirmasi" dibaca dari jejak audit (sidik rahasia — lihat
 * `authenticator.ts`), jadi tidak ada kolom baru dan tidak ada yang harus
 * ingat membersihkan apa pun ketika rahasianya diganti.
 *
 * ══ RISIKO YANG DITERIMA ═══════════════════════════════════════════════════
 * Sampai sebuah akun memasang authenticator, siapa pun yang tahu kata
 * sandinya bisa memasang ponselnya sendiri (pertukaran baku pemasangan
 * pertama). Batasnya: pemasangan HANYA untuk akun yang belum terkonfirmasi
 * untuk rahasia yang berlaku, setiap langkahnya tercatat
 * (`operator.authenticator.enroll.*`), dan konfirmasi yang tak terbaca
 * (jejak audit mati) dibaca SUDAH terkonfirmasi — gagal-tertutup: akun yang
 * belum memasang tidak bisa masuk selama itu, tetapi rahasia akun yang sudah
 * memasang tidak pernah dipajang ke orang yang hanya tahu kata sandinya.
 * Akun terkonfirmasi yang butuh ponsel baru memutar rahasia sambil masuk
 * (`/accounts/authenticator`) atau diatur ulang pemilik.
 *
 * Sumber disuntik (pola `authenticator.ts`) supaya setiap cabang teruji di
 * `tests/operator-enrolment.test.ts`.
 */
import {
  mfaDisabled,
  parseOperatorAccounts,
  verifyOperatorPassword,
  type DbOperatorCredential,
  type VerifiedOperator,
} from "./credentials";
import { secretFingerprint } from "./authenticator";
import type { OperatorEnrolmentPayload } from "./session";
import { verifyTotp } from "./totp";

/** Konfirmasi satu akun dari jejak (`readAuthenticatorConfirmationsFor`). */
export type ConfirmationsReader = (name: string) => Promise<{ operator: string; fingerprint: string }[]>;

/** Sudah terkonfirmasi untuk sidik ini? Pembaca yang MELEMPAR = ya (gagal-tertutup). */
export async function isConfirmedFor(
  read: ConfirmationsReader,
  name: string,
  fingerprint: string
): Promise<boolean> {
  try {
    const rows = await read(name);
    return rows.some((r) => r.operator.toLowerCase() === name.toLowerCase() && r.fingerprint === fingerprint);
  } catch (error) {
    console.error("[operator] konfirmasi authenticator tak terbaca, kode tetap diminta:", error);
    return true;
  }
}

export interface LoginFlowDeps {
  accountsRaw?: string;
  findDbAccount?: (name: string) => Promise<DbOperatorCredential | null>;
  readConfirmations: ConfirmationsReader;
  now?: Date;
}

export type LoginDecision =
  /** Terbitkan sesi konsol. */
  | { kind: "session"; account: VerifiedOperator }
  /** Terbitkan sesi pemasangan untuk rahasia bersidik ini. */
  | { kind: "enrol"; account: VerifiedOperator; fingerprint: string }
  /** Gagal seragam. */
  | { kind: "denied" };

export async function decideOperatorLogin(
  deps: LoginFlowDeps,
  input: { username: string; password: string; totpCode: string }
): Promise<LoginDecision> {
  const checked = await verifyOperatorPassword({
    username: input.username,
    password: input.password,
    accountsRaw: deps.accountsRaw,
    findDbAccount: deps.findDbAccount,
  });

  if (mfaDisabled()) return checked ? { kind: "session", account: checked.account } : { kind: "denied" };
  if (!checked) return { kind: "denied" };

  const fingerprint = secretFingerprint(checked.totpSecret);
  if (await isConfirmedFor(deps.readConfirmations, checked.account.name, fingerprint)) {
    return verifyTotp(checked.totpSecret, input.totpCode.trim(), deps.now)
      ? { kind: "session", account: checked.account }
      : { kind: "denied" };
  }
  return { kind: "enrol", account: checked.account, fingerprint };
}

/* ── Halaman pemasangan ───────────────────────────────────────────────────── */

export interface EnrolmentContext {
  account: VerifiedOperator;
  /** Rahasia yang dipajang — tidak pernah dicatat. */
  secret: string;
  fingerprint: string;
}

/**
 * Token pemasangan yang SAH → konteks yang masih berlaku, atau null.
 *
 * Diperiksa ulang pada setiap tampilan DAN setiap kiriman kode, karena
 * sepuluh menit cukup untuk banyak hal berubah: akun dinonaktifkan atau
 * diatur ulang (versi sesi naik), entri env diganti (sidik berubah), atau
 * akunnya sudah terkonfirmasi dari tab lain. Semuanya → null → `/login`.
 */
export async function resolveEnrolment(
  deps: LoginFlowDeps,
  payload: OperatorEnrolmentPayload
): Promise<EnrolmentContext | null> {
  let context: EnrolmentContext | null = null;

  if (payload.src === "env") {
    const env = parseOperatorAccounts(deps.accountsRaw ?? process.env.OPERATOR_USERS).find(
      (a) => a.name.toLowerCase() === payload.sub.toLowerCase()
    );
    if (env) {
      context = {
        account: { name: env.name, role: "owner", source: "env", sessionVersion: null, id: null },
        secret: env.totpSecret,
        fingerprint: secretFingerprint(env.totpSecret),
      };
    }
  } else if (deps.findDbAccount) {
    let db: DbOperatorCredential | null = null;
    try {
      db = await deps.findDbAccount(payload.sub.toLowerCase());
    } catch (error) {
      console.error("[operator] akun basis data tak terbaca saat pemasangan:", error);
    }
    if (db && db.id === payload.id && db.sessionVersion === payload.ver) {
      context = {
        account: { name: db.name, role: db.role, source: "db", sessionVersion: db.sessionVersion, id: db.id },
        secret: db.totpSecret,
        fingerprint: secretFingerprint(db.totpSecret),
      };
    }
  }

  if (!context || context.fingerprint !== payload.fp) return null;
  if (await isConfirmedFor(deps.readConfirmations, context.account.name, context.fingerprint)) return null;
  return context;
}

export type EnrolmentConfirmResult =
  | { outcome: "confirmed"; context: EnrolmentContext }
  | { outcome: "wrong_code"; context: EnrolmentContext }
  /** Sesi pemasangan tidak lagi berlaku — kembali ke `/login`. */
  | { outcome: "invalid" };

export async function confirmEnrolment(
  deps: LoginFlowDeps,
  payload: OperatorEnrolmentPayload,
  code: string
): Promise<EnrolmentConfirmResult> {
  const context = await resolveEnrolment(deps, payload);
  if (!context) return { outcome: "invalid" };
  if (!verifyTotp(context.secret, code.trim(), deps.now)) return { outcome: "wrong_code", context };
  return { outcome: "confirmed", context };
}
