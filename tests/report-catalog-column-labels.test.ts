/**
 * Judul kolom di KATALOG vs judul kolom di KERTAS — penjaga agar dialog
 * "pilih kolom" tidak menawarkan kolom bernama X untuk berkas berkolom Y
 * (issue #316).
 *
 * ── Salinan ketiga, dan kenapa ia yang paling berbahaya ─────────────────────
 * Kedelapan judul kolom Umur Piutang/Utang dulu tertulis TIGA kali: konstanta
 * cetakan (`AGING_HEADERS` + `AGING_PARTY_HEADERS`), kunci kamus yang dibaca
 * tabel layarnya, dan — untuk ketiga kalinya — string bahasa Indonesia di
 * `report-catalog.ts`. Dua yang pertama sudah diikat #298/#310; yang ketiga
 * tidak dijaga siapa pun, padahal ia yang menyalakan dialog pilih-kolom. Sebuah
 * kolom yang berganti nama di dua tempat lain akan tetap disebut nama lamanya
 * di dialog, dan pengguna mencentang "Saldo" untuk mendapatkan kolom bernama
 * "Sisa Stok".
 *
 * ── Keputusan #316: katalog menyimpan KUNCI, dan kuncinya kunci LAYAR ───────
 * `ReportColumnSpec.labelKey` kini kunci kamus, dan kunci yang dipilih adalah
 * kunci yang dipakai TABEL LAYAR laporan itu (`payables/page.tsx` menamai kolom
 * pihaknya `payables.colSupplier`, dst.). Dua akibat sekaligus:
 *
 *  • salinan ketiganya lenyap — tidak ada lagi kalimat di katalog, hanya kunci;
 *  • dialognya ikut locale, seperti setiap kalimat lain di dalamnya. Ongkosnya
 *    NOL kunci baru: ketiga puluh satu kunci yang dipakai 42 kolom katalog
 *    sudah ada di `id`/`en`/`zh` sebelum issue ini.
 *
 * Katalog sengaja TIDAK membaca judul kertas. Kertas menulis "Saldo Awal (IDR)"
 * karena selnya menyimpan angka telanjang; layar tidak perlu satuan karena
 * `Money` selalu membawa "Rp" — aturan `kamus+IDR` yang sudah dikodekan #298 di
 * `tests/print-label-dictionary.test.ts`. Berkas ini memakai aturan yang sama,
 * satu permukaan lebih jauh.
 *
 * ── Yang diukur, sebelum diputuskan ─────────────────────────────────────────
 * Dari 42 judul kolom katalog: **32 sama huruf demi huruf** dengan kertasnya,
 * **5 wajib berbeda** karena `kamus+IDR`, dan **5 berbeda hari ini** karena
 * ketidakcocokan layar⇄kertas yang SUDAH dipatok #298/#309 dan menunggu
 * keputusan pemilik laporan. Tidak ada satu pun pengecualian BARU: kelima
 * `BEDA` di bawah adalah entri `BEDA_HARI_INI` yang sama, dilihat dari sisi
 * katalog.
 *
 * ── Nol perubahan keluaran ekspor ───────────────────────────────────────────
 * `ReportColumnSpec.label` hanya pernah dibaca satu tempat: daftar centang di
 * `report-launch-dialog.tsx`. Berkas PDF & lembar sebar mengambil judulnya dari
 * `statement-layout.ts` / `statement-pdf.ts` dan tidak pernah menyentuh katalog,
 * jadi #278 tetap berlaku utuh — ekspor berbahasa Indonesia, tak satu huruf pun
 * bergeser.
 */
import { describe, expect, it } from "vitest";

import id from "@/lib/i18n/dictionaries/id.json";
import { translate } from "@/lib/i18n/dictionary";
import { REPORTS, REPORT_CATEGORIES, reportTextKey } from "@/lib/report-catalog";
import {
  AGING_COLUMNS,
  CASH_BANK_COLUMNS,
  CASH_BANK_HEADERS,
  PARTY_RECAP_COLUMNS,
  PARTY_RECAP_HEADERS,
  STOCK_MOVEMENT_COLUMNS,
  STOCK_MOVEMENT_HEADERS,
  STOCK_VALUE_COLUMNS,
  STOCK_VALUE_HEADERS,
  agingHeaders,
} from "@/lib/statement-layout";

/** Penerjemah bahasa SUMBER — kamus `id.json` yang sungguhan, bukan tiruan. */
const t = (key: string) => translate(id, key);

interface Kertas {
  /** Urutan kolom kanonik laporan itu, dari penentu bentuknya. */
  kolom: readonly string[];
  /** Judul yang BENAR-BENAR dicetak, dibaca dari konstantanya. */
  judul: Record<string, string>;
}

/**
 * Laporan berkolom-pilihan → penentu bentuk & judul kertasnya.
 *
 * Nilainya diambil dari konstanta yang sungguhan, tidak disalin ke sini, jadi
 * penjaga ini merah bila SALAH SATU sisi bergeser.
 */
const KERTAS: Record<string, Kertas> = {
  receivables: { kolom: AGING_COLUMNS, judul: agingHeaders("receivables") },
  payables: { kolom: AGING_COLUMNS, judul: agingHeaders("payables") },
  "sales-by-customer": {
    kolom: PARTY_RECAP_COLUMNS,
    judul: PARTY_RECAP_HEADERS["sales-by-customer"],
  },
  "purchases-by-supplier": {
    kolom: PARTY_RECAP_COLUMNS,
    judul: PARTY_RECAP_HEADERS["purchases-by-supplier"],
  },
  "stock-value": { kolom: STOCK_VALUE_COLUMNS, judul: STOCK_VALUE_HEADERS },
  "stock-movement": { kolom: STOCK_MOVEMENT_COLUMNS, judul: STOCK_MOVEMENT_HEADERS },
  "cash-bank": { kolom: CASH_BANK_COLUMNS, judul: CASH_BANK_HEADERS },
};

/**
 * Kolom uang yang judul kertasnya menyebut satuannya sementara layar tidak —
 * aturan `kamus+IDR` milik #298, bukan kelonggaran. Dinyatakan sebagai ATURAN
 * dan bukan pasangan yang dipatok, supaya penggantian kata di kamus tetap
 * tertangkap: ubah `reports.colChange` menjadi "Mutasi" dan penjaga ini menuntut
 * kertasnya berbunyi "Mutasi (IDR)".
 */
const KAMUS_IDR = new Set([
  // Nilai Persediaan berperiode (#492) — empat kolom uang, semuanya menyebut
  // satuannya di kertas dan tidak di layar.
  "stock-value.openingValue",
  "stock-value.inValue",
  "stock-value.outValue",
  "stock-value.closingValue",
  "cash-bank.opening",
  "cash-bank.net",
  "cash-bank.closing",
]);

interface Beda {
  /** Bunyi kamus HARI INI — yaitu yang dibaca dialog & tabel layar. */
  kamus: string;
  /** Bunyi kertas HARI INI. */
  kertas: string;
  sebab: string;
}

/**
 * Kolom yang katalog & kertasnya memang BERBEDA hari ini.
 *
 * Kelimanya bukan temuan baru: masing-masing sudah berdiri di `BEDA_HARI_INI`
 * milik `tests/print-label-dictionary.test.ts` sebagai ketidakcocokan
 * layar⇄kertas yang menunggu keputusan pemilik laporan. Yang berubah di #316
 * hanyalah dari sisi mana ia terlihat: karena katalog kini membaca kunci LAYAR,
 * ketidakcocokan itu muncul juga di dialog pilih-kolom — dan tidak ada satu pun
 * pengecualian yang lahir di sini sendiri.
 *
 * Keduanya dipatok, jadi menyunting sisi mana pun memerahkan tes ini; dan
 * pasangan yang kebetulan sudah SAMA harus keluar dari daftar (lihat tes
 * "pengecualian yang tidak lagi mengecualikan").
 */
const BEDA: Record<string, Beda> = {
  "payables.party": {
    kamus: "Supplier",
    kertas: "Pemasok",
    sebab:
      "Aplikasi ini memakai kedua kata di tempat berbeda (menu \"Pemasok\", " +
      "halaman utang \"Supplier\") — lihat AGING_PARTY_HEADERS.payables di #298.",
  },
  "payables.total": {
    kamus: "Nilai Pembelian",
    kertas: "Nilai Dokumen",
    sebab:
      "Satu konstanta cetakan melayani dua laporan; layar Utang menyebutnya " +
      "\"Nilai Pembelian\". #309 mengusulkan layar Utang ikut \"Nilai Dokumen\" " +
      "seperti kembarannya di Piutang — keputusan pemilik laporan.",
  },
  "sales-by-customer.docCount": {
    kamus: "Jumlah Dokumen",
    kertas: "Dokumen",
    sebab:
      "Di sini LAYAR yang lebih tepat (kolomnya cacah), dan \"Dokumen\" sudah " +
      "dipakai kolom NOMOR dokumen di Umur Piutang/Utang. Mendamaikannya berarti " +
      "kertas yang ikut — yaitu berkas yang sudah dikirim orang (#309).",
  },
  "purchases-by-supplier.docCount": {
    kamus: "Jumlah Dokumen",
    kertas: "Dokumen",
    sebab: "Sama dengan Penjualan per Pelanggan — satu kunci kamus, dua laporan.",
  },
};

/** Laporan yang menyatakan pilihan kolom — sumber seluruh tes di bawah. */
const BERKOLOM = REPORTS.filter((r) => r.columns && r.columns.length > 0);

describe("judul kolom katalog vs kertas (issue #316)", () => {
  it("setiap laporan berkolom-pilihan punya penentu bentuk kertas", () => {
    expect(
      BERKOLOM.map((r) => r.id).filter((id) => !(id in KERTAS)),
      "Laporan berikut menawarkan pilihan kolom tetapi tidak dipasangkan dengan " +
        "judul kertasnya di KERTAS. Tanpa pasangan, judul kolom di dialognya " +
        "bebas menyimpang dari berkas yang dihasilkannya."
    ).toEqual([]);
  });

  it("tidak ada pasangan KERTAS yang laporannya sudah tidak berkolom", () => {
    const berkolom = new Set<string>(BERKOLOM.map((r) => r.id));
    expect(
      Object.keys(KERTAS).filter((id) => !berkolom.has(id)),
      "Entri KERTAS berikut tidak lagi punya laporan berkolom-pilihan di katalog."
    ).toEqual([]);
  });

  for (const report of BERKOLOM) {
    const kertas = KERTAS[report.id];
    if (!kertas) continue;

    describe(report.id, () => {
      it("daftar kolomnya sama persis dengan urutan kolom kertasnya", () => {
        expect(
          report.columns!.map((c) => c.id),
          "Dialog pilih-kolom menawarkan daftar yang berbeda dari kolom yang " +
            "benar-benar bisa dicetak laporan ini. Centang yang tidak punya " +
            "kolom, atau kolom yang tidak punya centang — keduanya kendali yang " +
            "berbohong."
        ).toEqual([...kertas.kolom]);
      });

      for (const spec of report.columns!) {
        const jalur = `${report.id}.${spec.id}`;

        it(`${spec.id} — ${spec.labelKey}`, () => {
          const kamus = t(spec.labelKey);
          // Kunci yang hilang dikembalikan `translate` apa adanya; tanpa
          // pemeriksaan ini, kunci salah ketik akan "gagal" dengan pesan yang
          // menyalahkan konstanta kertasnya.
          expect(
            kamus,
            `kunci "${spec.labelKey}" tidak ada di id.json`
          ).not.toBe(spec.labelKey);

          const cetak = kertas.judul[spec.id];
          expect(cetak, `${jalur} tidak punya judul kertas`).toBeTruthy();

          const beda = BEDA[jalur];
          if (beda) {
            expect(
              kamus,
              `bunyi kamus "${spec.labelKey}" berubah. Kolom ini sudah berbeda ` +
                `antara layar/dialog dan berkas (${beda.sebab}); kalau bunyinya ` +
                "diganti, putuskan sekalian mana yang menang dan perbarui entrinya."
            ).toBe(beda.kamus);
            expect(
              cetak,
              `bunyi kertas ${jalur} berubah. Ia sengaja berbeda dari layar hari ` +
                `ini (${beda.sebab}) — dan mengubahnya berarti mengubah berkas ` +
                "yang sudah dikirim orang, jadi perubahannya harus diputuskan."
            ).toBe(beda.kertas);
            return;
          }

          const harusnya = KAMUS_IDR.has(jalur) ? `${kamus} (IDR)` : kamus;
          expect(
            cetak,
            `${jalur} berbunyi lain antara dialog pilih-kolom dan berkasnya. ` +
              `Dialog membaca "${spec.labelKey}" ("${kamus}"), kertas menulis ` +
              `"${cetak}". Kalau perbedaannya disengaja, ia bukan perapian: ` +
              "tulis sebabnya di BEDA (ketidakcocokan yang dipatok, bukan " +
              "diperbaiki diam-diam) atau di KAMUS_IDR bila kertas memang hanya " +
              "menambahkan satuannya."
          ).toBe(harusnya);
        });
      }
    });
  }

  /*
   * Penjaga bagi penjaganya, dua arah — pola yang sama dengan `BEDA_HARI_INI`
   * di #298. Tanpa ini, sebuah pengecualian yang sudah didamaikan akan duduk di
   * sini selamanya sambil tidak mengecualikan apa pun.
   */
  it("setiap entri KAMUS_IDR & BEDA masih menunjuk kolom yang ada", () => {
    const jalur = new Set(
      BERKOLOM.flatMap((r) => r.columns!.map((c) => `${r.id}.${c.id}`))
    );
    expect(
      [...KAMUS_IDR, ...Object.keys(BEDA)].filter((j) => !jalur.has(j)),
      "Pengecualian berikut menunjuk kolom yang sudah tidak ada di katalog."
    ).toEqual([]);
  });

  it("pengecualian yang tidak lagi mengecualikan harus dicabut", () => {
    const kembar: string[] = [];
    for (const [jalur, beda] of Object.entries(BEDA)) {
      if (beda.kamus === beda.kertas) kembar.push(jalur);
    }
    expect(
      kembar,
      "Kolom berikut kini berbunyi SAMA di dialog dan di berkasnya. " +
        "Pengecualiannya sudah tidak mengecualikan apa pun — cabut entrinya " +
        "supaya ia dijaga sebagai persamaan."
    ).toEqual([]);
  });
});

/**
 * Judul & penjelasan katalog — permukaan yang lebih sering dilihat daripada
 * dialognya.
 *
 * Keduanya SUDAH berbahasa pembacanya sebelum #316: kartu katalog membacanya
 * dari `reports.catalogReport.*`. Yang salah adalah cadangan bahasa Indonesia
 * di `report-catalog.ts` yang tak pernah menyala — 44 kalimat yang bisa
 * disunting orang tanpa satu piksel pun berubah. #316 mencabutnya dan mengikat
 * `ReportId`/`ReportCategory` ke kunci kamusnya, jadi entri yang HILANG kini
 * galat `tsc`.
 *
 * Arah sebaliknya tidak bisa dilihat `tsc`, dan `tests/i18n-orphan-keys.test.ts`
 * secara eksplisit menyebut `reports.catalogReport.*` sebagai cabang yang buta
 * baginya ("di sana hanya mata yang bisa menemukannya"). Dua tes di bawah
 * menutup lubang itu.
 */
describe("judul & penjelasan katalog terikat kamus (issue #316)", () => {
  it("tak ada entri reports.catalogReport yang tidak punya laporan", () => {
    const dipakai = new Set(REPORTS.map((r) => reportTextKey(r.id)));
    expect(
      Object.keys(id.reports.catalogReport).filter((k) => !dipakai.has(k as never)),
      "Entri kamus berikut menggambarkan laporan yang tidak ada di katalog — " +
        "tiga bahasa yang dirawat untuk kartu yang tidak pernah dirender."
    ).toEqual([]);
  });

  it("tak ada entri reports.catalogCategory yang tidak punya kategori", () => {
    const dipakai = new Set<string>(REPORT_CATEGORIES);
    expect(
      Object.keys(id.reports.catalogCategory).filter((k) => !dipakai.has(k)),
      "Entri kamus berikut menggambarkan kategori yang tidak ada di katalog."
    ).toEqual([]);
  });
});
