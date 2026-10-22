/**
 * Batas periode tidak dihitung dengan API `Date` zona PROSES.
 *
 * ══ Bentuk yang dijaga, dan kenapa ia bug ══════════════════════════════════
 *
 * `new Date(y, m, d)`, `getFullYear()`/`getMonth()`/`getDate()`/`getDay()`,
 * `setHours(...)`/`setDate(...)`, dan teks `"…T00:00:00"` tanpa offset semuanya
 * membaca zona waktu PROSES. Produksi memasang `TZ=Asia/Jakarta`, jadi di sana
 * hasilnya kebetulan benar; server on-premise customer yang berjalan di UTC
 * (atau CI, atau kotak pengembang — kotak ini sendiri ber-CST) menggeser batas
 * bulan dan tahun buku tujuh jam. Jurnal pada hari pertama/terakhir periode
 * lalu jatuh ke periode yang salah, tutup buku memilih rentang yang salah, dan
 * tanggal yang ditulis sistem pada 00:00 WIB (17:00Z hari sebelumnya) terbaca
 * sebagai hari sebelumnya — tanpa satu galat pun.
 *
 * Bentuk yang benar ada di `@sai/core/business-date`: `businessDate(y, m, d, …)`
 * (padanan `new Date(y, m, d, …)` di WIB, termasuk penggulungannya),
 * `businessParts(d)` (padanan getter kalender di WIB), `businessDayStart`,
 * `businessDayEnd`, dan `businessISODate`.
 *
 * ══ Lingkup ═══════════════════════════════════════════════════════════════
 *
 * Seluruh kode sumber (`akarSumber()`), KECUALI berkas `"use client"`: di
 * browser zona prosesnya adalah zona PEMBACA, dan bawaan formulir "hari ini"
 * memang hari si pembaca. Kode yang berjalan di server tidak punya alasan itu.
 *
 * ══ Daftar-izin: nama berkas → JUMLAH ═════════════════════════════════════
 *
 * Peta hitungan, bukan daftar nama (pola `business-date-not-utc-slice`):
 * berkas yang terdaftar tidak bisa menambah pemakaian baru tanpa memerahkan
 * penjaga ini, dan mencabut satu pemakaian juga memerahkannya — supaya
 * angkanya diperbarui di diff, bukan menjadi izin yang basi.
 */
import { describe, expect, it } from "vitest";

import { berkasSumber, tanpaKomentar } from "./akar-sumber";

const POLA =
  /\.(getFullYear|getMonth|getDate|getDay|getHours|getMinutes|getSeconds|getMilliseconds|setFullYear|setMonth|setDate|setHours|setMinutes)\(|new Date\(\s*[\w.]+\s*,|T(00:00:00|23:59:59)(\.\d{3})?[`"']/g;

const DIIZINKAN: Record<string, { jumlah: number; alasan: string }> = {
  "packages/core/src/tenant-deletion.ts": {
    jumlah: 2,
    alasan:
      "`retentionUntilFrom` menambah 10 tahun pada sebuah INSTAN (batas retensi hukum), bukan batas periode buku",
  },
  "src/components/landing/landing-footer.tsx": {
    jumlah: 1,
    alasan: "tahun hak cipta di kaki halaman pemasaran — bukan tanggal buku",
  },
};

function hitungan(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { rel, isi } of berkasSumber([".ts", ".tsx"])) {
    if (/^\s*["']use client["']/.test(isi)) continue;
    const n = (tanpaKomentar(isi).match(POLA) ?? []).length;
    if (n > 0) out[rel] = n;
  }
  return out;
}

describe("batas periode tidak memakai API Date zona proses", () => {
  it("pemakaian zona proses hanya di tempat yang disebut, dengan jumlah persis", () => {
    const diizinkan = Object.fromEntries(Object.entries(DIIZINKAN).map(([f, v]) => [f, v.jumlah]));
    expect(
      hitungan(),
      "Batas periode / tanggal kalender di server wajib lewat `@sai/core/business-date` " +
        "(businessDate / businessParts / businessDayStart / businessDayEnd / businessISODate). " +
        "Bila tempat baru ini memang tidak bergantung zona, daftarkan di DIIZINKAN beserta alasannya."
    ).toEqual(diizinkan);
  });

  it("setiap izin menyebut alasannya", () => {
    for (const [f, v] of Object.entries(DIIZINKAN)) expect(v.alasan.length, f).toBeGreaterThan(20);
  });
});
