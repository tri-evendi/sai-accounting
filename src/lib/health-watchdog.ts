/**
 * PENJAGA PENJADWAL & KESESUAIAN — sisa P1-1 (peta jalan §0.3)
 *
 * == KENAPA BERKAS INI ADA, SETELAH `backup-watchdog.ts` ====================
 * Pola yang sama sudah terbukti untuk cadangan: denyutnya benar, probe-nya
 * benar, dan yang hilang adalah PEMBACANYA. Dua denyut lain punya lubang yang
 * identik:
 *
 *   • `scheduler-heartbeat.ts` tahu kapan penjadwal terakhir berjalan. Dan
 *     penjadwal yang MENGGANTUNG pernah terjadi di produksi — dua jam, CPU
 *     0,09%, container "Up", log terakhir "✓ selesai tanpa masalah". Nol galat
 *     di mana pun; yang menyingkapkannya hanya `/api/health`.
 *   • `conformance-heartbeat.ts` tahu ada 1.439 temuan di buku produksi. Itu
 *     angka yang BERARTI — 1.329 dokumen valas tanpa kurs — dan ia tidak pernah
 *     mengetuk pintu siapa pun.
 *
 * == KENAPA SATU BERKAS, BUKAN DUA ========================================
 * Keduanya menjawab bentuk pertanyaan yang sama ("apakah keadaan ini perlu
 * diketuk ke pintu seseorang"), memakai tipe putusan yang sama, dan punya
 * peredam yang sama. Memisahkannya berarti tiga berkas yang akan menyimpang
 * dalam detail peredaman — dan peredam yang menyimpang adalah cara paling halus
 * untuk membuat satu alarm berhenti berbunyi tanpa ada yang menyadarinya.
 *
 * `decideBackupAlert` DIBIARKAN di tempatnya: ia sudah digelar dan terbukti
 * berbunyi di produksi. Memindahkannya hanya untuk kerapian berarti mengubah
 * kode yang sedang bekerja tanpa satu pun alasan perilaku.
 *
 * Murni, nol IO — alasan yang sama dengan `backup-watchdog.ts`.
 */
import type { WatchdogDecision } from "@/lib/backup-watchdog";
import type { SchedulerHealthStatus } from "@/lib/scheduler-heartbeat";
import type { ConformanceHealthStatus } from "@/lib/conformance-heartbeat";

const DIAM: WatchdogDecision = { alert: false, subject: "", body: "", fingerprint: "" };

/** Ekor yang sama di setiap surel: keadaan apa adanya, lalu catatan peredam. */
function badan(pesan: string, keadaan: Array<[string, string]>): string {
  const lebar = Math.max(...keadaan.map(([k]) => k.length));
  return (
    `${pesan}\n\n` +
    `── keadaan apa adanya ──\n` +
    keadaan.map(([k, v]) => `  ${k.padEnd(lebar)} : ${v}`).join("\n") +
    `\n\nSurel berikutnya untuk status yang sama paling cepat 24 jam lagi.\n`
  );
}

export interface SchedulerWatchdogInput {
  status: SchedulerHealthStatus;
  lastRunAt: string | null;
  ageMinutes: number | null;
  staleAfterMinutes: number;
  /**
   * Status yang DIREKAM putaran terakhir di `scheduler_runs` — bukan hasil
   * denyut. `null` bila tidak ada putaran.
   *
   * ══ KENAPA INI TERPISAH DARI `status` DI ATAS ═══════════════════════════
   * `schedulerHealth()` menjawab satu pertanyaan: **apakah penjadwalnya hidup**
   * (ada putaran yang selesai dalam ambang). Itu kontrak `/api/health`, dan ia
   * benar untuk pertanyaan itu.
   *
   * Tapi ada pertanyaan KEDUA yang jawabannya berbeda: **apakah pekerjaannya
   * berhasil**. Sebuah putaran bisa selesai tepat waktu sambil merekam
   * `status = "error"` — dan denyutnya akan tetap berkata `ok`, sebab dari
   * sudut pandangnya penjadwalnya memang hidup.
   *
   * Diukur di produksi: 5 putaran berstatus `error` (Agu 2026) yang semuanya
   * dilaporkan `ok` oleh denyut. Dan penjaga yang saya kirim pagi ini hanya
   * membaca `finishedAt` — jadi ia mewarisi titik buta yang sama.
   */
  statusPutaran?: "ok" | "error" | null;
  /** `error_count` putaran terakhir. */
  jumlahGalat?: number | null;
}

/**
 * Penjadwal: hanya `ok` yang diam.
 *
 * Perhatikan bahwa `late` di sini BUKAN "pekerjaan tertunda" — ia berarti tidak
 * ada putaran yang selesai dalam ambang, dan penyebab yang paling sering bukan
 * kegagalan melainkan KEMACETAN. Pesannya karena itu menyebut `docker top`,
 * bukan hanya log: langkah yang menggantung tidak meninggalkan baris log.
 */
export function decideSchedulerAlert(input: SchedulerWatchdogInput): WatchdogDecision {
  /*
   * Penjadwal HIDUP tapi pekerjaannya GAGAL — diperiksa SEBELUM `ok` dipulangkan
   * diam, sebab inilah keadaan yang paling mudah lolos: semua tampak normal dari
   * luar, dan satu-satunya yang berbeda ada di dalam barisnya sendiri.
   */
  if (input.status === "ok" && input.statusPutaran === "error") {
    const n = input.jumlahGalat ?? 0;
    return {
      alert: true,
      subject: "[SAI] penjadwal: putaran selesai dengan galat",
      body: badan(
        "PENJADWAL BERJALAN TEPAT WAKTU, TETAPI PUTARAN TERAKHIR MEREKAM GALAT.\n\n" +
          "Denyutnya berkata `ok` — dan itu BENAR untuk pertanyaan yang ia jawab:\n" +
          "penjadwalnya hidup. Yang gagal adalah PEKERJAANNYA, dan itu pertanyaan\n" +
          "yang berbeda.\n\n" +
          "Jadi tidak ada yang akan terlihat salah dari luar: container `Up`,\n" +
          "putaran tepat waktu, `/api/health` menjawab `scheduler: ok`.\n\n" +
          "Rinciannya ada di kolom `details` baris terakhir `scheduler_runs`, dan\n" +
          "di log:  docker compose logs --tail=120 job-scheduler",
        [
          ["status denyut", input.status],
          ["status putaran", "error"],
          ["jumlah galat", String(n)],
          ["putaran terakhir", input.lastRunAt ?? "(belum pernah)"],
        ]
      ),
      /* Sidik jari TERPISAH dari `scheduler:late`: keduanya menuntut tindakan
         yang berbeda, dan satu tidak boleh meredam yang lain. */
      fingerprint: "scheduler:errors",
    };
  }

  if (input.status === "ok") return DIAM;

  const pesan =
    input.status === "unknown"
      ? "TIDAK ADA SATU PUN PUTARAN PENJADWAL yang tercatat.\n\n" +
        "Langganan tidak diperbarui, pengingat tidak terkirim, dan jejak putaran\n" +
        "tidak tumbuh. Kalau pemasangan ini baru lahir, ini normal — sekali saja.\n\n" +
        "Periksa:  docker compose ps job-scheduler && docker compose logs --tail=50 job-scheduler"
      : "PENJADWAL TERLAMBAT — tidak ada putaran yang selesai dalam ambang.\n\n" +
        "Penyebab yang paling sering BUKAN kegagalan, melainkan KEMACETAN: satu\n" +
        "langkah yang menggantung tidak meninggalkan baris log, container tetap\n" +
        '"Up", dan log terakhir tetap berbunyi "selesai tanpa masalah". Itu sudah\n' +
        "terjadi di produksi — dua jam, CPU 0,09%.\n\n" +
        "Periksa:  docker top sai-job-scheduler && docker compose logs --tail=80 job-scheduler";

  return {
    alert: true,
    subject: `[SAI] penjadwal: ${input.status}`,
    body: badan(pesan, [
      ["status", input.status],
      ["putaran terakhir", input.lastRunAt ?? "(belum pernah)"],
      ["umurnya", input.ageMinutes === null ? "-" : `${input.ageMinutes} menit`],
      ["ambang", `${input.staleAfterMinutes} menit`],
    ]),
    fingerprint: `scheduler:${input.status}`,
  };
}

export interface ConformanceWatchdogInput {
  status: ConformanceHealthStatus;
  lastRunAt: string | null;
  ageHours: number | null;
  findingCount: number | null;
  companiesFailed: number | null;
  staleAfterHours: number;
}

/**
 * Kesesuaian data: `ok` diam, sisanya berbunyi.
 *
 * ══ SATU KEPUTUSAN YANG MUDAH SALAH ══════════════════════════════════════
 * `findings` BERBUNYI, dan itu disengaja meski temuannya bisa bertahan
 * berbulan-bulan. Alasannya: temuan yang tidak pernah diketuk ke pintu siapa pun
 * sama saja dengan tidak diperiksa. Peredam 24 jam yang membuatnya tertahankan —
 * satu surel sehari, bukan satu per temuan.
 *
 * Yang TIDAK boleh: menjadikan `findings` diam supaya kotak masuk tenang. Itu
 * memindahkan masalahnya ke tempat yang tidak terlihat, yang persis bagaimana
 * 1.439 temuan bisa berumur tanpa ada yang tahu.
 */
export function decideConformanceAlert(input: ConformanceWatchdogInput): WatchdogDecision {
  if (input.status === "ok") return DIAM;

  let pesan: string;
  switch (input.status) {
    case "unknown":
      pesan =
        "TIDAK ADA SATU PUN PEMERIKSAAN KESESUAIAN yang tercatat.\n\n" +
        "Artinya tidak ada yang tahu apakah pembukuan ke-17 buku masih konsisten.\n" +
        "Ketiadaan temuan BUKAN berarti bersih.\n\n" +
        "Periksa:  docker compose logs --tail=50 job-conformance";
      break;
    case "late":
      pesan =
        (input.companiesFailed && input.companiesFailed > 0
          ? `${input.companiesFailed} BUKU GAGAL DIPERIKSA.\n\n` +
            "Buku yang tak terperiksa tidak sama dengan buku yang bersih — dan\n" +
            "inilah sebabnya kegagalan memeriksa diperlakukan sekeras temuan.\n\n"
          : "PEMERIKSAAN KESESUAIAN SUDAH TERLALU LAMA tidak berjalan.\n\n") +
        "Periksa:  docker compose ps job-conformance";
      break;
    case "findings":
      pesan =
        `${input.findingCount ?? "?"} TEMUAN KESESUAIAN DATA.\n\n` +
        "Ini bukan galat aplikasi: ia data yang tidak memenuhi aturan pembukuan —\n" +
        "dokumen valas tanpa kurs, status di luar kosakata, dan sejenisnya. Setiap\n" +
        "temuan muncul di laporan dan berpotensi salah dibaca sebagai angka yang sah.\n\n" +
        "Rinciannya:  /operator/conformance";
      break;
    /* Tidak ada `case "ok"`: penjagaan di atas sudah memulangkan DIAM, dan
       `tsc` menolak cabang yang tak mungkin dicapai. Penjagaan itu dipertahankan
       di atas — bukan dipindah ke sini — supaya "hanya `ok` yang diam" terbaca
       sebagai aturan di awal fungsi, bukan sebagai salah satu cabang. */
  }

  return {
    alert: true,
    subject: `[SAI] kesesuaian: ${input.status}`,
    body: badan(pesan, [
      ["status", input.status],
      ["putaran terakhir", input.lastRunAt ?? "(belum pernah)"],
      ["umurnya", input.ageHours === null ? "-" : `${input.ageHours} jam`],
      ["temuan", input.findingCount === null ? "-" : String(input.findingCount)],
      ["buku gagal", input.companiesFailed === null ? "-" : String(input.companiesFailed)],
      ["ambang", `${input.staleAfterHours} jam`],
    ]),
    fingerprint: `conformance:${input.status}`,
  };
}
