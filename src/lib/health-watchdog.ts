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
import type { SchedulerHealthStatus } from "@sai/core/scheduler-heartbeat";
import type { ConformanceHealthStatus } from "@/lib/conformance-heartbeat";
import type { MigrationsHealth } from "@sai/core/schema-version";
import type { OutboxHealthStatus } from "@sai/core/outbox-health";

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
          "di log:  docker compose logs --tail=400 svc-worker | grep ' scheduler *|'",
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
        "Periksa:  docker compose ps svc-worker && docker compose logs --tail=200 svc-worker | grep ' scheduler *|'"
      : "PENJADWAL TERLAMBAT — tidak ada putaran yang selesai dalam ambang.\n\n" +
        "Penyebab yang paling sering BUKAN kegagalan, melainkan KEMACETAN: satu\n" +
        "langkah yang menggantung tidak meninggalkan baris log, container tetap\n" +
        '"Up", dan log terakhir tetap berbunyi "selesai tanpa masalah". Itu sudah\n' +
        "terjadi di produksi — dua jam, CPU 0,09%.\n\n" +
        "Periksa:  docker top sai-svc-worker && docker compose logs --tail=300 svc-worker | grep ' scheduler *|'";

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

/**
 * Penerbit Go (jalur `schedule`): `node` dan `ok` diam, sisanya berbunyi.
 *
 * `unknown` BERBUNYI, berbeda dari kebiasaan "pemasangan baru": di sini ia
 * berarti kontrak sudah menyerahkan penerbitan ke Go, tetapi tidak satu pun
 * denyut Go pernah selesai — persis keadaan di mana dokumen berulang dan
 * cadangan berhenti terbit tanpa satu baris pun yang menua di antrean. Denyut
 * pertama selesai dalam hitungan detik sesudah `svc-integrator` naik, jadi
 * `unknown` yang bertahan sampai putaran penjaga ini bukan kebetulan.
 */
export interface ScheduleLaneWatchdogInput {
  status: "node" | SchedulerHealthStatus;
  goKinds: readonly string[];
  lastRunAt: string | null;
  ageMinutes: number | null;
  staleAfterMinutes: number;
}

export function decideScheduleLaneAlert(input: ScheduleLaneWatchdogInput): WatchdogDecision {
  if (input.status === "node" || input.status === "ok") return DIAM;
  const pesan =
    (input.status === "unknown"
      ? "PENERBIT GO TIDAK PERNAH BERDETAK — tidak ada satu pun `schedule.tick` yang selesai.\n\n"
      : "PENERBIT GO TERLAMBAT — tidak ada `schedule.tick` yang selesai dalam ambang.\n\n") +
    "Kontrak (`contract/kinds.yaml` → `schedule.publisher: go`) menyerahkan penerbitan\n" +
    `${input.goKinds.join(", ")} ke jalur \`schedule\` di svc-integrator, dan langkah Node\n` +
    "di peran `scheduler` sengaja MELEWATI dirinya. Jadi bila jalur Go diam, tidak ada\n" +
    "yang menerbitkan — dan antrean yang kosong terbaca sehat.\n\n" +
    "Periksa:  docker compose logs --tail=300 svc-integrator | grep '\\[schedule\\]'\n" +
    "Jalan mundur (Node menerbitkan lagi): PRODUCTION.md §Penerbit denyut.";
  return {
    alert: true,
    subject: `[SAI] penerbit Go: ${input.status}`,
    body: badan(pesan, [
      ["status", input.status],
      ["kind milik Go", input.goKinds.join(", ")],
      ["tick terakhir", input.lastRunAt ?? "(belum pernah)"],
      ["umurnya", input.ageMinutes === null ? "-" : `${input.ageMinutes} menit`],
      ["ambang", `${input.staleAfterMinutes} menit`],
    ]),
    fingerprint: `schedule-lane:${input.status}`,
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
        "Periksa:  docker compose logs --tail=300 svc-worker | grep ' conformance *|'";
      break;
    case "late":
      pesan =
        (input.companiesFailed && input.companiesFailed > 0
          ? `${input.companiesFailed} BUKU GAGAL DIPERIKSA.\n\n` +
            "Buku yang tak terperiksa tidak sama dengan buku yang bersih — dan\n" +
            "inilah sebabnya kegagalan memeriksa diperlakukan sekeras temuan.\n\n"
          : "PEMERIKSAAN KESESUAIAN SUDAH TERLALU LAMA tidak berjalan.\n\n") +
        "Periksa:  docker compose ps svc-worker";
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

/* ══ FAN-OUT MIGRATION BUKU (09 §6) ═════════════════════════════════════════ */

export interface MigrationsWatchdogInput {
  status: MigrationsHealth;
  /** Migration buku yang dibawa image penjaga ini. */
  expected: string;
  /** Target putaran terakhir, atau `null` bila belum ada putaran. */
  lastTarget: string | null;
  lastRunAt: string | null;
  /** Slug buku yang gagal di putaran terakhir — surel operator, bukan probe publik. */
  failedSlugs: string[];
}

/**
 * Berbunyi untuk buku yang TERTINGGAL — keadaan yang sejak `db:migrate:release`
 * tidak lagi menahan rilis, dan karena itu bisa bertahan tanpa ada yang
 * melihat: buku itu ditutup gerbang skema (pemiliknya melihat "buku sedang
 * diperbarui"), sementara 16 buku lain sehat dan `/api/health` tetap 200.
 *
 * `unknown` DIAM, dengan sengaja: ia berarti "belum ada putaran tercatat" —
 * keadaan setiap pemasangan sebelum rilis pertamanya dengan migration kendali
 * 0011 — dan rilis berikutnya pasti menulis baris pertamanya.
 */
export function decideMigrationsAlert(input: MigrationsWatchdogInput): WatchdogDecision {
  if (input.status === "ok" || input.status === "unknown") return DIAM;

  let pesan: string;
  switch (input.status) {
    case "pending":
      pesan =
        "MIGRATION BUKU UNTUK RILIS INI BELUM BERJALAN.\n\n" +
        `Image ini membawa ${input.expected}, putaran terakhir menargetkan ` +
        `${input.lastTarget ?? "(tidak ada)"}. Setiap buku yang belum di kepala DITUTUP\n` +
        "gerbang skema sampai putaran berikutnya.\n\n" +
        "Jalankan:  docker compose run --rm migrate bun run db:migrate:release";
      break;
    case "partial":
    case "error":
      pesan =
        `${input.failedSlugs.length} BUKU TERTINGGAL dari migration rilis ini` +
        (input.status === "error" ? " — TIDAK SATU PUN berhasil" : "") +
        ".\n\n" +
        "Buku itu DITUTUP (pemiliknya melihat \"buku sedang diperbarui\"); buku lain\n" +
        "dilayani seperti biasa. Perbaiki sebabnya (log di bawah), lalu ulangi — buku yang\n" +
        "sudah di kepala dilewati:\n\n" +
        "  docker compose run --rm migrate bun run db:migrate:release\n\n" +
        `Buku: ${input.failedSlugs.join(", ") || "(lihat schema_migration_runs.details)"}`;
      break;
  }

  return {
    alert: true,
    subject: `[SAI] migration buku: ${input.status}`,
    body: badan(pesan, [
      ["status", input.status],
      ["image membawa", input.expected],
      ["target putaran", input.lastTarget ?? "(belum pernah)"],
      ["putaran terakhir", input.lastRunAt ?? "(belum pernah)"],
    ]),
    fingerprint: `migrations:${input.status}:${input.expected}`,
  };
}

/* ══ OUTBOX TRANSAKSIONAL (09 §4) ═══════════════════════════════════════════ */

export interface OutboxWatchdogInput {
  status: OutboxHealthStatus;
  oldestAgeSeconds: number | null;
  unpublishedTotal: number;
  /** Slug buku yang jejaknya basi — surel operator, bukan probe publik. */
  staleSlugs: string[];
  erroredSlugs: string[];
}

/**
 * Berbunyi untuk peristiwa yang TERTAHAN di buku PT — faktur yang sudah
 * diposting tetapi pekerjaannya belum terbit. Itu persis keadaan yang outbox
 * ada untuk mencegah menjadi diam: posting berhasil, dan tidak ada apa pun
 * yang menyusul.
 *
 * `lagging` DIAM: umur di atas ambang peringatan tapi di bawah terlambat
 * adalah relay yang sedang mengejar (mis. sesudah kendali tersendat), dan
 * surel untuk keadaan yang menyembuhkan diri dalam menit adalah surel yang
 * mengajari orang mengabaikan alarm ini. `unknown` DIAM: belum ada jejak
 * relay — setiap pemasangan sebelum rilis pertamanya dengan peran `outbox`.
 */
export function decideOutboxAlert(input: OutboxWatchdogInput): WatchdogDecision {
  if (input.status !== "late") return DIAM;
  const basi = input.staleSlugs.length > 0;
  const pesan = basi
    ? "RELAY OUTBOX TIDAK MENYENTUH SEBAGIAN BUKU.\n\n" +
      "Jejak relay untuk buku di bawah lebih tua dari ambang basinya: relay mati\n" +
      "(peran `outbox` di svc-worker), atau buku itu tak terjangkau. Peristiwa yang\n" +
      "ditulis di buku itu — faktur yang diposting — TIDAK diteruskan ke antrean.\n\n" +
      "Periksa:  docker compose logs svc-worker --tail 200 | grep ' outbox *|'\n\n" +
      `Buku: ${input.staleSlugs.join(", ")}`
    : "PERISTIWA OUTBOX TERTAHAN.\n\n" +
      `Baris tertua yang belum terbit berumur ${input.oldestAgeSeconds ?? "?"} detik. Relay hidup,\n` +
      "tetapi penerbitannya ke `jobs` gagal (lihat `outbox.last_error` di buku yang\n" +
      "disebut, dan log peran `outbox`).\n\n" +
      `Buku dengan galat: ${input.erroredSlugs.join(", ") || "(tidak ada — periksa umur per buku di konsol /scheduler)"}`;
  return {
    alert: true,
    subject: `[SAI] outbox: ${basi ? "relay tidak berjalan" : "peristiwa tertahan"}`,
    body: badan(pesan, [
      ["status", input.status],
      ["umur tertua", input.oldestAgeSeconds === null ? "—" : `${input.oldestAgeSeconds} detik`],
      ["belum terbit", String(input.unpublishedTotal)],
    ]),
    fingerprint: `outbox:${basi ? "stale" : "lag"}`,
  };
}
