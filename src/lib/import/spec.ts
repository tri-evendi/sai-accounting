/**
 * INTI IMPOR BERSAMA — bentuk kolom & pemetaan judul (issue #381, tahap 1).
 *
 * ══ KENAPA DIGENERALISASI ═══════════════════════════════════════════════════
 * Impor daftar akun (`coa-import.ts`) sudah membuktikan bentuknya benar: inti
 * MURNI yang menerima matriks sel dan memulangkan baris tervalidasi atau galat
 * per-baris, sehingga seluruh aturannya bisa diuji tanpa MySQL maupun ExcelJS.
 *
 * F-2 menuntut LIMA jenis berkas lagi — pelanggan, pemasok, barang, stok awal,
 * piutang/utang terbuka, aset tetap. Menyalin bentuk itu enam kali berarti enam
 * tempat yang akan menyimpang: enam gaya pesan galat, enam perlakuan berbeda
 * terhadap baris kosong, enam ambang jumlah baris. Yang dibagikan di sini
 * hanyalah yang memang SAMA untuk semuanya; aturan per-jenis tetap tinggal di
 * modulnya sendiri, tempatnya.
 *
 * ══ SATU HAL YANG SEKALIGUS DIPERBAIKI: JUDUL, BUKAN POSISI ═════════════════
 * `parseCoaRows` membaca kolom menurut POSISI (`cells[0]`, `cells[1]`, …).
 * Itu benar selama berkasnya dibuat dari templat kita sendiri, dan salah pada
 * berkas pertama yang datang dari aplikasi lain — di mana kolomnya berurutan
 * lain, atau ada kolom tambahan di depan. Yang terjadi bukan penolakan
 * melainkan IMPOR YANG BERHASIL DENGAN NILAI TERTUKAR: nama akun masuk ke kode,
 * kode masuk ke nama, dan tidak ada satu pun galat.
 *
 * Modul ini memetakan menurut JUDUL, dengan alias, dan menolak berkas yang
 * kolom wajibnya tidak ditemukan — sebelum satu baris pun dibaca.
 *
 * MURNI: tanpa Prisma, tanpa ExcelJS, tanpa I/O.
 */

/** Batas baris data yang diproses. Accurate berhenti di 10.000; kita samakan. */
export const MAX_IMPORT_ROWS = 10_000;

/**
 * Nama mitra CONTOH — satu untuk seluruh templat impor (issue #426).
 *
 * ══ KENAPA SEBUAH KONSTANTA, BUKAN LITERAL DI TIAP BERKAS ═══════════════════
 * `template.ts` sudah menyatukan templat dan validator supaya "berkas yang
 * diunduh dari aplikasi ini ditolak oleh aplikasi ini" tidak bisa terjadi. Yang
 * belum dijaga adalah kecocokan ANTAR templat — dan dua templat yang memang
 * dipakai berpasangan sempat menyimpang: daftar pelanggan mencontohkan
 * "PT Contoh Sejahtera", sementara piutang awal mencontohkan "PT Maju Bersama".
 *
 * Pengguna baru yang berhati-hati melakukan persis yang disarankan — unduh
 * templat pelanggan, unggah; unduh templat piutang awal, unggah — dan mendapat
 * penolakan yang MENUDUHNYA salah menulis nama: "samakan penulisan namanya".
 * Yang tidak sinkron adalah dua contoh milik aplikasi ini sendiri.
 *
 * Dijaga `tests/import-template-examples.test.ts`.
 */
export const EXAMPLE_PARTNER_NAME = "PT Contoh Sejahtera";

export interface ColumnSpec {
  /** Kunci hasil — nama field di baris yang dipulangkan. */
  key: string;
  /** Judul yang DICETAK di templat. */
  header: string;
  /**
   * Judul lain yang ikut diterima. Dicocokkan setelah dinormalkan, jadi
   * "Kode Akun", "kode_akun", dan "KODE AKUN" cukup satu entri.
   */
  aliases?: readonly string[];
  /** Kolom yang KETIADAANNYA membatalkan seluruh berkas. */
  required?: boolean;
  /** Contoh isi, untuk baris contoh di templat. */
  example?: string;
  /** Satu kalimat penjelas, untuk lembar legenda templat. */
  hint?: string;
}

/**
 * Judul → bentuk banding: huruf kecil, tanpa spasi/garis bawah/tanda baca.
 *
 * Berkas yang datang dari aplikasi lain menulis judul yang sama dengan lima
 * gaya berbeda, dan menuntut kecocokan persis berarti menolak berkas yang
 * sebenarnya benar. Yang TIDAK dinormalkan adalah maknanya: "kode" dan "kode
 * barang" tetap dua judul berbeda.
 */
export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export interface HeaderMap {
  /** kunci kolom → indeks selnya di setiap baris. */
  index: Record<string, number>;
  /** Judul kolom WAJIB yang tidak ditemukan — berkas ditolak bila terisi. */
  missing: string[];
}

/**
 * Petakan baris judul ke indeks kolom.
 *
 * Kolom yang tidak dikenali DIABAIKAN, tidak dianggap galat: berkas ekspor dari
 * aplikasi lain hampir selalu membawa kolom tambahan, dan menolaknya berarti
 * memaksa orang menyunting berkas yang isinya sudah benar.
 *
 * Judul kembar diambil yang PERTAMA. Menebak yang mana yang dimaksud bukan
 * wewenang modul ini, dan yang pertama adalah satu-satunya pilihan yang bisa
 * dijelaskan kepada orang yang membuka berkasnya.
 */
export function mapHeaderRow(headerRow: unknown[], columns: readonly ColumnSpec[]): HeaderMap {
  const seen = new Map<string, number>();
  headerRow.forEach((cell, i) => {
    const key = normalizeHeader(cell);
    if (key && !seen.has(key)) seen.set(key, i);
  });

  const index: Record<string, number> = {};
  const missing: string[] = [];

  for (const column of columns) {
    const candidates = [column.header, ...(column.aliases ?? [])].map(normalizeHeader);
    const found = candidates.map((c) => seen.get(c)).find((i) => i !== undefined);
    if (found === undefined) {
      if (column.required) missing.push(column.header);
      continue;
    }
    index[column.key] = found;
  }

  return { index, missing };
}
