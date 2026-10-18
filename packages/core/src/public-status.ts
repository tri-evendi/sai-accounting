/**
 * STATUS PUBLIK (issue #374) — apa yang boleh dilihat orang yang belum masuk.
 *
 * ══ KENAPA INI SEBUAH LAPISAN, BUKAN `/api/health` YANG DIRENDER ═══════════
 * `/api/health` menjawab pertanyaan MESIN: Traefik memutuskan rotasi, dan
 * pemantauan memutuskan kapan membangunkan orang. Halaman ini menjawab
 * pertanyaan ORANG yang pekerjaannya berhenti: "apakah ini saya, atau kalian?"
 *
 * Kedua pembaca menuntut kedalaman yang berbeda, dan jaraknya bukan selera.
 * Sebuah probe kesiapan menyebut nama subsistem, umur denyut, dan sebab
 * kegagalan — semuanya berguna bagi yang bertugas, dan semuanya adalah peta
 * bagi yang tidak. Karena itu berkas ini MEMPERSEMPIT, dan pekerjaannya
 * seluruhnya itu: dari laporan lengkap menjadi tiga keadaan yang tidak
 * menyebutkan satu pun nama basis data, satu pun angka, dan satu pun kalimat
 * galat.
 *
 * ══ MURNI, SUPAYA REDAKSINYA BISA DIBUKTIKAN ═══════════════════════════════
 * Tanpa Prisma, tanpa React, tanpa `server-only`. Sebuah kebocoran di sini
 * tidak akan pernah terlihat sebagai halaman yang rusak — ia halaman yang
 * bekerja sempurna sambil menerbitkan sesuatu yang tidak seharusnya. Satu-
 * satunya cara menangkap yang seperti itu sebelum ia tayang adalah membuatnya
 * bisa diuji sebagai fungsi, dan itulah bentuk berkas ini.
 *
 * ══ CADANGAN SENGAJA TIDAK ADA DI SINI, DAN ITU BUKAN KELALAIAN ════════════
 * Denyut cadangan (#374 · F-4) ada di laporan masuknya dan sengaja TIDAK
 * diteruskan. Cadangan bukan layanan yang dipakai pembaca halaman ini; ia
 * postur pemulihan operator. "Cadangan gagal" yang diterbitkan ke internet
 * anonim tidak memberi pelanggan satu pun keputusan yang bisa ia ambil, dan
 * memberi orang lain satu yang bisa.
 *
 * Yang bertugas membacanya di `/api/health` dan di tabel `backup_runs` —
 * permukaan yang memang untuk itu.
 */

/**
 * Keadaan satu komponen, dari sudut pandang orang yang memakainya.
 *
 * `unknown` berdiri sendiri dan tidak dilebur ke `degraded`: keduanya menuntut
 * kalimat yang berbeda kepada pembaca. "Terganggu" adalah kabar tentang
 * layanan; "tidak diketahui" adalah kabar tentang pengukurannya — dan
 * menyamakan keduanya berarti setiap pemasangan yang belum punya riwayat
 * tampil sakit sejak menit pertama.
 */
export type ComponentState = "operational" | "degraded" | "down" | "unknown";

/** Komponen yang benar-benar dipakai pembaca — bukan peta subsistem. */
export type ComponentId =
  /** Pembukuan itu sendiri: masuk, membuka buku, mencatat transaksi. */
  | "application"
  /** Langganan & tagihan: uji coba, penerbitan tagihan, perpindahan paket. */
  | "billing"
  /** Surel keluar: verifikasi, undangan, pengingat jatuh tempo. */
  | "email";

export interface PublicComponent {
  id: ComponentId;
  state: ComponentState;
}

export interface PublicStatus {
  /** Yang TERBURUK di antara komponennya — lihat `ORDER`. */
  overall: ComponentState;
  components: PublicComponent[];
}

/**
 * Bentuk laporan masuk yang benar-benar dibaca berkas ini.
 *
 * Sengaja struktural, bukan `import type { HealthReport }`: `health-report.ts`
 * memanggil `server-only`, dan menariknya ke sini akan membuat modul murni ini
 * mustahil diuji tanpa Next. Bidang yang TIDAK disebut di sini (cadangan, umur
 * denyut, kalimat galat) karena itu bukan sekadar tak dipakai — ia tak pernah
 * masuk ke dalam jangkauan berkas ini sama sekali.
 */
export type StatusInput =
  | { status: "error" }
  | {
      status: "ok";
      platform: { status: "ok" | "unknown" };
      company: { status: "ok" | "unknown" | "error" };
      scheduler: { status: "ok" | "late" | "unknown" };
      mail: { status: "ok" | "capturing_to_file" | "not_configured" | "unknown" };
    };

/**
 * Urutan keparahan. `unknown` di BAWAH `degraded`: ketidaktahuan tidak boleh
 * berteriak lebih keras daripada kerusakan yang benar-benar terukur, sebab
 * halaman yang berteriak untuk hal yang belum tentu apa-apa adalah halaman
 * yang berhenti dipercaya pada kejadian ketiga.
 */
const ORDER: Record<ComponentState, number> = {
  operational: 0,
  unknown: 1,
  degraded: 2,
  down: 3,
};

function worst(states: ComponentState[]): ComponentState {
  return states.reduce((a, b) => (ORDER[b] > ORDER[a] ? b : a), "operational" as ComponentState);
}

/**
 * Ringkas laporan kesiapan menjadi keadaan yang boleh dibaca siapa pun.
 *
 * ── Kenapa pemetaannya tidak satu-lawan-satu ──────────────────────────────
 * Satu komponen di sini bisa lahir dari dua bidang di sana, dan itu memang
 * maksudnya: pembaca halaman ini tidak punya model mental "basis data kendali"
 * dan "buku PT" sebagai dua benda. Yang ia tahu adalah "aplikasinya jalan atau
 * tidak", dan jawaban yang benar untuk itu memang gabungan keduanya.
 */
export function publicStatus(report: StatusInput): PublicStatus {
  /*
   * Kendali tak terjangkau: tidak ada satu pun halaman yang berguna. Ini
   * satu-satunya cabang yang menyebut `down`, dan satu-satunya yang tidak
   * mengintip bidang lain — ketika kendali mati, tidak ada bidang lain yang
   * jawabannya masih berarti.
   */
  if (report.status === "error") {
    return {
      overall: "down",
      components: [
        { id: "application", state: "down" },
        { id: "billing", state: "unknown" },
        { id: "email", state: "unknown" },
      ],
    };
  }

  /*
   * APLIKASI. Kendali sudah terbukti terjangkau di sini, jadi yang tersisa
   * adalah apakah bukunya bisa DIBUKA.
   *
   * `company: "unknown"` berarti belum ada satu PT pun — pemasangan yang baru
   * lahir, bukan kerusakan. `error` berarti kendali menyebut sebuah buku ADA
   * dan buku itu tidak terjangkau: nyata, tetapi `degraded`, bukan `down` —
   * yang terukur satu buku, dan menyatakan seluruh layanan mati atas dasar itu
   * adalah kabar yang lebih salah daripada diam.
   */
  const application: ComponentState = report.company.status === "error" ? "degraded" : "operational";

  /*
   * PENAGIHAN. Dua bidang, satu kalimat: basis data platform dan penjadwal yang
   * menjalankan siklus hidup langganan. Penjadwal yang `late` adalah gangguan
   * yang NYATA meski tak ada satu halaman pun yang rusak — uji coba tidak
   * berakhir dan tagihan tidak terbit — dan itu persis kegagalan senyap yang
   * #373 dibuat untuk membuatnya bisa ditanyakan.
   */
  const billing = worst([
    report.platform.status === "ok" ? "operational" : "unknown",
    report.scheduler.status === "ok"
      ? "operational"
      : report.scheduler.status === "late"
        ? "degraded"
        : "unknown",
  ]);

  /*
   * SUREL. `capturing_to_file` dan `not_configured` sama-sama berarti tidak ada
   * surel yang benar-benar berangkat — pendaftar menunggu verifikasi yang tak
   * pernah datang. Keduanya `degraded` dan tidak dibedakan di sini: bedanya
   * adalah SEBAB, dan sebab adalah bagian yang justru tidak boleh terbit.
   */
  const email: ComponentState =
    report.mail.status === "ok"
      ? "operational"
      : report.mail.status === "unknown"
        ? "unknown"
        : "degraded";

  const components: PublicComponent[] = [
    { id: "application", state: application },
    { id: "billing", state: billing },
    { id: "email", state: email },
  ];

  return { overall: worst(components.map((c) => c.state)), components };
}

/** Keadaan jendela pemeliharaan yang diumumkan. */
export type MaintenanceState = "none" | "upcoming" | "active";

export interface MaintenanceWindow {
  state: MaintenanceState;
  from: Date;
  until: Date;
}

/**
 * JENDELA PEMELIHARAAN YANG DIUMUMKAN (#374).
 *
 * ══ DUA TANGGAL, TANPA SATU PUN KALIMAT BEBAS ══════════════════════════════
 * Yang disetel operator hanyalah AWAL dan AKHIR. Tidak ada medan teks, dan itu
 * keputusan: aplikasi ini berbicara tiga bahasa, dan satu kalimat yang diketik
 * ke dalam variabel lingkungan hanya benar di bahasa yang mengetiknya —
 * pembaca dua bahasa lainnya mendapat halaman yang setengahnya asing. Kalimat
 * pemeliharaan karena itu dirakit dari kunci kamus berparameter, dan yang
 * datang dari luar hanya angkanya.
 *
 * ══ NILAI SAMPAH = TIDAK ADA PENGUMUMAN ════════════════════════════════════
 * Tanggal yang tak terbaca, atau akhir yang mendahului awal, memulangkan
 * `null`. Sebuah halaman status yang menyiarkan "Invalid Date" merusak
 * satu-satunya hal yang ia jual, yaitu kepercayaan bahwa isinya benar.
 */
export function maintenanceWindow(
  now: Date,
  fromRaw: string | undefined,
  untilRaw: string | undefined
): MaintenanceWindow | null {
  if (!fromRaw?.trim() || !untilRaw?.trim()) return null;

  const from = new Date(fromRaw.trim());
  const until = new Date(untilRaw.trim());
  if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime())) return null;
  if (until.getTime() <= from.getTime()) return null;

  /* Jendela yang SUDAH LEWAT menghilang dengan sendirinya. Tanpa ini, sebuah
     pengumuman yang lupa dicabut tetap terpajang berminggu-minggu — dan
     halaman status yang menampilkan pemeliharaan yang sudah selesai adalah
     halaman yang mengajari pembacanya untuk tidak mempercayainya. */
  if (now.getTime() >= until.getTime()) return null;

  return {
    state: now.getTime() >= from.getTime() ? "active" : "upcoming",
    from,
    until,
  };
}
