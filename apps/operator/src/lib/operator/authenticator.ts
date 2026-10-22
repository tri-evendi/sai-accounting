/**
 * PASANG AUTHENTICATOR — jalan untuk menyalakan kembali MFA konsol operator.
 *
 * ══ MASALAH YANG DITUTUP ══════════════════════════════════════════════════
 * Produksi berjalan `OPERATOR_MFA=off`, dan rahasia TOTP akun env-nya tidak
 * pernah dipindai ke ponsel mana pun. Mencabut saklar itu hari ini berarti
 * mengunci pemiliknya sendiri di luar konsol. Modul ini memberi tiga hal:
 *
 *   1. MELIHAT rahasia akun SENDIRI sebagai QR — sesudah memasukkan ulang kata
 *      sandi (dan kode TOTP yang berlaku bila MFA sedang hidup). Sesi yang
 *      dicuri saja tidak cukup untuk menyalin faktor kedua.
 *   2. MENGONFIRMASI bahwa aplikasi authenticator benar-benar menghasilkan kode
 *      yang diterima server — dicatat di jejak audit operator, bersama SIDIK
 *      rahasianya (bukan rahasianya).
 *   3. KESIAPAN: akun mana yang sudah terkonfirmasi untuk rahasia yang
 *      BERLAKU SEKARANG, supaya pemilik tahu kapan aman mencabut saklarnya.
 *
 * Plus satu yang opsional: akun BASIS DATA boleh memutar rahasianya sendiri —
 * rahasia baru baru menggantikan yang lama SESUDAH satu kode darinya diterima.
 * Akun ENV tidak bisa: rahasianya tinggal di `.env`, dan konsol yang bisa
 * menulis `.env` adalah konsol yang bisa mencabut jalan masuk daruratnya
 * sendiri. Putarannya lewat `scripts/operator-credential.ts`.
 *
 * ══ KENAPA KONFIRMASI TINGGAL DI JEJAK AUDIT, BUKAN KOLOM BARU ═════════════
 * Akun env tidak punya baris di basis data mana pun, dan menambah tabel
 * "keadaan akun env" berarti membuat sumber kebenaran kedua untuk akun yang
 * sumbernya `.env`. Jejak audit operator sudah mencatat setiap peristiwa
 * dengan siapa + kapan; yang ditambahkan hanya SIDIK rahasianya, sehingga
 * konfirmasi otomatis BASI ketika rahasianya berganti (env diganti, akun
 * basis data diatur ulang) — tanpa ada yang harus ingat menghapus apa pun.
 *
 * Sidik = 64 bit pertama SHA-256 berlabel atas rahasia 160 bit acak: tidak
 * bisa dibalik, tidak bisa ditebak, dan cukup untuk membedakan dua rahasia.
 * Rahasianya sendiri TIDAK PERNAH masuk log, jejak, maupun pesan galat.
 *
 * Klien dan pencari DISUNTIK (pola `operator-accounts.ts`): aturannya diuji
 * dengan fake di `tests/operator-authenticator.test.ts`.
 */
import { createHash } from "node:crypto";

import type { PrismaClient as ControlClient } from "@sai/db/client/control";
import { encryptionKeyAvailable, openSecret, sealSecret } from "@sai/core/settings-crypto";
import { parseOperatorAccounts, verifyOperatorLogin, type DbOperatorCredential } from "./credentials";
import type { OperatorIdentity } from "./identity";
import { findDbOperatorCredential, TOTP_ISSUER } from "./operator-accounts";
import { qrSvgData, type QrSvgData } from "./qr";
import { otpauthUri, randomTotpSecret, verifyTotp } from "./totp";

/* ── Sidik & bentuk yang dipajang ─────────────────────────────────────────── */

/** Sidik rahasia TOTP untuk jejak audit — lihat kepala berkas. */
export function secretFingerprint(secretBase32: string): string {
  const normalised = secretBase32.toUpperCase().replace(/\s+/g, "").replace(/=+$/, "");
  return createHash("sha256").update(`sai-operator-totp-fingerprint:${normalised}`).digest("hex").slice(0, 16);
}

/**
 * Yang dikirim ke layar orang yang SUDAH membuktikan dirinya: rahasia dalam
 * teks (cadangan untuk entri manual) dan QR yang dikodekan di server.
 */
export interface AuthenticatorEnrolment {
  account: string;
  /** Base32, dikelompokkan per 4 karakter supaya bisa diketik tanpa salah baca. */
  secretGrouped: string;
  otpauthUri: string;
  qr: QrSvgData;
}

export function enrolmentFor(account: string, secretBase32: string): AuthenticatorEnrolment {
  const uri = otpauthUri(TOTP_ISSUER, account, secretBase32);
  return {
    account,
    secretGrouped: secretBase32.replace(/(.{4})(?=.)/g, "$1 "),
    otpauthUri: uri,
    qr: qrSvgData(uri),
  };
}

/* ── Sumber rahasia & bukti ulang ─────────────────────────────────────────── */

export interface AuthenticatorDeps {
  /** `OPERATOR_USERS` — disuntik untuk tes; bawaannya env. */
  accountsRaw?: string;
  /** Akun basis data AKTIF dengan rahasia terbuka (`findDbOperatorCredential`). */
  findDbAccount: (name: string) => Promise<DbOperatorCredential | null>;
  now?: Date;
}

/** Rahasia yang BERLAKU SEKARANG untuk identitas yang sedang masuk, atau null. */
export async function currentSecretFor(
  deps: AuthenticatorDeps,
  operator: Pick<OperatorIdentity, "name" | "source">
): Promise<string | null> {
  if (operator.source === "env") {
    const env = parseOperatorAccounts(deps.accountsRaw ?? process.env.OPERATOR_USERS).find(
      (a) => a.name.toLowerCase() === operator.name.toLowerCase()
    );
    return env?.totpSecret ?? null;
  }
  try {
    return (await deps.findDbAccount(operator.name.toLowerCase()))?.totpSecret ?? null;
  } catch (error) {
    console.error("[operator-authenticator] akun basis data tak terbaca:", error);
    return null;
  }
}

/**
 * Bukti ulang: kata sandi akun yang SEDANG MASUK (+ kode TOTP bila MFA hidup).
 *
 * Memakai `verifyOperatorLogin` apa adanya — satu jalur verifikasi, jadi
 * aturan "MFA mati hanya bila `OPERATOR_MFA` persis `off`" dan bcrypt
 * waktu-tetapnya berlaku di sini tanpa disalin. Hasilnya wajib menunjuk akun
 * yang SAMA dengan sesi (nama + sumber): kata sandi akun lain tidak membuka
 * QR akun ini.
 */
export async function reauthenticate(
  deps: AuthenticatorDeps,
  operator: Pick<OperatorIdentity, "name" | "source">,
  input: { password: string; code: string }
): Promise<boolean> {
  if (!input.password) return false;
  const verified = await verifyOperatorLogin({
    username: operator.name,
    password: input.password,
    totpCode: input.code,
    accountsRaw: deps.accountsRaw,
    now: deps.now,
    findDbAccount: operator.source === "db" ? deps.findDbAccount : undefined,
  });
  return (
    verified !== null &&
    verified.source === operator.source &&
    verified.name.toLowerCase() === operator.name.toLowerCase()
  );
}

/* ── Lihat & konfirmasi rahasia yang berlaku ──────────────────────────────── */

export type RevealResult =
  | { outcome: "revealed"; enrolment: AuthenticatorEnrolment; fingerprint: string }
  /** Kata sandi / kode salah — jawaban seragam, tidak menunjuk bagian mana. */
  | { outcome: "denied" }
  /** Rahasianya tidak terbaca (entri env hilang, kunci segel salah). */
  | { outcome: "unavailable" };

export async function revealAuthenticator(
  deps: AuthenticatorDeps,
  operator: Pick<OperatorIdentity, "name" | "source">,
  input: { password: string; code: string }
): Promise<RevealResult> {
  if (!(await reauthenticate(deps, operator, input))) return { outcome: "denied" };
  const secret = await currentSecretFor(deps, operator);
  if (!secret) return { outcome: "unavailable" };
  return {
    outcome: "revealed",
    enrolment: enrolmentFor(operator.name, secret),
    fingerprint: secretFingerprint(secret),
  };
}

export type ConfirmResult =
  | { outcome: "confirmed"; fingerprint: string }
  | { outcome: "wrong_code" }
  | { outcome: "unavailable" };

/**
 * Konfirmasi: kode dari aplikasi diterima untuk rahasia yang BERLAKU.
 *
 * Tidak menuntut bukti ulang lagi, dan itu disengaja: kode yang benar hanya
 * bisa datang dari orang yang memegang rahasianya, jadi konfirmasi tidak
 * membuka apa pun yang belum dimiliki pengirimnya. Yang membatasinya pembatas
 * laju di action.
 */
export async function confirmAuthenticator(
  deps: AuthenticatorDeps,
  operator: Pick<OperatorIdentity, "name" | "source">,
  code: string
): Promise<ConfirmResult> {
  const secret = await currentSecretFor(deps, operator);
  if (!secret) return { outcome: "unavailable" };
  if (!verifyTotp(secret, code.trim(), deps.now)) return { outcome: "wrong_code" };
  return { outcome: "confirmed", fingerprint: secretFingerprint(secret) };
}

/* ── Putar rahasia (akun basis data saja) ─────────────────────────────────── */

/** Umur tiket putaran: cukup untuk memindai dan mengetik satu kode. */
export const ROTATION_TTL_MS = 10 * 60 * 1000;

interface RotationTicketBody {
  v: 1;
  id: number;
  name: string;
  secret: string;
  exp: number;
}

/**
 * Tiket putaran = rahasia BARU + pemiliknya + kedaluwarsa, DISEGEL
 * (`settings-crypto`, AES-256-GCM). Ia dipegang peramban di antara dua
 * langkah alih-alih disimpan di server: tidak ada tabel "putaran tertunda",
 * dan rahasia lama tetap berlaku sampai langkah kedua berhasil. Peramban toh
 * sudah melihat rahasia barunya (QR); yang dijamin segel adalah bahwa tiket
 * tidak bisa DIUBAH — dipindah ke akun lain atau diperpanjang umurnya.
 */
function sealTicket(body: RotationTicketBody): string {
  const sealed = sealSecret(JSON.stringify(body));
  return `${sealed.ciphertext}.${sealed.iv}.${sealed.tag}`;
}

function openTicket(ticket: string): RotationTicketBody | null {
  const [ciphertext, iv, tag, ...rest] = ticket.split(".");
  if (!ciphertext || !iv || !tag || rest.length > 0) return null;
  try {
    const body = JSON.parse(openSecret({ ciphertext, iv, tag })) as Partial<RotationTicketBody>;
    if (
      body.v !== 1 ||
      typeof body.id !== "number" ||
      typeof body.name !== "string" ||
      typeof body.secret !== "string" ||
      typeof body.exp !== "number"
    ) {
      return null;
    }
    return body as RotationTicketBody;
  } catch {
    return null;
  }
}

export type StartRotationResult =
  | { outcome: "started"; enrolment: AuthenticatorEnrolment; ticket: string }
  | { outcome: "denied" }
  /** Akun env — rahasianya di `.env`, diputar lewat skrip. */
  | { outcome: "env_account" }
  | { outcome: "key_missing" };

export async function startRotation(
  deps: AuthenticatorDeps,
  operator: Pick<OperatorIdentity, "name" | "source" | "id">,
  input: { password: string; code: string }
): Promise<StartRotationResult> {
  if (operator.source !== "db" || operator.id === null) return { outcome: "env_account" };
  if (!encryptionKeyAvailable()) return { outcome: "key_missing" };
  if (!(await reauthenticate(deps, operator, input))) return { outcome: "denied" };

  const secret = randomTotpSecret();
  const now = (deps.now ?? new Date()).getTime();
  return {
    outcome: "started",
    enrolment: enrolmentFor(operator.name, secret),
    ticket: sealTicket({ v: 1, id: operator.id, name: operator.name.toLowerCase(), secret, exp: now + ROTATION_TTL_MS }),
  };
}

export type FinishRotationResult =
  | { outcome: "rotated"; fingerprint: string }
  | { outcome: "wrong_code" }
  /** Tiket rusak, kedaluwarsa, milik akun lain, atau akunnya sudah tidak aktif. */
  | { outcome: "ticket_invalid" }
  | { outcome: "env_account" }
  | { outcome: "key_missing" };

export async function finishRotation(
  deps: { control: ControlClient; now?: Date },
  operator: Pick<OperatorIdentity, "name" | "source" | "id">,
  input: { ticket: string; code: string }
): Promise<FinishRotationResult> {
  if (operator.source !== "db" || operator.id === null) return { outcome: "env_account" };
  if (!encryptionKeyAvailable()) return { outcome: "key_missing" };

  const body = openTicket(input.ticket);
  const now = deps.now ?? new Date();
  if (
    !body ||
    body.exp < now.getTime() ||
    body.id !== operator.id ||
    body.name !== operator.name.toLowerCase()
  ) {
    return { outcome: "ticket_invalid" };
  }
  /* Kode dari rahasia BARU — bukti bahwa aplikasinya sudah memindai yang
     benar sebelum yang lama dibuang. */
  if (!verifyTotp(body.secret, input.code.trim(), now)) return { outcome: "wrong_code" };

  const sealed = sealSecret(body.secret);
  const { count } = await deps.control.operatorAccount.updateMany({
    where: { id: body.id, name: body.name, isActive: true },
    data: { totpCiphertext: sealed.ciphertext, totpIv: sealed.iv, totpTag: sealed.tag },
  });
  if (count !== 1) return { outcome: "ticket_invalid" };
  return { outcome: "rotated", fingerprint: secretFingerprint(body.secret) };
}

/* ── Kesiapan menyalakan MFA ──────────────────────────────────────────────── */

/** Satu konfirmasi dari jejak audit (`operator.authenticator.confirm`/`rotate`). */
export interface AuthenticatorConfirmation {
  operator: string;
  fingerprint: string;
  at: Date;
}

export interface AuthenticatorAccount {
  name: string;
  source: "env" | "db";
  /** Sidik rahasia yang berlaku; null = rahasianya tidak terbaca. */
  fingerprint: string | null;
}

export type AuthenticatorState =
  /** Terkonfirmasi untuk rahasia yang berlaku sekarang. */
  | "confirmed"
  /** Pernah terkonfirmasi, tetapi rahasianya sudah berganti sejak itu. */
  | "stale"
  | "missing";

export interface AuthenticatorReadinessRow extends AuthenticatorAccount {
  state: AuthenticatorState;
  confirmedAt: Date | null;
}

export function authenticatorReadiness(
  accounts: AuthenticatorAccount[],
  confirmations: AuthenticatorConfirmation[]
): AuthenticatorReadinessRow[] {
  return accounts.map((account) => {
    const mine = confirmations
      .filter((c) => c.operator.toLowerCase() === account.name.toLowerCase())
      .sort((a, b) => b.at.getTime() - a.at.getTime());
    const match = account.fingerprint ? mine.find((c) => c.fingerprint === account.fingerprint) : undefined;
    if (match) return { ...account, state: "confirmed", confirmedAt: match.at };
    return { ...account, state: mine.length > 0 ? "stale" : "missing", confirmedAt: null };
  });
}

/**
 * Akun yang bisa masuk sekarang + sidik rahasianya: env dulu (selalu owner),
 * lalu akun basis data AKTIF. Rahasia basis data dibuka satu per satu — daftar
 * operator memang pendek, dan rahasia yang tak bisa dibuka cukup menjadi
 * sidik `null` untuk akun itu saja.
 */
export async function listAuthenticatorAccounts(deps: {
  control: ControlClient;
  accountsRaw?: string;
}): Promise<AuthenticatorAccount[]> {
  const env: AuthenticatorAccount[] = parseOperatorAccounts(deps.accountsRaw ?? process.env.OPERATOR_USERS).map(
    (a) => ({ name: a.name, source: "env", fingerprint: secretFingerprint(a.totpSecret) })
  );
  const rows = await deps.control.operatorAccount.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { name: true },
  });
  const db: AuthenticatorAccount[] = [];
  for (const row of rows) {
    const credential = await findDbOperatorCredential(deps, row.name);
    db.push({
      name: row.name,
      source: "db",
      fingerprint: credential ? secretFingerprint(credential.totpSecret) : null,
    });
  }
  return [...env, ...db];
}
