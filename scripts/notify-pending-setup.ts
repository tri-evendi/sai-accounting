/**
 * Pemberitahuan: penyiapan perusahaan belum selesai (issue #416).
 *
 *   bun run notify:setup          # terbitkan pemberitahuan
 *   bun run notify:setup -- --dry # lihat saja, tanpa menulis
 *
 * ══ KENAPA ADA ══════════════════════════════════════════════════════════════
 * Empat perusahaan mandek di wisaya penyiapan selama enam hari, dan tidak ada
 * satu pun kanal yang memberi tahu siapa pun — tidak pemiliknya, tidak
 * operatornya. Yang menemukan mereka akhirnya adalah satu laporan pengguna dan
 * dua hari penggalian manual. Skrip ini menutup jarak itu.
 *
 * ══ AMBANGNYA HARI, BUKAN MENIT ═════════════════════════════════════════════
 * Perusahaan yang baru lahir sepuluh menit lalu memang belum disiapkan — itu
 * keadaan normal, bukan kabar. Yang layak diberitahukan adalah yang MANDEK, dan
 * mandek butuh waktu untuk terbukti. Karena itu tahapnya H+1, H+3, H+7, H+14:
 * cukup jarang untuk tidak terasa mengomel, cukup rapat untuk tidak kehilangan
 * seseorang di dalam masa percobaan yang cuma 14 hari.
 *
 * ══ IDEMPOTEN ══════════════════════════════════════════════════════════════
 * `dedupeKey = "company:<id>:d<tahap>"`. Penjadwal boleh memanggilnya tiap jam:
 * pemberitahuan tahap yang sama menabrak constraint unik dan dilewati, jadi satu
 * perusahaan menerima paling banyak EMPAT kabar seumur hidupnya.
 *
 * ══ KE SETIAP ANGGOTA, BUKAN HANYA PEMILIK ══════════════════════════════════
 * Yang bisa menyelesaikan wisaya adalah yang punya izin `setup.manage`, dan itu
 * bisa lebih dari satu orang. Mengirim hanya ke pemilik tenant berarti kabar
 * berhenti di orang yang mungkin bukan yang mengerjakan bukunya.
 */
import "dotenv/config";

import { PrismaClient as ControlClient } from "../src/generated/control/client.js";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

/** Tahap pengingat, dalam hari sejak perusahaan dibuat. */
const TAHAP = [1, 3, 7, 14] as const;

function adapterFor(raw: string, database?: string) {
  const url = new URL(raw);
  return new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: database ?? url.pathname.slice(1),
    connectionLimit: 2,
  });
}

function companyTemplate(): string {
  return (
    process.env.COMPANY_DATABASE_URL_TEMPLATE ??
    process.env.DATABASE_URL ??
    process.env.CONTROL_DATABASE_URL!
  );
}

/** Tahap TERTINGGI yang sudah terlewati, atau `null` bila belum satu pun. */
export function tahapUntuk(umurHari: number): number | null {
  let hasil: number | null = null;
  for (const t of TAHAP) if (umurHari >= t) hasil = t;
  return hasil;
}

async function main() {
  const dry = process.argv.includes("--dry");

  const controlUrl = process.env.CONTROL_DATABASE_URL;
  if (!controlUrl) {
    console.error("CONTROL_DATABASE_URL belum diset.");
    process.exit(1);
  }
  const control = new ControlClient({ adapter: adapterFor(controlUrl) });

  const companies = await control.company.findMany({
    where: { isActive: true, isDemo: false },
    select: {
      id: true,
      name: true,
      slug: true,
      databaseName: true,
      createdAt: true,
      tenant: { select: { slug: true } },
      memberships: {
        where: { isActive: true },
        select: { userId: true },
      },
    },
  });

  const sekarang = Date.now();
  let diterbitkan = 0;
  let dilewati = 0;

  for (const company of companies) {
    const umurHari = Math.floor((sekarang - company.createdAt.getTime()) / 86_400_000);
    const tahap = tahapUntuk(umurHari);
    if (tahap === null) continue;

    /* Buku PT-nya sendiri yang menjawab "sudah disiapkan?" — bukan tebakan dari
       kendali. Gagal membaca satu buku tidak boleh menghentikan yang lain. */
    const book = new PrismaClient({ adapter: adapterFor(companyTemplate(), company.databaseName) });
    let sudahSiap = true;
    try {
      const setting = await book.companySetting.findFirst({ select: { isSetup: true } });
      sudahSiap = setting?.isSetup === true;
    } catch (error) {
      console.error(`  ${company.slug}: gagal dibaca — ${error instanceof Error ? error.message : error}`);
      await book.$disconnect();
      continue;
    }
    await book.$disconnect();
    if (sudahSiap) continue;

    const href = `/t/${company.tenant?.slug ?? ""}/${company.slug}/setup`;
    for (const m of company.memberships) {
      const dedupeKey = `company:${company.id}:d${tahap}`;
      if (dry) {
        console.log(`  [kering] pengguna #${m.userId} ← ${company.name} (H+${tahap}) ${href}`);
        diterbitkan++;
        continue;
      }
      const result = await control.notification.createMany({
        data: [
          {
            userId: m.userId,
            kind: "setup_incomplete",
            title: `Penyiapan ${company.name} belum selesai`,
            body:
              "Buku perusahaan ini belum bisa dipakai sampai wisaya penyiapan diselesaikan — " +
              "identitas, modul, dan saldo awal. Bila pembukuan dimulai dari nol, centang " +
              '"Mulai tanpa saldo awal" di langkah terakhir.',
            href,
            dedupeKey,
          },
        ],
        skipDuplicates: true,
      });
      if (result.count > 0) {
        diterbitkan++;
        console.log(`  ✓ pengguna #${m.userId} ← ${company.name} (H+${tahap})`);
      } else {
        dilewati++;
      }
    }
  }

  await control.$disconnect();
  console.log(
    `${dry ? "[kering] " : ""}${diterbitkan} pemberitahuan${dry ? " akan diterbitkan" : " diterbitkan"}, ${dilewati} sudah ada.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
