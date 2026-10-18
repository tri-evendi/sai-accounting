/**
 * PENJAGA KESEHATAN — membaca KEADAAN, lalu mengetuk pintu (peta jalan §0.3)
 *
 *     bun run watch:health            # periksa & kirim bila perlu
 *     bun run watch:health --dry-run  # cetak putusannya; tidak mengirim apa pun
 *
 * == KENAPA SKRIP INI ADA, PADAHAL DENYUTNYA SUDAH BENAR ===================
 * Tiga denyut — cadangan (#374), penjadwal (#373), kesesuaian — sudah menjawab
 * dengan tepat, dan `/api/health` sudah mengeluarkan jawabannya. Yang tidak ada
 * adalah PEMBACANYA.
 *
 * Buktinya terukur: produksi menjalankan 54 putaran cadangan yang gagal
 * berturut-turut, penjadwal pernah menggantung dua jam, dan 1.439 temuan
 * kesesuaian berumur tanpa pernah mengetuk pintu siapa pun. Ketiganya tersedia
 * di tempat yang benar sepanjang waktu, dan tidak ada yang menanyakannya.
 *
 * == IA BERJALAN DARI JADWAL YANG BERBEDA, DAN ITU INTINYA ==================
 * Dipanggil `job-scheduler`. Untuk cadangan itu menentukan: penjaga yang hidup
 * di dalam layanan cadangan akan ikut mati bersama container yang mati, dan
 * "tidak ada putaran sama sekali" justru bentuk kegagalan paling sunyi —
 * `backup_runs` pernah 0 baris berbulan-bulan karena persis itu.
 *
 * ⚠ Untuk PENJADWAL ia punya titik buta yang harus dinyatakan: kalau penjadwal
 * mati total, penjaga ini mati bersamanya dan tidak akan melaporkan apa pun.
 * Yang menutupnya bukan penjaga ini, melainkan `/api/health` yang dibaca dari
 * LUAR mesin. Penjaga ini menangkap penjadwal yang MACET di satu langkah
 * (putaran tidak selesai, tapi langkah berikutnya tetap jalan di putaran
 * berikutnya) — dan itulah bentuk yang sudah pernah terjadi.
 *
 * == TIDAK PERNAH MENGGAGALKAN JADWALNYA ===================================
 * Keluar 0 apa pun yang terjadi: penjaga yang menjatuhkan penjadwal mengubah
 * pemantauan menjadi sumber kegagalan baru. Kalau platform tak terjangkau, yang
 * hilang hanya SATU pemeriksaan — dan ketiadaan itu akan terbaca besok.
 */
import "dotenv/config";
import { PrismaClient as PlatformClient } from "@sai/db/client/platform";
import { PrismaClient as ControlClient } from "@sai/db/client/control";
import { buatAdapter } from "@sai/db/adapter";
import { backupHealth } from "../src/lib/backup-heartbeat";
import { decideBackupAlert } from "../src/lib/backup-watchdog";
import { decideSchedulerAlert, decideConformanceAlert } from "../src/lib/health-watchdog";
import { schedulerHealth } from "../src/lib/scheduler-heartbeat";
import { conformanceHealth } from "../src/lib/conformance-heartbeat";
import { sendMail } from "../src/lib/mailer-core";

const DRY_RUN = process.argv.includes("--dry-run");

/** Peredam: satu surel per status per 24 jam. */
const PEREDAM_JAM = 24;

function log(...pesan: unknown[]) {
  console.log("[watch:health]", ...pesan);
}

function adapterFor(rawUrl: string) {
  const url = new URL(rawUrl);
  return buatAdapter(url.toString(), { batasKoneksi: 1 });
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

interface Komponen {
  nama: string;
  putusan: import("../src/lib/backup-watchdog").WatchdogDecision;
}

async function main() {
  const rawUrl = process.env.PLATFORM_DATABASE_URL?.trim();
  if (!rawUrl) {
    log("PLATFORM_DATABASE_URL kosong — tidak ada riwayat untuk diperiksa.");
    return;
  }

  const platform = new PlatformClient({ adapter: adapterFor(rawUrl) });
  const komponen: Komponen[] = [];

  try {
    /* ── 1. Cadangan ──────────────────────────────────────────────────────── */
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
    const cadangan = backupHealth(
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
    komponen.push({
      nama: "cadangan",
      putusan: decideBackupAlert({
        status: cadangan.status,
        lastSuccessAt: cadangan.lastSuccessAt,
        lastAttemptAt: cadangan.lastAttemptAt,
        lastError: cadangan.lastError,
        ageHours: cadangan.ageHours,
        staleAfterHours: cadangan.staleAfterHours,
      }),
    });

    /* ── 2. Penjadwal ─────────────────────────────────────────────────────── */
    /* `status` dan `errorCount` ikut dibaca: denyut menjawab "apakah penjadwal
       hidup", baris putarannya menjawab "apakah pekerjaannya berhasil". Dua
       pertanyaan, dan versi pertama penjaga ini hanya menanyakan yang pertama. */
    const putaran = await platform.schedulerRun.findFirst({
      orderBy: { id: "desc" },
      select: { finishedAt: true, status: true, errorCount: true },
    });
    const penjadwal = schedulerHealth(putaran?.finishedAt ?? null);
    komponen.push({
      nama: "penjadwal",
      putusan: decideSchedulerAlert({
        status: penjadwal.status,
        lastRunAt: penjadwal.lastRunAt,
        ageMinutes: penjadwal.ageMinutes,
        staleAfterMinutes: penjadwal.staleAfterMinutes,
        statusPutaran: putaran?.status === "error" ? "error" : putaran ? "ok" : null,
        jumlahGalat: putaran?.errorCount ?? null,
      }),
    });

    /* ── 3. Kesesuaian data ───────────────────────────────────────────────── */
    const kesesuaian = conformanceHealth(
      await platform.conformanceRun.findFirst({
        orderBy: { id: "desc" },
        select: { finishedAt: true, findingCount: true, companiesFailed: true },
      })
    );
    komponen.push({
      nama: "kesesuaian",
      putusan: decideConformanceAlert({
        status: kesesuaian.status,
        lastRunAt: kesesuaian.lastRunAt,
        ageHours: kesesuaian.ageHours,
        findingCount: kesesuaian.findingCount,
        companiesFailed: kesesuaian.companiesFailed,
        staleAfterHours: kesesuaian.staleAfterHours,
      }),
    });

    log(
      komponen
        .map((k) => `${k.nama}=${k.putusan.alert ? k.putusan.fingerprint : "ok"}`)
        .join("  ")
    );

    const berbunyi = komponen.filter((k) => k.putusan.alert);
    if (berbunyi.length === 0) {
      log("ketiganya sehat — tidak ada yang dikirim.");
      return;
    }

    const to = penerima();
    if (!to) {
      /* Bukan galat: pemasangan tanpa alamat tetap boleh berjalan. Tapi ia
         DICETAK, sebab "tidak ada penerima" dan "tidak ada masalah" adalah dua
         keadaan yang sangat berbeda dengan tampilan log yang sama. */
      log("⚠ tidak ada PLATFORM_ALERT_EMAIL/PLATFORM_CONTACT_EMAIL — peringatan TIDAK terkirim.");
      for (const k of berbunyi) log(k.putusan.body);
      return;
    }

    if (DRY_RUN) {
      for (const k of berbunyi) {
        log(`(dry-run) akan mengirim ke ${to}: ${k.putusan.subject}`);
        log(k.putusan.body);
      }
      return;
    }

    /*
     * ══ PEREDAM: DI TABEL, DAN PER KOMPONEN ═════════════════════════════════
     * Skrip ini lahir dan mati tiap putaran, jadi peredam dalam proses tidak
     * akan pernah meredam apa pun. Dan jadwal per jam saja TIDAK cukup: satu
     * container yang masuk restart-loop memanggil penjaga ini tiap kali ia
     * bangun, dan kotak masuk yang penuh adalah kotak masuk yang berhenti
     * dibaca — kegagalan yang bentuknya sama dengan tidak ada alarm.
     *
     * Kuncinya memuat SIDIK JARI per komponen, jadi tiga masalah berbeda tidak
     * saling meredam. Kalau kuncinya satu untuk semua, cadangan yang gagal
     * selama sebulan akan MENYEMBUNYIKAN penjadwal yang baru macet hari ini.
     *
     * Dipakai `rate_limit_counters` di basis data KENDALI apa adanya: tabel itu
     * memang penghitung berkunci dengan jendela tetap (#138).
     * `rate-limit-persistent.ts` TIDAK bisa diimpor — ia `server-only` (#140).
     */
    const controlUrl = process.env.CONTROL_DATABASE_URL?.trim();
    const control = controlUrl ? new ControlClient({ adapter: adapterFor(controlUrl) }) : null;
    const sejak = new Date(Date.now() - PEREDAM_JAM * 3_600_000);

    try {
      for (const k of berbunyi) {
        const kunci = `alert:${k.putusan.fingerprint}`;
        const terakhir = control
          ? await control.rateLimitCounter
              .findUnique({ where: { key: kunci }, select: { windowStartedAt: true } })
              .catch(() => null)
          : null;

        if (terakhir && terakhir.windowStartedAt > sejak) {
          log(`diredam — ${k.putusan.fingerprint} sudah dikirim ${terakhir.windowStartedAt.toISOString()}`);
          continue;
        }

        await sendMail({ to, subject: k.putusan.subject, text: k.putusan.body });
        log(`terkirim ke ${to}: ${k.putusan.subject}`);

        /* Dicatat SETELAH terkirim: surel yang gagal dikirim tidak boleh ikut
           meredam percobaan besok. */
        await control?.rateLimitCounter
          .upsert({
            where: { key: kunci },
            create: { key: kunci, windowStartedAt: new Date(), count: 1 },
            update: { windowStartedAt: new Date(), count: { increment: 1 } },
          })
          .catch((e: unknown) => log("⚠ gagal mencatat peredam:", e));
      }
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
    console.warn("[watch:health] gagal memeriksa:", error instanceof Error ? error.message : error);
    process.exit(0);
  });

