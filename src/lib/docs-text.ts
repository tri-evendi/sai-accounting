/**
 * TEKS sebuah halaman dokumentasi — satu-satunya tempat yang tahu cara
 * meratakan blok bertipe menjadi kalimat (issue #453).
 *
 * ══ KENAPA BERDIRI SENDIRI ═════════════════════════════════════════════════
 * Dua hal membutuhkannya dan keduanya lahir bersamaan: indeks pencarian
 * (`lib/docs-search.ts`) dan hitungan waktu baca. Kalau masing-masing meratakan
 * bloknya sendiri, cukup satu jenis blok baru untuk membuat keduanya berselisih
 * — pencarian menemukan kalimat yang tidak dihitung waktu bacanya, atau
 * sebaliknya. Di sini `switch`-nya SATU, dan jenis blok baru tanpa cabang
 * ditolak `tsc` lewat `never`, persis seperti di perendernya.
 *
 * ⚠ Blok BANGKITAN (`matriks-izin`, `endpoint-api`) sengaja tidak menyumbang
 * teks. Isinya baru ada saat render, dibaca dari `authz.ts` / `api-v1-spec.ts`,
 * dan meratakannya di sini berarti menyalin daftar yang justru dibangkitkan
 * supaya tidak pernah disalin. Akibatnya jujur: mencari "customer.read" tidak
 * menemukan halaman API lewat tabelnya — tetapi menemukannya lewat prosanya,
 * yang memang menyebut izin dan endpoint sebagai kalimat.
 *
 * ⚠ Berkas ini MURNI dan hanya untuk SERVER. Ia mengimpor `docs-content.ts`
 * (puluhan kilobait prosa); satu `"use client"` yang mengimpornya akan
 * menyeret seluruh dokumentasi ke bundel peramban. Dijaga `tests/docs.test.ts`.
 */

import type { DocBlock } from "@/lib/docs-content";

/** Satu bagian halaman: sub-judul beserta kalimat di bawahnya. */
export interface BagianDokumen {
  /** Judul sub-bagian; `undefined` untuk teks sebelum sub-judul pertama. */
  judul?: string;
  teks: string;
}

/** Teks satu blok — kosong untuk blok bangkitan & sub-judul. */
function teksBlok(blok: DocBlock): string {
  switch (blok.kind) {
    case "paragraf":
    case "catatan":
      return blok.teks;
    case "poin":
    case "langkah":
      return blok.butir.join(" ");
    /*
     * Cuplikan kode IKUT dicari: orang mencari `updatedSince` atau `Bearer`
     * justru karena ia melihatnya di sebuah contoh, bukan di kalimat.
     */
    case "kode":
      return blok.teks;
    /*
     * Sub-judul tidak menyumbang teks BADAN — ia menjadi judul bagiannya di
     * `bagianDokumen()`, dan menghitungnya dua kali membuat halaman
     * bersub-judul banyak menang pencarian hanya karena banyak judulnya.
     */
    case "sub":
      return "";
    /*
     * Gambar mekanisme menyumbang KETERANGANNYA — kalimat yang memang ditulis
     * di berkas prosa, dan satu-satunya bagian gambar yang berupa prosa. Label
     * di dalam gambarnya tidak: ia hidup di komponen, dan meratakannya ke sini
     * berarti indeks yang memuat kata yang tidak bisa dilihat penyuntingnya.
     */
    case "diagram":
      return blok.keterangan;
    /* Definisi istilah dibaca dari kamus saat render; lihat kepala berkas. */
    case "istilah":
    case "matriks-izin":
    case "endpoint-api":
    /*
     * Riwayat rilis dibangkitkan dari `lib/changelog.ts`, jadi teksnya tidak
     * ada di berkas prosa. Ia sengaja TIDAK diindeks: isinya berganti tiap
     * rilis, dan indeks pencarian yang memuatnya akan menjawab "faktur" dengan
     * catatan rilis lama alih-alih dengan halaman yang menjelaskan faktur.
     */
    case "riwayat-rilis":
      return "";
    default: {
      const belumDitangani: never = blok;
      return belumDitangani;
    }
  }
}

/**
 * Halaman dipecah menjadi bagian-bagian menurut sub-judulnya.
 *
 * Inilah yang membuat hasil pencarian bisa menunjuk BAGIAN, bukan cuma
 * halaman: sebuah kecocokan di paragraf keempat halaman "Peran & izin" jauh
 * lebih berguna kalau ia dibaca "Peran & izin → Mode Akuntan bukan peran".
 */
export function bagianDokumen(blok: readonly DocBlock[]): BagianDokumen[] {
  const bagian: BagianDokumen[] = [];
  let sekarang: BagianDokumen = { teks: "" };

  for (const b of blok) {
    if (b.kind === "sub") {
      if (sekarang.teks.trim().length > 0) bagian.push(sekarang);
      sekarang = { judul: b.judul, teks: "" };
      continue;
    }
    const teks = teksBlok(b);
    if (teks.length > 0) sekarang.teks = `${sekarang.teks} ${teks}`.trim();
  }
  if (sekarang.teks.trim().length > 0) bagian.push(sekarang);

  return bagian;
}

/** Seluruh teks halaman, dirata jadi satu — dipakai hitungan panjang. */
export function teksDokumen(blok: readonly DocBlock[]): string {
  return blok
    .map(teksBlok)
    .filter((teks) => teks.length > 0)
    .join(" ");
}

/**
 * Waktu baca, DIHITUNG — bukan diketik.
 *
 * 200 kata/menit adalah angka yang lazim untuk prosa non-fiksi; yang penting
 * bukan ketepatannya melainkan bahwa ia bergerak sendiri ketika halamannya
 * bertambah panjang. Dibulatkan ke atas, minimum 1 — "0 menit baca" adalah
 * angka yang benar secara aritmetika dan tidak berarti apa-apa bagi pembaca.
 */
export const KATA_PER_MENIT = 200;

export function waktuBaca(blok: readonly DocBlock[]): number {
  const kata = teksDokumen(blok).split(/\s+/).filter((k) => k.length > 0).length;
  return Math.max(1, Math.ceil(kata / KATA_PER_MENIT));
}
