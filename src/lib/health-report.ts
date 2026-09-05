/**
 * LAPORAN KESIAPAN — satu pengumpul, dua permukaan (issue #374 · F-5).
 *
 * ══ KENAPA IA PINDAH KELUAR DARI ROUTE-NYA ═════════════════════════════════
 * Isi berkas ini dulu tinggal di dalam `app/api/health/route.ts`, dan di sana
 * ia benar selama pembacanya hanya satu. Sejak #374 meminta HALAMAN STATUS
 * PUBLIK, pembacanya menjadi dua — dan dua permukaan yang mengukur mesin yang
 * sama dengan kode masing-masing adalah dua permukaan yang suatu hari menjawab
 * berbeda tentangnya. Itu bukan kekhawatiran teoretis di repo ini: cacat
 * "dua tempat menyebut angka berbeda" adalah yang paling mahal di #472, dan
 * alasan `scheduler-heartbeat.ts` lahir sebagai modul tersendiri di #373.
 *
 * Jadi yang dipisahkan bukan sekadar kode bersama melainkan SUMBER JAWABAN:
 * `/api/health` (untuk mesin) dan `/status` (untuk orang) menanyai fungsi yang
 * sama, lalu masing-masing memutuskan apa yang layak ditampilkan kepada
 * pembacanya. Redaksinya milik `lib/public-status.ts`, bukan milik berkas ini.
 *
 * ══ SIFAT YANG TIDAK BOLEH HILANG DALAM PEMINDAHAN ═════════════════════════
 * Setiap bidang selain KENDALI **dilaporkan, tidak ikut memutuskan** —
 * doktrin #137. Karena itu tidak satu pun fungsi di bawah ini melempar:
 * kegagalan dijawab `unknown`/`error`, dan hanya pemanggilnya (route) yang
 * berhak menerjemahkan kendali yang mati menjadi 503.
 */
import "server-only";

import { controlDb } from "@/lib/control-db";
import { platformDb } from "@/lib/platform-db";
import { getCompanyClient } from "@/lib/company-clients";
import { schedulerHealth, type SchedulerHealth } from "@/lib/scheduler-heartbeat";
import { backupHealth, type BackupHealth } from "@/lib/backup-heartbeat";
import { mailHealth, type MailHealthStatus } from "@/lib/mail-health";
import { outboxCount, resolveMailConfig } from "@/lib/mailer-core";

/**
 * Kesiapan surel seperti yang boleh dilihat dari luar: satu kata.
 *
 * `"unknown"` BUKAN salah satu `MailHealthStatus` dan memang tidak boleh
 * menjadi satu — ketiga nilai itu adalah putusan tentang KONFIGURASI, sedangkan
 * `unknown` berarti pertanyaannya sendiri gagal ditanyakan. Menggabungkannya ke
 * dalam enum itu akan membuat kegagalan membaca tampil sebagai keadaan setelan
 * yang pasti.
 */
export type MailStatus = { status: MailHealthStatus | "unknown" };

/** Bidang yang jawabannya sekadar "terjangkau atau tidak diketahui". */
export type ReachStatus = { status: "ok" | "unknown" };

/** Bidang PT contoh — punya keadaan ketiga; lihat `sampleCompany()`. */
export type CompanyStatus = { status: "ok" | "unknown" | "error" };

/**
 * Denyut cadangan TANPA sebab kegagalannya.
 *
 * ══ KENAPA SATU MEDAN DICABUT ══════════════════════════════════════════════
 * `/api/health` ada di `isPublicPath` (`proxy.ts`) — ia HARUS begitu, sebab
 * Docker dan Traefik memanggilnya tanpa kredensial. Akibatnya seluruh isinya
 * terbaca siapa pun yang tahu alamatnya, dan `lastError` datang APA ADANYA
 * dari skrip cadangan: pada 5 September 2026 medan itu menerbitkan kalimat
 * "BACKUP_S3_BUCKET belum diset — cadangan yang tinggal di mesin yang sama
 * bukan cadangan" ke internet anonim. Itu bukan status layanan; itu
 * pemberitahuan bahwa pemasangan ini tidak punya salinan di luar server.
 *
 * Rambu #317 sudah menegakkan hal yang sama untuk surel — probe ini hanya
 * mengeluarkan `mail.status`, tanpa host maupun sumber konfigurasi. Medan
 * cadangan lahir belakangan dan tidak ikut menerima rambu itu; di sinilah ia
 * menerimanya.
 *
 * ⚠ Yang DIPERTAHANKAN adalah `status`. Pemantauan luar tidak punya cara lain
 * mengetahui cadangan berhenti berjalan, dan menghapus statusnya demi kerapian
 * akan memulihkan persis kesunyian yang #374 ditulis untuk mengakhirinya.
 * Sebabnya tetap ada di tabel `backup_runs` dan di log container — permukaan
 * yang butuh kredensial untuk dibaca.
 */
export type PublicBackupHealth = Omit<BackupHealth, "lastError">;

/**
 * Kendali yang tak terjangkau memulangkan bentuk yang BERBEDA, bukan bidang
 * bernilai buruk. Itu disengaja: ia satu-satunya keadaan yang berarti "belum
 * siap", dan membedakannya di TIPE membuat pemanggil mustahil lupa
 * menanganinya (`tsc` menolak akses `report.platform` sebelum penyempitan).
 */
export type HealthReport =
  | { status: "error"; database: "unreachable" }
  | {
      status: "ok";
      control: { status: "ok" };
      platform: ReachStatus;
      company: CompanyStatus;
      scheduler: SchedulerHealth;
      backup: PublicBackupHealth;
      mail: MailStatus;
    };

/**
 * Kesiapan surel — SATU KATA saja (#317).
 *
 * Probe ini publik, dan rambu #317 melarang membocorkan keadaan konfigurasi
 * surel ke permukaan publik. Host, alamat pengirim, sumber konfigurasi, dan
 * jumlah antrean (yang menyiratkan volume pemakaian) tinggal di konsol
 * operator. Kegagalan membacanya tidak boleh menjatuhkan probe.
 */
async function mail(): Promise<MailStatus> {
  try {
    const [config, count] = await Promise.all([resolveMailConfig(), outboxCount()]);
    return mailHealth({
      transport: config.transport,
      source: config.source,
      nodeEnv: process.env.NODE_ENV,
      outboxCount: count,
    }).public;
  } catch {
    return { status: "unknown" as const };
  }
}

/** Putaran terakhir yang SELESAI. Tak terjangkau / belum ada = `null`, bukan lemparan. */
async function lastSchedulerRun(): Promise<SchedulerHealth> {
  try {
    const run = await platformDb.schedulerRun.findFirst({
      orderBy: { id: "desc" },
      select: { finishedAt: true },
    });
    return schedulerHealth(run?.finishedAt ?? null);
  } catch {
    /*
     * Platform tak terjangkau, atau migration 0005 belum diterapkan. Keduanya
     * "belum ada yang bisa dilaporkan" — pola yang sama dengan
     * `schedulerRunsForOperator`, dan sengaja TIDAK dibedakan dari "belum
     * pernah jalan": keduanya sama-sama berarti probe ini tidak tahu, dan
     * jawaban yang jujur untuk tidak tahu adalah `unknown`.
     */
    return schedulerHealth(null);
  }
}

/**
 * Buang sebab kegagalan; lihat `PublicBackupHealth`. Ditulis sebagai
 * pembongkaran, bukan `delete`, supaya sebuah medan baru yang kelak
 * ditambahkan ke `BackupHealth` ikut terbawa keluar dengan sendirinya — dan
 * sebuah medan yang kelak TIDAK boleh terbit harus disebut namanya di sini,
 * yang persis pertanyaan yang ingin dipaksa muncul.
 */
function tanpaSebab({ lastError: _sebab, ...sisa }: BackupHealth): PublicBackupHealth {
  return sisa;
}

/**
 * DENYUT CADANGAN (issue #374).
 *
 * ── Kenapa DUA kueri, bukan satu ──────────────────────────────────────────
 * Yang dicari bukan "putaran terakhir" melainkan DUA fakta yang berbeda:
 * keberhasilan terakhir (yang menentukan umurnya) dan percobaan terakhir (yang
 * menentukan apakah ia sedang gagal SEKARANG). Satu kueri hanya bisa menjawab
 * salah satunya — dan justru perbedaan keduanya yang menjadi inti issue ini:
 * dua puluh enam kegagalan berturut-turut punya percobaan harian yang tepat
 * waktu, dan nol keberhasilan.
 */
async function lastBackup(): Promise<PublicBackupHealth> {
  try {
    const [sukses, percobaan] = await Promise.all([
      platformDb.backupRun.findFirst({
        where: { status: "ok" },
        orderBy: { finishedAt: "desc" },
        select: { finishedAt: true },
      }),
      platformDb.backupRun.findFirst({
        orderBy: { finishedAt: "desc" },
        select: { finishedAt: true, status: true, error: true },
      }),
    ]);
    return tanpaSebab(
      backupHealth(
        sukses?.finishedAt ?? null,
        percobaan
          ? { at: percobaan.finishedAt, ok: percobaan.status === "ok", error: percobaan.error }
          : null
      )
    );
  } catch {
    /* Platform tak terjangkau, atau migration 0012 belum diterapkan — pola yang
       sama dengan `lastSchedulerRun`. Keduanya berarti probe ini tidak tahu, dan
       jawaban yang jujur untuk tidak tahu adalah `unknown`, bukan `ok`. */
    return tanpaSebab(backupHealth(null, null));
  }
}

/**
 * Basis data PLATFORM terjangkau?
 *
 * DILAPORKAN, TIDAK IKUT MEMUTUSKAN — doktrin #137. Platform memikul penagihan
 * dan penjadwal langganan; ia BUKAN prasyarat aplikasi pelanggan bekerja.
 * Membuat probe menjawab 503 karena platform mati berarti Traefik berhenti
 * mengirim lalu lintas ke container yang sebenarnya melayani seluruh
 * pembukuan pelanggan dengan baik — kegagalan penagihan diubah menjadi
 * pemadaman layanan.
 */
async function platform(): Promise<ReachStatus> {
  try {
    await platformDb.$queryRaw`SELECT 1`;
    return { status: "ok" };
  } catch {
    return { status: "unknown" };
  }
}

/**
 * Satu basis data PT contoh terjangkau?
 *
 * Kendali yang terjangkau membuktikan orang bisa masuk dan perusahaannya bisa
 * DITEMUKAN — ia tidak membuktikan bukunya bisa DIBUKA. Kredensial yang salah,
 * migrasi yang belum jalan, atau basis data PT yang tidak dibuat akan lolos
 * probe lama sepenuhnya: `sai_control` sehat, dan setiap halaman pembukuan
 * gagal.
 *
 * ══ SATU, DAN CUKUP SATU ═══════════════════════════════════════════════════
 * Bukan semua PT. Jumlahnya tumbuh seiring pelanggan, dan sebuah probe yang
 * biayanya tumbuh adalah probe yang suatu hari menjadi beban yang ia ukur.
 * Satu PT membuktikan yang ingin dibuktikan: kredensial, jaringan, dan bentuk
 * skemanya benar.
 */
async function sampleCompany(): Promise<CompanyStatus> {
  let databaseName: string | null = null;
  try {
    /* PT mana pun, asal deterministik — `id` menaik supaya jawabannya tidak
       berpindah-pindah antar-panggilan dan sebuah kegagalan bisa ditelusuri. */
    const company = await controlDb.company.findFirst({
      orderBy: { id: "asc" },
      select: { databaseName: true },
    });
    databaseName = company?.databaseName ?? null;
  } catch {
    return { status: "unknown" };
  }

  /* Belum ada satu PT pun — pemasangan baru. Itu bukan kegagalan, dan
     menyebutnya `error` akan membuat setiap pemasangan segar terlihat sakit. */
  if (!databaseName) return { status: "unknown" };

  try {
    await getCompanyClient(databaseName).$queryRaw`SELECT 1`;
    return { status: "ok" };
  } catch {
    /*
     * DI SINI `error`, bukan `unknown`: kendali menyebut basis data ini ADA,
     * jadi tak terjangkaunya adalah kabar yang pasti — bukan ketidaktahuan.
     * Statusnya tetap `ok` di tingkat atas; yang ini untuk mata manusia dan
     * pemantauan, bukan untuk Traefik.
     */
    return { status: "error" };
  }
}

/**
 * Kumpulkan seluruh bidang kesiapan.
 *
 * KENDALI DIPERIKSA LEBIH DULU, DAN SENDIRIAN. Bukan gaya penulisan: bila ia
 * mati, lima pembacaan berikutnya sama-sama akan menunggu batas waktu koneksi
 * yang sama — dan sebuah probe kesiapan yang lambat justru pada saat mesinnya
 * sakit adalah probe yang ikut memperburuk keadaan yang ia laporkan.
 */
export async function healthReport(): Promise<HealthReport> {
  try {
    // Round-trip ringan untuk memastikan basis data kendali terjangkau.
    await controlDb.$queryRaw`SELECT 1`;
  } catch {
    return { status: "error", database: "unreachable" };
  }

  const [schedulerStatus, mailStatus, platformStatus, companyStatus, backupStatus] =
    await Promise.all([lastSchedulerRun(), mail(), platform(), sampleCompany(), lastBackup()]);

  /*
   * `status: "ok"` walau `platform` atau `company` bermasalah — lihat catatan
   * pada masing-masing fungsi. Yang menjatuhkan probe hanya basis data kendali,
   * dan itu sudah diputuskan di atas sebelum sampai ke sini.
   *
   * Kunci ditulis EKSPLISIT (bukan singkatan properti): penjaganya membaca
   * SUMBER berkas ini, dan singkatan membuatnya merah tanpa satu pun perilaku
   * berubah — pelajarannya bukan "longgarkan penjaganya".
   */
  return {
    status: "ok",
    control: { status: "ok" },
    platform: platformStatus,
    company: companyStatus,
    scheduler: schedulerStatus,
    backup: backupStatus,
    mail: mailStatus,
  };
}
