/**
 * PERIKSA BERKAS LISENSI (celah on-premise #2).
 *
 *   bun run licence:verify -- --berkas ./licence.sai
 *
 * Dua pemakai, dua pertanyaan yang sama bentuknya: dukungan SAI yang perlu tahu
 * "lisensi di mesin itu sah dan memuat apa" tanpa menebak, dan customer yang
 * ingin memeriksa berkasnya sebelum memasangnya.
 *
 * Hanya MEMBACA. Keluar 1 bila tanda tangannya tidak cocok — dan 0 bila
 * lisensinya sah tapi dukungannya sudah lewat, sebab itu bukan kegagalan:
 * dukungan yang berakhir tidak mematikan aplikasi.
 */
import { readFileSync } from "node:fs";
import { verifyLicence } from "@sai/core/licence";

const argv = process.argv.slice(2);
const i = argv.indexOf("--berkas");
const jalur = i >= 0 && argv[i + 1] ? argv[i + 1]! : process.env.LICENCE_FILE;

if (!jalur) {
  console.error("✗ --berkas <jalur> wajib (atau setel LICENCE_FILE).");
  process.exit(1);
}

let isi: string;
try {
  isi = readFileSync(jalur, "utf8");
} catch (e) {
  console.error(`✗ tidak dapat membaca ${jalur}: ${(e as Error).message}`);
  process.exit(1);
}

const vonis = verifyLicence(isi);
if (!vonis.ok) {
  console.error(`✗ lisensi TIDAK sah: ${vonis.reason}`);
  process.exit(1);
}

const { licence, supportExpired } = vonis;
console.log("✓ tanda tangan cocok");
console.log(`  id          : ${licence.licenceId}`);
console.log(`  customer    : ${licence.customer}`);
console.log(`  diterbitkan : ${licence.issuedAt}`);
console.log(`  perusahaan  : maks ${licence.maxCompanies}`);
console.log(`  pengguna    : maks ${licence.maxUsers}`);
console.log(
  `  modul       : ${licence.modules === "all" ? "all" : [...licence.modules].join(", ")}`
);
console.log(`  versi maks  : ${licence.maxVersion ?? "tanpa batas"}`);
console.log(`  dukungan    : ${licence.supportEndsAt ?? "tanpa batas waktu"}`);

if (supportExpired) {
  console.log();
  console.log("⚠ Dukungan sudah berakhir. Aplikasi TIDAK berhenti — yang berhenti");
  console.log("  adalah pembaruan dan dukungan. Pembukuan tetap terbuka.");
}
