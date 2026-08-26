/**
 * Nama dokumen & nama lembar — penjaga KESAMAAN antara PDF, lembar sebar, dan
 * penentunya di `statement-layout.ts`, untuk KETIGA BELAS laporan (issue #323).
 *
 * ── Kenapa berkas ini ada ───────────────────────────────────────────────────
 * Sampai #323 setiap `build…Sheet()` di `report-export.ts` menuliskan nama
 * dokumennya sendiri sebagai string sebaris, padahal `STATEMENT_TITLES` sudah
 * memuat kalimat yang sama untuk `kind` yang sama sejak #18. Ketiga belasnya
 * kebetulan sama huruf demi huruf — dan justru itu bahayanya: tidak ada apa pun
 * yang memaksanya tetap begitu. Satu suntingan di modul PDF mengubah kepala
 * kertasnya dan meninggalkan judul di baris pertama Excel-nya, dan tidak satu
 * tes pun merah. Bentuk cacat yang sama persis dengan judul kolom rekap mitra
 * di #315, satu tingkat lebih atas.
 *
 * `tests/print-label-dictionary.test.ts` (#298) SENGAJA melewati nama dokumen,
 * dan sebabnya masih benar: lawan layar sebuah nama dokumen adalah judul
 * halaman, yang punya aturan penamaan sendiri (dua dari empat laporan keuangan
 * berawalan "Laporan" di berkasnya, dua tidak). Tapi itu jawaban untuk
 * pertanyaan LAIN. Yang ditanyakan di sini bukan layar vs kertas melainkan
 * **PDF vs lembar sebar** — dua berkas ekspor dari laporan yang sama, yang tak
 * punya satu pun alasan untuk berbeda nama.
 *
 * ── Yang diukur sebelum diperbaiki ──────────────────────────────────────────
 * Ketiga belas laporan dijalankan lewat kedua perender sebelum #323:
 *  • **judul dokumen**: 13 dari 13 SAMA dengan `STATEMENT_TITLES`. Nol
 *    ketidakcocokan, jadi menjadikannya satu sumber tidak mengubah satu huruf
 *    pun di berkas yang sudah dikirim orang.
 *  • **nama lembar** (tulisan di tab Excel): hanya 6 dari 13 sama dengan judul
 *    dokumennya; 7 sengaja dipendekkan. Ia BUKAN nama dokumen — lihat
 *    `NAMA_LEMBAR_DIPENDEKKAN` di bawah, tempat ketujuhnya dipatok beserta
 *    sebabnya.
 *
 * ── Kenapa PDF-nya dibaca, bukan diintip lewat tiruan ──────────────────────
 * Judul yang diperiksa diambil dari isi dokumen PDF yang jadi (operator `Tj`),
 * bukan dari argumen yang disodorkan ke jsPDF lewat mock: yang ingin dibuktikan
 * adalah apa yang dibaca orang di kertas. Sama seperti
 * `tests/party-recap-header-shape.test.ts` (#315) dan
 * `tests/aging-header-shape.test.ts` (#310).
 *
 * ── Kenapa ADA pemeriksaan teks sumber di bawah ─────────────────────────────
 * Membandingkan keluaran dengan konstantanya hanya menangkap salinan sebaris
 * yang bunyinya BERBEDA. Cacat yang sesungguhnya terjadi di sini adalah salinan
 * yang bunyinya SAMA — tidak salah hari ini, dan salah pada hari seseorang
 * menyunting satu sisi. Jadi satu tes melarang bentuknya: kedua puluh enam
 * kalimat itu tidak boleh muncul sebagai string literal di lapisan ekspor mana
 * pun.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { generateStatementPDF, type StatementPayload } from "@/lib/pdf/statement-pdf";
import { buildReportSheet } from "@/lib/report-export";
import { SHEET_NAMES, STATEMENT_TITLES, type StatementKind } from "@/lib/statement-layout";

import { CONTOH_PAYLOAD } from "./statement-payload-samples";

const PERUSAHAAN = { name: "PT Sai Accounting", address: "Jl. Contoh No. 1" };

/**
 * Seluruh teks yang benar-benar tertulis di dalam dokumen PDF, berurutan. jsPDF
 * menulis tiap potongan sebagai `(teks) Tj`, dengan `(`, `)` dan `\` yang
 * di-escape — dikembalikan di sini supaya "Laporan Laba / Rugi" terbaca utuh.
 */
function pdfTexts(p: StatementPayload): string[] {
  const doc = generateStatementPDF(p, PERUSAHAAN);
  return [...doc.output().matchAll(/\(((?:\\.|[^()\\])*)\)\s*Tj/g)].map((m) =>
    m[1].replace(/\\([()\\])/g, "$1")
  );
}

/**
 * Aturan nama tab Excel: maksimal 31 huruf, dan tujuh huruf terlarang. Ditulis
 * di sini sebagai pemeriksaan, bukan sebagai kepercayaan — `buildWorkbookBuffer()`
 * memenggal diam-diam di huruf ke-31, jadi nama yang kepanjangan tidak akan
 * pernah mengeluh, ia hanya muncul terpotong di tab pengguna.
 */
const TERLARANG = /[[\]:*?/\\]/;
const legalSebagaiTab = (s: string) => s.length > 0 && s.length <= 31 && !TERLARANG.test(s);

interface Dipendekkan {
  kind: StatementKind;
  /** Bunyi nama lembar HARI INI, ditulis apa adanya sebagai patok. */
  patok: string;
  sebab: string;
}

/**
 * Nama lembar yang HARI INI berbeda dari nama dokumennya — 7 dari 13.
 *
 * Ia daftar temuan, bukan daftar pekerjaan (rambu #298): mengganti nama tab
 * mengubah berkas yang sudah dikirim & diarsipkan orang, persis seperti
 * mengganti judul kolom. Yang dilakukan penjaga ini: memaku ketujuhnya pada
 * bunyinya hari ini, dan menuntut enam sisanya TETAP sama dengan judul
 * dokumennya — jadi tidak satu pun bisa bergeser, atau diam-diam didamaikan,
 * tanpa terlihat di diff.
 */
/*
 * ── EMPAT ENTRI DICABUT DI #331 ────────────────────────────────────────────
 * `cash-flow`, `receivables`, `payables`, dan `cash-bank` dulu berdiri di sini
 * dengan sebab yang berbunyi "pilihan penamaan" — yaitu tanpa sebab teknis
 * sama sekali. Tes ini sendiri yang menyuruh mencabutnya begitu pengecualiannya
 * berhenti mengecualikan apa pun.
 *
 * #331 menyamakan keempatnya dengan judul dokumennya. Yang TERSISA di bawah
 * berbeda karena judulnya memang MUSTAHIL jadi nama tab — dan itu kini
 * diturunkan dari aturannya di `tests/sheet-name-follows-title`, bukan
 * didaftar. Daftar ini tinggal menjaga bunyinya tidak berubah diam-diam.
 */
const NAMA_LEMBAR_DIPENDEKKAN: Dipendekkan[] = [
  {
    kind: "income-statement",
    patok: "Laba Rugi",
    sebab:
      'Judulnya "Laporan Laba / Rugi" memuat garis miring — huruf yang TERLARANG ' +
      "di nama tab Excel. Nama lembar ini tidak bisa disamakan dengan judul " +
      "dokumennya tanpa membuang tandanya.",
  },
  {
    kind: "stock-movement",
    patok: "Kartu Stok",
    sebab:
      'Judulnya "Kartu Stok / Mutasi Persediaan" memuat garis miring — terlarang ' +
      "di nama tab.",
  },
  {
    kind: "opname-history",
    patok: "Riwayat Opname",
    sebab:
      'Judulnya "Riwayat Hitung Ulang Stok (Stok Opname)" 39 huruf — melewati ' +
      "batas 31, jadi Excel akan memenggalnya di tengah kata.",
  },
];

const DIPENDEKKAN = new Map(NAMA_LEMBAR_DIPENDEKKAN.map((d) => [d.kind, d]));

describe("nama dokumen & nama lembar (issue #323)", () => {
  /*
   * Penjaga bagi penjaganya: sebuah laporan baru yang lupa dibuatkan payload
   * contoh akan lolos seluruh perulangan di bawah tanpa suara, dan berkas ini
   * akan tetap hijau sambil menjaga makin sedikit.
   */
  it("setiap laporan yang punya nama dokumen punya payload contoh", () => {
    expect(CONTOH_PAYLOAD.map((p) => p.kind).sort()).toEqual(
      Object.keys(STATEMENT_TITLES).sort()
    );
  });

  for (const p of CONTOH_PAYLOAD) {
    const kind = p.kind as StatementKind;
    const judul = STATEMENT_TITLES[kind];

    it(`lembar sebar ${kind} memakai judul dari STATEMENT_TITLES`, () => {
      expect(
        buildReportSheet(p).title,
        "Judul dokumen di lembar sebar tidak lagi datang dari `STATEMENT_TITLES`. " +
          "Ia pernah ditulis sebaris di dalam `build…Sheet()` (#323); jangan kembali."
      ).toBe(judul);
    });

    it(`PDF ${kind} mencetak judul dari STATEMENT_TITLES`, () => {
      expect(
        pdfTexts(p),
        `Judul "${judul}" tidak ditemukan di dalam PDF-nya. Nama dokumen harus ` +
          "datang dari `STATEMENT_TITLES` di `statement-layout.ts` untuk KEDUA " +
          "permukaan ekspor (#323)."
      ).toContain(judul);
    });

    it(`nama lembar ${kind} memakai SHEET_NAMES`, () => {
      expect(
        buildReportSheet(p).name,
        "Nama tab lembar tidak lagi datang dari `SHEET_NAMES`. Ia bukan judul " +
          "dokumen — aturannya sendiri (≤ 31 huruf, tanpa `/`), dan rumahnya " +
          "`statement-layout.ts` (#323)."
      ).toBe(SHEET_NAMES[kind]);
    });
  }

  /*
   * Pertanyaan yang tidak pernah ditanyakan sebelum #323, dan yang #298 memang
   * tidak menjawabnya: dua berkas ekspor dari laporan yang SAMA menyebut diri
   * mereka dengan nama yang sama.
   */
  it("PDF dan lembar sebar menyebut dokumen yang sama dengan nama yang sama", () => {
    for (const p of CONTOH_PAYLOAD) {
      expect(pdfTexts(p)).toContain(buildReportSheet(p).title);
    }
  });

  describe("nama lembar yang dipendekkan — dipatok, bukan didamaikan", () => {
    for (const d of NAMA_LEMBAR_DIPENDEKKAN) {
      it(`${d.kind} = "${d.patok}"`, () => {
        expect(
          SHEET_NAMES[d.kind],
          `nama lembar ${d.kind} berubah. Ia sengaja berbeda dari judul ` +
            `dokumennya hari ini (${d.sebab}) — dan mengubahnya mengubah berkas ` +
            "yang sudah dikirim orang, jadi perubahannya harus diputuskan, bukan " +
            "disisipkan."
        ).toBe(d.patok);
        expect(
          SHEET_NAMES[d.kind],
          `nama lembar ${d.kind} kini SAMA dengan judul dokumennya. ` +
            "Pengecualiannya sudah tidak mengecualikan apa pun — cabut entrinya " +
            "dari NAMA_LEMBAR_DIPENDEKKAN supaya ia dijaga sebagai persamaan."
        ).not.toBe(STATEMENT_TITLES[d.kind]);
      });
    }

    it("nama lembar yang TIDAK terdaftar sama persis dengan judul dokumennya", () => {
      const menyimpang = (Object.keys(SHEET_NAMES) as StatementKind[])
        .filter((k) => !DIPENDEKKAN.has(k))
        .filter((k) => SHEET_NAMES[k] !== STATEMENT_TITLES[k]);
      expect(
        menyimpang,
        "Nama lembar berikut mulai berbeda dari judul dokumennya tanpa alasan " +
          "tertulis. Kalau perbedaannya disengaja, daftarkan di " +
          "NAMA_LEMBAR_DIPENDEKKAN beserta sebabnya — nama tab yang bergeser " +
          "diam-diam adalah berkas yang tidak lagi terbaca sama oleh penerimanya."
      ).toEqual([]);
    });
  });

  /*
   * Kenapa kedua tabel tidak boleh dilebur jadi satu: tiga judul dokumen tidak
   * sah sebagai nama tab. Dipatok sebagai daftar, bukan disebut di komentar,
   * supaya suatu hari yang ingin "merapikan" duplikasi ini menabrak tes alih-alih
   * menabrak `buildWorkbookBuffer()` yang memenggal tanpa suara.
   */
  it("judul dokumen yang TIDAK sah sebagai nama tab tetap tiga yang itu", () => {
    const haram = (Object.keys(STATEMENT_TITLES) as StatementKind[]).filter(
      (k) => !legalSebagaiTab(STATEMENT_TITLES[k])
    );
    expect(haram.sort()).toEqual(["income-statement", "opname-history", "stock-movement"]);
  });

  it("setiap nama lembar sah dan tak kembar", () => {
    for (const [kind, nama] of Object.entries(SHEET_NAMES)) {
      expect(
        legalSebagaiTab(nama),
        `nama lembar ${kind} ("${nama}") melanggar aturan tab Excel: maksimal 31 ` +
          "huruf, tanpa [ ] : * ? / \\. `buildWorkbookBuffer()` akan memenggalnya " +
          "tanpa mengeluh."
      ).toBe(true);
    }
    const semua = Object.values(SHEET_NAMES);
    expect(new Set(semua).size, "dua laporan memakai nama tab yang sama").toBe(semua.length);
  });

  /*
   * Penjaga BENTUK, bukan bunyi — lihat kepala berkas: salinan sebaris yang
   * bunyinya sama tidak bisa ditangkap dengan membandingkan keluaran, karena
   * keluarannya memang masih sama.
   */
  it("tidak ada nama dokumen atau nama lembar yang ditulis sebaris di lapisan ekspor", () => {
    const kalimat = [
      ...new Set([...Object.values(STATEMENT_TITLES), ...Object.values(SHEET_NAMES)]),
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
      "Nama dokumen / nama lembar ditulis lagi sebagai string di lapisan ekspor. " +
        "Ia hanya boleh hidup di `STATEMENT_TITLES` / `SHEET_NAMES` " +
        "(`statement-layout.ts`) — salinan kedua yang hari ini kebetulan sama " +
        "adalah persis cacat yang #323 tutup."
    ).toEqual([]);
  });
});
