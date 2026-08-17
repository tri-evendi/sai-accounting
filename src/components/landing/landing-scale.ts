/**
 * SKALA PEMASARAN — apa yang membuat halaman pendaratan "pemasaran", dinyatakan
 * sebagai token (issue #245).
 *
 * ══ KENAPA BERKAS INI ADA ══════════════════════════════════════════════════
 * MASTER.md §Anti-Patterns sejak awal melarang "gaya landing/marketing (hero
 * raksasa, CTA 'Start trial') di app internal". Larangan itu selama ini
 * bertahan karena sebuah KEBETULAN MEKANIS, bukan karena ada yang menjaganya:
 * dua dunia memakai kelas Tailwind yang kelihatan berbeda, jadi menyalin gaya
 * pemasaran ke halaman internal terasa janggal sudah saat menulisnya.
 *
 * Epik #206 menghapus kebetulan itu. Setelah pendaratan dan app internal sama-
 * sama berdiri di atas token AntD, `fontSize: "var(--ant-font-size-heading-1)"`
 * di halaman piutang dan di hero pendaratan terlihat persis sama — dan yang
 * tersisa hanya satu kalimat larangan di dokumen yang tidak dijalankan siapa
 * pun. Berkas ini adalah penggantinya.
 *
 * ══ APA YANG DINYATAKAN DI SINI ════════════════════════════════════════════
 * Empat dimensi, dan hanya empat. Kalau sebuah halaman punya keempatnya ia
 * halaman pemasaran; kalau sebuah halaman internal punya salah satunya, ada
 * yang salah:
 *
 *   1. **Skala hero** — satu judul yang LEBIH BESAR dari judul terbesar yang
 *      dipunyai aplikasi (`fontSizeHeading1` = 38px). Di ≥576px hero adalah
 *      38 × 1,4 ≈ 53px. Tidak ada halaman internal yang boleh punya teks
 *      sebesar itu: kepala halaman internal lewat `PageHeader`, dan `PageHeader`
 *      tidak pernah melampaui skala heading AntD.
 *   2. **Bobot CTA** — aksi utama diulang (hero, tiap kartu paket, penutup),
 *      selalu `Button size="lg"`, selalu berpasangan primer + garis, dan di
 *      layar sempit melebar penuh. Di app internal aksi utama muncul SEKALI,
 *      di `PageHeader.actions`.
 *   3. **Irama antar-seksi** — 64px di ponsel, 96px di ≥576px. Kerapatan
 *      MASTER.md (6/10) memberi 24px antar-bagian; irama pendaratan tiga sampai
 *      empat kali lipatnya karena halaman ini dibaca sambil menggulung, bukan
 *      dikerjakan.
 *   4. **Lebar maksimum** — kolom teks berhenti di 42rem, seksi di 72rem, dan
 *      keduanya berada DI TENGAH. App internal memakai lebar penuh area kerja;
 *      tabel 12 kolom tidak boleh dipotong demi ukuran baca yang nyaman.
 *
 * ══ BOLEH PUNYA TOKEN SENDIRI — TAPI SEBAGAI TURUNAN, DAN BERPAGAR ═════════
 * Keputusannya: **ya, pendaratan boleh punya skalanya sendiri**, karena tanpa
 * itu satu-satunya jalan menuju hero 53px adalah angka yang diketik langsung di
 * sebuah `style` — dan angka seperti itu bisa disalin ke mana saja tanpa
 * meninggalkan jejak yang bisa dicari siapa pun.
 *
 * Dua syarat yang membuat izin itu tidak menjadi paletnya sendiri:
 *
 *  • **Setiap nilai adalah TURUNAN token AntD** (`calc()` di atas
 *    `--ant-font-size-*`, `--ant-margin-*`, `--ant-padding-*`). Kalau skala
 *    tipografi aplikasi berubah, skala pemasaran ikut bergerak — ia tidak bisa
 *    menyimpang menjadi tipografi kedua. Yang bukan turunan hanya tiga LEBAR
 *    (72/48/42rem), karena aplikasi internal memang tidak punya token untuk
 *    "kolom baca": ia tidak pernah membutuhkannya.
 *  • **Deklarasinya hidup di dalam `[data-landing]`, bukan `:root`.** Blok di
 *    bawah hanya ikut ke dokumen bila sebuah komponen `components/landing/**`
 *    dirender. Menyalin `var(--sai-landing-font-size-hero)` ke halaman internal
 *    karena itu tidak menghasilkan hero — ia menghasilkan properti yang tidak
 *    pernah teratasi, dan teks itu diam-diam mewarisi ukuran induknya.
 *
 * Pagar terakhirnya bukan CSS melainkan `tests/landing-boundary.test.ts`:
 * app internal tidak boleh mengimpor apa pun dari `components/landing/**` (dan
 * sebaliknya), string `--sai-landing-` dan atribut `data-landing` tidak boleh
 * muncul di luar direktori ini, dan blok di bawah tidak boleh dideklarasikan
 * pada selektor global. Jadi menyalin hero ke halaman internal berhenti menjadi
 * "kelas yang tidak diperiksa siapa pun" dan menjadi **impor yang ditolak
 * penjaga**.
 */
import type { CSSProperties } from "react";

import {
  TONE_HUES,
  TONE_HUE_TOKEN,
  toneMix,
  type ToneHue,
} from "@/lib/theme/tone-recipe";

/* ------------------------------------------------------------------------ */
/* NADA PEKAT — pita seksi & kartu berisi solid (permintaan pemilik)          */
/* ------------------------------------------------------------------------ */

/**
 * Empat nada halaman ini, dinamai menurut PERANNYA, bukan menurut anak tangga
 * paletnya.
 *
 * ══ Kenapa hanya empat, dan kenapa keempatnya dingin ═══════════════════════
 * Keluhan pemilik ("gunakan warna solid juga, jangan hanya outline atau border
 * saja") menarik ke arah yang berlawanan dengan pola yang memang benar untuk
 * produk keuangan: navy/abu korporat, biru kepercayaan, aksen hanya untuk CTA.
 * Yang menyelesaikan tegangan itu bukan kompromi jumlah warna melainkan
 * PERANNYA — warna di sini membawa hierarki (mana wilayah, mana yang disorot),
 * bukan hiasan.
 *
 * Karena itu paletnya dikurung pada empat hue yang di aplikasi ini **tidak
 * memikul arti apa pun**: biru merek, cyan, indigo (`geekblue`), dan violet.
 * Hijau, merah, emas, dan jingga sengaja TIDAK dipakai sebagai nada dekoratif —
 * keempatnya sudah menjadi bahasa uang & status (`colorMoney*`, `colorSuccess`,
 * `colorWarning`, `colorError`). Pita hijau selebar layar di halaman yang
 * menjual pembukuan akan terbaca sebagai pernyataan tentang angka, bukan
 * sebagai wilayah.
 *
 * ══ Kenapa `color-mix()`, bukan anak tangga palet langsung ═════════════════
 * Tangga warna AntD ADA sebagai variabel (`--ant-blue-1` … `--ant-blue-10`,
 * terukur: 110 variabel palet di blok token, di kedua tema) dan ia MEMBALIK di
 * tema gelap: `blue-1` terang `#e6f4ff`, `blue-1` gelap `#111a2c`. Balikan itu
 * berguna untuk teks, tetapi tidak untuk PERMUKAAN: `blue-1` gelap (`#111a2c`)
 * praktis sewarna latar halaman gelap (`#141414`) — pita yang hilang di satu
 * tema tanpa ada yang gagal.
 *
 * `color-mix()` menyelesaikannya dengan satu resep untuk kedua tema: hue pekat
 * (`--ant-<hue>-6`) dicampur ke permukaan yang SEDANG berlaku
 * (`--ant-color-bg-container` / `--ant-color-bg-elevated`). Hasilnya opak —
 * benar-benar bidang berisi, bukan `colorFillQuaternary` yang translusen — dan
 * ia otomatis menjadi tint terang di tema terang dan tint gelap di tema gelap,
 * tanpa satu pun cabang tema di kode ini.
 *
 * ⚠ Sejak #303 aritmetika itu tidak lagi tinggal di berkas ini melainkan di
 * `@/lib/theme/tone-recipe` — permukaan kedua (`/platform`) mendeklarasikan
 * nadanya sendiri dari resep yang SAMA, dengan lingkup `[data-platform]`
 * sendiri. Yang diangkat hanya resepnya; ANGKA di bawah tetap milik halaman
 * ini, sebab kadar campuran dibatasi tombol dan latar yang dipikul masing-
 * masing permukaan — dan keduanya berbeda di sana.
 *
 * ══ Kadar campurannya BUKAN selera — ia dibatasi tombol primer ═════════════
 * Isian tombol primer di tema gelap (`#1668dc`) hanya berjarak 3,55:1 dari
 * latar halaman. Setiap tint menerangkan latar itu dan karena itu MEMAKAN
 * jarak tersebut; ambang 3:1 (grafis non-teks, MASTER.md §Ambang kontras)
 * tercapai di sekitar 18%. Karena itu:
 *
 *   • pita (`band-*`) berhenti di 10%, pita ajakan di 16% — ketiganya masih
 *     ≥3,11:1 terhadap tombol primer di tema gelap, jadi tombol boleh berdiri
 *     di ATAS pita;
 *   • kartu berisi (`fill-*`, 14%) dan kotak ikon (`chip-*`, 28%) dicampur ke
 *     `colorBgElevated` dan sudah DI BAWAH ambang itu (2,82 / 2,44) — jadi
 *     **tidak boleh ada tombol primer di atas `fill-*`/`chip-*`**. Kartu paket,
 *     satu-satunya kartu yang memikul tombol, karena itu berbadan
 *     `--sai-landing-surface` dan hanya KEPALANYA yang berisi nada.
 *
 * Angkanya dihitung ulang setiap kali suite berjalan di
 * `tests/landing-colors.test.ts`, dari token yang benar-benar terpasang — jadi
 * versi AntD baru tidak bisa menggeser satu pun di antaranya diam-diam.
 */
export const LANDING_HUES = TONE_HUES;

export type LandingHue = ToneHue;

/**
 * Peran → keluarga palet AntD.
 *
 * Sejak #303 pemetaannya milik `@/lib/theme/tone-recipe` — dua permukaan
 * memakainya, dan dua salinan akan berbeda pada hari salah satunya disetel.
 * Nama lama dipertahankan sebagai alias supaya pemanggil di direktori ini
 * tidak perlu tahu bahwa sumbernya pindah.
 */
export const LANDING_HUE_TOKEN = TONE_HUE_TOKEN;

/** Kadar campuran per peran, dalam persen. Alasannya di komentar di atas. */
/*
 * ⚠ `band` 10% → 14% dan `accent` 16% → 18% saat warna merek menjadi navy.
 *
 * Kadar lama diturunkan dari isian tombol BIRU LAMA (`#1668dc`), yang hanya
 * berjarak 3,55:1 dari latar gelap — jarak setipis itu yang dulu menahan pita
 * di 10%. Isian navy (`#2F6FBF`) punya jarak berbeda, jadi batasnya diukur
 * ULANG terhadap ketiga ambang yang benar-benar mengikat:
 *
 *   • teks & teks sekunder di atas pita  ≥ 4,5:1
 *   • isian tombol primer di atas pita   ≥ 3:1   (hero & ajakan penutup)
 *   • TEPI tombol garis di atas pita     ≥ 3:1   (tombol "Masuk" di hero)
 *
 * Hasil sapuan per hue, diambil yang TERKECIL dari kedua tema:
 *
 *   brand 20% · cyan 14% · indigo 18% · violet 16%   →  seragam 14%
 *
 * Cyan yang mengikat, dan ia mengikat di tema GELAP lewat isian tombol. Aksen
 * memakai hue merek (batas 20%), diambil 18% supaya tetap bermargin.
 *
 * Ini menjawab keluhan "warnanya masih sangat pudar": pita naik 40% lebih pekat
 * dan aksen 12,5%, tanpa satu ambang pun ditawar.
 * `tests/landing-colors.test.ts` menghitung ulang semuanya dari token yang
 * benar-benar terpasang — jadi angka di atas tidak bisa basi diam-diam.
 */
export const LANDING_MIX = {
  band: 14,
  /*
   * ⚠ Sejak #401 `accent` TIDAK lagi menjadi pita ajakan penutup — penutup
   * kini pita PEKAT (`--sai-landing-band-solid`, lihat PITA di bawah).
   * Tokennya TETAP ADA karena masih dipakai tepat sekali: sorotan radial di
   * kuadran hero (`landing-hero.tsx`), yang memang harus lebih pekat daripada
   * `band-brand` di bawahnya supaya hero punya satu sumber cahaya. Kadarnya
   * tetap dikunci ambang tombol primer (hero memikul tombol), jadi ia tidak
   * boleh dinaikkan hanya karena tidak lagi memikul ajakan penutup.
   */
  accent: 18,
  fill: 14,
  chip: 28,
} as const;

/**
 * Kadar putih untuk teks REDUP di atas pita pekat — DIUKUR, bukan 85%.
 *
 * Kebiasaan "teks sekunder = putih 85%" gagal di sini karena isian navy tema
 * gelap (`#2F6FBF`) hanya berjarak 5,06:1 dari putih penuh; setiap persen
 * transparansi memakan jarak itu. Terukur di `tests/landing-colors.test.ts`:
 * 85% → 4,14:1 (gelap, GAGAL) · 90% → 4,44 (GAGAL) · 92% → 4,56 (lolos).
 * Hierarki teks utama/redup di pita ini karena itu datang terutama dari
 * UKURAN (judul seksi vs 14px), bukan dari selisih warnanya yang tipis.
 */
export const LANDING_ON_SOLID_MUTED_PCT = 92;

/**
 * Lebar kartu ponsel di komposisi hero (#401), dalam px. Dipakai dua kali dan
 * harus sama di keduanya: lebar kartunya sendiri, dan ruang yang disisakan
 * label contoh di kaki kerangka supaya kalimatnya tidak tertutup kartu itu.
 */
export const LANDING_PHONE_WIDTH = 168;

const mix = (hue: LandingHue, pct: number, base: "container" | "elevated") =>
  toneMix(hue, pct, base);

/**
 * Deklarasi nada, DIBANGKITKAN dari satu resep.
 *
 * Ditulis bangkit, bukan dua belas baris tangan, karena yang harus tidak bisa
 * menyimpang justru resepnya: dua belas baris tangan akan berbeda kadarnya pada
 * hari seseorang menyetel satu di antaranya dan lupa sebelas sisanya.
 */
const NADA = LANDING_HUES.flatMap((hue) => [
  `--sai-landing-fill-${hue}:${mix(hue, LANDING_MIX.fill, "elevated")};`,
  `--sai-landing-chip-${hue}:${mix(hue, LANDING_MIX.chip, "elevated")};`,
]).join("");

const PITA = [
  `--sai-landing-band-brand:${mix("brand", LANDING_MIX.band, "container")};`,
  `--sai-landing-band-cyan:${mix("cyan", LANDING_MIX.band, "container")};`,
  `--sai-landing-band-indigo:${mix("indigo", LANDING_MIX.band, "container")};`,
  `--sai-landing-band-accent:${mix("brand", LANDING_MIX.accent, "container")};`,
  /* ══ PITA PEKAT — satu-satunya bidang navy penuh di halaman ini (#401) ═══
     Ajakan penutup. BUKAN tint: ia `--ant-color-brand-solid` apa adanya —
     token isian merek yang memang memikul teks terang (11,50:1 terang ·
     5,06:1 gelap, `lib/theme/antd-tokens.ts` §brandSolid). Ia BUKAN tangga
     biru AntD (yang membalik di tema gelap) dan BUKAN `SIDER_BG_DARK`;
     `landing.md` §Yang DITOLAK direvisi eksplisit untuk ini, dengan angkanya.
     Teks di atasnya `colorTextLightSolid`; teks REDUP di atasnya bukan
     `colorTextSecondary` (2,2:1 di navy) melainkan putih yang dicampur ke
     transparan — dan kadarnya DIUKUR, bukan diambil dari kebiasaan "85%":
     85% putih di atas `#2F6FBF` (gelap) hanya 4,14:1. 92% adalah kadar
     terendah yang lolos 4,5:1 di kedua tema (`tests/landing-colors.test.ts`). */
  `--sai-landing-band-solid:var(--ant-color-brand-solid);`,
  `--sai-landing-on-solid:var(--ant-color-text-light-solid);`,
  `--sai-landing-on-solid-muted:color-mix(in srgb, var(--ant-color-text-light-solid) ${LANDING_ON_SOLID_MUTED_PCT}%, transparent);`,
].join("");

/**
 * Warna GLIF di dalam kotak ikon sehue.
 *
 * Anak tangga ke-8, dan justru di sini balikan tangga AntD bekerja untuk kita:
 * `-8` gelap di tema terang dan terang di tema gelap, sedangkan kotaknya
 * (`chip-*`) bergerak ke arah yang sama. Satu nama token, dua tema, terukur
 * 4,51–8,27:1 — jauh di atas ambang ikon 3:1.
 */
const GLYPH: Record<LandingHue, string> = {
  /* ⚠ `brand` memakai `--ant-color-primary`, bukan `--ant-blue-8`. Sejak warna
     merek menjadi navy, blue-8 bukan lagi anak tangga merek — glif biru terang
     di atas kotak bernada navy adalah dua hue di satu lambang. Primary bekerja
     di KEDUA tema tanpa cabang: gelap di tema terang, terang di tema gelap,
     dan kotaknya bergerak ke arah yang sama. */
  brand: "var(--ant-color-primary)",
  cyan: "var(--ant-cyan-8)",
  indigo: "var(--ant-geekblue-8)",
  violet: "var(--ant-purple-8)",
};

export const landingGlyph = (hue: LandingHue) => GLYPH[hue];

/**
 * Nada isi kartu (14%) dan nada kotak ikon / kepala kartu tersorot (28%).
 *
 * Nama variabelnya ditulis UTUH di kedua peta ini, tidak dirangkai dari
 * `hue` — dan itu bukan kerapian. `tests/landing-boundary.test.ts` mencocokkan
 * setiap `var(--sai-landing-…)` yang dipakai dengan yang dideklarasikan; nama
 * yang dirangkai lewat template hanya terbaca sebagai `--sai-landing-fill-` di
 * pemindainya, sehingga satu salah ketik pada hue akan lolos penjaga DAN lolos
 * peramban (properti kustom yang tak teratasi tidak menghasilkan galat apa
 * pun — elemennya diam-diam mewarisi latar induknya). Ditulis utuh, keduanya
 * juga bisa di-grep.
 */
const FILL: Record<LandingHue, string> = {
  brand: "var(--sai-landing-fill-brand)",
  cyan: "var(--sai-landing-fill-cyan)",
  indigo: "var(--sai-landing-fill-indigo)",
  violet: "var(--sai-landing-fill-violet)",
};

const CHIP: Record<LandingHue, string> = {
  brand: "var(--sai-landing-chip-brand)",
  cyan: "var(--sai-landing-chip-cyan)",
  indigo: "var(--sai-landing-chip-indigo)",
  violet: "var(--sai-landing-chip-violet)",
};

export const landingFill = (hue: LandingHue) => FILL[hue];

/**
 * Isian kartu bernada dengan KEDALAMAN — satu bidang rata diganti gradien
 * dua-henti yang sangat tipis.
 *
 * ══ KENAPA ═════════════════════════════════════════════════════════════════
 * Sesudah tepi kartu dicabut, yang tersisa adalah persegi berwarna rata — dan
 * bidang rata tanpa tepi itulah yang membuat halaman terbaca POLOS. Yang
 * mengembalikan dimensinya bukan tepi (itu justru yang baru saja dibuang)
 * melainkan CAHAYA: sedikit lebih terang di atas, sedikit lebih pekat di bawah,
 * seperti permukaan yang menerima cahaya dari arah yang sama dengan sorotan
 * radial di hero.
 *
 * Selisihnya sengaja kecil (nada murni → 60% nada di atas permukaan). Lebih
 * dari itu dan kartunya berhenti terbaca sebagai satu bidang; ia menjadi dua.
 *
 * ⚠ Ini BUKAN bayangan. MASTER.md §Jarak, radius, bayangan melarang menulis
 * `box-shadow` sendiri — nilainya berlapis tiga dan disetel per algoritma tema.
 * Kedalaman di sini datang dari isian, yang memang milik pemanggil.
 */
export const landingFillSoft = (hue: LandingHue) =>
  `linear-gradient(180deg, color-mix(in srgb, ${FILL[hue]} 60%, var(--sai-landing-surface)) 0%, ${FILL[hue]} 100%)`;

export const landingChip = (hue: LandingHue) => CHIP[hue];

/**
 * Permukaan kartu yang berdiri DI ATAS pita berwarna.
 *
 * `colorBgElevated`, bukan `colorBgContainer`: di tema gelap permukaan halaman
 * (`#141414`) lebih gelap daripada pita mana pun di atas, jadi kartu
 * `colorBgContainer` akan terbaca CEKUNG — kebalikan dari yang dimaksud. Yang
 * jujur harus ikut ditulis: jenjangnya tetap tipis (1,01–1,06:1 di tema gelap),
 * dan yang benar-benar memisahkan kartu dari pitanya di sana adalah tepinya
 * (`colorBorderSecondary`, ≥3,05:1 sejak #208) — persis keadaan yang sudah
 * berlaku di seluruh app dan dicatat MASTER.md §Jenjang permukaan. Karena itu
 * kartu di atas pita TIDAK boleh kehilangan `border`-nya.
 */
export const LANDING_SURFACE = "var(--sai-landing-surface)";

/**
 * Titik patah tunggal halaman ini = `screenSM` AntD (576px), bukan `sm:`
 * Tailwind (640px). Angkanya ditulis tangan karena token layar TIDAK ikut
 * diterbitkan sebagai variabel CSS oleh `cssVar` — hanya token bernilai
 * warna/ukuran yang ikut. Kalau AntD kelak menggeser `screenSM`, geser angka
 * ini pada saat yang sama: seluruh pendaratan berpatah di satu titik ini saja,
 * jadi selisihnya akan terlihat sebagai kepala versi ponsel yang bertahan
 * sementara isinya sudah versi lebar (kegagalan yang sama yang tercatat di
 * kepala `app/(app)/(auth)/loading.tsx`).
 */
export const LANDING_BREAKPOINT = 576;

/**
 * Titik patah KEDUA — dan satu-satunya, khusus untuk tautan seksi di bilah atas.
 *
 * ══ KENAPA ADA PENGECUALIAN DARI "SATU TITIK PATAH" ════════════════════════
 * Halaman ini sengaja berpatah di satu titik saja (lihat `LANDING_BREAKPOINT`),
 * dan aturan itu masih benar untuk ISI. Bilah atas berbeda: ia bukan kolom yang
 * mengalir melainkan satu baris yang harus memuat merek + empat tautan +
 * pemilih bahasa + dua tombol SEKALIGUS.
 *
 * Diukur di peramban, bukan diperkirakan: dengan tautan seksi tampil, bilah itu
 * menuntut **685px**. Menampilkannya mulai 576px karena itu membuat halaman
 * MENGGULUNG MENDATAR di seluruh rentang 576–685px — cacat yang dilarang tegas
 * ("no horizontal scroll") dan yang tidak terlihat di dua ukuran yang biasa
 * ditangkap layar (1920 dan 390).
 *
 * 768px memberi kelonggaran di atas 685px yang terukur itu, dan ia titik patah
 * tablet yang lazim. Di bawahnya tautan seksi disembunyikan — yang hilang tidak
 * ada: seksinya berurutan ke bawah, dan kolom PRODUK di kaki halaman memuat
 * jangkar yang sama.
 *
 * ⚠ Jangan menambah titik patah ketiga tanpa mengukur lebih dulu. Yang
 * membenarkan yang satu ini adalah angka, bukan selera.
 */
export const LANDING_NAV_LINKS_BREAKPOINT = 768;

/**
 * Titik patah KETIGA — `screenLG` AntD (992px), dipakai oleh dua hal (#401):
 * galeri layar (1 kartu besar + 2 kecil) dan kemunculan kartu ponsel di hero.
 *
 * Ditambahkan sesudah diukur, bukan sebelumnya (syarat `landing.md`): pada
 * pembagian 3fr:2fr kolom kanan baru mencapai ~360px — lebar minimum agar
 * kerangka aplikasi di dalamnya masih memuat sidebar berikon (aturan
 * `@container` di `LANDING_STYLE`) — mulai 992px. Di 768–991px kolom kanan
 * 270–360px: kerangka faktur kehilangan sidebarnya sementara kerangka jurnal
 * di sebelahnya masih punya, dan dua kerangka yang tidak sebentuk berdampingan
 * terbaca sebagai bug. Bertumpuk satu kolom di bawah 992px karena itu bukan
 * kompromi melainkan bentuk yang benar.
 *
 * Kerangka aplikasi sendiri TIDAK memakai titik patah viewport sama sekali —
 * bentuk dalamnya mengikuti lebar kerangkanya (`@container`), sebab satu
 * kerangka berdiri di tiga lebar berbeda pada viewport yang sama.
 */
export const LANDING_WIDE_BREAKPOINT = 992;

/**
 * Tinggi bilah atas yang menempel (`position: sticky`). Dipakai dua kali dan
 * harus sama di keduanya: oleh bilahnya sendiri, dan oleh jarak jangkar seksi
 * (`scroll-margin-top`) — tanpa itu tautan "#harga" menaruh judul seksinya
 * tepat DI BALIK bilah yang menempel.
 */
export const LANDING_NAV_HEIGHT = 64;

/**
 * Blok gaya halaman pendaratan — dipasang SEKALI oleh `LandingShell`.
 *
 * Isinya dua macam, dan keduanya memang tidak bisa ditulis sebagai gaya
 * sebaris: (a) deklarasi skala pemasaran beserta versi ≥576px-nya, dan (b)
 * keadaan yang hanya hidup di CSS — `:hover`, `:focus`, `details[open]`, dan
 * `prefers-reduced-motion`.
 *
 * Sasarannya atribut `data-landing-*`, bukan kelas: halaman ini tidak menyisakan
 * satu pun `className`, dan atribut membuat setiap aturan bisa dilacak balik ke
 * komponen yang memasangnya.
 */
export const LANDING_STYLE = `
[data-landing]{
  --sai-landing-font-size-hero:var(--ant-font-size-heading-2);
  --sai-landing-line-height-hero:var(--ant-line-height-heading-1);
  --sai-landing-tracking-hero:-0.02em;
  --sai-landing-font-weight-display:700;
  --sai-landing-font-size-section:var(--ant-font-size-heading-3);
  --sai-landing-font-size-lead:calc(var(--ant-font-size-lg) * 1.125);
  --sai-landing-font-size-body:var(--ant-font-size-lg);
  --sai-landing-rhythm:calc(var(--ant-margin-xl) * 2);
  --sai-landing-gutter:var(--ant-padding);
  --sai-landing-measure:72rem;
  --sai-landing-measure-narrow:48rem;
  --sai-landing-measure-copy:42rem;
  --sai-landing-cta-gap:var(--ant-margin-sm);
  --sai-landing-cta-space:var(--ant-margin-xl);
  --sai-landing-surface:var(--ant-color-bg-elevated);
  --sai-landing-radius:calc(var(--ant-border-radius-lg) * 2);
  --sai-landing-radius-control:calc(var(--ant-border-radius) * 2);
  --sai-landing-lift:calc(var(--ant-margin-xxs) * -0.75);
  ${PITA}
  ${NADA}
}
/* Perangkap madu formulir kontak: TERSEMBUNYI dari mata, tetap ada di DOM.
   Bukan display:none dan bukan type=hidden -- sebagian bot melewati keduanya
   justru karena mengenalinya sebagai perangkap. Teknik yang dipakai sama
   dengan tautan lewati-ke-isi di bawah: dikurung 1px dan dipotong. */
[data-landing-honeypot]{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;opacity:0;pointer-events:none}
[data-landing-skip]{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
[data-landing-skip]:focus{position:absolute;top:var(--ant-margin);left:var(--ant-margin);z-index:1000;width:auto;height:auto;clip:auto;padding:var(--ant-padding-xs) var(--ant-padding);border-radius:var(--ant-border-radius);background:var(--ant-color-primary);color:var(--ant-color-text-light-solid);text-decoration:none}
[data-landing-actions]{display:flex;flex-direction:column;gap:var(--sai-landing-cta-gap)}
[data-landing-chrome]{display:none;align-items:center;gap:var(--ant-margin-xs)}
[data-landing-chrome-narrow]{display:flex;align-items:center;gap:var(--ant-margin-xs)}
/* Tautan seksi di bilah atas. Disembunyikan di bawah 576px bersama sakelar
   bahasa/tema, dan karena alasan yang sama: bilah selebar ponsel hanya cukup
   untuk merek + dua pintu tanpa menyusutkan target sentuh. Yang hilang di sana
   tidak perlu diganti di kaki halaman seperti sakelar itu — seksinya memang
   berurutan ke bawah, jadi menggulung SUDAH jalan menuju semuanya. */
[data-landing-links]{display:none;align-items:center;gap:var(--ant-margin);list-style:none;margin:0;padding:0}
/* Kaki berkolom. Di ponsel SATU kolom (identitas lalu tiga daftar tautan);
   di >=576px kolom identitas mendapat 2fr karena ia memikul kalimat sedangkan
   tiga sisanya hanya daftar pendek. */
[data-landing-footer-grid]{display:grid;gap:var(--ant-margin-lg);grid-template-columns:1fr}
[data-landing-footer-bar]{display:flex;flex-direction:column;align-items:flex-start;gap:var(--ant-margin);margin-top:var(--ant-margin-xl);padding-top:var(--ant-padding);border-top:1px solid var(--ant-color-border-secondary)}
/* Hero dua kolom. Di ponsel SATU kolom dan purwarupa produk berada SESUDAH
   ajakan — bukan sebelumnya: di layar sempit gambar setinggi layar sebelum
   tombol berarti tombolnya terdorong ke bawah lipatan, dan yang dikorbankan
   adalah satu-satunya hal yang halaman ini minta orang lakukan. */
[data-landing-hero]{display:grid;gap:var(--ant-margin-xl);align-items:center}
/* == KERANGKA APLIKASI (#401): hero & galeri memakai satu bentuk =========
   Aturannya berbasis LEBAR KERANGKA (container query), bukan lebar viewport:
   kerangka yang sama berdiri di kolom hero (55% seksi), di kartu galeri
   besar (60%), dan di kartu galeri kecil (40%) -- tiga lebar berbeda pada
   satu viewport yang sama, jadi titik patah viewport tidak bisa menjawabnya.
   Peramban tanpa @container mendapat keadaan bawaannya: sidebar tampil tanpa
   label, PT kedua di pengalih tersembunyi -- kerangka yang lebih sederhana,
   bukan yang rusak.
     - <360px: sidebar disembunyikan (seperti app di ponsel: menu jadi laci),
       supaya tiga ubin angka masih punya ruang di kerangka selebar 288px;
     - >=520px: PT kedua tampil di pengalih, dan sidebar yang MEMINTA label
       (data-landing-frame-nav="wide", hanya hero) menampilkannya. */
[data-landing-frame]{container-type:inline-size}
[data-landing-frame-nav]{display:flex;flex-direction:column}
[data-landing-frame-caption]{padding-inline-end:var(--ant-padding)}
[data-landing-frame-nav-label]{display:none}
[data-landing-frame-alt]{display:none}
[data-landing-phone]{display:none}
@container (max-width:359px){
  [data-landing-frame-nav]{display:none}
}
@container (min-width:520px){
  [data-landing-frame-alt]{display:inline-flex}
  [data-landing-frame-nav="wide"] [data-landing-frame-nav-label]{display:inline}
}
/* Galeri: satu kolom sampai 992px; 1 besar + 2 kecil di blok media LG di bawah. */
[data-landing-gallery]{display:grid;gap:var(--ant-margin);grid-template-columns:minmax(0,1fr)}
/* Catatan "sudah diundang rekan kerja?" di hero (#397): disembunyikan di bawah
   576px, tampil kembali di blok media di bawah. Di ponsel hero satu kolom dan
   setiap baris di atas purwarupa mendorong sisa halaman ke bawah lipatan,
   sedangkan orang yang diundang datang lewat tautan di surelnya -- ia hampir
   tidak pernah membaca hero ini. Kalimatnya tetap di HTML; yang berubah hanya
   di layar mana ia memakan ruang. */
[data-landing-hero-note]{display:none}
[data-landing-brand]{transition:opacity 200ms ease}
[data-landing-brand]:hover{opacity:.8}
[data-landing-link]{transition:color 200ms ease}
[data-landing-link]:hover{color:var(--ant-color-text);text-decoration:underline;text-underline-offset:4px}
[data-landing-faq]{cursor:pointer;list-style:none}
[data-landing-faq]::-webkit-details-marker{display:none}
[data-landing-faq]:hover{color:var(--ant-color-link)}
[data-landing-faq]:focus-visible{outline:2px solid var(--ant-color-primary-border);outline-offset:2px}
[data-landing-caret]{transition:transform 200ms ease}
/* == KARTU YANG HIDUP, BUKAN KOTAK YANG DIAM =============================
   Sampai perubahan ini tak satu pun dari ~20 kartu di halaman ini punya
   keadaan hover. Halaman yang tidak menjawab kursor terbaca sebagai gambar,
   bukan sebagai perangkat lunak -- dan untuk halaman yang MENJUAL perangkat
   lunak itu kesan yang salah.

   Yang dianimasikan hanya transform + box-shadow: keduanya properti komposit,
   jadi tidak ada tata letak yang dihitung ulang saat kursor bergerak melintasi
   kisi. Angkatnya kecil (3px) dan bayangannya token AntD, bukan tulisan tangan
   (MASTER.md melarang box-shadow sendiri: nilainya berlapis tiga per tema). */
/* == PEMISAH SEKSI YANG MELELEH DI TEPI ===================================
   Garis penuh selebar layar adalah elemen paling "kertas bergaris" di halaman
   ini: enam hairline lurus dari tepi kiri ke tepi kanan. Mencabutnya bukan
   pilihan -- diukur pada token yang benar-benar terpasang, selisih pita
   terhadap latar halaman hanya 1,09:1 di tema terang dan 1,14:1 di tema gelap,
   jadi warna sendirian TIDAK menggambar batas wilayah di kedua tema.

   Yang bisa diubah adalah bentuk garisnya. Gradien membuatnya pekat di tengah
   -- tepat di kolom tempat isi berdiri dan batas itu memang perlu dibaca --
   lalu meleleh menjadi nol sebelum mencapai tepi viewport. Batasnya tetap ada,
   kesan "digaris" hilang.

   Dipasang sebagai ::before, bukan border-top: sebuah border tidak bisa
   memiliki gradien sepanjang jalurnya. */
/* Bilah atas: kisi TIGA kolom, bukan space-between. Dengan space-between
   posisi kelompok tengah ditentukan lebar kedua tetangganya -- terukur, tautan
   seksi mendarat ~66px di kiri titik tengah sebenarnya, dan selisih sebesar itu
   terbaca sebagai salah sejajar, bukan sebagai tata letak. "1fr auto 1fr"
   menaruhnya di tengah tanpa bergantung pada lebar merek atau tombol.
   Tiga kolom itu HANYA mulai 768px (tautan tampil); di bawahnya dua kolom --
   alasannya di blok berikutnya. */
[data-landing-nav]{display:grid;grid-template-columns:auto 1fr;position:relative}
[data-landing-nav-actions]{justify-self:end}
/* == BILAH DI BAWAH 768px: DUA KOLOM, MEREK TANPA TEKS DI BAWAH 576px (#398) ==
   Kisi tiga kolom di bawah membagi ruang SISA rata ke kolom merek dan kolom
   ketiga yang kosong; begitu tombol menu ikut ke kolom aksi, ruang itu habis
   dan teks merek patah dua baris (terlihat di 390px). Di bawah 768px kolom
   tengah memang kosong (tautan disembunyikan), jadi kisinya cukup dua kolom:
   merek selebar isinya, aksi mengisi sisanya dan rapat ke kanan.

   Di bawah 576px teks merek disembunyikan secara VISUAL, bukan dihapus:
   tautan mereknya harus tetap punya nama untuk pembaca layar. Tekniknya sama
   dengan tautan lewati-ke-isi. Di atasnya teks kembali, dan nowrap menjaganya
   tidak patah lagi pada lebar mana pun. */
[data-landing-brand-name]{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
/* == MENU PONSEL: details/summary, tanpa JavaScript (#398) ================
   Tombol 40px (target sentuh MASTER.md) berisi dua ikon yang bertukar lewat
   [open] -- tanpa skrip: menu bertanda X saat terbuka, tanda garis tiga saat
   tertutup. Panelnya ABSOLUT di bawah bilah: ia tidak mendorong isi dan tidak
   mengubah tinggi bilah yang dipakai scroll-margin-top jangkar seksi.
   Permukaannya opak (surface) di atas bilah yang 92% translusen, dan tepi
   bawah + bayangan token AntD memisahkannya dari isi yang lewat di baliknya.
   Disembunyikan seluruhnya mulai 768px, tempat tautan seksi tampil di bilah. */
[data-landing-menu-toggle]{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:var(--sai-landing-radius-control);border:1px solid var(--ant-color-border);background:transparent;color:var(--ant-color-text);font-size:var(--ant-font-size-lg);cursor:pointer;list-style:none}
[data-landing-menu-toggle]::-webkit-details-marker{display:none}
[data-landing-menu-toggle]:hover{border-color:var(--ant-color-primary);color:var(--ant-color-primary)}
[data-landing-menu-toggle]:focus-visible{outline:2px solid var(--ant-color-primary-border);outline-offset:2px}
[data-landing-menu-toggle] [data-landing-menu-close]{display:none}
[data-landing-menu][open] [data-landing-menu-toggle] [data-landing-menu-open]{display:none}
[data-landing-menu][open] [data-landing-menu-toggle] [data-landing-menu-close]{display:inline-flex}
[data-landing-menu-panel]{position:absolute;top:100%;left:0;right:0;padding:var(--ant-padding-xs) var(--sai-landing-gutter) var(--ant-padding);background:var(--sai-landing-surface);border-bottom:1px solid var(--ant-color-border-secondary);border-radius:0 0 var(--sai-landing-radius) var(--sai-landing-radius);box-shadow:var(--ant-box-shadow)}
/* Garis bawah bilah meleleh di tepi, sama dengan pemisah seksi -- bilah ini
   menempel sepanjang gulungan, jadi ia garis yang paling lama dilihat orang. */
[data-landing-nav]::after{content:"";position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent 0%,var(--ant-color-border-secondary) 16%,var(--ant-color-border-secondary) 84%,transparent 100%)}
[data-landing-divider]{position:relative}
[data-landing-divider]::before{content:"";position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent 0%,var(--ant-color-border-secondary) 16%,var(--ant-color-border-secondary) 84%,transparent 100%)}
[data-landing-card]{transition:transform 220ms ease,box-shadow 220ms ease}
[data-landing-card]:hover{transform:translateY(var(--sai-landing-lift));box-shadow:var(--ant-box-shadow)}
/* Kendali di halaman ini lebih bulat daripada di app internal. Radius app
   (6px) dipilih untuk kerapatan data; pendaratan tidak memikul tabel, dan
   sudut yang lebih lunak adalah selisih terbesar antara "berwibawa" dan
   "kaku" pada bidang sebesar tombol ajakan. Diturunkan dari token yang sama,
   jadi ia bergerak bila skala radius app bergerak. */
[data-landing] .ant-btn{border-radius:var(--sai-landing-radius-control)}
[data-landing] details[open] [data-landing-caret]{transform:rotate(180deg)}
@media (min-width:${LANDING_BREAKPOINT}px){
  [data-landing]{
    /* == HERO YANG IKUT LEBAR LAYAR ======================================
       Sebelumnya satu angka mati: 38 x 1,4 = 53px, sama persis di 576px dan
       di 2560px. Di monitor lebar hero itu berhenti terbaca sebagai hero --
       ia hanya judul agak besar di tengah kolom 72rem.

       clamp() dengan KEDUA UJUNG turunan --ant-font-size-heading-1:
       lantainya 1,1x (~42px, masih di atas langit-langit app 38px) dan
       langit-langitnya 1,6x (~61px). Suku tengah 4.5vw hanya menentukan
       LAJU di antara keduanya -- ia tidak bisa membawa hero keluar dari
       rentang yang tetap ditentukan skala aplikasi, jadi syarat "skala
       pemasaran adalah TURUNAN skala aplikasi" tetap dipenuhi di kedua
       ujungnya (dan tests/landing-boundary.test.ts kini memeriksa
       keduanya, bukan satu angka seperti sebelumnya).

       == LANGIT-LANGIT 1,3x SEJAK #401, BUKAN 1,6x -- DIUKUR ===============
       Kolom kalimat hero menyusut ke 45% (kerangka aplikasi memikul 55%),
       yaitu ~497px di 1440px. Diukur dengan metrik Inter yang terpasang:
       pada 60,8px (1,6x) SETIAP judul <= 8 kata yang dicoba patah tiga baris
       di kolom itu; pada 49,4px (1,3x) judul ID/EN/ZH yang dipilih dua baris.
       Suku tengah 3,6vw (dulu 4,5vw) supaya laju kenaikannya mencapai
       langit-langit baru di ~1370px, bukan melompat ke langit-langit di 990px.
       Kedua ujung tetap turunan --ant-font-size-heading-1 dan tetap di atas
       skala app (1,1x lantai), jadi syarat "skala pemasaran adalah TURUNAN
       skala aplikasi" tidak berubah.

       CATATAN PENYUNTING: blok ini hidup di dalam sebuah template literal,
       jadi komentar di sini TIDAK BOLEH memuat backtick. Satu backtick
       menutup literalnya, dan galatnya muncul sebagai puluhan baris
       "Declaration expected" yang menunjuk ke mana-mana kecuali ke sini. */
    --sai-landing-font-size-hero:clamp(calc(var(--ant-font-size-heading-1) * 1.1), 3.6vw, calc(var(--ant-font-size-heading-1) * 1.3));
    --sai-landing-font-size-section:var(--ant-font-size-heading-2);
    --sai-landing-rhythm:calc(var(--ant-margin-xxl) * 2);
    --sai-landing-gutter:var(--ant-padding-lg);
  }
  [data-landing-actions]{flex-direction:row}
  [data-landing-hero-note]{display:block}
  [data-landing-chrome]{display:flex}
  [data-landing-chrome-narrow]{display:none}
  [data-landing-brand-name]{position:static;width:auto;height:auto;overflow:visible;clip:auto}
  [data-landing-footer-grid]{grid-template-columns:2fr 1fr 1fr 1fr;gap:var(--ant-margin-xl)}
  [data-landing-footer-bar]{flex-direction:row;align-items:center;justify-content:space-between}
}
@media (min-width:${LANDING_NAV_LINKS_BREAKPOINT}px){
  [data-landing-links]{display:flex}
  [data-landing-nav]{grid-template-columns:1fr auto 1fr}
  [data-landing-menu]{display:none}
  /* == HERO DUA KOLOM MULAI 768px, BUKAN 576px (#401) -- DIUKUR ============
     Sampai #401 hero berkolom dua sejak 576px dengan purwarupa satu kartu
     ringkasan yang muat di 206px. Kerangka aplikasi (sidebar 40px + tiga ubin
     angka "Rp 184.500.000" + grafik) TIDAK muat di sana: di 576px kolom
     purwarupanya 206px, ubin nominal 14px tabular menuntut ~118px masing-
     masing. Diukur: 576-767px satu kolom, kerangka selebar isi (528-720px)
     dan tiga ubin sebaris; mulai 768px dua kolom 45:55 -- kerangka memikul
     55% (permintaan issue: komposisi +-55% lebar seksi) dan kalimat 45%,
     sebab yang kini menjual adalah GAMBAR produknya, dan judulnya sudah
     dipendekkan (<= 8 kata) supaya muat di kolom yang lebih sempit.
     Jaraknya margin-xxl (48px), bukan rhythm (96px): dengan 96px kolom
     kalimat di 768px tinggal 281px. Kartu ponsel BELUM muncul di sini --
     lihat blok 992px di bawah. */
  [data-landing-hero]{grid-template-columns:minmax(0,9fr) minmax(0,11fr);gap:var(--ant-margin-xxl)}
}
@media (min-width:${LANDING_WIDE_BREAKPOINT}px){
  /* == KARTU PONSEL MULAI 992px, BUKAN 768px -- DIUKUR (#401) ==============
     Issue menyembunyikannya di bawah 768px. Diukur di 768px: kerangka hero
     370px, kartu ponsel 168px menutupi 45% kerangka -- separuh grafik dan
     ubin ketiga -- dan kaki kerangka hanya menyisakan 170px untuk kalimat
     "contoh tampilan". Di 992px kerangka 493px dan kartu menutupi 34%,
     hanya ujung kanan grafik. Kaki kerangka menyisakan ruang selebar kartu
     supaya kalimatnya tidak tertutup. */
  [data-landing-phone]{display:block}
  [data-landing-hero-frame] [data-landing-frame-caption]{padding-inline-end:calc(${LANDING_PHONE_WIDTH}px + var(--ant-margin))}
  /* == GALERI 1 BESAR + 2 KECIL (#401) ======================================
     Jurnal dominan di kiri (3fr ~ 60%), faktur & pengalih PT bertumpuk di
     kanan (2fr). Titik patahnya screenLG AntD (992px): di bawahnya kolom
     kanan < 360px dan kerangka faktur kehilangan sidebar-nya (aturan
     container di atas) -- tiga kerangka bertumpuk satu kolom lebih jujur
     daripada dua kolom yang salah satunya menyusut menjadi daftar. */
  [data-landing-gallery]{grid-template-columns:minmax(0,3fr) minmax(0,2fr)}
  [data-landing-gallery-main]{grid-row:1 / span 2}
}
@media (prefers-reduced-motion:reduce){
  [data-landing-brand],[data-landing-link],[data-landing-caret],[data-landing-card]{transition:none}
  [data-landing-card]:hover{transform:none}
}
/* == MUNCUL SAAT DIGULUNG -- TANPA SATU BARIS JAVASCRIPT ==================
   Pola pendaratan modern memakai scroll-reveal halus; pustaka yang biasa
   melakukannya (GSAP + ScrollTrigger) adalah JavaScript sisi klien, dan
   halaman ini membayarnya dengan hidrasi untuk pengunjung yang mungkin tidak
   pernah mendaftar -- persis yang dikunci AMBANG_KLIEN.

   animation-timeline: view() melakukannya di peramban, di thread compositor,
   tanpa satu pun berkas skrip. Tiga pagar yang membuatnya aman dipasang:

     - prefers-reduced-motion: no-preference -- bukan "reduce" yang mematikan,
       melainkan izin yang hanya menyala saat pengguna TIDAK meminta
       pengurangan gerak. Bedanya menentukan: dengan bentuk ini, peramban yang
       tidak mengerti kueri itu sama sekali tidak menganimasi.
     - @supports -- peramban tanpa dukungan tidak mendapat aturan apa pun, dan
       isinya tetap terlihat penuh. Itu sebabnya keadaan AKHIR-nya yang normal
       (opacity:1), bukan keadaan awalnya: kegagalan apa pun berarti "tidak ada
       animasi", tidak pernah "isi tak terlihat".
     - hanya translateY -- properti komposit; tidak ada width/height yang
       memaksa tata letak dihitung ulang.

   == KENAPA OPACITY DICABUT (dan ini bukan selera) =======================
   Versi pertama menganimasi opacity 0 -> 1. Itu bekerja benar saat orang
   BENAR-BENAR menggulung, dan gagal di setiap konteks yang TIDAK menggulung
   -- karena di sana seksi yang belum "masuk" berhenti di keadaan awalnya,
   yaitu tak terlihat. Terukur di Chromium 131 dengan viewport setinggi
   dokumen (bentuk yang dipakai perender halaman-penuh, termasuk perayap yang
   merender): tiga seksi terakhir -- harga, FAQ, ajakan penutup -- diam di
   opacity 0.

   Untuk halaman internal itu cacat kecil. Untuk halaman PEMASARAN yang
   justru baru diberi metadata & data terstruktur supaya ditemukan, itu
   risiko bahwa mesin pencari membaca bagian harga sebagai isi tersembunyi.
   Dengan hanya transform, kegagalan seburuk apa pun hanya menggeser teks
   14px -- isinya tidak pernah bisa hilang. Jangan menambahkan opacity ke
   keyframes di bawah.

   Jaraknya sengaja pendek (14px, entry 0% -> entry 40%): ini penegas ritme
   gulungan, bukan koreografi.

   CATATAN PENYUNTING: tanpa backtick -- lihat blok hero di atas. */
@media (prefers-reduced-motion:no-preference){
  @supports (animation-timeline:view()){
    @keyframes sai-landing-reveal{from{transform:translateY(14px)}to{transform:none}}
    [data-landing-reveal]{animation:sai-landing-reveal linear both;animation-timeline:view();animation-range:entry 0% entry 40%}
  }
}
/* Cetak tidak menggulung: matikan sisa gerak apa pun supaya halaman yang
   dicetak tidak pernah membawa pergeseran yang berhenti setengah jalan. */
@media print{
  [data-landing-reveal]{animation:none;transform:none}
}
`;

/** Judul hero — satu-satunya teks di aplikasi ini yang melampaui `heading1`. */
export const LANDING_HERO_TITLE: CSSProperties = {
  margin: 0,
  fontSize: "var(--sai-landing-font-size-hero)",
  lineHeight: "var(--sai-landing-line-height-hero)",
  letterSpacing: "var(--sai-landing-tracking-hero)",
  fontWeight:
    "var(--sai-landing-font-weight-display)" as CSSProperties["fontWeight"],
};

/** Judul seksi (`<h2>`) — satu tingkat di bawah hero, tetap di atas skala app. */
export const LANDING_SECTION_TITLE: CSSProperties = {
  margin: 0,
  fontSize: "var(--sai-landing-font-size-section)",
  letterSpacing: "var(--sai-landing-tracking-hero)",
  fontWeight:
    "var(--sai-landing-font-weight-display)" as CSSProperties["fontWeight"],
};

/** Kalimat pembuka di bawah judul hero. */
export const LANDING_LEAD: CSSProperties = {
  margin: 0,
  fontSize: "var(--sai-landing-font-size-lead)",
  /* 1,7 dan bukan 1,6: kalimat pembuka hero dibaca, tidak dipindai seperti
     label antarmuka. Selisih sepersepuluh terdengar sepele dan justru itu
     yang paling terasa pada blok tiga baris — ia yang memisahkan "padat" dari
     "sesak". */
  lineHeight: 1.7,
  color: "var(--ant-color-text-secondary)",
};

/** Kalimat pembuka di bawah judul seksi, dan paragraf penjelas seksi. */
export const LANDING_BODY: CSSProperties = {
  margin: 0,
  fontSize: "var(--sai-landing-font-size-body)",
  lineHeight: 1.7,
  color: "var(--ant-color-text-secondary)",
};

/**
 * Catatan kecil (uji coba, PPN, modul per perusahaan) — 14px, sekunder.
 *
 * Ukurannya ditulis eksplisit, BUKAN lewat `<small>`: latar dokumen ini 16px,
 * jadi `<small>` menghasilkan 12,8px — di bawah lantai 14px MASTER.md untuk
 * teks yang membawa keterangan harga.
 */
export const LANDING_NOTE: CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size)",
  lineHeight: 1.6,
  color: "var(--ant-color-text-secondary)",
};

/**
 * Kisi kartu pendaratan dengan JUMLAH KOLOM TERKUNCI.
 *
 * `repeat(auto-fit, minmax(<min>, 1fr))` telanjang berkembang sampai kolom
 * selebar `min` masih muat — di 1152px itu berarti empat sampai lima kolom
 * untuk kartu yang dirancang tiga. Suku `(100% - (n-1)×gap)/n` menahan lebar
 * minimum satu kolom pada pembagian n, jadi kisi ini tidak pernah melampaui
 * `columns` kolom, dan tetap turun sendiri menjadi dua lalu satu di layar
 * sempit — tanpa satu pun titik patah yang ditulis tangan.
 */
export function landingGrid(columns: number, min: number): CSSProperties {
  const gap = "var(--ant-margin)";
  const share = `(100% - ${columns - 1} * ${gap}) / ${columns}`;
  return {
    display: "grid",
    gap,
    gridTemplateColumns: `repeat(auto-fit, minmax(max(${min}px, ${share}), 1fr))`,
  };
}
