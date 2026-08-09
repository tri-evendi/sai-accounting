/**
 * Cetak kode TOTP operator yang berlaku SEKARANG.
 *
 *   bun run operator-code <nama-akun>
 *
 * ══ Kenapa ini ada, dan kenapa ia BUKAN pintu belakang ══════════════════════
 * Konsol operator mewajibkan MFA (issue #154), dan itu tidak ditawar: ia
 * mengatur tenant, tagihan, penjadwal, dan pengaturan surel SEMUA pelanggan.
 * Tapi kewajiban itu punya satu efek samping yang wajar: orang yang memegang
 * server tetapi tidak memegang telepon berisi authenticator jadi terkunci —
 * dan jalan keluar yang paling menggoda saat itu adalah MEMATIKAN MFA-nya.
 *
 * Berkas ini menawarkan jalan keluar yang lebih murah: rahasianya toh SUDAH
 * ada di `OPERATOR_USERS` di server yang sama, jadi siapa pun yang bisa
 * menjalankan skrip ini sudah bisa membaca `.env` — dan siapa pun yang bisa
 * membaca `.env` sudah bisa mengganti seluruh entri operator sesukanya.
 * Artinya perkakas ini **tidak menambah** wewenang siapa pun; ia hanya
 * menghemat satu langkah bagi orang yang sudah memegang kuncinya.
 *
 * Yang TIDAK boleh disimpulkan dari itu: bahwa MFA jadi tidak berguna. Ia
 * melindungi dari orang yang mencuri NAMA + KATA SANDI tanpa memegang server
 * — dan itu justru kelas penyerang yang paling mungkin, apalagi selama
 * kredensial `--defaults` (yang tertulis di repo) belum diputar.
 *
 * ══ Rahasianya dibaca dari env, tidak pernah dari argumen ══════════════════
 * Argumen terlihat di `ps` dan mendarat di `~/.bash_history`; rahasia TOTP
 * adalah separuh dari kredensial operator. Karena itu skrip ini menerima NAMA
 * akun saja lalu mencari entrinya sendiri di `OPERATOR_USERS`.
 */
import "dotenv/config";

import { totpAt } from "../src/lib/operator/totp";

/** Panjang jendela TOTP, sama dengan yang dipakai `verifyOperatorLogin`. */
const PERIOD = 30;

function main() {
  const name = process.argv[2]?.trim();
  if (!name) {
    console.error(
      "Pakai: bun run operator-code <nama-akun>\n\n" +
        "Mencetak kode TOTP yang berlaku sekarang untuk akun operator itu,\n" +
        "dibaca dari OPERATOR_USERS di environment."
    );
    process.exit(1);
  }

  const raw = process.env.OPERATOR_USERS?.trim();
  if (!raw) {
    console.error(
      "ERROR: OPERATOR_USERS tidak diset — belum ada satu pun akun operator.\n" +
        "Buat satu: bun run tsx scripts/operator-credential.ts <nama>"
    );
    process.exit(1);
  }

  /*
   * Bentuk entri: `nama:hash-bcrypt:rahasia-base32`, dipisah koma. Diurai di
   * sini alih-alih memakai `parseOperatorAccounts` dari lib supaya skrip ini
   * tidak menyeret bcrypt hanya untuk membaca satu rahasia.
   */
  const entri = raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  const cocok = entri
    .map((e) => e.split(":"))
    .find((bagian) => bagian[0]?.trim() === name);

  if (!cocok) {
    const nama = entri.map((e) => e.split(":")[0]).join(", ");
    console.error(`ERROR: akun operator "${name}" tidak ada. Yang terdaftar: ${nama || "(kosong)"}`);
    process.exit(1);
  }

  const secret = cocok[2]?.trim();
  if (!secret) {
    console.error(
      `ERROR: entri "${name}" tidak punya rahasia TOTP — ia SALAH BENTUK dan\n` +
        "tidak akan pernah bisa masuk (lihat lib/operator/credentials.ts).\n" +
        "Buat ulang: bun run tsx scripts/operator-credential.ts " +
        name
    );
    process.exit(1);
  }

  const now = Math.floor(Date.now() / 1000);
  const sisa = PERIOD - (now % PERIOD);
  const kode = totpAt(secret, now);
  if (!kode) {
    console.error(`ERROR: rahasia TOTP "${name}" bukan base32 yang sah.`);
    process.exit(1);
  }

  console.log(`\n  kode sekarang : ${kode}`);
  console.log(`  sisa berlaku  : ${sisa} detik`);
  /*
   * Kode BERIKUTNYA ikut dicetak bukan demi kenyamanan melainkan demi
   * kebenaran: dengan sisa 2–3 detik, kode pertama hampir pasti sudah mati
   * sebelum selesai diketik — dan orang akan menyimpulkan skripnya rusak,
   * lalu mencari cara mematikan MFA. Persis yang ingin dihindari berkas ini.
   */
  if (sisa <= 5) {
    console.log(`  berikutnya    : ${totpAt(secret, now + PERIOD)}  ← pakai ini, yang di atas hampir habis`);
  }
  console.log("");
}

main();
