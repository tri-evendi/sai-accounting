/**
 * PENJAGA CADANGAN — mengubah status yang diam menjadi surel (peta jalan §0.2).
 *
 * ══ LUBANG YANG DITUTUP BERKAS INI ═════════════════════════════════════════
 * `backup-heartbeat.ts` sudah menjawab "apakah pembukuan pelanggan masih
 * disalin", dan `/api/health` sudah mengeluarkan jawabannya. Yang tidak ada
 * selama 54 putaran adalah seseorang yang MEMBACANYA. Diperiksa 11 Okt 2026:
 * `reportError` dipanggil dari tepat dua berkas, keduanya jalur autentikasi —
 * kegagalan cadangan tidak berbunyi ke siapa pun.
 *
 * Sebuah probe kesehatan yang benar tapi tak terbaca adalah pemantauan yang
 * seluruh nilainya bergantung pada kebiasaan manusia. Itu bukan pemantauan.
 *
 * ══ KENAPA PENJAGANYA TERPISAH DARI PEREKAMNYA ═════════════════════════════
 * Pilihan yang paling menggoda adalah mengirim surel dari `record:backup`:
 * ia sudah tahu putarannya gagal, dan tinggal satu pemanggilan. Tapi itu hanya
 * menutup kegagalan yang MELAPOR DIRI.
 *
 * Bentuk kegagalan yang paling mahal justru yang tidak melapor: container
 * `job-backup` mati, atau loop-nya menggantung, atau image-nya basi sehingga
 * `rekam` sendiri yang galat — dan itu BUKAN hipotesis, tabel `backup_runs`
 * pernah kosong 0 baris berbulan-bulan karena persis sebab terakhir.
 *
 * Maka penjaga ini berjalan dari jadwal yang BERBEDA (`job-scheduler`) dan
 * menanyai KEADAAN, bukan peristiwa. Ia berbunyi untuk "tidak ada putaran sama
 * sekali" dengan kekerasan yang sama seperti "putaran terakhir gagal".
 *
 * ══ MURNI, TANPA IMPOR ═════════════════════════════════════════════════════
 * Keputusannya di sini; Prisma dan pengirim surel ada di
 * `scripts/watch-backup-health.ts`. Alasan yang sama dengan
 * `conformance-heartbeat.ts`: yang sulit adalah aturannya, dan aturan yang bisa
 * diuji tanpa basis data akan benar-benar diuji.
 */
import type { BackupHealthStatus } from "./backup-heartbeat";

/**
 * Status yang TIDAK berbunyi. Hanya satu, dan daftar ini sengaja ditulis
 * sebagai yang-diizinkan alih-alih yang-dilarang: status baru yang kelak
 * ditambahkan ke `BackupHealthStatus` akan otomatis berbunyi sampai seseorang
 * memutuskan sebaliknya. Kebalikannya — daftar yang-dilarang — membuat status
 * baru diam secara bawaan, dan diam itulah kegagalan yang kita perbaiki.
 */
const TENANG: readonly BackupHealthStatus[] = ["ok"];

export interface WatchdogInput {
  status: BackupHealthStatus;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  ageHours: number | null;
  staleAfterHours: number;
}

export interface WatchdogDecision {
  /** Kirim surel? */
  alert: boolean;
  /** Baris subjek — status ikut di dalamnya supaya bisa disaring di kotak masuk. */
  subject: string;
  /** Badan surel. Kosong bila `alert` salah. */
  body: string;
  /**
   * Sidik jari peredam: SATU surel per status per hari, bukan per putaran.
   *
   * Sengaja tidak memuat waktu atau pesan galat: cadangan yang gagal dengan
   * sebab yang berubah-ubah sedikit (jam di pesan, nama berkas) akan lolos dari
   * peredam yang menyertakannya, dan kotak masuk yang penuh adalah kotak masuk
   * yang berhenti dibaca — kegagalan yang bentuknya sama dengan tidak ada alarm.
   */
  fingerprint: string;
}

const DIAM: WatchdogDecision = {
  alert: false,
  subject: "",
  body: "",
  fingerprint: "",
};

function kalimat(input: WatchdogInput): string {
  switch (input.status) {
    case "unknown":
      return (
        "TIDAK ADA SATU PUN PUTARAN CADANGAN yang tercatat.\n\n" +
        "Ini bentuk kegagalan yang paling berbahaya, sebab ia tidak melapor diri:\n" +
        "layanan `job-backup` bisa mati, loop-nya menggantung, atau image-nya basi\n" +
        "sehingga perekamnya sendiri yang galat. Yang terlihat dari luar hanya\n" +
        "ketiadaan — dan ketiadaan tidak berbunyi dengan sendirinya.\n\n" +
        "Periksa:  docker compose ps job-backup && docker compose logs --tail=50 job-backup"
      );
    case "failing":
      return (
        "PUTARAN TERAKHIR GAGAL, jadi tidak ada salinan baru hari ini.\n\n" +
        `sebab dari skripnya: ${input.lastError ?? "(tidak disebutkan)"}\n\n` +
        (input.lastSuccessAt
          ? `Salinan terakhir yang BERHASIL: ${input.lastSuccessAt} (${input.ageHours} jam lalu).\n`
          : "BELUM PERNAH ada satu pun salinan yang berhasil.\n")
      );
    case "late":
      return (
        "Putaran berjalan, tetapi salinan terakhir yang berhasil sudah TERLALU TUA.\n\n" +
        `  salinan terakhir : ${input.lastSuccessAt ?? "(tidak ada)"}\n` +
        `  umurnya          : ${input.ageHours} jam\n` +
        `  ambang           : ${input.staleAfterHours} jam\n`
      );
    case "local_only":
      return (
        "Cadangan harian BERJALAN dan artefaknya tersandi — tetapi ia tinggal di\n" +
        "mesin yang sama dengan basis datanya, sebab `BACKUP_S3_BUCKET` belum disetel.\n\n" +
        "Yang jaring ini SUDAH lindungi: `DROP TABLE` yang keliru, migrasi yang\n" +
        "merusak, kerusakan logis, berkas terhapus — mayoritas kejadian nyata.\n\n" +
        "Yang ia TIDAK lindungi, dan tidak akan pernah: kehilangan mesin. Satu\n" +
        "kebakaran, satu cakram mati, satu akun yang hilang menghapus data DAN\n" +
        "salinannya sekaligus.\n\n" +
        "Isi `BACKUP_S3_BUCKET` + kredensialnya (`BACKUP_S3_ENDPOINT` untuk penyedia\n" +
        "S3-compatible), lalu surel ini berhenti sendiri.\n\n" +
        "⚠ Dan simpan `BACKUP_ENCRYPTION_KEY` di luar server ini: cadangan yang\n" +
        "tersandi dengan kunci yang hanya hidup di mesin yang hilang tidak bisa\n" +
        "dipulihkan."
      );
    case "ok":
      return "";
  }
}

/**
 * Apakah keadaan cadangan perlu diketuk ke pintu seseorang, dan kalimat apa.
 *
 * Murni: satu masukan, satu putusan, nol IO.
 */
export function decideBackupAlert(input: WatchdogInput): WatchdogDecision {
  if (TENANG.includes(input.status)) return DIAM;

  const pesan = kalimat(input);
  return {
    alert: true,
    subject: `[SAI] cadangan: ${input.status}`,
    body:
      `${pesan}\n\n` +
      `── keadaan apa adanya ──\n` +
      `  status            : ${input.status}\n` +
      `  percobaan terakhir: ${input.lastAttemptAt ?? "(belum pernah)"}\n` +
      `  berhasil terakhir : ${input.lastSuccessAt ?? "(belum pernah)"}\n` +
      `  ambang basi       : ${input.staleAfterHours} jam\n\n` +
      "Diperiksa penjaga job-scheduler; lihat /api/health medan \"backup\".\n" +
      `Surel berikutnya untuk status yang sama paling cepat 24 jam lagi.\n`,
    fingerprint: `backup:${input.status}`,
  };
}
