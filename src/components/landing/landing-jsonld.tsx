/**
 * Data terstruktur (JSON-LD) — satu primitif, dipakai di tempat DATANYA hidup.
 *
 * ══ KENAPA BUKAN SATU BLOK BESAR DI `app/page.tsx` ═════════════════════════
 * Data terstruktur adalah SALINAN KEDUA dari isi halaman, dalam bentuk yang
 * dibaca mesin. Salinan kedua yang ditulis jauh dari aslinya adalah salinan
 * yang akan menyimpang — dan menyimpangnya tidak berbunyi: halamannya tetap
 * benar, hanya cuplikan pencariannya yang perlahan menjadi bohong.
 *
 * Karena itu blok ini tidak dikumpulkan di satu tempat. `LandingFaq` menerbitkan
 * `FAQPage` dari array pertanyaan yang SAMA yang direndernya, dan
 * `LandingPricing` menerbitkan penawarannya dari `activePlans()` yang SAMA yang
 * mengisi kartunya. Menambah pertanyaan atau paket karena itu memperbarui
 * keduanya sekaligus, tanpa ada yang perlu ingat.
 *
 * ══ KENAPA `<` DILOLOSKAN ══════════════════════════════════════════════════
 * Isi blok ini sebagian datang dari basis data (nama & deskripsi paket dibuat
 * operator). `JSON.stringify` TIDAK meloloskan `<`, jadi sebuah nilai berisi
 * `</script>` akan menutup elemen ini lebih awal dan sisanya mendarat di
 * dokumen sebagai HTML — XSS lewat kolom katalog. Menggantinya dengan `<`
 * tetap JSON yang sah (parser membacanya kembali sebagai `<`) dan tidak bisa
 * lagi menutup elemen apa pun.
 *
 * `U+2028`/`U+2029` ikut diloloskan: keduanya sah di dalam string JSON tetapi
 * merupakan pemisah baris di JavaScript, dan sebagian parser lama tersedak
 * karenanya. Ditulis sebagai escape (bukan aksara harfiah) justru karena
 * aksaranya TAK TERLIHAT di penyunting mana pun.
 */

/** Bentuk minimal yang cukup untuk seluruh blok di halaman ini. */
export type JsonLdData = Record<string, unknown>;

function serialisasi(data: JsonLdData): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Satu blok `application/ld+json`.
 *
 * `dangerouslySetInnerHTML` memang diperlukan — isi `<script>` bukan teks yang
 * boleh di-escape React sebagai entitas HTML (`&quot;` di dalam JSON-LD
 * menjadikannya JSON yang tidak sah). Yang membuatnya aman adalah
 * `serialisasi()` di atas, bukan kepercayaan pada sumbernya.
 */
export function JsonLd({ data }: { data: JsonLdData }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialisasi(data) }}
    />
  );
}
