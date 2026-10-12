/**
 * PENJAGA CADANGAN — membaca keadaan, lalu mengetuk pintu (peta jalan §0.2).
 *
 *     bun run watch:backup            # periksa & kirim bila perlu
 *     bun run watch:backup --dry-run  # cetak putusannya; tidak mengirim apa pun
 *
 * ══ KENAPA SKRIP INI ADA, PADAHAL DENYUTNYA SUDAH BENAR ════════════════════
 * `backupHealth` sudah menjawab dengan tepat, dan `/api/health` sudah
 * mengeluarkan jawabannya sejak #374. Yang tidak ada adalah pembacanya:
 * produksi menjalankan 54 putaran gagal berturut-turut sementara jawaban yang
 * benar tersedia sepanjang waktu di tempat yang tidak ditanya siapa pun.
 *
 * ══ IA BERJALAN DARI JADWAL YANG BERBEDA, DAN ITU INTINYA ══════════════════
 * Dipanggil `job-scheduler`, bukan `job-backup`. Kalau ia hidup di dalam
 * layanan cadangan, maka container cadangan yang MATI akan membawa penjaganya
 * ikut mati — dan bentuk kegagalan yang paling mahal (tidak ada putaran sama
 * sekali) justru yang paling sunyi. Tabel `backup_runs` pernah 0 baris selama
 * berbulan-bulan; tidak ada satu pun surel yang bisa dikirim dari dalam sana.
 *
 * ══ TIDAK PERNAH MENGGAGALKAN JADWALNYA ════════════════════════════════════
 * Keluar 0 apa pun yang terjadi, alasan yang sama dengan `record:backup`:
 * penjaga yang menjatuhkan penjadwal mengubah pemantauan menjadi sumber
 * kegagalan baru. Kalau basis data platform tak terjangkau, yang hilang hanya
 * SATU pemeriksaan — dan ketiadaan itu akan terbaca besok.
 */
import "dotenv/config";
import { PrismaClient as PlatformClient } from "../src/generated/platform/client.js";
import { PrismaClient as ControlClient } from "../src/generated/control/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { backupHealth } from "../src/lib/backup-heartbeat";
import { decideBackupAlert } from "../src/lib/backup-watchdog";
import { sendMail } from "../src/lib/mailer-core";

const DRY_RUN = process.argv.includes("--dry-run");

/** Peredam: satu surel per status per 24 jam. */
const PEREDAM_JAM = 24;

function log(...pesan: unknown[]) {
  console.log("[watch:backup]", ...pesan);
}

function adapterFor(rawUrl: string) {
  const url = new URL(rawUrl);
  return new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: 1,
  });
}

/**
 * Ke mana peringatan dikirim — aturan yang SAMA dengan `src/lib/alert.ts`.
 * Disalin, bukan diimpor, sebab `alert.ts` menarik `@/lib/mailer` yang
 * `server-only` dan skrip di luar Next tidak bisa memuatnya (#140).
 */
function penerima(): string | null {
  return (
    process.env.PLATFORM_ALERT_EMAIL?.trim() ||
    process.env.PLATFORM_CONTACT_EMAIL?.trim() ||
    null
  );
}

async function main() {
  const rawUrl = process.env.PLATFORM_DATABASE_URL?.trim();
  if (!rawUrl) {
    log("PLATFORM_DATABASE_URL kosong — tidak ada riwayat untuk diperiksa.");
    return;
  }

  const platform = new PlatformClient({ adapter: adapterFor(rawUrl) });
  try {
    const [sukses, percobaan] = await Promise.all([
      platform.backupRun.findFirst({
        where: { status: "ok" },
        orderBy: { finishedAt: "desc" },
        select: { finishedAt: true },
      }),
      platform.backupRun.findFirst({
        orderBy: { finishedAt: "desc" },
        select: { finishedAt: true, status: true, error: true },
      }),
    ]);

    const health = backupHealth(
      sukses?.finishedAt ?? null,
      percobaan
        ? {
            at: percobaan.finishedAt,
            ok: percobaan.status === "ok",
            localOnly: percobaan.status === "local",
            error: percobaan.error,
          }
        : null
    );

    const putusan = decideBackupAlert({
      status: health.status,
      lastSuccessAt: health.lastSuccessAt,
      lastAttemptAt: health.lastAttemptAt,
      lastError: health.lastError,
      ageHours: health.ageHours,
      staleAfterHours: health.staleAfterHours,
    });

    log(`status=${health.status} berbunyi=${putusan.alert}`);
    if (!putusan.alert) {
      log("cadangan sehat — tidak ada yang dikirim.");
      return;
    }

    const to = penerima();
    if (!to) {
      /* Bukan galat: pemasangan tanpa alamat tetap boleh mencadangkan. Tapi ia
         DICETAK, sebab "tidak ada penerima" dan "tidak ada masalah" adalah dua
         keadaan yang sangat berbeda dengan tampilan log yang sama. */
      log("⚠ tidak ada PLATFORM_ALERT_EMAIL/PLATFORM_CONTACT_EMAIL — peringatan TIDAK terkirim.");
      log(putusan.body);
      return;
    }

    if (DRY_RUN) {
      log(`(dry-run) akan mengirim ke ${to}: ${putusan.subject}`);
      log(putusan.body);
      return;
    }

    /*
     * ══ PEREDAM: DI TABEL, BUKAN DI MEMORI ═══════════════════════════════════
     * Skrip ini lahir dan mati tiap putaran, jadi peredam dalam proses tidak akan
     * pernah meredam apa pun. Dan jadwal harian saja TIDAK cukup menjadi peredam:
     * satu container yang masuk restart-loop memanggil penjaga ini tiap kali ia
     * bangun, dan kotak masuk yang penuh adalah kotak masuk yang berhenti dibaca
     * — kegagalan yang bentuknya sama dengan tidak ada alarm sama sekali.
     *
     * Dipakai `rate_limit_counters` di basis data KENDALI apa adanya: tabel itu
     * memang penghitung berkunci dengan jendela tetap (#138), persis bentuk yang
     * dibutuhkan di sini. Tidak ada tabel baru, tidak ada migrasi — dan satu
     * tabel peredam kedua berarti dua mekanisme yang akan menyimpang.
     *
     * `rate-limit-persistent.ts` TIDAK bisa diimpor: ia `server-only` (#140).
     */
    const kunci = `alert:${putusan.fingerprint}`;
    const sejak = new Date(Date.now() - PEREDAM_JAM * 3_600_000);
    const controlUrl = process.env.CONTROL_DATABASE_URL?.trim();
    const control = controlUrl
      ? new ControlClient({ adapter: adapterFor(controlUrl) })
      : null;

    try {
      const terakhir = control
        ? await control.rateLimitCounter
            .findUnique({ where: { key: kunci }, select: { windowStartedAt: true } })
            .catch(() => null)
        : null;

      if (terakhir && terakhir.windowStartedAt > sejak) {
        log(
          `diredam — surel ${putusan.fingerprint} sudah dikirim ${terakhir.windowStartedAt.toISOString()}`
        );
        return;
      }

      await sendMail({ to, subject: putusan.subject, text: putusan.body });
      log(`terkirim ke ${to}`);

      /* Dicatat SETELAH terkirim: surel yang gagal dikirim tidak boleh ikut
         meredam percobaan besok. */
      await control?.rateLimitCounter
        .upsert({
          where: { key: kunci },
          create: { key: kunci, windowStartedAt: new Date(), count: 1 },
          update: { windowStartedAt: new Date(), count: { increment: 1 } },
        })
        .catch((e: unknown) => log("⚠ gagal mencatat peredam:", e));
    } finally {
      await control?.$disconnect().catch(() => {});
    }
  } finally {
    await platform.$disconnect().catch(() => {});
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    /* Lihat kepala berkas: penjaga tidak boleh menjatuhkan penjadwalnya. */
    console.warn("[watch:backup] gagal memeriksa:", error instanceof Error ? error.message : error);
    process.exit(0);
  });
