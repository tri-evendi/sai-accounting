/**
 * MENERBITKAN pekerjaan cadangan — tidak pernah melaksanakannya.
 *
 *   bun run backup:publish
 *
 * Dijalankan sebagai satu langkah di putaran peran `scheduler` di `svc-worker`
 * (tiap jam), dan yang MELAKSANAKAN adalah jalur `tenant` di `svc-integrator` (Go). Pembagian itu bukan kerapian:
 * sejak rancangan §4 penjadwal hanya menerbitkan, sebab langkah yang
 * MELAKSANAKAN menahan seluruh putaran berikutnya ketika ia menggantung — dan
 * dump seluruh pemasangan adalah langkah paling mungkin menggantung di antara
 * semuanya.
 *
 * ══ BERBUTIR HARI, BUKAN JAM — DAN ITU BERLAWANAN DENGAN `recurring:publish` ═
 *
 * `recurring:publish` memakai butir JAM dengan alasan yang eksplisit: kunci
 * berbutir hari akan membuat putaran pertama hari itu menjadi satu-satunya
 * penerbit, sehingga template yang diaktifkan tengah hari terlantar sampai
 * besok.
 *
 * Di sini jawabannya terbalik, dan sebabnya berbeda bukan karena selera:
 * cadensi cadangan MEMANG harian (RPO satu hari — keputusan yang sudah tertulis
 * di `docker-compose.yml`). Butir jam akan menerbitkan 24 pekerjaan cadangan
 * sehari, yaitu 24 dump seluruh pemasangan di kotak yang satu dumpnya saja
 * pekerjaan berat. Butir hari membuat putaran pertama hari itu menerbitkan, dan
 * 23 putaran berikutnya menabrak `dedupe_key` tanpa melakukan apa pun.
 *
 * Itulah yang menggantikan *leader election*: tidak ada yang perlu memutuskan
 * siapa yang menerbitkan hari ini.
 *
 * ⚠ KONSEKUENSINYA: jam berapa cadangan berjalan ditentukan oleh jam berapa
 * `svc-worker` naik, bukan oleh sebuah jadwal. Itu sama dengan perilaku
 * `job-backup` sebelumnya (`sleep 86400` dari saat container start), jadi tidak
 * ada yang berubah untuk operator — tapi ia pantas disebut, sebab orang yang
 * mencari "jam berapa cadangan jalan" akan mencari sebuah cron yang tidak ada.
 *
 * ══ TANPA MUATAN, DENGAN SENGAJA ═══════════════════════════════════════════
 * Pekerjaannya tidak membawa daftar basis data. Daftar yang dibekukan saat
 * penerbitan akan melewatkan PT yang didaftarkan antara penerbitan dan
 * pelaksanaan — dan putaran berikutnya tidak akan tahu bahwa yang kemarin tidak
 * lengkap. Pencacahan terjadi saat PELAKSANAAN, di `internal/backup/daftar.go`.
 *
 * ══ PENERBITNYA TEPAT SATU ════════════════════════════════════════════════
 * Butir, kunci, dan muatan dari `@sai/core/schedule-due` — kembarannya di Go
 * (`internal/schedulelane/due.go`) dibuktikan sama oleh satu fikstur bersama.
 * `contract/kinds.yaml` → `tenant.backup.schedule.publisher` memutuskan siapa
 * yang menerbitkan; bila `go`, langkah ini keluar 0 tanpa menyentuh antrean.
 * Peralihan & jalan mundurnya: PRODUCTION.md §Penerbit denyut.
 */
import "dotenv/config";

import { controlDb } from "@sai/core/control-db";
import { publishJob } from "@sai/platform/job-queue";
import { duePublications, nodePublishes, skippedPublisherNote } from "@sai/core/schedule-due";

async function main() {
  if (!nodePublishes("tenant.backup")) {
    console.log(skippedPublisherNote("tenant.backup"));
    return;
  }
  if (!process.env.CONTROL_DATABASE_URL) {
    console.error("CONTROL_DATABASE_URL belum diset.");
    process.exit(1);
  }

  const saat = new Date();

  /* SATU pekerjaan untuk seluruh pemasangan, bukan satu per PT — berbeda dari
     `recurring:publish`, dan sebabnya di `internal/backup/jalankan.go`: peran
     tingkat server (`pg_dumpall --globals-only`) dan manifest kelengkapannya
     adalah satu benda per putaran, bukan per PT. Satu pekerjaan per PT akan
     menghasilkan 17 manifest yang masing-masing tidak bisa menjawab "apakah
     putaran ini lengkap". */
  const [p] = duePublications("tenant.backup", saat, []);
  const butir = String(p!.payload.butir);
  const row = await publishJob({
    kind: "tenant.backup",
    payload: p!.payload,
    dedupeKey: p!.dedupeKey,
  });

  if (row) {
    console.log(`✓ cadangan ${butir} diterbitkan → pekerjaan #${row.id}`);
  } else {
    console.log(`cadangan ${butir} sudah diterbitkan di putaran sebelumnya.`);
  }

  await controlDb.$disconnect().catch(() => {});
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
