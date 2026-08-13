/**
 * "Rutinitas Bulanan" — daftar tugas akhir bulan (issue #355).
 *
 * ── Masalah yang diselesaikan ────────────────────────────────────────────────
 *
 * `first-steps.ts` menjawab satu pertanyaan, sekali seumur perusahaan: "saya
 * baru selesai menyiapkan, sekarang apa?" — lalu panelnya menghilang untuk
 * selamanya begitu transaksi pertama tercatat. Itu memang disengaja, dan benar.
 *
 * Tetapi pengguna awam akuntansi punya pertanyaan KEDUA yang jauh lebih
 * menakutkan, dan sampai audit produksi 13 Agustus 2026 tak satu pun layar
 * menjawabnya:
 *
 *   "Semua sudah saya catat. Tapi apakah pembukuan saya benar,
 *    dan tiap akhir bulan saya harus apa?"
 *
 * Akibatnya `/periods` — Tutup Buku — duduk di menu tanpa satu pun jalan yang
 * mengarah ke sana dan tanpa penjelasan kenapa sebuah bulan perlu dikunci.
 * Pemilik usaha yang tak pernah menutup periode punya buku yang diam-diam
 * bergeser: transaksi bulan lalu masih bisa berubah setelah laporannya dibaca,
 * dipakai, bahkan dilaporkan.
 *
 * ── Kenapa TIGA langkah, dan kenapa "lihat Laba/Rugi" bukan salah satunya ────
 *
 * Ketiga langkah di bawah bisa DIBUKTIKAN dari data: ada pengeluaran tercatat,
 * ada rekening koran terkunci, ada periode tertutup. "Sudah melihat Laba/Rugi"
 * tidak bisa — tak ada tabel yang tahu seseorang sudah membaca sebuah laporan.
 *
 * Menjadikannya baris keempat berarti membuat checklist yang MUSTAHIL tuntas:
 * penghitungnya berhenti selamanya di "3 dari 4", dan daftar yang tak pernah
 * bisa selesai mengajarkan pengguna untuk mengabaikannya. Karena itu
 * pemeriksaan laporan menyatu ke dalam langkah penutupan — di situ ia memang
 * berada secara urutan kerja: periksa dulu, baru kunci.
 *
 * MURNI (tanpa React/ikon/Prisma) seperti `nav.ts` / `first-steps.ts`: ikon
 * disebut sebagai NAMA string, penyaringan izinnya bisa diuji langsung, dan
 * penyusunannya terjadi di SERVER sehingga langkah yang tidak boleh dikerjakan
 * seseorang tidak pernah dikirim ke browsernya.
 *
 * TAMPILAN saja — tiap halaman tujuan tetap dijaga `requirePagePermission`.
 */

import { can, type Permission } from "@/lib/authz";
import type { AllowedPermissions } from "@/lib/nav";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

export type MonthlyStepKey = "pengeluaran" | "cocokkan_bank" | "tutup_bulan";

export interface MonthlyStep {
  key: MonthlyStepKey;
  /** Perintah bahasa tugas (bahasa SUMBER). Panelnya menggambar `labelKey`. */
  label: string;
  /** Satu baris: kenapa langkah ini, dalam bahasa sehari-hari (bahasa sumber). */
  description: string;
  labelKey: DictionaryKey;
  descriptionKey: DictionaryKey;
  href: string;
  /** Nama ikon (kunci peta `ICONS` di panelnya). */
  icon: string;
  /** Izin halaman tujuan — sama dengan `requirePagePermission` di sana. */
  permission: Permission;
}

/**
 * Urutannya adalah urutan kerja akuntansi, bukan selera: catat semuanya dulu,
 * cocokkan dengan bukti dari luar (rekening koran), baru kunci. Menutup bulan
 * sebelum pengeluarannya lengkap berarti mengunci angka yang salah.
 */
export const MONTHLY_ROUTINE: MonthlyStep[] = [
  {
    key: "pengeluaran",
    label: "Catat Pengeluaran Bulan Lalu",
    description: "Semua uang yang keluar — sewa, gaji, listrik, belanja. Yang belum dicatat tidak muncul di laporan.",
    labelKey: "monthlyRoutine.items.pengeluaran.label",
    descriptionKey: "monthlyRoutine.items.pengeluaran.description",
    href: "/finance/new?arah=keluar",
    icon: "ArrowUpRight",
    permission: "cash.write",
  },
  {
    key: "cocokkan_bank",
    label: "Cocokkan Rekening Koran",
    description: "Samakan catatan Anda dengan mutasi dari bank. Selisihnya biasanya transaksi yang terlewat.",
    labelKey: "monthlyRoutine.items.cocokkan_bank.label",
    descriptionKey: "monthlyRoutine.items.cocokkan_bank.description",
    href: "/reconciliation",
    icon: "Landmark",
    permission: "reconciliation.read",
  },
  {
    key: "tutup_bulan",
    label: "Periksa Laporan, lalu Tutup Buku",
    description: "Lihat Laba/Rugi dan Neraca bulan lalu. Kalau sudah sesuai, kunci bulannya supaya angkanya tidak berubah lagi.",
    labelKey: "monthlyRoutine.items.tutup_bulan.label",
    descriptionKey: "monthlyRoutine.items.tutup_bulan.description",
    href: "/periods",
    icon: "Lock",
    permission: "period.manage",
  },
];

/** Sudah-atau-belum tiap langkah, dihitung dari data perusahaan. */
export type MonthlyRoutineProgress = Partial<Record<MonthlyStepKey, boolean>>;

/**
 * Langkah yang boleh dikerjakan pengguna ini, urut seperti daftar di atas.
 *
 * `allowed` adalah set izin EFEKTIF (bawaan + override DB + modul usaha yang
 * aktif), jadi satu penyaringan menutup ketiganya sekaligus — perusahaan yang
 * mematikan modul Kas & Bank tidak pernah diminta mencocokkan rekening koran.
 */
export function visibleMonthlySteps(
  role: string | null | undefined,
  allowed?: AllowedPermissions
): MonthlyStep[] {
  if (!role) return [];
  return MONTHLY_ROUTINE.filter((step) =>
    allowed ? allowed.has(step.permission) : can({ role }, step.permission)
  );
}

/**
 * Bulan yang sedang dipertanggungjawabkan — yaitu bulan LALU.
 *
 * Rutinitas ini selalu tentang bulan yang sudah lewat, bukan bulan berjalan:
 * bulan berjalan belum selesai, jadi menutupnya tidak masuk akal. Januari
 * mundur ke Desember tahun sebelumnya; `Date` menangani pembalikan tahunnya,
 * dan `tests/monthly-routine.test.ts` memakukannya.
 *
 * Bulannya 1–12 (seperti kolom `periods.month`), BUKAN 0–11 milik `Date`.
 */
export function previousMonth(today: Date): { year: number; month: number } {
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-11; bulan lalu = indeks bulan ini − 1
  if (month === 0) return { year: year - 1, month: 12 };
  return { year, month };
}

/**
 * Batas awal & akhir sebuah bulan (1–12), untuk penyaringan tanggal.
 *
 * Namanya sengaja BUKAN `monthRange`: `lib/dashboard-summary.ts` sudah
 * mengekspor nama itu dengan tanda tangan yang berbeda sama sekali
 * (`monthRange(now: Date)` → `{from, to, fromISO, toISO}`), dan beranda
 * mengimpor keduanya. Dua fungsi senama berbeda arti di satu berkas adalah
 * jebakan yang hanya ketahuan lewat galat tipe yang membingungkan.
 */
export function monthBounds(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(year, month - 1, 1, 0, 0, 0, 0),
    /* Milidetik terakhir bulan itu: hari ke-0 bulan BERIKUTNYA = hari terakhir
       bulan ini, jadi tak perlu tahu panjang bulan maupun tahun kabisat. */
    end: new Date(year, month, 0, 23, 59, 59, 999),
  };
}

/**
 * Nama bulan + tahun dalam bahasa pembacanya ("Juli 2026", "July 2026",
 * "2026年7月").
 *
 * Sengaja MEMAKAI locale, tidak seperti `dashboard-summary.ts` yang memaku
 * "id-ID": label ini muncul di judul panel dan di kalimat subjudulnya, dan
 * kalimat di sekitarnya sudah berbahasa pembaca. Satu kata Indonesia di tengah
 * kalimat Mandarin adalah cacat yang persis sama dengan kolom berbahasa mati di
 * dialog laporan (#316).
 *
 * `LOCALES` ("id" | "en" | "zh") semuanya tag BCP-47 yang sah, jadi tidak perlu
 * peta "id" → "id-ID"; `Intl` menerimanya apa adanya.
 */
export function formatMonthYear(year: number, month: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1)
  );
}

/**
 * Apakah panel Rutinitas Bulanan masih perlu ditampilkan.
 *
 * Ambangnya HANYA "bulan lalu belum ditutup". Dua langkah pertama sengaja tidak
 * ikut menentukan: sebuah perusahaan boleh saja tidak punya pengeluaran atau
 * tidak punya rekening bank pada suatu bulan, dan menuntut keduanya tercentang
 * akan menahan panel itu di beranda selamanya — persis kebisingan yang membuat
 * orang berhenti membacanya.
 *
 * Begitu bulannya terkunci, beranda kembali menjadi beranda sampai bulan
 * berikutnya lewat.
 */
export function isRoutineDue(progress: MonthlyRoutineProgress): boolean {
  return progress.tutup_bulan !== true;
}
