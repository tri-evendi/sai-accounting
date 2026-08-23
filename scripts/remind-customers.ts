/**
 * Pengingat jatuh tempo KE PELANGGAN (issue #467).
 *
 *   bun run remind:customers          # kirim
 *   bun run remind:customers -- --dry # lihat saja, tanpa mengirim & tanpa menulis
 *
 * ══ KENAPA SKRIP INI BERBEDA DARI `notify-invoice-due.ts` ═══════════════════
 * Yang itu menerbitkan kabar DI DALAM aplikasi kepada anggota tim. Yang ini
 * mengirim SUREL KE ORANG LUAR atas nama perusahaan pengguna — dan surel yang
 * terlanjur keluar tidak bisa ditarik kembali. Itu satu-satunya alasan seluruh
 * berkas ini berhati-hati sampai membosankan:
 *
 *   • perusahaan yang belum menyalakan fiturnya DILEWATI (bawaannya mati);
 *   • perusahaan yang belum pernah melakukan KIRIM-UJI ke dirinya sendiri
 *     dilewati, dan alasannya dicetak — bukan gagal diam-diam;
 *   • `--dry` mencetak penerima, judul, DAN badannya: putaran kering yang hanya
 *     menyebut jumlah tidak memperlihatkan satu-satunya bagian yang paling
 *     mungkin memalukan bila salah, yaitu kalimatnya;
 *   • satu buku yang gagal dibaca tidak menghentikan buku lain (doktrin yang
 *     sama dengan dua penjadwal yang sudah ada).
 *
 * ══ AMAN DIPANGGIL TIAP JAM ═════════════════════════════════════════════════
 * Idempotensinya bukan di sini melainkan di basis data: kunci unik
 * `(invoice_id, reminder_kind, reminder_due_key)`. Putaran kedua di hari yang
 * sama menabrak constraint SEBELUM `sendMail` dipanggil.
 */
import "dotenv/config";

import { controlDb } from "../src/lib/control-db";
import { runWithCompany } from "../src/lib/company-context";
import {
  planRemindersForCompany,
  sendReminder,
  type ReminderPlanResult,
} from "../src/lib/invoice-reminder-mail";

const ALASAN_LEWAT: Record<string, string> = {
  disabled: "pengingat pelanggan belum dinyalakan",
  untested: "belum pernah kirim-uji ke diri sendiri — penjadwal menolak mengirim",
  no_settings: "belum punya baris pengaturan perusahaan",
};

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
  let terkirim = 0;
  let dilewati = 0;
  let gagal = 0;

  for (const company of companies) {
    const scope = {
      companyId: company.id,
      slug: company.slug,
      databaseName: company.databaseName,
    };

    let rencana: ReminderPlanResult;
    try {
      rencana = await runWithCompany(scope, () => planRemindersForCompany(today));
    } catch (error) {
      gagal += 1;
      console.error(
        `  ${company.slug}: buku gagal dibaca — ${error instanceof Error ? error.message : error}`
      );
      continue;
    }

    if (rencana.skip) {
      /* Hanya `untested` yang layak terlihat: ia berarti seseorang SUDAH
         menyalakan fiturnya lalu berhenti satu langkah sebelum jadi, dan
         diamnya penjadwal akan terbaca sebagai fitur yang rusak. `disabled`
         adalah keadaan normal mayoritas perusahaan — mencetaknya tiap jam
         hanya akan menenggelamkan baris yang penting. */
      if (rencana.skip === "untested") {
        console.warn(`  ${company.slug}: ${ALASAN_LEWAT[rencana.skip]}`);
      }
      continue;
    }

    for (const item of rencana.planned) {
      if (dry) {
        console.log(
          `  [kering] ${company.slug} faktur #${item.invoiceId} ← ${item.point} (jatuh tempo ${item.dueKey})`
        );
        terkirim += 1;
        continue;
      }

      try {
        const hasil = await runWithCompany(scope, () =>
          sendReminder({
            invoiceId: item.invoiceId,
            point: item.point,
            dueKey: item.dueKey,
            outstanding: item.outstanding,
            total: item.total,
            currency: item.currency,
            companyName: company.name,
          })
        );
        if (hasil === "sent") {
          terkirim += 1;
          console.log(`  ✓ ${company.slug} faktur #${item.invoiceId} ${item.point}`);
        } else {
          dilewati += 1;
        }
      } catch (error) {
        gagal += 1;
        console.error(
          `  ${company.slug} faktur #${item.invoiceId}: gagal kirim — ` +
            `${error instanceof Error ? error.message : error}`
        );
      }
    }
  }

  console.log(
    `${dry ? "[kering] " : ""}${terkirim} pengingat${dry ? " akan dikirim" : " dikirim"}, ` +
      `${dilewati} sudah pernah${gagal > 0 ? `, ${gagal} gagal` : ""}.`
  );

  /* Kegagalan per-buku BUKAN kegagalan skrip: penjadwal memanggilnya lagi, dan
     keluar dengan kode ≠ 0 hanya menghias lognya dengan merah yang tidak
     menuntut tindakan apa pun. */
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
