/**
 * REGISTER LISENSI ON-PREMISE — bagian MURNI (konsol `/licences`, migration
 * platform 0006; keputusan pemilik 22 Okt 2026 "opsi a").
 *
 * Alurnya tiga langkah, dan hanya satu yang menyentuh kunci privat:
 *
 *   1. konsol membuat DRAF dari formulir;
 *   2. konsol menyusun SATU perintah `bun run licence:issue -- …` dari draf itu
 *      (`buildIssueCommand`) — operator menjalankannya di LAPTOP LURING yang
 *      memegang kunci privat;
 *   3. berkas `.sai` hasilnya diunggah balik, diverifikasi dengan kunci PUBLIK
 *      yang ditanam di kode, dan dicocokkan dengan draf (`compareLicenceToTerms`).
 *
 * ══ YANG SENGAJA TIDAK ADA DI SINI ═════════════════════════════════════════
 * Penandatanganan. Kunci privat tidak pernah menyentuh server, CI, maupun repo
 * (06-KEAMANAN §3.7); satu-satunya penanda adalah `scripts/licence-issue.ts`.
 * Dijaga `tests/licence-register-archive.test.ts`.
 *
 * ══ ARSIP, BUKAN KEWENANGAN ════════════════════════════════════════════════
 * Baris register tidak pernah dipakai untuk memutuskan status lisensi di mana
 * pun (rancangan §8): kewenangan ada pada tanda tangan berkasnya, di mesin
 * customer. Register menjawab "apa yang pernah kita terbitkan, untuk siapa",
 * bukan "lisensi mana yang berlaku".
 */
import { createHash } from "node:crypto";

import type { Licence, LicenceModules } from "./licence";

export const LICENCE_ENTRY_STATUSES = ["draft", "issued", "superseded", "revoked"] as const;
export type LicenceEntryStatus = (typeof LICENCE_ENTRY_STATUSES)[number];

/** Isi draf yang ditandatangani — persis isian `Licence` minus `issuedAt`. */
export interface LicenceTerms {
  licenceId: string;
  customer: string;
  maxCompanies: number;
  maxUsers: number;
  modules: LicenceModules;
  /** `YYYY-MM-DD` atau `null` (dukungan tanpa batas waktu). */
  supportEndsOn: string | null;
  maxVersion: string | null;
}

/**
 * Jalur kunci privat DI LAPTOP LURING — hanya teks di dalam perintah yang
 * disalin, tidak pernah dibaca kode mana pun. Sama dengan contoh di kepala
 * `scripts/licence-issue.ts`.
 */
export const OFFLINE_KEY_PATH_PLACEHOLDER = "~/sai-licence-key.pem";

/** Kunci modul: huruf kecil, angka, garis bawah (`core_accounting`). */
export const MODULE_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

/** Bentuk kolom `modules` → nilai lisensi. Daftar kosong → `null` (tidak sah). */
export function parseModules(raw: string): LicenceModules | null {
  const v = raw.trim();
  if (v === "all") return "all";
  const list = [...new Set(v.split(",").map((m) => m.trim()).filter((m) => m !== ""))];
  if (list.length === 0 || !list.every((m) => MODULE_KEY_PATTERN.test(m))) return null;
  return list;
}

/** Nilai lisensi → bentuk kolom/argumen (`all` atau berkoma). */
export function formatModules(modules: LicenceModules): string {
  return modules === "all" ? "all" : modules.join(",");
}

/**
 * Kutip satu argumen untuk shell POSIX (bash/zsh) — kutip tunggal, dengan `'`
 * di dalamnya ditulis `'\''`. Argumen yang hanya memuat karakter aman dibiarkan
 * telanjang supaya perintahnya tetap enak dibaca.
 */
export function shellQuote(arg: string): string {
  if (arg !== "" && /^[A-Za-z0-9_./:@%+=,-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/** Nama berkas keluaran yang disarankan — id lisensi membuatnya tak bertabrakan. */
export function suggestedLicenceFileName(terms: Pick<LicenceTerms, "licenceId">): string {
  return `licence-${terms.licenceId.slice(0, 8)}.sai`;
}

/**
 * Perintah PERSIS yang dijalankan operator di laptop luring.
 *
 * `--id` disertakan supaya berkas unggahan bisa dipastikan berasal dari draf
 * INI, bukan dari draf lain atau penerbitan lama. `--kunci` memakai jalur
 * contoh di laptop — konsol tidak tahu dan tidak perlu tahu jalurnya.
 */
export function buildIssueCommand(terms: LicenceTerms): string {
  const args: string[] = [
    "--kunci",
    OFFLINE_KEY_PATH_PLACEHOLDER,
    "--id",
    shellQuote(terms.licenceId),
    "--customer",
    shellQuote(terms.customer),
    "--perusahaan",
    String(terms.maxCompanies),
    "--pengguna",
    String(terms.maxUsers),
    "--modul",
    shellQuote(formatModules(terms.modules)),
  ];
  if (terms.supportEndsOn) args.push("--dukungan-sampai", shellQuote(terms.supportEndsOn));
  if (terms.maxVersion) args.push("--versi-maks", shellQuote(terms.maxVersion));
  args.push("--keluar", shellQuote(`./${suggestedLicenceFileName(terms)}`));
  return `bun run licence:issue -- ${args.join(" ")}`;
}

/** Isian yang dicocokkan — kunci kamus `operator.licences.field.<field>`. */
export type LicenceTermField =
  | "licenceId"
  | "customer"
  | "maxCompanies"
  | "maxUsers"
  | "modules"
  | "supportEndsAt"
  | "maxVersion";

export interface LicenceTermMismatch {
  field: LicenceTermField;
  /** Nilai di draf, sudah dalam bentuk tampilan. */
  expected: string;
  /** Nilai di berkas, sudah dalam bentuk tampilan. */
  actual: string;
}

const KOSONG = "—";

/** `supportEndsAt` yang dihasilkan `licence:issue` dari `YYYY-MM-DD`. */
function expectedSupportIso(date: string | null): string | null {
  if (date === null) return null;
  const t = Date.parse(date);
  return Number.isNaN(t) ? date : new Date(t).toISOString();
}

/** Modul dibandingkan sebagai HIMPUNAN — urutan tidak mengubah arti. */
function modulesKey(m: LicenceModules): string {
  return m === "all" ? "all" : [...new Set(m)].sort().join(",");
}

/**
 * Bandingkan lisensi yang SUDAH terverifikasi dengan draf. Daftar kosong =
 * cocok. Nilai dikembalikan dalam bentuk tampilan supaya layar bisa
 * menuliskan "di draf X, di berkas Y" tanpa menebak.
 */
export function compareLicenceToTerms(licence: Licence, terms: LicenceTerms): LicenceTermMismatch[] {
  const out: LicenceTermMismatch[] = [];
  const cek = (field: LicenceTermField, expected: string, actual: string, same = expected === actual) => {
    if (!same) out.push({ field, expected, actual });
  };

  cek("licenceId", terms.licenceId, licence.licenceId);
  cek("customer", terms.customer, licence.customer);
  cek("maxCompanies", String(terms.maxCompanies), String(licence.maxCompanies));
  cek("maxUsers", String(terms.maxUsers), String(licence.maxUsers));
  cek(
    "modules",
    formatModules(terms.modules),
    formatModules(licence.modules),
    modulesKey(terms.modules) === modulesKey(licence.modules)
  );
  cek(
    "supportEndsAt",
    terms.supportEndsOn ?? KOSONG,
    licence.supportEndsAt ? licence.supportEndsAt.slice(0, 10) : KOSONG,
    expectedSupportIso(terms.supportEndsOn) === licence.supportEndsAt
  );
  cek("maxVersion", terms.maxVersion ?? KOSONG, licence.maxVersion ?? KOSONG);
  return out;
}

/** Bentuk berkas yang disimpan: tanpa spasi tepi, satu baris baru di akhir. */
export function normaliseLicenceFile(text: string): string {
  return `${text.trim()}\n`;
}

/** Sidik SHA-256 berkas (heks) — dihitung atas bentuk ternormalisasi. */
export function licenceFileSha256(text: string): string {
  return createHash("sha256").update(normaliseLicenceFile(text), "utf8").digest("hex");
}

/** Batas wajar ukuran berkas unggahan: lisensi nyata < 1 KB. */
export const LICENCE_FILE_MAX_BYTES = 16 * 1024;
