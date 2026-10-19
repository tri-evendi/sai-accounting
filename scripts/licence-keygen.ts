/**
 * PASANGAN KUNCI PENANDA LISENSI (celah on-premise #2) — Ed25519.
 *
 *   bun run licence:keygen -- --keluar ~/sai-licence-key
 *
 * ══ DIJALANKAN DI MESIN LURING, SEKALI ═════════════════════════════════════
 * Kunci privat yang dihasilkan di sini adalah kewenangan untuk mencetak lisensi
 * SAI — termasuk lisensi tak terbatas. Ia TIDAK boleh berada di repo, di secret
 * CI, atau di mesin produksi:
 *
 *   • di repo → setiap orang yang pernah mengklon punya kewenangan itu, selamanya,
 *     dan `git` tidak bisa melupakannya;
 *   • di CI → siapa pun yang bisa memicu satu workflow bisa mencetak lisensi,
 *     dan jejaknya terlihat seperti build biasa;
 *   • di produksi → satu RCE menjadi mesin pencetak lisensi.
 *
 * Penerbitan lisensi adalah pekerjaan manusia yang jarang. Yang jarang tapi
 * berbahaya memang tidak boleh otomatis.
 *
 * Kunci PUBLIK-nya ditempel ke `packages/core/src/licence.ts` dan ikut
 * di-commit — ia bukan rahasia, dan justru harus sulit ditukar.
 */
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync, existsSync, chmodSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const ambil = (nama: string): string | null => {
  const i = argv.indexOf(nama);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : null;
};

const keluar = resolve(ambil("--keluar") ?? "./sai-licence-key");
const jalurPrivat = `${keluar}.pem`;
const jalurPublik = `${keluar}.pub.pem`;

for (const j of [jalurPrivat, jalurPublik]) {
  if (existsSync(j)) {
    console.error(
      `✗ ${j} sudah ada. Menimpanya berarti setiap lisensi yang pernah\n` +
        "  diterbitkan dengan kunci lama tidak lagi bisa diverifikasi."
    );
    process.exit(1);
  }
}

const { privateKey, publicKey } = generateKeyPairSync("ed25519");

const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

writeFileSync(jalurPrivat, privatePem, { mode: 0o600 });
chmodSync(jalurPrivat, 0o600);
writeFileSync(jalurPublik, publicPem, { mode: 0o644 });

console.log(`✓ kunci privat : ${jalurPrivat}  (mode 600)`);
console.log(`✓ kunci publik : ${jalurPublik}`);
console.log();
console.log("Langkah berikutnya:");
console.log("  1. Simpan kunci PRIVAT di luar repo dan di luar CI. Cadangkan secara luring;");
console.log("     kehilangannya berarti tidak ada lisensi baru yang bisa diterbitkan.");
console.log("  2. Tempel kunci PUBLIK ke `LICENCE_PUBLIC_KEY_PEM` di");
console.log("     packages/core/src/licence.ts, lalu commit.");
console.log();
console.log("Kunci publiknya:");
console.log(publicPem.trimEnd());
