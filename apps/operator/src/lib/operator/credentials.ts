/**
 * Kredensial OPERATOR (issue #154) — penyimpanan kredensial SENDIRI, bukan
 * tabel `users` pelanggan: operator bukan pelanggan, dan akun yang bila bobol
 * membahayakan SEMUA pelanggan sekaligus tidak boleh tinggal satu tabel dengan
 * akun yang bila bobol membahayakan satu tenant.
 *
 * Sumbernya environment (aturan #154 — rahasia dari env, tidak pernah
 * di-commit):
 *
 *   OPERATOR_USERS="nama:hash-bcrypt:rahasia-totp-base32[,nama2:...]"
 *
 * Bentuk per entri: `nama:hash:rahasiaTotp`, dipisah koma antar akun. Hash
 * bcrypt memuat `$` tetapi tidak pernah `:` atau `,`, jadi pemisah ini aman.
 * Buat entri dengan `bun run tsx scripts/operator-credential.ts <nama>` —
 * skrip itu mencetak hash bcrypt + rahasia TOTP baru + URI otpauth untuk
 * dipindai aplikasi authenticator.
 *
 * ══ MFA WAJIB, TANPA PENGECUALIAN ═══════════════════════════════════════════
 * Entri TANPA rahasia TOTP bukan "akun tanpa MFA" — ia entri yang SALAH BENTUK
 * dan tidak pernah bisa masuk (gagal-tertutup). Verifikasi kata sandi DAN kode
 * TOTP terjadi bersama di `verifyOperatorLogin`; tidak ada jalur setengah-login.
 *
 * Parsing dipisah dari verifikasi supaya bisa diuji murni
 * (`tests/operator-credentials.test.ts`); bcrypt hanya disentuh fungsi async.
 */

import { compare } from "bcrypt";
import { verifyTotp } from "./totp";
import type { OperatorRole } from "./roles";

export interface OperatorAccount {
  name: string;
  passwordHash: string;
  totpSecret: string;
}

/**
 * Akun BASIS DATA (migration kendali 0004) sebagaimana dibutuhkan verifikasi:
 * rahasia TOTP sudah DIBUKA oleh pencarinya. `null` dari pencari = tidak ada,
 * nonaktif, atau rahasianya tidak bisa dibuka — ketiganya ditolak seragam.
 */
export interface DbOperatorCredential {
  id: number;
  name: string;
  role: OperatorRole;
  passwordHash: string;
  totpSecret: string;
  sessionVersion: number;
}

/** Hasil login yang sah — cukup untuk menerbitkan sesi. */
export interface VerifiedOperator {
  name: string;
  role: OperatorRole;
  /** `env` = akun darurat `OPERATOR_USERS` (selalu owner); `db` = `operator_accounts`. */
  source: "env" | "db";
  /** Hanya akun db: versi sesi yang dibawa token (pencabutan). */
  sessionVersion: number | null;
  /** Hanya akun db. */
  id: number | null;
}

/** Nama akun operator: pendek, tanpa `:`/`,`/spasi — pengenal untuk jejak audit. */
export const NAME_PATTERN = /^[a-z0-9._-]{2,50}$/i;

/**
 * Urai `OPERATOR_USERS`. Entri yang salah bentuk DIBUANG (dan dilaporkan lewat
 * `console.error` sekali per panggilan) — satu entri rusak tidak boleh
 * meruntuhkan akun lain, tetapi juga tidak boleh diam-diam menjadi akun
 * tanpa MFA.
 */
export function parseOperatorAccounts(raw: string | undefined): OperatorAccount[] {
  if (!raw?.trim()) return [];

  const accounts: OperatorAccount[] = [];
  const seen = new Set<string>();
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const [name, passwordHash, totpSecret, ...rest] = trimmed.split(":");
    if (
      rest.length > 0 ||
      !name ||
      !NAME_PATTERN.test(name) ||
      !passwordHash?.startsWith("$2") || // bcrypt: $2a$/$2b$/$2y$
      !totpSecret?.trim()
    ) {
      console.error(
        "[operator] entri OPERATOR_USERS salah bentuk dibuang (bentuk yang benar: " +
          "nama:hash-bcrypt:rahasia-totp-base32 — buat lewat scripts/operator-credential.ts)"
      );
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      console.error(`[operator] entri OPERATOR_USERS kembar untuk "${name}" dibuang`);
      continue;
    }
    seen.add(key);
    accounts.push({ name, passwordHash, totpSecret: totpSecret.trim() });
  }
  return accounts;
}

/**
 * Verifikasi login operator: nama + kata sandi (bcrypt) + kode TOTP, ketiganya
 * sekaligus. Jawaban SERAGAM (`null` saja): pemanggil tidak pernah tahu bagian
 * mana yang salah — nama yang tidak ada pun tetap membayar SATU perbandingan
 * bcrypt supaya waktunya tidak membocorkan keberadaan akun.
 *
 * Urutan: akun ENV dulu, lalu akun BASIS DATA lewat `findDbAccount` (disuntik
 * pemanggil; tanpa itu hanya env). Nama env MENANG — akun basis data dengan
 * nama yang sama tidak bisa dibuat (`operator-accounts.ts`), dan bila tetap
 * ada (mis. env ditambah belakangan) ia tidak bisa dipakai masuk.
 *
 * Pencari yang MELEMPAR (kendali mati) diperlakukan sebagai "tidak ada":
 * akun env tetap bisa masuk — memang itu gunanya akun darurat.
 */
export async function verifyOperatorLogin(params: {
  username: string;
  password: string;
  totpCode: string;
  accountsRaw?: string;
  now?: Date;
  findDbAccount?: (name: string) => Promise<DbOperatorCredential | null>;
}): Promise<VerifiedOperator | null> {
  const checked = await verifyOperatorPassword(params);
  const totpOk = mfaDisabled()
    ? true
    : checked
      ? verifyTotp(checked.totpSecret, params.totpCode.trim(), params.now)
      : false;
  return checked && totpOk ? checked.account : null;
}

/** Kata sandi benar → akun + rahasia TOTP-nya (untuk langkah MFA berikutnya). */
export interface PasswordVerified {
  account: VerifiedOperator;
  totpSecret: string;
}

/**
 * Langkah PERTAMA login: nama + kata sandi saja, dengan aturan yang sama
 * (env dulu, bcrypt waktu-tetap, pencari yang melempar = tidak ada). Hasilnya
 * BUKAN izin masuk: pemanggil wajib memutuskan langkah MFA-nya
 * (`decideOperatorLogin` di `login-flow.ts`, atau `verifyOperatorLogin`).
 * Rahasia TOTP yang dikembalikan tidak pernah boleh dicatat.
 */
export async function verifyOperatorPassword(params: {
  username: string;
  password: string;
  accountsRaw?: string;
  findDbAccount?: (name: string) => Promise<DbOperatorCredential | null>;
}): Promise<PasswordVerified | null> {
  const wanted = params.username.trim().toLowerCase();
  const accounts = parseOperatorAccounts(params.accountsRaw ?? process.env.OPERATOR_USERS);
  const envAccount = accounts.find((a) => a.name.toLowerCase() === wanted);

  let dbAccount: DbOperatorCredential | null = null;
  if (!envAccount && params.findDbAccount && NAME_PATTERN.test(wanted)) {
    try {
      dbAccount = await params.findDbAccount(wanted);
    } catch (error) {
      console.error("[operator] akun basis data tak terbaca saat masuk:", error);
      dbAccount = null;
    }
  }

  /* Hash pembanding untuk nama yang tidak dikenal — bcrypt tetap berjalan
   * dengan biaya yang sama, jawaban tetap seragam. */
  const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpDLbaB6iy1RwXjbQXBEO3kbpm9tC";
  const hash = envAccount?.passwordHash ?? dbAccount?.passwordHash ?? DUMMY_HASH;
  const secret = envAccount?.totpSecret ?? dbAccount?.totpSecret ?? null;

  const passwordOk = await compare(params.password, hash);

  if (!passwordOk || !secret) return null;
  if (envAccount) {
    return {
      account: { name: envAccount.name, role: "owner", source: "env", sessionVersion: null, id: null },
      totpSecret: secret,
    };
  }
  if (dbAccount) {
    return {
      account: {
        name: dbAccount.name,
        role: dbAccount.role,
        source: "db",
        sessionVersion: dbAccount.sessionVersion,
        id: dbAccount.id,
      },
      totpSecret: secret,
    };
  }
  return null;
}

/**
 * Saklar MATIKAN MFA — dan kenapa bentuknya seperti ini.
 *
 * Konsol operator mengatur tenant, tagihan, penjadwal, dan pengaturan surel
 * SEMUA pelanggan. Mematikan MFA di sana adalah penurunan keamanan sungguhan,
 * bukan penyetelan kenyamanan: yang tersisa hanya nama + kata sandi, dan kata
 * sandi bawaan pemasangan ini tertulis di repositori sampai diputar.
 *
 * Karena itu bentuknya dipilih supaya **mahal untuk tidak sengaja menyala dan
 * murah untuk dimatikan lagi**:
 *
 *  • Hanya nilai PERSIS `"off"` yang mematikannya. `"false"`, `"0"`, `"no"`,
 *    string kosong — semuanya berarti MFA TETAP HIDUP. Saklar keamanan yang
 *    menerima banyak ejaan adalah saklar yang menyala karena salah ketik.
 *  • Bawaannya HIDUP. Tidak ada env = MFA wajib, seperti sebelum #154 dan
 *    seperti seharusnya.
 *  • Ia berteriak di log SETIAP kali dipakai, bukan sekali saat boot. Saklar
 *    sementara yang diam akan menjadi saklar permanen yang dilupakan — dan
 *    satu-satunya yang tahu adalah orang yang membaca `.env` berbulan-bulan
 *    kemudian.
 *
 * Rahasia TOTP TIDAK dicabut saat saklar ini menyala: entri tanpa rahasia
 * tetap SALAH BENTUK (lihat `parseOperatorAccounts`). Jadi menyalakan MFA
 * kembali tidak menuntut kredensial dibuat ulang — cukup cabut env-nya dan
 * buat ulang kontainernya.
 */
export function operatorMfaOff(): boolean {
  return process.env.OPERATOR_MFA?.trim().toLowerCase() === "off";
}

/**
 * Sama dengan `operatorMfaOff()`, tetapi BERTERIAK di log tiap kali dipakai.
 *
 * Dipisah karena keduanya dipanggil dari tempat yang berbeda maksudnya:
 * verifikasi login memakai yang ini (tiap percobaan masuk layak dicatat),
 * sedangkan formulir memakai yang senyap — halaman login digambar ulang setiap
 * kali orang membukanya, dan peringatan yang muncul karena seseorang MELIHAT
 * halaman akan menenggelamkan peringatan yang muncul karena seseorang MASUK.
 */
export function mfaDisabled(): boolean {
  const off = operatorMfaOff();
  if (off) {
    console.warn(
      "[operator] ⚠ OPERATOR_MFA=off — kode TOTP TIDAK diperiksa. Konsol operator " +
        "hanya berpagar nama + kata sandi. Cabut env ini begitu tidak diperlukan lagi."
    );
  }
  return off;
}
