/**
 * MEREKAM SATU PUTARAN CADANGAN (issue #374).
 *
 * ══ Kenapa perekamnya terpisah dari `backup.sh` ════════════════════════════
 * `backup.sh` adalah POSIX shell dan sengaja tetap begitu: ia harus bisa
 * berjalan, dan bisa dibaca ulang saat panik, tanpa Node hidup. Yang butuh
 * Prisma cuma satu baris tulis, jadi baris itulah yang dipindahkan ke sini —
 * bukan seluruh skripnya yang ditarik ke TypeScript.
 *
 * ══ TIDAK PERNAH MENGGAGALKAN CADANGANNYA ══════════════════════════════════
 * Skrip ini keluar dengan 0 apa pun yang terjadi. Sebuah cadangan yang BERHASIL
 * dikirim lalu dilaporkan gagal semata-mata karena basis data platform sedang
 * tak terjangkau adalah kebalikan dari yang diminta issue #374: ia mengubah
 * pencatatan menjadi sumber kegagalan baru.
 *
 * Yang hilang saat platform mati hanyalah SATU baris riwayat, dan denyutnya
 * sudah menangani ketiadaan itu — `backupHealth` memulangkan `unknown`, bukan
 * `ok`.
 *
 * Dipanggil `scripts/backup.sh`:
 *     bun run record:backup ok    "<artifact>" "<bytes>"
 *     bun run record:backup lokal "<artifact>" "<bytes>"
 *     bun run record:backup gagal "<sebab>"
 *
 * ══ `lokal` BUKAN VARIAN DARI `ok` ═════════════════════════════════════════
 * `ok` berarti artefaknya pergi ke LUAR mesin ini. `lokal` berarti ia dibuat,
 * tersandi, lalu menginap di cakram yang sama dengan basis datanya — yang
 * terjadi bila `BACKUP_S3_BUCKET` belum disetel.
 *
 * Keduanya ditulis ke kolom `status` dengan nilai yang BERBEDA (`ok` vs
 * `local`) justru supaya tidak bisa tertukar: `backupHealth` mencari keberhasilan
 * terakhir dengan `where: { status: "ok" }`, jadi satu putaran lokal tidak akan
 * pernah mengisi `lastSuccessAt` dan membuat permukaan kesehatan berkata
 * terlindungi.
 */
import "dotenv/config";
import { PrismaClient as PlatformClient } from "../src/generated/platform/client.js";
import { buatAdapter } from "../src/lib/db-adapter";

function clientFor(rawUrl: string) {
  const url = new URL(rawUrl);
  return new PlatformClient({
    adapter: buatAdapter(url.toString(), { batasKoneksi: 1 }),
  });
}

async function main() {
  const [hasil, kedua, ketiga] = process.argv.slice(2);
  const ok = hasil === "ok";
  const lokal = hasil === "lokal";
  /* Artefak ADA pada `ok` maupun `lokal`; yang membedakan hanya ke mana ia
     pergi. Kalau ukuran & nama artefak hanya dicatat untuk `ok`, satu-satunya
     angka yang bisa membantah "cadangan berhasil tapi 0 byte" hilang justru di
     jalur yang paling butuh diperiksa. */
  const adaArtefak = ok || lokal;

  const rawUrl = process.env.PLATFORM_DATABASE_URL;
  if (!rawUrl) {
    /* Bukan galat: pemasangan tanpa basis data platform tetap boleh mencadangkan.
       Yang tidak ia dapat hanyalah riwayatnya. */
    console.warn("[record:backup] PLATFORM_DATABASE_URL kosong — putaran tidak dicatat.");
    return;
  }

  /*
   * `startedAt` diterima dari pemanggilnya lewat lingkungan, bukan dibaca di
   * sini. Kalau ia diisi `new Date()` di skrip ini, setiap putaran akan tercatat
   * berdurasi nol dan durasi cadangan — satu-satunya angka yang menunjukkan
   * dump membengkak sebelum ia mulai kehabisan waktu — hilang selamanya.
   */
  const mulai = process.env.BACKUP_STARTED_AT;
  const startedAt = mulai ? new Date(mulai) : new Date();

  const platform = clientFor(rawUrl);
  try {
    await platform.backupRun.create({
      data: {
        startedAt: Number.isNaN(startedAt.getTime()) ? new Date() : startedAt,
        finishedAt: new Date(),
        status: ok ? "ok" : lokal ? "local" : "error",
        error: adaArtefak ? null : (kedua ?? "sebab tidak disebutkan"),
        artifact: adaArtefak ? (kedua ?? null) : null,
        sizeBytes: adaArtefak && ketiga ? BigInt(ketiga) : null,
      },
    });
  } finally {
    await platform.$disconnect().catch(() => {});
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    /* Lihat catatan kepala berkas: mencatat tidak boleh menggagalkan mencadangkan. */
    console.warn("[record:backup] gagal mencatat putaran:", error instanceof Error ? error.message : error);
    process.exit(0);
  });
