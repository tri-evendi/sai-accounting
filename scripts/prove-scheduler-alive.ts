/**
 * BUKTI: penjadwal langganan masih berdetak (issue #373).
 *
 *   bun run prove-scheduler-alive
 *
 * Keluar 0 bila putaran terakhir masih dalam ambang, 1 bila terlambat atau
 * tidak diketahui — jadi ia bisa dipasang langsung sebagai pemeriksaan
 * pemantauan luar, bukan hanya dibaca manusia.
 *
 * ══ KENAPA SKRIP TERSENDIRI, PADAHAL `/api/health` SUDAH MENYEBUTNYA ═══════
 * Karena keduanya menjawab pertanyaan yang berbeda kepada penanya yang berbeda.
 * `/api/health` dibaca dari LUAR lewat HTTP dan sengaja tidak pernah 503 karena
 * penjadwal (doktrin #137: penagihan mati ≠ aplikasi mati — kalau probe itu
 * gagal, Traefik berhenti mengirim lalu lintas dan satu masalah penagihan
 * berubah jadi pemadaman). Skrip ini dijalankan DI SEBELAH basis datanya,
 * boleh gagal dengan keras, dan karena itu bisa menjadi baris daftar
 * "siap rilis" yang sebenarnya.
 *
 * `unknown` DIPERLAKUKAN SEBAGAI GAGAL di sini, berbeda dari `/api/health`
 * yang hanya melaporkannya. Sebuah pembuktian yang lulus karena tidak tahu
 * bukan pembuktian — dan pemasangan yang memang belum pernah menjalankan
 * penjadwalnya justru yang paling perlu diberi tahu.
 */

import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient as PlatformClient } from "../src/generated/platform/client.js";
import { schedulerHealth } from "../src/lib/scheduler-heartbeat";

async function main() {
  const url = process.env.PLATFORM_DATABASE_URL;
  if (!url) {
    console.error(
      "GAGAL: PLATFORM_DATABASE_URL belum diset — riwayat penjadwal tinggal di\n" +
        "`sai_platform` (issue #137), dan tanpa alamatnya tidak ada yang bisa dibuktikan."
    );
    process.exit(1);
  }

  const parsed = new URL(url);
  const platform = new PlatformClient({
    adapter: new PrismaMariaDb({
      host: parsed.hostname,
      port: Number(parsed.port) || 3306,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, ""),
      connectionLimit: 1,
    }),
  });

  let health;
  try {
    const run = await platform.schedulerRun.findFirst({
      orderBy: { id: "desc" },
      select: { finishedAt: true, status: true, errorCount: true },
    });
    health = schedulerHealth(run?.finishedAt ?? null);

    if (health.status === "ok") {
      console.log(
        `✓ Penjadwal berdetak — putaran terakhir ${health.lastRunAt} ` +
          `(${health.ageMinutes} menit lalu, ambang ${health.staleAfterMinutes} menit).`
      );
      if (run && run.errorCount > 0) {
        /* Berdetak TAPI putarannya bermasalah. Ini bukan kegagalan denyut, dan
           menjadikannya keluar-1 akan menyatukan dua keadaan yang menuntut
           tindakan berbeda — jadi ia disebut, bukan diubah jadi kegagalan. */
        console.warn(
          `⚠ Putaran terakhir berstatus "${run.status}" dengan ${run.errorCount} masalah — ` +
            "buka /operator/scheduler untuk rinciannya."
        );
      }
      await platform.$disconnect();
      return;
    }

    if (health.status === "late") {
      console.error(
        `✗ Penjadwal TERLAMBAT — putaran terakhir ${health.lastRunAt} ` +
          `(${health.ageMinutes} menit lalu, ambang ${health.staleAfterMinutes} menit).\n` +
          "  Periksa layanan `scheduler` di docker compose: `docker compose logs scheduler`."
      );
    } else {
      console.error(
        "✗ Penjadwal TIDAK DIKETAHUI — belum pernah ada satu putaran pun tercatat.\n" +
          "  Layanan `scheduler` sudah jalan? `docker compose ps scheduler`\n" +
          "  Migration platform sudah diterapkan? `bun run db:migrate:platform`"
      );
    }
  } catch (error) {
    console.error(
      "✗ Riwayat penjadwal tak terbaca (`sai_platform` terjangkau? migration 0005 sudah?):",
      error
    );
    await platform.$disconnect().catch(() => {});
    process.exit(1);
  }

  await platform.$disconnect();
  process.exit(1);
}

main().catch((error) => {
  console.error("Gagal membuktikan denyut penjadwal:", error);
  process.exit(1);
});
