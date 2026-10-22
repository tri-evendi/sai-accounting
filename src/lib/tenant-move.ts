/**
 * Aturan MURNI `bun run tenant:move` (tahap 4, rancangan 09 §9) — keputusan
 * "boleh pindah atau tidak", nama salinan lama, dan pembanding isi. Skripnya
 * (`scripts/tenant-move.ts`) hanya mengumpulkan fakta dan menjalankan langkah;
 * semua yang bisa salah tanpa basis data ada di sini, dan diuji
 * `tests/tenant-move.test.ts`.
 *
 * Tanpa `server-only` dan tanpa IO: skrip tsx memuatnya apa adanya.
 */

import { DEFAULT_DB_INSTANCE_LABEL } from "@sai/db/company-url";

/** Fakta yang dikumpulkan skrip sebelum memutuskan. */
export interface MoveFacts {
  company: {
    slug: string;
    databaseName: string;
    isActive: boolean;
    /** `null` = instans bawaan. */
    dbInstanceKey: string | null;
  };
  /** `null` = instans bawaan. */
  targetKey: string | null;
  /** Kunci tujuan terdaftar di `db_instances` (selalu `true` untuk bawaan). */
  targetKnown: boolean;
  /** Instans tujuan aktif (menerima buku baru). */
  targetActive: boolean;
  /** Env var URL tujuan ada di proses ini. */
  targetUrlSet: boolean;
  sourceDatabaseExists: boolean;
  targetDatabaseExists: boolean;
  /** Jumlah tabel di basis data tujuan bila sudah ada; 0 bila belum. */
  targetDatabaseTables: number;
}

export interface MoveRefusal {
  code:
    | "company_active"
    | "same_instance"
    | "target_unknown"
    | "target_inactive"
    | "target_url_missing"
    | "source_missing"
    | "target_not_empty";
  message: string;
}

const label = (key: string | null) => key ?? DEFAULT_DB_INSTANCE_LABEL;

/**
 * Semua alasan menolak, bukan hanya yang pertama: orang yang menjalankan
 * pratinjau harus melihat seluruh daftar pekerjaannya sekaligus, bukan
 * menemukannya satu per satu dalam lima putaran.
 */
export function moveRefusals(f: MoveFacts): MoveRefusal[] {
  const out: MoveRefusal[] = [];
  if (f.company.isActive) {
    out.push({
      code: "company_active",
      message:
        `Perusahaan ${f.company.slug} masih AKTIF. Pemindahan hanya berjalan pada buku yang ` +
        "tidak bisa ditulis siapa pun — nonaktifkan dulu (companies.is_active = false), " +
        "tunggu ≥ 60 detik (TTL cache registry aplikasi), baru jalankan ulang.",
    });
  }
  if (f.targetKey === f.company.dbInstanceKey) {
    out.push({
      code: "same_instance",
      message: `Buku ${f.company.databaseName} sudah di instans ${label(f.targetKey)}.`,
    });
  }
  if (!f.targetKnown) {
    out.push({
      code: "target_unknown",
      message: `Instans "${label(f.targetKey)}" tidak terdaftar di db_instances.`,
    });
  } else {
    if (!f.targetActive) {
      out.push({
        code: "target_inactive",
        message: `Instans "${label(f.targetKey)}" nonaktif — tidak menerima buku.`,
      });
    }
    if (!f.targetUrlSet) {
      out.push({
        code: "target_url_missing",
        message: `URL instans "${label(f.targetKey)}" tidak diset di environment proses ini.`,
      });
    }
  }
  if (!f.sourceDatabaseExists) {
    out.push({
      code: "source_missing",
      message:
        `Basis data ${f.company.databaseName} tidak ada di instans asal ` +
        `${label(f.company.dbInstanceKey)} — registry dan server tidak sepakat; periksa dulu.`,
    });
  }
  if (f.targetDatabaseExists && f.targetDatabaseTables > 0) {
    out.push({
      code: "target_not_empty",
      message:
        `Basis data ${f.company.databaseName} sudah ada di ${label(f.targetKey)} DAN berisi ` +
        `${f.targetDatabaseTables} tabel. Pemindahan tidak pernah menimpa — hapus dengan ` +
        "sadar bila memang sisa percobaan.",
    });
  }
  return out;
}

/** Batas pengenal PostgreSQL (NAMEDATALEN − 1). */
const PG_IDENTIFIER_MAX = 63;

/**
 * Nama salinan LAMA sesudah pindah: `<nama>_moved_<yyyymmdd>`.
 *
 * Salinan lama TIDAK dihapus — ia jalan balik bila buku di tujuan ternyata
 * bermasalah — tetapi DIGANTI NAMA, supaya proses mana pun yang masih
 * memegang registry lama (cache 60 detik, klien yang lupa dimuat ulang)
 * gagal tersambung dengan galat yang menyebut namanya, bukan menulis ke
 * salinan yang sudah ditinggalkan tanpa satu galat pun.
 */
export function retiredDatabaseName(databaseName: string, now: Date): string {
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = `_moved_${stamp}`;
  return databaseName.slice(0, PG_IDENTIFIER_MAX - suffix.length) + suffix;
}

/**
 * Bandingkan jumlah baris per tabel asal vs tujuan. Memulangkan daftar
 * selisih yang bisa dibaca manusia; kosong = sama persis.
 */
export function countMismatches(
  source: Readonly<Record<string, number>>,
  target: Readonly<Record<string, number>>
): string[] {
  const out: string[] = [];
  const tables = [...new Set([...Object.keys(source), ...Object.keys(target)])].sort();
  for (const t of tables) {
    const a = source[t];
    const b = target[t];
    if (a === undefined) out.push(`${t}: hanya ada di tujuan (${b} baris)`);
    else if (b === undefined) out.push(`${t}: tidak ada di tujuan (asal ${a} baris)`);
    else if (a !== b) out.push(`${t}: asal ${a} baris, tujuan ${b} baris`);
  }
  return out;
}

export interface MoveArgs {
  databaseName: string | null;
  /** `null` = instans bawaan. `undefined` = tidak disebut (galat). */
  to: string | null | undefined;
  apply: boolean;
  reason: string | null;
}

/** `--database <nama> --to <kunci|default> [--apply --reason "…"]`. */
export function parseMoveArgs(argv: readonly string[]): MoveArgs {
  const value = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const to = value("--to");
  return {
    databaseName: value("--database") ?? null,
    to: to === undefined ? undefined : to === DEFAULT_DB_INSTANCE_LABEL ? null : to,
    apply: argv.includes("--apply"),
    reason: value("--reason") ?? null,
  };
}
