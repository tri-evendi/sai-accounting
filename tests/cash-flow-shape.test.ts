/**
 * Bentuk Arus Kas — penjaga KESAMAAN antara layar, PDF, dan lembar sebar
 * (issue #241).
 *
 * ── Kenapa berkas ini ada, padahal ketiga permukaan sudah punya tesnya ──────
 * Justru itu masalahnya. Sebelum #241 Arus Kas digambar tiga kali dengan tiga
 * bentuk berbeda — layar 3 kolom tanpa "Bersih", cetakan 4 kolom; kas awal &
 * akhir kartu di layar dan baris tabel di cetakan; kelompok tanpa akun tetap
 * dicetak di layar dan DILEWATI di ekspor. Ketiganya hijau, karena masing-masing
 * benar menurut sumbernya sendiri. Yang tidak diuji siapa pun adalah kesamaan
 * di antara ketiganya, dan itu satu-satunya sifat yang benar-benar penting:
 * periode tanpa mutasi Investasi menampilkan seksi itu di layar dan tidak
 * memuatnya sama sekali di lampirannya.
 *
 * Jadi tes ini sengaja BUKAN tiga tes yang masing-masing memeriksa satu
 * keluaran. Ia menjalankan SATU payload lewat ketiga perender dan membandingkan
 * hasilnya baris demi baris dengan bentuk kanonik `cashFlowLayout()`.
 *
 * ── Yang dibandingkan, dan yang sengaja tidak ──────────────────────────────
 * DIBANDINGKAN: jumlah baris, urutannya, labelnya, dan keadaan tiap sel
 * nominal (tak berlaku / nol / bernilai). Itulah bentuk laporan.
 *
 * TIDAK dibandingkan: rupa penulisan angka dan spasi. Lembar sebar menyimpan
 * ANGKA supaya kolomnya bisa dijumlah (nol tetap 0, sebab "-" mematikan `SUM`),
 * sedangkan layar dan kertas menulis nol sebagai tanda hubung — itu keputusan
 * tampilan yang tertulis di `cashFlowPrintAmount()`. Spasi pun tampilan: PDF
 * menakuk baris akun dengan spasi, layar dengan `paddingInlineStart`, lembar
 * sebar tidak sama sekali. Karena itu label dibandingkan setelah SELURUH spasi
 * dibuang — huruf-hurufnya yang harus sama, bukan takuknya.
 *
 * DIBANDINGKAN DENGAN `startsWith`: dua baris yang membawa ANOTASI berbeda
 * bentuk per permukaan — baris kaki (lencana "Cocok dengan Buku Besar" di
 * layar vs tanda kurung di cetakan) dan judul kelompok "Belum Terkategori"
 * (lencana + kalimat bantuan, yang tidak punya padanan di kertas). Keduanya
 * tetap wajib DIAWALI label kanoniknya, jadi seksi yang hilang atau berganti
 * nama tetap tertangkap.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import id from "@/lib/i18n/dictionaries/id.json";
import { translate } from "@/lib/i18n/dictionary";
import { buildReportSheet } from "@/lib/report-export";
import { cashFlowPrintRows } from "@/lib/pdf/statement-pdf";
import {
  cashFlowLayout,
  CASH_FLOW_COLUMNS,
  CASH_FLOW_HEADERS,
  type CashFlowLayoutRow,
} from "@/lib/statement-layout";
import {
  CashFlowStatement,
  type CashFlowPayload,
  type T,
} from "@/components/reports/cash-flow-statement";

/** Penerjemah bahasa SUMBER — kamus `id.json` yang sungguhan, bukan tiruan. */
const t = ((key: string, values?: Record<string, string | number>) =>
  translate(id, key, values)) as T;

/** Format rupiah cetakan, ditulis ulang di sini supaya bukan cerminan kodenya. */
const rp = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);

/** Angkanya saja, untuk memeriksa layar tanpa mengunci "Rp" dan tandanya. */
const digits = (amount: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.abs(amount));

/** Spasi adalah tampilan — lihat kepala berkas. */
const norm = (s: string) => s.replace(/\s+/g, "");

// ── Payload contoh ──────────────────────────────────────────────────────────

type Line = CashFlowPayload["groups"][number]["lines"][number];

const line = (code: string, name: string, inflow: number, outflow: number): Line => ({
  code,
  name,
  inflow,
  outflow,
  net: inflow - outflow,
});

const group = (
  category: CashFlowPayload["groups"][number]["category"],
  label: string,
  lines: Line[]
): CashFlowPayload["groups"][number] => ({
  category,
  label,
  lines,
  inflow: lines.reduce((s, l) => s + l.inflow, 0),
  outflow: lines.reduce((s, l) => s + l.outflow, 0),
  net: lines.reduce((s, l) => s + l.net, 0),
});

function payloadOf(groups: CashFlowPayload["groups"], reconciled = true): CashFlowPayload {
  const totalInflow = groups.reduce((s, g) => s + g.inflow, 0);
  const totalOutflow = groups.reduce((s, g) => s + g.outflow, 0);
  const openingCash = 1_000_000;
  return {
    kind: "cash-flow",
    period: "Periode 1 Juli 2026 – 31 Juli 2026",
    groups,
    totalInflow,
    totalOutflow,
    netChange: totalInflow - totalOutflow,
    openingCash,
    closingCash: openingCash + totalInflow - totalOutflow,
    reconciled,
    suspectUnrated: 0,
  };
}

/**
 * Periode yang membuka bug #241: ada mutasi operasi dan pendanaan, TIDAK ada
 * mutasi investasi, dan tidak ada akun yang belum terkategori.
 */
const tanpaInvestasi = payloadOf([
  group("operating", "Aktivitas Operasi", [
    line("4-100", "Pendapatan Penjualan", 7_500_000, 0),
    line("5-100", "Beban Gaji", 0, 2_000_000),
  ]),
  group("investing", "Aktivitas Investasi", []),
  group("financing", "Aktivitas Pendanaan", [line("3-100", "Modal Pemilik", 1_000_000, 0)]),
  group("uncategorised", "Belum Terkategori", []),
]);

/** Periode yang mengisi ember diagnostik — ia harus muncul di ketiganya. */
const denganBelumTerkategori = payloadOf(
  [
    group("operating", "Aktivitas Operasi", [line("4-100", "Pendapatan Penjualan", 500_000, 0)]),
    group("investing", "Aktivitas Investasi", []),
    group("financing", "Aktivitas Pendanaan", []),
    group("uncategorised", "Belum Terkategori", [line("9-999", "Akun Aneh", 0, 250_000)]),
  ],
  false
);

/** Akun tanpa kode — takuknya tak boleh menyisakan spasi menggantung. */
const tanpaKodeAkun = payloadOf([
  group("operating", "Aktivitas Operasi", [line("", "Penyesuaian Manual", 300_000, 0)]),
  group("investing", "Aktivitas Investasi", []),
  group("financing", "Aktivitas Pendanaan", []),
  group("uncategorised", "Belum Terkategori", []),
]);

// ── Pengambilan baris dari tiap permukaan ───────────────────────────────────

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|quot|nbsp|#x27|#39);/g, (m) => ENTITIES[m] ?? m);
}

/**
 * Baris tabel yang BENAR-BENAR dirender halaman Arus Kas — `<tbody>` lalu
 * `<tfoot>`, tanpa `<thead>`. Baris ber-`colSpan` menghasilkan sel lebih
 * sedikit; kekurangannya dilengkapi sebagai sel kosong, yang memang artinya.
 */
function screenRows(payload: CashFlowPayload): string[][] {
  const markup = renderToStaticMarkup(createElement(CashFlowStatement, { payload, t }));
  const body = markup.replace(/<thead\b[\s\S]*?<\/thead>/g, "");
  return [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((row) => {
    const cells = [...row[1].matchAll(/<(t[dh])\b[^>]*>([\s\S]*?)<\/\1>/g)].map((c) =>
      textOf(c[2])
    );
    while (cells.length < CASH_FLOW_COLUMNS.length) cells.push("");
    return cells;
  });
}

function screenHeaders(payload: CashFlowPayload): string[] {
  const markup = renderToStaticMarkup(createElement(CashFlowStatement, { payload, t }));
  const head = markup.match(/<thead\b[\s\S]*?<\/thead>/)?.[0] ?? "";
  return [...head.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => textOf(m[1]));
}

/** Badan + kaki cetakan sebagai satu daftar berurutan, seperti dua yang lain. */
function pdfRows(payload: CashFlowPayload): string[][] {
  const { body, foot } = cashFlowPrintRows(payload);
  return [...body, foot];
}

function sheet(payload: CashFlowPayload) {
  return buildReportSheet(payload);
}

/** Baris yang membawa anotasi khas permukaannya — lihat kepala berkas. */
function annotated(row: CashFlowLayoutRow): boolean {
  return row.kind === "total" || (row.kind === "group" && row.category === "uncategorised");
}

// ── Penjaganya ──────────────────────────────────────────────────────────────

describe("Arus Kas — satu bentuk untuk layar, PDF, dan lembar sebar", () => {
  const cases: [string, CashFlowPayload][] = [
    ["periode tanpa mutasi investasi", tanpaInvestasi],
    ["periode dengan akun belum terkategori", denganBelumTerkategori],
    ["akun tanpa kode", tanpaKodeAkun],
  ];

  for (const [nama, payload] of cases) {
    describe(nama, () => {
      const canon = cashFlowLayout(payload);

      it("ketiganya punya jumlah baris yang sama, sebanyak bentuk kanoniknya", () => {
        expect(screenRows(payload)).toHaveLength(canon.length);
        expect(pdfRows(payload)).toHaveLength(canon.length);
        expect(sheet(payload).rows).toHaveLength(canon.length);
      });

      it("ketiganya menyebut label yang sama, dalam urutan yang sama", () => {
        const layar = screenRows(payload).map((r) => norm(r[0]));
        const cetak = pdfRows(payload).map((r) => norm(r[0]));
        const lembar = sheet(payload).rows.map((r) => norm(String(r[0].value ?? "")));

        canon.forEach((row, i) => {
          const label = norm(row.label);
          if (annotated(row)) {
            // Anotasinya berbeda bentuk per permukaan; label pokoknya tidak.
            expect(layar[i], `layar baris ${i}`).toMatch(new RegExp(`^${escapeRe(label)}`));
            expect(cetak[i], `PDF baris ${i}`).toMatch(new RegExp(`^${escapeRe(label)}`));
            expect(lembar[i], `lembar sebar baris ${i}`).toMatch(
              new RegExp(`^${escapeRe(label)}`)
            );
          } else {
            expect(layar[i], `layar baris ${i}`).toBe(label);
            expect(cetak[i], `PDF baris ${i}`).toBe(label);
            expect(lembar[i], `lembar sebar baris ${i}`).toBe(label);
          }
        });
      });

      it("sel nominal berada di keadaan yang sama di ketiganya", () => {
        const layar = screenRows(payload);
        const cetak = pdfRows(payload);
        const lembar = sheet(payload).rows;

        canon.forEach((row, i) => {
          const values = [row.inflow, row.outflow, row.net];
          values.forEach((value, col) => {
            const where = `baris ${i} (${row.kind}) kolom ${CASH_FLOW_COLUMNS[col + 1]}`;
            const cellLayar = layar[i][col + 1];
            const cellCetak = cetak[i][col + 1];
            const cellLembar = lembar[i][col + 1];

            if (value === null) {
              // Tak berlaku: kosong di ketiganya. BUKAN nol — kas awal periode
              // bukan arus masuk sebesar nol rupiah.
              expect(cellLayar, `layar ${where}`).toBe("");
              expect(cellCetak, `PDF ${where}`).toBe("");
              expect(cellLembar.value, `lembar sebar ${where}`).toBeNull();
              return;
            }
            if (value === 0) {
              // Nol: tanda hubung di layar & kertas, ANGKA nol di lembar sebar
              // supaya kolomnya tetap bisa dijumlah.
              expect(cellLayar, `layar ${where}`).toMatch(/—|–|Nihil/);
              expect(cellCetak, `PDF ${where}`).toBe("-");
              expect(cellLembar.value, `lembar sebar ${where}`).toBe(0);
              return;
            }
            expect(cellLayar, `layar ${where}`).toContain(digits(value));
            expect(cellCetak, `PDF ${where}`).toBe(rp(value));
            expect(cellLembar.value, `lembar sebar ${where}`).toBe(value);
          });
        });
      });

      it("ketiganya punya empat kolom dengan judul yang sepadan", () => {
        expect(screenHeaders(payload)).toHaveLength(CASH_FLOW_COLUMNS.length);
        expect(sheet(payload).columns.map((c) => c.header)).toEqual(
          CASH_FLOW_COLUMNS.map((c) => CASH_FLOW_HEADERS[c])
        );
      });
    });
  }

  /*
   * Bug #241 apa adanya, ditulis sebagai kalimat: seksi yang kosong ada di
   * KEDUA sisi. Kalau suatu hari kelompok kosong diputuskan dilewati, tes ini
   * yang harus diubah lebih dulu — dan perubahannya terlihat di diff sebagai
   * keputusan, bukan sebagai efek samping.
   */
  it("periode tanpa mutasi investasi tetap memuat seksinya di ketiga permukaan", () => {
    const label = "Aktivitas Investasi";
    expect(screenRows(tanpaInvestasi).some((r) => r[0].includes(label))).toBe(true);
    expect(pdfRows(tanpaInvestasi).some((r) => r[0].includes(label))).toBe(true);
    expect(
      sheet(tanpaInvestasi).rows.some((r) => String(r[0].value ?? "").includes(label))
    ).toBe(true);
  });

  it("seksi kosong menyebut alasannya, bukan sekadar baris hampa", () => {
    const kalimat = "Tidak ada pergerakan kas pada periode ini.";
    expect(pdfRows(tanpaInvestasi).some((r) => r[0] === kalimat)).toBe(true);
    expect(sheet(tanpaInvestasi).rows.some((r) => r[0].value === kalimat)).toBe(true);
    expect(screenRows(tanpaInvestasi).some((r) => r[0] === kalimat)).toBe(true);
  });

  /*
   * "Belum Terkategori" adalah ember diagnostik, bukan seksi laporan — satu-
   * satunya kelompok yang boleh hilang saat kosong, dan harus hilang di
   * KETIGANYA.
   */
  it("ember Belum Terkategori yang kosong tidak dicetak di satu permukaan pun", () => {
    const label = "Belum Terkategori";
    expect(screenRows(tanpaInvestasi).some((r) => r[0].includes(label))).toBe(false);
    expect(pdfRows(tanpaInvestasi).some((r) => r[0].includes(label))).toBe(false);
    expect(
      sheet(tanpaInvestasi).rows.some((r) => String(r[0].value ?? "").includes(label))
    ).toBe(false);
  });

  it("ember Belum Terkategori yang berisi dicetak di ketiganya", () => {
    const label = "Belum Terkategori";
    expect(screenRows(denganBelumTerkategori).some((r) => r[0].includes(label))).toBe(true);
    expect(pdfRows(denganBelumTerkategori).some((r) => r[0].includes(label))).toBe(true);
    expect(
      sheet(denganBelumTerkategori).rows.some((r) => String(r[0].value ?? "").includes(label))
    ).toBe(true);
  });

  /*
   * Perbaikan sepele yang ikut di #241: `statement-pdf.ts` merangkai
   * `${code}  ${name}` tanpa `.trim()` di satu tempat, sehingga akun berkode
   * kosong tercetak menjorok dua spasi di PDF saja.
   */
  it("akun tanpa kode tidak menjorok di satu permukaan pun", () => {
    const nama = "Penyesuaian Manual";
    const cetak = pdfRows(tanpaKodeAkun).find((r) => r[0].includes(nama))!;
    expect(cetak[0]).toBe(`   ${nama}`);
    const lembar = sheet(tanpaKodeAkun).rows.find((r) =>
      String(r[0].value ?? "").includes(nama)
    )!;
    expect(lembar[0].value).toBe(nama);
  });

  it("keadaan rekonsiliasi disampaikan di layar maupun di cetakan", () => {
    const cocok = pdfRows(tanpaInvestasi).at(-1)!;
    expect(cocok[0]).toContain("cocok dengan buku besar");
    const tidak = pdfRows(denganBelumTerkategori).at(-1)!;
    expect(tidak[0]).toContain("TIDAK COCOK");
    expect(String(sheet(denganBelumTerkategori).rows.at(-1)![0].value)).toContain("TIDAK COCOK");
    expect(screenRows(denganBelumTerkategori).at(-1)![0]).toContain("Tidak cocok");
  });
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
