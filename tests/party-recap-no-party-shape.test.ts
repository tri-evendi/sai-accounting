/**
 * Baris "Tanpa pelanggan"/"Tanpa pemasok" — penjaga KESAMAAN antara PDF, lembar
 * sebar, dan penentunya di `statement-layout.ts`, sekaligus patok KELUARAN
 * (issue #322).
 *
 * ── Kenapa berkas ini ada ───────────────────────────────────────────────────
 * Sampai #322 kalimat ini ditulis DUA kali, dan keduanya di dalam BADAN FUNGSI:
 * `generateStatementPDF()` (`pdf/statement-pdf.ts:678`) dan
 * `buildPartyRecapSheet()` (`report-export.ts:454`). Identik huruf demi huruf —
 * karena kebetulan, bukan karena ada yang memaksanya. Salinan di dalam badan
 * fungsi tak bisa diimpor siapa pun, jadi `tests/print-label-dictionary.test.ts`
 * (#298) tidak menjangkaunya sama sekali: menyunting satu sisi membuat PDF dan
 * Excel dari laporan yang SAMA berhenti sepakat, dan tidak ada satu tes pun yang
 * merah. Bentuknya sama persis dengan cacat #315 pada judul kolom, satu tingkat
 * lebih kecil — dan #315 sendiri yang menemukannya.
 *
 * ── Dua penjaga yang berbeda tugasnya ──────────────────────────────────────
 *  1. **Patok keluaran.** Seluruh `SheetModel` dan SELURUH teks yang benar-benar
 *     tertulis di dalam berkas PDF dipaku pada bunyinya HARI INI — enam dokumen
 *     (dua laporan × tiga bentuk payload), 82 sel lembar sebar dan 114 potongan
 *     teks PDF. Angka-angka ini diambil dari keluaran SEBELUM #322 menyentuh
 *     apa pun; `diff sebelum.json sesudah.json` kosong, dan pembandingnya tidak
 *     dibuang melainkan jadi berkas ini. Ekspor menyentuh dokumen yang sudah
 *     dikirim orang: perubahan bunyinya harus muncul di diff sebagai keputusan,
 *     bukan sebagai efek samping sebuah refactor.
 *  2. **Penjaga bentuk.** Tes terakhir melarang kalimatnya muncul lagi sebagai
 *     string literal di kedua lapisan ekspor. Tanpa itu, salinan sebaris yang
 *     bunyinya SAMA akan lolos — patok keluaran di atas tetap hijau untuk
 *     salinan semacam itu, sampai hari seseorang menyunting satu sisi. Persis
 *     cacat yang issue ini tutup. Pola yang sama dengan
 *     `tests/party-recap-header-shape.test.ts` (#315).
 *
 * ── Kenapa PDF-nya dibaca, bukan diintip lewat tiruan ──────────────────────
 * Teks yang diperiksa diambil dari isi dokumen PDF yang jadi (operator `Tj`),
 * bukan dari argumen yang disodorkan ke `jspdf-autotable` lewat mock. Yang ingin
 * dibuktikan adalah apa yang dibaca orang di kertas. Baris "Dicetak: …"
 * dikeluarkan — hanya ia yang memuat jam cetak, jadi hanya ia yang tidak bisa
 * dipaku.
 *
 * ── Yang sengaja TIDAK dijaga di sini ──────────────────────────────────────
 *  • **`src/lib/receivables.ts`** juga menuliskan `"Tanpa pelanggan"` (baris
 *    ~581), tapi itu laporan LAIN (Umur Piutang) dan tempatnya lapisan DATA,
 *    bukan lapisan ekspor: ia mengisi `partyName` sebelum laporannya digambar,
 *    jadi kedua permukaan membacanya dari satu sumber yang sama. Larangan
 *    literal di bawah karena itu hanya menyasar dua berkas ekspor.
 *  • **Kalimat keadaan ekspor yang lain** masih ditulis sebaris, dan tujuh di
 *    antaranya juga punya DUA salinan (lihat catatan di kepala
 *    `tests/print-label-dictionary.test.ts`). Mereka tidak ikut #322 karena
 *    masing-masing menuntut keputusan sendiri: bunyi layarnya berbeda dari bunyi
 *    cetakannya, jadi memindahkannya berarti sekalian memutuskan sisi mana yang
 *    menang — dan itu mengubah dokumen yang sudah dikirim orang.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { generateStatementPDF, type StatementPayload } from "@/lib/pdf/statement-pdf";
import { buildReportSheet } from "@/lib/report-export";
import { PARTY_RECAP_NO_PARTY, type PartyRecapKind } from "@/lib/statement-layout";

const KEDUANYA: PartyRecapKind[] = ["sales-by-customer", "purchases-by-supplier"];

type PartyRecapPayload = Extract<StatementPayload, { kind: PartyRecapKind }>;

/**
 * Payload penuh: satu mitra bernama, satu mitra TANPA nama (baris yang jadi
 * pokok issue ini), dan satu dokumen valas tanpa kurs supaya catatan kakinya
 * ikut tergambar. Nama mitranya sengaja tidak memuat kata "Tanpa".
 */
const penuh = (kind: PartyRecapKind): PartyRecapPayload => ({
  kind,
  period: "1 Jan 2026 - 31 Jan 2026",
  rows: [
    {
      partyName: "PT Contoh Abadi",
      docCount: 3,
      grossBase: 15_000_000,
      returnBase: 1_250_000,
      netBase: 13_750_000,
      unratedCount: 0,
    },
    {
      partyName: null,
      docCount: 1,
      grossBase: 500_000,
      returnBase: 0,
      netBase: 500_000,
      unratedCount: 1,
    },
  ],
  totals: {
    docCount: 4,
    grossBase: 15_500_000,
    returnBase: 1_250_000,
    netBase: 14_250_000,
    unratedCount: 1,
  },
});

/**
 * Laporan yang sama dengan sebagian kolom dimatikan dari dialog parameter, dan
 * tanpa satu baris pun — cabang KODE LAIN di kedua perender, dan satu-satunya
 * bentuk di berkas ini yang TIDAK memuat baris tanpa mitra.
 */
const sebagian = (kind: PartyRecapKind): PartyRecapPayload => ({
  ...penuh(kind),
  rows: [],
  totals: { docCount: 0, grossBase: 0, returnBase: 0, netBase: 0, unratedCount: 0 },
  visibleColumns: ["gross", "net"],
});

/**
 * Dua cara sebuah mitra bisa "tidak ada": `null` (tidak tercatat) dan `""`
 * (tercatat kosong). Keduanya dipaku karena keduanya berbeda hari ini — hanya
 * `null` yang berganti nama, `""` tetap sel kosong di KEDUA permukaan. Perilaku
 * itu bukan yang diputuskan #322, tapi ia ikut dipaku supaya sebuah perubahan
 * pada `??` tidak lewat tanpa terlihat.
 */
const kosongNama = (kind: PartyRecapKind): PartyRecapPayload => ({
  ...penuh(kind),
  rows: [
    {
      partyName: null,
      docCount: 2,
      grossBase: 1_000_000,
      returnBase: 0,
      netBase: 1_000_000,
      unratedCount: 0,
    },
    {
      partyName: "",
      docCount: 1,
      grossBase: 250_000,
      returnBase: 0,
      netBase: 250_000,
      unratedCount: 0,
    },
  ],
  totals: { docCount: 3, grossBase: 1_250_000, returnBase: 0, netBase: 1_250_000, unratedCount: 0 },
});

const BENTUK: { nama: string; payload: (kind: PartyRecapKind) => PartyRecapPayload }[] = [
  { nama: "penuh", payload: penuh },
  { nama: "sebagian", payload: sebagian },
  { nama: "kosong-nama", payload: kosongNama },
];

/**
 * Seluruh teks yang benar-benar tertulis di dalam dokumen PDF, berurutan. jsPDF
 * menulis tiap potongan sebagai `(teks) Tj`, dengan `(`, `)` dan `\` yang
 * di-escape — dikembalikan di sini supaya "Retur (IDR)" terbaca utuh.
 */
function pdfTexts(p: PartyRecapPayload): string[] {
  const doc = generateStatementPDF(p, {
    name: "PT Sai Accounting",
    address: "Jl. Contoh No. 1",
  });
  return [...doc.output().matchAll(/\(((?:\\.|[^()\\])*)\)\s*Tj/g)]
    .map((m) => m[1].replace(/\\([()\\])/g, "$1"))
    .filter((s) => !s.startsWith("Dicetak"));
}

/**
 * Keluaran kedua perender SEBELUM #322 — dipaku apa adanya. Setiap sel lembar
 * sebar lengkap dengan format/rata/tebalnya, dan setiap potongan teks PDF dalam
 * urutan tertulisnya.
 */
const KELUARAN_HARI_INI: Record<string, { sheet: unknown; pdf: string[] }> = {
  "sales-by-customer/penuh": {
    sheet: {
      name: "Penjualan per Pelanggan",
      title: "Penjualan per Pelanggan",
      period: "1 Jan 2026 - 31 Jan 2026",
      columns: [
        {"header": "Pelanggan", "width": 36},
        {"header": "Dokumen", "width": 12},
        {"header": "Penjualan Kotor (IDR)", "width": 22},
        {"header": "Retur (IDR)", "width": 20},
        {"header": "Bersih (IDR)", "width": 22},
      ],
      rows: [
        [
          {"value": "PT Contoh Abadi", "bold": false},
          {"value": 3, "align": "right", "bold": false},
          {"value": 15000000, "format": "money", "align": "right", "bold": false},
          {"value": -1250000, "format": "money", "align": "right", "bold": false},
          {"value": 13750000, "format": "money", "align": "right", "bold": false},
        ],
        [
          {"value": "Tanpa pelanggan", "bold": false},
          {"value": 1, "align": "right", "bold": false},
          {"value": 500000, "format": "money", "align": "right", "bold": false},
          {"value": 0, "format": "money", "align": "right", "bold": false},
          {"value": 500000, "format": "money", "align": "right", "bold": false},
        ],
        [
          {"value": "Total", "bold": true},
          {"value": 4, "align": "right", "bold": true},
          {"value": 15500000, "format": "money", "align": "right", "bold": true},
          {"value": -1250000, "format": "money", "align": "right", "bold": true},
          {"value": 14250000, "format": "money", "align": "right", "bold": true},
        ],
        [
          {"value": "Catatan: 1 dokumen valas tanpa kurs tidak ikut dijumlahkan.", "bold": false},
          {"value": null, "bold": false},
          {"value": null, "bold": false},
          {"value": null, "bold": false},
          {"value": null, "bold": false},
        ],
      ],
    },
    pdf: [
      "PT Sai Accounting",
      "Penjualan per Pelanggan",
      "1 Jan 2026 - 31 Jan 2026",
      "Pelanggan",
      "Dokumen",
      "Penjualan Kotor (IDR)",
      "Retur (IDR)",
      "Bersih (IDR)",
      "PT Contoh Abadi",
      "3",
      "Rp\u00a015.000.000",
      "-Rp\u00a01.250.000",
      "Rp\u00a013.750.000",
      "Tanpa pelanggan",
      "1",
      "Rp\u00a0500.000",
      "Rp\u00a00",
      "Rp\u00a0500.000",
      "Total",
      "4",
      "Rp\u00a015.500.000",
      "-Rp\u00a01.250.000",
      "Rp\u00a014.250.000",
      "Catatan: 1 dokumen valas tanpa kurs tidak ikut dijumlahkan.",
    ],
  },
  "sales-by-customer/sebagian": {
    sheet: {
      name: "Penjualan per Pelanggan",
      title: "Penjualan per Pelanggan",
      period: "1 Jan 2026 - 31 Jan 2026",
      columns: [
        {"header": "Pelanggan", "width": 36},
        {"header": "Penjualan Kotor (IDR)", "width": 22},
        {"header": "Bersih (IDR)", "width": 22},
      ],
      rows: [
        [
          {"value": "Tidak ada dokumen pada periode ini.", "bold": false},
          {"value": null, "bold": false},
          {"value": null, "bold": false},
        ],
        [
          {"value": "Total", "bold": true},
          {"value": 0, "format": "money", "align": "right", "bold": true},
          {"value": 0, "format": "money", "align": "right", "bold": true},
        ],
      ],
    },
    pdf: [
      "PT Sai Accounting",
      "Penjualan per Pelanggan",
      "1 Jan 2026 - 31 Jan 2026",
      "Pelanggan",
      "Penjualan Kotor (IDR)",
      "Bersih (IDR)",
      "Tidak ada dokumen pada periode ini.",
      "Total",
      "Rp\u00a00",
      "Rp\u00a00",
    ],
  },
  "sales-by-customer/kosong-nama": {
    sheet: {
      name: "Penjualan per Pelanggan",
      title: "Penjualan per Pelanggan",
      period: "1 Jan 2026 - 31 Jan 2026",
      columns: [
        {"header": "Pelanggan", "width": 36},
        {"header": "Dokumen", "width": 12},
        {"header": "Penjualan Kotor (IDR)", "width": 22},
        {"header": "Retur (IDR)", "width": 20},
        {"header": "Bersih (IDR)", "width": 22},
      ],
      rows: [
        [
          {"value": "Tanpa pelanggan", "bold": false},
          {"value": 2, "align": "right", "bold": false},
          {"value": 1000000, "format": "money", "align": "right", "bold": false},
          {"value": 0, "format": "money", "align": "right", "bold": false},
          {"value": 1000000, "format": "money", "align": "right", "bold": false},
        ],
        [
          {"value": "", "bold": false},
          {"value": 1, "align": "right", "bold": false},
          {"value": 250000, "format": "money", "align": "right", "bold": false},
          {"value": 0, "format": "money", "align": "right", "bold": false},
          {"value": 250000, "format": "money", "align": "right", "bold": false},
        ],
        [
          {"value": "Total", "bold": true},
          {"value": 3, "align": "right", "bold": true},
          {"value": 1250000, "format": "money", "align": "right", "bold": true},
          {"value": 0, "format": "money", "align": "right", "bold": true},
          {"value": 1250000, "format": "money", "align": "right", "bold": true},
        ],
      ],
    },
    pdf: [
      "PT Sai Accounting",
      "Penjualan per Pelanggan",
      "1 Jan 2026 - 31 Jan 2026",
      "Pelanggan",
      "Dokumen",
      "Penjualan Kotor (IDR)",
      "Retur (IDR)",
      "Bersih (IDR)",
      "Tanpa pelanggan",
      "2",
      "Rp\u00a01.000.000",
      "Rp\u00a00",
      "Rp\u00a01.000.000",
      "",
      "1",
      "Rp\u00a0250.000",
      "Rp\u00a00",
      "Rp\u00a0250.000",
      "Total",
      "3",
      "Rp\u00a01.250.000",
      "Rp\u00a00",
      "Rp\u00a01.250.000",
    ],
  },
  "purchases-by-supplier/penuh": {
    sheet: {
      name: "Pembelian per Pemasok",
      title: "Pembelian per Pemasok",
      period: "1 Jan 2026 - 31 Jan 2026",
      columns: [
        {"header": "Pemasok", "width": 36},
        {"header": "Dokumen", "width": 12},
        {"header": "Pembelian Kotor (IDR)", "width": 22},
        {"header": "Retur (IDR)", "width": 20},
        {"header": "Bersih (IDR)", "width": 22},
      ],
      rows: [
        [
          {"value": "PT Contoh Abadi", "bold": false},
          {"value": 3, "align": "right", "bold": false},
          {"value": 15000000, "format": "money", "align": "right", "bold": false},
          {"value": -1250000, "format": "money", "align": "right", "bold": false},
          {"value": 13750000, "format": "money", "align": "right", "bold": false},
        ],
        [
          {"value": "Tanpa pemasok", "bold": false},
          {"value": 1, "align": "right", "bold": false},
          {"value": 500000, "format": "money", "align": "right", "bold": false},
          {"value": 0, "format": "money", "align": "right", "bold": false},
          {"value": 500000, "format": "money", "align": "right", "bold": false},
        ],
        [
          {"value": "Total", "bold": true},
          {"value": 4, "align": "right", "bold": true},
          {"value": 15500000, "format": "money", "align": "right", "bold": true},
          {"value": -1250000, "format": "money", "align": "right", "bold": true},
          {"value": 14250000, "format": "money", "align": "right", "bold": true},
        ],
        [
          {"value": "Catatan: 1 dokumen valas tanpa kurs tidak ikut dijumlahkan.", "bold": false},
          {"value": null, "bold": false},
          {"value": null, "bold": false},
          {"value": null, "bold": false},
          {"value": null, "bold": false},
        ],
      ],
    },
    pdf: [
      "PT Sai Accounting",
      "Pembelian per Pemasok",
      "1 Jan 2026 - 31 Jan 2026",
      "Pemasok",
      "Dokumen",
      "Pembelian Kotor (IDR)",
      "Retur (IDR)",
      "Bersih (IDR)",
      "PT Contoh Abadi",
      "3",
      "Rp\u00a015.000.000",
      "-Rp\u00a01.250.000",
      "Rp\u00a013.750.000",
      "Tanpa pemasok",
      "1",
      "Rp\u00a0500.000",
      "Rp\u00a00",
      "Rp\u00a0500.000",
      "Total",
      "4",
      "Rp\u00a015.500.000",
      "-Rp\u00a01.250.000",
      "Rp\u00a014.250.000",
      "Catatan: 1 dokumen valas tanpa kurs tidak ikut dijumlahkan.",
    ],
  },
  "purchases-by-supplier/sebagian": {
    sheet: {
      name: "Pembelian per Pemasok",
      title: "Pembelian per Pemasok",
      period: "1 Jan 2026 - 31 Jan 2026",
      columns: [
        {"header": "Pemasok", "width": 36},
        {"header": "Pembelian Kotor (IDR)", "width": 22},
        {"header": "Bersih (IDR)", "width": 22},
      ],
      rows: [
        [
          {"value": "Tidak ada dokumen pada periode ini.", "bold": false},
          {"value": null, "bold": false},
          {"value": null, "bold": false},
        ],
        [
          {"value": "Total", "bold": true},
          {"value": 0, "format": "money", "align": "right", "bold": true},
          {"value": 0, "format": "money", "align": "right", "bold": true},
        ],
      ],
    },
    pdf: [
      "PT Sai Accounting",
      "Pembelian per Pemasok",
      "1 Jan 2026 - 31 Jan 2026",
      "Pemasok",
      "Pembelian Kotor (IDR)",
      "Bersih (IDR)",
      "Tidak ada dokumen pada periode ini.",
      "Total",
      "Rp\u00a00",
      "Rp\u00a00",
    ],
  },
  "purchases-by-supplier/kosong-nama": {
    sheet: {
      name: "Pembelian per Pemasok",
      title: "Pembelian per Pemasok",
      period: "1 Jan 2026 - 31 Jan 2026",
      columns: [
        {"header": "Pemasok", "width": 36},
        {"header": "Dokumen", "width": 12},
        {"header": "Pembelian Kotor (IDR)", "width": 22},
        {"header": "Retur (IDR)", "width": 20},
        {"header": "Bersih (IDR)", "width": 22},
      ],
      rows: [
        [
          {"value": "Tanpa pemasok", "bold": false},
          {"value": 2, "align": "right", "bold": false},
          {"value": 1000000, "format": "money", "align": "right", "bold": false},
          {"value": 0, "format": "money", "align": "right", "bold": false},
          {"value": 1000000, "format": "money", "align": "right", "bold": false},
        ],
        [
          {"value": "", "bold": false},
          {"value": 1, "align": "right", "bold": false},
          {"value": 250000, "format": "money", "align": "right", "bold": false},
          {"value": 0, "format": "money", "align": "right", "bold": false},
          {"value": 250000, "format": "money", "align": "right", "bold": false},
        ],
        [
          {"value": "Total", "bold": true},
          {"value": 3, "align": "right", "bold": true},
          {"value": 1250000, "format": "money", "align": "right", "bold": true},
          {"value": 0, "format": "money", "align": "right", "bold": true},
          {"value": 1250000, "format": "money", "align": "right", "bold": true},
        ],
      ],
    },
    pdf: [
      "PT Sai Accounting",
      "Pembelian per Pemasok",
      "1 Jan 2026 - 31 Jan 2026",
      "Pemasok",
      "Dokumen",
      "Pembelian Kotor (IDR)",
      "Retur (IDR)",
      "Bersih (IDR)",
      "Tanpa pemasok",
      "2",
      "Rp\u00a01.000.000",
      "Rp\u00a00",
      "Rp\u00a01.000.000",
      "",
      "1",
      "Rp\u00a0250.000",
      "Rp\u00a00",
      "Rp\u00a0250.000",
      "Total",
      "3",
      "Rp\u00a01.250.000",
      "Rp\u00a00",
      "Rp\u00a01.250.000",
    ],
  },
};

describe("baris tanpa mitra pada rekap mitra (issue #322)", () => {
  describe("keluarannya tidak berubah sehuruf pun", () => {
    for (const kind of KEDUANYA) {
      for (const bentuk of BENTUK) {
        const p = bentuk.payload(kind);
        const patok = KELUARAN_HARI_INI[`${kind}/${bentuk.nama}`];

        it(`lembar sebar ${kind} (${bentuk.nama}) berbunyi persis seperti sebelum #322`, () => {
          expect(
            buildReportSheet(p),
            "Lembar sebar rekap mitra berubah isinya. Ia dipaku pada keluaran " +
              "sebelum #322 karena ekspor menyentuh berkas yang sudah dikirim " +
              "orang — kalau perubahannya disengaja, perbarui patoknya dalam " +
              "diff yang sama supaya ia terbaca sebagai keputusan."
          ).toEqual(patok.sheet);
        });

        it(`PDF ${kind} (${bentuk.nama}) berbunyi persis seperti sebelum #322`, () => {
          expect(
            pdfTexts(p),
            "Teks di dalam PDF rekap mitra berubah. Ia dipaku pada keluaran " +
              "sebelum #322; kalau perubahannya disengaja, perbarui patoknya " +
              "dalam diff yang sama."
          ).toEqual(patok.pdf);
        });
      }
    }
  });

  /*
   * Penjaga PEMAKAIAN: bukan "apakah bunyinya masih sama" melainkan "apakah
   * kedua perender benar-benar MEMBACA konstantanya". Sebuah salinan sebaris
   * yang bunyinya berbeda tertangkap di sini, dan pesannya menunjuk rumahnya.
   */
  describe("kedua permukaan memakai PARTY_RECAP_NO_PARTY", () => {
    for (const kind of KEDUANYA) {
      const p = penuh(kind);

      it(`lembar sebar ${kind} menamai baris tanpa mitra dari konstantanya`, () => {
        const kolomMitra = buildReportSheet(p).rows.map((r) => r[0].value);
        expect(
          kolomMitra,
          "Baris tanpa mitra di lembar sebar tidak lagi datang dari " +
            "`PARTY_RECAP_NO_PARTY`. Ia pernah ditulis sebaris di " +
            "`buildPartyRecapSheet()` (#322); jangan kembali."
        ).toContain(PARTY_RECAP_NO_PARTY[kind]);
      });

      it(`PDF ${kind} menamai baris tanpa mitra dari konstantanya`, () => {
        expect(
          pdfTexts(p),
          "Baris tanpa mitra di PDF tidak lagi datang dari " +
            "`PARTY_RECAP_NO_PARTY` di `statement-layout.ts` (#322)."
        ).toContain(PARTY_RECAP_NO_PARTY[kind]);
      });
    }

    it("PDF dan lembar sebar menamai baris itu dengan kata yang sama", () => {
      for (const kind of KEDUANYA) {
        const p = penuh(kind);
        const dariLembar = buildReportSheet(p).rows.map((r) => r[0].value);
        const nama = PARTY_RECAP_NO_PARTY[kind];
        expect(dariLembar).toContain(nama);
        expect(pdfTexts(p)).toContain(nama);
      }
    });
  });

  /*
   * Penjaga BENTUK, bukan bunyi — lihat kepala berkas: salinan sebaris yang
   * bunyinya sama tidak bisa ditangkap dengan membandingkan keluaran, karena
   * keluarannya memang masih sama. Yang bisa ditangkap adalah keberadaan
   * kalimatnya di dalam berkas yang seharusnya tidak lagi menuliskannya.
   */
  it("nama baris tanpa mitra tidak ditulis sebaris di lapisan ekspor", () => {
    const kalimat = KEDUANYA.map((k) => PARTY_RECAP_NO_PARTY[k]);
    const berkas = ["src/lib/report-export.ts", "src/lib/pdf/statement-pdf.ts"];
    const temuan: string[] = [];
    for (const nama of berkas) {
      const isi = readFileSync(nama, "utf8");
      for (const s of kalimat) {
        const literal = new RegExp(`["'\`]${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`);
        if (literal.test(isi)) temuan.push(`${nama}: "${s}"`);
      }
    }
    expect(
      temuan,
      "Nama baris tanpa mitra ditulis lagi sebagai string di lapisan ekspor. " +
        "Ia hanya boleh hidup di `PARTY_RECAP_NO_PARTY` (`statement-layout.ts`) — " +
        "salinan kedua yang hari ini kebetulan sama adalah persis cacat yang " +
        "#322 tutup: satu sisi disunting, sisi lain diam, dan tidak ada yang merah."
    ).toEqual([]);
  });
});
