/**
 * Judul kolom Umur Piutang/Utang — penjaga KESAMAAN antara PDF, lembar sebar,
 * dan penentunya di `statement-layout.ts` (issue #310).
 *
 * ── Kenapa berkas ini ada ───────────────────────────────────────────────────
 * Sampai #310, `AGING_HEADERS.party` berbunyi "Mitra" dan KEDUA permukaan
 * ekspor menimpanya dengan string sebarisnya sendiri sebelum menggambar
 * ("Pelanggan"/"Pemasok"). Bunyinya kebetulan sama di kedua permukaan, tapi
 * tidak ada yang memaksanya sama — dan bawaan yang selalu kalah itu menyesatkan
 * pembaca berkas yang seluruh maksudnya adalah "satu tempat yang menentukan
 * bentuk laporan". Sekarang judulnya datang dari `agingHeaders(kind)`.
 *
 * `tests/print-label-dictionary.test.ts` (#298) menjaga BUNYI konstanta itu
 * terhadap kamus layar. Yang TIDAK dijaganya adalah PEMAKAIAN: tidak ada
 * apa pun yang mencegah seseorang menuliskan lagi judulnya sebaris di lapisan
 * ekspor, dan penjaga #298 akan tetap hijau sambil kertasnya berbunyi lain.
 * Karena itu berkas ini menjalankan SATU payload lewat KEDUA perender yang
 * sungguhan — `buildReportSheet()` dan `generateStatementPDF()` — lalu menuntut
 * baris judul yang benar-benar keluar sama persis dengan `agingHeaders(kind)`.
 *
 * ── Kenapa PDF-nya dibaca, bukan diintip lewat tiruan ──────────────────────
 * Judul yang diperiksa diambil dari isi dokumen PDF yang jadi (operator `Tj`),
 * bukan dari argumen yang disodorkan ke `jspdf-autotable` lewat mock. Yang
 * ingin dibuktikan adalah apa yang dibaca orang di kertas; sebuah tiruan hanya
 * membuktikan apa yang dikatakan kode kepada pustakanya.
 */
import { describe, expect, it } from "vitest";

import { buildReportSheet } from "@/lib/report-export";
import { generateStatementPDF, type StatementPayload } from "@/lib/pdf/statement-pdf";
import { agingColumns, agingHeaders, type AgingKind } from "@/lib/statement-layout";

const KEDUANYA: AgingKind[] = ["receivables", "payables"];

type AgingPayload = Extract<StatementPayload, { kind: AgingKind }>;

/**
 * Satu payload contoh untuk kedua laporan. Nama pihaknya sengaja TIDAK memuat
 * kata "Pelanggan"/"Pemasok"/"Mitra", supaya kemunculan kata itu di dokumen
 * hanya bisa berasal dari baris judul.
 */
const payload = (kind: AgingKind): AgingPayload => ({
  kind,
  period: "1 Jan 2026 - 31 Jan 2026",
  rows: [
    {
      partyName: "PT Contoh Abadi",
      documentNo: "INV-0001",
      date: "01/01/2026",
      dueDate: "31/01/2026",
      ageDays: 12,
      ageFromIssue: false,
      status: "Belum jatuh tempo",
      total: 1_500_000,
      currency: "IDR",
      outstandingBase: 1_500_000,
    },
    {
      partyName: "CV Kedua",
      documentNo: "INV-0002",
      date: "05/01/2026",
      dueDate: null,
      ageDays: 40,
      ageFromIssue: true,
      status: "Lewat jatuh tempo",
      total: 250,
      currency: "USD",
      outstandingBase: null,
    },
  ],
  buckets: [
    { label: "0-30 hari", amount: 1_500_000 },
    { label: "31-60 hari", amount: 0 },
  ],
  total: 1_500_000,
  unresolved: 1,
});

/**
 * Seluruh teks yang benar-benar tertulis di dalam dokumen PDF, berurutan.
 * jsPDF menulis tiap potongan sebagai `(teks) Tj`, dengan `(`, `)` dan `\`
 * yang di-escape — dikembalikan di sini supaya "Sisa (IDR)" terbaca utuh.
 */
function pdfTexts(kind: AgingKind): string[] {
  const doc = generateStatementPDF(payload(kind), {
    name: "PT Sai Accounting",
    address: "Jl. Contoh No. 1",
  });
  return [...doc.output().matchAll(/\(((?:\\.|[^()\\])*)\)\s*Tj/g)].map((m) =>
    m[1].replace(/\\([()\\])/g, "$1")
  );
}

/** Letak sederet string yang harus muncul BERURUTAN dan BERSEBELAHAN. */
function indexOfSequence(haystack: string[], needle: string[]): number {
  return haystack.findIndex((_, i) => needle.every((s, j) => haystack[i + j] === s));
}

describe("judul kolom Umur Piutang/Utang (issue #310)", () => {
  for (const kind of KEDUANYA) {
    const harusnya = agingColumns(payload(kind)).map((c) => agingHeaders(kind)[c]);

    it(`lembar sebar ${kind} memakai judul dari agingHeaders()`, () => {
      expect(
        buildReportSheet(payload(kind)).columns.map((c) => c.header),
        "Judul kolom lembar sebar tidak lagi datang dari `agingHeaders()`. " +
          "Kolom pihak pernah ditulis sebaris di sini (#310); jangan kembali."
      ).toEqual(harusnya);
    });

    it(`PDF ${kind} mencetak judul dari agingHeaders()`, () => {
      const teks = pdfTexts(kind);
      expect(
        indexOfSequence(teks, harusnya),
        `Baris judul ${harusnya.join(" | ")} tidak ditemukan utuh di dalam PDF-nya. ` +
          "Judul kolomnya harus datang dari `agingHeaders()`, bukan ditulis " +
          "sebaris di `statement-pdf.ts` (#310)."
      ).toBeGreaterThanOrEqual(0);
    });
  }

  /*
   * Bawaan yang tak pernah terbaca itu benar-benar hilang — bukan sekadar tidak
   * dipakai. Kalau ia kembali sebagai nilai bawaan, ia akan muncul di salah satu
   * dari dua dokumen ini pada hari seseorang lupa menimpanya.
   */
  it("kata \"Mitra\" tidak muncul di dokumen mana pun", () => {
    for (const kind of KEDUANYA) {
      expect(pdfTexts(kind)).not.toContain("Mitra");
      expect(buildReportSheet(payload(kind)).columns.map((c) => c.header)).not.toContain("Mitra");
    }
  });

  /*
   * Kedua permukaan menyebut kolom pihak dengan kata yang SAMA. Sebelum #310
   * keduanya kebetulan sama karena dua string sebaris yang identik; sekarang
   * kesamaannya struktural — dan tes ini yang menyatakan bahwa itu memang
   * syaratnya, bukan kebetulan yang boleh dilanggar sebelah pihak.
   */
  it("PDF dan lembar sebar menyebut kolom pihak dengan kata yang sama", () => {
    for (const kind of KEDUANYA) {
      const sebar = buildReportSheet(payload(kind)).columns[0].header;
      expect(sebar).toBe(agingHeaders(kind).party);
      expect(pdfTexts(kind)).toContain(sebar);
    }
  });
});
