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
 *     bun run record:backup ok   "<artifact>" "<bytes>"
 *     bun run record:backup gagal "<sebab>"
 */
import "dotenv/config";
import { PrismaClient as PlatformClient } from "../src/generated/platform/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

function clientFor(rawUrl: string) {
  const url = new URL(rawUrl);
  return new PlatformClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 1,
    }),
  });
}

async function main() {
  const [hasil, kedua, ketiga] = process.argv.slice(2);
  const ok = hasil === "ok";

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
        status: ok ? "ok" : "error",
        error: ok ? null : (kedua ?? "sebab tidak disebutkan"),
        artifact: ok ? (kedua ?? null) : null,
        sizeBytes: ok && ketiga ? BigInt(ketiga) : null,
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
