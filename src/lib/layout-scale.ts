/**
 * SKALA JARAK SEBAGAI ANGKA — token AntD untuk tempat yang tidak bisa memakai
 * `var(--ant-…)`.
 *
 * ══ KENAPA BERKAS INI ADA ══════════════════════════════════════════════════
 * MASTER.md §Jarak sudah tegas: jaraknya token AntD, tidak ada lapisan kedua.
 * Dan di CSS memang begitu — `style={{ gap: "var(--ant-margin-lg)" }}` berlaku
 * di mana pun. Tapi sebagian pemakai jarak di app ini menuntut ANGKA, bukan
 * string:
 *
 *   • prop `gap` milik `<Flex>`/`<Space>`/`<Row>` AntD (bertipe `number`);
 *   • aritmetika tata letak (`SECTION_GAP - INLINE_GAP`, tinggi yang dihitung);
 *   • nilai yang dioper ke pustaka chart.
 *
 * Karena tidak ada tempat untuk menaruh angka itu, setiap halaman mendeklarasi-
 * kannya sendiri — dan diukur sebelum berkas ini ditulis, hasilnya:
 *
 *   | Konstanta      | definisi | nilai yang dipakai          |
 *   |----------------|----------|-----------------------------|
 *   | `SECTION_GAP`  | **41**   | 38×24 · 2×16 · 1×40         |
 *   | `CARD_GAP`     | **14**   | 12×16 · 2×12                |
 *   | `INLINE_GAP`   | 5        | 5×8                         |
 *
 * Enam puluh deklarasi untuk tiga keputusan, dan dua di antaranya SUDAH
 * bercabang. Tak satu pun cabang itu salah — yang dua memakai 16 memang
 * bermaksud `margin`, dan komentarnya mengatakannya — tetapi tidak ada apa pun
 * yang menghubungkan angka-angka itu dengan skalanya. Pada hari seseorang
 * mengetik `26`, tidak ada yang gagal.
 *
 * ══ BENTUKNYA: NAMA TOKEN, BUKAN NAMA PERAN ════════════════════════════════
 * Yang diekspor di bawah adalah ANAK TANGGA SKALA (`SPACE_MD` = 16), bukan
 * peran ("jarak formulir"). Peran tetap dinamai di halamannya sendiri —
 * `const SECTION_GAP = SPACE_LG;` — dan itu disengaja: nama peran menjawab
 * "kenapa jarak ini di sini", yang hanya diketahui halamannya; skala menjawab
 * "angka berapa", yang tidak boleh diketahui halamannya.
 *
 * Tiga peran yang dipakai BANYAK halaman diekspor sekalian di bawah, supaya
 * tiga puluh delapan halaman tidak perlu menuliskan alias yang sama.
 *
 * ⚠ Nilainya WAJIB sama dengan token AntD yang disebut di sebelahnya. Ia salinan
 * — satu-satunya di repo ini — dan `tests/layout-scale.test.ts` membandingkannya
 * dengan `antd-tokens.ts` supaya salinan itu tidak bisa menyimpang diam-diam.
 */

/** `--ant-margin-xxs` / `--ant-padding-xxs` — celah rapat (ikon–teks). */
export const SPACE_XXS = 4;

/** `--ant-margin-xs` / `--ant-padding-xs` — inline, antar-aksi ikon. */
export const SPACE_XS = 8;

/** `--ant-margin-sm` / `--ant-padding-sm` — padding kendali & sel tabel. */
export const SPACE_SM = 12;

/** `--ant-margin` / `--ant-padding` — padding standar, gap kisi. */
export const SPACE_MD = 16;

/** `--ant-margin-lg` / `--ant-padding-lg` — padding kartu, jarak antar-bagian. */
export const SPACE_LG = 24;

/** `--ant-margin-xl` — gap besar. */
export const SPACE_XL = 32;

/** `--ant-margin-xxl` — jarak antar-seksi besar. */
export const SPACE_XXL = 48;

/* ══ PERAN YANG DIPAKAI BANYAK HALAMAN ═════════════════════════════════════
 * Ketiganya alias, bukan nilai baru. Mereka ada supaya puluhan halaman berhenti
 * menuliskan alias yang sama — bukan supaya skala di atas punya nama kedua.
 */

/** Jarak antar-seksi di dalam satu halaman. 38 halaman memakainya. */
export const SECTION_GAP = SPACE_LG;

/** Jarak antar-kartu di dalam satu seksi. */
export const CARD_GAP = SPACE_MD;

/** Jarak antar-kendali yang berdampingan pada satu baris. */
export const INLINE_GAP = SPACE_XS;
