/**
 * DONAT STATUS KONTRAK — setiap kontrak harus terhitung
 * (temuan S3 pada audit skema — docs/arsitektur/07-RIWAYAT.md)
 *
 * Invarian yang dijaga berkas ini satu, dan ia pernah dilanggar di produksi:
 * **jumlah seluruh irisan = jumlah kontrak.** Diukur 12 Okt 2026 — 609 kontrak,
 * 508 masuk grafik, 101 hilang, nol galat di mana pun.
 *
 * Bentuk cacatnya penting dipahami supaya tidak kembali: grafik yang menghitung
 * hanya status yang DIKENAL tidak pernah terlihat salah. Ia menggambar irisan
 * yang rapi dengan jumlah yang tampak masuk akal, sementara sebagian data tidak
 * ada di mana pun. Tidak ada yang bisa menyadarinya dari gambarnya.
 */
import { describe, expect, it } from "vitest";
import {
  irisanStatusKontrak,
  labelCadangan,
  totalIrisan,
} from "@/lib/contract-status-chart";

const LABEL = { signed: "Sah", pending: "Menunggu", canceled: "Dibatalkan", completed: "Selesai" };

describe("donat status: setiap kontrak terhitung", () => {
  it("keadaan produksi 12 Okt: `completed` kini DIKENAL dan berlabel", () => {
    /* 609 kontrak, `signed` nol, `completed` 101 — status keempat yang disahkan
       pemilik 23 Okt 2026, jadi ia mendapat labelnya sendiri, bukan cadangan. */
    const jumlah = new Map([
      ["pending", 469],
      ["completed", 101],
      ["canceled", 39],
    ]);
    const irisan = irisanStatusKontrak(jumlah, LABEL);
    expect(totalIrisan(irisan)).toBe(609);
    expect(irisan).toHaveLength(4);
    expect(irisan[3]).toEqual({ name: "Selesai", value: 101 });
  });

  it("status di luar kosakata TETAP mendapat irisannya", () => {
    const irisan = irisanStatusKontrak(new Map([["cancelled", 2], ["pending", 1]]), LABEL);
    expect(totalIrisan(irisan)).toBe(3);
    expect(irisan.map((i) => i.name)).toContain("Cancelled");
  });

  it("invarian: jumlah irisan = jumlah kontrak, apa pun statusnya", () => {
    const kasus: Array<Map<string, number>> = [
      new Map([["pending", 5]]),
      new Map([
        ["signed", 1],
        ["aneh", 2],
        ["lebih_aneh", 3],
      ]),
      new Map(),
      new Map([
        ["completed", 101],
        ["pending", 469],
        ["canceled", 39],
        ["draft", 7],
      ]),
    ];
    for (const jumlah of kasus) {
      const total = [...jumlah.values()].reduce((a, b) => a + b, 0);
      expect(totalIrisan(irisanStatusKontrak(jumlah, LABEL))).toBe(total);
    }
  });

  it("EMPAT yang dikenal selalu di posisi 0-1-2-3, meski nol", () => {
    /*
     * `statusTones` di `dashboard-charts.tsx` dipasangkan per POSISI, bukan per
     * nama. Kalau irisan bernilai nol dibuang "karena rapi", hijau/kuning/merah
     * akan berpindah ke status yang salah — dan pembacanya akan melihat
     * "dibatalkan" berwarna hijau tanpa satu pun galat.
     */
    const irisan = irisanStatusKontrak(new Map([["draft", 3]]), LABEL);
    expect(irisan.slice(0, 4).map((i) => i.name)).toEqual(["Sah", "Menunggu", "Dibatalkan", "Selesai"]);
    expect(irisan.slice(0, 4).map((i) => i.value)).toEqual([0, 0, 0, 0]);
    expect(irisan[4]).toEqual({ name: "Draft", value: 3 });
  });

  it("yang tak dikenal diurutkan menurut NAMA, bukan jumlahnya", () => {
    /* Urutan yang mengikuti jumlah membuat warna satu status berpindah hanya
       karena datanya bergerak — dan warna yang berpindah sendiri adalah bentuk
       kebohongan yang paling halus di sebuah grafik. */
    const irisan = irisanStatusKontrak(
      new Map([
        ["zeta", 100],
        ["alpha", 1],
      ]),
      LABEL
    );
    expect(irisan.slice(4).map((i) => i.name)).toEqual(["Alpha", "Zeta"]);
  });

  it("label cadangannya SAMA dengan StatusBadge", () => {
    /* Dua permukaan di satu halaman yang menamai nilai yang sama dengan cara
       berbeda membuat pembacanya mengira itu dua hal yang berbeda. */
    expect(labelCadangan("completed")).toBe("Completed");
    expect(labelCadangan("x")).toBe("X");
    expect(labelCadangan("")).toBe("");
  });

  it("peta kosong tetap memulangkan empat irisan nol — bukan larik kosong", () => {
    /* Grafik tanpa irisan sama sekali terlihat seperti grafik yang rusak; tiga
       irisan nol terlihat seperti buku yang belum punya kontrak, yang benar. */
    const irisan = irisanStatusKontrak(new Map(), LABEL);
    expect(irisan).toHaveLength(4);
    expect(totalIrisan(irisan)).toBe(0);
  });
});

describe("halaman kontrak memakai putusan ini, bukan daftar yang dipaku", () => {
  it("tidak ada lagi countByStatus.get(\"signed\") yang berdiri sendiri", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const halaman = readFileSync(
      join(
        process.cwd(),
        "src/app/(app)/(dashboard)/t/[tenantSlug]/[companySlug]/contracts/page.tsx"
      ),
      "utf8"
    );
    expect(halaman).toContain("irisanStatusKontrak");
    /* Penjaga atas kambuhnya cacat yang sama: daftar tiga yang dipaku. */
    expect(halaman).not.toMatch(/countByStatus\.get\("signed"\)/);
    /* …dan saringan status yang dipaku (dulu tanpa `completed`). */
    expect(halaman).not.toMatch(/\["all", "signed", "pending", "canceled"\]/);
  });
});
