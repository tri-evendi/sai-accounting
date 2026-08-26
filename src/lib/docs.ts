/**
 * Dokumentasi sistem (`/docs`) — REGISTRI MURNI (issue #300).
 *
 * ══ Lima keputusan, ditulis sebelum berkas pertama ═════════════════════════
 *
 * 1. **PUBLIK.** `/docs` terbaca tanpa sesi. Sebagian pertanyaan justru lahir
 *    saat orang TIDAK BISA masuk ("paket mana yang punya multi-PT", "kenapa
 *    akun saya ditolak"), dan halaman berpenjaga sesi tidak pernah menjawabnya.
 *    Konsekuensinya dinyatakan, bukan disembunyikan: rute ini terdaftar di
 *    `isPublicPath` (`src/proxy.ts`) DAN di `tests/authz-coverage.test.ts`
 *    sebagai grup rute publik dengan describe-nya sendiri — bukan lolos karena
 *    tidak ada yang menelusurinya. Tautan kontekstual dari dalam aplikasi
 *    (menu Bantuan) menuju jangkar yang SAMA; tidak ada permukaan kedua.
 *
 * 2. **PERMUKAAN KETIGA.** Bukan pemasaran, bukan meja kerja. Aturannya di
 *    MASTER.md §Dokumentasi; mekanismenya: dokumentasi TIDAK mengimpor apa pun
 *    dari `components/landing/**` (sudah ditolak `tests/landing-boundary.test.ts`
 *    tanpa satu baris pun ditambahkan di sana) dan TIDAK mengimpor chrome app
 *    internal (ditolak `tests/docs.test.ts`, sisi yang belum dijaga siapa pun).
 *
 * 3. **BAHASA INDONESIA, dan pilihannya TERLIHAT.** Prosa di berkas ini bukan
 *    label. Label adalah satu kata yang menamai sesuatu yang layarnya sudah
 *    render; prosa dokumentasi adalah karangan yang harus DITULIS ULANG — bukan
 *    diterjemahkan — setiap kali mesinnya berubah. 40 halaman × 3 bahasa adalah
 *    utang yang jatuh tempo pada setiap PR yang mengubah perilaku. Karena itu
 *    prosa hidup di sini, dalam bahasa sumber, TANPA kunci kamus: kamus repo
 *    ini menuntut ketiga bahasa terisi (`tsc` + `tests/i18n.test.ts` menolak
 *    nilai yang sama dengan bahasa Indonesia), jadi menaruh prosa di sana
 *    berarti menjanjikan tiga bahasa hari ini juga.
 *
 *    Yang TIDAK dilakukan: membiarkannya terbaca sebagai terjemahan yang
 *    kebetulan hilang. Kerangka halaman (judul, nama cabang, kepala tabel)
 *    tetap trilingual lewat kamus `docs.*`, dan pembaca ber-`en`/`zh` mendapat
 *    pemberitahuan DALAM BAHASANYA SENDIRI bahwa isinya baru ada dalam bahasa
 *    Indonesia. Bandingkan #278, yang memutuskan hal serupa untuk ekspor.
 *
 * 4. **PERAN & IZIN DIBANGKITKAN, bukan disalin tangan.** Blok `matriks-izin`
 *    di bawah tidak memuat satu pun nama peran: isinya dibaca dari
 *    `PERMISSION_ROLES` saat render. Menambah izin di `authz.ts` mengubah
 *    halamannya tanpa dokumen ini disunting.
 *
 *    ⚠ Dan halaman itu WAJIB menyebut dirinya BAWAAN. Dua lapis membuat tabel
 *    apa pun tidak pernah menjadi kebenaran tetap: matriks EFEKTIF = bawaan +
 *    `role_permission_overrides` per tenant (#73), dan peran kini DATA (tabel
 *    `roles`) sehingga Direktur Utama bisa membuat peran yang belum ada saat
 *    kalimat ini ditulis. Permukaan publik TIDAK BISA membaca keduanya — tidak
 *    ada konteks perusahaan tanpa sesi, dan menebaknya berarti melanggar aturan
 *    pertama docs/MULTI-COMPANY.md. Jadi yang ditampilkan adalah bawaan,
 *    dinyatakan sebagai bawaan, dengan penunjuk ke `/permissions` di dalam
 *    aplikasi tempat matriks efektif perusahaan itu sendiri terbaca.
 *
 * 5. **KENAPA MESINNYA BEGITU, bukan langkah-demi-langkah.** Dokumentasi tugas
 *    menua bersama tombolnya; alasan tidak. Tanpa tangkapan layar.
 *
 * ══ Kenapa MURNI ═══════════════════════════════════════════════════════════
 * Tanpa React, Prisma, atau `next/*` — persis seperti `lib/nav.ts`,
 * `lib/labels.ts`, dan `lib/report-catalog.ts`. Itu yang membuat penjaga
 * kelengkapan bisa membandingkan registri ini dengan `NAV_GROUPS` tanpa
 * merender apa pun, dan yang membuat `src/proxy.ts` (runtime Edge) boleh
 * memanggil `isDocsPath`.
 *
 * ══ Kenapa PROSANYA tidak di sini ══════════════════════════════════════════
 * Berkas ini dibaca juga oleh KLIEN — menu Bantuan memutuskan tautan
 * kontekstualnya dari `usePathname()`, jadi apa pun yang berdiri di sini ikut
 * ke bundel peramban. Daftar isi (sepuluh judul + jalur navigasinya) berukuran
 * beberapa ratus bait; prosanya puluhan kilobait, dan tak satu kata pun dari
 * prosa itu dibutuhkan untuk memutuskan sebuah tautan. Karena itu isinya hidup
 * di `lib/docs-content.ts`, yang hanya diimpor halaman servernya.
 */

import { appPath } from "@/lib/tenant-routes";

/** Akar permukaan dokumentasi. Tidak pernah ditulis harfiah di tempat lain. */
export const DOCS_ROOT = "/docs";

/** Alamat satu halaman dokumen. */
export function docsPath(slug: string): string {
  return `${DOCS_ROOT}/${slug}`;
}

/**
 * Apakah alamat ini milik permukaan dokumentasi?
 *
 * Dipakai `src/proxy.ts` untuk melepaskan seluruh subpohon dari pemeriksaan
 * sesi. Sengaja SATU fungsi murni dan bukan `pathname.startsWith("/docs")`
 * yang diketik ulang di proxy: yang diketik ulang akan berbeda, dan bentuk
 * `startsWith("/docs")` telanjang juga melepaskan `/docsx` — sebuah rute yang
 * belum ada hari ini dan yang lahirnya tidak akan mengingatkan siapa pun.
 */
export function isDocsPath(pathname: string): boolean {
  return pathname === DOCS_ROOT || pathname.startsWith(`${DOCS_ROOT}/`);
}

/**
 * Dua pembaca, dan mereka tidak saling menggantikan (issue #300).
 *
 * Menyatukan keduanya menjadi satu daftar isi adalah cara termudah membuat
 * dokumentasi yang tak terpakai: pembaca "pelanggan" tidak pernah membuka
 * jurnal, pembaca "pengguna" tidak bisa mengganti paket.
 */
export const DOC_BRANCHES = ["pelanggan", "pengguna"] as const;
export type DocBranch = (typeof DOC_BRANCHES)[number];

export interface DocMeta {
  /** Segmen URL — `/docs/<slug>`. Stabil; menggantinya mematikan tautan. */
  slug: string;
  /** Judul halaman, bahasa tugas. */
  judul: string;
  /** Satu kalimat di daftar isi: pertanyaan apa yang dijawab halaman ini. */
  ringkas: string;
  cabang: DocBranch;
  /**
   * Item navigasi (`lib/nav.ts`) yang dijelaskan halaman ini — jalur LAMA,
   * bentuk yang sama dengan `NavItem.href`.
   *
   * Inilah yang membuat penjaga kelengkapan mungkin: modul baru di navigasi
   * yang tidak disebut satu halaman pun, dan tidak didaftar sebagai
   * pengecualian beralasan, membuat `tests/docs.test.ts` MERAH.
   */
  navHrefs: readonly string[];
}

/**
 * Jangkar sub-judul — huruf kecil, spasi jadi tanda hubung, sisanya dibuang.
 *
 * Diturunkan dari judulnya, bukan ditulis terpisah: dua sumber untuk satu
 * jangkar berarti tautan yang terlihat benar dan mendarat di puncak halaman.
 */
export function docAnchor(judul: string): string {
  return judul
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Jangkar bagian cabang di daftar isi (`/docs#cabang-pengguna`).
 *
 * Diturunkan dari KUNCI cabang, bukan dari judulnya yang diterjemahkan. Kalau
 * ia diturunkan dari judul, jangkarnya ikut berganti bahasa — `#untuk-pengguna`
 * bagi pembaca `id`, `#for-everyday-users` bagi pembaca `en` — dan setiap
 * tautan yang pernah disalin seseorang mendarat di puncak halaman pada bahasa
 * yang lain. Kerangka halaman ini memang trilingual (keputusan 3); alamatnya
 * tidak boleh ikut.
 */
export function docBranchAnchor(cabang: DocBranch): string {
  return `cabang-${cabang}`;
}

/* ════════════════════════════════════════════════════════════════════════════
 * ISI — bahasa Indonesia, keputusan 3.
 *
 * Aturan menulis di sini, dan ia keputusan 5 dalam bentuk yang bisa ditegakkan
 * saat menulis: setiap halaman menjawab "kenapa mesinnya begitu" LEBIH DULU.
 * Urutan tombol boleh disebut, tetapi tidak pernah menjadi tulang punggungnya —
 * tombol berpindah tiap rilis, alasan tidak.
 * ══════════════════════════════════════════════════════════════════════════ */

const MESIN_AKUNTANSI = {
  slug: "mesin-akuntansi",
  judul: "Kenapa setiap catatan punya dua sisi",
  ringkas:
    "Apa yang sebenarnya terjadi saat Anda menekan Simpan, dan kenapa jurnal tidak pernah dihapus.",
  cabang: "pengguna",
  navHrefs: ["/journal", "/ledger", "/accounts"],
} as const satisfies DocMeta;

const PERIODE = {
  slug: "periode-terkunci",
  judul: "Kenapa bulan yang sudah selesai dikunci",
  ringkas:
    "Apa yang berubah saat sebuah periode ditutup, dan bagaimana mengoreksi sesuatu sesudahnya.",
  cabang: "pengguna",
  navHrefs: ["/periods"],
} as const satisfies DocMeta;

const PERSETUJUAN = {
  slug: "persetujuan",
  judul: "Kenapa sebagian dokumen menunggu orang lain",
  ringkas:
    "Bagaimana ambang persetujuan bekerja, dan kenapa antreannya menahan jurnal — bukan menahan formulir.",
  cabang: "pengguna",
  navHrefs: ["/approvals", "/approvals/rules"],
} as const satisfies DocMeta;

const PENJUALAN = {
  slug: "alur-penjualan",
  judul: "Kontrak, tagihan, surat jalan — kenapa tiga dokumen",
  ringkas:
    "Kenapa penjualan tidak selesai dalam satu formulir, dan pada langkah mana uang serta stok benar-benar bergerak.",
  cabang: "pengguna",
  navHrefs: [
    "/sales/new",
    "/contracts",
    // issue #469 — templat berulang menerbitkan FAKTUR, jadi ia bagian dari
    // alur ini, bukan modul yang berdiri sendiri.
    "/recurring",
    "/invoices",
    "/delivery-orders",
    "/receivables",
    "/returns",
  ],
} as const satisfies DocMeta;

const STOK = {
  slug: "stok",
  judul: "Kenapa stok tidak bisa diketik langsung",
  ringkas:
    "Kenapa setiap perubahan stok butuh dokumen, dan apa yang sebenarnya dilakukan hitung ulang.",
  cabang: "pengguna",
  navHrefs: ["/inventory", "/inventory/movement", "/inventory/update", "/inventory/opname"],
} as const satisfies DocMeta;

const BIAYA_IMPOR = {
  slug: "biaya-impor",
  judul: "Biaya yang datang setelah barangnya sudah di gudang",
  ringkas:
    "Kenapa bea masuk dan freight yang tagihannya telat tidak bisa sekadar ditambahkan ke harga beli, dan ke mana bagian barang yang sudah terjual pergi.",
  cabang: "pengguna",
  navHrefs: ["/landed-costs"],
} as const satisfies DocMeta;

const KAS = {
  slug: "kas-dan-bank",
  judul: "Buku kas Anda dan rekening koran bank",
  ringkas:
    "Kenapa saldo di aplikasi boleh berbeda dari saldo di bank, dan apa yang dikerjakan rekonsiliasi.",
  cabang: "pengguna",
  navHrefs: ["/finance", "/reconciliation"],
} as const satisfies DocMeta;

const SALDO_AWAL = {
  slug: "saldo-awal",
  judul: "Hari pertama: saldo awal",
  ringkas:
    "Kenapa aplikasi perlu tahu keadaan keuangan Anda sebelum hari pertama, dan apa akibatnya kalau dilewati.",
  cabang: "pengguna",
  navHrefs: ["/setup", "/master/import"],
} as const satisfies DocMeta;

const COCOK_ACCURATE = {
  slug: "cocokkan-accurate",
  judul: "Mencocokkan buku dengan Accurate",
  ringkas:
    "Apa yang bisa dan tidak bisa dibaca dari ekspor Accurate, dan kenapa layar itu tidak pernah menulis ke buku Anda.",
  cabang: "pengguna",
  navHrefs: ["/accurate"],
} as const satisfies DocMeta;

const PERAN_IZIN = {
  slug: "peran-dan-izin",
  judul: "Peran & izin",
  ringkas:
    "Siapa boleh melihat dan mengerjakan apa — dan kenapa tabel di halaman ini hanya titik awalnya.",
  cabang: "pengguna",
  /*
   * `/api-tokens` SUDAH TIDAK di sini: sejak halaman `api` ada, token dijelaskan
   * di sana bersama cara memakainya — dan penjaga "satu modul dijelaskan paling
   * banyak satu halaman" (`tests/docs.test.ts`) menuntut keputusan itu diambil,
   * bukan dibiarkan ganda. Halaman ini tetap menyebut token sebagai PERAN,
   * karena di situlah pertanyaannya lahir ("token dapat izin apa").
   */
  navHrefs: ["/permissions", "/users"],
} as const satisfies DocMeta;

const API = {
  slug: "api",
  judul: "API: membaca buku ini dari sistem lain",
  ringkas:
    "Cara sebuah program menarik data perusahaan Anda — token, alamatnya, bentuk jawabannya, dan apa arti setiap penolakan.",
  cabang: "pengguna",
  /*
   * Halaman inilah tujuan tautan kontekstual dari layar Token API. Sampai ia
   * ada, menu Bantuan di layar itu menunjuk `peran-dan-izin` — halaman yang
   * menjelaskan token sebagai PERAN dan tidak menyebut satu pun alamat, header,
   * atau bentuk jawaban. Pembacanya adalah orang yang sudah memegang token dan
   * sedang mencari cara memakainya.
   */
  navHrefs: ["/api-tokens"],
} as const satisfies DocMeta;

const PAKET = {
  slug: "paket-dan-perusahaan",
  judul: "Paket, kuota, dan PT kedua",
  ringkas:
    "Apa yang sebenarnya dibatasi sebuah paket, dan kenapa setiap PT berdiri di bukunya sendiri.",
  cabang: "pelanggan",
  /*
   * `/companies/new` SUDAH TIDAK di sini: membuat PT hanya berlangsung di panel
   * akun, jadi butirnya dicabut dari menu perusahaan (`lib/nav.ts`) dan
   * `navHrefs` harus menunjuk butir navigasi yang benar-benar ada — dijaga
   * `tests/docs.test.ts`. Dokumen ini tetap menempel pada `/select-company`,
   * tempat pertanyaan "kenapa PT kedua berdiri di bukunya sendiri" memang
   * muncul.
   */
  navHrefs: ["/select-company"],
} as const satisfies DocMeta;

const DATA_ANDA = {
  slug: "data-anda",
  judul: "Data Anda: di mana ia disimpan, dan bagaimana mengambilnya kembali",
  ringkas:
    "Ekspor mandiri, permintaan penghapusan, dan apa yang tetap tersimpan setelah akun ditutup.",
  cabang: "pelanggan",
  navHrefs: [],
} as const satisfies DocMeta;

/**
 * Daftar isi. Urutannya urutan baca, bukan abjad: yang menjelaskan mesin
 * berdiri di depan yang menjelaskan alur, karena alur mana pun baru masuk akal
 * setelah orang tahu apa yang terjadi saat ia menekan Simpan.
 */
const LAPORAN = {
  slug: "membaca-laporan",
  judul: "Kenapa setiap laporan menanyakan periode lebih dulu",
  ringkas:
    "Kenapa laporan yang sama bisa memberi dua angka berbeda, dan bagaimana membaca mana yang benar.",
  cabang: "pengguna",
  navHrefs: ["/reports", "/budget"],
} as const satisfies DocMeta;

export const DOC_INDEX = [
  MESIN_AKUNTANSI,
  PERIODE,
  PERSETUJUAN,
  PENJUALAN,
  STOK,
  BIAYA_IMPOR,
  KAS,
  SALDO_AWAL,
  COCOK_ACCURATE,
  PERAN_IZIN,
  API,
  PAKET,
  LAPORAN,
  DATA_ANDA,
] as const satisfies readonly DocMeta[];

/**
 * Slug yang ada, sebagai TIPE. Inilah yang membuat isi dan daftar isi tidak
 * bisa menyimpang: `DOC_BLOCKS` di `lib/docs-content.ts` bertipe
 * `Record<DocSlug, …>`, jadi halaman tanpa isi dan isi tanpa halaman keduanya
 * ditolak `tsc` — bukan ditemukan sebagai halaman kosong di produksi.
 */
export type DocSlug = (typeof DOC_INDEX)[number]["slug"];

/**
 * Satu entri daftar isi, dengan `slug`-nya yang SEMPIT. Itulah yang membuat
 * `DOC_BLOCKS[page.slug]` sah tanpa satu pun penegasan tipe di halamannya.
 */
export type DocEntry = (typeof DOC_INDEX)[number];

/**
 * Modul navigasi yang SENGAJA belum/tidak punya halaman dokumen, beserta
 * sebabnya (kriteria selesai issue #300).
 *
 * Bentuknya peta href → alasan, dan alasannya wajib berisi: penjaga menolak
 * entri kosong. Yang dijaga bukan "semuanya sudah ditulis" — itu tidak akan
 * pernah benar — melainkan bahwa sebuah modul tidak bisa lahir DIAM-DIAM tanpa
 * dokumen. Menambah item di `NAV_GROUPS` memaksa satu keputusan di sini, di
 * tempat yang terlihat di diff.
 *
 * Dua kelas entri, dan bedanya penting:
 *  • TETAP — modul yang memang tidak punya "kenapa mesinnya begitu" untuk
 *    diceritakan, atau yang menjelaskan dirinya sendiri;
 *  • GELOMBANG BERIKUTNYA — utang yang diakui, bukan lubang yang disembunyikan.
 */
export const NAV_TANPA_DOKUMEN: Readonly<Record<string, string>> = {
  // ── TETAP ────────────────────────────────────────────────────────────────
  "/glossary":
    "TETAP. Kamus Istilah menjelaskan dirinya sendiri — ia justru sumber yang dibaca halaman dokumen lewat blok `istilah` (#21/#1). Halaman dokumen tentang kamus hanya akan menyalin isinya.",
  "/settings":
    "TETAP. Layar preferensi tampilan & profil perusahaan: isinya daftar isian yang berubah tiap rilis dan tidak punya “kenapa mesinnya begitu” untuk diceritakan. Dokumen langkah-demi-langkah di sini adalah jenis dokumen yang paling cepat basi (keputusan 5).",

  // ── GELOMBANG BERIKUTNYA (utang yang diakui, issue #300) ────────────────
  "/dashboard":
    "Gelombang berikutnya. Beranda MERINGKAS modul lain, jadi “kenapa mesinnya begitu” miliknya adalah satu pertanyaan tersendiri — kenapa angka di kartu bisa berbeda dari laporan yang dicetak hari yang sama (dokumen yang masih tertahan persetujuan, periode berjalan yang belum ditutup). Cerita itu baru masuk akal setelah halaman Pusat Laporan ditulis.",
  "/purchases/new":
    "Gelombang berikutnya. Alur pembelian punya kembarannya di alur penjualan tetapi dengan uang muka dan alokasi ke pemasok — cerita tersendiri, bukan cermin.",
  "/suppliers": "Gelombang berikutnya — bersama halaman alur pembelian.",
  "/payables": "Gelombang berikutnya — bersama halaman alur pembelian.",
  "/advances":
    "Gelombang berikutnya. Uang muka adalah kelas kesalahan tersendiri (uang berpindah sebelum kewajibannya ada) dan pantas mendapat halamannya sendiri, bukan satu paragraf.",
  "/fixed-assets":
    "Gelombang berikutnya. Penyusutan adalah contoh terbaik “kenapa mesinnya begitu” yang tersisa: biaya yang tidak pernah menjadi pengeluaran kas.",
  "/tax/efaktur":
    "Gelombang berikutnya. Menyentuh aturan DJP yang berubah di luar kendali aplikasi ini; dokumen yang salah di sini lebih mahal daripada tidak ada dokumen.",
  "/customers":
    "Gelombang berikutnya — halaman master data bersama (pelanggan, penerima barang, pusat biaya): kenapa master dinonaktifkan, bukan dihapus.",
  "/consignees": "Gelombang berikutnya — bersama halaman master data.",
  "/cost-centers": "Gelombang berikutnya — bersama halaman master data.",
  "/documents":
    "Gelombang berikutnya. Arsip dokumen ekspor (B/L, COO, fumigasi) — aturannya lebih banyak milik pembeli & bea cukai daripada milik aplikasi ini.",
};

/** Cari halaman dokumen dari slug-nya. */
export function docBySlug(slug: string): DocEntry | undefined {
  return DOC_INDEX.find((page) => page.slug === slug);
}

/** Halaman dokumen yang menjelaskan sebuah item navigasi, bila ada. */
export function docForNavHref(href: string): DocEntry | undefined {
  return DOC_INDEX.find((page) => (page.navHrefs as readonly string[]).includes(href));
}

/** Halaman dokumen sebuah cabang, urut deklarasi. */
export function docsInBranch(cabang: DocBranch): DocEntry[] {
  return DOC_INDEX.filter((page) => page.cabang === cabang);
}

/**
 * Tetangga sebuah halaman DI DALAM cabangnya — urutan baca `DOC_INDEX`.
 *
 * Dipakai pengalih halaman di kaki halaman dokumen. Sengaja tidak melintasi
 * cabang: "berikutnya" yang melompat dari halaman terakhir cabang pengguna ke
 * halaman pertama cabang pelanggan menjanjikan sebuah urutan baca yang memang
 * tidak ada — kedua cabang ditulis untuk dua pembaca yang berbeda, dan
 * `DOC_BRANCHES` menyatakannya.
 */
export function docNeighbours(slug: string): {
  sebelum: DocEntry | undefined;
  sesudah: DocEntry | undefined;
} {
  const page = docBySlug(slug);
  if (!page) return { sebelum: undefined, sesudah: undefined };
  const sekabang = docsInBranch(page.cabang);
  const i = sekabang.findIndex((p) => p.slug === slug);
  return { sebelum: sekabang[i - 1], sesudah: sekabang[i + 1] };
}

/**
 * Halaman dokumen untuk ALAMAT yang sedang dibuka — dipakai tautan kontekstual
 * di menu Bantuan.
 *
 * Kecocokan TERPANJANG yang menang, aturan yang sama persis dengan
 * `activeNavHref` (`lib/nav.ts`): `/inventory/opname` harus mendarat di halaman
 * dokumen yang menyebut `/inventory/opname`, bukan juga di yang menyebut
 * `/inventory`. Awalan `/t/{tenant}/{company}` dibuang lebih dulu karena tabel
 * `navHrefs` ditulis dalam jalur lama — slug-nya baru diketahui saat permintaan
 * berjalan.
 */
export function docForPathname(pathname: string): DocEntry | undefined {
  const path = appPath(pathname);
  let terbaik: DocEntry | undefined;
  let panjang = -1;
  for (const page of DOC_INDEX) {
    for (const href of page.navHrefs as readonly string[]) {
      if ((path === href || path.startsWith(`${href}/`)) && href.length > panjang) {
        terbaik = page;
        panjang = href.length;
      }
    }
  }
  return terbaik;
}
