/**
 * Judul kolom Penjualan per Pelanggan / Pembelian per Pemasok — penjaga
 * KESAMAAN antara PDF, lembar sebar, dan penentunya di `statement-layout.ts`
 * (issue #315).
 *
 * ── Kenapa berkas ini ada ───────────────────────────────────────────────────
 * Sampai #315 judul kolom rekap mitra ditulis DUA kali: `PARTY_RECAP_HEADERS`
 * di `pdf/statement-pdf.ts` (dengan komentar yang menyatakan tidak ada kode
 * produksi lain memakainya) dan sebuah `const HEADERS` sebaris di dalam
 * `buildPartyRecapSheet()` di `report-export.ts`. Bunyinya sama huruf demi
 * huruf — karena kebetulan, bukan karena ada yang memaksanya. Salinan kedua
 * berada di dalam badan fungsi, jadi ia di luar jangkauan penjaga mana pun:
 * menyuntingnya membuat Excel dan PDF laporan yang SAMA berhenti sepakat, dan
 * tidak ada satu tes pun yang merah.
 *
 * `tests/print-label-dictionary.test.ts` (#298) menjaga BUNYI konstanta itu
 * terhadap kamus layar — dan sudah menjaganya sejak dulu. Yang TIDAK
 * dijangkaunya adalah PEMAKAIAN: tidak ada apa pun di sana yang memaksa kedua
 * lapisan ekspor benar-benar MEMBACA konstanta yang dipatoknya. Karena itu
 * berkas ini menjalankan SATU payload lewat KEDUA perender yang sungguhan —
 * `buildReportSheet()` dan `generateStatementPDF()` — lalu menuntut baris judul
 * yang benar-benar keluar sama persis dengan `PARTY_RECAP_HEADERS`.
 *
 * ── Kenapa PDF-nya dibaca, bukan diintip lewat tiruan ──────────────────────
 * Judul yang diperiksa diambil dari isi dokumen PDF yang jadi (operator `Tj`),
 * bukan dari argumen yang disodorkan ke `jspdf-autotable` lewat mock. Yang
 * ingin dibuktikan adalah apa yang dibaca orang di kertas; sebuah tiruan hanya
 * membuktikan apa yang dikatakan kode kepada pustakanya. Sama seperti
 * `tests/aging-header-shape.test.ts` (#310).
 *
 * ── Kenapa ADA pemeriksaan teks sumber di bawah ─────────────────────────────
 * Tiga tes pertama membandingkan keluaran dengan konstantanya, jadi mereka
 * menangkap salinan sebaris yang bunyinya BERBEDA. Yang tidak mereka tangkap
 * adalah cacat yang persis terjadi di sini selama ini: salinan sebaris yang
 * bunyinya SAMA. Ia tidak salah hari ini, dan justru itu bahayanya — ia salah
 * pada hari seseorang menyunting satu sisi. Jadi tes terakhir melarang
 * bentuknya: ketujuh kalimat itu tidak boleh muncul sebagai string literal di
 * lapisan ekspor mana pun.
 *
 * ── Yang sengaja TIDAK dijaga di sini ──────────────────────────────────────
 * Lebar kolom (`WIDTHS` di `report-export.ts`) tetap milik lapisan lembar
 * sebar: ia urusan tampilan lembar, bukan urusan bunyi, dan PDF-nya tidak
 * memakainya sama sekali.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { generateStatementPDF, type StatementPayload } from "@/lib/pdf/statement-pdf";
import { buildReportSheet } from "@/lib/report-export";
import {
  partyRecapColumns,
  PARTY_RECAP_HEADERS,
  type PartyRecapKind,
} from "@/lib/statement-layout";

const KEDUANYA: PartyRecapKind[] = ["sales-by-customer", "purchases-by-supplier"];

type PartyRecapPayload = Extract<StatementPayload, { kind: PartyRecapKind }>;

/**
 * Satu payload contoh untuk kedua laporan. Nama mitranya sengaja TIDAK memuat
 * kata "Pelanggan"/"Pemasok", supaya kemunculan kata itu di dokumen hanya bisa
 * berasal dari baris judul. Barisnya memuat satu mitra tanpa nama (baris
 * "Tanpa pelanggan"/"Tanpa pemasok") dan satu dokumen valas tanpa kurs, supaya
 * catatan kakinya ikut tergambar.
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
 * tanpa satu baris pun. Dua keadaan yang digambar cabang KODE LAIN di kedua
 * perender — dan `party` tetap ikut karena ia kolom yang tak bisa dibuang.
 */
const sebagian = (kind: PartyRecapKind): PartyRecapPayload => ({
  ...penuh(kind),
  rows: [],
  totals: { docCount: 0, grossBase: 0, returnBase: 0, netBase: 0, unratedCount: 0 },
  visibleColumns: ["gross", "net"],
});

const BENTUK: { nama: string; payload: (kind: PartyRecapKind) => PartyRecapPayload }[] = [
  { nama: "penuh", payload: penuh },
  { nama: "sebagian kolom, tanpa baris", payload: sebagian },
];

/**
 * Seluruh teks yang benar-benar tertulis di dalam dokumen PDF, berurutan.
 * jsPDF menulis tiap potongan sebagai `(teks) Tj`, dengan `(`, `)` dan `\`
 * yang di-escape — dikembalikan di sini supaya "Retur (IDR)" terbaca utuh.
 */
function pdfTexts(p: PartyRecapPayload): string[] {
  const doc = generateStatementPDF(p, {
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

describe("judul kolom rekap mitra (issue #315)", () => {
  for (const kind of KEDUANYA) {
    for (const bentuk of BENTUK) {
      const p = bentuk.payload(kind);
      const harusnya = partyRecapColumns(p).map((c) => PARTY_RECAP_HEADERS[kind][c]);

      it(`lembar sebar ${kind} (${bentuk.nama}) memakai judul dari PARTY_RECAP_HEADERS`, () => {
        expect(
          buildReportSheet(p).columns.map((c) => c.header),
          "Judul kolom lembar sebar tidak lagi datang dari `PARTY_RECAP_HEADERS`. " +
            "Ia pernah ditulis sebaris di `buildPartyRecapSheet()` (#315); jangan kembali."
        ).toEqual(harusnya);
      });

      it(`PDF ${kind} (${bentuk.nama}) mencetak judul dari PARTY_RECAP_HEADERS`, () => {
        expect(
          indexOfSequence(pdfTexts(p), harusnya),
          `Baris judul ${harusnya.join(" | ")} tidak ditemukan utuh di dalam PDF-nya. ` +
            "Judul kolomnya harus datang dari `PARTY_RECAP_HEADERS` di " +
            "`statement-layout.ts`, bukan ditulis sebaris di `statement-pdf.ts` (#315)."
        ).toBeGreaterThanOrEqual(0);
      });
    }
  }

  /*
   * Kedua permukaan menyebut kolomnya dengan kata yang SAMA. Sebelum #315
   * kesamaan itu kebetulan — dua salinan identik yang tak ada penjaganya;
   * sekarang ia struktural, dan tes ini yang menyatakan bahwa itu memang
   * syaratnya, bukan kebetulan yang boleh dilanggar sebelah pihak.
   */
  it("PDF dan lembar sebar menyebut kolom yang sama dengan kata yang sama", () => {
    for (const kind of KEDUANYA) {
      const p = penuh(kind);
      const teks = pdfTexts(p);
      for (const kolom of buildReportSheet(p).columns) {
        expect(teks).toContain(kolom.header);
      }
    }
  });

  /*
   * Penjaga BENTUK, bukan bunyi — lihat kepala berkas: salinan sebaris yang
   * bunyinya sama tidak bisa ditangkap dengan membandingkan keluaran, karena
   * keluarannya memang masih sama. Yang bisa ditangkap adalah keberadaan
   * kalimatnya di dalam berkas yang seharusnya tidak lagi menuliskannya.
   */
  it("tidak ada judul rekap mitra yang ditulis sebaris di lapisan ekspor", () => {
    const kalimat = [
      ...new Set(KEDUANYA.flatMap((k) => Object.values(PARTY_RECAP_HEADERS[k]))),
    ];
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
      "Judul kolom rekap mitra ditulis lagi sebagai string di lapisan ekspor. " +
        "Ia hanya boleh hidup di `PARTY_RECAP_HEADERS` (`statement-layout.ts`) — " +
        "salinan kedua yang hari ini kebetulan sama adalah persis cacat yang #315 " +
        "tutup: penjaga #298 memaku konstantanya, dan salinannya bergeser sendiri."
    ).toEqual([]);
  });
});
