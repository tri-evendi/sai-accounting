/**
 * PENANDA LISENSI — satu-satunya modul yang memegang kunci privat Ed25519
 * (keputusan pemilik 22 Okt 2026: kunci dibuat & dipakai dari konsol operator,
 * tersegel di basis data, dibuka dengan frasa sandi yang diketik setiap kali).
 *
 * Dipakai DUA jalur, dan keduanya harus menghasilkan byte yang sama:
 *
 *   • konsol operator — lewat `licence-signing-key-store` (segel di
 *     `sai_platform`, frasa sandi diketik per penandatanganan);
 *   • jalur LURING yang tetap tersedia — `bun run licence:keygen` /
 *     `licence:issue` dengan berkas PEM di laptop.
 *
 * ══ MODEL KEAMANAN SEGEL ═══════════════════════════════════════════════════
 *   kunci segel = scrypt(frasa sandi, salt acak 16 B, N=2^17, r=8, p=1) → 32 B
 *   segel       = AES-256-GCM(DER PKCS#8, nonce acak 12 B,
 *                             AAD = "sai-licence-signing-key/v1:" + sidik)
 *
 * • Frasa sandi tidak pernah disimpan, dicatat, maupun dipulangkan; turunan
 *   kuncinya dan DER mentahnya di-nol-kan sesudah dipakai (`fill(0)`). `KeyObject`
 *   Node sendiri tidak bisa di-nol-kan — ia dilepas ke GC begitu tanda tangan
 *   selesai, dan tidak pernah keluar dari fungsi pemanggilnya.
 * • GCM membuktikan keutuhan: sandi-teks atau tag yang diubah GAGAL dibuka,
 *   tidak pernah terbuka menjadi kunci lain. AAD mengikat sidik kunci publik,
 *   dan sesudah dibuka kunci publik turunannya dibandingkan lagi dengan sidik
 *   baris — dua pemeriksaan untuk satu janji: baris yang ditukar tidak pernah
 *   menghasilkan tanda tangan.
 * • Parameter KDF dibaca dari baris, tapi DIBATASI di sini (dan di CHECK
 *   migration): baris yang diturunkan ke N kecil tidak dipercaya, dan N raksasa
 *   tidak bisa dipakai menghabiskan memori `app-operator`.
 * • Frasa sandi salah dan segel rusak memulangkan jawaban yang SAMA (`null`):
 *   pemanggil tidak bisa — dan tidak perlu — membedakannya.
 *
 * Risiko sisa, dinyatakan apa adanya (06-KEAMANAN §3.7): RCE pada
 * `app-operator` bisa menangkap frasa sandi saat diketik dan kunci yang sedang
 * terbuka. Dump basis data atau env yang bocor SENDIRIAN tidak cukup untuk
 * menandatangani — penyerangnya masih harus menebak frasa sandi melawan scrypt.
 *
 * ══ YANG TIDAK BOLEH MENGIMPOR MODUL INI ═══════════════════════════════════
 * `app-customer` (`src/`) dan paket lain mana pun selain store kuncinya.
 * Pemasangan customer hanya MEMVERIFIKASI, dengan kunci publik tertanam di
 * `@sai/core/licence`. Dijaga `tests/licence-register-archive.test.ts`.
 *
 * Tanpa `server-only`: skrip `licence:*` memuatnya di luar Next.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  scrypt,
  sign as signBytes,
  type KeyObject,
} from "node:crypto";

import { licencePayloadBytes, verifyLicence, type Licence } from "@sai/core/licence";

/** Panjang minimum frasa sandi (karakter). */
export const SIGNING_PASSPHRASE_MIN = 12;
/** Batas atas — mencegah masukan raksasa ke scrypt. */
export const SIGNING_PASSPHRASE_MAX = 1024;

export interface SigningKdf {
  name: "scrypt";
  /** N — pangkat dua. */
  cost: number;
  /** r. */
  blockSize: number;
  /** p. */
  parallelism: number;
}

/**
 * Bawaan produksi: N=2^17, r=8 → ±128 MiB dan ±0,3–0,5 detik per pembukaan.
 * Mahal untuk penebak luring, tak terasa bagi manusia yang menandatangani
 * beberapa lisensi sebulan.
 */
export const DEFAULT_SIGNING_KDF: SigningKdf = { name: "scrypt", cost: 2 ** 17, blockSize: 8, parallelism: 1 };

/** Batas yang diterima saat MEMBUKA segel — sama dengan CHECK migration 0007. */
const KDF_BOUNDS = { minCost: 2 ** 14, maxCost: 2 ** 20, minBlock: 8, maxBlock: 16, minPar: 1, maxPar: 4 };

const CIPHER = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const SALT_BYTES = 16;
const AAD_PREFIX = "sai-licence-signing-key/v1:";

/** Kunci privat tersegel apa adanya seperti tersimpan (biner sebagai base64). */
export interface SealedSigningKey {
  fingerprint: string;
  publicKeyPem: string;
  kdf: SigningKdf & { salt: string };
  ciphertext: string;
  iv: string;
  tag: string;
}

export type PassphraseProblem = "too_short" | "too_long";

/** Bentuk frasa sandi — `null` = layak. Isinya tidak pernah ikut dipulangkan. */
export function passphraseProblem(passphrase: string): PassphraseProblem | null {
  const n = [...passphrase].length;
  if (n < SIGNING_PASSPHRASE_MIN) return "too_short";
  if (n > SIGNING_PASSPHRASE_MAX) return "too_long";
  return null;
}

/** Sidik kunci publik: SHA-256 heks atas DER SPKI — kebal beda spasi PEM. */
export function publicKeyFingerprint(publicKeyPem: string): string {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex");
}

function kdfInBounds(k: SigningKdf): boolean {
  const b = KDF_BOUNDS;
  return (
    k.name === "scrypt" &&
    Number.isInteger(k.cost) &&
    k.cost >= b.minCost &&
    k.cost <= b.maxCost &&
    (k.cost & (k.cost - 1)) === 0 &&
    Number.isInteger(k.blockSize) &&
    k.blockSize >= b.minBlock &&
    k.blockSize <= b.maxBlock &&
    Number.isInteger(k.parallelism) &&
    k.parallelism >= b.minPar &&
    k.parallelism <= b.maxPar
  );
}

function deriveKey(passphrase: string, salt: Buffer, k: SigningKdf): Promise<Buffer> {
  /* `maxmem` bawaan Node 32 MiB menolak N=2^17; dinaikkan PERSIS ke kebutuhan
     parameter yang sudah dibatasi, bukan dibuka tanpa batas. */
  const maxmem = 128 * k.cost * k.blockSize * k.parallelism + 32 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    scrypt(
      passphrase.normalize("NFC"),
      salt,
      KEY_BYTES,
      { N: k.cost, r: k.blockSize, p: k.parallelism, maxmem },
      (err, key) => (err ? reject(err) : resolve(key))
    );
  });
}

const aadOf = (fingerprint: string) => Buffer.from(`${AAD_PREFIX}${fingerprint}`, "utf8");

/** Pasangan kunci Ed25519 baru. Kunci privat tetap `KeyObject` — tidak pernah teks. */
export function generateLicenceKeyPair(): { privateKey: KeyObject; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return { privateKey, publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString() };
}

/**
 * Jalur LURING saja (`licence:keygen`): PEM PKCS#8 untuk ditulis ke berkas
 * mode 600 di laptop. Konsol tidak pernah memanggilnya — penjaga menolak
 * pemanggil lain.
 */
export function exportPrivateKeyPemForOfflineFile(privateKey: KeyObject): string {
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

/** Jalur LURING saja (`licence:issue`): baca PEM privat dari berkas laptop. */
export function readPrivateKeyPemFromOfflineFile(pem: string): KeyObject {
  return createPrivateKey(pem);
}

/** Segel kunci privat dengan frasa sandi. Turunan & DER mentah di-nol-kan. */
export async function sealSigningKey(
  privateKey: KeyObject,
  passphrase: string,
  kdf: SigningKdf = DEFAULT_SIGNING_KDF
): Promise<SealedSigningKey> {
  if (passphraseProblem(passphrase)) throw new Error("frasa sandi tidak memenuhi syarat panjang");
  if (!kdfInBounds(kdf)) throw new Error("parameter KDF di luar batas");

  const publicKeyPem = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
  const fingerprint = publicKeyFingerprint(publicKeyPem);
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(passphrase, salt, kdf);
  const der = privateKey.export({ type: "pkcs8", format: "der" });
  try {
    const cipher = createCipheriv(CIPHER, key, iv);
    cipher.setAAD(aadOf(fingerprint));
    const ciphertext = Buffer.concat([cipher.update(der), cipher.final()]);
    return {
      fingerprint,
      publicKeyPem,
      kdf: { ...kdf, salt: salt.toString("base64") },
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
    };
  } finally {
    key.fill(0);
    der.fill(0);
  }
}

/**
 * Buat pasangan kunci baru dan LANGSUNG segel. Kunci privat tidak pernah
 * meninggalkan fungsi ini dalam bentuk apa pun selain segel.
 */
export async function createSealedSigningKey(
  passphrase: string,
  kdf: SigningKdf = DEFAULT_SIGNING_KDF
): Promise<SealedSigningKey> {
  const { privateKey } = generateLicenceKeyPair();
  return sealSigningKey(privateKey, passphrase, kdf);
}

/**
 * Buka segel. `null` = frasa sandi salah ATAU segel/sidik dirusak — sengaja
 * tidak dibedakan. Melempar hanya untuk parameter KDF di luar batas (baris
 * yang tidak pernah ditulis kode ini).
 */
export async function openSealedSigningKey(
  sealed: SealedSigningKey,
  passphrase: string
): Promise<KeyObject | null> {
  const { salt: saltB64, ...kdf } = sealed.kdf;
  if (!kdfInBounds(kdf)) throw new Error("parameter KDF segel di luar batas");
  /* Segel hanya pernah dibuat dengan frasa yang lolos syarat panjang, jadi
     yang tidak lolos pasti salah — tanpa membayar scrypt. */
  if (passphraseProblem(passphrase)) return null;

  const key = await deriveKey(passphrase, Buffer.from(saltB64, "base64"), kdf);
  let der: Buffer | null = null;
  try {
    const decipher = createDecipheriv(CIPHER, key, Buffer.from(sealed.iv, "base64"));
    decipher.setAAD(aadOf(sealed.fingerprint));
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
    der = Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64")), decipher.final()]);
    const privateKey = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
    if (privateKey.asymmetricKeyType !== "ed25519") return null;
    const pem = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
    if (publicKeyFingerprint(pem) !== sealed.fingerprint) return null;
    if (publicKeyFingerprint(sealed.publicKeyPem) !== sealed.fingerprint) return null;
    return privateKey;
  } catch {
    return null;
  } finally {
    key.fill(0);
    der?.fill(0);
  }
}

export type SignLicenceResult = { ok: true; file: string } | { ok: false; reason: string };

/**
 * Tandatangani lisensi dan VERIFIKASI hasilnya sebelum dipulangkan — dengan
 * `verifyPublicKeyPem` bila diberikan (kunci tertanam), selain itu dengan
 * kunci publik turunan kunci privatnya. Lisensi yang tidak bisa dibaca ulang
 * oleh kodenya sendiri akan ditemukan CUSTOMER, di mesin yang tidak bisa kita
 * lihat; satu pemeriksaan di sini berbiaya mikrodetik.
 */
export function signLicenceFile(
  licence: Licence,
  privateKey: KeyObject,
  verifyPublicKeyPem?: string
): SignLicenceResult {
  const payload = licencePayloadBytes(licence);
  const signature = signBytes(null, payload, privateKey);
  const file = `${payload.toString("base64url")}.${signature.toString("base64url")}`;
  const pem =
    verifyPublicKeyPem ?? createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
  const verdict = verifyLicence(file, pem);
  if (!verdict.ok) return { ok: false, reason: verdict.reason };
  return { ok: true, file };
}
