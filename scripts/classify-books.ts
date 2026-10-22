/**
 * KLASIFIKASI BUKU — `produksi` / `dipakai-ringan` / `semai-saja` /
 * `semai-dibersihkan` / `kosong`, dengan dasar ISI bukunya, bukan namanya.
 *
 *   bun run classify:books            # tabel + ringkasan
 *   bun run classify:books -- --json  # keluaran mesin
 *
 * ══ HANYA MEMBACA ══════════════════════════════════════════════════════════
 * Tidak ada satu pun pernyataan yang mengubah data di berkas ini, dan tidak ada
 * yang menyarankan penghapusan. Menghapus basis data tidak bisa dibalik, dan
 * "tampaknya tidak dipakai" bukan dasar yang memadai untuk tindakan semacam itu
 * — buku yang tidur enam bulan tetap buku seseorang. Yang boleh diotomatiskan
 * hanya MENGETAHUINYA. Dijaga `tests/book-classification.test.ts`.
 *
 * ══ KENAPA SKRIP, BUKAN KUERI YANG DITEMPEL ULANG ══════════════════════════
 * Pertanyaan "buku mana yang nyata?" akan diajukan lagi setiap kali pelanggan
 * baru mendaftar. Kueri yang ditempel dari dokumen akan menyimpang dari
 * aturannya; skrip yang memanggil `classifyBook()` tidak bisa.
 */
import { PrismaClient as ControlClient } from "@sai/db/client/control";
import { PrismaClient } from "@sai/db/client/company";
import { buatAdapter } from "@sai/db/adapter";
import {
  COMPANY_DATABASE_TARGET_SELECT,
  companyDatabaseUrl,
  toCompanyDatabaseTarget,
  type CompanyDatabaseTarget,
} from "@sai/db/company-url";

import {
  classifyBook,
  summarizeBooks,
  type BookEvidence,
  type BookVerdict,
} from "../src/lib/book-classification";

const JSON_OUT = process.argv.includes("--json");

/** Adapter basis data KENDALI. Buku PT tidak dibuka lewat sini — URL-nya
 *  dari `@sai/db/company-url` (tahap 4). */
function adapterFor(raw: string) {
  return buatAdapter(raw, { batasKoneksi: 2 });
}

const HARI = 24 * 3_600_000;

async function evidenceFor(target: CompanyDatabaseTarget): Promise<BookEvidence> {
  const { databaseName } = target;
  /* URL buku dari penyelesai tunggal (tahap 4) — instans PT ini, bukan
     template bawaan. */
  const prisma = new PrismaClient({
    adapter: buatAdapter(companyDatabaseUrl(target), { batasKoneksi: 2 }),
  });
  try {
    const [
      realCustomers,
      realContracts,
      sampleJournals,
      totalJournals,
      reversalJournals,
      jurnalTerakhir,
      auditTerakhir,
    ] = await Promise.all([
      prisma.customer.count({ where: { NOT: { name: { contains: "[CONTOH]" } } } }),
      prisma.contract.count({ where: { NOT: { contractNo: { contains: "[CONTOH]" } } } }),
      prisma.journal.count({ where: { note: { contains: "[CONTOH]" } } }),
      prisma.journal.count(),
      prisma.journal.count({ where: { type: "reversal" } }),
      prisma.journal.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      prisma.auditLog.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);

    /* Aktivitas terakhir = yang paling baru di antara jurnal & jejak audit.
       Jejak audit ikut karena buku yang hanya dibuka-tutup tidak menghasilkan
       jurnal, tetapi tetap meninggalkan jejak — dan "dibuat lalu ditinggalkan"
       berbeda dari "tidak pernah disentuh". */
    const stempel = [jurnalTerakhir?.createdAt, auditTerakhir?.createdAt].filter(
      (d): d is Date => d instanceof Date
    );
    const terbaru = stempel.length
      ? new Date(Math.max(...stempel.map((d) => d.getTime())))
      : null;

    return {
      databaseName,
      realCustomers,
      realContracts,
      sampleJournals,
      otherJournals: totalJournals - sampleJournals,
      reversalJournals,
      daysSinceActivity: terbaru
        ? Math.floor((Date.now() - terbaru.getTime()) / HARI)
        : null,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const controlUrl = process.env.CONTROL_DATABASE_URL;
  if (!controlUrl) {
    console.error("CONTROL_DATABASE_URL belum diset — tidak tahu di mana daftar perusahaannya.");
    process.exit(1);
  }

  const control = new ControlClient({ adapter: adapterFor(controlUrl) });
  const companies = await control.company.findMany({
    orderBy: { id: "asc" },
    select: { id: true, slug: true, ...COMPANY_DATABASE_TARGET_SELECT, isActive: true, isDemo: true },
  });
  await control.$disconnect();

  const verdicts: BookVerdict[] = [];
  const gagal: string[] = [];

  for (const c of companies) {
    try {
      verdicts.push(classifyBook(await evidenceFor(toCompanyDatabaseTarget(c))));
    } catch (error) {
      /* Buku yang tidak bisa dibaca BUKAN buku yang bersih — dilaporkan, tidak
         dilewati diam-diam (doktrin yang sama dengan check-data-conformance). */
      gagal.push(`${c.databaseName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const ringkas = summarizeBooks(verdicts);
  const flagDemo = new Map(companies.map((c) => [c.databaseName, c.isDemo]));

  if (JSON_OUT) {
    console.log(JSON.stringify({ verdicts, gagal, ringkas: { ...ringkas, perKlass: Object.fromEntries(ringkas.perKlass) } }, null, 2));
    if (gagal.length > 0) process.exit(1);
    return;
  }

  console.log(`\n${verdicts.length} buku terklasifikasi:\n`);
  for (const v of verdicts) {
    const demo = flagDemo.get(v.databaseName) ? " [is_demo]" : "";
    console.log(`  ${v.klass.padEnd(18)} ${v.databaseName}${demo}`);
    console.log(`  ${" ".repeat(18)}   ${v.reason}`);
  }

  console.log("\nringkasan:");
  for (const [k, n] of ringkas.perKlass) console.log(`  ${k.padEnd(18)} ${n}`);
  console.log(
    `\n${ringkas.relevan.length} buku yang temuan kesesuaiannya layak dipercaya sebagai data NYATA:`
  );
  for (const d of ringkas.relevan) console.log(`  · ${d}`);

  if (gagal.length > 0) {
    console.error(`\n${gagal.length} buku GAGAL dibaca:`);
    for (const g of gagal) console.error(`  ${g}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
