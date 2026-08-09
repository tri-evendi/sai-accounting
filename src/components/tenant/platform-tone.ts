/**
 * NADA PEKAT `/platform` — warna yang membawa WILAYAH, bukan hiasan
 * (issue #303).
 *
 * ══ APA YANG DIMINTA, DAN APA YANG MEMBATASINYA ════════════════════════════
 * Permintaan pemilik: *"`/platform` dibuat lebih berwarna seperti halaman
 * pendaratan, pakai beberapa warna solid juga, supaya pelanggan lebih
 * tertarik."* Sah, dan berkas ini menjalankannya — tetapi `/platform` bukan
 * halaman pemasaran. Ia memajang **uang sungguhan**: harga paket, tagihan
 * terbuka, sisa masa uji coba, status langganan. Halaman tagihan yang terasa
 * seperti brosur menurunkan kepercayaan, bukan menaikkannya.
 *
 * Karena itu warna di sini hanya boleh menjawab satu pertanyaan: **saya ada di
 * wilayah apa.** Ia tidak pernah menjadi penanda tunggal, tidak pernah
 * menyentuh angka, dan tidak pernah memakai hue yang sudah punya arti.
 *
 * ══ RESEPNYA MILIK BERSAMA, ANGKANYA TIDAK ════════════════════════════════
 * `color-mix` di bawah datang dari `@/lib/theme/tone-recipe`, modul yang sama
 * yang dipakai halaman pendaratan — jadi tidak ada dua salinan aritmetika yang
 * bisa menyimpang. Yang TIDAK diwarisi adalah kadarnya, dan itu bukan
 * kelalaian: kadar dibatasi oleh tombol dan latar yang dipikul permukaannya,
 * dan keduanya berbeda di sini.
 *
 *   |                       | pendaratan            | `/platform`             |
 *   |-----------------------|-----------------------|-------------------------|
 *   | latar halaman         | `colorBgContainer`    | `colorBgLayout`         |
 *   |                       | `#ffffff` / `#141414` | `#f5f5f5` / `#000000`   |
 *   | permukaan kartu       | `colorBgElevated`     | `colorBgContainer`      |
 *   |                       | `#ffffff` / `#1f1f1f` | `#ffffff` / `#141414`   |
 *   | yang mengikat kadar   | isian tombol PRIMER   | tepi tombol GARIS       |
 *
 * Baris terakhir itu yang paling mudah terlewat. Di pendaratan yang berdiri di
 * atas nada adalah tombol primer, jadi batasnya isian `#1668dc` (tema gelap)
 * vs nada ≥3:1. Di `/platform` tidak ada satu pun tombol primer di atas nada —
 * yang ada tombol GARIS (`variant="outline"`, kepala kartu "Perusahaan"), dan
 * yang harus tetap ≥3:1 adalah TEPINYA (`colorBorder`). Tepi itu mengikat
 * lebih cepat di tema TERANG, kebalikan dari pendaratan.
 *
 * ══ DUA PERAN, DAN ANGKANYA — DIUKUR, BUKAN DISALIN ═══════════════════════
 *
 * **`head` = 16%** — nada kepala kartu. Ia angka TERBESAR yang masih menjaga
 * tepi tombol garis ≥3:1 pada ketiga nada di kedua tema. Yang mengikatnya
 * violet di tema terang: **3,05:1 pada 16%**, **2,94:1 pada 18%**. (Indigo
 * 3,11 → 3,02; biru merek 3,22 → 3,13.) Di tema gelap ketiganya jauh lebih
 * longgar (3,81–4,03 pada 16%), jadi tema terang yang menentukan — dan itulah
 * sebabnya angka pendaratan tidak bisa disalin ke sini.
 *
 * **`chip` = 32%** — nada kotak ikon dan kepala kartu paket BERJALAN. Ia angka
 * TERKECIL yang membuat isian tombol primer tema gelap (`#1668dc`) turun di
 * bawah 3:1 pada ketiga nada sekaligus: **2,59 / 2,84 / 2,97**. Pada 30%
 * violet masih 3,01:1, dan aturan "tidak ada tombol di atas `chip`" kembali
 * menjadi janji yang harus diingat orang. Pada 32% ia menjadi kalimat yang
 * dijaga tes (`tests/platform-colors.test.ts` → "nada `chip` memang tidak
 * layak memikul tombol").
 *
 * Yang MEMIKUL tombol karena itu tetap badan kartu telanjang
 * (`colorBgContainer`): isian primer di sana 6,16:1 (terang) / 3,55:1 (gelap).
 * Tombol "Pilih paket ini" hidup di badan, bukan di kepala.
 *
 * ══ TIGA HUE, BUKAN EMPAT ═════════════════════════════════════════════════
 * `tone-recipe` menyediakan empat; `/platform` memakai tiga, satu per WILAYAH:
 *
 *   • `brand`  — akun & langganan berjalan (siapa saya, apa yang saya punya);
 *   • `indigo` — perusahaan / buku (apa yang bisa saya buka);
 *   • `violet` — katalog paket & jalan menujunya (apa yang bisa saya beli).
 *
 * `cyan` sengaja TIDAK dideklarasikan. `/platform` tidak punya wilayah keempat
 * yang membutuhkannya, dan nada yang tersedia tanpa wilayah yang memerlukannya
 * adalah undangan untuk memakainya sebagai hiasan — persis yang dilarang
 * paragraf pertama berkas ini. Menambahkannya kelak = satu baris di sini,
 * bersama wilayah yang membenarkannya.
 *
 * ⚠ **Hue TIDAK berputar per baris.** Kesepuluh kartu perusahaan memakai satu
 * nada yang sama, dan ketiga kartu paket juga. Sepuluh hue berdampingan adalah
 * konfeti, bukan hierarki — dan urutan paket bukan urutan hue: tidak ada
 * pembaca yang bisa menyimpulkan "violet lebih tinggi dari cyan". Yang
 * membedakan satu kartu paket dari yang lain adalah kadar (`chip` vs `head`)
 * plus lencana berteks, bukan rona.
 *
 * ══ LINGKUPNYA `[data-platform]`, DAN ITU YANG MEMBUATNYA BATAS ═══════════
 * Deklarasi di bawah hidup di dalam `[data-platform]`, atribut yang hanya
 * dipasang `PlatformShell`. Menyalin `var(--sai-platform-chip-brand)` ke
 * halaman buku besar karena itu tidak menghasilkan nada — ia menghasilkan
 * properti yang tidak pernah teratasi, dan elemennya diam-diam mewarisi latar
 * induknya. `tests/platform-colors.test.ts` menutup sisanya: string
 * `--sai-platform-` tidak boleh muncul di luar berkas ini dan
 * `app/(tenant)/platform/**`, dan akarnya dipasang tepat satu berkas.
 */
import { toneMix, type ToneHue } from "@/lib/theme/tone-recipe";

/** Wilayah `/platform` yang berhak atas nada. Tiga, dan alasannya di kepala. */
export const PLATFORM_HUES = ["brand", "indigo", "violet"] as const satisfies readonly ToneHue[];

export type PlatformHue = (typeof PLATFORM_HUES)[number];

/** Kadar campuran per peran, dalam persen. Alasannya di kepala berkas. */
export const PLATFORM_MIX = { head: 16, chip: 32 } as const;

/**
 * Deklarasi nada, DIBANGKITKAN dari satu resep — bukan enam baris tangan.
 *
 * Yang harus tidak bisa menyimpang justru kadarnya: enam baris tangan akan
 * berbeda pada hari seseorang menyetel satu di antaranya dan lupa lima
 * sisanya.
 *
 * Dasarnya `colorBgContainer` untuk KEDUA peran, dan itu bukan penyeragaman:
 * keduanya digambar DI DALAM sebuah `Card`, dan `Card` di app internal adalah
 * `colorBgContainer` — bukan `colorBgElevated` seperti kartu pendaratan.
 * Mencampur ke permukaan yang tidak ada di bawahnya menghasilkan angka kontras
 * yang benar di atas kertas dan salah di layar.
 */
const NADA = PLATFORM_HUES.flatMap((hue) => [
  `--sai-platform-head-${hue}:${toneMix(hue, PLATFORM_MIX.head, "container")};`,
  `--sai-platform-chip-${hue}:${toneMix(hue, PLATFORM_MIX.chip, "container")};`,
]).join("");

/**
 * Blok gaya `/platform` — dipasang SEKALI oleh `PlatformShell`.
 *
 * Isinya hanya deklarasi nada. Tidak ada `:hover`, tidak ada `@media`, tidak
 * ada skala tipografi: `/platform` adalah app internal, jadi langit-langit
 * hurufnya tetap `PageHeader` + skala heading AntD (MASTER.md §Pemasaran vs
 * App). Yang dipinjam dari pendaratan adalah warnanya, bukan bentuknya.
 */
export const PLATFORM_STYLE = `[data-platform]{${NADA}}`;

/**
 * Nama variabelnya ditulis UTUH di kedua peta, tidak dirangkai dari `hue`.
 *
 * Itu bukan kerapian. Properti kustom yang salah ketik TIDAK menghasilkan
 * galat apa pun — nilainya kosong dan elemennya mewarisi induknya — jadi satu
 * huruf yang meleset pada nama hue akan lolos `tsc`, lolos ESLint, dan lolos
 * peramban. Ditulis utuh, keduanya juga bisa di-grep, dan penjaga di
 * `tests/platform-colors.test.ts` bisa mencocokkan yang DIPAKAI dengan yang
 * DIDEKLARASIKAN.
 */
const HEAD: Record<PlatformHue, string> = {
  brand: "var(--sai-platform-head-brand)",
  indigo: "var(--sai-platform-head-indigo)",
  violet: "var(--sai-platform-head-violet)",
};

const CHIP: Record<PlatformHue, string> = {
  brand: "var(--sai-platform-chip-brand)",
  indigo: "var(--sai-platform-chip-indigo)",
  violet: "var(--sai-platform-chip-violet)",
};

/**
 * Warna GLIF di dalam kotak ikon sehue — anak tangga ke-8.
 *
 * Di sinilah balikan tangga AntD bekerja untuk kita: `-8` gelap di tema terang
 * dan terang di tema gelap, sedangkan kotaknya (`chip-*`) bergerak ke arah
 * yang sama. Satu nama token, dua tema, terukur 4,83–7,69:1 — jauh di atas
 * ambang ikon 3:1.
 */
const GLYPH: Record<PlatformHue, string> = {
  brand: "var(--ant-blue-8)",
  indigo: "var(--ant-geekblue-8)",
  violet: "var(--ant-purple-8)",
};

/** Nada kepala kartu (16%) — boleh memikul tombol GARIS, tidak pernah primer. */
export const platformHead = (hue: PlatformHue) => HEAD[hue];

/** Nada kotak ikon & kepala kartu tersorot (32%) — tidak memikul tombol apa pun. */
export const platformChip = (hue: PlatformHue) => CHIP[hue];

/** Warna ikon di atas `platformChip` sehue. */
export const platformGlyph = (hue: PlatformHue) => GLYPH[hue];
