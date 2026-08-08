/**
 * Bentuk Neraca — penjaga KESAMAAN antara layar, PDF, dan lembar sebar
 * (issue #258).
 *
 * ── Kenapa berkas ini ada, padahal ketiga permukaan sudah punya tesnya ──────
 * Justru itu masalahnya. Sebelum #258 Neraca digambar tiga kali dengan tiga
 * bentuk berbeda — baris penutup berjumlah beda dan berbunyi beda ("Total
 * Liabilitas + Ekuitas (Seimbang)" di lembar sebar vs "Aset = Liabilitas +
 * Ekuitas (Seimbang)" di PDF), "Total Aset" muncul dua kali hanya di layar,
 * "Akumulasi Laba/Rugi" disisipkan dengan dua cara berbeda, seksi kosong
 * berbunyi "—" di layar dan "Tidak ada data." di cetakan, dan `totalEquity +
 * netIncome` ditulis ulang di setiap berkas. Ketiganya hijau, karena
 * masing-masing benar menurut sumbernya sendiri. Yang tidak diuji siapa pun
 * adalah kesamaan di antara ketiganya, dan itu satu-satunya sifat yang
 * benar-benar penting bagi orang yang mencocokkan layar dengan lampiran yang
 * ia kirim ke bank.
 *
 * Jadi tes ini sengaja BUKAN tiga tes yang masing-masing memeriksa satu
 * keluaran. Ia menjalankan SATU payload lewat ketiga perender dan membandingkan
 * hasilnya baris demi baris dengan bentuk kanonik `balanceSheetLayout()`.
 * Layarnya DIRENDER SUNGGUHAN (`renderToStaticMarkup`) lalu barisnya dibaca
 * kembali — bukan disalin logikanya ke dalam tes, karena salinan yang setuju
 * dengan dirinya sendiri tidak menjaga apa pun.
 *
 * ── Yang dibandingkan, dan yang sengaja tidak ──────────────────────────────
 * DIBANDINGKAN: jumlah baris, urutannya, labelnya, dan keadaan tiap sel
 * nominal (tak berlaku / bernilai, termasuk nol). Itulah bentuk laporan.
 *
 * TIDAK dibandingkan: rupa penulisan angka dan spasi. Lembar sebar menyimpan
 * ANGKA supaya kolomnya bisa dijumlah; layar dan kertas menuliskannya dengan
 * pemformat rupiahnya masing-masing. Spasi pun tampilan: PDF menakuk baris akun
 * dengan spasi, layar dengan `paddingInlineStart`, lembar sebar tidak sama
 * sekali. Karena itu label dibandingkan setelah SELURUH spasi dibuang.
 *
 * DIBANDINGKAN DENGAN `startsWith`: satu baris — penutup terakhir, yang membawa
 * ANOTASI keseimbangan dalam bentuk berbeda per permukaan (lencana di layar,
 * tanda kurung di cetakan). Ia tetap wajib DIAWALI label kanoniknya, jadi baris
 * yang hilang atau berganti nama tetap tertangkap.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import id from "@/lib/i18n/dictionaries/id.json";
import { translate } from "@/lib/i18n/dictionary";
import { buildReportSheet } from "@/lib/report-export";
import { balanceSheetPrintRows } from "@/lib/pdf/statement-pdf";
import {
  balanceSheetEquityTotal,
  balanceSheetLayout,
  BALANCE_SHEET_COLUMNS,
  BALANCE_SHEET_HEADERS,
  type BalanceSheetLayoutRow,
} from "@/lib/statement-layout";
import {
  BalanceSheetStatement,
  type BalanceSheetPayload,
  type T,
} from "@/components/reports/balance-sheet-statement";

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

type Line = BalanceSheetPayload["assets"][number];

const line = (code: string, name: string, amount: number): Line => ({ code, name, amount });

const sum = (lines: Line[]) => lines.reduce((s, l) => s + l.amount, 0);

function payloadOf(
  assets: Line[],
  liabilities: Line[],
  equity: Line[],
  netIncome: number,
  /** Selisih yang ditanam untuk menguji neraca yang TIDAK seimbang. */
  drift = 0
): BalanceSheetPayload {
  const totalEquity = sum(equity);
  const totalLiabilities = sum(liabilities);
  const totalLiabilitiesEquity = totalLiabilities + totalEquity + netIncome;
  return {
    kind: "balance-sheet",
    period: "Per 31 Juli 2026",
    assets,
    liabilities,
    equity,
    totalAssets: totalLiabilitiesEquity + drift,
    totalLiabilities,
    totalEquity,
    netIncome,
    totalLiabilitiesEquity,
    balanced: drift === 0,
  };
}

/** Neraca yang lengkap dan seimbang — bentuk sehari-hari laporan ini. */
const seimbang = payloadOf(
  [line("1-100", "Kas & Bank", 9_000_000), line("1-200", "Piutang Usaha", 1_500_000)],
  [line("2-100", "Utang Usaha", 2_000_000)],
  [line("3-100", "Modal Pemilik", 5_000_000)],
  3_500_000
);

/**
 * Perusahaan yang belum punya liabilitas sama sekali — seksinya harus tetap
 * TERCETAK, dengan kalimat yang menyebut alasannya, di ketiga permukaan. Hasil
 * periodenya nol, jadi payload ini sekaligus mengunci "nol tetap ditulis nol".
 */
const tanpaLiabilitas = payloadOf(
  [line("1-100", "Kas & Bank", 4_000_000)],
  [],
  [line("3-100", "Modal Pemilik", 4_000_000)],
  0
);

/**
 * Perusahaan yang belum punya SATU PUN akun ekuitas bersaldo — seluruh
 * ekuitasnya adalah hasil periode berjalan.
 *
 * Payload inilah yang membedakan kedua bentuk lama "Akumulasi Laba/Rugi":
 * sebagai baris akun DI DALAM larik ekuitas (bentuk yang menang) blok ekuitas
 * berisi tepat satu baris; sebagai baris TERSENDIRI sesudah larik yang kosong
 * (bentuk lama lembar sebar) ia akan mendahuluinya dengan kalimat "tidak ada
 * akun bersaldo" — satu baris lebih banyak, hanya di satu permukaan.
 */
const hanyaLabaBerjalan = payloadOf(
  [line("1-100", "Kas & Bank", 1_250_000)],
  [],
  [],
  1_250_000
);

/** Buku yang tidak seimbang — anotasi penutupnya berubah di ketiganya. */
const tidakSeimbang = payloadOf(
  [line("1-100", "Kas & Bank", 9_000_000)],
  [line("2-100", "Utang Usaha", 1_000_000)],
  [line("3-100", "Modal Pemilik", 5_000_000)],
  1_000_000,
  2_000_000
);

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
 * Baris tabel yang BENAR-BENAR dirender halaman Neraca — `<tbody>` lalu
 * `<tfoot>`, tanpa `<thead>`. Baris ber-`colSpan` menghasilkan sel lebih
 * sedikit; kekurangannya dilengkapi sebagai sel kosong, yang memang artinya.
 */
function screenRows(payload: BalanceSheetPayload): string[][] {
  const markup = renderToStaticMarkup(createElement(BalanceSheetStatement, { payload, t }));
  const body = markup.replace(/<thead\b[\s\S]*?<\/thead>/g, "");
  return [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((row) => {
    const cells = [...row[1].matchAll(/<(t[dh])\b[^>]*>([\s\S]*?)<\/\1>/g)].map((c) =>
      textOf(c[2])
    );
    while (cells.length < BALANCE_SHEET_COLUMNS.length) cells.push("");
    return cells;
  });
}

function screenHeaders(payload: BalanceSheetPayload): string[] {
  const markup = renderToStaticMarkup(createElement(BalanceSheetStatement, { payload, t }));
  const head = markup.match(/<thead\b[\s\S]*?<\/thead>/)?.[0] ?? "";
  return [...head.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => textOf(m[1]));
}

/** Badan + kaki cetakan sebagai satu daftar berurutan, seperti dua yang lain. */
function pdfRows(payload: BalanceSheetPayload): string[][] {
  const { body, foot } = balanceSheetPrintRows(payload);
  return [...body, ...foot];
}

function sheet(payload: BalanceSheetPayload) {
  return buildReportSheet(payload);
}

/** Baris yang membawa anotasi khas permukaannya — lihat kepala berkas. */
function annotated(row: BalanceSheetLayoutRow, index: number, rows: BalanceSheetLayoutRow[]) {
  return row.kind === "total" && index === rows.length - 1;
}

// ── Penjaganya ──────────────────────────────────────────────────────────────

describe("Neraca — satu bentuk untuk layar, PDF, dan lembar sebar", () => {
  const cases: [string, BalanceSheetPayload][] = [
    ["neraca yang lengkap", seimbang],
    ["perusahaan tanpa liabilitas", tanpaLiabilitas],
    ["perusahaan yang ekuitasnya hanya laba berjalan", hanyaLabaBerjalan],
    ["neraca yang tidak seimbang", tidakSeimbang],
  ];

  for (const [nama, payload] of cases) {
    describe(nama, () => {
      const canon = balanceSheetLayout(payload);

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
          if (annotated(row, i, canon)) {
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
          const where = `baris ${i} (${row.kind}) kolom jumlah`;
          if (row.amount === null) {
            // Tak berlaku: kosong di ketiganya. BUKAN nol — sebuah judul seksi
            // tidak bernilai Rp 0 (Prinsip Inti MASTER.md).
            expect(layar[i][1], `layar ${where}`).toBe("");
            expect(cetak[i][1], `PDF ${where}`).toBe("");
            expect(lembar[i][1].value, `lembar sebar ${where}`).toBeNull();
            return;
          }
          // Nol yang memang nol tetap ditulis nol di ketiganya: di neraca ia
          // pernyataan posisi, bukan ketiadaan arus seperti di Arus Kas.
          expect(layar[i][1], `layar ${where}`).toContain(digits(row.amount));
          expect(cetak[i][1], `PDF ${where}`).toBe(rp(row.amount));
          expect(lembar[i][1].value, `lembar sebar ${where}`).toBe(row.amount);
        });
      });

      it("ketiganya punya dua kolom dengan judul yang sepadan", () => {
        const judul = BALANCE_SHEET_COLUMNS.map((c) => BALANCE_SHEET_HEADERS[c]);
        expect(screenHeaders(payload)).toEqual(judul);
        expect(sheet(payload).columns.map((c) => c.header)).toEqual(judul);
      });

      /*
       * Aritmetika ekuitas hidup SATU kali, di `balanceSheetEquityTotal()`.
       * Sebelum #258 ia ditulis ulang di lembar sebar, di PDF, dan di ringkasan
       * halaman — dan dua salinan sebuah rumus akuntansi adalah dua tempat ia
       * bisa menyimpang. Yang diperiksa di sini adalah akibatnya: subtotal
       * "Total Ekuitas" MEMUAT hasil periode berjalan di ketiga permukaan.
       */
      it("subtotal ekuitas memuat hasil periode berjalan di ketiga permukaan", () => {
        const total = balanceSheetEquityTotal(payload);
        expect(total).toBe(payload.totalEquity + payload.netIncome);
        const i = canon.findIndex((r) => r.kind === "subtotal" && r.section === "equity");
        expect(canon[i].amount).toBe(total);
        expect(screenRows(payload)[i][1]).toContain(digits(total));
        expect(pdfRows(payload)[i][1]).toBe(rp(total));
        expect(sheet(payload).rows[i][1].value).toBe(total);
      });

      /*
       * "Akumulasi Laba/Rugi" adalah BARIS AKUN di dalam blok ekuitas, tepat
       * sebelum subtotalnya — bukan baris tersendiri sesudahnya. Seseorang yang
       * menyorot baris-baris ekuitas di Excel lalu menekan `SUM` harus mendapat
       * angka yang sama dengan subtotalnya.
       */
      it("hasil periode berjalan duduk di dalam blok ekuitas, tepat sebelum subtotalnya", () => {
        const label = "Akumulasi Laba/Rugi";
        const i = canon.findIndex((r) => r.label === label);
        expect(canon[i].kind).toBe("line");
        expect(canon[i].section).toBe("equity");
        expect(canon[i + 1].kind).toBe("subtotal");
        // Karena ia selalu ada, blok ekuitas tak pernah "tidak ada akun
        // bersaldo" — dan itu jujur: hasil periode berjalan selalu punya angka,
        // meski nol.
        expect(canon.some((r) => r.kind === "empty" && r.section === "equity")).toBe(false);
        expect(norm(screenRows(payload)[i][0])).toBe(norm(label));
        expect(norm(pdfRows(payload)[i][0])).toBe(norm(label));
        expect(norm(String(sheet(payload).rows[i][0].value ?? ""))).toBe(norm(label));
      });

      /*
       * Satu-satunya klaim neraca adalah A = L + E, jadi penutupnya menyebut
       * KEDUA sisi — berdampingan, di ketiga permukaan. Ikutannya: "Total Aset"
       * memang muncul dua kali, sebagai subtotal seksinya dan sebagai sisi kiri
       * klaimnya. Itu keputusan, bukan kelalaian (issue #258).
       */
      it("penutupnya menyebut kedua sisi klaim neraca di ketiganya", () => {
        const dua = canon.slice(-2);
        expect(dua.map((r) => r.kind)).toEqual(["total", "total"]);
        expect(dua[0].amount).toBe(payload.totalAssets);
        expect(dua[1].amount).toBe(payload.totalLiabilitiesEquity);

        const punyaDuaTotalAset = (labels: string[]) =>
          labels.filter((l) => norm(l) === norm("Total Aset")).length;
        expect(punyaDuaTotalAset(screenRows(payload).map((r) => r[0]))).toBe(2);
        expect(punyaDuaTotalAset(pdfRows(payload).map((r) => r[0]))).toBe(2);
        expect(
          punyaDuaTotalAset(sheet(payload).rows.map((r) => String(r[0].value ?? "")))
        ).toBe(2);
      });
    });
  }

  /*
   * Bug #258 apa adanya, ditulis sebagai kalimat: seksi tanpa akun bersaldo ada
   * di KETIGA sisi, dan menyebut ALASANNYA. Sebuah "—" tidak mengatakan apa pun
   * kepada pembaca layar, dan "tidak ada data" terbaca seperti laporan yang
   * gagal memuat.
   */
  it("seksi tanpa akun bersaldo menyebut alasannya di ketiga permukaan", () => {
    const kalimat = "Tidak ada akun bersaldo pada bagian ini.";
    expect(screenRows(tanpaLiabilitas).some((r) => r[0] === kalimat)).toBe(true);
    expect(pdfRows(tanpaLiabilitas).some((r) => r[0] === kalimat)).toBe(true);
    expect(sheet(tanpaLiabilitas).rows.some((r) => r[0].value === kalimat)).toBe(true);
  });

  it("seksi tanpa akun bersaldo tetap membawa judul & subtotalnya di ketiganya", () => {
    for (const label of ["Liabilitas", "Total Liabilitas"]) {
      expect(screenRows(tanpaLiabilitas).some((r) => r[0] === label), `layar: ${label}`).toBe(true);
      expect(pdfRows(tanpaLiabilitas).some((r) => r[0] === label), `PDF: ${label}`).toBe(true);
      expect(
        sheet(tanpaLiabilitas).rows.some((r) => r[0].value === label),
        `lembar sebar: ${label}`
      ).toBe(true);
    }
  });

  /*
   * Keadaan seimbang adalah ANOTASI pada baris penutup, bukan label yang
   * menggantikannya — dan ia harus TERBACA di ketiganya. PDF dulu menulis
   * "Aset = Liabilitas + Ekuitas" di sebelah angka yang bukan aset; sekarang
   * labelnya menamai angkanya dan keadaannya menempel di belakangnya.
   */
  it("keadaan seimbang disampaikan di layar maupun di cetakan", () => {
    expect(screenRows(seimbang).at(-1)![0]).toContain("Seimbang");
    expect(pdfRows(seimbang).at(-1)![0]).toContain("(Seimbang)");
    expect(String(sheet(seimbang).rows.at(-1)![0].value)).toContain("(Seimbang)");

    expect(screenRows(tidakSeimbang).at(-1)![0]).toContain("Tidak seimbang");
    expect(pdfRows(tidakSeimbang).at(-1)![0]).toContain("TIDAK SEIMBANG");
    expect(String(sheet(tidakSeimbang).rows.at(-1)![0].value)).toContain("TIDAK SEIMBANG");
  });

  /*
   * "Akumulasi Laba/Rugi" bukan akun, jadi kodenya kosong — dan takuknya tak
   * boleh menyisakan spasi menggantung di satu permukaan pun (perbaikan #241
   * yang berlaku untuk baris ini, dijaga di sini karena di sinilah ia hidup).
   */
  it("baris tanpa kode akun tidak menjorok di satu permukaan pun", () => {
    const nama = "Akumulasi Laba/Rugi";
    expect(pdfRows(seimbang).find((r) => r[0].includes(nama))![0]).toBe(`   ${nama}`);
    expect(
      sheet(seimbang).rows.find((r) => String(r[0].value ?? "").includes(nama))![0].value
    ).toBe(nama);
  });
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
