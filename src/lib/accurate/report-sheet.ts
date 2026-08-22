/**
 * Pembaca EKSPOR LAPORAN Accurate — inti murni (integrasi Accurate, tahap 1).
 *
 * ══ MASALAHNYA: YANG DIEKSPOR ACCURATE ADALAH HALAMAN CETAK ════════════════
 * Impor di aplikasi ini menganggap sebuah `.xlsx` adalah TABEL: baris 1 judul
 * kolom, baris berikutnya data (lihat `@/lib/import/rows`). Anggapan itu benar
 * untuk templat kita sendiri, dan salah untuk setiap berkas yang keluar dari
 * tombol "Ekspor" Accurate — sebab yang diekspor Accurate bukan tabel,
 * melainkan LAPORAN CETAK yang kebetulan berformat Excel.
 *
 * Berkas contoh yang memicu modul ini (Rincian Buku Besar, 5 halaman) berisi:
 *
 *   baris 1–4    nama PT · judul laporan · periode · filter   (merge B..S)
 *   baris 5      judul kolom                                   ← baris judul
 *   baris 6–7    kepala seksi akun: "5100006004", lalu
 *                "5100006004 - BIAYA ASURANSI  EKSPORT"        (merge)
 *   baris 8…     data
 *   baris 22–26  kosong · "ACCURATE Accounting System Report" ·
 *                "Tercetak pada …" · "Halaman 1 dari 5"
 *   baris 27–30  SELURUH blok kepala halaman DIULANG
 *   baris 31     JUDUL KOLOM DIULANG
 *   …            dan seterusnya, lima kali
 *
 * Diberikan apa adanya ke `readImportRows`, berkas itu ditolak seluruhnya:
 * kolom wajibnya "tidak ditemukan", karena yang dibaca sebagai baris judul
 * adalah nama PT. Penolakan itu benar — tetapi artinya tidak ada satu pun
 * jalur di aplikasi ini yang bisa membaca ekspor Accurate.
 *
 * ══ YANG DIKERJAKAN MODUL INI ══════════════════════════════════════════════
 * Menormalkan halaman cetak kembali menjadi tabel: menemukan baris judul,
 * membuang blok kepala/kaki halaman yang berulang, memisahkan kepala seksi
 * dari data, dan MENYAMBUNG sel yang terpotong ganti halaman (lihat di bawah).
 * Hasilnya bisa dipakai dua arah — sebagai laporan berseksi (`readAccurateReport`,
 * dipakai parser buku besar) atau diratakan jadi matriks tabel biasa
 * (`flattenAccurateReport`), sehingga SELURUH importer yang sudah ada bisa
 * menerima ekspor Accurate tanpa mempelajari bentuk halaman cetak.
 *
 * ══ SEL YANG TERPOTONG GANTI HALAMAN — BAHAYA YANG PALING SENYAP ═══════════
 * Kolom "Keterangan" Accurate berisi dua baris dalam SATU sel: nomor dokumen,
 * lalu nomor referensi ("2504/MTL-EXP/I/2025\nSAI 00100"). Ketika baris itu
 * jatuh persis di ganti halaman, Accurate memotong selnya: baris terakhir
 * halaman menyimpan "…/2025\n" TANPA referensinya, dan referensi yatimnya
 * muncul sebagai BARIS TERSENDIRI di puncak halaman berikutnya, satu sel saja.
 *
 * Di berkas contoh itu terjadi dua kali (baris 69→80, 92→103). Pembaca naif
 * menghasilkan dua kerusakan sekaligus: dua transaksi kehilangan referensinya,
 * dan dua BARIS HANTU tanpa tanggal maupun nominal masuk ke datanya. Keduanya
 * lolos tanpa satu galat pun — persis bentuk kegagalan yang paling mahal untuk
 * berkas akuntansi.
 *
 * Modul ini menyambungnya kembali, dan TIDAK melakukannya diam-diam: setiap
 * sambungan tercatat di `repairs` agar bisa ditampilkan ke orang yang
 * mengunggah. Sambungan hanya dilakukan bila baris sebelumnya memang
 * menggantung (berakhir dengan pergantian baris) DI KOLOM YANG SAMA. Bila
 * tidak, potongannya dilaporkan sebagai temuan, bukan ditebak — menebak di
 * sini berarti menempelkan referensi milik transaksi lain.
 *
 * MURNI: tanpa Prisma, tanpa ExcelJS, tanpa I/O.
 */

/** Penanda kaki halaman Accurate — sekaligus sidik jari berkasnya. */
const ACCURATE_MARKER = /ACCURATE\s+Accounting\s+System\s+Report/i;
const PRINTED_AT = /^Tercetak\s+pada\s+(.+)$/i;
const PAGE_MARKER = /^Halaman\s+\d+/i;
const PAGE_OF = /dari\s+(\d+)\s*$/i;
const PERIOD_MARKER = /^(Dari|Per|Untuk|Periode)\s+.+/i;
const FILTER_MARKER = /^Filter\s+berdasarkan\s*:/i;

export interface AccurateReportMeta {
  /** Nama perusahaan di puncak laporan. */
  company: string | null;
  /** Judul laporan ("Rincian Buku Besar", "Daftar Akun Perkiraan", …). */
  title: string | null;
  /** Baris periode apa adanya ("Dari 01 Jan 2025 s/d 31 Des 2025"). */
  period: string | null;
  /** Baris filter apa adanya ("Filter berdasarkan : Kode Perkiraan"). */
  filter: string | null;
  /** Waktu cetak apa adanya ("21 August 2026 - 09:03"). */
  printedAt: string | null;
  /** Jumlah halaman menurut kaki halamannya. */
  pageCount: number | null;
}

export type AccurateRowKind = "section" | "data";

export interface AccurateReportRow {
  /** Nomor baris SEPERTI DI EXCEL (1-based) — nomor yang dilihat orang. */
  row: number;
  kind: AccurateRowKind;
  /** Sel mentah baris ini; indeks 0 = kolom A. */
  cells: unknown[];
  /** Untuk `section`: teks kepala seksinya. Untuk `data`: string kosong. */
  text: string;
}

export type AccurateRepairKind =
  /** Sel terpotong ganti halaman, disambung kembali ke barisnya. */
  | "joined_wrapped_cell"
  /** Potongan yatim yang TIDAK bisa dipastikan pemiliknya — dibiarkan, dilaporkan. */
  | "stray_fragment";

export interface AccurateRepair {
  kind: AccurateRepairKind;
  /** Baris potongannya di Excel. */
  row: number;
  /** Baris yang menerima sambungan (hanya untuk `joined_wrapped_cell`). */
  joinedInto?: number;
  /** Teks potongannya, supaya bisa ditunjukkan apa adanya. */
  text: string;
}

export interface AccurateReport {
  meta: AccurateReportMeta;
  /** Nomor baris judul kolom di Excel. */
  headerRow: number;
  /**
   * Judul kolom pada posisi kolom ASLINYA (indeks 0 = kolom A); kolom tanpa
   * judul berisi string kosong. Sengaja tidak dirapatkan: parser per-laporan
   * membaca sel data dengan indeks yang sama.
   */
  header: unknown[];
  /** Indeks kolom yang benar-benar berjudul, terurut kiri→kanan. */
  columnIndexes: number[];
  rows: AccurateReportRow[];
  repairs: AccurateRepair[];
}

const text = (cell: unknown): string => (cell == null ? "" : String(cell).trim());

/** Indeks sel yang ada isinya. */
function filledIndexes(cells: unknown[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < cells.length; i += 1) if (text(cells[i]) !== "") out.push(i);
  return out;
}

/**
 * Baris SPANDUK — satu nilai yang sama diulang di beberapa sel.
 *
 * Bentuk ini muncul karena ExcelJS menyalin nilai sel induk ke seluruh sel
 * anggota sebuah merge. Jadi "satu baris yang seluruh isinya sama" persis
 * berarti "satu sel yang dimerge melintasi baris" — dan di laporan Accurate
 * itulah bentuk nama PT, judul, periode, filter, kepala seksi, dan kakinya.
 */
function bannerText(cells: unknown[]): string | null {
  const filled = filledIndexes(cells);
  if (filled.length < 2) return null;
  const first = text(cells[filled[0]]);
  return filled.every((i) => text(cells[i]) === first) ? first : null;
}

/** Kaki halaman: penanda ACCURATE, waktu cetak, atau "Halaman n dari m". */
function isFooter(cells: unknown[]): boolean {
  return filledIndexes(cells).some((i) => {
    const value = text(cells[i]);
    return ACCURATE_MARKER.test(value) || PRINTED_AT.test(value) || PAGE_MARKER.test(value);
  });
}

/**
 * `true` bila sheet ini ekspor laporan Accurate.
 *
 * Diperiksa lewat penanda kakinya, bukan lewat judul laporan: judulnya berbeda
 * untuk tiap laporan (ada ratusan di Accurate), sedangkan kakinya sama di
 * semuanya. Berkas yang BUKAN laporan Accurate karena itu tidak pernah salah
 * dikenali, dan importer bisa memakainya untuk memilih jalur baca.
 */
export function isAccurateReport(sheet: unknown[][]): boolean {
  return sheet.some((row) => (Array.isArray(row) ? row : []).some((c) => ACCURATE_MARKER.test(text(c))));
}

/**
 * Baris JUDUL KOLOM — baris pertama yang bukan spanduk, bukan kaki, dan yang
 * seluruh selnya berisi TEKS.
 *
 * Syarat "seluruhnya teks" yang membedakannya dari baris data: baris data
 * laporan mana pun membawa tanggal atau nominal, dan sebuah judul kolom tidak
 * pernah berupa angka. Tanpa syarat itu, laporan yang kebetulan tidak berjudul
 * kolom akan memakan baris data pertamanya sebagai judul — dan itu bukan
 * penolakan melainkan impor yang berhasil dengan satu baris hilang.
 */
function findHeaderRow(sheet: unknown[][]): number {
  for (let i = 0; i < sheet.length; i += 1) {
    const cells = Array.isArray(sheet[i]) ? sheet[i] : [];
    const filled = filledIndexes(cells);
    if (filled.length < 2) continue;
    if (isFooter(cells)) continue;
    if (bannerText(cells) !== null) continue;
    if (filled.some((j) => typeof cells[j] === "number")) continue;
    return i;
  }
  return -1;
}

/** Sidik jari baris judul, untuk mengenali pengulangannya di halaman berikutnya. */
function signature(cells: unknown[]): string {
  return filledIndexes(cells)
    .map((i) => `${i}:${text(cells[i]).toLowerCase()}`)
    .join("|");
}

/**
 * Baca sheet laporan cetak Accurate menjadi baris berjenis.
 *
 * Mengembalikan `null` bila sheet ini bukan laporan Accurate atau tidak punya
 * baris judul yang bisa dikenali — pemanggil lalu memperlakukannya sebagai
 * berkas tabel biasa, sebagaimana sebelum modul ini ada.
 */
export function readAccurateReport(sheet: unknown[][]): AccurateReport | null {
  if (!isAccurateReport(sheet)) return null;

  const headerRow = findHeaderRow(sheet);
  if (headerRow < 0) return null;

  const header = Array.isArray(sheet[headerRow]) ? sheet[headerRow] : [];
  const headerSignature = signature(header);

  /* Judul kolom yang dimerge datang berulang di tiap sel anggotanya; yang
     dipakai adalah sel PERTAMA setiap deret — sel itulah induk merge-nya, dan
     karena kisi kolom laporan tetap, sel data barisnya berdiri di indeks yang
     sama. Deret dihitung dari sel BERSEBELAHAN saja: dua kolom berbeda yang
     kebetulan berjudul sama (di laporan lain) tidak boleh saling menelan. */
  const columnIndexes: number[] = [];
  let runIndex = -2;
  let runText = "";
  for (const i of filledIndexes(header)) {
    const value = text(header[i]);
    if (i === runIndex + 1 && value === runText) {
      runIndex = i; // masih deret merge yang sama
      continue;
    }
    columnIndexes.push(i);
    runIndex = i;
    runText = value;
  }

  const meta = readMeta(sheet, headerRow);
  const rows: AccurateReportRow[] = [];

  for (let i = 0; i < sheet.length; i += 1) {
    if (i === headerRow) continue;
    const cells = Array.isArray(sheet[i]) ? sheet[i] : [];
    if (filledIndexes(cells).length === 0) continue;
    if (isFooter(cells)) continue;
    if (signature(cells) === headerSignature) continue; // judul kolom yang diulang

    const banner = bannerText(cells);
    if (banner !== null) {
      /* Spanduk DI ATAS baris judul adalah kepala halaman (nama PT, judul,
         periode, filter) — sudah terbaca sebagai metadata, jadi dibuang. Yang
         di BAWAHnya adalah kepala seksi (kode & nama akun), dan itu data. */
      if (i < headerRow) continue;
      if (isPageHeading(banner, meta)) continue;
      rows.push({ row: i + 1, kind: "section", cells: cells.slice(), text: banner });
      continue;
    }

    rows.push({ row: i + 1, kind: "data", cells: cells.slice(), text: "" });
  }

  const repairs = joinWrappedCells(rows);
  return { meta, headerRow: headerRow + 1, header, columnIndexes, rows, repairs };
}

/**
 * Spanduk yang isinya sama dengan salah satu baris kepala halaman.
 *
 * Kepala halaman diulang di SETIAP halaman, jadi mengenalinya hanya dari
 * "berada di atas baris judul" cukup untuk halaman pertama saja — mulai
 * halaman kedua, blok yang sama berdiri di bawah baris judul halaman pertama.
 */
function isPageHeading(banner: string, meta: AccurateReportMeta): boolean {
  return (
    banner === meta.company ||
    banner === meta.title ||
    banner === meta.period ||
    banner === meta.filter ||
    PERIOD_MARKER.test(banner) ||
    FILTER_MARKER.test(banner)
  );
}

/** Metadata dari blok kepala halaman PERTAMA (baris di atas baris judul). */
function readMeta(sheet: unknown[][], headerRow: number): AccurateReportMeta {
  const banners: string[] = [];
  for (let i = 0; i < headerRow; i += 1) {
    const banner = bannerText(Array.isArray(sheet[i]) ? sheet[i] : []);
    if (banner) banners.push(banner);
  }

  const period = banners.find((b) => PERIOD_MARKER.test(b)) ?? null;
  const filter = banners.find((b) => FILTER_MARKER.test(b)) ?? null;
  const plain = banners.filter((b) => b !== period && b !== filter);

  let printedAt: string | null = null;
  let pageCount: number | null = null;
  for (const row of sheet) {
    for (const cell of Array.isArray(row) ? row : []) {
      const value = text(cell);
      const printed = PRINTED_AT.exec(value);
      if (printed && !printedAt) printedAt = printed[1].trim();
      const of = PAGE_OF.exec(value);
      if (of && pageCount === null) pageCount = Number(of[1]);
    }
  }

  return {
    company: plain[0] ?? null,
    title: plain[1] ?? null,
    period,
    filter,
    printedAt,
    pageCount,
  };
}

/**
 * Sambung potongan sel yang terjatuh ke halaman berikutnya.
 *
 * Potongan dikenali dari bentuknya: baris data dengan TEPAT SATU sel terisi.
 * Ia disambung hanya bila baris data sebelumnya menggantung di KOLOM YANG SAMA
 * — yaitu isinya berakhir dengan pergantian baris, tanda Accurate memotong sel
 * dua barisnya di tengah. Di luar itu potongannya dibiarkan di tempatnya dan
 * dilaporkan; menempelkan referensi ke transaksi yang salah jauh lebih buruk
 * daripada menyerahkan satu baris aneh kepada orang yang bisa melihat berkasnya.
 */
function joinWrappedCells(rows: AccurateReportRow[]): AccurateRepair[] {
  const repairs: AccurateRepair[] = [];

  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.kind !== "data") continue;

    const filled = filledIndexes(row.cells);
    if (filled.length !== 1) continue;

    const column = filled[0];
    const fragment = text(row.cells[column]);

    // Baris data terdekat SEBELUM potongan ini.
    let previous: AccurateReportRow | null = null;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (rows[j].kind === "data") {
        previous = rows[j];
        break;
      }
    }

    const dangling = previous ? String(previous.cells[column] ?? "") : "";
    if (previous && dangling !== "" && /\n\s*$/.test(dangling)) {
      previous.cells[column] = dangling.replace(/\s+$/, "") + "\n" + fragment;
      repairs.push({
        kind: "joined_wrapped_cell",
        row: row.row,
        joinedInto: previous.row,
        text: fragment,
      });
      rows.splice(i, 1);
      continue;
    }

    repairs.push({ kind: "stray_fragment", row: row.row, text: fragment });
  }

  repairs.reverse();
  return repairs;
}

export interface FlattenedReport {
  /** Matriks bergaya tabel: indeks 0 = baris judul, sisanya baris data. */
  rows: unknown[][];
  /**
   * Nomor baris ASLI di Excel untuk tiap baris data (sejajar `rows.slice(1)`).
   *
   * Ada supaya galat tetap menyebut baris yang DILIHAT orang di berkasnya.
   * Tanpa ini, meratakan lima halaman jadi satu tabel menggeser setiap nomor
   * baris — dan galat "baris 12" yang menunjuk baris 41 membuat orang
   * memperbaiki baris yang salah lalu mengunggah ulang berkas yang sama.
   */
  rowNumbers: number[];
  meta: AccurateReportMeta;
  repairs: AccurateRepair[];
}

/**
 * Ratakan laporan cetak Accurate menjadi matriks tabel biasa.
 *
 * Inilah jembatan yang membuat SELURUH importer yang sudah ada
 * (`parseCoaRows`, master, aset tetap, piutang/utang awal) bisa menerima
 * ekspor Accurate tanpa satu pun dari mereka mempelajari bentuk halaman cetak:
 * route-nya cukup meratakan berkas lebih dulu bila `isAccurateReport()`.
 *
 * Kepala seksi DIBUANG di sini, dan itu disengaja: sebuah tabel tidak punya
 * tempat untuk baris yang bukan baris. Laporan yang MAKNANYA ada di kepala
 * seksinya (buku besar) dibaca lewat `readAccurateReport`, bukan lewat sini.
 */
export function flattenAccurateReport(sheet: unknown[][]): FlattenedReport | null {
  const report = readAccurateReport(sheet);
  if (!report) return null;

  const pick = (cells: unknown[]) => report.columnIndexes.map((i) => cells[i] ?? "");

  const rows: unknown[][] = [pick(report.header)];
  const rowNumbers: number[] = [];
  for (const row of report.rows) {
    if (row.kind !== "data") continue;
    rows.push(pick(row.cells));
    rowNumbers.push(row.row);
  }

  return { rows, rowNumbers, meta: report.meta, repairs: report.repairs };
}
