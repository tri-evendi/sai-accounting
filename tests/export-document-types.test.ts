/**
 * JENIS DOKUMEN EKSPOR: PEB & PACKING LIST (issue #511).
 *
 * == Aplikasi ini menyuruh, lalu tidak menyediakan =========================
 * Kalimat keadaan-kosong halaman Dokumen berbunyi: "Simpan salinan dokumen
 * ekspor (B/L, PEB, packing list) di sini agar mudah dicari saat dibutuhkan."
 * Kepala `api/upload/route.ts` menyebut hal yang sama.
 *
 * Sampai issue ini, `DOCUMENT_TYPES` tidak memuat `peb` maupun `packing_list`.
 * Keduanya hanya bisa diunggah sebagai "Lainnya" — dan begitu dua dokumen
 * ekspor paling sering dipakai berbagi satu keranjang, tidak ada satu pun
 * pertanyaan berguna yang bisa dijawab daftar dokumen. "Kontrak mana yang
 * PEB-nya belum ada?" tidak punya jawaban.
 *
 * Kelengkapan dokumen ekspor adalah hal yang ditanyakan bea cukai dan bank,
 * bukan hal yang enak dilihat.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "@/lib/constants";
import { documentTypeLabels } from "@/lib/i18n/labels";

const dict = (loc: string) =>
  JSON.parse(
    readFileSync(join(__dirname, "..", "src", "lib", "i18n", "dictionaries", `${loc}.json`), "utf8")
  );

describe("kosakatanya lengkap", () => {
  it("PEB dan Packing List punya jenisnya sendiri", () => {
    expect(DOCUMENT_TYPES).toContain("peb");
    expect(DOCUMENT_TYPES).toContain("packing_list");
  });

  it("nilai lama TIDAK disentuh — baris yang sudah ada tetap punya label", () => {
    /* Menghapus salah satunya akan membuat dokumen yang terlanjur diunggah
       kehilangan namanya di layar. */
    for (const lama of ["bl", "invoice", "coo", "fumigation", "contract", "other"]) {
      expect(DOCUMENT_TYPES).toContain(lama);
    }
  });

  it("setiap jenis punya label cetak", () => {
    for (const t of DOCUMENT_TYPES) {
      expect(DOCUMENT_TYPE_LABELS[t]?.length ?? 0).toBeGreaterThan(2);
    }
  });

  it("labelnya ada di ketiga bahasa", () => {
    for (const loc of ["id", "en", "zh"]) {
      const d = dict(loc);
      for (const t of DOCUMENT_TYPES) {
        expect(String(d.documentType[t] ?? ""), `${loc}.documentType.${t}`).not.toBe("");
      }
    }
  });

  it("`documentTypeLabels` memulangkan SEMUA jenis, bukan sebagian", () => {
    /* Fungsi ini menyalin kunci satu per satu; jenis baru yang lupa ditambahkan
       di sana akan memulangkan `undefined` dan tampil sebagai sel kosong. */
    const labels = documentTypeLabels(dict("id"));
    for (const t of DOCUMENT_TYPES) {
      expect(labels[t], `label untuk ${t}`).toBeTruthy();
    }
  });
});

describe("urutannya mengikuti alur ekspor, bukan abjad", () => {
  it("kontrak lebih dulu, invoice menutup, lainnya paling akhir", () => {
    /* Pengguna memilih sambil menyusun berkasnya: daftar yang urut abjad
       memaksa ia mencari, daftar yang urut alur cukup diikuti. */
    const urutan = [...DOCUMENT_TYPES];
    expect(urutan[0]).toBe("contract");
    expect(urutan[urutan.length - 1]).toBe("other");
    expect(urutan.indexOf("packing_list")).toBeLessThan(urutan.indexOf("peb"));
    expect(urutan.indexOf("peb")).toBeLessThan(urutan.indexOf("bl"));
    expect(urutan.indexOf("bl")).toBeLessThan(urutan.indexOf("invoice"));
  });
});

describe("janji di layar dan kosakata yang tersedia tidak lagi berselisih", () => {
  it("ketiga dokumen yang disebut kalimat keadaan-kosong punya jenisnya", () => {
    const id = dict("id");
    const kalimat: string = id.documents.emptyDescription;
    /* Kalimat inilah yang memulai issue ini — ia menyuruh menyimpan tiga hal,
       dua di antaranya tidak punya rumah. */
    expect(kalimat).toMatch(/B\/L/);
    expect(kalimat).toMatch(/PEB/);
    expect(kalimat).toMatch(/packing list/i);

    expect(DOCUMENT_TYPES).toContain("bl");
    expect(DOCUMENT_TYPES).toContain("peb");
    expect(DOCUMENT_TYPES).toContain("packing_list");
  });
});
