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

export interface OperatorAccount {
  name: string;
  passwordHash: string;
  totpSecret: string;
}

/** Nama akun operator: pendek, tanpa `:`/`,`/spasi — pengenal untuk jejak audit. */
const NAME_PATTERN = /^[a-z0-9._-]{2,50}$/i;

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
 * sekaligus. Jawaban SERAGAM (`true`/`false` saja): pemanggil tidak pernah
 * tahu bagian mana yang salah — nama yang tidak ada pun tetap membayar satu
 * perbandingan bcrypt supaya waktunya tidak membocorkan keberadaan akun.
 */
export async function verifyOperatorLogin(params: {
  username: string;
  password: string;
  totpCode: string;
  accountsRaw?: string;
  now?: Date;
}): Promise<OperatorAccount | null> {
  const accounts = parseOperatorAccounts(params.accountsRaw ?? process.env.OPERATOR_USERS);
  const account = accounts.find((a) => a.name.toLowerCase() === params.username.trim().toLowerCase());

  /* Hash pembanding untuk nama yang tidak dikenal — bcrypt tetap berjalan
   * dengan biaya yang sama, jawaban tetap seragam. */
  const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpDLbaB6iy1RwXjbQXBEO3kbpm9tC";

  const passwordOk = await compare(params.password, account?.passwordHash ?? DUMMY_HASH);
  const totpOk = mfaDisabled()
    ? true
    : account
      ? verifyTotp(account.totpSecret, params.totpCode.trim(), params.now)
      : false;

  return account && passwordOk && totpOk ? account : null;
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
function mfaDisabled(): boolean {
  const off = process.env.OPERATOR_MFA?.trim().toLowerCase() === "off";
  if (off) {
    console.warn(
      "[operator] ⚠ OPERATOR_MFA=off — kode TOTP TIDAK diperiksa. Konsol operator " +
        "hanya berpagar nama + kata sandi. Cabut env ini begitu tidak diperlukan lagi."
    );
  }
  return off;
}
