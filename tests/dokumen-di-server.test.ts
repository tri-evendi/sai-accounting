/**
 * PENJAGA §5 — dokumen dibuat di SERVER, dan klaim "byte identik" diukur
 * apa adanya.
 *
 * ══ KLAIM YANG DIUJI, DAN BATASNYA YANG DIUKUR ═════════════════════════════
 * §5 menjanjikan pemindahan ini "tidak menuntut Go" karena generatornya tetap
 * yang sama dan keluarannya **byte-identik**. Klaim itu benar, dan ia punya
 * batas yang harus ditulis supaya tidak dibaca lebih luas daripada yang
 * berlaku. DIUKUR di sesi ini, bukan dibaca dari dokumentasi:
 *
 *   • dua `output()` dari SATU instance jsPDF → identik;
 *   • dua INSTANCE atas muatan yang sama, jam dibekukan → berbeda 60 byte,
 *     semuanya di `/ID` pada trailer (pengenal berkas acak PDF);
 *   • jam berjalan → ditambah `/CreationDate`.
 *
 * Jadi "byte identik" adalah sifat SATU pembangkitan — bukan sifat yang bisa
 * diandalkan dari dua. Syarat audit §5 ("server menyimpan byte yang persis
 * sama dengan yang dikirim ke customer") karena itu dipenuhi dengan
 * MEMBANGKITKAN SEKALI dan memakai buffer itu untuk kedua tujuan, bukan dengan
 * membangkitkan ulang lalu membandingkan.
 *
 * Penjaga di bawah menegakkan tepat itu, dan membuktikan bahwa ISINYA memang
 * hanya punya satu implementasi.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { AKAR_REPO, tanpaKomentar } from "./akar-sumber";
import type { PdfCompany } from "@/lib/pdf/company-header";
import { REPORT_PDF } from "@/lib/report-pdf";
import { statementPayloadSchema } from "@/lib/validations/report-export";

const rute = readFileSync(join(AKAR_REPO, "src/app/api/reports/pdf/[jenis]/route.ts"), "utf8");
/* Keputusan per jenis hidup di REGISTRI, bukan di badan rute — lihat ⚠ di
   penjaga "memakai generator yang SAMA" di bawah. */
const registri = readFileSync(join(AKAR_REPO, "src/lib/report-pdf.ts"), "utf8");
const berkasLaporan = readFileSync(join(AKAR_REPO, "src/lib/report-files.ts"), "utf8");
const tombolPdf = readFileSync(
  join(AKAR_REPO, "src/components/shared/pdf-document-button.tsx"),
  "utf8"
);
const tombolEkspor = readFileSync(
  join(AKAR_REPO, "src/components/shared/pdf-export-buttons.tsx"),
  "utf8"
);

const muatan = {
  kind: "trial-balance" as const,
  period: "2026-01-01 s/d 2026-10-20",
  rows: [
    { code: "1100", name: "Kas", debit: 1_000_000, credit: 0 },
    { code: "3100", name: "Modal", debit: 0, credit: 1_000_000 },
  ],
  totalDebit: 1_000_000,
  totalCredit: 1_000_000,
  balanced: true,
};
/* Bentuknya `PdfCompany` dari `@/lib/pdf/company-header` — `name`, `address`,
   dan `logo` opsional. Ditulis `satisfies` supaya ia gugur di `tsc` ketika
   bentuknya berubah, bukan di tes yang tetap hijau atas objek yang salah. */
const perusahaan = {
  name: "PT Uji",
  address: "Jl. Uji No. 1",
  logo: null,
} satisfies PdfCompany;

/** Byte PDF dari satu pembangkitan. */
async function byte(): Promise<Uint8Array> {
  const { generateStatementPDF } = await import("@/lib/pdf/statement-pdf");
  return new Uint8Array(
    generateStatementPDF(muatan, perusahaan).output("arraybuffer") as ArrayBuffer
  );
}

/** Byte tanpa `/ID` dan `/CreationDate` — yaitu ISInya. */
function tanpaMetadata(b: Uint8Array): string {
  return Buffer.from(b)
    .toString("latin1")
    .replace(/\/ID\s*\[[^\]]*\]/g, "/ID []")
    .replace(/\/CreationDate\s*\([^)]*\)/g, "/CreationDate ()");
}

describe("generator PDF: determinismenya diukur, bukan diasumsikan", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("dua `output()` dari SATU instance identik", async () => {
    /* Inilah yang membuat pratinjau dan unduhan tidak bisa berbeda hari ini —
       dan sebabnya tombolnya kini memegang SATU Blob. */
    const { generateStatementPDF } = await import("@/lib/pdf/statement-pdf");
    const doc = generateStatementPDF(muatan, perusahaan);
    const a = Buffer.from(doc.output("arraybuffer") as ArrayBuffer);
    const b = Buffer.from(doc.output("arraybuffer") as ArrayBuffer);
    expect(a.equals(b)).toBe(true);
  });

  it("dua INSTANCE berbeda HANYA pada metadata", async () => {
    /*
     * Penjaga yang paling penting di berkas ini: ia membuktikan ISI laporan —
     * tata letak, teks, dan setiap angka — hanya punya SATU implementasi. Kalau
     * suatu hari ada jalur kedua yang menggambar laporan dengan cara sendiri,
     * yang jatuh di sini adalah perbandingan ini, bukan laporan di tangan
     * seorang akuntan.
     */
    const a = await byte();
    const b = await byte();
    expect(a.byteLength).toBe(b.byteLength);
    expect(tanpaMetadata(a)).toBe(tanpaMetadata(b));
  });

  it("dan perbedaannya memang ada — penjaga atas penjaga di atas", async () => {
    /* Kalau `tanpaMetadata` suatu hari menormalkan terlalu banyak, perbandingan
       di atas akan lulus untuk dua berkas yang sungguh berbeda. Baris ini
       memastikan normalisasinya memang MENORMALKAN sesuatu. */
    const a = await byte();
    const b = await byte();
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it("yang berbeda itu `/ID`, dan ia di trailer", async () => {
    const teks = Buffer.from(await byte()).toString("latin1");
    expect(teks).toMatch(/\/ID\s*\[\s*<[0-9A-F]{32}>/);
    expect(teks).toMatch(/\/CreationDate\s*\(D:\d{14}/);
  });
});

describe("rute server: satu pembangkitan, satu buffer", () => {
  it("`output(\"arraybuffer\")` dipanggil TEPAT sekali", () => {
    /* Syarat audit §5 dipenuhi dengan satu buffer untuk kedua tujuan — bukan
       dua pembangkitan yang kebetulan sama. Dua panggilan di rute ini berarti
       yang dikirim dan yang (nanti) disimpan berbeda pada `/ID`. */
    expect(tanpaKomentar(rute).match(/output\("arraybuffer"\)/g) ?? []).toHaveLength(1);
  });

  it("memakai generator yang SAMA, bukan tata letak kedua", () => {
    /*
     * ⚠ Keempat penjaga di bawah ini DIARAHKAN ULANG ketika rute laporan
     * menjadi `[jenis]`: yang mereka jaga pindah dari badan rute ke
     * `REPORT_PDF`, dan versi lamanya menuding teks rute — nama, bukan sifat.
     * Penjaga yang terikat pada nama adalah penjaga yang jatuh pada refactor
     * yang benar dan diam pada perubahan yang salah.
     */
    expect(registri).toContain('await import("@/lib/pdf/statement-pdf")');
    expect(registri).toContain("generateStatementPDF(muatan, company)");
    /* Dan hanya SATU tempat memuatnya — jalur kedua yang menggambar laporan
       dengan caranya sendiri adalah tata letak kedua. */
    expect(registri.match(/@\/lib\/pdf\/statement-pdf/g) ?? []).toHaveLength(1);
  });

  it("identitas & logo dirakit DI SERVER, bukan diterima dari peramban", () => {
    /* Nama dan logo perusahaan di kertas tidak boleh ditentukan oleh apa yang
       dikirim peramban — peramban bukan sumber kebenaran tentang PT mana ini. */
    expect(rute).toContain("serverPdfCompany(");
    expect(tanpaKomentar(rute)).not.toMatch(/payload\.company|body\.company/);
  });

  it("batasnya SAMA dengan ekspor Excel, dan dihitung pada pemeta yang sama", () => {
    /* Dua penghitung untuk satu laporan berarti ada ukuran muatan yang ditolak
       satu tombol dan diterima tombol di sebelahnya. */
    expect(rute).toContain("readBoundedText(request, EXPORT_MAX_BODY_BYTES)");
    expect(registri).toContain("buildReportSheet(muatan).rows.length");
    expect(tanpaKomentar(rute)).toMatch(/baris > EXPORT_MAX_ROWS/);
    expect(tanpaKomentar(rute).match(/status: 413/g) ?? []).toHaveLength(2);
  });

  it("muatannya divalidasi skema yang SAMA dengan ekspor Excel", () => {
    /* Satu skema untuk dua tombol: muatan yang diterima Excel dan ditolak PDF
       (atau sebaliknya) adalah dua definisi "laporan yang sah". */
    expect(REPORT_PDF.statement.schema).toBe(statementPayloadSchema);
    expect(tanpaKomentar(rute)).toContain("spec.schema.safeParse(body)");
  });

  it("menuntut izin, dan izinnya sama dengan ekspor", () => {
    expect(REPORT_PDF.statement.permission).toBe("report.export");
    /* Rute tidak menulis satu pun literal izin — ia mengambilnya dari entrinya. */
    expect(tanpaKomentar(rute)).toContain("requireApiPermission(spec.permission)");
  });

  it("jawabannya tidak boleh di-cache proxy bersama", () => {
    expect(rute).toContain('"Cache-Control": "private, no-store"');
    expect(rute).toContain('"X-Content-Type-Options": "nosniff"');
  });
});

describe("peramban berhenti menghasilkan laporan", () => {
  it("`report-files.ts` tidak lagi memuat generator PDF", () => {
    /* §5: "Peramban tidak menghasilkan apa pun; tombolnya menjadi pemicu
       unduh." Impor ini menyeret `statement-pdf` (1.097 baris) BESERTA jsPDF
       ke dalam bundle setiap halaman yang memuat modul ini. */
    const kode = tanpaKomentar(berkasLaporan);
    expect(kode).not.toContain('import("@/lib/pdf/statement-pdf")');
    expect(kode).not.toMatch(/generateStatementPDF/);
    expect(berkasLaporan).toContain("apiFetch(`/api/reports/pdf/${jenis}`");
  });

  it("tombol laporan mengambil Blob dari server", () => {
    expect(tombolEkspor).toContain("fetchStatementPdfBlob(payload)");
    expect(tanpaKomentar(tombolEkspor)).not.toContain('import("@/lib/pdf/statement-pdf")');
  });

  it("tombol pratinjau TIDAK lagi bergantung pada jsPDF", () => {
    /* Kontrak `() => Promise<jsPDF>` memaku satu hal yang bukan urusan tombol
       ini: bahwa PDF-nya dibuat di peramban. */
    expect(tanpaKomentar(tombolPdf)).not.toMatch(/from "jspdf"/);
    expect(tombolPdf).toContain("generate: () => Promise<Blob>");
  });

  it("unduhan dibuat dari Blob yang SAMA dengan yang dilihat", () => {
    /* Untuk dokumen dari server, permintaan kedua menghasilkan `/ID` PDF yang
       berbeda — yang dilihat pengguna dan yang ia simpan bukan berkas yang
       sama byte-nya. */
    expect(tanpaKomentar(tombolPdf)).not.toMatch(/\.save\(/);
    expect(tombolPdf).toMatch(/URL\.createObjectURL\(blob\)/);
  });

  it("URL objeknya dilepas, di kedua jalurnya", () => {
    /* URL objek yang tidak dilepas menahan seluruh Blob di memori tab selama
       tab itu hidup — dan laporan tahunan bukan Blob kecil. */
    expect(tanpaKomentar(tombolPdf).match(/revokeObjectURL/g) ?? []).toHaveLength(2);
  });

  it("tarian unduh ditulis SATU kali di `report-files.ts`", () => {
    /* Tiga pemanggil melakukannya persis sama; menyalinnya berarti tiga
       salinan yang akan berbeda pada perbaikan berikutnya. */
    expect(berkasLaporan).toContain("export async function simpanBlob(");
    expect(
      tanpaKomentar(berkasLaporan).match(/document\.createElement\("a"\)/g) ?? []
    ).toHaveLength(1);
  });
});

describe("yang BELUM pindah, dan itu disebut bukan disembunyikan", () => {
  it("generator lain masih di peramban — dan jumlahnya dicacah", () => {
    /*
     * §5 memindahkan dokumen ke server satu per satu, dan laporan keuangan
     * yang pertama karena muatannya SUDAH bolak-balik ke server untuk tombol
     * Excel di sebelahnya — jadi ongkos pindahnya nol.
     *
     * Penjaga ini bukan larangan, ia PENCACAH: ia akan merah ketika satu
     * generator lagi pindah, dan angka di sini harus turun bersamanya. Itu
     * cara yang paling murah untuk membuat "masih ada enam" tidak berubah
     * menjadi "sudah semuanya" di dalam ingatan seseorang.
     */
    const klien = readdirSync(join(AKAR_REPO, "src/components/shared"))
      .concat(["(lihat daftar di bawah)"])
      .length;
    expect(klien).toBeGreaterThan(0);

    const semua = [
      "src/components/shared/pdf-export-buttons.tsx",
      "src/components/dashboard/dashboard-export-actions.tsx",
      "src/app/(app)/(dashboard)/t/[tenantSlug]/[companySlug]/delivery-orders/[id]/pdf-button.tsx",
      "src/app/(app)/(dashboard)/t/[tenantSlug]/[companySlug]/returns/pdf-button.tsx",
    ]
      .map((p) => readFileSync(join(AKAR_REPO, p), "utf8"))
      .join("\n");
    const dinamis = [...tanpaKomentar(semua).matchAll(/import\("@\/lib\/pdf\/([a-z-]+)"\)/g)].map(
      (m) => m[1]!
    );
    const unik = [...new Set(dinamis)].sort();

    /* ⚠ Daftar ini MENYUSUT, dan commit yang membuatnya menyusut memang harus
       menyentuh baris ini — itu seluruh gunanya. `invoice-pdf` keluar ketika
       dokumen satuan pindah ke server (`tests/dokumen-satuan-server.test.ts`). */
    /*
     * NOL — dan ini akhir pencacahnya. §5 untuk peramban tertutup: dokumen
     * satuan lewat rute dokumen (dari ID, dari BUKU), laporan lewat
     * `/api/reports/pdf/<jenis>` (dari muatan), ekspor besar lewat antrean.
     *
     * Ambang nol tidak bisa menyusut diam-diam, jadi penjaga ini berhenti
     * menjadi pencacah dan menjadi LARANGAN. Pagar keduanya — yang menyasar
     * `.output(` alih-alih nama berkasnya — ada di
     * `tests/laporan-pdf-server.test.ts`.
     */
    expect(unik, "generator yang masih digambar peramban").toEqual([]);
  });

  it("satu-satunya jalur server lain tetap faktur yang dikirim (#465)", () => {
    /* Ia yang membuktikan jsPDF berjalan di Node sejak sebelum §5 ditulis —
       dan karena itu §5 tidak menuntut Go. */
    const kirim = readFileSync(join(AKAR_REPO, "src/lib/invoice-send.ts"), "utf8");
    expect(kirim).toContain('import("@/lib/pdf/invoice-pdf")');
    expect(kirim).toContain("server-only");
  });
});
