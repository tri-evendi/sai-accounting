/**
 * PARITAS ISI LEMBAR SEBAR NERACA SALDO — TypeScript ⇄ Go, terhadap buku
 * sungguhan (tahap 1d).
 *
 *   bun run parity:trial-balance-xlsx                          # semua PT aktif, per hari ini
 *   bun run parity:trial-balance-xlsx -- --company pt-a,pt-b
 *   bun run parity:trial-balance-xlsx -- --as-of 2025-12-31,2026-06-30
 *   bun run parity:trial-balance-xlsx -- --go-bin ./parity     # biner Go yang sudah dibangun
 *
 * Untuk setiap (PT × tanggal): lembar TS dirakit PERSIS seperti jalur berkas TS
 * yang dicabut merakitnya (`buildReportPayload` → `buildReportSheet` →
 * `buildWorkbookBuffer` dengan `getCompanyIdentity()`), lembar Go dirakit
 * `cmd/parity trial-balance-xlsx` — kode `internal/document` yang SAMA dengan
 * pelari `svc-interactive-go` — dan keduanya dibandingkan ISI-nya oleh
 * `src/lib/xlsx-content-parity.ts` (definisi paritasnya ada di sana). Keluar
 * bukan-nol pada satu selisih atau satu buku yang gagal.
 *
 * Paritas ANGKA-nya sudah dibuktikan `parity:trial-balance` (baris demi baris,
 * pada sen); skrip ini membuktikan BERKAS-nya: kalimat, kolom, format angka,
 * rupa, dan bahwa angka yang sama mendarat di sel yang sama dengan tipe yang
 * sama.
 *
 * ══ HANYA MEMBACA ══════════════════════════════════════════════════════════
 * Sisi TS membaca buku dan `company_settings`; sisi Go transaksi `READ ONLY`.
 * Berkas keduanya ditulis ke direktori sementara dan dibuang. Aman diarahkan
 * ke buku produksi — perintah lengkapnya di 09 §9.
 */
import "dotenv/config";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { controlDb } from "@sai/core/control-db";
import { companyContextOf, runWithCompany } from "../src/lib/company-context";
import { COMPANY_DATABASE_TARGET_SELECT } from "@sai/db/company-url";
import { disconnectAllCompanyClients } from "../src/lib/company-clients";
import { getCompanyIdentity } from "../src/lib/company-identity";
import { isExportable, reportById, resolveAsOf } from "../src/lib/report-catalog";
import { reportEngine } from "../src/lib/report-engine";
import { buildReportPayload } from "../src/lib/report-payload";
import { buildReportSheet } from "../src/lib/report-export";
import { buildWorkbookBuffer } from "../src/lib/xlsx";
import { compareWorkbookContent } from "../src/lib/xlsx-content-parity";

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

async function goWorkbook(
  databaseName: string,
  registryName: string,
  asOf: Date,
  asOfISO: string,
  out: string
): Promise<Uint8Array> {
  const bin = arg("--go-bin") ?? process.env.PARITY_GO_BIN;
  const argv = [
    "trial-balance-xlsx",
    "-database", databaseName,
    "-as-of", asOf.toISOString(),
    "-as-of-date", asOfISO,
    "-registry-name", registryName,
    "-out", out,
  ];
  const opsi = { maxBuffer: 16 * 1024 * 1024, env: process.env };
  if (bin) await run(bin, argv, opsi);
  else {
    await run("go", ["run", "./cmd/parity", ...argv], {
      ...opsi,
      cwd: join(process.cwd(), "services", "integrator"),
    });
  }
  return new Uint8Array(await readFile(out));
}

async function main() {
  if (!process.env.CONTROL_DATABASE_URL) {
    console.error("CONTROL_DATABASE_URL belum diset — tidak tahu di mana daftar perusahaannya.");
    process.exit(2);
  }
  const report = reportById("trial-balance");
  if (!report || !isExportable(report)) throw new Error("trial-balance hilang dari katalog");
  console.log(
    `Neraca Saldo (lembar sebar) · pemilik jalur berkas: ${reportEngine(report.id)} (src/lib/report-engine.ts)`
  );

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

  const dates = list(arg("--as-of"));
  const asOfs = (dates.length > 0 ? dates : [undefined]).map((d) => {
    if (d !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      console.error(`--as-of bukan YYYY-MM-DD: ${d}`);
      process.exit(2);
    }
    return resolveAsOf(d);
  });

  const kerja = await mkdtemp(join(tmpdir(), "parity-xlsx-"));
  let setara = 0;
  let berselisih = 0;
  let gagal = 0;

  try {
    for (const c of companies) {
      for (const { asOf, asOfISO } of asOfs) {
        const label = `${c.slug} (${c.databaseName}) per ${asOfISO}`;
        try {
          /* Perkakas paritas Go menyambung lewat template bawaan saja; PT di
             instans lain ditolak sebagai gagal (tahap 4, MULTI-COMPANY §6). */
          const context = companyContextOf(c);
          if (context.dbInstance !== null) {
            throw new Error(`instans "${context.dbInstance.key}" belum didukung perkakas paritas Go`);
          }
          const ts = await runWithCompany(
            context,
            async () => {
              const payload = await buildReportPayload(report, { asOf: asOfISO });
              const buf = await buildWorkbookBuffer(
                [buildReportSheet(payload)],
                await getCompanyIdentity()
              );
              return new Uint8Array(buf);
            }
          );
          const go = await goWorkbook(
            c.databaseName,
            c.name,
            asOf,
            asOfISO,
            join(kerja, `${c.id}-${asOfISO}.xlsx`)
          );
          const beda = await compareWorkbookContent(ts, go);
          if (beda.length === 0) {
            setara += 1;
            console.log(`  ✓ ${label}: isi setara (TS ${ts.length} B · Go ${go.length} B)`);
          } else {
            berselisih += 1;
            console.error(`  ✗ ${label}: ${beda.length} selisih`);
            for (const d of beda.slice(0, 50)) console.error(`      ${d}`);
            if (beda.length > 50) console.error(`      … ${beda.length - 50} lagi`);
          }
        } catch (error) {
          gagal += 1;
          const e = error as { message?: string; stderr?: string };
          console.error(`  ✗ ${label}: GAGAL — ${e.stderr?.trim() || e.message || String(error)}`);
        }
      }
    }
  } finally {
    await rm(kerja, { recursive: true, force: true });
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
