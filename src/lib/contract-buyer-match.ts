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

/**
 * Peta alias terpakai: kunci ejaan mana pun → NAMA KANONIK-nya.
 *
 * Dibangun dari `scripts/data/contract-buyer-aliases.ts`, yang ditulis dan
 * ditinjau manusia. Ia hidup DI LUAR aturan kaku di atas dengan sengaja:
 * `kunciPembeli` tidak boleh dilonggarkan (setiap pelonggaran yang masuk akal
 * juga mulai menyamakan perusahaan yang berbeda), sementara "keempat ejaan ini
 * satu importir" adalah pengetahuan yang hanya dimiliki orang.
 */
export type AliasIndex = Map<string, string>;

/** Alias yang didaftarkan pada LEBIH DARI SATU nama kanonik. */
export interface AliasConflict {
  alias: string;
  kanonik: string[];
}

/**
 * Susun peta alias, dan laporkan yang saling bertentangan.
 *
 * Konflik TIDAK dilempar melainkan dipulangkan: pemanggilnya adalah skrip yang
 * harus bisa mencetak seluruh daftarnya sekaligus lalu berhenti, bukan mati
 * pada konflik pertama dan menyembunyikan sisanya.
 *
 * Sebuah nama kanonik otomatis menjadi aliasnya sendiri — supaya menuliskannya
 * di daftar alias tidak wajib, dan menuliskannya juga tidak merusak apa pun.
 */
export function susunAliasIndex(
  aliases: Record<string, string[]>
): { index: AliasIndex; konflik: AliasConflict[] } {
  const pemilik = new Map<string, Set<string>>();

  const daftarkan = (ejaan: string, kanonik: string) => {
    const k = kunciPembeli(ejaan);
    const set = pemilik.get(k) ?? new Set<string>();
    set.add(kanonik);
    pemilik.set(k, set);
  };

  for (const [kanonik, ejaanLain] of Object.entries(aliases)) {
    daftarkan(kanonik, kanonik);
    for (const ejaan of ejaanLain) daftarkan(ejaan, kanonik);
  }

  const index: AliasIndex = new Map();
  const konflik: AliasConflict[] = [];
  for (const [k, pemilikNya] of pemilik) {
    const daftar = [...pemilikNya];
    if (daftar.length > 1) {
      konflik.push({ alias: k, kanonik: daftar.sort() });
      continue; // Yang bertentangan TIDAK masuk peta — skrip berhenti sebelum menulis.
    }
    index.set(k, daftar[0]);
  }
  return { index, konflik };
}

/** Kunci penjodohan skrip: normalisasi migrasi, lalu entitas HTML dibuka.
 *
 *  Dengan `index`, seluruh ejaan satu perusahaan runtuh ke kunci nama
 *  kanoniknya — sehingga keempatnya menautkan ke SATU baris master, bukan empat.
 *  Tanpa `index`, bunyinya sama persis dengan migrasi 0057. */
export function kunciPembeli(nama: string, index?: AliasIndex): string {
  const dasar = normalkanNama(bukaEntitasHtml(nama));
  const kanonik = index?.get(dasar);
  return kanonik ? normalkanNama(bukaEntitasHtml(kanonik)) : dasar;
}

/** Nama yang layak DIBUAT sebagai baris master dari teks kontrak. */
export function namaMasterDariTeks(teks: string, index?: AliasIndex): string {
  // Nama kanonik menang, dan ditulis PERSIS seperti di berkas alias: di situlah
  // seseorang sudah memilih bentuk mana yang benar untuk muncul di master.
  const kanonik = index?.get(normalkanNama(bukaEntitasHtml(teks)));
  if (kanonik) return kanonik.trim().slice(0, 100);
  // Tanpa alias: bersih dari entitas, tetapi ejaan & huruf besarnya dibiarkan
  // apa adanya — "GUANGXI ... CO., LTD" memang begitu tertulis di dokumennya,
  // dan merapikan huruf besar adalah selera, bukan koreksi. 100 = VarChar(100).
  return bukaEntitasHtml(teks).trim().slice(0, 100);
}

/**
 * Alias yang TIDAK cocok ke satu teks pembeli pun di buku ini.
 *
 * Dilaporkan supaya berkas aliasnya tidak diam-diam membusuk: entri yang datanya
 * sudah dibersihkan akan tetap duduk di sana selamanya, terbaca seolah masih
 * menjelaskan sesuatu, dan orang berikutnya akan mempercayainya.
 */
export function aliasTakTerpakai(index: AliasIndex, teksPembeli: string[]): string[] {
  const ada = new Set(teksPembeli.map((t) => normalkanNama(bukaEntitasHtml(t))));
  return [...index.keys()].filter((k) => !ada.has(k)).sort();
}
