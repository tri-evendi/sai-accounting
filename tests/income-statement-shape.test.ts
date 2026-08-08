/**
 * Bentuk Laba/Rugi — penjaga KESAMAAN antara layar, PDF, dan lembar sebar
 * (issue #274). Yang terakhir dari empat laporan keuangan.
 *
 * ── Kenapa berkas ini ada, padahal `incomeStatementLayout()` sudah dipakai ──
 * Justru itu jebakannya, dan itulah yang membuat laporan ini lolos dari #241
 * maupun #258: sebuah penentu bersama MEMANG sudah dipanggil ketiga permukaan —
 * tapi yang ia bagi hanya KETERLIHATAN BAND. Bentuk barisnya tetap tiga
 * definisi lepas, dan ketiganya berbeda: PDF menggambar satu tabel per band
 * dengan subtotalnya sebagai `doc.text()` di luar tabel mana pun, lembar sebar
 * menulis "LABA KOTOR" huruf besar mati, layar memakai kamus, dan band kosong
 * punya tiga rupa ("Tidak ada data." / sel kosong / "—"). Ketiganya hijau di
 * tesnya masing-masing, karena masing-masing benar menurut sumbernya sendiri.
 *
 * Jadi tes ini sengaja BUKAN tiga tes yang masing-masing memeriksa satu
 * keluaran. Ia menjalankan SATU payload lewat ketiga perender dan membandingkan
 * hasilnya baris demi baris. Layarnya DIRENDER SUNGGUHAN
 * (`renderToStaticMarkup`) lalu barisnya dibaca kembali — bukan disalin
 * logikanya ke dalam tes, karena salinan yang setuju dengan dirinya sendiri
 * tidak menjaga apa pun.
 *
 * ── DUA jenis tes, dan yang kedua yang mahal pelajarannya ──────────────────
 * Pelajaran #276: perbandingan baris demi baris memakai bentuk kanonik sebagai
 * UKURAN, jadi penentu bersama yang SALAH menggeser ketiga permukaan bersamaan
 * dan ketiganya tetap terlihat "sepakat". Di sana satu pelanggaran sengaja tidak
 * merah sama sekali. Karena itu berkas ini punya dua jenis tes:
 *
 *  1. **kesepakatan** — satu payload lewat ketiga perender, dibandingkan baris
 *     demi baris dengan `incomeStatementLayout()`;
 *  2. **kebenaran** — aturan bentuknya dinyatakan terhadap **payload**-nya
 *     ("anak tangga Laba Kotor ada tepat ketika band HPP punya baris akun"),
 *     bukan terhadap bentuk kanoniknya.
 *
 * ── Payload contoh yang terlalu jinak bukan penjaga ────────────────────────
 * Daftarnya karena itu memuat kasus ekstrem, bukan hanya laporan sehari-hari:
 * perusahaan dagang bertangga penuh, perusahaan jasa yang tangganya mengatup,
 * periode yang **rugi**, periode yang **seluruh bandnya kosong**, dan periode
 * **tanpa beban operasional** — yang menaruh band kosong tepat sebelum sebuah
 * anak tangga.
 *
 * ── Yang dibandingkan, dan yang sengaja tidak ─────────────────────────────
 * DIBANDINGKAN: jumlah baris, urutannya, labelnya, dan keadaan tiap sel nominal
 * (tak berlaku / bernilai, termasuk nol). Itulah bentuk laporan.
 *
 * TIDAK dibandingkan: rupa penulisan angka dan spasi. Lembar sebar menyimpan
 * ANGKA supaya kolomnya bisa dijumlah; layar dan kertas menuliskannya dengan
 * pemformat rupiahnya masing-masing. Spasi pun tampilan: PDF menakuk baris akun
 * dengan spasi, layar dengan `paddingInlineStart`. Karena itu label dibandingkan
 * setelah SELURUH spasi dibuang.
 *
 * DIBANDINGKAN DENGAN `startsWith`: baris ber-ANOTASI (Laba Kotor dengan marjin,
 * baris penutup dengan arah hasil). Anotasinya berbentuk beda per permukaan —
 * span kecil berwarna di layar, tanda kurung di cetakan — tapi label pokoknya
 * tidak, dan anotasinya diperiksa terpisah.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import en from "@/lib/i18n/dictionaries/en.json";
import id from "@/lib/i18n/dictionaries/id.json";
import { translate } from "@/lib/i18n/dictionary";
import { buildReportSheet } from "@/lib/report-export";
import { incomeStatementPrintRows } from "@/lib/pdf/statement-pdf";
import {
  incomeStatementLayout,
  INCOME_STATEMENT_COLUMNS,
  INCOME_STATEMENT_HEADERS,
  INCOME_STATEMENT_PRINT_LABELS,
  type IncomeStatementLayoutRow,
} from "@/lib/statement-layout";
import {
  IncomeStatementTable,
  type IncomeStatementPayload,
  type T,
} from "@/components/reports/income-statement-table";

/** Penerjemah bahasa SUMBER — kamus `id.json` yang sungguhan, bukan tiruan. */
const t = ((key: string, values?: Record<string, string | number>) =>
  translate(id, key, values)) as T;

/** Penerjemah bahasa Inggris — hanya untuk tes "layar ikut berpindah bahasa". */
const tEn = ((key: string, values?: Record<string, string | number>) =>
  translate(en, key, values)) as T;

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

/** Em dash `Money` untuk nilai yang TIDAK DIKETAHUI — tak boleh muncul di sini. */
const NIHIL_LAYAR = "—";

// ── Payload contoh ──────────────────────────────────────────────────────────

type Line = IncomeStatementPayload["sales"]["lines"][number];
type Band = IncomeStatementPayload["sales"];

const line = (code: string, name: string, amount: number): Line => ({ code, name, amount });

const band = (...lines: Line[]): Band => ({
  lines,
  total: lines.reduce((s, l) => s + l.amount, 0),
});

/**
 * Aritmetikanya SENGAJA ditulis ulang di sini, sama persis dengan
 * `getIncomeStatement()`: payload contoh yang totalnya dihitung oleh kode yang
 * sedang diuji tidak membuktikan apa pun tentang angkanya.
 */
function payloadOf(
  sales: Band,
  cogs: Band,
  operatingExpense: Band,
  otherIncome: Band,
  otherExpense: Band
): IncomeStatementPayload {
  const grossProfit = sales.total - cogs.total;
  const operatingProfit = grossProfit - operatingExpense.total;
  return {
    kind: "income-statement",
    period: "Periode 1 Januari 2026 – 31 Juli 2026",
    sales,
    cogs,
    grossProfit,
    operatingExpense,
    operatingProfit,
    otherIncome,
    otherExpense,
    netIncome: operatingProfit + otherIncome.total - otherExpense.total,
  };
}

/** Perusahaan dagang dengan tangga penuh — bentuk sehari-hari laporan ini. */
const dagang = payloadOf(
  band(line("4-100", "Penjualan Ekspor", 8_000_000), line("4-200", "Penjualan Lokal", 2_000_000)),
  band(line("5-100", "Beban Pokok Penjualan", 6_000_000)),
  band(line("6-100", "Beban Gaji", 1_500_000)),
  band(line("7-100", "Selisih Kurs", 200_000)),
  band(line("8-100", "Beban Bunga", 100_000))
);

/**
 * Perusahaan jasa: tanpa HPP dan tanpa lain-lain, jadi kedua anak tangganya
 * mengatup (`incomeStatementBands`). Laporan yang tersisa harus persis
 * Pendapatan · Beban Operasional · hasil.
 */
const jasa = payloadOf(
  band(line("4-100", "Pendapatan Jasa", 5_000_000)),
  band(),
  band(line("6-100", "Beban Gaji", 2_000_000)),
  band(),
  band()
);

/** Periode yang RUGI — arah hasilnya berubah di ketiga permukaan. */
const rugi = payloadOf(
  band(line("4-100", "Penjualan Lokal", 1_000_000)),
  band(line("5-100", "Beban Pokok Penjualan", 900_000)),
  band(line("6-100", "Beban Sewa", 2_000_000)),
  band(),
  band(line("8-100", "Beban Bunga", 100_000))
);

/**
 * Periode yang SELURUH bandnya kosong — perusahaan baru, atau bulan yang belum
 * dijurnal. Pendapatan & Beban Operasional tetap harus tercetak (keduanya
 * jangkar laporan), masing-masing dengan kalimat yang menyebut alasannya, dan
 * seluruh nominalnya nol. Payload inilah yang mengunci "nol tetap ditulis nol",
 * dan sekaligus "marjin kotor tidak dicetak kalau tak ada pendapatan".
 */
const kosong = payloadOf(band(), band(), band(), band(), band());

/**
 * Periode TANPA BEBAN OPERASIONAL tetapi punya pendapatan lain-lain: band
 * kosong duduk tepat sebelum sebuah anak tangga ("Laba Usaha"). Kombinasi
 * inilah yang paling mudah membuat sebuah permukaan menghitung barisnya meleset
 * satu.
 */
const tanpaBebanOperasional = payloadOf(
  band(line("4-100", "Pendapatan Sewa", 4_000_000)),
  band(),
  band(),
  band(line("7-100", "Bunga Deposito", 500_000)),
  band()
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
 * Baris tabel yang BENAR-BENAR dirender halaman Laba/Rugi — `<tbody>` lalu
 * `<tfoot>`, tanpa `<thead>`.
 *
 * Sel ber-`colSpan` DIMEKARKAN menjadi sel kosong sebanyak kolom yang
 * ditelannya, bukan dilengkapi di ujung baris (pelajaran #276): judul band
 * membentang di atas kedua kolom, dan menambal di ujung akan menggeser kolom
 * nominalnya sehingga penjaga ini membandingkan kolom yang salah.
 */
function screenRows(payload: IncomeStatementPayload, translator: T = t): string[][] {
  const markup = renderToStaticMarkup(
    createElement(IncomeStatementTable, { payload, t: translator })
  );
  const body = markup.replace(/<thead\b[\s\S]*?<\/thead>/g, "");
  return [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((row) => {
    const cells: string[] = [];
    for (const c of row[1].matchAll(/<(t[dh])\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
      cells.push(textOf(c[3]));
      const span = Number(/colspan="(\d+)"/i.exec(c[2])?.[1] ?? 1);
      for (let i = 1; i < span; i += 1) cells.push("");
    }
    while (cells.length < INCOME_STATEMENT_COLUMNS.length) cells.push("");
    return cells;
  });
}

function screenHeaders(payload: IncomeStatementPayload): string[] {
  const markup = renderToStaticMarkup(createElement(IncomeStatementTable, { payload, t }));
  const head = markup.match(/<thead\b[\s\S]*?<\/thead>/)?.[0] ?? "";
  return [...head.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => textOf(m[1]));
}

/**
 * Badan + kaki cetakan sebagai satu daftar berurutan, seperti dua yang lain.
 *
 * Bahwa fungsi ini BISA mengembalikan seluruh laporan sebagai satu daftar baris
 * adalah setengah dari perbaikan #274: sebelumnya "LABA KOTOR", "LABA USAHA" dan
 * "LABA BERSIH" digambar `doc.text()` di luar tabel mana pun, jadi ia tidak akan
 * pernah muncul di sini.
 */
function pdfRows(payload: IncomeStatementPayload): string[][] {
  const { body, foot } = incomeStatementPrintRows(payload);
  return [...body, ...foot];
}

function sheet(payload: IncomeStatementPayload) {
  return buildReportSheet(payload);
}

/** Baris yang membawa anotasi khas permukaannya — lihat kepala berkas. */
const annotated = (row: IncomeStatementLayoutRow) => row.note !== undefined;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Penjaganya ──────────────────────────────────────────────────────────────

const cases: [string, IncomeStatementPayload][] = [
  ["perusahaan dagang dengan tangga penuh", dagang],
  ["perusahaan jasa yang tangganya mengatup", jasa],
  ["periode yang rugi", rugi],
  ["periode yang seluruh bandnya kosong", kosong],
  ["periode tanpa beban operasional", tanpaBebanOperasional],
];

describe("Laba/Rugi — satu bentuk untuk layar, PDF, dan lembar sebar", () => {
  for (const [nama, payload] of cases) {
    describe(nama, () => {
      const canon = incomeStatementLayout(payload);

      // ── 1. Kesepakatan ────────────────────────────────────────────────────

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
            const awalan = new RegExp(`^${escapeRe(label)}`);
            expect(layar[i], `layar baris ${i}`).toMatch(awalan);
            expect(cetak[i], `PDF baris ${i}`).toMatch(awalan);
            expect(lembar[i], `lembar sebar baris ${i}`).toMatch(awalan);
          } else {
            expect(layar[i], `layar baris ${i}`).toBe(label);
            expect(cetak[i], `PDF baris ${i}`).toBe(label);
            expect(lembar[i], `lembar sebar baris ${i}`).toBe(label);
          }
        });
      });

      it("baris yang beranotasi membawa anotasinya di ketiga permukaan", () => {
        const layar = screenRows(payload).map((r) => norm(r[0]));
        const cetak = pdfRows(payload).map((r) => norm(r[0]));
        const lembar = sheet(payload).rows.map((r) => norm(String(r[0].value ?? "")));

        canon.forEach((row, i) => {
          if (!annotated(row)) return;
          const anotasi = norm(`(${row.note})`);
          expect(layar[i], `layar baris ${i}`).toContain(anotasi);
          expect(cetak[i], `PDF baris ${i}`).toContain(anotasi);
          expect(lembar[i], `lembar sebar baris ${i}`).toContain(anotasi);
        });
      });

      it("sel nominal berada di keadaan yang sama di ketiganya", () => {
        const layar = screenRows(payload);
        const cetak = pdfRows(payload);
        const lembar = sheet(payload).rows;

        canon.forEach((row, i) => {
          const where = `baris ${i} (${row.kind}) kolom jumlah`;
          if (row.amount === null) {
            // Tak berlaku: kosong di ketiganya. BUKAN nol — sebuah judul band
            // tidak bernilai Rp 0 (Prinsip Inti MASTER.md).
            expect(layar[i][1], `layar ${where}`).toBe("");
            expect(cetak[i][1], `PDF ${where}`).toBe("");
            expect(lembar[i][1].value, `lembar sebar ${where}`).toBeNull();
            return;
          }
          /*
           * Nol yang memang nol tetap ditulis nol di ketiganya — sengaja
           * BERBEDA dari Arus Kas & Neraca Saldo yang menuliskannya "-" atau
           * "—". "Total Beban Lain-lain: Rp 0" adalah pernyataan tentang
           * periodenya, bukan ketiadaan arus; dan sebuah "—" di layar berarti
           * "nilainya belum diketahui", yang tidak benar di sini.
           */
          expect(layar[i][1], `layar ${where}`).toContain(digits(row.amount));
          expect(layar[i][1], `layar ${where}`).not.toContain(NIHIL_LAYAR);
          expect(cetak[i][1], `PDF ${where}`).toBe(rp(row.amount));
          expect(lembar[i][1].value, `lembar sebar ${where}`).toBe(row.amount);
        });
      });

      it("ketiganya punya dua kolom dengan judul yang sepadan", () => {
        const judul = INCOME_STATEMENT_COLUMNS.map((c) => INCOME_STATEMENT_HEADERS[c]);
        expect(screenHeaders(payload)).toEqual(judul);
        expect(sheet(payload).columns.map((c) => c.header)).toEqual(judul);
      });

      // ── 2. Kebenaran — dinyatakan terhadap PAYLOAD, bukan terhadap kanonik ─

      /*
       * Perbandingan di atas memakai `canon` sebagai UKURAN, jadi penentu yang
       * salah menggeser ketiga permukaan BERSAMAAN dan tetap terlihat
       * "sepakat" (pelajaran #276). Aturan-aturan berikut karena itu dinyatakan
       * terhadap payload-nya.
       */

      it("Pendapatan & Beban Operasional selalu punya judul dan subtotalnya", () => {
        for (const id of ["sales", "operatingExpense"] as const) {
          expect(
            canon.some((r) => r.kind === "section" && r.section === id),
            `judul ${id}`
          ).toBe(true);
          expect(
            canon.some((r) => r.kind === "subtotal" && r.section === id),
            `subtotal ${id}`
          ).toBe(true);
        }
      });

      it("band opsional tampil tepat ketika ia punya baris akun", () => {
        for (const id of ["cogs", "otherIncome", "otherExpense"] as const) {
          expect(canon.some((r) => r.section === id), `band ${id}`).toBe(
            payload[id].lines.length > 0
          );
        }
      });

      it("anak tangga ada tepat ketika band yang menghasilkannya berisi", () => {
        // Tanpa akun HPP, "Laba Kotor" hanya akan mengulang total pendapatan;
        // tanpa lain-lain, "Laba Usaha" hanya akan mengulang hasil bersihnya.
        expect(canon.some((r) => r.step === "grossProfit")).toBe(payload.cogs.lines.length > 0);
        expect(canon.some((r) => r.step === "operatingProfit")).toBe(
          payload.otherIncome.lines.length > 0 || payload.otherExpense.lines.length > 0
        );
      });

      it("band tanpa akun menghasilkan tepat SATU baris kalimat, tanpa nominal", () => {
        for (const row of canon) {
          if (row.section === undefined || row.kind !== "empty") continue;
          expect(payload[row.section].lines).toHaveLength(0);
          expect(row.amount, `nominal baris kosong ${row.section}`).toBeNull();
        }
        const bandsTampil = new Set(canon.filter((r) => r.kind === "section").map((r) => r.section));
        for (const id of bandsTampil) {
          const kosongnya = canon.filter((r) => r.kind === "empty" && r.section === id);
          expect(kosongnya).toHaveLength(payload[id!].lines.length === 0 ? 1 : 0);
        }
      });

      it("setiap subtotal band membawa total payload-nya, bukan hitungan sendiri", () => {
        for (const row of canon) {
          if (row.kind !== "subtotal") continue;
          expect(row.amount, `subtotal ${row.section}`).toBe(payload[row.section!].total);
        }
      });

      it("baris penutup selalu terakhir, membawa hasil periode dan arahnya", () => {
        const penutup = canon.at(-1)!;
        expect(penutup.kind).toBe("total");
        expect(penutup.amount).toBe(payload.netIncome);
        // Nol bukan kerugian — periode impas terbaca "Laba", sama seperti di
        // layar sejak #123.
        expect(penutup.note).toBe(payload.netIncome >= 0 ? "Laba" : "Rugi");
      });

      it("marjin kotor menempel pada Laba Kotor tepat ketika ada pendapatan", () => {
        const step = canon.find((r) => r.step === "grossProfit");
        if (step === undefined) return;
        expect(step.note === undefined).toBe(payload.sales.total === 0);
      });
    });
  }

  // ── Bug #274 apa adanya, ditulis sebagai kalimat ──────────────────────────

  /*
   * Setengah dari issue ini: subtotal yang digambar `doc.text()` bukan baris
   * tabel. Ia tidak bisa dijumlah, tidak ikut tersalin saat pembacanya menyorot
   * tabelnya, dan lepas dari perataan kolomnya — dan ia melayang ke halaman
   * berikutnya sendirian ketika tabelnya terpotong.
   */
  it("anak tangga & hasil akhir adalah BARIS TABEL di cetakan, bukan teks lepas", () => {
    const cetak = pdfRows(dagang);
    for (const label of ["Laba Kotor", "Laba Usaha", "Laba / Rugi Bersih"]) {
      const baris = cetak.find((r) => norm(r[0]).startsWith(norm(label)));
      expect(baris, `baris "${label}" di tabel PDF`).toBeDefined();
      // Dan angkanya duduk di KOLOM nominalnya, bukan di ujung teks labelnya.
      expect(baris![1]).toMatch(/^Rp/);
    }
    // Hasil akhir adalah KAKI tabel, satu baris — bukan teks di bawah tabelnya.
    expect(incomeStatementPrintRows(dagang).foot).toHaveLength(1);
    expect(norm(incomeStatementPrintRows(dagang).foot[0][0])).toMatch(/^Laba\/RugiBersih/);
  });

  /*
   * Setengahnya lagi: label yang berbunyi lain di tiap permukaan. "LABA KOTOR"
   * huruf besar semua tidak ada di kamus mana pun — ia bentuk ketiga, dan
   * bentuk ketiga tak bisa ikut berpindah bahasa bersama layarnya.
   */
  it("label cetakan berbunyi SAMA PERSIS dengan kamus Indonesia-nya", () => {
    const kamus = id.reports;
    expect(INCOME_STATEMENT_PRINT_LABELS.sales).toBe(kamus.sectionRevenue);
    expect(INCOME_STATEMENT_PRINT_LABELS.cogs).toBe(kamus.sectionCogs);
    expect(INCOME_STATEMENT_PRINT_LABELS.operatingExpense).toBe(kamus.sectionOperatingExpense);
    expect(INCOME_STATEMENT_PRINT_LABELS.otherIncome).toBe(kamus.sectionOtherIncome);
    expect(INCOME_STATEMENT_PRINT_LABELS.otherExpense).toBe(kamus.sectionOtherExpense);
    expect(INCOME_STATEMENT_PRINT_LABELS.grossProfit).toBe(kamus.grossProfitRow);
    expect(INCOME_STATEMENT_PRINT_LABELS.operatingProfit).toBe(kamus.operatingProfitRow);
    expect(INCOME_STATEMENT_PRINT_LABELS.netIncome).toBe(kamus.netIncomeRow);
    expect(INCOME_STATEMENT_PRINT_LABELS.empty).toBe(kamus.noAccountsInSection);
    expect(INCOME_STATEMENT_PRINT_LABELS.sectionTotal("Pendapatan")).toBe(
      translate(id, "reports.sectionTotal", { section: "Pendapatan" })
    );
    expect(INCOME_STATEMENT_PRINT_LABELS.grossMargin(40)).toBe(
      translate(id, "reports.grossMarginNote", { pct: "40" })
    );
    expect(INCOME_STATEMENT_PRINT_LABELS.result(true)).toBe(kamus.profit);
    expect(INCOME_STATEMENT_PRINT_LABELS.result(false)).toBe(kamus.loss);
  });

  /*
   * Dan buktinya bahwa layarnya memang MEMBACA kamus, bukan konstanta cetakan
   * yang kebetulan berbunyi Indonesia: pengguna berbahasa Inggris melihat
   * laporan berbahasa Inggris, seluruhnya — termasuk baris yang dulu berbunyi
   * "LABA KOTOR" apa pun bahasanya.
   */
  it("layar ikut berpindah bahasa bersama penggunanya", () => {
    const labels = screenRows(dagang, tEn).map((r) => norm(r[0]));
    expect(labels).toContain(norm(en.reports.sectionRevenue));
    expect(labels.some((l) => l.startsWith(norm(en.reports.grossProfitRow)))).toBe(true);
    expect(labels.some((l) => l.startsWith(norm(en.reports.netIncomeRow)))).toBe(true);
    expect(labels.join(" ")).not.toMatch(/LABAKOTOR|LABAUSAHA|LABABERSIH/);
  });

  /*
   * Band tanpa akun bersaldo menyebut ALASANNYA, di ketiganya — kalimat yang
   * SAMA PERSIS dengan Neraca (#258), dipakai ulang dan bukan disalin. Sebuah
   * "—" tidak mengatakan apa pun kepada pembaca layar, dan "Tidak ada data."
   * terbaca seperti laporan yang gagal memuat.
   */
  it("band tanpa akun bersaldo menyebut alasannya di ketiga permukaan", () => {
    const kalimat = "Tidak ada akun bersaldo pada bagian ini.";
    expect(screenRows(kosong).some((r) => r[0] === kalimat), "layar").toBe(true);
    expect(pdfRows(kosong).some((r) => r[0] === kalimat), "PDF").toBe(true);
    expect(sheet(kosong).rows.some((r) => r[0].value === kalimat), "lembar sebar").toBe(true);

    const semua = [
      ...screenRows(kosong).flat(),
      ...pdfRows(kosong).flat(),
      ...sheet(kosong).rows.flat().map((c) => String(c.value ?? "")),
    ].join(" ");
    expect(semua).not.toContain("Tidak ada data.");
  });

  /*
   * Arah hasil adalah ANOTASI pada baris penutup, bukan label kedua yang
   * menggantikannya: sebuah baris yang berganti NAMA menurut tandanya membuat
   * dua periode yang dibandingkan berdampingan tampak punya baris berbeda.
   */
  it("arah hasil disampaikan di ketiganya, tanpa mengganti nama barisnya", () => {
    expect(norm(screenRows(dagang).at(-1)![0])).toBe(norm("Laba / Rugi Bersih (Laba)"));
    expect(norm(pdfRows(dagang).at(-1)![0])).toBe(norm("Laba / Rugi Bersih (Laba)"));
    expect(norm(String(sheet(dagang).rows.at(-1)![0].value))).toBe(
      norm("Laba / Rugi Bersih (Laba)")
    );

    expect(norm(screenRows(rugi).at(-1)![0])).toBe(norm("Laba / Rugi Bersih (Rugi)"));
    expect(norm(pdfRows(rugi).at(-1)![0])).toBe(norm("Laba / Rugi Bersih (Rugi)"));
    expect(norm(String(sheet(rugi).rows.at(-1)![0].value))).toBe(
      norm("Laba / Rugi Bersih (Rugi)")
    );

    const semua = [
      ...pdfRows(rugi).flat(),
      ...sheet(rugi).rows.flat().map((c) => String(c.value ?? "")),
    ].join(" ");
    expect(semua).not.toContain("RUGI BERSIH");
  });

  /*
   * Marjin kotor dulu hanya ada di layar. Menambahkannya ke berkas ekspor
   * MEMBERI; mencabutnya dari layar akan MENGAMBIL angka yang sudah dipakai
   * orang (aturan yang sama dengan "Total Aset" di #258).
   */
  it("marjin kotor ikut tercetak, di baris Laba Kotor", () => {
    const catatan = "(40% dari pendapatan)";
    const i = incomeStatementLayout(dagang).findIndex((r) => r.step === "grossProfit");
    expect(norm(screenRows(dagang)[i][0])).toBe(norm(`Laba Kotor ${catatan}`));
    expect(norm(pdfRows(dagang)[i][0])).toBe(norm(`Laba Kotor ${catatan}`));
    expect(norm(String(sheet(dagang).rows[i][0].value))).toBe(norm(`Laba Kotor ${catatan}`));
  });

  /*
   * Lembar sebar menyimpan nol sebagai ANGKA supaya `SUM` hidup (keputusan
   * #241), dan yang TIDAK BERLAKU tetap sel kosong. Dua keadaan, dua rupa — dan
   * tak satu pun dari keduanya adalah teks.
   */
  it("lembar sebar menyimpan nol sebagai ANGKA, dan yang tak berlaku sebagai sel kosong", () => {
    const rows = sheet(kosong).rows;
    const nominal = rows.map((r) => r[1]);
    expect(nominal.filter((c) => c.format === "money").every((c) => c.value === 0)).toBe(true);
    expect(nominal.some((c) => c.format === "money")).toBe(true);
    expect(nominal.some((c) => c.value === null)).toBe(true);
    expect(nominal.some((c) => typeof c.value === "string")).toBe(false);
  });
});
