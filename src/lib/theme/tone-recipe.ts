/**
 * RESEP NADA PEKAT — satu aritmetika, dipakai lebih dari satu permukaan
 * (issue #303).
 *
 * ══ KENAPA BERKAS INI ADA, DAN KENAPA IA BUKAN DI `components/landing/**` ══
 * Nada pekat lahir di halaman pendaratan: pita seksi, kartu berisi, dan kotak
 * ikon yang benar-benar bidang berwarna alih-alih `colorFillQuaternary` yang
 * translusen 2–4% dan di layar praktis tidak ada. Permintaan berikutnya
 * (#303) meminta hal yang sama untuk `/platform` — permukaan tempat pelanggan
 * MEMBELI dan mengelola langganannya.
 *
 * Ada tiga jalan menuju sana, dan dua di antaranya salah:
 *
 *   • **Mengimpor `landing-scale.ts` dari `(tenant)/platform/*`.** Ditolak
 *     `tests/landing-boundary.test.ts`, dan penolakan itu benar: direktori
 *     pendaratan memuat SKALA PEMASARAN (hero ≈53px, irama 96px, CTA
 *     berulang), dan satu impor membuka pintu bagi semuanya sekaligus.
 *   • **Menyalin resepnya ke berkas kedua.** Dua salinan kadar campuran yang
 *     akan berbeda pada hari seseorang menyetel salah satunya — dan
 *     perbedaannya tidak berbunyi, ia hanya membuat dua permukaan yang
 *     seharusnya sekeluarga terlihat sedikit berbeda tanpa ada yang tahu
 *     kenapa.
 *
 * Yang ketiga, dan yang dipilih: **RESEPNYA yang diangkat, bukan tokennya.**
 * Berkas ini tidak mendeklarasikan satu pun variabel CSS dan tidak tahu
 * apa-apa tentang halaman mana pun. Ia hanya menjawab satu pertanyaan —
 * "bagaimana bentuk `color-mix` untuk sebuah nada?" — dan setiap permukaan
 * MENDEKLARASIKAN nadanya sendiri, dengan nama dan lingkup `data-*` sendiri,
 * dari jawaban yang sama.
 *
 * Akibatnya yang penting: penjaga #245 tetap utuh (tidak ada impor lintas
 * batas — `components/landing/**` boleh mengimpor `@/lib/`, dan app internal
 * memang tidak menyentuh direktori pendaratan sama sekali), sementara kadar
 * campurannya tidak bisa menyimpang karena aritmetikanya hanya ditulis sekali.
 * Yang TIDAK ikut jadi milik bersama adalah ANGKANYA: setiap permukaan
 * mengukur kadarnya sendiri, sebab batasnya datang dari tombol dan latar yang
 * dipikul permukaan itu — dan keduanya berbeda antara pendaratan
 * (`colorBgContainer` + `colorBgElevated`) dan `/platform`
 * (`colorBgLayout` + `colorBgContainer`).
 *
 * ══ KENAPA `color-mix()`, BUKAN ANAK TANGGA PALET LANGSUNG ═════════════════
 * Tangga warna AntD ada sebagai variabel (`--ant-blue-1` … `--ant-blue-10`, di
 * kedua tema) dan ia MEMBALIK di tema gelap: `blue-1` terang `#e6f4ff`,
 * `blue-1` gelap `#111a2c`. Balikan itu berguna untuk teks, tetapi tidak untuk
 * PERMUKAAN — `blue-1` gelap praktis sewarna latar kartu gelap (`#141414`),
 * yaitu nada yang lenyap di satu tema tanpa ada yang gagal.
 *
 * `color-mix()` menyelesaikannya dengan satu resep untuk kedua tema: hue pekat
 * (`--ant-<hue>-6`) dicampur ke permukaan yang SEDANG berlaku. Hasilnya opak —
 * benar-benar bidang berisi — dan ia menjadi tint terang di tema terang dan
 * tint gelap di tema gelap tanpa satu pun cabang tema di kode pemakainya.
 *
 * ══ EMPAT HUE, DAN KENAPA KEEMPATNYA TANPA ARTI DI APLIKASI INI ════════════
 * Hijau, merah, emas, dan jingga TIDAK ada di sini, dan ketiadaannya
 * disengaja: keempatnya sudah menjadi bahasa uang & status (`colorMoney*`,
 * `colorSuccess`, `colorWarning`, `colorError`, issue #186/#187). Bidang hijau
 * di halaman yang menampilkan tagihan terbaca sebagai pernyataan TENTANG
 * tagihannya — dan di `/platform`, tempat uang sungguhan ditampilkan, akibatnya
 * lebih mahal daripada di halaman pemasaran.
 *
 * Yang tersisa adalah empat hue dingin yang tidak memikul arti apa pun: biru
 * merek, cyan, indigo (`geekblue`), dan violet (`purple`). Sebuah permukaan
 * TIDAK harus memakai keempatnya — `/platform` sengaja hanya memakai tiga
 * (lihat `components/tenant/platform-tone.ts`), sebab hue yang tersedia tanpa
 * wilayah yang membutuhkannya adalah undangan untuk memakainya sebagai hiasan.
 *
 * ══ PENDAMPING GLIF: ANAK TANGGA -8 ════════════════════════════════════════
 * Ikon di dalam kotak sehue memakai anak tangga ke-8, dan justru di sini
 * balikan tangga AntD bekerja untuk kita: `-8` gelap di tema terang dan terang
 * di tema gelap, sedangkan kotaknya (dicampur dari `-6`) bergerak ke arah yang
 * sama. Satu nama token, dua tema, terukur jauh di atas ambang ikon 3:1 —
 * dihitung ulang di `tests/landing-colors.test.ts` dan
 * `tests/platform-colors.test.ts`.
 */

/** Peran nada → nama peran. Bukan nama warna: `indigo` = `geekblue` AntD. */
export const TONE_HUES = ["brand", "cyan", "indigo", "violet"] as const;

export type ToneHue = (typeof TONE_HUES)[number];

/**
 * Peran → keluarga palet AntD. **Satu-satunya tempat pemetaan ini ditulis.**
 *
 * Nama perannya sengaja tidak sama dengan nama paletnya di dua tempat
 * (`indigo` → `geekblue`, `violet` → `purple`): yang dipakai di halaman adalah
 * PERAN, jadi mengganti keluarga palet di kemudian hari adalah satu baris di
 * sini, bukan penelusuran ke setiap pemanggil.
 */
export const TONE_HUE_TOKEN: Record<ToneHue, string> = {
  brand: "blue",
  cyan: "cyan",
  indigo: "geekblue",
  violet: "purple",
};

/**
 * Permukaan yang boleh menjadi DASAR campuran.
 *
 * Ketiganya adalah jenjang permukaan MASTER.md §Jenjang permukaan, dan
 * pilihannya bukan selera: nada harus dicampur ke permukaan yang benar-benar
 * ada di bawahnya, sebab itulah yang membuat satu resep melayani dua tema.
 * Kartu pendaratan berdiri di `colorBgElevated`; kartu `/platform` adalah
 * `Card` AntD biasa, yaitu `colorBgContainer`; wilayah yang menggantikan latar
 * halaman panel memakai `colorBgLayout`.
 */
export type ToneBase = "layout" | "container" | "elevated";

/**
 * Resep satu nada, sebagai teks CSS.
 *
 * Bentuk keluarannya PERSIS satu baris `color-mix` dan itu bagian dari
 * kontraknya: kedua penjaga kontras (`tests/landing-colors.test.ts`,
 * `tests/platform-colors.test.ts`) MENGURAI kembali kadar & dasarnya dari
 * teks yang benar-benar dirender, bukan dari konstanta yang diimpor — jadi tes
 * itu mengukur warna yang sungguh sampai ke layar, bukan warna yang diniatkan.
 */
export function toneMix(hue: ToneHue, pct: number, base: ToneBase): string {
  return `color-mix(in srgb, var(--ant-${TONE_HUE_TOKEN[hue]}-6) ${pct}%, var(--ant-color-bg-${base}))`;
}
