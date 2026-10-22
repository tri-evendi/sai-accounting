/**
 * PASANGAN KUNCI PENANDA LISENSI (celah on-premise #2) — Ed25519.
 *
 *   bun run licence:keygen -- --keluar ~/sai-licence-key
 *
 * ══ JALUR LURING — SALAH SATU DARI DUA ═════════════════════════════════════
 * Sejak keputusan pemilik 22 Okt 2026 kunci penanda juga bisa dibuat di
 * konsol operator (`/licences` → "Buat kunci penanda"): kunci privatnya
 * disimpan TERSEGEL di `sai_platform` dan dibuka dengan frasa sandi yang
 * diketik setiap kali menandatangani (06-KEAMANAN §3.7). Skrip ini tetap
 * ada untuk jalur luring — kunci privat sebagai berkas PEM di laptop yang
 * tidak pernah tersambung ke server. PILIH SATU: kunci konsol tidak bisa
 * dibuat bila kunci tertanam sudah ada, dan kunci dari skrip ini tidak bisa
 * dipakai konsol.
 *
 * Kunci privat yang dihasilkan di sini adalah kewenangan untuk mencetak lisensi
 * SAI — termasuk lisensi tak terbatas. Ia TIDAK boleh berada di repo, di secret
 * CI, atau di mesin produksi dalam bentuk mentah:
 *
 *   • di repo → setiap orang yang pernah mengklon punya kewenangan itu, selamanya,
 *     dan `git` tidak bisa melupakannya;
 *   • di CI → siapa pun yang bisa memicu satu workflow bisa mencetak lisensi,
 *     dan jejaknya terlihat seperti build biasa;
 *   • mentah di produksi → satu pembacaan berkas menjadi mesin pencetak lisensi.
 *
 * Pembuatan & ekspor kunci ada di `@sai/platform/licence-signing` — satu modul
 * untuk dua jalur, dijaga `tests/licence-register-archive.test.ts`.
 *
 * Kunci PUBLIK-nya ditempel ke `packages/core/src/licence.ts` dan ikut
 * di-commit — ia bukan rahasia, dan justru harus sulit ditukar.
 */
import { writeFileSync, existsSync, chmodSync } from "node:fs";
import { resolve } from "node:path";

import {
  exportPrivateKeyPemForOfflineFile,
  generateLicenceKeyPair,
} from "@sai/platform/licence-signing";

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

const { privateKey, publicKeyPem: publicPem } = generateLicenceKeyPair();
const privatePem = exportPrivateKeyPemForOfflineFile(privateKey);

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
