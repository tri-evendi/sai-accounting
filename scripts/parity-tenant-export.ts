/**
 * PARITAS EKSPOR DATA MANDIRI — TS ⇄ Go, terhadap tenant sungguhan (#142,
 * kind `tenant.data_export` di jalur `bulk`).
 *
 *   bun run parity:tenant-export                          # SEMUA tenant
 *   bun run parity:tenant-export -- --tenant acme,pt-b    # tenant tertentu (slug)
 *   bun run parity:tenant-export -- --go-bin /tmp/parity # biner Go yang sudah dibangun
 *   bun run parity:tenant-export -- --tmp /var/tmp/x      # tempat arsip sementara
 *   bun run parity:tenant-export -- --keep                # arsipnya tidak dibuang
 *
 * Untuk setiap tenant: arsip TS dibangun `buildTenantExport` (kode yang SAMA
 * dengan `GET /api/tenant/export`, diimpor — bukan disalin) dan arsip Go oleh
 * `cmd/parity tenant-export` (kode yang SAMA dengan pelari jalur `bulk`),
 * keduanya dengan stempel "Dibuat" yang SAMA. Lalu `cmd/parity zip-compare`
 * membandingkan BERKAS demi BERKAS: himpunan nama entri, dan SHA-256 isi
 * setiap entri yang sudah diekstrak — CSV setiap tabel setiap PT, berkas
 * dokumen, `BERKAS-TIDAK-DITEMUKAN.txt`, `tenant.json`, `BACA-SAYA.txt`. Nama
 * berkas ZIP-nya dan angka PT/tabel/baris juga dibandingkan. Entri folder dan
 * cara memampatkan TIDAK dibandingkan: yang diterima pengguna isi berkasnya.
 * Keluar bukan-nol pada SATU selisih atau satu tenant yang gagal.
 *
 * ══ HANYA MEMBACA ══════════════════════════════════════════════════════════
 * Tidak ada baris `jobs` dan tidak ada jejak audit tenant yang ditulis di sisi
 * mana pun: paritas bukan permintaan ekspor. Sisi Go membaca setiap buku di
 * transaksi READ ONLY (`ledgerread`); sisi TS hanya SELECT. Yang DITULIS
 * hanyalah dua arsip sementara di `--tmp` (bawaan: direktori sementara OS),
 * dibuang sesudah dibandingkan — ⚠ ukurannya sebesar ekspor tenant itu
 * (dokumen ikut), jadi arahkan `--tmp` ke cakram yang lega di produksi.
 *
 * ══ DOKUMEN ════════════════════════════════════════════════════════════════
 * Sisi TS membaca `data/documents` relatif ke direktori kerja
 * (`DOCUMENTS_ROOT`); sisi Go menerima akar YANG SAMA lewat `-documents-root`.
 * Di produksi skrip ini harus berjalan di container yang memasang volume
 * `documents` — lihat PRODUCTION.md §Ekspor data mandiri.
 *
 * Lulus di produksi adalah SYARAT `runner: go` untuk `tenant.data_export` di
 * `contract/kinds.yaml`.
 */
import "dotenv/config";

import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import { controlDb } from "@sai/core/control-db";
import { KIND_RUNNERS } from "@sai/core/generated/job-kinds";
import { disconnectAllCompanyClients } from "../src/lib/company-clients";
import { DOCUMENTS_ROOT } from "../src/lib/document-storage";
import { buildTenantExport } from "../src/lib/tenant-export";
import { arg, failed, finish, list, report, runGo, type Tally } from "./lib/parity";

interface GoSummary {
  filename: string;
  companies: number;
  tables: number;
  rows: number;
  documents: number;
  missing: number;
}

interface ZipComparison {
  same: number;
  bytes: number;
  onlyTs: string[];
  onlyGo: string[];
  differ: { name: string; detail: string }[];
  tsFiles: number;
  goFiles: number;
}

async function main() {
  console.log(
    `Ekspor data mandiri · pelaksana hari ini: ${KIND_RUNNERS["tenant.data_export"]} ` +
      "(contract/kinds.yaml → runner)"
  );
  if (!process.env.CONTROL_DATABASE_URL) {
    console.error("CONTROL_DATABASE_URL belum diset — tidak tahu di mana daftar tenantnya.");
    process.exit(2);
  }
  const slugs = list(arg("--tenant"));
  const tenants = await controlDb.tenant.findMany({
    where: slugs.length > 0 ? { slug: { in: slugs } } : {},
    select: { id: true, slug: true },
    orderBy: { id: "asc" },
  });
  const missing = slugs.filter((s) => !tenants.some((t) => t.slug === s));
  if (missing.length > 0) {
    console.error(`tenant tidak ditemukan: ${missing.join(", ")}`);
    process.exit(2);
  }

  const tmpRoot = await mkdtemp(path.join(arg("--tmp") ?? os.tmpdir(), "parity-tenant-export-"));
  const keep = process.argv.includes("--keep");
  const tally: Tally = { setara: 0, berselisih: 0, gagal: 0 };
  try {
    for (const tenant of tenants) {
      const label = `${tenant.slug} (#${tenant.id})`;
      const tsZip = path.join(tmpRoot, `${tenant.slug}-ts.zip`);
      const goZip = path.join(tmpRoot, `${tenant.slug}-go.zip`);
      try {
        /* Satu instan untuk KEDUA sisi: "Dibuat" di `tenant.json` dan
           `BACA-SAYA.txt`, dan tanggal di nama berkas. */
        const now = new Date();
        const ts = await buildTenantExport(tenant.id, { now });
        await pipeline(ts.openStream(), createWriteStream(tsZip));

        const go = JSON.parse(
          await runGo([
            "tenant-export",
            "-tenant-id",
            String(tenant.id),
            "-generated-at",
            now.toISOString(),
            "-documents-root",
            DOCUMENTS_ROOT,
            "-out",
            goZip,
          ])
        ) as GoSummary;
        const cmp = JSON.parse(
          await runGo(["zip-compare", "-ts", tsZip, "-go", goZip])
        ) as ZipComparison;

        const diffs: string[] = [];
        if (ts.filename !== go.filename)
          diffs.push(`nama berkas: TS ${ts.filename} ≠ Go ${go.filename}`);
        if (ts.companies !== go.companies)
          diffs.push(`PT: TS ${ts.companies} ≠ Go ${go.companies}`);
        if (ts.tables !== go.tables) diffs.push(`tabel: TS ${ts.tables} ≠ Go ${go.tables}`);
        if (ts.rows !== go.rows) diffs.push(`baris: TS ${ts.rows} ≠ Go ${go.rows}`);
        for (const n of cmp.onlyTs) diffs.push(`hanya di TS: ${n}`);
        for (const n of cmp.onlyGo) diffs.push(`hanya di Go: ${n}`);
        for (const d of cmp.differ) diffs.push(`${d.name}: ${d.detail}`);
        if (cmp.same === 0) diffs.push("nol berkas setara — arsip kosong bukan bukti");

        report(
          label,
          diffs,
          `${cmp.same} berkas setara (${cmp.bytes.toLocaleString("id-ID")} byte) · ` +
            `${ts.companies} PT · ${ts.tables} tabel · ${ts.rows.toLocaleString("id-ID")} baris · ` +
            `${go.documents} dokumen (${go.missing} tak ditemukan)`,
          tally
        );
      } catch (error) {
        failed(label, error, tally);
      } finally {
        if (!keep) {
          await rm(tsZip, { force: true });
          await rm(goZip, { force: true });
        }
      }
    }
  } finally {
    if (keep) console.log(`Arsip disimpan di ${tmpRoot}`);
    else await rm(tmpRoot, { recursive: true, force: true });
  }
  finish(tenants.length, 1, "ekspor", tally);
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
