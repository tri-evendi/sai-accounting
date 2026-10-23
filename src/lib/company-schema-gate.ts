/**
 * GERBANG SKEMA PER PERUSAHAAN (09 §6) — "perusahaan INI siap", bukan "semua
 * perusahaan siap".
 *
 * ══ KENAPA GERBANG INI ADA ════════════════════════════════════════════════
 * Gerbang boot (`@sai/platform/schema-gate`) memeriksa basis data KENDALI saja.
 * Selama migration buku dijalankan sebagai langkah PEMBLOKIR, itu cukup:
 * aplikasi baru tidak naik sebelum setiap buku termigrasi. Sejak migration
 * buku boleh GAGAL SEBAGIAN tanpa menahan rilis (`db:migrate:release`,
 * 02 §12), ada keadaan baru yang sah: image versi N melayani 16 buku di
 * kepala N dan satu buku yang tertinggal di N-1.
 *
 * Expand/contract (DATABASE.md §7.1) menjamin arah SEBALIKNYA — kode LAMA di
 * skema BARU. Ia tidak menjamin kode BARU di skema LAMA: kode baru boleh
 * menyebut kolom yang dibawa migration yang belum diterapkan, dan
 * kegagalannya tidak seragam (halaman yang tidak menyentuh kolom itu tetap
 * sempurna). Karena itu buku yang tertinggal DITUTUP — hanya buku itu — sampai
 * migration-nya sampai.
 *
 * ══ DI MANA IA DIPERIKSA ═════════════════════════════════════════════════
 *  • `@/lib/prisma` — SETIAP query buku lewat proxy itu, jadi halaman, route,
 *    pekerja `ledger`, dan skrip semuanya tertahan. Ini sabuk pengamannya:
 *    `CompanySchemaBehindError`.
 *  • Penjaga halaman & API (`page-auth.ts`, `auth-guard.ts`) — supaya yang
 *    terlihat pengguna adalah layar "buku sedang diperbarui" dan 503 yang
 *    bisa diulang, bukan layar galat.
 *
 * ══ BIAYANYA: SATU QUERY PER BUKU PER PROSES ══════════════════════════════
 * Vonis `mutakhir` dan `mendahului` disimpan SELAMANYA dalam proses: skema
 * hanya bergerak maju selama image ini hidup, dan migration berikutnya ditulis
 * expand-only justru supaya image yang SEDANG berjalan tetap benar sesudahnya.
 * Vonis yang menutup (`tertinggal`, `menggantung`) dan `tak_terbaca` disimpan
 * `RETRY_MS` saja — buku yang baru termigrasi terbuka dalam hitungan detik,
 * tanpa restart dan tanpa sinyal dari penerap migration.
 *
 * Cache dikunci per `companyId` + kunci kolam (instans + nama basis data):
 * buku yang dipindah ke instans lain diperiksa ulang di tempat barunya
 * (aturan cache multi-perusahaan, AGENTS.md).
 *
 * ⚠ `tak_terbaca` DILAYANI, sama seperti gerbang kendali: basis data yang
 * sedang restart bukan skema yang kedaluwarsa, dan query-nya sendiri yang
 * akan gagal bila buku itu memang tak terjangkau.
 */
import { companyPoolKey, type CompanyDatabaseTarget } from "@sai/db/company-url";
import { MIGRATION_TERAKHIR } from "@sai/core/migration-manifest";
import { readMigrationSummary } from "@sai/core/migration-summary";
import { vonisVersi, type StatusVersi } from "@sai/core/schema-version";
import { getCompanyClient } from "@/lib/company-clients";

/** Berapa lama vonis yang menutup (atau tak terbaca) dipercaya sebelum ditanya ulang. */
export const RETRY_MS = 5_000;

export interface CompanySchemaTarget extends CompanyDatabaseTarget {
  readonly companyId: number;
  readonly slug: string;
}

export interface CompanySchemaVerdict {
  /** `false` = buku ini ditutup sampai migration-nya sampai. */
  serve: boolean;
  status: StatusVersi;
  /** Migration terakhir yang terpasang di buku ini. */
  found: string | null;
  /** Yang dibawa image ini. */
  expected: string;
}

/**
 * Dilempar proxy `prisma` saat buku yang dituju belum boleh dilayani image ini.
 * `status` 503 — keadaan sementara yang hilang sendiri, bukan kesalahan
 * pemanggil.
 */
export class CompanySchemaBehindError extends Error {
  readonly status = 503;
  constructor(
    readonly companyId: number,
    readonly slug: string,
    readonly verdict: CompanySchemaVerdict
  ) {
    super(
      `Buku ${slug} (perusahaan ${companyId}) belum sepadan dengan image ini: ` +
        `${verdict.status}, terpasang ${verdict.found ?? "(belum ada)"}, image membawa ` +
        `${verdict.expected}. Buku ini ditutup sampai \`bun run db:migrate:companies\` ` +
        "sampai padanya — perusahaan lain tidak terpengaruh."
    );
    this.name = "CompanySchemaBehindError";
  }
}

interface Entry {
  verdict: CompanySchemaVerdict;
  /** `Infinity` = tidak pernah ditanya ulang dalam proses ini. */
  until: number;
}

const globalForGate = globalThis as unknown as {
  companySchemaGate: Map<string, Entry> | undefined;
};
const cache: Map<string, Entry> = globalForGate.companySchemaGate ?? new Map();
if (process.env.NODE_ENV !== "production") globalForGate.companySchemaGate = cache;
const inflight = new Map<string, Promise<Entry>>();

function keyOf(target: CompanySchemaTarget): string {
  return `${target.companyId}|${companyPoolKey(target)}`;
}

/** Vonis murni → apakah buku dilayani. Hanya dua keadaan yang menutup. */
export function servesStatus(status: StatusVersi): boolean {
  return status !== "tertinggal" && status !== "menggantung";
}

async function evaluate(target: CompanySchemaTarget, now: number): Promise<Entry> {
  const expected = MIGRATION_TERAKHIR.company;
  const ringkasan = await readMigrationSummary(getCompanyClient(target));
  const status = vonisVersi(ringkasan, expected);
  const verdict: CompanySchemaVerdict = {
    serve: servesStatus(status),
    status,
    found: ringkasan?.terakhir ?? null,
    expected,
  };
  const permanen = status === "mutakhir" || status === "mendahului";
  return { verdict, until: permanen ? Number.POSITIVE_INFINITY : now + RETRY_MS };
}

/** Vonis gerbang untuk satu buku — dari cache bila masih berlaku. */
export async function companySchemaVerdict(target: CompanySchemaTarget): Promise<CompanySchemaVerdict> {
  const key = keyOf(target);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.until > now) return hit.verdict;

  /* Satu pertanyaan per buku sekaligus: seratus query yang tiba bersamaan
     pada buku yang belum terperiksa menunggu SATU jawaban, bukan seratus. */
  let pending = inflight.get(key);
  if (!pending) {
    pending = evaluate(target, now).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  const entry = await pending;
  cache.set(key, entry);
  return entry.verdict;
}

/** Melempar `CompanySchemaBehindError` bila buku ini belum boleh dilayani. */
export async function assertCompanySchemaServable(target: CompanySchemaTarget): Promise<void> {
  const verdict = await companySchemaVerdict(target);
  if (!verdict.serve) throw new CompanySchemaBehindError(target.companyId, target.slug, verdict);
}

/** Hanya untuk tes. */
export function resetCompanySchemaGate(): void {
  cache.clear();
  inflight.clear();
}
