/**
 * Bentuk laporan — SATU penentu per laporan, dipakai layar, PDF, dan lembar
 * sebar.
 *
 * ── Kenapa satu modul, dan kenapa TANPA dependensi ──────────────────────────
 * Ketiga permukaan harus sepakat tentang bentuk sebuah laporan: cetakan yang
 * membawa baris "Laba Kotor" yang tidak ada di layar adalah laporan yang tidak
 * dipercaya orang dua kali. Jadi aturannya hidup di sini alih-alih ditulis
 * ulang tiga kali — dan ia hidup di modulnya sendiri, TANPA mengimpor apa pun,
 * karena ketiga pemanggilnya tidak punya rumah bersama yang lebih berat:
 * halamannya server component, penyusun PDF berjalan di peramban (jsPDF), dan
 * `@/lib/report-export` murni menurut kontraknya dan tidak boleh menyeret
 * pustaka PDF di belakangnya.
 *
 * ── Pola yang sama, empat kali ──────────────────────────────────────────────
 * Tiap laporan keuangan punya satu fungsi `…Layout()` yang mengembalikan
 * SELURUH barisnya dalam urutan kanonik, dengan angkanya sudah teratasi dan
 * labelnya datang dari sebuah objek `…Labels` (cetakan memakai bahasa
 * Indonesia; layar memasok terjemahan kamus dengan bunyi Indonesia yang SAMA
 * PERSIS, dan itu yang membuat penjaga bentuknya bisa membandingkan layar
 * dengan kertas tanpa tabel padanan). Yang tersisa bagi tiap permukaan hanyalah
 * MENGGAMBAR baris.
 *
 * ── "SAMA PERSIS" itu dijaga, bukan diharapkan (issue #298) ─────────────────
 * Kalimat cetakan di berkas ini dan kalimat kamus yang dibaca layar adalah DUA
 * tempat untuk satu bunyi, dan mengganti kata di `id.json` adalah pekerjaan yang
 * wajar dan sering. `tests/print-label-dictionary.test.ts` memasangkan setiap
 * kalimat di sini dengan kunci kamusnya dan menolak keduanya menyimpang —
 * termasuk kalau sebuah kolom baru lahir tanpa pasangan. Kamus TIDAK dijadikan
 * sumber tunggal dengan sengaja: ekspor tetap berbahasa Indonesia (#278), dan
 * modul ini tidak boleh mengimpor apa pun (lihat di bawah).
 *
 * Urutannya di berkas ini urutan lahirnya: Arus Kas (#241), Neraca (#258),
 * Neraca Saldo (#275), Laba/Rugi (#274).
 */

// ─── Bentuk Arus Kas ─────────────────────────────────────────────────────────

/**
 * Bentuk laporan Arus Kas — SATU penentu untuk layar, PDF, dan lembar sebar
 * (issue #241).
 *
 * ── Kenapa ia ada ───────────────────────────────────────────────────────────
 * Sebelum ini Arus Kas digambar TIGA kali: halaman `reports/cash-flow`,
 * `report-export.ts`, dan `pdf/statement-pdf.ts` masing-masing memutuskan
 * kolomnya, baris tetapnya, dan nasib kelompok kosongnya sendiri. Ketiganya
 * hijau di tes karena masing-masing benar menurut sumbernya sendiri, dan
 * akibatnya terlihat pengguna: periode tanpa mutasi Investasi menampilkan seksi
 * itu di layar dan tidak memuatnya sama sekali di berkas ekspor. Orang yang
 * mencocokkan layar dengan lampirannya menemukan seksi yang hilang, tanpa
 * penjelasan di kedua sisi.
 *
 * Modul ini sudah memegang pola yang benar untuk Laba/Rugi
 * (`incomeStatementLayout()`); yang kurang hanya penerapannya di sini.
 *
 * ── Tiga keputusan yang diambil sadar ───────────────────────────────────────
 *  1. **Kolom "Bersih" MENANG dan masuk ke layar.** Ia tadinya hanya ada di
 *     cetakan — angka yang tak pernah bisa diperiksa sebelum dikirim.
 *     Membuangnya dari ekspor akan MENGAMBIL kolom yang sudah dipakai orang
 *     untuk menjumlah; menambahkannya ke layar hanya memberi. Ikutannya: baris
 *     subtotal kini menyebut masuk/keluar/bersih di ketiga permukaan, bukan
 *     satu angka berarah di layar dan tiga angka di cetakan.
 *  2. **Kelompok kosong DICETAK di ketiganya** — tapi hanya tiga seksi baku
 *     (Operasi, Investasi, Pendanaan). Ia jangkar laporan: periode tanpa
 *     mutasi investasi tetap harus terbaca sebagai laporan arus kas yang utuh,
 *     dengan kalimat "tidak ada pergerakan", bukan sebagai laporan yang
 *     seksinya raib. Aturan yang sama persis dengan "Penjualan dan Beban
 *     Operasional selalu tampil" di `incomeStatementLayout()`.
 *  3. **"Belum Terkategori" hanya muncul kalau berisi.** Ia BUKAN seksi
 *     laporan melainkan ember diagnostik; yang kosong adalah kabar baik dan
 *     tidak perlu baris. Ini satu-satunya kelompok yang boleh hilang, dan
 *     layar sudah menerapkannya sejak awal.
 *  4. **Kas awal & akhir adalah BARIS TABEL di ketiganya.** Laporan arus kas
 *     yang tidak menunjukkan awal + perubahan = akhir di dalam tabelnya bukan
 *     laporan arus kas. Kartu ringkas di atas tabel layar tetap ada — ia
 *     mengulang baris yang kini ada di ketiga permukaan, bukan bentuk keempat.
 */

/**
 * Kategori arus kas. Sengaja ditulis ulang di sini alih-alih diimpor dari
 * `@/lib/reports`: modul ini TIDAK mengimpor apa pun (lihat kepala berkas), dan
 * `reports.ts` menyeret Prisma. Kalau kelima-nya suatu saat berbeda, `tsc`
 * menolak di titik `payload.category = g.category` — jadi duplikasi ini dijaga
 * tipe, bukan kebiasaan.
 */
export type CashFlowCategoryId = "operating" | "investing" | "financing" | "uncategorised";

/** Ember diagnostik, bukan seksi laporan — lihat keputusan 3 di atas. */
const UNCATEGORISED: CashFlowCategoryId = "uncategorised";

export interface CashFlowLineShape {
  code: string;
  name: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface CashFlowGroupShape {
  category: CashFlowCategoryId;
  /** Nama kelompok dalam bahasa DOKUMEN CETAK. Layar menggantinya dari kamus. */
  label: string;
  lines: readonly CashFlowLineShape[];
  inflow: number;
  outflow: number;
  net: number;
}

/** Struktural dengan sengaja — muat untuk hasil pembaca laporan maupun payload ekspor. */
export interface CashFlowShape {
  groups: readonly CashFlowGroupShape[];
  totalInflow: number;
  totalOutflow: number;
  netChange: number;
  openingCash: number;
  closingCash: number;
}

export type CashFlowRowKind =
  | "opening"
  | "group"
  | "line"
  | "empty"
  | "subtotal"
  | "closing"
  | "total";

export interface CashFlowLayoutRow {
  kind: CashFlowRowKind;
  /** Kelompok asal; tak ada untuk baris tetap (awal / akhir / total). */
  category?: CashFlowCategoryId;
  label: string;
  /** Hanya `kind: "line"` — kode akun, dipisah dari namanya agar layar bisa menggayainya. */
  code?: string;
  name?: string;
  /**
   * `null` berarti kolom ini TIDAK BERLAKU untuk baris ini, dan setiap
   * permukaan menggambarnya kosong. Ia bukan nol: kas awal periode tidak
   * "masuk nol rupiah", ia bukan arus sama sekali (Prinsip Inti MASTER.md).
   */
  inflow: number | null;
  outflow: number | null;
  net: number | null;
}

/**
 * Label baris yang bukan milik satu akun. Bentuk fungsi untuk yang menyisipkan
 * nama kelompok, supaya layar bisa memasok terjemahan dengan susunan katanya
 * sendiri.
 */
export interface CashFlowLabels {
  opening: string;
  closing: string;
  total: string;
  empty: string;
  subtotal: (group: string) => string;
  /**
   * `printLabel` = `group.label`; layar mengabaikannya dan memakai kamus.
   *
   * Dua sumber untuk satu bunyi, dan itu disengaja (#298): `printLabel` datang
   * dari `CASH_FLOW_CATEGORY_LABELS` di `lib/reports.ts`, layar dari
   * `cashFlowCategory.*`. Keduanya diikat `tests/print-label-dictionary.test.ts`
   * — kalau salah satunya berganti kata, tesnya merah.
   */
  group: (category: CashFlowCategoryId, printLabel: string) => string;
}

/**
 * Label untuk DOKUMEN CETAK — bahasa Indonesia, seperti seluruh isi `lib/pdf`:
 * berkas yang lepas dari layarnya tidak membawa pilihan bahasa penggunanya.
 *
 * Kamus `id.json` memuat kalimat yang SAMA PERSIS (`reports.openingCashRow`,
 * `reports.closingCashRow`, `reports.netCashRow`, `reports.noCashMovement`,
 * `reports.groupSubtotal`, `cashFlowCategory.*`). Itu bukan kebetulan yang
 * dibiarkan: `tests/cash-flow-shape.test.ts` membandingkan label layar
 * berbahasa Indonesia dengan label di sini baris demi baris.
 */
export const CASH_FLOW_PRINT_LABELS: CashFlowLabels = {
  opening: "Kas & setara kas awal periode",
  closing: "Kas & setara kas akhir periode",
  total: "Kenaikan / Penurunan Kas",
  empty: "Tidak ada pergerakan kas pada periode ini.",
  subtotal: (group) => `Jumlah ${group}`,
  group: (_category, printLabel) => printLabel,
};

/**
 * Nominal untuk DOKUMEN CETAK: kolom yang tak berlaku dibiarkan KOSONG, nol
 * ditulis "-", sisanya diserahkan ke pemformat rupiah pemanggilnya.
 *
 * Nol dan "tak berlaku" sengaja berbeda rupa, dan keduanya bukan "Rp 0": akun
 * yang tidak menerima kas pada periode ini tidak menerima NOL rupiah, dan kas
 * awal periode bukan arus sama sekali. Lembar sebar adalah pengecualian yang
 * ditulis di `report-export.ts` — angkanya harus tetap bisa dijumlah.
 */
export function cashFlowPrintAmount(
  value: number | null,
  format: (amount: number) => string
): string {
  if (value === null) return "";
  return Math.round(value * 100) === 0 ? "-" : format(value);
}

/**
 * Keterangan rekonsiliasi pada baris kaki, untuk DOKUMEN CETAK.
 *
 * Layar menyampaikan hal yang sama lewat lencana di sebelah label — bentuk yang
 * tidak punya padanan di kertas. Karena itu ia ANOTASI, bukan bagian labelnya:
 * penjaga bentuk membandingkan label pokoknya, lalu memeriksa anotasi ini
 * terpisah.
 */
export function cashFlowReconciliationNote(reconciled: boolean): string {
  return reconciled ? "(cocok dengan buku besar)" : "(TIDAK COCOK — periksa buku besar)";
}

export const CASH_FLOW_COLUMNS = ["item", "inflow", "outflow", "net"] as const;

export type CashFlowColumnId = (typeof CASH_FLOW_COLUMNS)[number];

/** Judul kolom untuk DOKUMEN CETAK — bahasa Indonesia; layar memakai kamus. */
export const CASH_FLOW_HEADERS: Record<CashFlowColumnId, string> = {
  item: "Sumber / Penggunaan Kas",
  inflow: "Kas Masuk (IDR)",
  outflow: "Kas Keluar (IDR)",
  net: "Bersih (IDR)",
};

/**
 * Seluruh baris laporan Arus Kas, dalam urutan kanoniknya, dengan angkanya
 * sudah teratasi. Yang tersisa bagi tiap permukaan hanyalah MENGGAMBAR baris —
 * tidak ada satu pun keputusan bentuk di luar fungsi ini.
 */
export function cashFlowLayout(
  statement: CashFlowShape,
  labels: CashFlowLabels = CASH_FLOW_PRINT_LABELS
): CashFlowLayoutRow[] {
  const rows: CashFlowLayoutRow[] = [
    {
      kind: "opening",
      label: labels.opening,
      inflow: null,
      outflow: null,
      net: statement.openingCash,
    },
  ];

  for (const g of statement.groups) {
    if (g.category === UNCATEGORISED && g.lines.length === 0) continue;
    const label = labels.group(g.category, g.label);
    rows.push({
      kind: "group",
      category: g.category,
      label,
      inflow: null,
      outflow: null,
      net: null,
    });
    if (g.lines.length === 0) {
      rows.push({
        kind: "empty",
        category: g.category,
        label: labels.empty,
        inflow: null,
        outflow: null,
        net: null,
      });
    } else {
      for (const l of g.lines) {
        rows.push({
          kind: "line",
          category: g.category,
          label: `${l.code}  ${l.name}`.trim(),
          code: l.code,
          name: l.name,
          inflow: l.inflow,
          outflow: l.outflow,
          net: l.net,
        });
      }
    }
    rows.push({
      kind: "subtotal",
      category: g.category,
      label: labels.subtotal(label),
      inflow: g.inflow,
      outflow: g.outflow,
      net: g.net,
    });
  }

  rows.push({
    kind: "closing",
    label: labels.closing,
    inflow: null,
    outflow: null,
    net: statement.closingCash,
  });
  // Baris kaki: total masuk, total keluar, dan perubahan bersih periode.
  // Digambar di `<tfoot>` (layar), `foot` (autoTable), dan sebagai baris
  // terakhir lembar sebar — tempat yang berbeda, urutan yang sama.
  rows.push({
    kind: "total",
    label: labels.total,
    inflow: statement.totalInflow,
    outflow: statement.totalOutflow,
    net: statement.netChange,
  });

  return rows;
}

// ─── Bentuk Neraca ───────────────────────────────────────────────────────────

/**
 * Bentuk laporan Neraca — SATU penentu untuk layar, PDF, dan lembar sebar
 * (issue #258).
 *
 * ── Kenapa ia ada ───────────────────────────────────────────────────────────
 * Sama persis dengan alasan `cashFlowLayout()` di atas, satu laporan lebih
 * jauh. Neraca digambar TIGA kali: halaman `reports/balance-sheet` (dengan
 * penolong `section()` lokalnya sendiri), `buildBalanceSheetSheet()` di
 * `report-export.ts`, dan cabang `balance-sheet` di `pdf/statement-pdf.ts`.
 * Ketiganya hijau di tesnya masing-masing, karena masing-masing benar menurut
 * sumbernya sendiri; yang tidak diuji siapa pun adalah KESAMAAN di antara
 * ketiganya — dan itu satu-satunya sifat yang penting bagi orang yang
 * mencocokkan layar dengan lampiran yang ia kirim ke bank.
 *
 * Yang paling gawat: **aritmetika ekuitas ditulis ulang di setiap tempat.**
 * `totalEquity + netIncome` hidup di halaman, di lembar sebar, di PDF, dan di
 * `report-summary.ts` — empat salinan sebuah rumus akuntansi adalah empat
 * tempat ia bisa menyimpang, dan yang kalah selalu yang tidak terlihat.
 * Sekarang ia hidup sekali, di `balanceSheetEquityTotal()`.
 *
 * ── Empat keputusan yang diambil sadar ──────────────────────────────────────
 *  1. **Baris penutup ada DUA, di ketiganya: "Total Aset" lalu "Total
 *     Liabilitas + Ekuitas".** Satu-satunya klaim neraca adalah A = L + E;
 *     laporan yang hanya mencetak satu sisi di penutupnya meminta pembacanya
 *     menggulung balik dan menahan angka di kepala, lalu percaya begitu saja
 *     pada kata "Seimbang". Aturan yang sama persis dengan "awal + perubahan =
 *     akhir harus ada DI DALAM tabel arus kas" (keputusan 4 di #241). Layar
 *     sudah punya keduanya; PDF & lembar sebar MENDAPAT baris "Total Aset" —
 *     ia menambah, tidak mengambil.
 *  2. **Label baris penutup menamai ANGKANYA: "Total Liabilitas + Ekuitas".**
 *     PDF dulu menulis "Aset = Liabilitas + Ekuitas" di sebelah angka yang
 *     bukan aset, dan "Aset =/= Liabilitas + Ekuitas" di sebelah angka yang
 *     sama — sebuah label yang menyatakan hubungan, bukan menamai bilangannya.
 *     Keadaan seimbang jadi ANOTASI (lencana di layar, tanda kurung di
 *     cetakan), persis seperti rekonsiliasi arus kas.
 *  3. **Seksi kosong menyebut alasannya**, bukan "—" (layar) atau "Tidak ada
 *     data." (cetakan). Sebuah tanda hubung tidak mengatakan apa pun kepada
 *     pembaca layar, dan "tidak ada data" terbaca seperti laporan yang gagal
 *     memuat. Yang benar: tidak ada AKUN BERSALDO di bagian itu — `getBalanceSheet`
 *     memang membuang akun bersaldo nol.
 *  4. **"Akumulasi Laba/Rugi" adalah BARIS AKUN di dalam blok ekuitas**, bukan
 *     baris tersendiri sesudahnya (bentuk lembar sebar yang lama). Ia memang
 *     komponen ekuitas — "Total Ekuitas" menjumlahkannya — dan seseorang yang
 *     menyorot baris-baris ekuitas di Excel lalu menekan `SUM` harus mendapat
 *     angka yang sama dengan subtotalnya. Karena ia bukan akun, kodenya kosong;
 *     labelnya karena itu `.trim()`, seperti seluruh baris akun di app ini.
 */

export type BalanceSheetSectionId = "assets" | "liabilities" | "equity";

export interface BalanceSheetLineShape {
  code: string;
  name: string;
  amount: number;
}

/** Struktural dengan sengaja — muat untuk hasil pembaca laporan maupun payload ekspor. */
export interface BalanceSheetShape {
  assets: readonly BalanceSheetLineShape[];
  liabilities: readonly BalanceSheetLineShape[];
  equity: readonly BalanceSheetLineShape[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  netIncome: number;
  totalLiabilitiesEquity: number;
  balanced: boolean;
}

/**
 * Ekuitas SEBAGAIMANA TERBACA DI LAPORAN: saldo akun-akun ekuitas
 * (`totalEquity`) ditambah hasil periode berjalan (`netIncome`), yang belum
 * ditutup ke akun laba ditahan mana pun.
 *
 * **Satu-satunya tempat rumus ini ditulis.** Sebelum #258 ia ditulis ulang di
 * empat berkas; sebuah rumus akuntansi yang punya empat salinan punya empat
 * tempat untuk menyimpang, dan salinan yang salah selalu yang paling jarang
 * dilihat orang. `getBalanceSheet()` memakainya untuk menyusun
 * `totalLiabilitiesEquity`, jadi neraca tidak bisa "seimbang" menurut satu
 * penjumlahan dan tidak seimbang menurut penjumlahan yang lain.
 */
export function balanceSheetEquityTotal(statement: {
  totalEquity: number;
  netIncome: number;
}): number {
  return statement.totalEquity + statement.netIncome;
}

export type BalanceSheetRowKind = "section" | "line" | "empty" | "subtotal" | "total";

export interface BalanceSheetLayoutRow {
  kind: BalanceSheetRowKind;
  /** Seksi asal; tak ada untuk baris penutup. */
  section?: BalanceSheetSectionId;
  label: string;
  /** Hanya `kind: "line"` — kode akun, dipisah dari namanya agar layar bisa menggayainya. */
  code?: string;
  name?: string;
  /**
   * `null` berarti kolom nominal TIDAK BERLAKU untuk baris ini (judul seksi,
   * kalimat "tidak ada akun"), dan setiap permukaan menggambarnya kosong.
   *
   * Nol tetap NOL, dan tertulis apa adanya di ketiga permukaan — berbeda dari
   * Arus Kas yang menuliskannya "-". Di neraca sebuah nol adalah pernyataan
   * posisi ("bagian ini memang nol per tanggal itu"), bukan "tidak ada arus";
   * dan tidak ada satu pun permukaan yang hari ini menuliskannya lain, jadi
   * tidak ada divergensi yang perlu dimenangkan siapa pun di sini.
   */
  amount: number | null;
}

/**
 * Label baris yang bukan milik satu akun. Layar memasok terjemahannya; nilai
 * Indonesia-nya SAMA PERSIS dengan `BALANCE_SHEET_PRINT_LABELS`, dan itu yang
 * membuat `tests/balance-sheet-shape.test.ts` bisa membandingkan layar dengan
 * cetakan tanpa tabel padanan.
 */
export interface BalanceSheetLabels {
  assets: string;
  liabilities: string;
  equity: string;
  /** Subtotal seksi — bentuk fungsi karena susunan katanya berbeda per bahasa. */
  sectionTotal: (section: string) => string;
  /** Hasil periode berjalan, sebagai baris akun di dalam blok ekuitas. */
  currentNetIncome: string;
  empty: string;
  totalAssets: string;
  totalLiabilitiesEquity: string;
}

/**
 * Label untuk DOKUMEN CETAK — bahasa Indonesia, seperti seluruh isi `lib/pdf`:
 * berkas yang lepas dari layarnya tidak membawa pilihan bahasa penggunanya.
 *
 * Kamus `id.json` memuat kalimat yang SAMA PERSIS (`reports.sectionAssets`,
 * `reports.sectionLiabilities`, `reports.sectionEquity`,
 * `reports.sectionTotal`, `reports.currentNetIncome`,
 * `reports.noAccountsInSection`, `reports.totalAssets`,
 * `reports.totalLiabilitiesEquity`).
 */
export const BALANCE_SHEET_PRINT_LABELS: BalanceSheetLabels = {
  assets: "Aset",
  liabilities: "Liabilitas",
  equity: "Ekuitas",
  sectionTotal: (section) => `Total ${section}`,
  currentNetIncome: "Akumulasi Laba/Rugi",
  empty: "Tidak ada akun bersaldo pada bagian ini.",
  totalAssets: "Total Aset",
  totalLiabilitiesEquity: "Total Liabilitas + Ekuitas",
};

/**
 * Keterangan keseimbangan pada baris penutup, untuk DOKUMEN CETAK.
 *
 * Layar menyampaikan hal yang sama lewat lencana di sebelah label — bentuk yang
 * tidak punya padanan di kertas. Karena itu ia ANOTASI, bukan bagian labelnya:
 * penjaga bentuk membandingkan label pokoknya, lalu memeriksa anotasi ini
 * terpisah. Bentuknya mengikuti `cashFlowReconciliationNote()`.
 */
export function balanceSheetBalanceNote(balanced: boolean): string {
  return balanced ? "(Seimbang)" : "(TIDAK SEIMBANG — periksa jurnal)";
}

export const BALANCE_SHEET_COLUMNS = ["item", "amount"] as const;

export type BalanceSheetColumnId = (typeof BALANCE_SHEET_COLUMNS)[number];

/** Judul kolom untuk DOKUMEN CETAK — bahasa Indonesia; layar memakai kamus. */
export const BALANCE_SHEET_HEADERS: Record<BalanceSheetColumnId, string> = {
  item: "Keterangan",
  amount: "Jumlah (IDR)",
};

/**
 * Berapa baris terakhir `balanceSheetLayout()` yang merupakan KAKI laporan.
 * Dua: "Total Aset" dan "Total Liabilitas + Ekuitas" — dua sisi klaim yang
 * dibaca berdampingan (keputusan 1). Yang TERAKHIR selalu sisi liabilitas +
 * ekuitas, dan itu yang membawa anotasi keseimbangan.
 */
export const BALANCE_SHEET_FOOT_ROWS = 2;

/**
 * Badan dan kaki, dipisah dengan satu aturan alih-alih tiga. Di layar kaki
 * menjadi prop `summary`, di cetakan `foot` autoTable, di lembar sebar dua
 * baris terakhir — tempat yang berbeda, isi yang sama.
 */
export function splitBalanceSheetRows(rows: readonly BalanceSheetLayoutRow[]): {
  body: BalanceSheetLayoutRow[];
  foot: BalanceSheetLayoutRow[];
} {
  return {
    body: rows.slice(0, -BALANCE_SHEET_FOOT_ROWS),
    foot: rows.slice(-BALANCE_SHEET_FOOT_ROWS),
  };
}

/**
 * Seluruh baris Neraca, dalam urutan kanoniknya, dengan angkanya sudah
 * teratasi. Yang tersisa bagi tiap permukaan hanyalah MENGGAMBAR baris — tidak
 * ada satu pun keputusan bentuk, dan tidak satu pun penjumlahan, di luar
 * fungsi ini.
 */
export function balanceSheetLayout(
  statement: BalanceSheetShape,
  labels: BalanceSheetLabels = BALANCE_SHEET_PRINT_LABELS
): BalanceSheetLayoutRow[] {
  const rows: BalanceSheetLayoutRow[] = [];

  const section = (
    id: BalanceSheetSectionId,
    title: string,
    lines: readonly BalanceSheetLineShape[],
    total: number
  ) => {
    rows.push({ kind: "section", section: id, label: title, amount: null });
    if (lines.length === 0) {
      rows.push({ kind: "empty", section: id, label: labels.empty, amount: null });
    } else {
      for (const l of lines) {
        rows.push({
          kind: "line",
          section: id,
          label: `${l.code}  ${l.name}`.trim(),
          code: l.code,
          name: l.name,
          amount: l.amount,
        });
      }
    }
    rows.push({
      kind: "subtotal",
      section: id,
      label: labels.sectionTotal(title),
      amount: total,
    });
  };

  section("assets", labels.assets, statement.assets, statement.totalAssets);
  section("liabilities", labels.liabilities, statement.liabilities, statement.totalLiabilities);
  // Hasil periode berjalan adalah komponen ekuitas, jadi ia baris akun DI DALAM
  // bloknya — lihat keputusan 4 di kepala bagian ini. Karena itu pula blok
  // ekuitas tak pernah kosong: paling tidak angka periode berjalan selalu ada,
  // meski nol.
  section(
    "equity",
    labels.equity,
    [...statement.equity, { code: "", name: labels.currentNetIncome, amount: statement.netIncome }],
    balanceSheetEquityTotal(statement)
  );

  rows.push({ kind: "total", label: labels.totalAssets, amount: statement.totalAssets });
  rows.push({
    kind: "total",
    label: labels.totalLiabilitiesEquity,
    amount: statement.totalLiabilitiesEquity,
  });

  return rows;
}

// ─── Bentuk Neraca Saldo ─────────────────────────────────────────────────────

/**
 * Bentuk laporan Neraca Saldo — SATU penentu untuk layar, PDF, dan lembar sebar
 * (issue #275).
 *
 * ── Kenapa ia ada ───────────────────────────────────────────────────────────
 * Alasan yang sama dengan `cashFlowLayout()` (#241) dan `balanceSheetLayout()`
 * (#258), satu laporan lebih jauh — tapi divergensinya yang paling mahal
 * jenisnya: **cetakan membuat pernyataan yang layarnya sengaja TOLAK
 * keluarkan.** Pada buku yang belum punya satu jurnal pun, layar tidak
 * menggambar baris Total sama sekali, sementara PDF dan lembar sebar tetap
 * mencetak "Total (Seimbang)".
 *
 * ── Keputusan: buku kosong tidak mencetak Total DI MANA PUN ─────────────────
 * Penghilangan di layar diputuskan sadar di #198, dengan alasan yang benar:
 * "Total Rp 0 · Seimbang" pada buku kosong terbaca seperti HASIL AUDIT,
 * padahal ia cuma menyatakan belum ada apa-apa untuk diperiksa. Alasan itu
 * tidak melemah ketika keluarannya berpindah ke kertas — ia MENGUAT: PDF adalah
 * bentuk yang dilampirkan, dikirim, dan diarsipkan, dan selembar Neraca Saldo
 * bertuliskan "Seimbang" di atas buku yang belum punya satu jurnal pun bisa
 * dipercaya orang lain sebagai bukti pembukuan sudah diperiksa dan cocok.
 *
 * Jadi yang menang adalah bentuk LAYAR, dan ia menang di ketiga permukaan:
 * buku kosong menghasilkan tepat SATU baris — kalimat yang menyebut keadaannya
 * ("Belum ada saldo sampai tanggal ini") — dan TIDAK ADA baris Total di
 * belakangnya. Diam saja bukan pilihan: tabel yang hanya berisi judul kolom
 * terbaca seperti ekspor yang gagal.
 *
 * ── Aturannya "ada jurnal?", bukan "totalnya nol?" ──────────────────────────
 * Baris Total hilang HANYA ketika tidak ada satu baris akun pun. Buku yang
 * punya akun bersaldo nol di kedua sisi tetap mendapat barisnya (`getTrialBalance`
 * sengaja mempertahankan akun yang mutasinya saling menutup — lihat catatannya
 * di `lib/reports.ts`), dan Total nol di sana adalah pernyataan yang benar:
 * jurnalnya ada, dan jumlahnya nol. Dua keadaan itu berbeda, dan laporan ini
 * membedakannya.
 *
 * ── Nol tetap "-", seperti sebelum issue ini ────────────────────────────────
 * Sebuah nol di Neraca Saldo berarti akun itu tidak bersaldo DI SISI ITU —
 * ketiadaan, bukan pernyataan posisi seperti nol di Neraca (#258). Ketiga
 * permukaan sudah sepakat sejak awal ("—" di layar lewat `Money`, "-" di
 * kertas, ANGKA nol di lembar sebar supaya `SUM` hidup, keputusan #241), jadi
 * tidak ada divergensi yang perlu dimenangkan siapa pun di sini.
 */

export interface TrialBalanceLineShape {
  code: string;
  name: string;
  debit: number;
  credit: number;
}

/** Struktural dengan sengaja — muat untuk hasil pembaca laporan maupun payload ekspor. */
export interface TrialBalanceShape {
  rows: readonly TrialBalanceLineShape[];
  totalDebit: number;
  totalCredit: number;
}

export type TrialBalanceRowKind = "line" | "empty" | "total";

export interface TrialBalanceLayoutRow {
  kind: TrialBalanceRowKind;
  /** Kolom pertama — kode akun. Tak ada untuk baris yang bukan akun. */
  code?: string;
  /** Kolom kedua — nama akun, atau kalimat baris bukan-akun. */
  name: string;
  /**
   * `code` + `name` sebagai satu teks. Permukaannya menggambar kedua kolom
   * terpisah; ini untuk yang membaca barisnya sebagai satu label — penjaga
   * bentuk, dan pembaca kode yang ingin tahu bunyi barisnya.
   */
  label: string;
  /**
   * `null` berarti kolom ini TIDAK BERLAKU untuk baris ini (kalimat buku
   * kosong), dan setiap permukaan menggambarnya kosong. Ia bukan nol: buku yang
   * belum punya jurnal tidak berdebit nol rupiah, ia tidak berdebit sama sekali
   * (Prinsip Inti MASTER.md). Nol yang memang nol tetap nol — lihat kepala
   * bagian ini.
   */
  debit: number | null;
  credit: number | null;
}

/**
 * Label baris yang bukan milik satu akun. Layar memasok terjemahannya; nilai
 * Indonesia-nya SAMA PERSIS dengan `TRIAL_BALANCE_PRINT_LABELS`, dan itu yang
 * membuat `tests/trial-balance-shape.test.ts` bisa membandingkan layar dengan
 * cetakan tanpa tabel padanan.
 */
export interface TrialBalanceLabels {
  /** Buku yang belum punya satu baris pun sampai tanggal laporan. */
  empty: string;
  total: string;
}

/**
 * Label untuk DOKUMEN CETAK — bahasa Indonesia, seperti seluruh isi `lib/pdf`:
 * berkas yang lepas dari layarnya tidak membawa pilihan bahasa penggunanya.
 *
 * Kamus `id.json` memuat kalimat yang SAMA PERSIS
 * (`reports.trialBalanceEmptyTitle`, `common.total`).
 */
export const TRIAL_BALANCE_PRINT_LABELS: TrialBalanceLabels = {
  empty: "Belum ada saldo sampai tanggal ini",
  total: "Total",
};

/**
 * Keterangan keseimbangan pada baris Total, untuk DOKUMEN CETAK.
 *
 * Klaimnya berbeda dari Neraca (debit = kredit, bukan A = L + E) tetapi
 * ANOTASI-nya sama persis, jadi ia memakai ULANG kalimat itu alih-alih menulis
 * kalimat kedua yang bisa menyimpang. Layar menyampaikannya lewat lencana —
 * bentuk yang tidak punya padanan di kertas.
 */
export function trialBalanceBalanceNote(balanced: boolean): string {
  return balanceSheetBalanceNote(balanced);
}

/**
 * Nominal untuk DOKUMEN CETAK. Aturannya identik dengan Arus Kas — kolom yang
 * tak berlaku KOSONG, nol "-" — jadi ia memakai fungsi itu ulang alih-alih
 * menyalin cabangnya.
 */
export function trialBalancePrintAmount(
  value: number | null,
  format: (amount: number) => string
): string {
  return cashFlowPrintAmount(value, format);
}

export const TRIAL_BALANCE_COLUMNS = ["code", "name", "debit", "credit"] as const;

export type TrialBalanceColumnId = (typeof TRIAL_BALANCE_COLUMNS)[number];

/**
 * Judul kolom untuk DOKUMEN CETAK — bahasa Indonesia; layar memakai kamus,
 * yang nilai Indonesia-nya sama persis (`accounts.colCode`,
 * `accounts.nameField`, `journal.colDebitIdr`, `journal.colCreditIdr`).
 *
 * PDF dulu menulis "Debit"/"Kredit" tanpa mata uangnya sementara lembar sebar
 * menulis "Debit (IDR)"/"Kredit (IDR)" — satu berkas yang menyebut satuannya
 * dan satu yang tidak, untuk angka yang sama.
 */
export const TRIAL_BALANCE_HEADERS: Record<TrialBalanceColumnId, string> = {
  code: "Kode",
  name: "Nama Akun",
  debit: "Debit (IDR)",
  credit: "Kredit (IDR)",
};

/**
 * Badan dan kaki, dipisah dengan satu aturan alih-alih tiga. Kakinya berisi
 * NOL ATAU SATU baris: buku yang belum punya jurnal tidak punya Total (lihat
 * kepala bagian ini), dan itulah satu-satunya hal yang membuat ketiga permukaan
 * bisa sepakat tentang buku kosong.
 */
export function splitTrialBalanceRows(rows: readonly TrialBalanceLayoutRow[]): {
  body: TrialBalanceLayoutRow[];
  foot: TrialBalanceLayoutRow[];
} {
  const hasFoot = rows.length > 0 && rows[rows.length - 1].kind === "total";
  const cut = rows.length - (hasFoot ? 1 : 0);
  return { body: rows.slice(0, cut), foot: rows.slice(cut) };
}

/**
 * Seluruh baris Neraca Saldo, dalam urutan kanoniknya, dengan angkanya sudah
 * teratasi. Yang tersisa bagi tiap permukaan hanyalah MENGGAMBAR baris — tidak
 * ada satu pun keputusan bentuk, termasuk keputusan apakah baris Total keluar,
 * di luar fungsi ini.
 */
export function trialBalanceLayout(
  statement: TrialBalanceShape,
  labels: TrialBalanceLabels = TRIAL_BALANCE_PRINT_LABELS
): TrialBalanceLayoutRow[] {
  if (statement.rows.length === 0) {
    // Satu baris, dan TIDAK ADA Total di belakangnya — keputusan pokok #275.
    return [
      { kind: "empty", name: labels.empty, label: labels.empty, debit: null, credit: null },
    ];
  }

  const rows: TrialBalanceLayoutRow[] = statement.rows.map((r) => ({
    kind: "line" as const,
    code: r.code,
    name: r.name,
    label: `${r.code}  ${r.name}`.trim(),
    debit: r.debit,
    credit: r.credit,
  }));

  rows.push({
    kind: "total",
    name: labels.total,
    label: labels.total,
    debit: statement.totalDebit,
    credit: statement.totalCredit,
  });

  return rows;
}

// ─── Bentuk Laba/Rugi ────────────────────────────────────────────────────────

/**
 * Bentuk laporan Laba/Rugi bertingkat — SATU penentu untuk layar, PDF, dan
 * lembar sebar (issue #274). Yang terakhir dari empat laporan keuangan.
 *
 * ── Kenapa ia sempat terlihat sehat ─────────────────────────────────────────
 * `incomeStatementLayout()` sudah ada sejak #123 dan memang dipanggil ketiga
 * permukaan — itu sebabnya #241 dan #258 sama-sama mencatatnya "sehat". Tapi
 * yang dibagi penentu itu hanya KETERLIHATAN BAND (`showGrossProfit`,
 * `showOperatingProfit`, kini `incomeStatementBands()`); bentuk barisnya masih
 * tiga definisi lepas, dan ketiganya berbeda:
 *
 *  • PDF menggambar satu `autoTable` per band dengan judul band sebagai KEPALA
 *    tabel, dan subtotalnya (`LABA KOTOR`, `LABA USAHA`, `LABA BERSIH`) sebagai
 *    `doc.text()` DI LUAR tabel mana pun. Baris yang bukan baris tabel tidak
 *    bisa dijumlah, tidak bisa disalin, dan lepas dari perataan kolomnya.
 *  • Lembar sebar menuliskan label anak tangganya sebagai string mati HURUF
 *    BESAR SEMUA, sementara layar memakai kamus dan ikut berpindah bahasa —
 *    pengguna berbahasa Inggris atau Mandarin mendapat laporan yang setengahnya
 *    Indonesia. Itu bug i18n yang menyamar sebagai pilihan gaya.
 *  • Band kosong punya tiga rupa untuk satu hal: `["Tidak ada data.", "-"]` di
 *    kertas, sel kosong di lembar sebar, "—" di layar.
 *  • Catatan marjin kotor hanya ada di layar.
 *
 * ── Lima keputusan yang diambil sadar ───────────────────────────────────────
 *  1. **Anak tangga & hasil akhir adalah BARIS TABEL, di ketiganya.** Sama
 *     persis dengan Neraca (#258): PDF menjadi SATU tabel dengan judul band
 *     sebagai baris tebal di dalamnya, dan subtotalnya duduk di kolom yang sama
 *     dengan angka yang ia jumlahkan. Sebuah "LABA BERSIH" yang digambar
 *     `doc.text()` terlihat seperti baris tabel dan bukan baris tabel — ia tidak
 *     ikut tersalin saat pembacanya menyorot tabelnya, dan ia melayang ke
 *     halaman berikutnya sendirian ketika tabelnya terpotong.
 *  2. **Label datang dari KAMUS di ketiga permukaan**, jadi tidak ada lagi
 *     "LABA KOTOR" huruf besar mati. Bentuk LAYAR yang menang: "Laba Kotor",
 *     "Laba Usaha", "Laba / Rugi Bersih" — kunci `reports.*` yang sudah ada di
 *     tiga bahasa, tanpa satu kunci baru pun.
 *  3. **Hasil akhir memakai SATU label, dengan arahnya sebagai ANOTASI.**
 *     Dulu labelnya sendiri yang berganti ("LABA BERSIH" / "RUGI BERSIH") — nama
 *     baris yang berubah menurut tandanya membuat dua periode yang dibandingkan
 *     berdampingan tampak punya baris yang berbeda. Sekarang barisnya selalu
 *     "Laba / Rugi Bersih" dan arahnya menempel di belakangnya sebagai "(Laba)"
 *     / "(Rugi)" — persis bentuk yang sudah dipakai layar, dan penanda
 *     NON-WARNA bagi nominal yang di layar diwarnai (MASTER.md).
 *  4. **Band kosong menyebut ALASANNYA**, dengan kalimat yang SAMA PERSIS
 *     dengan Neraca — `getIncomeStatement` juga membuang akun bersaldo nol
 *     (`if (amount === 0) continue`), jadi "tidak ada akun bersaldo di bagian
 *     ini" memang yang terjadi. Kalimatnya dipakai ULANG, tidak disalin: "—"
 *     tidak mengatakan apa pun kepada pembaca layar dan "Tidak ada data."
 *     terbaca seperti laporan yang gagal memuat.
 *  5. **Marjin kotor ikut TERCETAK.** Ia dulu hanya ada di layar; menambahkannya
 *     ke berkas ekspor MEMBERI, sedangkan mencabutnya dari layar MENGAMBIL
 *     angka yang sudah dipakai orang (aturan yang sama dengan "Total Aset"
 *     di #258). Ia anotasi pada baris Laba Kotor, bukan kolom sendiri: sebuah
 *     persentase yang hanya dimiliki SATU baris tidak layak satu kolom.
 *
 * ── Nol adalah pernyataan, seperti di Neraca ────────────────────────────────
 * Nol yang memang nol ditulis nol di ketiga permukaan — BUKAN "-" seperti di
 * Arus Kas dan Neraca Saldo. "Total Beban Lain-lain: Rp 0" pada band yang
 * berisi akun adalah pernyataan tentang periodenya, bukan ketiadaan arus. Yang
 * TIDAK BERLAKU (judul band, kalimat band kosong) tetap `null` → sel kosong di
 * mana pun, tak pernah "Rp 0" (Prinsip Inti MASTER.md).
 */

/**
 * Band mana yang layak dicetak (issue #123, dulu bernama
 * `incomeStatementLayout`).
 *
 * Band tanpa baris dihilangkan, dan begitu pula subtotal yang band itu ada
 * untuk menghasilkannya: tanpa akun HPP, "Laba Kotor" hanya akan mengulang
 * total pendapatan, dan tanpa pendapatan/beban lain-lain "Laba Usaha" hanya
 * akan mengulang hasil bersihnya. Subtotal yang mengulang baris di atasnya
 * mengajari pembacanya melewati subtotal, dan itu lebih buruk daripada tidak
 * mencetak satu pun. Jadi perusahaan jasa tetap melihat laporan yang sama
 * seperti sebelumnya — Pendapatan, Beban, Laba/Rugi Bersih — sementara
 * perusahaan dagang mendapat tangga penuhnya.
 *
 * Penjualan dan Beban Operasional SELALU tampil, bahkan saat kosong: keduanya
 * jangkar laporan, dan periode tanpa isi tetap harus terbaca sebagai laporan,
 * bukan sebagai satu total yang berdiri sendirian.
 */
export interface IncomeStatementBands {
  showCogs: boolean;
  showGrossProfit: boolean;
  showOtherIncome: boolean;
  showOtherExpense: boolean;
  showOperatingProfit: boolean;
}

/** Struktural dengan sengaja — muat untuk hasil pembaca laporan maupun payload ekspor. */
export interface IncomeStatementBandShape {
  cogs: { lines: readonly unknown[] };
  otherIncome: { lines: readonly unknown[] };
  otherExpense: { lines: readonly unknown[] };
}

export function incomeStatementBands(statement: IncomeStatementBandShape): IncomeStatementBands {
  const showCogs = statement.cogs.lines.length > 0;
  const showOtherIncome = statement.otherIncome.lines.length > 0;
  const showOtherExpense = statement.otherExpense.lines.length > 0;
  return {
    showCogs,
    showGrossProfit: showCogs,
    showOtherIncome,
    showOtherExpense,
    showOperatingProfit: showOtherIncome || showOtherExpense,
  };
}

/**
 * Marjin kotor sebagai persentase pendapatan, atau `null` bila tidak ada
 * pendapatan untuk dipersentasekan. Sengaja null dan bukan 0: periode tanpa
 * penjualan tidak punya marjin, dan "0%" akan menyatakan sesuatu yang tidak
 * dikatakan bukunya.
 */
export function grossMarginPct(grossProfit: number, totalSales: number): number | null {
  if (Math.round(totalSales * 100) === 0) return null;
  return (grossProfit / totalSales) * 100;
}

/**
 * Satu angka desimal, dan pembulatannya hidup DI SINI. Layar dulu membulatkan
 * sendiri di halamannya; begitu cetakan ikut menampilkan marjin, pembulatan yang
 * ditulis dua kali adalah dua tempat "33,3%" bisa menjadi "33,33%".
 */
export function roundedMarginPct(pct: number): number {
  return Math.round(pct * 10) / 10;
}

export type IncomeStatementSectionId =
  | "sales"
  | "cogs"
  | "operatingExpense"
  | "otherIncome"
  | "otherExpense";

/** Anak tangga — subtotal ANTAR band, bukan subtotal sebuah band. */
export type IncomeStatementStepId = "grossProfit" | "operatingProfit";

export interface IncomeStatementLineShape {
  code: string;
  name: string;
  amount: number;
}

export interface IncomeStatementSectionShape {
  lines: readonly IncomeStatementLineShape[];
  total: number;
}

/** Struktural dengan sengaja — muat untuk hasil pembaca laporan maupun payload ekspor. */
export interface IncomeStatementShape extends IncomeStatementBandShape {
  sales: IncomeStatementSectionShape;
  cogs: IncomeStatementSectionShape;
  grossProfit: number;
  operatingExpense: IncomeStatementSectionShape;
  operatingProfit: number;
  otherIncome: IncomeStatementSectionShape;
  otherExpense: IncomeStatementSectionShape;
  netIncome: number;
}

export type IncomeStatementRowKind =
  | "section"
  | "line"
  | "empty"
  | "subtotal"
  | "step"
  | "total";

export interface IncomeStatementLayoutRow {
  kind: IncomeStatementRowKind;
  /** Band asal; tak ada untuk anak tangga & baris penutup. */
  section?: IncomeStatementSectionId;
  /** Hanya `kind: "step"`. */
  step?: IncomeStatementStepId;
  label: string;
  /** Hanya `kind: "line"` — kode akun, dipisah dari namanya agar layar bisa menggayainya. */
  code?: string;
  name?: string;
  /**
   * Keterangan kecil di samping label — marjin kotor pada baris Laba Kotor,
   * arah hasil ("Laba"/"Rugi") pada baris penutup.
   *
   * Ia ANOTASI, bukan bagian label: tiap permukaan memberinya bentuknya sendiri
   * (span kecil berwarna di layar, tanda kurung di cetakan), persis seperti
   * lencana keseimbangan Neraca. Bedanya dari `balanceSheetBalanceNote()` — ia
   * lahir DI SINI dan bukan di tiap permukaan — karena bunyinya bergantung
   * bahasa, jadi ia harus lewat `labels` juga. Ikutannya kebetulan lebih baik:
   * baris mana yang beranotasi pun jadi satu keputusan, bukan tiga.
   */
  note?: string;
  /** `null` = kolom nominal TIDAK BERLAKU (judul band, kalimat band kosong). */
  amount: number | null;
}

/**
 * Label baris yang bukan milik satu akun. Layar memasok terjemahannya; nilai
 * Indonesia-nya SAMA PERSIS dengan `INCOME_STATEMENT_PRINT_LABELS`, dan itu yang
 * membuat `tests/income-statement-shape.test.ts` bisa membandingkan layar dengan
 * cetakan tanpa tabel padanan.
 */
export interface IncomeStatementLabels {
  sales: string;
  cogs: string;
  operatingExpense: string;
  otherIncome: string;
  otherExpense: string;
  /** Subtotal band — bentuk fungsi karena susunan katanya berbeda per bahasa. */
  sectionTotal: (section: string) => string;
  grossProfit: string;
  operatingProfit: string;
  netIncome: string;
  empty: string;
  /** Anotasi baris Laba Kotor; `pct` sudah dibulatkan satu desimal. */
  grossMargin: (pct: number) => string;
  /** Anotasi baris penutup — arah hasil periode. */
  result: (profit: boolean) => string;
}

/**
 * Label untuk DOKUMEN CETAK — bahasa Indonesia, seperti seluruh isi `lib/pdf`:
 * berkas yang lepas dari layarnya tidak membawa pilihan bahasa penggunanya.
 *
 * Kamus `id.json` memuat kalimat yang SAMA PERSIS (`reports.sectionRevenue`,
 * `reports.sectionCogs`, `reports.sectionOperatingExpense`,
 * `reports.sectionOtherIncome`, `reports.sectionOtherExpense`,
 * `reports.sectionTotal`, `reports.grossProfitRow`,
 * `reports.operatingProfitRow`, `reports.netIncomeRow`,
 * `reports.noAccountsInSection`, `reports.grossMarginNote`, `reports.profit`,
 * `reports.loss`). TIDAK ADA kunci kamus baru di issue ini — yang lama sudah
 * berbunyi benar di tiga bahasa; yang salah adalah cetakan yang tidak memakainya.
 */
export const INCOME_STATEMENT_PRINT_LABELS: IncomeStatementLabels = {
  sales: "Pendapatan",
  cogs: "Beban Pokok Penjualan",
  operatingExpense: "Beban Operasional",
  otherIncome: "Pendapatan Lain-lain",
  otherExpense: "Beban Lain-lain",
  sectionTotal: (section) => `Total ${section}`,
  grossProfit: "Laba Kotor",
  operatingProfit: "Laba Usaha",
  netIncome: "Laba / Rugi Bersih",
  // Kalimat yang sama persis dengan Neraca, dipakai ULANG dan tidak disalin:
  // dua kalimat untuk satu keadaan adalah dua kalimat yang bisa menyimpang.
  empty: BALANCE_SHEET_PRINT_LABELS.empty,
  grossMargin: (pct) => `${new Intl.NumberFormat("id-ID").format(pct)}% dari pendapatan`,
  result: (profit) => (profit ? "Laba" : "Rugi"),
};

/**
 * Judul kolom Laba/Rugi untuk DOKUMEN CETAK. SAMA PERSIS dengan Neraca, dan itu
 * bukan kebetulan yang dibiarkan: keduanya laporan uang dua kolom, dan layar
 * memang sudah memakai KUNCI KAMUS yang sama untuk keduanya
 * (`common.description`, `reports.colStatementAmount`). Konstanta kedua yang
 * berbunyi identik hanya menciptakan dua tempat yang bisa berbeda bunyi besok
 * (#276), jadi ia dipakai ULANG.
 */
export const INCOME_STATEMENT_COLUMNS = BALANCE_SHEET_COLUMNS;
export type IncomeStatementColumnId = BalanceSheetColumnId;
export const INCOME_STATEMENT_HEADERS = BALANCE_SHEET_HEADERS;

/**
 * Berapa baris terakhir `incomeStatementLayout()` yang merupakan KAKI laporan.
 * Satu: hasil periode berjalan. Ia SELALU ada — sebuah laporan laba/rugi tanpa
 * baris hasil bukan laporan laba/rugi — jadi tidak ada cabang di sini, berbeda
 * dari Neraca Saldo yang kakinya boleh kosong.
 */
export const INCOME_STATEMENT_FOOT_ROWS = 1;

/**
 * Badan dan kaki, dipisah dengan satu aturan alih-alih tiga. Di layar kaki
 * menjadi prop `summary`, di cetakan `foot` autoTable, di lembar sebar baris
 * terakhir — tempat yang berbeda, isi yang sama.
 */
export function splitIncomeStatementRows(rows: readonly IncomeStatementLayoutRow[]): {
  body: IncomeStatementLayoutRow[];
  foot: IncomeStatementLayoutRow[];
} {
  return {
    body: rows.slice(0, -INCOME_STATEMENT_FOOT_ROWS),
    foot: rows.slice(-INCOME_STATEMENT_FOOT_ROWS),
  };
}

/**
 * Seluruh baris Laba/Rugi, dalam urutan kanoniknya, dengan angkanya sudah
 * teratasi. Yang tersisa bagi tiap permukaan hanyalah MENGGAMBAR baris — tidak
 * ada satu pun keputusan bentuk di luar fungsi ini.
 *
 * Urutannya ADALAH laporannya (issue #123): Penjualan − HPP = Laba Kotor,
 * − Beban Operasional = Laba Usaha, ± lain-lain = Laba Bersih. Menjumlahkan HPP
 * dan gaji ke dalam satu "Beban" menghapus marjin kotor — angka pertama yang
 * dibaca perusahaan dagang.
 */
export function incomeStatementLayout(
  statement: IncomeStatementShape,
  labels: IncomeStatementLabels = INCOME_STATEMENT_PRINT_LABELS
): IncomeStatementLayoutRow[] {
  const bands = incomeStatementBands(statement);
  const rows: IncomeStatementLayoutRow[] = [];

  const section = (
    id: IncomeStatementSectionId,
    title: string,
    band: IncomeStatementSectionShape
  ) => {
    rows.push({ kind: "section", section: id, label: title, amount: null });
    if (band.lines.length === 0) {
      rows.push({ kind: "empty", section: id, label: labels.empty, amount: null });
    } else {
      for (const l of band.lines) {
        rows.push({
          kind: "line",
          section: id,
          label: `${l.code}  ${l.name}`.trim(),
          code: l.code,
          name: l.name,
          amount: l.amount,
        });
      }
    }
    rows.push({
      kind: "subtotal",
      section: id,
      label: labels.sectionTotal(title),
      amount: band.total,
    });
  };

  section("sales", labels.sales, statement.sales);
  if (bands.showCogs) section("cogs", labels.cogs, statement.cogs);
  if (bands.showGrossProfit) {
    const pct = grossMarginPct(statement.grossProfit, statement.sales.total);
    rows.push({
      kind: "step",
      step: "grossProfit",
      label: labels.grossProfit,
      note: pct === null ? undefined : labels.grossMargin(roundedMarginPct(pct)),
      amount: statement.grossProfit,
    });
  }
  section("operatingExpense", labels.operatingExpense, statement.operatingExpense);
  if (bands.showOperatingProfit) {
    rows.push({
      kind: "step",
      step: "operatingProfit",
      label: labels.operatingProfit,
      amount: statement.operatingProfit,
    });
  }
  if (bands.showOtherIncome) section("otherIncome", labels.otherIncome, statement.otherIncome);
  if (bands.showOtherExpense) section("otherExpense", labels.otherExpense, statement.otherExpense);

  rows.push({
    kind: "total",
    label: labels.netIncome,
    // Arah hasil sebagai anotasi, bukan sebagai label kedua — lihat keputusan 3.
    // `>= 0` supaya periode impas terbaca "Laba", sama seperti di layar sejak
    // #123: nol bukan kerugian.
    note: labels.result(statement.netIncome >= 0),
    amount: statement.netIncome,
  });

  return rows;
}

// ─── Kolom Riwayat Stok ──────────────────────────────────────────────────────

/**
 * Susunan kolom Riwayat Stok, dalam urutan kanoniknya.
 *
 * Ada di modul ini karena alasan yang sama dengan `incomeStatementLayout`:
 * layar, PDF, dan lembar sebar harus sepakat. Sebelumnya ketiganya menyusun
 * daftar kolomnya sendiri-sendiri — tiga salinan aturan `hasProcess` yang
 * kebetulan masih sama.
 */
export const STOCK_MOVEMENT_COLUMNS = [
  "name",
  "unit",
  "opening",
  "movedIn",
  "movedOut",
  "processed",
  "closing",
] as const;

export type StockMovementColumnId = (typeof STOCK_MOVEMENT_COLUMNS)[number];

/**
 * Judul kolom untuk DOKUMEN CETAK (PDF & lembar sebar) — tetap bahasa
 * Indonesia, seperti seluruh isi `lib/pdf`: berkas yang lepas dari layarnya
 * tidak membawa pilihan bahasa penggunanya. Layar memakai kamus.
 */
export const STOCK_MOVEMENT_HEADERS: Record<StockMovementColumnId, string> = {
  name: "Barang",
  unit: "Satuan",
  opening: "Saldo Awal",
  movedIn: "Masuk",
  movedOut: "Keluar",
  processed: "Diolah",
  closing: "Saldo Akhir",
};

/**
 * Kolom yang benar-benar dicetak, setelah dua penyaring yang urutannya penting:
 *
 * 1. **Isi laporan** — `Diolah` hanya ada bila periodenya memang punya mutasi
 *    olah. Ini bukan pilihan pengguna; kolom penuh tanda hubung bukan informasi.
 * 2. **Pilihan pengguna** (`visibleColumns` dari dialog parameter). Ia hanya
 *    boleh MENGURANGI: mencentang `Diolah` di periode tanpa mutasi olah tidak
 *    memunculkan kolom kosong.
 *
 * `name` tak pernah bisa dibuang — tabel angka tanpa nama barang tidak bisa
 * dibaca siapa pun, dan itu bukan laporan yang pengguna maksud.
 */
export function stockMovementColumns(report: {
  hasProcess: boolean;
  visibleColumns?: string[];
}): StockMovementColumnId[] {
  const available = STOCK_MOVEMENT_COLUMNS.filter(
    (id) => id !== "processed" || report.hasProcess
  );
  return selectColumns(available, report.visibleColumns, "name");
}

/**
 * Saring `available` dengan pilihan pengguna, mempertahankan urutan kanonik.
 *
 * Dua aturan yang berlaku untuk SETIAP laporan bertipe daftar: kolom `always`
 * tak pernah bisa dibuang (tabel angka tanpa kolom identitas tidak bisa dibaca
 * siapa pun), dan daftar kosong berarti "seluruhnya" — bukan "tidak satu pun",
 * yang hanya menghasilkan halaman kosong.
 */
export function selectColumns<T extends string>(
  available: readonly T[],
  visible: string[] | undefined,
  always: T
): T[] {
  if (!visible || visible.length === 0) return [...available];
  return available.filter((id) => id === always || visible.includes(id));
}

// ─── Kolom rekap per mitra (Penjualan per Pelanggan / Pembelian per Pemasok) ──

export const PARTY_RECAP_COLUMNS = ["party", "docCount", "gross", "returns", "net"] as const;

export type PartyRecapColumnId = (typeof PARTY_RECAP_COLUMNS)[number];

/**
 * Penjualan per Pelanggan & Pembelian per Pemasok adalah SATU bentuk laporan
 * dengan dua nama pihak. Ditulis ulang di sini alih-alih diimpor dari
 * `StatementPayload["kind"]`: modul ini tidak mengimpor apa pun (lihat kepala
 * berkas), dan `tsc` tetap menolak di titik `PARTY_RECAP_HEADERS[payload.kind]`
 * kalau keduanya berbeda — duplikasi yang dijaga tipe, bukan kebiasaan. Pola
 * yang sama dengan `AgingKind` dan `CashFlowCategoryId`.
 */
export type PartyRecapKind = "sales-by-customer" | "purchases-by-supplier";

/**
 * Judul kolom rekap mitra untuk DOKUMEN CETAK — bahasa Indonesia; layar memakai
 * kamus. Kolom pihak dan kolom kotornya berbeda per laporan, jadi tabelnya
 * berjenjang: satu himpunan judul utuh per laporan.
 *
 * ── Kenapa ia di SINI ───────────────────────────────────────────────────────
 * Sampai #315 ia tinggal di `pdf/statement-pdf.ts` dengan komentar yang
 * menyatakan "tidak ada kode produksi lain yang memakainya" — dan itu tidak
 * benar: `buildPartyRecapSheet()` di `report-export.ts` menyimpan salinannya
 * sendiri, huruf demi huruf. Keduanya identik karena kebetulan, bukan karena
 * ada yang memaksanya; penjaga #298 hanya menjangkau salinan PDF-nya, jadi
 * lembar sebarnya bisa bergeser tanpa suara, dan orang yang percaya komentar
 * itu akan menyunting satu tempat lalu mengirim Excel yang berbunyi lain.
 * Sekarang kedua lapisan ekspor mengindeks tabel ini dengan `payload.kind`.
 *
 * Yang TIDAK ikut pindah: lebar kolom (`WIDTHS` di `report-export.ts`). Itu
 * urusan lembar sebar, bukan urusan bunyi — PDF-nya tidak memakainya sama
 * sekali.
 */
export const PARTY_RECAP_HEADERS: Record<PartyRecapKind, Record<PartyRecapColumnId, string>> = {
  "sales-by-customer": {
    party: "Pelanggan",
    docCount: "Dokumen",
    gross: "Penjualan Kotor (IDR)",
    returns: "Retur (IDR)",
    net: "Bersih (IDR)",
  },
  "purchases-by-supplier": {
    party: "Pemasok",
    docCount: "Dokumen",
    gross: "Pembelian Kotor (IDR)",
    returns: "Retur (IDR)",
    net: "Bersih (IDR)",
  },
};

export function partyRecapColumns(report: { visibleColumns?: string[] }): PartyRecapColumnId[] {
  return selectColumns(PARTY_RECAP_COLUMNS, report.visibleColumns, "party");
}

// ─── Kolom Nilai Persediaan ──────────────────────────────────────────────────

export const STOCK_VALUE_COLUMNS = [
  "name",
  "unit",
  "currentStock",
  "unitCost",
  "stockValue",
] as const;

export type StockValueColumnId = (typeof STOCK_VALUE_COLUMNS)[number];

/** Judul kolom untuk DOKUMEN CETAK — bahasa Indonesia; layar memakai kamus. */
export const STOCK_VALUE_HEADERS: Record<StockValueColumnId, string> = {
  name: "Barang",
  unit: "Satuan",
  currentStock: "Saldo",
  unitCost: "Biaya/Unit (IDR)",
  stockValue: "Nilai (IDR)",
};

export function stockValueColumns(report: { visibleColumns?: string[] }): StockValueColumnId[] {
  return selectColumns(STOCK_VALUE_COLUMNS, report.visibleColumns, "name");
}

// ─── Kolom Laporan Kas & Bank ────────────────────────────────────────────────

export const CASH_BANK_COLUMNS = ["account", "opening", "net", "closing"] as const;

export type CashBankColumnId = (typeof CASH_BANK_COLUMNS)[number];

/** Judul kolom untuk DOKUMEN CETAK — bahasa Indonesia; layar memakai kamus. */
export const CASH_BANK_HEADERS: Record<CashBankColumnId, string> = {
  account: "Akun Kas & Bank",
  opening: "Saldo Awal (IDR)",
  net: "Perubahan (IDR)",
  closing: "Saldo Akhir (IDR)",
};

export function cashBankColumns(report: { visibleColumns?: string[] }): CashBankColumnId[] {
  return selectColumns(CASH_BANK_COLUMNS, report.visibleColumns, "account");
}

// ─── Kolom Umur Piutang / Umur Utang ─────────────────────────────────────────

export const AGING_COLUMNS = [
  "party",
  "documentNo",
  "date",
  "dueDate",
  "age",
  "status",
  "total",
  "outstanding",
] as const;

export type AgingColumnId = (typeof AGING_COLUMNS)[number];

/**
 * Umur Piutang & Umur Utang adalah SATU bentuk laporan dengan dua nama pihak.
 * Ditulis ulang di sini alih-alih diimpor dari `StatementPayload["kind"]`:
 * modul ini tidak mengimpor apa pun (lihat kepala berkas), dan `tsc` tetap
 * menolak di titik `agingHeaders(payload.kind)` kalau keduanya berbeda —
 * duplikasi yang dijaga tipe, bukan kebiasaan.
 */
export type AgingKind = "receivables" | "payables";

/**
 * Judul kolom pihak — SATU-SATUNYA judul yang berbeda antara kedua laporan.
 *
 * Ia tinggal di sini, bukan di lapisan ekspor, karena issue #310: sebelumnya
 * `AGING_HEADERS.party` berbunyi "Mitra" dan KEDUA permukaan menimpanya dengan
 * string sebarisnya sendiri sebelum menggambar. Bawaan yang selalu kalah adalah
 * penjaga palsu berbentuk konstanta — orang menyuntingnya, membangun, dan
 * menemukan kolomnya tidak berubah. Sekarang tidak ada bawaan: judulnya dipilih
 * di sini, sekali, dan `agingHeaders()` yang menyerahkannya utuh.
 */
export const AGING_PARTY_HEADERS: Record<AgingKind, string> = {
  receivables: "Pelanggan",
  payables: "Pemasok",
};

/**
 * Judul kolom untuk DOKUMEN CETAK — bahasa Indonesia; layar memakai kamus.
 *
 * TANPA kolom pihak dengan sengaja (#310): ia satu-satunya yang bergantung pada
 * laporannya, jadi ia bukan bawaan melainkan parameter. Tipenya yang memaksa —
 * pemanggil tidak bisa mengindeks `AGING_HEADERS["party"]`, ia harus lewat
 * `agingHeaders(kind)`.
 */
export const AGING_HEADERS: Record<Exclude<AgingColumnId, "party">, string> = {
  documentNo: "Dokumen",
  date: "Tanggal",
  dueDate: "Jatuh Tempo",
  age: "Umur",
  status: "Status",
  total: "Nilai Dokumen",
  outstanding: "Sisa (IDR)",
};

/**
 * SELURUH judul kolom Umur Piutang/Utang untuk satu laporan — satu-satunya
 * jalan ke judul kolom pihak, dan karena itu satu-satunya tempat "Pelanggan"
 * dan "Pemasok" ditentukan untuk kedua permukaan ekspor (#310).
 */
export function agingHeaders(kind: AgingKind): Record<AgingColumnId, string> {
  return { ...AGING_HEADERS, party: AGING_PARTY_HEADERS[kind] };
}

export function agingColumns(report: { visibleColumns?: string[] }): AgingColumnId[] {
  return selectColumns(AGING_COLUMNS, report.visibleColumns, "party");
}

// ─── Kolom Realisasi vs Anggaran ─────────────────────────────────────────────

export const BUDGET_COLUMNS = [
  "account",
  "budget",
  "actual",
  "variance",
  "variancePct",
  "status",
] as const;

export type BudgetColumnId = (typeof BUDGET_COLUMNS)[number];

/** Judul kolom untuk DOKUMEN CETAK — bahasa Indonesia; layar memakai kamus. */
export const BUDGET_HEADERS: Record<BudgetColumnId, string> = {
  account: "Akun",
  budget: "Anggaran (IDR)",
  actual: "Realisasi (IDR)",
  variance: "Selisih (IDR)",
  variancePct: "Selisih %",
  status: "Keterangan",
};

export function budgetColumns(report: { visibleColumns?: string[] }): BudgetColumnId[] {
  return selectColumns(BUDGET_COLUMNS, report.visibleColumns, "account");
}
