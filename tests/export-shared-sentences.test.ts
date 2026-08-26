/**
 * PENJAGA #330 — kalimat cetakan tidak punya dua salinan.
 *
 * == Cacat yang ditutup berkas ini =========================================
 * `pdf/statement-pdf.ts` dan `report-export.ts` adalah dua PENERJEMAH dari satu
 * payload yang sama: yang satu menghasilkan PDF, yang lain lembar sebar. Ketika
 * kalimat keadaan-kosong dan label totalnya ditulis dua kali — masing-masing di
 * dalam badan fungsinya sendiri — tidak ada satu pun penjaga yang bisa melihat
 * bahwa keduanya harus sama.
 *
 * Menyimpangnya tidak akan terlihat sampai seseorang kebetulan membuka PDF dan
 * lembar sebar dari laporan yang sama, berdampingan, pada hari yang sama.
 *
 * == Ini bukan hipotesis ===================================================
 * #492 menyunting KEDUA berkas ini untuk satu laporan yang sama (Nilai
 * Persediaan berperiode). Hanya kebetulan yang membuat kalimat "Belum ada
 * barang." tidak ikut bergeser di salah satunya.
 *
 * == Bentuk penjaganya =====================================================
 * Sapuan sumber, sepola `tests/no-public-uploads.test.ts`: yang dijaga bukan
 * satu berkas melainkan HUBUNGAN antara dua berkas. Ia mengukur irisan literal
 * keduanya dan menolak yang berbentuk KALIMAT — bukan menolak semua irisan,
 * sebab jalur modul dan nama `payloadKind` memang sah muncul di keduanya.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { EXPORT_EMPTY, EXPORT_TOTALS, AGING_UNDATED_NOTE } from "@/lib/statement-layout";

const SRC = join(__dirname, "..", "src", "lib");
const excel = readFileSync(join(SRC, "report-export.ts"), "utf8");
const pdf = readFileSync(join(SRC, "pdf", "statement-pdf.ts"), "utf8");

/** Literal berkutip ganda sepanjang ≥12 huruf. */
function literals(source: string): Set<string> {
  return new Set(
    [...source.matchAll(/"([^"\\\n]{12,})"/g)].map((m) => m[1])
  );
}

/**
 * Apakah teks ini KALIMAT, bukan pengenal?
 *
 * Jalur modul (`@/lib/statement-layout`) dan nama `payloadKind`
 * (`purchases-by-supplier`) memang sah berdiri di kedua berkas — keduanya
 * pengenal, bukan bunyi yang dibaca manusia. Yang dijaga adalah yang TERCETAK.
 */
function isSentence(text: string): boolean {
  if (text.startsWith("@/")) return false;
  if (/^[a-z0-9-]+$/.test(text)) return false; // payloadKind & sejenisnya
  return /\s/.test(text);
}

describe("dua penerjemah, satu kosakata", () => {
  it("tidak ada KALIMAT yang berdiri di kedua berkas", () => {
    const shared = [...literals(excel)]
      .filter((t) => literals(pdf).has(t))
      .filter(isSentence)
      .sort();

    expect(
      shared,
      "Kalimat berikut punya dua salinan — satu di `report-export.ts`, satu di " +
        "`pdf/statement-pdf.ts`. Keduanya menerjemahkan payload yang SAMA, jadi " +
        "kalimatnya harus tinggal di satu tempat: `statement-layout.ts` " +
        "(`EXPORT_EMPTY` / `EXPORT_TOTALS` / catatan bersama). Salinan kedua " +
        "menyimpang tanpa ada yang melihatnya — lihat #330."
    ).toEqual([]);
  });
});

describe("rumahnya benar-benar dipakai", () => {
  it("kedua berkas mengimpor kosakata bersamanya", () => {
    /* Tanpa ini, penjaga di atas bisa hijau semata-mata karena salah satu
       berkas berhenti mencetak kalimatnya sama sekali. */
    for (const [nama, src] of [
      ["report-export.ts", excel],
      ["statement-pdf.ts", pdf],
    ] as const) {
      expect(src, `${nama} tidak memakai EXPORT_EMPTY`).toMatch(/EXPORT_EMPTY\./);
      expect(src, `${nama} tidak memakai EXPORT_TOTALS`).toMatch(/EXPORT_TOTALS\./);
    }
  });

  it("catatan valas memakai fungsi bersama, bukan templat sendiri-sendiri", () => {
    /* Bentuknya template literal, jadi ia lolos pengukuran literal di atas —
       dan justru itu yang membuatnya perlu disebut namanya di sini. */
    for (const src of [excel, pdf]) {
      expect(src).toMatch(/unratedNote\(/);
      expect(src).not.toMatch(/dokumen valas tanpa kurs tidak ikut dijumlahkan\.`/);
    }
  });

  it("catatan kaki umur dipakai keduanya", () => {
    for (const src of [excel, pdf]) {
      expect(src).toMatch(/AGING_UNDATED_NOTE/);
    }
  });
});

describe("kosakatanya lengkap dan tidak kosong", () => {
  it("setiap kalimat keadaan-kosong berisi", () => {
    for (const [key, text] of Object.entries(EXPORT_EMPTY)) {
      expect(text.length, `EXPORT_EMPTY.${key}`).toBeGreaterThan(10);
    }
  });

  it("setiap label total berisi", () => {
    for (const [key, text] of Object.entries(EXPORT_TOTALS)) {
      expect(text.length, `EXPORT_TOTALS.${key}`).toBeGreaterThan(5);
    }
  });

  it("catatan kaki umur menyebut SEBABNYA, bukan hanya tandanya", () => {
    /* "* " saja tidak memberi tahu apa pun; yang berguna adalah alasan umurnya
       dihitung dari dasar yang berbeda. */
    expect(AGING_UNDATED_NOTE).toMatch(/tanggal jatuh temponya tidak ada/);
  });
});
