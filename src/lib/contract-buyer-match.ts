/**
 * Menjodohkan teks pembeli kontrak dengan master Pelanggan (migrasi 0057).
 *
 * Modul MURNI — tidak menyentuh Prisma, jaringan, atau `server-only`, sehingga
 * aturannya bisa diuji tanpa MySQL DAN tetap bisa diimpor skrip `tsx`
 * (`scripts/link-contract-customers.ts`). Sikap yang sama dengan
 * `@/lib/document-chain`: yang menentukan hidup di modul yang bisa dibaca ulang,
 * bukan di dalam satu berkas skrip yang hanya jalan sekali.
 *
 * ── DUA TINGKAT KELONGGARAN, DAN ITU DISENGAJA ─────────────────────────────
 * Migrasi 0057 menjodohkan dengan normalisasi SQL saja: dirapatkan spasinya,
 * dihuruf-kecilkan. `kunciPembeli` di bawah menambahkan satu langkah —
 * membuka entitas HTML — dan hanya dipakai oleh skrip.
 *
 * Bedanya bukan kelalaian. Migrasi berjalan sendiri saat rilis, tanpa ditonton
 * siapa pun; ia hanya boleh melakukan yang paling sedikit mengejutkan. Skrip
 * melaporkan setiap pembukaan entitas yang ditemukannya lalu menunggu bendera
 * `--tautkan` dari seorang manusia, jadi ia boleh melihat lebih jauh.
 *
 * Yang dijawab langkah tambahan itu, di data sungguhan: `Foshan Taste Import
 * &amp; Export Co., Ltd` (40 kontrak) dan `Foshan Taste Import & Export Co.,
 * Ltd` (77 kontrak) adalah SATU perusahaan yang tercatat dua kali karena
 * impor warisan tidak pernah membuka entitasnya. Tanpa langkah ini keduanya
 * akan melahirkan dua baris master, dan piutang satu pembeli terbelah dua.
 */

/** Entitas yang benar-benar muncul di data impor warisan, plus bentuk numerik. */
export function bukaEntitasHtml(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)));
}

/** Apakah teks ini masih membawa entitas HTML mentah? Dilaporkan, tidak diperbaiki. */
export function punyaEntitasHtml(s: string): boolean {
  return bukaEntitasHtml(s) !== s;
}

/**
 * Normalisasi migrasi 0057 — dirapatkan spasinya, dihuruf-kecilkan. Ditulis
 * terpisah supaya bisa dibandingkan langsung dengan SQL-nya saat dibaca ulang.
 */
export function normalkanNama(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Kunci penjodohan skrip: normalisasi migrasi, lalu entitas HTML dibuka. */
export function kunciPembeli(nama: string): string {
  return normalkanNama(bukaEntitasHtml(nama));
}

/** Nama yang layak DIBUAT sebagai baris master dari teks kontrak. */
export function namaMasterDariTeks(teks: string): string {
  // Bersih dari entitas, tetapi ejaan & huruf besarnya dibiarkan apa adanya:
  // "GUANGXI ... CO., LTD" memang begitu tertulis di dokumennya, dan merapikan
  // huruf besar adalah selera, bukan koreksi. Dipotong 100 = VarChar(100).
  return bukaEntitasHtml(teks).trim().slice(0, 100);
}
