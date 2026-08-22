/**
 * Pemberitahuan: faktur jatuh tempo & tertunggak.
 *
 *   bun run notify:invoice-due          # terbitkan pemberitahuan
 *   bun run notify:invoice-due -- --dry # lihat saja, tanpa menulis
 *
 * ══ KENAPA ADA ══════════════════════════════════════════════════════════════
 * Halaman Piutang sudah tahu persis siapa yang menunggak sejak #12 — tapi ia
 * hanya tahu ketika seseorang membukanya. Tanggal jatuh tempo adalah satu dari
 * sedikit hal di buku ini yang berubah statusnya TANPA ada yang mengetik apa
 * pun: faktur yang kemarin masih wajar, hari ini sudah tertunggak. Tidak ada
 * kejadian yang bisa dilihat pengguna, jadi tidak ada yang memicu siapa pun
 * untuk membuka halamannya — dan itulah persis kelas kabar yang harus datang
 * sendiri.
 *
 * ══ APA YANG DIKIRIM, DAN SEBERAPA SERING ═══════════════════════════════════
 * Seluruh aturannya — ringkasan alih-alih satu kabar per faktur, dua jenis,
 * dan bentuk kunci dedupe yang menentukan cadensi — hidup di
 * `src/lib/invoice-due-digest.ts` sebagai fungsi murni, dan diuji di sana.
 * Berkas ini hanya menyambungkannya ke basis data: SIAPA yang dibaca, SIAPA
 * yang menerima, dan bagaimana barisnya ditulis.
 *
 * ══ HANYA KEPADA YANG BOLEH MELIHAT PIUTANG ═════════════════════════════════
 * Badan kabarnya menyebut jumlah tunggakan dan nama pelanggan — itu isi
 * halaman Piutang, jadi penerimanya disaring dengan izin yang menjaga halaman
 * itu (`receivable.read`), lewat `canEffective`: matriks EFEKTIF, bukan bawaan
 * di kode. Bedanya menentukan — sebuah peran yang izinnya DICABUT di
 * `/permissions` akan tetap menerima angkanya kalau di sini yang dibaca cuma
 * matriks bawaan, dan pencabutan yang bocor lewat kotak masuk tidak akan
 * pernah terlihat di halaman mana pun.
 *
 * ══ SATU BUKU GAGAL TIDAK MENGHENTIKAN SISANYA ══════════════════════════════
 * Doktrin yang sama dengan `notify-pending-setup.ts`: buku yang tak bisa dibaca
 * dicatat lalu dilewati. Penjadwal yang berhenti di perusahaan ketiga berarti
 * seluruh perusahaan sesudahnya diam-diam tak pernah dapat kabar.
 */
import "dotenv/config";

import { controlDb } from "../src/lib/control-db";
import { runWithCompany } from "../src/lib/company-context";
import { getReceivables } from "../src/lib/receivables";
import { canEffective } from "../src/lib/authz-effective";
import { planInvoiceDueDigests, type InvoiceDueDigest } from "../src/lib/invoice-due-digest";

/** Rencana untuk satu perusahaan + kepada siapa ia dikirim. */
interface RencanaPerusahaan {
  digests: InvoiceDueDigest[];
  penerima: number[];
}

async function rencanaUntuk(company: {
  id: number;
  name: string;
  slug: string;
  databaseName: string;
  tenant: { slug: string } | null;
  memberships: { userId: number; role: string }[];
}): Promise<RencanaPerusahaan> {
  return runWithCompany(
    { companyId: company.id, slug: company.slug, databaseName: company.databaseName },
    async () => {
      const asOf = new Date();
      const { rows } = await getReceivables({ asOf });
      const digests = planInvoiceDueDigests({
        companyId: company.id,
        companyName: company.name,
        basePath: `/t/${company.tenant?.slug ?? ""}/${company.slug}`,
        // Kontrak sengaja tidak ikut — lihat kepala `invoice-due-digest.ts`.
        invoices: rows.filter((r) => r.kind === "invoice"),
        asOf,
      });

      /* Izin dibaca hanya kalau memang ada yang mau dikirim: `canEffective`
         menyentuh tiga tabel di buku perusahaan, dan tidak ada gunanya
         membayarnya untuk perusahaan yang piutangnya sedang bersih. */
      if (digests.length === 0) return { digests, penerima: [] };

      const penerima: number[] = [];
      for (const m of company.memberships) {
        if (await canEffective({ id: m.userId, role: m.role }, "receivable.read")) {
          penerima.push(m.userId);
        }
      }
      return { digests, penerima };
    }
  );
}

async function main() {
  const dry = process.argv.includes("--dry");

  if (!process.env.CONTROL_DATABASE_URL) {
    console.error("CONTROL_DATABASE_URL belum diset.");
    process.exit(1);
  }

  const companies = await controlDb.company.findMany({
    where: { isActive: true, isDemo: false },
    select: {
      id: true,
      name: true,
      slug: true,
      databaseName: true,
      tenant: { select: { slug: true } },
      memberships: { where: { isActive: true }, select: { userId: true, role: true } },
    },
    orderBy: { id: "asc" },
  });

  let diterbitkan = 0;
  let dilewati = 0;
  let gagal = 0;

  for (const company of companies) {
    let rencana: RencanaPerusahaan;
    try {
      rencana = await rencanaUntuk(company);
    } catch (error) {
      gagal += 1;
      console.error(
        `  ${company.slug}: buku gagal dibaca — ${error instanceof Error ? error.message : error}`
      );
      continue;
    }

    if (rencana.digests.length === 0) continue;
    if (rencana.penerima.length === 0) {
      console.warn(
        `  ${company.slug}: ${rencana.digests.length} kabar tidak terkirim — ` +
          `tidak ada anggota aktif yang boleh membaca Piutang (receivable.read).`
      );
      continue;
    }

    for (const digest of rencana.digests) {
      for (const userId of rencana.penerima) {
        if (dry) {
          /* Judul DAN badan: putaran kering yang hanya menunjukkan judul tidak
             memperlihatkan satu-satunya bagian yang berisi angka — dan angka
             itulah yang paling mungkin salah. */
          console.log(`  [kering] pengguna #${userId} ← ${digest.kind} ${digest.dedupeKey}`);
          console.log(`           ${digest.title}`);
          console.log(`           ${digest.body}`);
          console.log(`           → ${digest.href}`);
          diterbitkan += 1;
          continue;
        }
        const result = await controlDb.notification.createMany({
          data: [
            {
              userId,
              kind: digest.kind,
              title: digest.title,
              body: digest.body,
              href: digest.href,
              dedupeKey: digest.dedupeKey,
            },
          ],
          skipDuplicates: true,
        });
        if (result.count > 0) {
          diterbitkan += 1;
          console.log(`  ✓ pengguna #${userId} ← ${digest.title}`);
        } else {
          dilewati += 1;
        }
      }
    }
  }

  console.log(
    `${dry ? "[kering] " : ""}${diterbitkan} pemberitahuan${dry ? " akan diterbitkan" : " diterbitkan"}, ` +
      `${dilewati} sudah ada${gagal > 0 ? `, ${gagal} buku gagal dibaca` : ""}.`
  );

  /* Buku yang gagal dibaca BUKAN kegagalan skrip: penjadwal memanggilnya tiap
     jam dan akan mencobanya lagi. Keluar dengan kode ≠ 0 hanya akan menghias
     log penjadwal dengan merah yang tidak menuntut tindakan apa pun. */
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
