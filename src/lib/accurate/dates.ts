/**
 * Tanggal bergaya Accurate — inti murni (integrasi Accurate).
 *
 * Accurate mencetak tanggal di dalam KALIMAT, bukan di dalam sel bertipe
 * tanggal: "Dari 01 Jan 2025 s/d 31 Des 2025" di kepala laporan, "Saldo per
 * 31 Dec 2024" di baris pembuka. Keduanya perlu dibaca — periodenya menentukan
 * rentang yang dipakai saat mencocokkan dengan buku sendiri, dan mencocokkan
 * rentang yang berbeda menghasilkan selisih yang seluruhnya palsu.
 *
 * Bulannya ditulis DUA BAHASA di dalam satu berkas yang sama: berkas contoh
 * yang memicu modul ini memakai "Des" di kepala laporan dan "Dec" di baris
 * saldo awal. Karena itu keduanya diterima, dan itu bukan kelonggaran yang
 * dicari-cari — itu yang benar-benar ada di berkasnya.
 *
 * `@/lib/import/fields` sudah membaca `2026-01-31` dan `31/01/2026`; yang di
 * sini melengkapinya dengan bentuk bernama bulan, dan tidak menggantikannya.
 *
 * MURNI: tanpa Prisma, tanpa I/O.
 */

/**
 * Nama bulan → nomornya. Indonesia dan Inggris, penuh maupun singkat.
 * Ditulis huruf kecil; pencocokannya menormalkan masukan lebih dulu.
 */
const MONTHS: Record<string, number> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2, peb: 2, pebruari: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, ags: 8, agt: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oct: 10, oktober: 10, october: 10,
  nov: 11, november: 11, nop: 11, nopember: 11,
  des: 12, dec: 12, desember: 12, december: 12,
};

/** `31 Des 2025`, `31 December 2025`, `1 Jan 2025` → tanggal kalender UTC. */
const NAMED_DATE = /(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})/;

/**
 * Baca tanggal bernama bulan dari sepotong teks.
 *
 * UTC, bukan waktu lokal: tanggal dokumen adalah tanggal KALENDER, dan zona
 * waktu server tidak boleh menggesernya sehari — aturan yang sama dipegang
 * `parseImportDate`.
 */
export function parseAccurateDateText(raw: string): Date | null {
  const m = NAMED_DATE.exec(raw ?? "");
  if (!m) return null;

  const day = Number(m[1]);
  const month = MONTHS[m[2].toLowerCase()];
  const year = Number(m[3]);
  if (!month || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  // Menangkap 31 Februari: JS menggulungnya ke Maret alih-alih menolak.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

export interface AccuratePeriod {
  from: Date;
  to: Date;
}

/**
 * Rentang dari baris periode laporan ("Dari 01 Jan 2025 s/d 31 Des 2025").
 *
 * Dipakai untuk menanyakan rentang yang SAMA ke buku sendiri. Tanpa ini
 * rentangnya harus diketik ulang oleh orang yang mengunggah, dan salah ketik
 * satu bulan menghasilkan selisih yang tampak seperti pembukuan yang berbeda
 * padahal hanya pertanyaannya yang berbeda.
 */
export function parseAccuratePeriod(period: string | null): AccuratePeriod | null {
  if (!period) return null;

  const dates: Date[] = [];
  const pattern = new RegExp(NAMED_DATE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(period)) !== null) {
    const parsed = parseAccurateDateText(match[0]);
    if (parsed) dates.push(parsed);
  }

  if (dates.length === 0) return null;
  if (dates.length === 1) return { from: dates[0], to: dates[0] };
  return { from: dates[0], to: dates[dates.length - 1] };
}
