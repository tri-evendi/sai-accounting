/**
 * TERBITKAN BERKAS LISENSI (celah on-premise #2).
 *
 *   bun run licence:issue -- --kunci ~/sai-licence-key.pem \
 *     --customer "PT Maju Jaya" --perusahaan 3 --pengguna 25 \
 *     --dukungan-sampai 2027-10-20 --modul all --versi-maks 1.4.0 \
 *     --keluar ./licence.sai
 *
 * `--modul` menerima `all` atau daftar berkoma. `--dukungan-sampai` boleh
 * dikosongkan untuk dukungan tanpa batas waktu.
 *
 * Yang TIDAK dikerjakan skrip ini: menyentuh basis data apa pun. Lisensi adalah
 * artefak bertanda tangan, bukan baris — kewenangannya ada pada tanda tangan,
 * dan menyimpan hasil verifikasinya sebagai baris yang bisa ditulis memindahkan
 * kewenangan itu ke tempat yang salah (docs/arsitektur/06-KEAMANAN.md §3.6).
 */
import { createPrivateKey, createPublicKey, randomUUID, sign as signBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import {
  licencePayloadBytes,
  verifyLicence,
  type Licence,
  type LicenceModules,
} from "@sai/core/licence";

const argv = process.argv.slice(2);
const ambil = (nama: string): string | null => {
  const i = argv.indexOf(nama);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : null;
};
const mati = (pesan: string): never => {
  console.error(`✗ ${pesan}`);
  process.exit(1);
};

const jalurKunci = ambil("--kunci") ?? mati("--kunci <berkas.pem> wajib (kunci PRIVAT Ed25519).");
const customer = ambil("--customer") ?? mati("--customer <nama> wajib.");
const keluar = ambil("--keluar") ?? "./licence.sai";

const bilangan = (nama: string, bawaan: number): number => {
  const v = ambil(nama);
  if (v === null) return bawaan;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) mati(`${nama} harus bilangan bulat ≥ 0.`);
  return n;
};

const tanggal = (nama: string): string | null => {
  const v = ambil(nama);
  if (v === null || v.trim() === "") return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) mati(`${nama} bukan tanggal yang bisa dibaca: ${v}`);
  return new Date(t).toISOString();
};

const modulArg = (ambil("--modul") ?? "all").trim();
const modules: LicenceModules =
  modulArg === "all"
    ? "all"
    : modulArg
        .split(",")
        .map((m) => m.trim())
        .filter((m) => m !== "");
if (modules !== "all" && modules.length === 0) mati("--modul kosong; pakai `all` atau daftar modul.");

const licence: Licence = {
  licenceId: ambil("--id") ?? randomUUID(),
  customer,
  issuedAt: new Date().toISOString(),
  supportEndsAt: tanggal("--dukungan-sampai"),
  maxCompanies: bilangan("--perusahaan", 1),
  maxUsers: bilangan("--pengguna", 5),
  modules,
  maxVersion: ambil("--versi-maks"),
};

const payload = licencePayloadBytes(licence);

let privateKey;
try {
  privateKey = createPrivateKey(readFileSync(jalurKunci, "utf8"));
} catch (e) {
  mati(`kunci privat tidak dapat dibaca dari ${jalurKunci}: ${(e as Error).message}`);
}

const signature = signBytes(null, payload, privateKey!);
const berkas = `${payload.toString("base64url")}.${signature.toString("base64url")}`;

/* Diverifikasi SEBELUM ditulis, dengan kunci publik turunan kunci privat yang
   baru dipakai. Lisensi yang tidak bisa dibaca ulang oleh kodenya sendiri akan
   ditemukan oleh CUSTOMER, di mesin yang tidak bisa kita lihat — dan satu
   pemeriksaan di sini berbiaya mikrodetik. */
const publikPem = createPublicKey(privateKey!).export({ type: "spki", format: "pem" }).toString();
const vonis = verifyLicence(berkas, publikPem);
if (!vonis.ok) mati(`lisensi yang baru dibuat GAGAL diverifikasi: ${vonis.reason}`);

writeFileSync(keluar, `${berkas}\n`, { mode: 0o644 });

console.log(`✓ lisensi ditulis: ${keluar}`);
console.log(`  id          : ${licence.licenceId}`);
console.log(`  customer    : ${licence.customer}`);
console.log(`  perusahaan  : ${licence.maxCompanies}`);
console.log(`  pengguna    : ${licence.maxUsers}`);
console.log(`  modul       : ${modules === "all" ? "all" : modules.join(", ")}`);
console.log(`  dukungan    : ${licence.supportEndsAt ?? "tanpa batas waktu"}`);
console.log(`  versi maks  : ${licence.maxVersion ?? "tanpa batas"}`);
console.log();
console.log("Dukungan yang berakhir TIDAK mematikan aplikasi — ia menghentikan");
console.log("pembaruan dan dukungan. Pembukuan customer tetap terbuka.");
