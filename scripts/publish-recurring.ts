/**
 * TERBITKAN pekerjaan dokumen berulang — satu baris antrean per perusahaan
 * (02 §5, langkah 5 peran `scheduler` di `svc-worker`).
 *
 *   bun run recurring:publish
 *
 * ══ YANG BERUBAH DARI `recurring:run` ══════════════════════════════════════
 * Denyut jam berhenti MELAKSANAKAN dan hanya MENERBITKAN. Skrip ini tidak
 * membuka satu pun buku perusahaan: ia membaca registry di basis data KENDALI,
 * lalu menulis satu baris `jobs` per perusahaan. Yang melaksanakannya jalur
 * `ledger` (`bun run jobs:run:ledger`) — satu-satunya jalur yang boleh menulis
 * buku besar (invarian I-2).
 *
 * Tiga hal yang dibelinya, dan ketiganya nyata di kotak sepadat ini:
 *
 *   • SATU PERUSAHAAN YANG GAGAL TIDAK MENUNGGU SEJAM. Putaran lama mengulang
 *     seluruh daftar pada putaran berikutnya; baris antrean punya `attempts`
 *     dan *backoff* sendiri, jadi yang gagal mencoba lagi dalam hitungan detik
 *     sementara yang lain sudah selesai. Ini menutup P2-2: tiap langkah punya
 *     barisnya sendiri.
 *   • BATAS `timeout` PUTARAN PENJADWAL BERHENTI BERLAKU untuk langkah ini.
 *     Aturan di `docker-compose.yml` — jumlah langkah × batas harus di bawah
 *     selang putaran — dihitung terhadap langkah yang MELAKSANAKAN. Penerbitan
 *     selesai dalam milidetik berapa pun banyaknya perusahaan.
 *   • PENERBITAN DUA KALI TIDAK MENGHASILKAN DUA PEKERJAAN. `dedupeKey` yang
 *     unik menabrak constraint sebelum apa pun terjadi, dan itulah yang
 *     menggantikan *leader election*.
 *
 * ══ KUNCI IDEMPOTENSINYA BERBUTIR JAM, BUKAN HARI ══════════════════════════
 * Cadensi penjadwal per jam, dan itu disengaja: templat yang diaktifkan tengah
 * hari terbit pada putaran berikutnya, bukan besok. Kunci berbutir HARI akan
 * membuat putaran pertama hari itu satu-satunya yang pernah menerbitkan — dan
 * templat yang dibuat sesudahnya menunggu sampai lewat tengah malam. Yang
 * dijaga kunci ini adalah penerbitan ganda DALAM satu putaran; pengulangan
 * antar-putaran memang aman, sebab `runRecurringForCompany` idempoten lewat
 * kunci unik `(template_id, occurrence_date)`.
 *
 * Jamnya dibaca di UTC, sama seperti mesin berulangnya sendiri
 * (`src/lib/recurring.ts` menghitung batas hari di UTC). Kunci yang berbutir
 * waktu lokal sementara kejadiannya berbutir UTC akan menyimpang tepat di
 * batas hari — satu jam dalam setahun di mana penerbitannya salah.
 *
 * ══ BUTIR, KUNCI, DAN MUATAN DARI `@sai/core/schedule-due` ═════════════════
 * Sejak jalur `schedule` Go lahir, aturan penerbitan punya kembaran di Go
 * (`internal/schedulelane/due.go`). Keduanya dibuktikan menghasilkan kunci
 * yang SAMA oleh satu fikstur bersama — maka aturannya tidak lagi ditulis di
 * skrip ini, melainkan dipanggil.
 *
 * ══ PENERBITNYA TEPAT SATU ════════════════════════════════════════════════
 * `contract/kinds.yaml` → `ledger.recurring.schedule.publisher` memutuskan
 * siapa yang menerbitkan. Bila nilainya `go`, langkah ini keluar 0 tanpa
 * menyentuh antrean: jalur `schedule` di `svc-integrator` yang menerbitkan.
 * Peralihan & jalan mundurnya: PRODUCTION.md §Penerbit denyut.
 */
import "dotenv/config";

import { controlDb } from "@sai/core/control-db";
import { NOT_FROZEN_COMPANY_WHERE } from "@sai/core/tenant-migration";
import { publishJob } from "@sai/platform/job-queue";
import { duePublications, nodePublishes, skippedPublisherNote } from "@sai/core/schedule-due";

async function main() {
  if (!nodePublishes("ledger.recurring")) {
    console.log(skippedPublisherNote("ledger.recurring"));
    return;
  }
  if (!process.env.CONTROL_DATABASE_URL) {
    console.error("CONTROL_DATABASE_URL belum diset.");
    process.exit(1);
  }

  /* Saringan yang SAMA dengan `run-recurring.ts`: perusahaan nonaktif dan buku
     demo tidak menerbitkan dokumen. Dua daftar yang berbeda antara penerbit dan
     pelaksana berarti pekerjaan yang terbit lalu selalu dilempar pelaksananya. */
  const companies = await controlDb.company.findMany({
    /* Tenant yang DIBEKUKAN untuk pindah ke on-premise dilewati — @sai/core/tenant-migration. */
    where: { isActive: true, isDemo: false, ...NOT_FROZEN_COMPANY_WHERE },
    select: { id: true, slug: true },
    orderBy: { id: "asc" },
  });

  /* SATU stempel waktu untuk seluruh putaran, bukan satu per perusahaan: dua
     perusahaan di putaran yang sama harus menilai tanggal yang sama, dan
     putaran yang melewati tengah malam di tengah daftar akan memberi separuh
     daftar tanggal berikutnya. */
  const saat = new Date();
  const slug = new Map(companies.map((c) => [c.id, c.slug]));

  let terbit = 0;
  let sudah = 0;
  let gagal = 0;

  for (const p of duePublications("ledger.recurring", saat, companies)) {
    const nama = slug.get(p.companyId ?? -1) ?? `#${p.companyId}`;
    try {
      const row = await publishJob({
        kind: "ledger.recurring",
        companyId: p.companyId,
        payload: p.payload,
        dedupeKey: p.dedupeKey,
      });
      if (row) {
        terbit += 1;
        console.log(`  ✓ ${nama} → pekerjaan #${row.id}`);
      } else {
        sudah += 1;
      }
    } catch (error) {
      /* Satu perusahaan yang gagal diterbitkan tidak menghentikan yang lain —
         doktrin yang sama dengan empat penjadwal lain di repo ini. */
      gagal += 1;
      console.error(
        `  ✗ ${nama}: gagal diterbitkan — ${error instanceof Error ? error.message : error}`
      );
    }
  }

  console.log(
    `${terbit} pekerjaan diterbitkan, ${sudah} sudah ada di putaran ini` +
      `${gagal > 0 ? `, ${gagal} gagal` : ""}.`
  );
  /* Keluar bukan-nol bila ada yang gagal: `langkah()` di compose mencetaknya
     beserta nama langkahnya, dan penerbitan yang gagal diam adalah pekerjaan
     yang tidak pernah ada tanpa seorang pun tahu. */
  if (gagal > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
