/**
 * ANGKUT JEJAK PUTARAN: `sai_platform` → basis data KENDALI
 *
 *   bun run trails:move           # angkut yang belum ada di kendali
 *   bun run trails:move -- --dry  # hitung saja; tidak menulis apa pun
 *
 * ══ KENAPA SKRIP, BUKAN SATU BARIS SQL DI MIGRATION ════════════════════════
 * `scheduler_runs`, `conformance_runs`, dan `backup_runs` pindah rumah
 * (migration kendali 0005, alasannya di komentar model). Pindahnya melintasi
 * BASIS DATA, dan PostgreSQL tidak punya `INSERT ... SELECT` lintas basis data
 * tanpa menambah `postgres_fdw` atau `dblink` — ekstensi yang harus dipasang di
 * server produksi hanya untuk satu kali pakai. Jadi barisnya dibaca oleh klien
 * dan ditulis kembali.
 *
 * Itu juga sebabnya pengangkutan ini BUKAN bagian dari migration: migration
 * harus bisa dijalankan customer dengan satu perintah dan satu kode keluar,
 * sementara langkah ini menuntut KEDUA alamat basis data sekaligus — dan di
 * profil on-premise alamat yang satu memang tidak ada. Di sana skrip ini tidak
 * perlu dijalankan sama sekali: tidak ada jejak lama untuk diangkut.
 *
 * ══ EXPAND/CONTRACT: SKRIP INI TIDAK MENGHAPUS APA PUN ═════════════════════
 * Baris di `sai_platform` DIBIARKAN. Penghapusannya langkah CONTRACT di rilis
 * berikutnya (`DROP TABLE` di migration platform), setelah versi aplikasi yang
 * masih membaca tabel lama tidak berjalan lagi di mana pun. Mengangkut dan
 * menghapus dalam satu langkah berarti rollback kehilangan riwayatnya.
 *
 * ══ IDEMPOTEN, DAN `id` DIPERTAHANKAN ══════════════════════════════════════
 * `id` asal ditulis apa adanya ke kendali. Dua akibat yang dua-duanya
 * diinginkan: menjalankan ulang skrip ini tidak melahirkan duplikat (PK yang
 * sama ditolak dan dilewati), dan nomor putaran yang sudah pernah dikutip di
 * tiket dukungan tetap menunjuk baris yang sama.
 *
 * Harganya satu langkah yang TIDAK BOLEH dilupakan: menulis `id` eksplisit
 * tidak menggerakkan sequence, jadi `INSERT` berikutnya dari aplikasi akan
 * memakai nilai yang sudah terpakai dan gagal dengan pelanggaran PK. Karena itu
 * sequence disetel ulang di akhir SETIAP tabel, bukan di akhir skrip — kalau
 * satu tabel gagal, dua tabel yang sudah selesai tetap konsisten.
 */
import "dotenv/config";

import { PrismaClient as PlatformClient } from "@sai/db/client/platform";
import { PrismaClient as ControlClient } from "@sai/db/client/control";
import { buatAdapter } from "@sai/db/adapter";

const KERING = process.argv.includes("--dry");
const SEPOTONG = 500;

const log = (...a: unknown[]) => console.log("[trails:move]", ...a);

const adapterFor = (rawUrl: string) =>
  buatAdapter(new URL(rawUrl).toString(), { batasKoneksi: 1 });

/**
 * Satu tabel yang diangkut. `baca`/`tulis` dibungkus fungsi supaya ketiga tabel
 * bisa diproses satu lingkaran tanpa tipe union yang menyatukan bentuk baris
 * yang sebenarnya berbeda.
 */
interface Jejak {
  tabel: string;
  baca: (lewati: number) => Promise<{ id: number }[]>;
  tulis: (rows: { id: number }[]) => Promise<number>;
  hitungTujuan: () => Promise<number>;
}

async function main() {
  const platformUrl = process.env.PLATFORM_DATABASE_URL?.trim();
  const controlUrl = process.env.CONTROL_DATABASE_URL?.trim();

  if (!controlUrl) {
    console.error("GAGAL: CONTROL_DATABASE_URL belum diset — tidak ada tujuan.");
    process.exit(1);
  }
  if (!platformUrl) {
    /* Bukan galat: profil on-premise memang tidak punya basis data platform,
       dan di sana tidak ada jejak lama untuk diangkut. */
    log("PLATFORM_DATABASE_URL kosong — tidak ada asal, tidak ada yang diangkut.");
    return;
  }

  const platform = new PlatformClient({ adapter: adapterFor(platformUrl) });
  const control = new ControlClient({ adapter: adapterFor(controlUrl) });

  const jejak: Jejak[] = [
    {
      tabel: "scheduler_runs",
      baca: (lewati) =>
        platform.schedulerRun.findMany({ orderBy: { id: "asc" }, skip: lewati, take: SEPOTONG }),
      tulis: async (rows) => {
        const r = await control.schedulerRun.createMany({
          data: rows as never,
          skipDuplicates: true,
        });
        return r.count;
      },
      hitungTujuan: () => control.schedulerRun.count(),
    },
    {
      tabel: "conformance_runs",
      baca: (lewati) =>
        platform.conformanceRun.findMany({ orderBy: { id: "asc" }, skip: lewati, take: SEPOTONG }),
      tulis: async (rows) => {
        const r = await control.conformanceRun.createMany({
          data: rows as never,
          skipDuplicates: true,
        });
        return r.count;
      },
      hitungTujuan: () => control.conformanceRun.count(),
    },
    {
      tabel: "backup_runs",
      baca: (lewati) =>
        platform.backupRun.findMany({ orderBy: { id: "asc" }, skip: lewati, take: SEPOTONG }),
      tulis: async (rows) => {
        const r = await control.backupRun.createMany({ data: rows as never, skipDuplicates: true });
        return r.count;
      },
      hitungTujuan: () => control.backupRun.count(),
    },
  ];

  let totalDiangkut = 0;
  try {
    for (const t of jejak) {
      let lewati = 0;
      let dibaca = 0;
      let ditulis = 0;

      for (;;) {
        const rows = await t.baca(lewati);
        if (rows.length === 0) break;
        dibaca += rows.length;
        if (!KERING) ditulis += await t.tulis(rows);
        lewati += rows.length;
      }

      if (KERING) {
        const sudah = await t.hitungTujuan();
        log(`${t.tabel}: ${dibaca} baris di platform, ${sudah} sudah di kendali (kering)`);
        continue;
      }

      /* Sequence disetel ulang SEKARANG, bukan di akhir skrip — lihat kepala
         berkas. `is_called = false` supaya nilai berikutnya adalah MAX+1 dan
         bukan MAX+2; tabel kosong jatuh ke 1 lewat COALESCE. */
      await control.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('${t.tabel}', 'id'),
                       COALESCE((SELECT MAX(id) FROM "${t.tabel}"), 0) + 1,
                       false)`
      );

      totalDiangkut += ditulis;
      const dilewati = dibaca - ditulis;
      log(
        `${t.tabel}: ${dibaca} dibaca · ${ditulis} diangkut · ${dilewati} dilewati (sudah ada)` +
          " · sequence disetel ulang"
      );
    }
  } finally {
    await platform.$disconnect().catch(() => {});
    await control.$disconnect().catch(() => {});
  }

  if (KERING) {
    log("kering — tidak ada yang ditulis.");
    return;
  }

  log(`selesai: ${totalDiangkut} baris diangkut.`);
  log("Baris di `sai_platform` DIBIARKAN — penghapusannya langkah contract di rilis berikutnya.");
}

main().catch((e) => {
  console.error("[trails:move] GAGAL:", e);
  process.exit(1);
});
