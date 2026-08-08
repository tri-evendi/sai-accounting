/**
 * Bentuk Neraca Saldo — penjaga KESAMAAN antara layar, PDF, dan lembar sebar
 * (issue #275).
 *
 * ── Kenapa berkas ini ada, padahal ketiga permukaan sudah punya tesnya ──────
 * Justru itu masalahnya, dan di laporan ini akibatnya yang paling mahal:
 * **cetakan membuat pernyataan yang layarnya sengaja TOLAK keluarkan.** Pada
 * buku yang belum punya satu jurnal pun, layar tidak menggambar baris Total
 * sama sekali (keputusan #198 — "Total Rp 0 · Seimbang" terbaca seperti hasil
 * audit), sementara PDF dan lembar sebar tetap mencetak "Total (Seimbang)".
 * Ketiganya hijau di tesnya masing-masing, karena masing-masing benar menurut
 * sumbernya sendiri. Yang tidak diuji siapa pun adalah kesamaan di antara
 * ketiganya — dan selembar Neraca Saldo bertuliskan "Seimbang" di atas buku
 * kosong adalah dokumen yang bisa dipercaya orang lain sebagai bukti pembukuan
 * sudah diperiksa dan cocok.
 *
 * Jadi tes ini sengaja BUKAN tiga tes yang masing-masing memeriksa satu
 * keluaran. Ia menjalankan SATU payload lewat ketiga perender dan membandingkan
 * hasilnya baris demi baris dengan bentuk kanonik `trialBalanceLayout()`.
 * Layarnya DIRENDER SUNGGUHAN (`renderToStaticMarkup`) lalu barisnya dibaca
 * kembali — bukan disalin logikanya ke dalam tes, karena salinan yang setuju
 * dengan dirinya sendiri tidak menjaga apa pun.
 *
 * ── Payload contoh yang terlalu jinak bukan penjaga ─────────────────────────
 * Pelajaran #258: pelanggaran sengaja yang ketiga di sana tidak merah dengan
 * tiga payload pertama. Karena itu daftar di bawah memuat **buku kosong**
 * (kasus yang menyingkap bug ini), buku seimbang biasa, buku **tidak
 * seimbang**, dan — yang paling mudah terlupa — buku yang **punya jurnal tetapi
 * seluruh saldonya nol**. Yang terakhir itulah yang membuktikan aturannya "ada
 * baris akun?", bukan "totalnya nol?": kedua keadaan itu berbeda, dan hanya
 * yang pertama yang boleh kehilangan baris Total.
 *
 * ── Yang dibandingkan, dan yang sengaja tidak ──────────────────────────────
 * DIBANDINGKAN: jumlah baris, urutannya, labelnya, dan keadaan tiap sel nominal
 * (tak berlaku / nol / bernilai). Itulah bentuk laporan.
 *
 * TIDAK dibandingkan: rupa penulisan angka dan spasi. Lembar sebar menyimpan
 * ANGKA supaya kolomnya bisa dijumlah; layar dan kertas menuliskannya dengan
 * pemformat rupiahnya masing-masing. Karena itu label dibandingkan setelah
 * SELURUH spasi dibuang.
 *
 * DIBANDINGKAN DENGAN `startsWith`: dua baris yang membawa ANOTASI khas
 * permukaannya — baris Total (lencana di layar, tanda kurung di cetakan) dan
 * baris buku kosong (di layar ia `EmptyState` yang menambahkan kalimat penjelas
 * dan, bila penggunanya boleh mencatat, satu ajakan bertindak). Keduanya tetap
 * wajib DIAWALI label kanoniknya, jadi baris yang hilang atau berganti nama
 * tetap tertangkap.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import id from "@/lib/i18n/dictionaries/id.json";
import { translate } from "@/lib/i18n/dictionary";
import { buildReportSheet } from "@/lib/report-export";
import { trialBalancePrintRows } from "@/lib/pdf/statement-pdf";
import {
  trialBalanceLayout,
  TRIAL_BALANCE_COLUMNS,
  TRIAL_BALANCE_HEADERS,
  type TrialBalanceLayoutRow,
} from "@/lib/statement-layout";
import {
  TrialBalanceStatement,
  type TrialBalancePayload,
  type T,
} from "@/components/reports/trial-balance-statement";

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

/** Nol di layar: `Money` menulis nilai yang tidak ada dengan em dash. */
const NIHIL_LAYAR = "—";

// ── Payload contoh ──────────────────────────────────────────────────────────

type Line = TrialBalancePayload["rows"][number];

const line = (code: string, name: string, debit: number, credit: number): Line => ({
  code,
  name,
  debit,
  credit,
});

function payloadOf(rows: Line[]): TrialBalancePayload {
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  return {
    kind: "trial-balance",
    period: "Per 31 Juli 2026",
    rows,
    totalDebit,
    totalCredit,
    balanced: Math.round(totalDebit * 100) === Math.round(totalCredit * 100),
  };
}

/**
 * **Buku yang belum punya satu jurnal pun** — kasus yang menyingkap issue #275.
 * Tidak ada baris akun, jadi tidak ada baris Total di permukaan mana pun.
 */
const kosong = payloadOf([]);

/**
 * Neraca saldo sehari-hari. Baris "1-900" bersaldo nol di KEDUA sisi: ia akun
 * yang mutasinya saling menutup, dan `getTrialBalance` sengaja
 * mempertahankannya supaya barisnya tetap bisa diaudit. Ia sekaligus mengunci
 * rupa nol di ketiga permukaan.
 */
const seimbang = payloadOf([
  line("1-100", "Kas & Bank", 9_000_000, 0),
  line("1-900", "Kas Kecil", 0, 0),
  line("2-100", "Utang Usaha", 0, 4_000_000),
  line("3-100", "Modal Pemilik", 0, 5_000_000),
]);

/**
 * Buku yang **punya jurnal tetapi seluruh saldonya nol**. Ia bukan buku kosong,
 * dan karena itu ia TETAP mendapat baris Total — "Total, nol, nol" adalah
 * pernyataan yang benar tentang buku yang jurnalnya saling menutup, berbeda
 * dari buku yang belum diapa-apakan. Payload inilah yang membedakan aturan
 * "ada baris akun?" dari aturan "totalnya nol?".
 */
const saldoNolTapiAdaJurnal = payloadOf([
  line("1-100", "Kas & Bank", 0, 0),
  line("5-100", "Beban Operasional", 0, 0),
]);

/** Buku yang tidak seimbang — anotasi Total-nya berubah di ketiganya. */
const tidakSeimbang: TrialBalancePayload = {
  ...payloadOf([line("1-100", "Kas & Bank", 9_000_000, 0), line("3-100", "Modal", 0, 8_000_000)]),
};

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
 * Baris tabel yang BENAR-BENAR dirender halaman Neraca Saldo — `<tbody>` lalu
 * `<tfoot>`, tanpa `<thead>`.
 *
 * Sel ber-`colSpan` DIMEKARKAN menjadi sel kosong sebanyak kolom yang
 * ditelannya, bukan dilengkapi di ujung baris: label "Total" membentang di atas
 * dua kolom pertama, jadi menambal di ujung akan menggeser kedua kolom
 * nominalnya satu langkah ke kiri dan membuat penjaga ini membandingkan kolom
 * yang salah.
 */
function screenRows(payload: TrialBalancePayload): string[][] {
  const markup = renderToStaticMarkup(createElement(TrialBalanceStatement, { payload, t }));
  const body = markup.replace(/<thead\b[\s\S]*?<\/thead>/g, "");
  return [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((row) => {
    const cells: string[] = [];
    for (const c of row[1].matchAll(/<(t[dh])\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
      cells.push(textOf(c[3]));
      const span = Number(/colspan="(\d+)"/i.exec(c[2])?.[1] ?? 1);
      for (let i = 1; i < span; i += 1) cells.push("");
    }
    while (cells.length < TRIAL_BALANCE_COLUMNS.length) cells.push("");
    return cells;
  });
}

function screenHeaders(payload: TrialBalancePayload): string[] {
  const markup = renderToStaticMarkup(createElement(TrialBalanceStatement, { payload, t }));
  const head = markup.match(/<thead\b[\s\S]*?<\/thead>/)?.[0] ?? "";
  return [...head.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => textOf(m[1]));
}

/** Badan + kaki cetakan sebagai satu daftar berurutan, seperti dua yang lain. */
function pdfRows(payload: TrialBalancePayload): string[][] {
  const { body, foot } = trialBalancePrintRows(payload);
  return [...body, ...foot];
}

function sheet(payload: TrialBalancePayload) {
  return buildReportSheet(payload);
}

/** Kode + nama sebagai satu label — ketiga permukaan memakai dua kolom untuknya. */
const labelOf = (cells: string[]) => norm(`${cells[0]}${cells[1]}`);

/** Baris yang membawa anotasi khas permukaannya — lihat kepala berkas. */
const annotated = (row: TrialBalanceLayoutRow) => row.kind !== "line";

// ── Penjaganya ──────────────────────────────────────────────────────────────

describe("Neraca Saldo — satu bentuk untuk layar, PDF, dan lembar sebar", () => {
  const cases: [string, TrialBalancePayload][] = [
    ["buku yang belum punya satu jurnal pun", kosong],
    ["neraca saldo yang seimbang", seimbang],
    ["buku yang jurnalnya saling menutup di nol", saldoNolTapiAdaJurnal],
    ["neraca saldo yang tidak seimbang", tidakSeimbang],
  ];

  for (const [nama, payload] of cases) {
    describe(nama, () => {
      const canon = trialBalanceLayout(payload);

      it("ketiganya punya jumlah baris yang sama, sebanyak bentuk kanoniknya", () => {
        expect(screenRows(payload)).toHaveLength(canon.length);
        expect(pdfRows(payload)).toHaveLength(canon.length);
        expect(sheet(payload).rows).toHaveLength(canon.length);
      });

      it("ketiganya menyebut label yang sama, dalam urutan yang sama", () => {
        const layar = screenRows(payload).map(labelOf);
        const cetak = pdfRows(payload).map(labelOf);
        const lembar = sheet(payload).rows.map((r) =>
          norm(`${String(r[0].value ?? "")}${String(r[1].value ?? "")}`)
        );

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

      it("sel nominal berada di keadaan yang sama di ketiganya", () => {
        const layar = screenRows(payload);
        const cetak = pdfRows(payload);
        const lembar = sheet(payload).rows;

        canon.forEach((row, i) => {
          ([2, 3] as const).forEach((col) => {
            const value = col === 2 ? row.debit : row.credit;
            const where = `baris ${i} (${row.kind}) kolom ${col === 2 ? "debit" : "kredit"}`;
            if (value === null) {
              // Tak berlaku: kosong di ketiganya. BUKAN nol — buku yang belum
              // punya jurnal tidak berdebit nol rupiah (Prinsip Inti MASTER.md).
              expect(layar[i][col], `layar ${where}`).toBe("");
              expect(cetak[i][col], `PDF ${where}`).toBe("");
              expect(lembar[i][col].value, `lembar sebar ${where}`).toBeNull();
              return;
            }
            if (Math.round(value * 100) === 0) {
              // Nol = akun itu tidak bersaldo di sisi ini. Layar & kertas
              // menuliskannya sebagai ketiadaan; lembar sebar menyimpan ANGKA
              // nol supaya `SUM` tetap hidup (keputusan #241).
              expect(layar[i][col], `layar ${where}`).toContain(NIHIL_LAYAR);
              expect(cetak[i][col], `PDF ${where}`).toBe("-");
              expect(lembar[i][col].value, `lembar sebar ${where}`).toBe(0);
              return;
            }
            expect(layar[i][col], `layar ${where}`).toContain(digits(value));
            expect(cetak[i][col], `PDF ${where}`).toBe(rp(value));
            expect(lembar[i][col].value, `lembar sebar ${where}`).toBe(value);
          });
        });
      });

      /*
       * Aturannya dinyatakan terhadap PAYLOAD-nya, bukan terhadap bentuk
       * kanonik: perbandingan baris demi baris di atas memakai `canon` sebagai
       * ukuran, jadi penentu yang salah akan menggeser ketiga permukaan
       * BERSAMAAN dan tetap terlihat "sepakat". Yang menentukan ada tidaknya
       * baris Total adalah ada tidaknya baris akun — bukan besar totalnya.
       */
      it("baris Total ada tepat ketika bukunya punya baris akun", () => {
        expect(canon.some((r) => r.kind === "total")).toBe(payload.rows.length > 0);
      });

      it("ketiganya punya empat kolom dengan judul yang sepadan", () => {
        const judul = TRIAL_BALANCE_COLUMNS.map((c) => TRIAL_BALANCE_HEADERS[c]);
        expect(screenHeaders(payload)).toEqual(judul);
        expect(sheet(payload).columns.map((c) => c.header)).toEqual(judul);
      });
    });
  }

  /*
   * Bug #275 apa adanya, ditulis sebagai kalimat. Keputusan #198 — buku kosong
   * tidak mencetak "Total Rp 0 · Seimbang", karena itu terbaca seperti hasil
   * audit atas buku yang belum diperiksa apa pun — kini berlaku di KETIGA
   * permukaan, bukan hanya di layar. Alasannya justru lebih kuat di kertas:
   * PDF adalah bentuk yang dilampirkan, dikirim, dan diarsipkan.
   */
  it("buku kosong tidak mencetak baris Total di satu permukaan pun", () => {
    expect(trialBalanceLayout(kosong).some((r) => r.kind === "total")).toBe(false);

    const berawalanTotal = (labels: string[]) => labels.filter((l) => l.startsWith("Total"));
    expect(berawalanTotal(screenRows(kosong).map(labelOf)), "layar").toEqual([]);
    expect(berawalanTotal(pdfRows(kosong).map(labelOf)), "PDF").toEqual([]);
    expect(
      berawalanTotal(sheet(kosong).rows.map((r) => norm(String(r[1].value ?? "")))),
      "lembar sebar"
    ).toEqual([]);

    // Dan tidak satu pun permukaan menyatakan keseimbangan tentangnya.
    expect(screenRows(kosong).flat().join(" ")).not.toMatch(/[Ss]eimbang/);
    expect(pdfRows(kosong).flat().join(" ")).not.toMatch(/[Ss]eimbang/);
    expect(
      sheet(kosong)
        .rows.flat()
        .map((c) => String(c.value ?? ""))
        .join(" ")
    ).not.toMatch(/[Ss]eimbang/);
  });

  /*
   * Diam bukan pilihan: tabel yang hanya berisi judul kolom terbaca seperti
   * ekspor yang gagal. Buku kosong tetap mendapat SATU baris yang menyebut
   * keadaannya, di ketiga permukaan.
   */
  it("buku kosong tetap menyebut keadaannya, satu baris, di ketiga permukaan", () => {
    const kalimat = "Belum ada saldo sampai tanggal ini";

    expect(screenRows(kosong)).toHaveLength(1);
    expect(pdfRows(kosong)).toHaveLength(1);
    expect(sheet(kosong).rows).toHaveLength(1);

    // Di layar kalimat itu dibawa `EmptyState`, yang MENAMBAHKAN penjelas —
    // tambahan yang tidak punya padanan di kertas, seperti lencana keseimbangan.
    expect(labelOf(screenRows(kosong)[0])).toMatch(new RegExp(`^${escapeRe(norm(kalimat))}`));
    expect(labelOf(pdfRows(kosong)[0])).toBe(norm(kalimat));
    expect(String(sheet(kosong).rows[0][1].value)).toBe(kalimat);
  });

  /*
   * Sisi lain aturan yang sama, dan yang paling mudah lolos: buku yang PUNYA
   * jurnal tetapi seluruh saldonya nol tetap mendapat baris Total-nya. Yang
   * menentukan adalah ada tidaknya baris akun, bukan besar totalnya — sebuah
   * penentu yang membaca `totalDebit === 0` akan menghapus baris yang benar.
   */
  it("buku yang jurnalnya saling menutup tetap mendapat baris Total di ketiganya", () => {
    const canon = trialBalanceLayout(saldoNolTapiAdaJurnal);
    expect(canon.at(-1)!.kind).toBe("total");

    expect(labelOf(screenRows(saldoNolTapiAdaJurnal).at(-1)!)).toMatch(/^Total/);
    expect(labelOf(pdfRows(saldoNolTapiAdaJurnal).at(-1)!)).toMatch(/^Total/);
    expect(norm(String(sheet(saldoNolTapiAdaJurnal).rows.at(-1)![1].value))).toMatch(/^Total/);
  });

  /*
   * Keadaan seimbang adalah ANOTASI pada baris Total, dan ia harus TERBACA di
   * ketiganya — lencana di layar, tanda kurung di cetakan. Kalimat "periksa
   * jurnal" sama persis dengan yang dipakai Neraca (#258): satu anotasi, bukan
   * dua yang bisa menyimpang.
   */
  it("keadaan seimbang disampaikan di layar maupun di cetakan", () => {
    expect(screenRows(seimbang).at(-1)![0]).toContain("Seimbang");
    expect(pdfRows(seimbang).at(-1)![1]).toContain("(Seimbang)");
    expect(String(sheet(seimbang).rows.at(-1)![1].value)).toContain("(Seimbang)");

    expect(screenRows(tidakSeimbang).at(-1)![0]).toContain("Tidak seimbang");
    expect(pdfRows(tidakSeimbang).at(-1)![1]).toContain("TIDAK SEIMBANG — periksa jurnal");
    expect(String(sheet(tidakSeimbang).rows.at(-1)![1].value)).toContain(
      "TIDAK SEIMBANG — periksa jurnal"
    );
  });
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
