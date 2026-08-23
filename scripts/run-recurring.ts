/**
 * Terbitkan dokumen berulang yang jatuh hari ini (issue #469).
 *
 *   bun run recurring:run          # terbitkan
 *   bun run recurring:run -- --dry # lihat saja, tanpa menulis
 *
 * ══ APA YANG DIHASILKANNYA ══════════════════════════════════════════════════
 * Bukan jurnal yang sudah terposting. Dokumennya dibuat lewat jalur yang sama
 * dengan yang dipakai manusia, lalu SELALU menerbitkan pengajuan persetujuan —
 * jadi buku besar diam sampai seseorang menyetujuinya di /approvals. Mesin yang
 * memposting sendiri setiap bulan berarti angka yang tidak pernah dilihat
 * siapa pun sebelum tercatat.
 *
 * ══ YANG DITAHAN IKUT DILAPORKAN ════════════════════════════════════════════
 * Kejadian yang jatuh di periode tertutup, atau yang dokumen sumbernya hilang,
 * TIDAK diselundupkan dan TIDAK dibuang — ia dicatat sebagai `held_*` dan
 * dicetak di sini. Penahanan yang tidak terlihat akan dicoba lagi setiap jam
 * dan tak seorang pun tahu ia pernah gagal.
 *
 * Satu buku yang gagal dibaca tidak menghentikan buku lain — doktrin yang sama
 * dengan tiga penjadwal lain di repo ini.
 */
import "dotenv/config";

import { controlDb } from "../src/lib/control-db";
import { runWithCompany } from "../src/lib/company-context";
import { runRecurringForCompany, type OccurrenceOutcome } from "../src/lib/recurring-run";
import { planOccurrences, occurrenceKey, type RecurrenceRule } from "../src/lib/recurring";
import { prisma } from "../src/lib/prisma";

/** Putaran KERING: merencanakan tanpa menyentuh satu baris pun. */
async function rencanaKering(today: Date): Promise<OccurrenceOutcome[]> {
  const templates = await prisma.recurringTemplate.findMany({
    where: { isActive: true },
    include: { occurrences: { select: { occurrenceDate: true } } },
    orderBy: { id: "asc" },
  });

  return templates.flatMap((template) => {
    const rule: RecurrenceRule = {
      frequency: template.frequency as RecurrenceRule["frequency"],
      startDate: template.startDate,
      endDate: template.endDate,
      maxOccurrences: template.maxOccurrences,
    };
    return planOccurrences({
      rule,
      today,
      sudahTerbit: new Set(template.occurrences.map((o) => occurrenceKey(o.occurrenceDate))),
    }).map((o) => ({
      templateId: template.id,
      templateName: template.name,
      date: o.date,
      status: "created" as const,
      documentId: null,
      note: null,
    }));
  });
}

async function main() {
  const dry = process.argv.includes("--dry");

  if (!process.env.CONTROL_DATABASE_URL) {
    console.error("CONTROL_DATABASE_URL belum diset.");
    process.exit(1);
  }

  const companies = await controlDb.company.findMany({
    where: { isActive: true, isDemo: false },
    select: { id: true, name: true, slug: true, databaseName: true },
    orderBy: { id: "asc" },
  });

  const today = new Date();
  let terbit = 0;
  let ditahan = 0;
  let gagal = 0;

  for (const company of companies) {
    const scope = {
      companyId: company.id,
      slug: company.slug,
      databaseName: company.databaseName,
    };

    let outcomes: OccurrenceOutcome[];
    try {
      outcomes = await runWithCompany(scope, () =>
        dry ? rencanaKering(today) : runRecurringForCompany(today)
      );
    } catch (error) {
      gagal += 1;
      console.error(
        `  ${company.slug}: buku gagal dibaca — ${error instanceof Error ? error.message : error}`
      );
      continue;
    }

    for (const o of outcomes) {
      const tanggal = occurrenceKey(o.date);
      if (dry) {
        console.log(`  [kering] ${company.slug} · ${o.templateName} · ${tanggal}`);
        terbit += 1;
        continue;
      }
      if (o.status === "created") {
        terbit += 1;
        console.log(
          `  ✓ ${company.slug} · ${o.templateName} · ${tanggal} → dokumen #${o.documentId} (menunggu persetujuan)`
        );
      } else {
        ditahan += 1;
        console.warn(`  ⏸ ${company.slug} · ${o.templateName} · ${tanggal} — ${o.note ?? o.status}`);
      }
    }
  }

  console.log(
    `${dry ? "[kering] " : ""}${terbit} dokumen${dry ? " akan diterbitkan" : " diterbitkan"}, ` +
      `${ditahan} ditahan${gagal > 0 ? `, ${gagal} buku gagal dibaca` : ""}.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
