/**
 * Kamus istilah — SATU sumber kebenaran untuk bahasa aplikasi (issue #1 & #21).
 *
 * Setiap entri memetakan tiga hal sekaligus:
 *   • `label`    — bahasa tugas: kata yang dipakai staf non-akuntan sehari-hari
 *                  ("Tagihan Penjualan"). Inilah yang tampil di menu, judul
 *                  halaman, tombol, dan kepala tabel.
 *   • `term`     — istilah akuntansi formal ("Faktur / Invoice"). Tetap ada agar
 *                  pengguna belajar kata bakunya, bukan disembunyikan.
 *   • `definisi` — penjelasan bahasa Indonesia sederhana (+ `contoh` konkret).
 *
 * Modul ini MURNI (tanpa React, Prisma, atau I/O) supaya dipakai bersama oleh:
 *   • `<TermTooltip>`  — label ramah + ikon "?" berisi definisi (issue #1)
 *   • halaman `/glossary` "Kamus Istilah" (issue #21)
 *   • tautan "Pelajari ini" dari layar rumit (issue #21)
 * Definisi ditulis SEKALI di sini; tooltip dan kamus hanya membacanya.
 *
 * Ini murni lapisan bahasa: tidak ada aturan akuntansi, angka, atau hak akses
 * yang ditentukan di file ini.
 */

export const TERM_CATEGORIES = [
  "penjualan",
  "pembelian",
  "kas",
  "stok",
  "laporan",
  "pajak",
  "umum",
] as const;

export type TermCategory = (typeof TERM_CATEGORIES)[number];

export const TERM_CATEGORY_LABELS: Record<TermCategory, string> = {
  penjualan: "Penjualan",
  pembelian: "Pembelian",
  kas: "Kas & Bank",
  stok: "Stok & Aset",
  laporan: "Laporan & Pembukuan",
  pajak: "Pajak",
  umum: "Umum",
};

export interface TermEntry {
  /** Kunci stabil (snake_case) — juga dipakai sebagai anchor di /glossary. */
  key: string;
  /** Label bahasa tugas — yang dilihat pengguna awam. */
  label: string;
  /** Istilah akuntansi formal (boleh menyertakan padanan Inggrisnya). */
  term: string;
  /** Definisi bahasa Indonesia sederhana, 1–3 kalimat. */
  definisi: string;
  /** Contoh konkret dari dunia kerja sehari-hari. */
  contoh?: string;
  kategori: TermCategory;
  /** Kata lain yang mungkin diketik pengguna saat mencari. */
  alias?: string[];
  /** Halaman aplikasi tempat istilah ini dipakai (opsional). */
  href?: string;
}

export const TERMS = {
  // ─── Penjualan ───
  kontrak: {
    key: "kontrak",
    label: "Kontrak",
    term: "Kontrak Penjualan (Sales Contract)",
    definisi:
      "Kesepakatan tertulis dengan pembeli sebelum barang dikirim: barang apa, berapa banyak, harga, mata uang, dan kapan dikirim. Kontrak belum berarti uang sudah masuk.",
    contoh:
      "Kontrak SC-2026-014: jual 100 ton kopi ke pembeli di Tiongkok, USD 2.000/ton, kirim Maret.",
    kategori: "penjualan",
    alias: ["sales contract", "perjanjian"],
    href: "/contracts",
  },
  faktur: {
    key: "faktur",
    label: "Tagihan Penjualan",
    term: "Faktur (Invoice)",
    definisi:
      "Surat tagihan resmi ke pelanggan. Isinya barang yang dijual, jumlahnya, dan berapa yang harus dibayar beserta batas waktunya. Begitu faktur terbit, penjualan tercatat sebagai pendapatan walau uangnya belum diterima.",
    contoh:
      "Faktur INV-0021 menagih Rp 250.000.000 ke PT Maju, jatuh tempo 30 hari setelah tanggal faktur.",
    kategori: "penjualan",
    alias: ["invoice", "nota", "tagihan"],
    href: "/invoices",
  },
  surat_jalan: {
    key: "surat_jalan",
    label: "Surat Jalan",
    term: "Surat Jalan (Delivery Order / DO)",
    definisi:
      "Dokumen yang ikut bersama barang ketika dikirim, sebagai bukti barang keluar gudang dan diterima pembeli. Saat surat jalan diterbitkan, stok barang berkurang.",
    contoh:
      "Surat Jalan SJ-0007 mengantar 20 ton kopi ke gudang pembeli; stok kopi otomatis berkurang 20 ton.",
    kategori: "penjualan",
    alias: ["delivery order", "do", "pengiriman"],
    href: "/delivery-orders",
  },
  piutang: {
    key: "piutang",
    label: "Pelanggan Belum Bayar",
    term: "Piutang Usaha (Account Receivable / AR)",
    definisi:
      "Uang yang masih ditunggu dari pelanggan atas barang yang sudah dikirim atau faktur yang sudah terbit. Piutang adalah hak Anda — bukan uang tunai, tapi tetap kekayaan perusahaan.",
    contoh:
      "Dari faktur Rp 250 juta, pelanggan baru bayar Rp 100 juta. Sisa Rp 150 juta adalah piutang.",
    kategori: "penjualan",
    alias: ["ar", "receivable", "belum bayar"],
    href: "/receivables",
  },
  umur_piutang: {
    key: "umur_piutang",
    label: "Umur Tagihan",
    term: "Umur Piutang (Aging)",
    definisi:
      "Pengelompokan tagihan berdasarkan berapa lama sudah lewat jatuh tempo (mis. 1–30 hari, 31–60 hari). Makin tua umurnya, makin besar risiko tagihan itu sulit tertagih.",
    contoh:
      "Tagihan PT Maju masuk kelompok 61–90 hari, artinya sudah lebih dari dua bulan lewat jatuh tempo.",
    kategori: "penjualan",
    alias: ["aging", "tunggakan"],
    href: "/receivables",
  },
  retur: {
    key: "retur",
    label: "Barang Dikembalikan",
    term: "Retur (Return)",
    definisi:
      "Barang yang dikembalikan — oleh pelanggan kepada kita (retur penjualan) atau oleh kita kepada pemasok (retur pembelian). Retur mengurangi nilai penjualan/pembelian dan mengembalikan barangnya ke catatan stok.",
    contoh: "Pelanggan mengembalikan 2 ton karena mutu tidak sesuai; nilai tagihannya dikurangi.",
    kategori: "penjualan",
    alias: ["return", "pengembalian barang"],
    href: "/returns",
  },
  pelanggan: {
    key: "pelanggan",
    label: "Pelanggan",
    term: "Pelanggan (Customer)",
    definisi: "Pihak yang membeli barang atau jasa dari perusahaan dan berutang pembayaran kepada kita.",
    kategori: "penjualan",
    alias: ["customer", "pembeli", "buyer"],
    href: "/customers",
  },
  penerima_barang: {
    key: "penerima_barang",
    label: "Penerima Barang",
    term: "Consignee",
    definisi:
      "Pihak yang menerima barang di tujuan pengiriman. Sering berbeda dengan pembeli — pembeli yang membayar, penerima barang yang menerima muatannya.",
    contoh: "Pembeli di Shanghai, tapi barang diterima gudang mitranya di Ningbo.",
    kategori: "penjualan",
    alias: ["consignee", "penerima kiriman"],
    href: "/consignees",
  },

  // ─── Pembelian ───
  pembelian: {
    key: "pembelian",
    label: "Catat Pembelian",
    term: "Pembelian (Purchase)",
    definisi:
      "Pencatatan barang atau jasa yang dibeli dari pemasok. Jika belum dibayar, pembelian itu menjadi tagihan yang harus dibayar (utang).",
    contoh: "Beli 50 ton kopi dari pemasok senilai Rp 400 juta dengan tempo bayar 14 hari.",
    kategori: "pembelian",
    alias: ["purchase", "beli"],
    href: "/suppliers",
  },
  utang: {
    key: "utang",
    label: "Tagihan yang Harus Dibayar",
    term: "Utang Usaha (Account Payable / AP)",
    definisi:
      "Uang yang belum Anda bayarkan ke pemasok atas barang atau jasa yang sudah diterima. Kebalikan dari piutang.",
    contoh: "Barang sudah masuk gudang, faktur pemasok Rp 400 juta belum dibayar — itu utang usaha.",
    kategori: "pembelian",
    alias: ["ap", "payable", "hutang"],
    href: "/payables",
  },
  pemasok: {
    key: "pemasok",
    label: "Pemasok",
    term: "Pemasok (Supplier / Vendor)",
    definisi: "Pihak tempat perusahaan membeli barang atau jasa. Pembelian dan pembayaran dicatat per pemasok.",
    kategori: "pembelian",
    alias: ["supplier", "vendor", "penjual"],
    href: "/suppliers",
  },
  uang_muka: {
    key: "uang_muka",
    label: "Uang Muka",
    term: "Uang Muka (Advance / Down Payment)",
    definisi:
      "Uang yang dibayar atau diterima lebih dulu sebelum barang diserahkan. Uang muka belum menjadi biaya atau pendapatan — statusnya menggantung sampai dipotongkan ke pembelian atau penjualan yang sesungguhnya.",
    contoh: "Bayar DP Rp 100 juta ke pemasok; saat barang datang, DP itu dipotongkan dari tagihannya.",
    kategori: "pembelian",
    alias: ["dp", "advance", "panjar"],
    href: "/advances",
  },

  // ─── Kas & Bank ───
  kas_bank: {
    key: "kas_bank",
    label: "Kas & Bank",
    term: "Kas dan Setara Kas (Cash & Bank)",
    definisi:
      "Uang tunai perusahaan dan saldo di rekening bank. Setiap uang yang benar-benar masuk atau keluar dicatat di sini.",
    contoh: "Pelanggan transfer Rp 100 juta ke rekening bank — saldo Kas & Bank bertambah.",
    kategori: "kas",
    alias: ["cash", "bank", "saldo"],
    href: "/finance",
  },
  kas_kecil: {
    key: "kas_kecil",
    label: "Kas Kecil",
    term: "Kas Kecil (Petty Cash)",
    definisi:
      "Uang tunai jumlah kecil yang disimpan di kantor untuk pengeluaran harian, misalnya ongkos kirim atau konsumsi rapat.",
    kategori: "kas",
    alias: ["petty cash", "kas besar"],
    href: "/finance",
  },
  rekonsiliasi_bank: {
    key: "rekonsiliasi_bank",
    label: "Cocokkan Rekening Koran",
    term: "Rekonsiliasi Bank (Bank Reconciliation)",
    definisi:
      "Membandingkan catatan kas di aplikasi dengan mutasi rekening koran dari bank, lalu mencari penyebab selisihnya. Tujuannya memastikan tidak ada transaksi yang terlewat atau tercatat dua kali.",
    contoh: "Saldo buku Rp 50 juta, rekening koran Rp 48 juta — selisih Rp 2 juta ternyata cek yang belum cair.",
    kategori: "kas",
    alias: ["rekonsiliasi", "rekening koran", "mutasi bank"],
    href: "/reconciliation",
  },
  kurs: {
    key: "kurs",
    label: "Kurs",
    term: "Kurs / Nilai Tukar (Exchange Rate)",
    definisi:
      "Nilai satu mata uang asing dalam Rupiah pada tanggal transaksi. Semua transaksi valas dicatat ulang ke Rupiah memakai kurs ini agar laporan tetap dalam satu satuan.",
    contoh: "Terima USD 10.000 dengan kurs 16.200 → tercatat Rp 162.000.000 di buku besar.",
    kategori: "kas",
    alias: ["valas", "exchange rate", "mata uang asing", "rate"],
  },
  lunas: {
    key: "lunas",
    label: "Lunas",
    term: "Pelunasan (Settlement)",
    definisi:
      "Status saat seluruh nilai tagihan sudah dibayar. \"Sebagian\" berarti baru dibayar sebagian dan masih ada sisa; \"Belum\" berarti belum ada pembayaran sama sekali.",
    kategori: "kas",
    alias: ["pelunasan", "settlement", "sebagian"],
  },

  // ─── Stok & Aset ───
  persediaan: {
    key: "persediaan",
    label: "Stok Barang",
    term: "Persediaan (Inventory)",
    definisi:
      "Barang dagangan yang dimiliki perusahaan dan siap dijual. Nilainya termasuk kekayaan perusahaan sampai barangnya terjual.",
    contoh: "Sisa 320 ton kopi di gudang adalah persediaan.",
    kategori: "stok",
    alias: ["inventory", "stok", "gudang"],
    href: "/inventory",
  },
  stok_opname: {
    key: "stok_opname",
    label: "Hitung Ulang Stok",
    term: "Stok Opname (Stock Take)",
    definisi:
      "Menghitung fisik barang di gudang lalu mencocokkannya dengan catatan aplikasi. Selisihnya dicatat sebagai penyesuaian agar angka sistem sama dengan kenyataan.",
    contoh: "Catatan 320 ton, hasil hitung 318 ton — selisih 2 ton dicatat sebagai penyesuaian.",
    kategori: "stok",
    alias: ["opname", "stock take", "hitung fisik"],
    href: "/inventory/opname",
  },
  hpp: {
    key: "hpp",
    label: "Modal Barang yang Terjual",
    term: "Harga Pokok Penjualan (HPP / COGS)",
    definisi:
      "Biaya perolehan barang yang benar-benar sudah terjual. Penjualan dikurangi HPP menghasilkan laba kotor.",
    contoh: "Jual 10 ton seharga Rp 30 juta; modal 10 ton itu Rp 22 juta → HPP Rp 22 juta, laba kotor Rp 8 juta.",
    kategori: "stok",
    alias: ["cogs", "harga pokok", "modal barang"],
  },
  aset_tetap: {
    key: "aset_tetap",
    label: "Barang Milik Perusahaan",
    term: "Aset Tetap (Fixed Asset)",
    definisi:
      "Barang bernilai besar yang dipakai bertahun-tahun untuk operasional dan tidak untuk dijual, seperti kendaraan, mesin, atau bangunan.",
    contoh: "Truk pengangkut dan forklift gudang adalah aset tetap.",
    kategori: "stok",
    alias: ["fixed asset", "inventaris", "aktiva tetap"],
    href: "/fixed-assets",
  },
  penyusutan: {
    key: "penyusutan",
    label: "Penurunan Nilai Barang",
    term: "Penyusutan (Depresiasi / Depreciation)",
    definisi:
      "Pembebanan harga aset tetap sedikit demi sedikit selama masa pakainya, karena barangnya makin tua dan makin turun nilainya. Dicatat sebagai biaya tiap bulan tanpa uang keluar.",
    contoh: "Truk Rp 600 juta dengan masa pakai 10 tahun disusutkan Rp 5 juta setiap bulan.",
    kategori: "stok",
    alias: ["depresiasi", "depreciation", "susut"],
    href: "/fixed-assets",
  },

  // ─── Laporan & Pembukuan ───
  debit: {
    key: "debit",
    label: "Sisi Kiri (Uang Masuk ke Akun)",
    term: "Debit",
    definisi:
      "Sisi kiri pencatatan. Untuk kas/bank, debit berarti saldo bertambah. Setiap transaksi selalu punya sisi debit dan sisi kredit dengan nilai yang sama besar.",
    contoh: "Terima pembayaran pelanggan: Kas didebit Rp 100 juta, Piutang dikredit Rp 100 juta.",
    kategori: "laporan",
    alias: ["dr"],
  },
  kredit: {
    key: "kredit",
    label: "Sisi Kanan (Uang Keluar dari Akun)",
    term: "Kredit",
    definisi:
      "Sisi kanan pencatatan. Untuk kas/bank, kredit berarti saldo berkurang. Nilai kredit selalu sama besar dengan nilai debit pada transaksi yang sama.",
    contoh: "Bayar listrik: Beban Listrik didebit, Kas dikredit dengan nilai yang sama.",
    kategori: "laporan",
    alias: ["cr"],
  },
  jurnal: {
    key: "jurnal",
    label: "Catatan Transaksi",
    term: "Jurnal Umum (General Journal)",
    definisi:
      "Buku catatan urut tanggal dari semua transaksi, lengkap dengan sisi debit dan kreditnya. Aplikasi membuat jurnal ini otomatis setiap kali Anda menyimpan transaksi.",
    kategori: "laporan",
    alias: ["journal", "jurnal umum"],
    href: "/journal",
  },
  buku_besar: {
    key: "buku_besar",
    label: "Rincian per Akun",
    term: "Buku Besar (General Ledger)",
    definisi:
      "Kumpulan seluruh jurnal yang dikelompokkan per akun, sehingga terlihat riwayat dan saldo akhir tiap akun.",
    contoh: "Buku besar akun Kas Bank memperlihatkan semua uang masuk/keluar beserta saldo berjalannya.",
    kategori: "laporan",
    alias: ["ledger", "general ledger"],
    href: "/ledger",
  },
  akun_perkiraan: {
    key: "akun_perkiraan",
    label: "Daftar Akun",
    term: "Akun Perkiraan / Bagan Akun (Chart of Accounts, COA)",
    definisi:
      "Daftar semua \"laci\" tempat transaksi dikelompokkan — misalnya Kas Bank, Piutang Usaha, Beban Listrik. Setiap akun punya kode dan nama.",
    contoh: "1101 Kas Bank · 1201 Piutang Usaha · 5101 Beban Gaji.",
    kategori: "laporan",
    alias: ["coa", "chart of accounts", "kode akun"],
    href: "/accounts",
  },
  posting: {
    key: "posting",
    label: "Membukukan",
    term: "Posting (Pembukuan Jurnal)",
    definisi:
      "Proses memindahkan transaksi yang Anda simpan ke jurnal dan buku besar. Di aplikasi ini posting berjalan otomatis, jadi angka laporan selalu berasal dari transaksi yang tersimpan.",
    kategori: "laporan",
    alias: ["membukukan", "post"],
  },
  laba_rugi: {
    key: "laba_rugi",
    label: "Untung atau Rugi",
    term: "Laporan Laba Rugi (Income Statement / Profit & Loss)",
    definisi:
      "Laporan yang menghitung seluruh pendapatan dikurangi seluruh biaya dalam satu periode. Hasil positif berarti untung, negatif berarti rugi.",
    contoh: "Bulan ini pendapatan Rp 900 juta, biaya Rp 750 juta → untung Rp 150 juta.",
    kategori: "laporan",
    alias: ["income statement", "profit loss", "p&l", "rugi laba"],
    href: "/reports/income-statement",
  },
  neraca: {
    key: "neraca",
    label: "Posisi Kekayaan & Utang",
    term: "Neraca (Balance Sheet)",
    definisi:
      "Potret keuangan pada satu tanggal: apa yang dimiliki (harta), apa yang masih diutangi (kewajiban), dan sisanya milik pemilik (modal). Harta selalu sama dengan kewajiban ditambah modal.",
    kategori: "laporan",
    alias: ["balance sheet", "posisi keuangan"],
    href: "/reports/balance-sheet",
  },
  arus_kas: {
    key: "arus_kas",
    label: "Uang Masuk & Keluar",
    term: "Laporan Arus Kas (Cash Flow Statement)",
    definisi:
      "Laporan pergerakan uang tunai yang benar-benar masuk dan keluar dalam satu periode. Berbeda dari laba: perusahaan bisa untung tapi kas menipis karena pelanggan belum bayar.",
    kategori: "laporan",
    alias: ["cash flow", "arus uang"],
    href: "/reports/cash-flow",
  },
  neraca_saldo: {
    key: "neraca_saldo",
    label: "Cek Keseimbangan Buku",
    term: "Neraca Saldo (Trial Balance)",
    definisi:
      "Daftar saldo semua akun untuk memastikan jumlah debit sama dengan jumlah kredit. Kalau tidak seimbang, ada pencatatan yang keliru.",
    kategori: "laporan",
    alias: ["trial balance"],
    href: "/reports/trial-balance",
  },
  anggaran: {
    key: "anggaran",
    label: "Rencana & Target",
    term: "Anggaran (Budget)",
    definisi:
      "Rencana pendapatan dan biaya untuk periode ke depan, dipakai sebagai pembanding terhadap hasil sebenarnya (realisasi). Selisihnya menunjukkan mana yang meleset dari rencana.",
    contoh: "Anggaran biaya gaji Juli Rp 200 juta, realisasi Rp 214 juta → lebih besar Rp 14 juta dari rencana.",
    kategori: "laporan",
    alias: ["budget", "target", "realisasi"],
    href: "/budget",
  },
  saldo_awal: {
    key: "saldo_awal",
    label: "Saldo Awal",
    term: "Saldo Awal (Opening Balance)",
    definisi:
      "Kondisi keuangan pada hari pertama Anda memakai aplikasi ini: saldo kas, piutang, utang, dan stok yang sudah ada sebelumnya. Diisi sekali saat awal pemakaian.",
    kategori: "umum",
    alias: ["opening balance", "setup awal"],
    href: "/setup",
  },
  tutup_periode: {
    key: "tutup_periode",
    label: "Kunci Bulan",
    term: "Tutup Periode (Period Close)",
    definisi:
      "Mengunci satu bulan setelah laporannya final, agar transaksi lama tidak bisa diubah lagi tanpa sengaja. Setelah dikunci, koreksi harus dilakukan lewat transaksi baru.",
    kategori: "umum",
    alias: ["period close", "kunci periode", "tutup buku"],
    href: "/periods",
  },
  jatuh_tempo: {
    key: "jatuh_tempo",
    label: "Batas Waktu Bayar",
    term: "Jatuh Tempo (Due Date)",
    definisi:
      "Tanggal terakhir sebuah tagihan harus dibayar. Lewat tanggal itu, tagihan disebut menunggak dan ditandai merah.",
    contoh: "Faktur 1 Juli dengan tempo 30 hari jatuh tempo pada 31 Juli.",
    kategori: "umum",
    alias: ["due date", "tempo"],
  },

  // ─── Pajak ───
  ppn: {
    key: "ppn",
    label: "Pajak Penjualan",
    term: "PPN (Pajak Pertambahan Nilai)",
    definisi:
      "Pajak yang ditambahkan pada penjualan (PPN Keluaran) dan yang dibayar saat pembelian (PPN Masukan). Selisih keduanya yang disetor ke negara — PPN bukan pendapatan perusahaan.",
    contoh: "Jual Rp 100 juta + PPN 11% → pelanggan membayar Rp 111 juta, Rp 11 juta-nya milik negara.",
    kategori: "pajak",
    alias: ["vat", "pajak pertambahan nilai", "ppn keluaran", "ppn masukan"],
  },
  efaktur: {
    key: "efaktur",
    label: "Ekspor e-Faktur",
    term: "e-Faktur / CTAS (DJP)",
    definisi:
      "Berkas faktur pajak berformat resmi Direktorat Jenderal Pajak yang diunggah ke sistem pajak. Aplikasi menyiapkan berkasnya dari faktur yang sudah tercatat.",
    kategori: "pajak",
    alias: ["e-faktur", "ctas", "djp", "faktur pajak"],
    href: "/tax/efaktur",
  },
  npwp: {
    key: "npwp",
    label: "Nomor Pajak",
    term: "NPWP (Nomor Pokok Wajib Pajak)",
    definisi:
      "Nomor identitas pajak perusahaan atau perorangan. Wajib dicantumkan pada faktur pajak penjual maupun pembeli.",
    kategori: "pajak",
    alias: ["npwp", "nomor pokok wajib pajak"],
  },
} satisfies Record<string, TermEntry>;

export type TermKey = keyof typeof TERMS;

/** Semua istilah, urut sesuai definisi di atas. */
export const TERM_LIST: TermEntry[] = Object.values(TERMS);

/** Ambil satu entri; `undefined` bila kunci tidak dikenal (aman untuk data dinamis). */
export function getTerm(key: string): TermEntry | undefined {
  return (TERMS as Record<string, TermEntry>)[key];
}

/** Label bahasa tugas untuk sebuah kunci; jatuh kembali ke kuncinya bila tak dikenal. */
export function labelOf(key: string): string {
  return getTerm(key)?.label ?? key;
}

/** Istilah formal untuk sebuah kunci; jatuh kembali ke labelnya. */
export function termOf(key: string): string {
  const entry = getTerm(key);
  return entry?.term ?? labelOf(key);
}

/** Id anchor entri di halaman Kamus Istilah. */
export function termAnchorId(key: string): string {
  return `istilah-${key}`;
}

export const GLOSSARY_PATH = "/glossary";

/** Tautan langsung ke satu entri kamus (dipakai "Pelajari ini"). */
export function glossaryHref(key: string): string {
  return `${GLOSSARY_PATH}#${termAnchorId(key)}`;
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

/**
 * Pencarian sederhana untuk halaman kamus: cocokkan label, istilah formal,
 * definisi, contoh, dan alias. Query kosong mengembalikan semua entri.
 */
export function searchTerms(query: string, kategori?: TermCategory): TermEntry[] {
  const q = normalize(query);
  return TERM_LIST.filter((entry) => {
    if (kategori && entry.kategori !== kategori) return false;
    if (!q) return true;
    const haystack = [
      entry.key.replace(/_/g, " "),
      entry.label,
      entry.term,
      entry.definisi,
      entry.contoh ?? "",
      ...(entry.alias ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export interface TermGroup {
  kategori: TermCategory;
  label: string;
  terms: TermEntry[];
}

/** Istilah dikelompokkan per kategori (kategori kosong dibuang). */
export function termsByCategory(entries: TermEntry[] = TERM_LIST): TermGroup[] {
  return TERM_CATEGORIES.map((kategori) => ({
    kategori,
    label: TERM_CATEGORY_LABELS[kategori],
    terms: entries.filter((e) => e.kategori === kategori),
  })).filter((group) => group.terms.length > 0);
}
