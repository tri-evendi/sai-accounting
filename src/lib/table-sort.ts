/**
 * Sortir kolom lewat URL — pengurutan dikerjakan BASIS DATA, kendalinya tautan
 * (issue #265).
 *
 * ── Masalahnya ─────────────────────────────────────────────────────────────
 * `SaiColumn` menerima `sorter`, dan `moneyColumn`/`qtyColumn` dulu
 * MENYALAKANNYA secara bawaan. `StaticTable` mengabaikannya sepenuhnya, jadi 30
 * dari 62 tabel membawa prop yang tidak melakukan apa pun: kolom uang tampak
 * bisa diurutkan menurut kode, dan tidak bisa diklik di layar. Tanpa galat,
 * tanpa peringatan, `tsc` diam — kelas kegagalan yang sudah berulang di repo
 * ini (`position: sticky` tanpa kotak bergulir, `size={16}` pada ikon).
 *
 * ── Kenapa lewat URL, bukan dengan memindahkan tabelnya ke `DataTable` ──────
 * `DataTable` memang benar-benar mengurutkan, tapi ia rc-table: **+80 KB gzip
 * per rute** (#199) dan halamannya wajib jadi client component. Untuk 62 tabel
 * itu membatalkan taruhan yang dimenangkan seluruh epik #206 (server component
 * 141 → 141), dan menyalin seluruh buku besar ke peramban untuk sesuatu yang
 * basis data sudah bisa kerjakan.
 *
 * Sortir lewat URL bukan kompromi — untuk daftar yang dipaginasi server ia
 * LEBIH baik: bekerja tanpa JavaScript, bisa ditandai & dibagikan, keyboard
 * berjalan sendiri karena kendalinya tautan sungguhan, dan yang diurutkan
 * adalah SELURUH data di basis data, bukan hanya 10 baris yang sedang tampil.
 *
 * ── Bentuknya: satu peta, dua kegunaan ─────────────────────────────────────
 * Halaman menulis SATU `SortSpec` — peta kunci kolom → pembangun `orderBy`
 * Prisma — dan peta itu dipakai dua kali:
 *
 *   1. sebagai DAFTAR PUTIH saat membaca `?sort=` (nilai di luar peta diabaikan,
 *      jadi URL editan tangan tidak bisa menitipkan nama kolom ke Prisma);
 *   2. sebagai pembangun `orderBy`-nya sendiri.
 *
 * ```ts
 * const SORTABLE = {
 *   period:   (dir) => [{ periodEnd: dir }, { id: dir }],
 *   opening:  (dir) => ({ openingBalance: dir }),
 * } satisfies SortSpec<Prisma.BankStatementOrderByWithRelationInput[] | …>;
 *
 * const sort = parseSort(filters, SORTABLE);
 * const orderBy = sortOrderBy(sort, SORTABLE, [{ periodEnd: "desc" }, { id: "desc" }]);
 * ```
 *
 * Satu sumber kebenaran, jadi "kunci yang bisa diurutkan" tidak bisa menyimpang
 * dari "kunci yang punya `orderBy`".
 *
 * ── UANG & KUANTITAS DIURUTKAN SEBAGAI ANGKA, DAN ITU BUKAN KEBETULAN ───────
 * `orderBy` Prisma mengurutkan KOLOMnya — `Decimal(15,2)` diurutkan sebagai
 * angka oleh basis data. Yang dilarang di sini adalah mengurutkan baris yang
 * SUDAH diformat: `"Rp 1.000"` mendarat sebelum `"Rp 9"` secara leksikografis,
 * dan daftar "nilai terbesar" jadi salah tanpa satu pun tanda di layar.
 *
 * Konsekuensinya: kolom yang nilainya DIHITUNG DI MEMORI (total faktur dari
 * baris barangnya, nilai persediaan rata-rata tertimbang) tidak boleh masuk
 * `SortSpec` — tidak ada kolom yang bisa diurutkan basis data, dan mengurutkan
 * 10 baris halaman ini saja akan menghasilkan "terbesar" yang berubah-ubah per
 * halaman. Kolom seperti itu tetap tanpa `sorter`; lihat catatan di halaman
 * Faktur dan Jurnal.
 *
 * ── PENEMPATAN NULL: "nulls-last di kedua arah", ditegakkan dengan MEMBATASI ─
 * Butir 4 Prinsip Inti MASTER.md: nilai yang belum diketahui ditulis kosong,
 * tak pernah 0. Kalau kolom seperti itu bisa diurutkan, arah urut menentukan di
 * mana blok baris kosong mendarat — dan bawaan MySQL menaruh NULL PALING KECIL,
 * jadi membalik arah ke `asc` menaikkan sekumpulan sel "—" ke puncak tabel.
 *
 * Yang diinginkan adalah nulls-last di KEDUA arah. Itu **tidak bisa dinyatakan
 * di sini**, dan alasannya terukur, bukan dugaan:
 *
 *   • MySQL/MariaDB tidak punya sintaks `NULLS LAST` sama sekali;
 *   • opsi `nulls` milik Prisma memang ADA di tipe hasil generate
 *     (`SortOrderInput`), tetapi tipe itu tidak dibedakan per provider. Query
 *     compiler yang terpasang membuktikan batasnya: string `NULLS LAST` hanya
 *     ada di `query_compiler_*.postgresql.wasm` dan `.cockroachdb.wasm` —
 *     TIDAK di `.mysql.wasm`. Menulis `nulls: "last"` di app ini karena itu
 *     adalah prop mati yang kedua, persis kelas yang issue ini tutup.
 *
 * Karena satu-satunya penempatan yang bisa DIJAMIN adalah "tidak ada NULL sama
 * sekali", aturannya dipindahkan ke sisi yang bisa ditegakkan:
 *
 *   **Kunci di dalam `SortSpec` hanya boleh menunjuk kolom NOT NULL.**
 *
 * Uang & kuantitas memenuhi ini secara skema — `docs/DATABASE.md` mewajibkan
 * `Decimal(15,2)`/`Decimal(15,3)`, dan kolom nominal di app ini `@default(0)`.
 * Kolom yang memang bisa kosong (`documents.type`, `bank_statements.locked_at`)
 * SENGAJA tidak ditawarkan sortirnya; menawarkannya berarti menyerahkan
 * penempatan barisnya kepada bawaan basis data, yaitu keputusan yang tidak
 * diambil siapa pun. Kalau kelak app ini pindah ke PostgreSQL, batas ini boleh
 * dilonggarkan bersama `nulls: "last"` yang sungguhan.
 *
 * Berkas ini murni — tanpa React, tanpa Prisma, tanpa `server-only` — jadi ia
 * bisa diuji sebagai unit dan dipakai di server component mana pun.
 */

/** Arah urut. Nilai URL-nya sengaja pendek dan sudah lazim: `asc` / `desc`. */
export type SortDir = "asc" | "desc";

/** Urutan yang sedang berlaku, hasil membaca URL. */
export interface ActiveSort {
  key: string;
  dir: SortDir;
}

/**
 * Nama parameter URL. Ditulis sekali di sini supaya tautan sortir, pembacaan
 * `searchParams`, dan `Pagination` (yang meneruskan seluruh query apa adanya)
 * tidak bisa memakai ejaan yang berbeda.
 */
export const SORT_PARAM = "sort";
export const DIR_PARAM = "dir";

/** Bentuk `searchParams` halaman daftar di app ini. */
export type SortParams = Record<string, string | undefined>;

/**
 * Peta kunci kolom → pembangun `orderBy` Prisma.
 *
 * Nilainya FUNGSI atas arah, bukan pasangan objek asc/desc: banyak daftar butuh
 * pemutus seri (`[{ date: dir }, { id: dir }]`) supaya baris tidak berpindah
 * halaman antar permintaan, dan pemutus itu harus ikut membalik arah.
 */
export type SortSpec<O> = Readonly<Record<string, (dir: SortDir) => O>>;

/** Kunci yang benar-benar punya `orderBy` — dioper ke `StaticTable.sort.keys`. */
export function sortableKeys<O>(spec: SortSpec<O>): string[] {
  return Object.keys(spec);
}

/** `spec[key]` yang aman dari kunci warisan (`constructor`, `__proto__`). */
function builderFor<O>(spec: SortSpec<O>, key: string) {
  return Object.prototype.hasOwnProperty.call(spec, key) ? spec[key] : undefined;
}

/**
 * Membaca `?sort=…&dir=…`, DISARING oleh `spec`.
 *
 * Kunci di luar peta menghasilkan `null` — bukan galat: URL yang diedit tangan
 * (atau tautan lama setelah sebuah kolom dihapus) harus mendarat pada urutan
 * bawaan halaman, bukan pada layar 500. Arah yang tidak dikenal jatuh ke `asc`
 * dengan alasan yang sama.
 */
export function parseSort<O>(
  params: SortParams | undefined,
  spec: SortSpec<O>
): ActiveSort | null {
  const key = params?.[SORT_PARAM];
  if (!key || builderFor(spec, key) === undefined) return null;
  return { key, dir: params?.[DIR_PARAM] === "desc" ? "desc" : "asc" };
}

/**
 * `orderBy` untuk kueri Prisma. Tanpa `?sort=` ia mengembalikan `fallback`
 * APA ADANYA — itu yang membuat pemasangan sortir tidak mengubah urutan bawaan
 * satu halaman pun.
 */
export function sortOrderBy<O>(
  active: ActiveSort | null,
  spec: SortSpec<O>,
  fallback: O
): O {
  if (active === null) return fallback;
  const build = builderFor(spec, active.key);
  return build === undefined ? fallback : build(active.dir);
}

/**
 * Keadaan BERIKUTNYA ketika judul kolom diklik: `asc` → `desc` → tanpa urutan.
 *
 * Tiga keadaan, bukan dua, dan itu disengaja demi kesetaraan kontrak: AntD
 * `Table` — yaitu `DataTable` — juga berputar `ascend → descend → none`, dan
 * klik pertamanya menaik. Sebuah kolom karena itu berperilaku sama di kedua
 * perender, dan pengguna selalu punya jalan kembali ke urutan bawaan halaman
 * tanpa harus mengedit URL.
 */
export function nextSort(key: string, active: ActiveSort | null): ActiveSort | null {
  if (active === null || active.key !== key) return { key, dir: "asc" };
  return active.dir === "asc" ? { key, dir: "desc" } : null;
}

/**
 * Tautan sortir — `basePath` + SELURUH parameter yang sedang berlaku.
 *
 * Yang dipertahankan bukan hanya saringan: `page` ikut, dan itu bacaan yang
 * disengaja. URL di app ini adalah keterangan LENGKAP tentang apa yang sedang
 * di layar (pola `Pagination`), dan menyortir tidak boleh diam-diam membuang
 * salah satu bagiannya. Hanya `sort`/`dir` yang diganti — kalau `next` `null`,
 * keduanya DIHAPUS, sehingga keadaan ketiga benar-benar mengembalikan urutan
 * bawaan halaman alih-alih menuliskannya sebagai urutan lain.
 */
export function sortHref(
  basePath: string,
  params: SortParams | undefined,
  next: ActiveSort | null
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === "") continue;
    if (key === SORT_PARAM || key === DIR_PARAM) continue;
    query.set(key, value);
  }
  if (next !== null) {
    query.set(SORT_PARAM, next.key);
    query.set(DIR_PARAM, next.dir);
  }
  const qs = query.toString();
  return qs === "" ? basePath : `${basePath}?${qs}`;
}
