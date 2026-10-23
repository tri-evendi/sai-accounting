/**
 * Bagian bersama skrip paritas Laba Rugi, Neraca, Umur Piutang & Umur Utang
 * (tahap 1d, 09 §9).
 *
 * Skrip Neraca Saldo (`parity-trial-balance*.ts`) lahir lebih dulu dan menulis
 * semuanya sendiri; yang di sini adalah yang SAMA persis di empat skrip
 * berikutnya — dan dua di antaranya adalah janji keselamatan yang tidak boleh
 * berbeda antarskrip:
 *
 *   • `readOnlyBook()` — sisi TS berjalan di dalam transaksi `READ ONLY`
 *     (PostgreSQL sendiri yang menolak tulisan), bukan hanya "kebetulan
 *     memanggil fungsi baca". Sisi Go sudah begitu (`ledgerread.readOnly`).
 *   • `defaultInstanceOnly()` — perkakas Go menyambung lewat template BAWAAN
 *     saja; PT di instans lain DITOLAK sebagai gagal, bukan dibandingkan dengan
 *     basis data senama di server bawaan (tahap 4, MULTI-COMPANY §6).
 */
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

import { controlDb } from "@sai/core/control-db";
import { BUSINESS_TIME_ZONE, businessISODate } from "@sai/core/business-date";
import { COMPANY_DATABASE_TARGET_SELECT } from "@sai/db/company-url";
import type { CompanyContext } from "../../src/lib/company-context";
import { prisma } from "../../src/lib/prisma";
import { resolveAsOf, resolvePeriod } from "../../src/lib/report-catalog";
import { COMPARISON_MODES, type ComparisonMode } from "../../src/lib/statement-compare";

const run = promisify(execFile);

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1) return undefined;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith("--")) {
    console.error(`${name} butuh nilai`);
    process.exit(2);
  }
  return v;
}

export const list = (v: string | undefined) =>
  (v ?? "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);

export function isoDate(d: string, flag: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    console.error(`${flag} bukan YYYY-MM-DD: ${d}`);
    process.exit(2);
  }
  return d;
}

/**
 * Periode Laba Rugi: `--period a..b,c..d`, atau tiga bawaan — tahun berjalan
 * s.d. hari ini, tahun lalu penuh (melewati jurnal penutup #555 bila tahun itu
 * sudah ditutup), dan Juli tahun lalu – Juni tahun ini (melintasi akhir tahun).
 * `resolvePeriod` yang SAMA dengan layar dan penerbit Go: tanggal → instan
 * batas hari Jakarta, rentang terbalik ditukar. Instannya diserahkan APA ADANYA
 * ke Go.
 */
export function incomePeriods(raw: string | undefined, now = new Date()) {
  const today = businessISODate(now);
  const year = Number(today.slice(0, 4));
  const asked = list(raw).map((p) => {
    const [from, to] = p.split("..");
    return { from: isoDate(from ?? "", "--period"), to: isoDate(to ?? "", "--period") };
  });
  const wanted =
    asked.length > 0
      ? asked
      : [
          { from: `${year}-01-01`, to: today },
          { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` },
          { from: `${year - 1}-07-01`, to: `${year}-06-30` },
        ];
  return wanted.map((p) => resolvePeriod(p.from, p.to, now));
}

/** Tanggal Neraca: `--as-of a,b` atau hari ini — `resolveAsOf` yang sama dengan layar. */
export function asOfDates(raw: string | undefined, now = new Date()) {
  const dates = list(raw).map((d) => isoDate(d, "--as-of"));
  return (dates.length > 0 ? dates : [undefined]).map((d) => resolveAsOf(d, now));
}

/** PT yang diperiksa: aktif (atau semua dengan `--include-inactive`), opsional per slug. */
/**
 * `--compare none,previous_year,preceding` → mode kolom pembanding (#557) yang
 * diperiksa paritas ISI lembar sebar. `none` = lembar satu kolom. Bawaannya
 * KETIGANYA: peralihan register ke `go` memindahkan tombol Excel halaman ke
 * jalur Go untuk ketiga bentuk itu sekaligus, jadi paritas yang hanya
 * membuktikan satu bentuk membuktikan sepertiganya.
 */
export function compareModes(raw: string | undefined): ("" | ComparisonMode)[] {
  const asked = list(raw);
  const wanted = asked.length > 0 ? asked : ["none", ...COMPARISON_MODES];
  return wanted.map((m) => {
    if (m === "none") return "";
    if (!(COMPARISON_MODES as readonly string[]).includes(m)) {
      console.error(`--compare bukan none|${COMPARISON_MODES.join("|")}: ${m}`);
      process.exit(2);
    }
    return m as ComparisonMode;
  });
}

export async function loadCompanies() {
  if (!process.env.CONTROL_DATABASE_URL) {
    console.error("CONTROL_DATABASE_URL belum diset — tidak tahu di mana daftar perusahaannya.");
    process.exit(2);
  }
  const slugs = list(arg("--company"));
  const companies = await controlDb.company.findMany({
    where: {
      ...(process.argv.includes("--include-inactive") ? {} : { isActive: true }),
      ...(slugs.length > 0 ? { slug: { in: slugs } } : {}),
    },
    select: { id: true, slug: true, name: true, ...COMPANY_DATABASE_TARGET_SELECT },
    orderBy: { id: "asc" },
  });
  const missing = slugs.filter((s) => !companies.some((c) => c.slug === s));
  if (missing.length > 0) {
    console.error(`PT tidak ditemukan: ${missing.join(", ")}`);
    process.exit(2);
  }
  return companies;
}

/** Lihat kepala berkas. Melempar — pemanggil menghitungnya sebagai GAGAL. */
export function defaultInstanceOnly(context: CompanyContext): CompanyContext {
  if (context.dbInstance !== null) {
    throw new Error(`instans "${context.dbInstance.key}" belum didukung perkakas paritas Go`);
  }
  return context;
}

type BookClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Jalankan `fn` dengan klien buku PT aktif di dalam transaksi
 * `REPEATABLE READ, READ ONLY` — semua kueri satu laporan melihat satu potret,
 * dan tulisan apa pun ditolak PostgreSQL (`cannot execute … in a read-only
 * transaction`). SELALU digulung balik oleh Prisma bila `fn` melempar; bila
 * tidak, `COMMIT` atas transaksi hanya-baca tidak mengubah apa pun.
 */
export function readOnlyBook<T>(fn: (tx: BookClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`;
      return fn(tx);
    },
    /* Bawaan interactive transaction 5 detik — Laba Rugi setahun atas buku
       besar bisa melewatinya, dan transaksi yang habis waktu terbaca GAGAL. */
    { maxWait: 30_000, timeout: 300_000 }
  );
}

/**
 * Batas tahun buku TS (`fiscalYearBounds`) memakai zona PROSES; produksi
 * memasang `TZ=Asia/Jakarta`, Go memakai `Asia/Jakarta` eksplisit. Paritas di
 * zona lain akan melaporkan selisih yang tidak ada di produksi (atau menyembunyikan
 * yang ada) — jadi skrip MENOLAK berjalan, alih-alih diam-diam membandingkan
 * dua hal yang berbeda.
 */
export function requireBusinessTimeZone(): void {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz !== BUSINESS_TIME_ZONE) {
    console.error(
      `Zona proses ${tz}, bukan ${BUSINESS_TIME_ZONE}: batas tahun buku Neraca TS ikut zona ` +
        `proses. Jalankan dengan TZ=${BUSINESS_TIME_ZONE} (bawaan image).`
    );
    process.exit(2);
  }
}

/** Jalankan perkakas Go (`--go-bin` / `PARITY_GO_BIN`, atau `go run ./cmd/parity`). */
export async function runGo(argv: string[], maxBuffer = 256 * 1024 * 1024): Promise<string> {
  const bin = arg("--go-bin") ?? process.env.PARITY_GO_BIN;
  const opsi = { maxBuffer, env: process.env };
  const { stdout } = bin
    ? await run(bin, argv, opsi)
    : await run("go", ["run", "./cmd/parity", ...argv], {
        ...opsi,
        cwd: join(process.cwd(), "services", "integrator"),
      });
  return stdout;
}

export interface Tally {
  setara: number;
  berselisih: number;
  gagal: number;
}

export function report(label: string, diffs: string[], ok: string, tally: Tally): void {
  if (diffs.length === 0) {
    tally.setara += 1;
    console.log(`  ✓ ${label}: ${ok}`);
    return;
  }
  tally.berselisih += 1;
  console.error(`  ✗ ${label}: ${diffs.length} selisih`);
  for (const d of diffs.slice(0, 50)) console.error(`      ${d}`);
  if (diffs.length > 50) console.error(`      … ${diffs.length - 50} lagi`);
}

export function failed(label: string, error: unknown, tally: Tally): void {
  tally.gagal += 1;
  const e = error as { message?: string; stderr?: string };
  console.error(`  ✗ ${label}: GAGAL — ${e.stderr?.trim() || e.message || String(error)}`);
}

/** Ringkasan + kode keluar: bukan-nol pada satu selisih, satu gagal, atau nol buku. */
export function finish(books: number, cases: number, unit: string, tally: Tally): void {
  console.log(
    `\n${books} buku × ${cases} ${unit}: ` +
      `${tally.setara} setara · ${tally.berselisih} berselisih · ${tally.gagal} gagal`
  );
  if (books === 0) {
    console.error("Nol buku diperiksa — paritas atas nol buku bukan bukti.");
    process.exitCode = 1;
  }
  if (tally.berselisih > 0 || tally.gagal > 0) process.exitCode = 1;
}

// ── Umur Piutang & Umur Utang (tahap 1d) ──────────────────────────────────

/** Laporan umur yang diminta — argumen posisi pertama skrip (`package.json`). */
export function agingKind(): "receivables" | "payables" {
  const k = process.argv[2];
  if (k !== "receivables" && k !== "payables") {
    console.error(`argumen pertama harus receivables|payables, bukan ${String(k)}`);
    process.exit(2);
  }
  return k;
}

/**
 * Tanggal Umur Piutang/Utang: `--as-of a,b`, atau TIGA bawaan — hari ini,
 * 30 Juni (tahun ini bila sudah lewat, kalau belum tahun lalu), dan
 * 31 Desember tahun lalu. Tanggal lampau menguji potret historis (pelunasan
 * sesudah asOf belum melunasi apa pun), yang tak teruji per hari ini.
 */
export function agingAsOfDates(raw: string | undefined, now = new Date()) {
  if (list(raw).length > 0) return asOfDates(raw, now);
  const today = businessISODate(now);
  const year = Number(today.slice(0, 4));
  const midYear = `${year}-06-30` <= today ? `${year}-06-30` : `${year - 1}-06-30`;
  return [today, midYear, `${year - 1}-12-31`].map((d) => resolveAsOf(d, now));
}

/** `--overdue all,only` → saringan "hanya jatuh tempo" yang diperiksa (bawaan keduanya). */
export function overdueModes(raw: string | undefined): boolean[] {
  const asked = list(raw);
  const wanted = asked.length > 0 ? asked : ["all", "only"];
  return wanted.map((m) => {
    if (m !== "all" && m !== "only") {
      console.error(`--overdue bukan all|only: ${m}`);
      process.exit(2);
    }
    return m === "only";
  });
}

/**
 * `--cols "|party|documentNo,age"` → varian `?cols=` yang diperiksa paritas
 * ISI lembar; `|` memisahkan varian (koma milik nilainya), varian kosong =
 * kolom bawaan. Bawaannya: bawaan, `party` saja, dan sebagian kolom.
 */
export function columnVariants(raw: string | undefined): string[] {
  if (raw === undefined) return ["", "party", "documentNo,dueDate,age,outstanding"];
  return raw.split("|").map((v) => v.trim());
}
