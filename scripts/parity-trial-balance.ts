/**
 * PARITAS NERACA SALDO — TypeScript ⇄ Go, terhadap buku sungguhan (tahap 1d).
 *
 *   bun run parity:trial-balance                          # semua PT aktif, per hari ini
 *   bun run parity:trial-balance -- --company pt-a,pt-b   # PT tertentu (slug)
 *   bun run parity:trial-balance -- --as-of 2025-12-31,2026-06-30
 *   bun run parity:trial-balance -- --go-bin ./parity     # biner Go yang sudah dibangun
 *   bun run parity:trial-balance -- --include-inactive    # ikut PT nonaktif
 *
 * Untuk setiap (PT × tanggal): `getTrialBalance()` TypeScript dijalankan di
 * dalam `runWithCompany()`, perkakas Go (`services/integrator/cmd/parity`)
 * dijalankan terhadap basis data yang SAMA dengan instan `asOf` yang SAMA,
 * lalu keduanya dibandingkan baris demi baris oleh
 * `src/lib/trial-balance-parity.ts`. Keluar bukan-nol bila ada SATU selisih
 * atau satu buku yang gagal dibaca — buku yang tak terbaca bukan buku yang
 * setara.
 *
 * ══ HANYA MEMBACA ══════════════════════════════════════════════════════════
 * Sisi TS: `getTrialBalance` hanya `groupBy` + `findMany`. Sisi Go: transaksi
 * `READ ONLY`. Aman diarahkan ke buku produksi; itulah gunanya.
 *
 * ══ BINER GO ═══════════════════════════════════════════════════════════════
 * Tanpa `--go-bin` (atau `PARITY_GO_BIN`), skrip memanggil `go run ./cmd/parity`
 * dan karena itu butuh toolchain Go. Di produksi, bangun biner statisnya sekali
 * lalu pasang ke container migrator — perintah lengkapnya di
 * docs/arsitektur/09-RANCANGAN-LAYANAN.md §9.
 *
 * ══ KENAPA `--conditions=react-server` ═════════════════════════════════════
 * `src/lib/reports.ts` menarik modul ber-`server-only`; tanpa kondisi itu tsx
 * mati saat impor (lihat `tests/worker-server-only.test.ts`).
 */
import "dotenv/config";

import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

import { controlDb } from "@sai/core/control-db";
import { companyContextOf, runWithCompany } from "../src/lib/company-context";
import { COMPANY_DATABASE_TARGET_SELECT } from "@sai/db/company-url";
import { disconnectAllCompanyClients } from "../src/lib/company-clients";
import { getTrialBalance } from "../src/lib/reports";
import { resolveAsOf } from "../src/lib/report-catalog";
import { reportEngine } from "../src/lib/report-engine";
import { compareTrialBalance, type GoTrialBalance } from "../src/lib/trial-balance-parity";

const run = promisify(execFile);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1) return undefined;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith("--")) {
    console.error(`${name} butuh nilai`);
    process.exit(2);
  }
  return v;
}

const list = (v: string | undefined) =>
  (v ?? "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);

/** Satu laporan dari sisi Go, untuk satu basis data dan satu instan. */
async function goTrialBalance(databaseName: string, asOf: Date): Promise<GoTrialBalance> {
  const bin = arg("--go-bin") ?? process.env.PARITY_GO_BIN;
  const argv = ["trial-balance", "-database", databaseName, "-as-of", asOf.toISOString()];
  const opsi = { maxBuffer: 256 * 1024 * 1024, env: process.env };
  const { stdout } = bin
    ? await run(bin, argv, opsi)
    : await run("go", ["run", "./cmd/parity", ...argv], {
        ...opsi,
        cwd: join(process.cwd(), "services", "integrator"),
      });
  return JSON.parse(stdout) as GoTrialBalance;
}

async function main() {
  if (!process.env.CONTROL_DATABASE_URL) {
    console.error("CONTROL_DATABASE_URL belum diset — tidak tahu di mana daftar perusahaannya.");
    process.exit(2);
  }

  const engine = reportEngine("trial-balance");
  console.log(`Neraca Saldo · pemilik jalur berkas hari ini: ${engine} (src/lib/report-engine.ts)`);

  const slugs = list(arg("--company"));
  const companies = await controlDb.company.findMany({
    where: {
      ...(process.argv.includes("--include-inactive") ? {} : { isActive: true }),
      ...(slugs.length > 0 ? { slug: { in: slugs } } : {}),
    },
    select: { id: true, slug: true, ...COMPANY_DATABASE_TARGET_SELECT },
    orderBy: { id: "asc" },
  });
  const missing = slugs.filter((s) => !companies.some((c) => c.slug === s));
  if (missing.length > 0) {
    console.error(`PT tidak ditemukan: ${missing.join(", ")}`);
    process.exit(2);
  }

  /* `resolveAsOf` yang SAMA dengan jalur ekspor: tanggal → instan akhir hari.
     Instan yang dihasilkan diserahkan APA ADANYA ke Go, jadi kedua sisi
     menghitung batas yang identik apa pun zona waktu prosesnya. */
  const dates = list(arg("--as-of"));
  const asOfs = (dates.length > 0 ? dates : [undefined]).map((d) => {
    if (d !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      console.error(`--as-of bukan YYYY-MM-DD: ${d}`);
      process.exit(2);
    }
    return resolveAsOf(d);
  });

  let setara = 0;
  let berselisih = 0;
  let gagal = 0;

  for (const c of companies) {
    for (const { asOf, asOfISO } of asOfs) {
      const label = `${c.slug} (${c.databaseName}) per ${asOfISO}`;
      try {
        /* Perkakas Go menyambung lewat template bawaan saja. PT di instans lain
           ditolak sebagai gagal, bukan dibandingkan dengan basis data senama
           di server bawaan (tahap 4, docs/MULTI-COMPANY.md §6). */
        const context = companyContextOf(c);
        if (context.dbInstance !== null) {
          throw new Error(`instans "${context.dbInstance.key}" belum didukung perkakas paritas Go`);
        }
        const ts = await runWithCompany(context, () => getTrialBalance(asOf));
        const go = await goTrialBalance(c.databaseName, asOf);
        const diffs = compareTrialBalance(ts, go);

        if (go.unknownTypes.length > 0) {
          console.warn(`  ⚠ ${label}: akun bertipe di luar kontrak: ${go.unknownTypes.join(", ")}`);
        }
        if (diffs.length === 0) {
          setara += 1;
          console.log(
            `  ✓ ${label}: ${ts.rows.length} baris · debit ${go.totalDebit} · ` +
              `kredit ${go.totalCredit} · ${go.balanced ? "seimbang" : "TIMPANG (sama di kedua sisi)"}`
          );
        } else {
          berselisih += 1;
          console.error(`  ✗ ${label}: ${diffs.length} selisih`);
          for (const d of diffs.slice(0, 50)) console.error(`      ${d}`);
          if (diffs.length > 50) console.error(`      … ${diffs.length - 50} lagi`);
        }
      } catch (error) {
        gagal += 1;
        const e = error as { message?: string; stderr?: string };
        console.error(`  ✗ ${label}: GAGAL — ${e.stderr?.trim() || e.message || String(error)}`);
      }
    }
  }

  console.log(
    `\n${companies.length} buku × ${asOfs.length} tanggal: ` +
      `${setara} setara · ${berselisih} berselisih · ${gagal} gagal`
  );
  if (companies.length === 0) {
    console.error("Nol buku diperiksa — paritas atas nol buku bukan bukti.");
    process.exitCode = 1;
  }
  if (berselisih > 0 || gagal > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllCompanyClients();
    await controlDb.$disconnect();
  });
