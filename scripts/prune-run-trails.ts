/**
 * PEMANGKASAN JEJAK PUTARAN — `scheduler_runs`, `backup_runs`,
 * `conformance_runs`.
 *
 *   bun run prune:trails              # pangkas
 *   bun run prune:trails -- --dry     # cetak yang AKAN dipangkas; tidak menulis
 *   bun run prune:trails -- --hari=30 # ambang lain (bawaan 90)
 *
 * ══ ATURANNYA TIDAK ADA DI SINI ═════════════════════════════════════════════
 * Keputusan "baris mana yang dibuang" hidup di `lib/run-trail-retention.ts`,
 * sebagai fungsi MURNI yang diuji langsung. Berkas ini hanya mengambil baris,
 * menanyakan putusannya, lalu menjalankannya. Sebuah `DELETE` yang salah tidak
 * punya langkah balik, dan satu-satunya yang tahu apakah aturannya benar adalah
 * tesnya — bukan pembacanya.
 *
 * ══ KENAPA MENUMPANG PUTARAN PENJADWAL ══════════════════════════════════════
 * Dipanggil peran `scheduler` di `svc-worker` tiap jam, bersama lima produser lain.
 * Alasan yang sama yang sudah ditulis di `docker-compose.yml` untuk
 * `notify:*`: cadensinya tidak perlu sendiri, idempoten, dan layanan tersendiri
 * hanya menambah container yang bisa mati diam-diam di kotak yang sudah padat.
 *
 * Per jam memang jauh lebih sering daripada yang dibutuhkan — tetapi putaran
 * yang tidak menemukan apa pun berhenti pada satu `SELECT` per tabel, dan itu
 * lebih murah daripada satu cadensi lagi yang harus dijaga seseorang.
 *
 * ══ IDEMPOTEN ══════════════════════════════════════════════════════════════
 * Putaran kedua tidak menemukan apa pun untuk dipangkas. Tidak ada keadaan yang
 * disimpan, tidak ada penanda yang harus dibersihkan.
 */
import { controlDb } from "@sai/core/control-db";
import {
  TRAIL_RETENTION_DAYS,
  decideTrailPrune,
  type TrailRow,
} from "../src/lib/run-trail-retention";

const KERING = process.argv.includes("--dry");

const hariArg = process.argv.find((a) => a.startsWith("--hari="));
const HARI = hariArg ? Number(hariArg.split("=")[1]) : TRAIL_RETENTION_DAYS;

if (!Number.isFinite(HARI) || HARI < 1) {
  console.error(`--hari harus angka >= 1 (diterima: ${hariArg ?? "-"})`);
  process.exit(1);
}

/**
 * Permukaan delegate yang BENAR-BENAR dipakai berkas ini — dua method, tidak
 * lebih.
 *
 * ⚠ KENAPA ANTARMUKA SENDIRI, BUKAN TIPE PRISMA. Ketiga tabel jejak punya tipe
 * delegate yang berbeda, dan menyatukannya di satu daftar menghasilkan UNION
 * dari tiga tanda tangan generik. TypeScript menolak memanggil union semacam
 * itu ("This expression is not callable … none of those signatures are
 * compatible with each other") — bukan karena bentuknya salah, melainkan karena
 * ia tidak bisa memilih satu tanda tangan untuk mewakili ketiganya.
 *
 * Yang dibutuhkan di sini cuma: ambil tiga medan, hapus menurut daftar id.
 * Menyatakannya secara struktural membuat pemanggilnya bisa diperiksa tipe,
 * dan sekaligus menyempitkan apa yang boleh dilakukan berkas ini terhadap
 * tabel-tabel itu — `deleteMany` HANYA menerima `{ id: { in } }`, jadi tidak
 * ada bentuk `where` lain yang bisa menyelinap masuk nanti.
 */
interface TrailDelegate {
  findMany(args: {
    select: { id: true; finishedAt: true; status: true };
  }): Promise<TrailRow[]>;
  deleteMany(args: { where: { id: { in: number[] } } }): Promise<{ count: number }>;
}

/**
 * Ketiga tabel jejak. `delegate` diambil sebagai fungsi, bukan sebagai nilai,
 * supaya klien platform baru disentuh saat dipakai — pola `platform-db.ts`.
 */
const TABEL: { nama: string; delegate: () => TrailDelegate }[] = [
  {
    nama: "scheduler_runs",
    delegate: () => controlDb.schedulerRun as unknown as TrailDelegate,
  },
  {
    nama: "backup_runs",
    delegate: () => controlDb.backupRun as unknown as TrailDelegate,
  },
  {
    nama: "conformance_runs",
    delegate: () => controlDb.conformanceRun as unknown as TrailDelegate,
  },
];

async function main() {
  const sekarang = new Date();
  let totalDipangkas = 0;
  let totalDitahan = 0;

  console.log(
    `${KERING ? "[KERING] " : ""}pemangkasan jejak — ambang ${HARI} hari` +
      " (baris bukan-`ok`, baris terakhir, dan `ok` terakhir TIDAK pernah dipangkas)"
  );

  for (const { nama, delegate } of TABEL) {
    let baris: TrailRow[];
    try {
      /* Hanya tiga medan yang dibutuhkan putusannya — `details`/`error` bisa
         besar, dan tidak ada gunanya menariknya hanya untuk dihitung. */
      baris = await delegate().findMany({
        select: { id: true, finishedAt: true, status: true },
      });
    } catch (error) {
      /* Tabel belum dimigrasikan, atau platform tak terjangkau. Dilewati
         BERISIK — pemangkasan yang diam-diam tidak jalan adalah pemangkasan
         yang dikira jalan (pelajaran `migrate-platform.ts`). */
      console.error(
        `  ⚠ ${nama} dilewati: ${error instanceof Error ? error.message : String(error)}`
      );
      continue;
    }

    const putusan = decideTrailPrune(baris, sekarang, HARI);
    const ditahanTua = putusan.kept.length;

    if (putusan.prune.length === 0) {
      console.log(
        `  ✓ ${nama}: ${baris.length} baris, tidak ada yang perlu dipangkas` +
          (ditahanTua > 0 ? ` (${ditahanTua} tua DITAHAN sengaja)` : "")
      );
      totalDitahan += ditahanTua;
      continue;
    }

    if (KERING) {
      console.log(
        `  → ${nama}: AKAN memangkas ${putusan.prune.length} dari ${baris.length} baris` +
          ` (${ditahanTua} tua ditahan)`
      );
    } else {
      const { count } = await delegate().deleteMany({ where: { id: { in: putusan.prune } } });
      console.log(
        `  ✂ ${nama}: ${count} dipangkas dari ${baris.length} baris` +
          ` (${ditahanTua} tua ditahan)`
      );
    }

    /* Sebab penahanan dicetak RINGKAS — yang menarik bukan daftar idnya
       melainkan bahwa aturannya memang berlaku. */
    const sebab = new Map<string, number>();
    for (const k of putusan.kept) sebab.set(k.reason, (sebab.get(k.reason) ?? 0) + 1);
    for (const [r, n] of sebab) console.log(`      · ditahan (${r}): ${n}`);

    totalDipangkas += putusan.prune.length;
    totalDitahan += ditahanTua;
  }

  console.log(
    `${KERING ? "[KERING] " : ""}selesai — ${totalDipangkas} dipangkas, ` +
      `${totalDitahan} baris tua ditahan sengaja.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void controlDb.$disconnect().catch(() => {}));
