/**
 * PENCARIAN dokumentasi (issue #453) — indeks dibangun dari registri, di server.
 *
 * ══ KENAPA TANPA PUSTAKA PENCARIAN ════════════════════════════════════════
 * Yang dicari 13 halaman / ±5.300 kata yang SUDAH berbentuk data bertipe.
 * Sebuah mesin pencari (Pagefind, Orama, FlexSearch, MiniSearch) menyelesaikan
 * masalah yang belum kita punya — korpus yang tidak muat di memori, peringkat
 * yang harus dipelajari, indeks yang harus disimpan — dan membawa masalah yang
 * kita punya: satu dependensi lagi di permukaan yang hari ini nol JavaScript.
 * Pagefind bahkan tidak bisa dipakai di sini: ia mengindeks HTML hasil build,
 * sementara `/docs` `force-dynamic` (tema & bahasa dari cookie).
 *
 * Kalau kelak isinya menembus puluhan halaman dan peringkat sederhana ini mulai
 * salah, gantilah ISI fungsi `cariDokumentasi` — bentuk hasilnya yang dipakai
 * halaman tidak perlu ikut berubah.
 *
 * ══ TANPA JAVASCRIPT DI PERAMBAN ═══════════════════════════════════════════
 * Formulirnya `<form action="/docs/cari" method="get">` dan hasilnya dirender
 * server. Konsekuensinya bukan sekadar hemat: hasil pencarian menjadi ALAMAT —
 * bisa ditautkan, dibagikan, dan dibuka kembali. Doktrin yang sama dengan
 * formulir pendaratan dan menu `<details>` (#398).
 *
 * ══ CUPLIKANNYA POTONGAN, BUKAN HTML ═══════════════════════════════════════
 * `cuplikan` keluar sebagai deretan potongan `{ teks, cocok }`, bukan string
 * ber-`<mark>`. Perendernya karena itu tidak perlu `dangerouslySetInnerHTML`
 * satu kali pun — dan teks dokumentasi yang mengandung `<` tidak bisa menjadi
 * markup.
 *
 * ⚠ SERVER SAJA: ia mengimpor seluruh prosa lewat `docs-text.ts`.
 */

import { DOC_INDEX, docAnchor, type DocBranch } from "@/lib/docs";
import { DOC_BLOCKS } from "@/lib/docs-content";
import { bagianDokumen } from "@/lib/docs-text";

/** Sepotong cuplikan; `cocok` menandai bagian yang disorot perendernya. */
export interface PotonganCuplikan {
  teks: string;
  cocok: boolean;
}

export interface HasilCari {
  slug: string;
  judul: string;
  ringkas: string;
  cabang: DocBranch;
  /** Sub-judul tempat kecocokan terkuat berada — jadi tautannya berjangkar. */
  bagian?: string;
  /** Alamat hasil, sudah termasuk `#jangkar` bila kecocokannya di sebuah bagian. */
  href: string;
  cuplikan: PotonganCuplikan[];
}

/**
 * Bobot per tempat kecocokan. Judul di atas segalanya: orang yang mengetik
 * "periode" hampir selalu mencari HALAMAN periode, bukan kalimat mana pun yang
 * kebetulan menyebutnya.
 */
const BOBOT = { judul: 8, ringkas: 4, subJudul: 3, badan: 1 } as const;

/** Panjang cuplikan di sekitar kecocokan pertama. */
const RADIUS_CUPLIKAN = 70;

interface EntriBagian {
  judul?: string;
  teks: string;
  teksKecil: string;
}

interface EntriIndeks {
  slug: string;
  judul: string;
  judulKecil: string;
  ringkas: string;
  ringkasKecil: string;
  cabang: DocBranch;
  bagian: EntriBagian[];
}

/**
 * Indeks dibangun SEKALI saat modul dimuat.
 *
 * Aman karena isinya berkas sumber, bukan baris basis data: ia tidak berubah
 * selama proses hidup, tidak bergantung perusahaan mana yang sedang dibuka
 * (permukaan ini publik dan tanpa konteks perusahaan), dan tidak menyimpan apa
 * pun milik pembaca. Ini justru bentuk cache yang aturan multi-perusahaan
 * izinkan — tidak ada isi milik satu PT di dalamnya.
 */
const INDEKS: readonly EntriIndeks[] = DOC_INDEX.map((halaman) => ({
  slug: halaman.slug,
  judul: halaman.judul,
  judulKecil: halaman.judul.toLowerCase(),
  ringkas: halaman.ringkas,
  ringkasKecil: halaman.ringkas.toLowerCase(),
  cabang: halaman.cabang,
  bagian: bagianDokumen(DOC_BLOCKS[halaman.slug]).map((b) => ({
    judul: b.judul,
    teks: b.teks,
    teksKecil: b.teks.toLowerCase(),
  })),
}));

/** Indeks apa adanya — dipakai penjaga, bukan halaman. */
export function indeksDokumentasi(): readonly EntriIndeks[] {
  return INDEKS;
}

/**
 * Kata kunci: huruf kecil, dipecah di luar huruf/angka, yang satu huruf dibuang.
 *
 * Satu huruf dibuang karena ia cocok dengan hampir segalanya dan membuat
 * peringkat kehilangan artinya — bukan karena ia tidak sah diketik.
 */
export function kataKunci(kueri: string): string[] {
  return kueri
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((k) => k.length > 1);
}

/** Berapa kali `kata` muncul di `teks` (keduanya sudah huruf kecil). */
function hitung(teks: string, kata: string): number {
  if (kata.length === 0) return 0;
  let jumlah = 0;
  let dari = 0;
  for (;;) {
    const i = teks.indexOf(kata, dari);
    if (i === -1) return jumlah;
    jumlah += 1;
    dari = i + kata.length;
  }
}

/**
 * Cuplikan di sekitar kecocokan PERTAMA, dipotong di batas kata.
 *
 * Dipotong di batas kata karena cuplikan yang dimulai di tengah kata terbaca
 * seperti galat, bukan seperti kutipan.
 */
function cuplikanSekitar(teks: string, kata: string): PotonganCuplikan[] {
  const i = teks.toLowerCase().indexOf(kata);
  if (i === -1) {
    const potong = teks.slice(0, RADIUS_CUPLIKAN * 2);
    return [{ teks: potong.length < teks.length ? `${potong}…` : potong, cocok: false }];
  }

  let awal = Math.max(0, i - RADIUS_CUPLIKAN);
  let akhir = Math.min(teks.length, i + kata.length + RADIUS_CUPLIKAN);
  if (awal > 0) {
    const spasi = teks.indexOf(" ", awal);
    if (spasi !== -1 && spasi < i) awal = spasi + 1;
  }
  if (akhir < teks.length) {
    const spasi = teks.lastIndexOf(" ", akhir);
    if (spasi > i + kata.length) akhir = spasi;
  }

  const potongan: PotonganCuplikan[] = [];
  if (awal > 0) potongan.push({ teks: "…", cocok: false });
  if (i > awal) potongan.push({ teks: teks.slice(awal, i), cocok: false });
  potongan.push({ teks: teks.slice(i, i + kata.length), cocok: true });
  if (akhir > i + kata.length) potongan.push({ teks: teks.slice(i + kata.length, akhir), cocok: false });
  if (akhir < teks.length) potongan.push({ teks: "…", cocok: false });
  return potongan;
}

/**
 * Cari.
 *
 * ══ SEMUA KATA HARUS ADA (DAN, bukan ATAU) ═════════════════════════════════
 * Pada korpus sekecil ini, ATAU membuat setiap kueri dua kata mengembalikan
 * hampir seluruh dokumentasi — daftar panjang yang tidak menjawab apa pun.
 * DAN menjawab "tidak ada" ketika memang tidak ada, dan itu jawaban yang bisa
 * ditindaklanjuti: pembaca mengganti kata, bukan menggulung dua belas hasil.
 */
export function cariDokumentasi(kueri: string, batas = 20): HasilCari[] {
  const kata = kataKunci(kueri);
  if (kata.length === 0) return [];

  const hasil: (HasilCari & { skor: number })[] = [];

  for (const halaman of INDEKS) {
    const badanKecil = halaman.bagian.map((b) => b.teksKecil).join(" ");
    const subKecil = halaman.bagian
      .map((b) => b.judul?.toLowerCase() ?? "")
      .join(" ");

    /* DAN: satu kata yang tidak ada di mana pun membatalkan halamannya. */
    const semuaAda = kata.every(
      (k) =>
        halaman.judulKecil.includes(k) ||
        halaman.ringkasKecil.includes(k) ||
        subKecil.includes(k) ||
        badanKecil.includes(k)
    );
    if (!semuaAda) continue;

    let skor = 0;
    for (const k of kata) {
      skor += hitung(halaman.judulKecil, k) * BOBOT.judul;
      skor += hitung(halaman.ringkasKecil, k) * BOBOT.ringkas;
      skor += hitung(subKecil, k) * BOBOT.subJudul;
      skor += hitung(badanKecil, k) * BOBOT.badan;
    }

    /*
     * Bagian TERKUAT menentukan jangkarnya: hasil yang menurunkan pembaca tepat
     * di sub-judul yang memuat jawabannya jauh lebih berguna daripada hasil
     * yang menurunkannya di puncak halaman 1.500 kata.
     */
    const utama = kata[0];
    let terbaik: EntriBagian | undefined;
    let skorTerbaik = 0;
    for (const bagian of halaman.bagian) {
      const nilai = kata.reduce(
        (n, k) =>
          n + hitung(bagian.teksKecil, k) + hitung(bagian.judul?.toLowerCase() ?? "", k) * BOBOT.subJudul,
        0
      );
      if (nilai > skorTerbaik) {
        skorTerbaik = nilai;
        terbaik = bagian;
      }
    }

    const sumber = terbaik ?? halaman.bagian[0];
    const jangkar = terbaik?.judul ? `#${docAnchor(terbaik.judul)}` : "";

    hasil.push({
      slug: halaman.slug,
      judul: halaman.judul,
      ringkas: halaman.ringkas,
      cabang: halaman.cabang,
      bagian: terbaik?.judul,
      href: `/docs/${halaman.slug}${jangkar}`,
      cuplikan: sumber ? cuplikanSekitar(sumber.teks, utama) : [],
      skor,
    });
  }

  /* Skor menurun; seri diputus judul supaya urutannya tidak pernah acak. */
  hasil.sort((a, b) => b.skor - a.skor || a.judul.localeCompare(b.judul, "id"));
  return hasil.slice(0, batas).map(({ skor: _skor, ...sisanya }) => sisanya);
}
