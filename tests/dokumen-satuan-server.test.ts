/**
 * PENJAGA dokumen satuan di server (rancangan §5, tahap 1c).
 *
 * ══ SATU ATURAN YANG MENGIKAT SELURUH BERKAS INI ═══════════════════════════
 * Faktur adalah dokumen yang DIKIRIM ke pelanggan dan DISIMPAN sebagai bukti.
 * Merendernya dari muatan yang dikirim peramban berarti angka di atas kertas
 * ditentukan oleh apa yang dikirim klien — dan sejak §5 memindahkan
 * pembuatannya ke server, server itulah yang tampak menjaminnya.
 *
 * Syarat audit §5 ("server menyimpan byte yang persis sama dengan yang dikirim
 * ke customer") hanya berarti sesuatu bila kertasnya diturunkan dari BUKU.
 * Penjaga pertama di bawah itulah yang menahannya.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { AKAR_REPO, tanpaKomentar } from "./akar-sumber";
import { DOCUMENT_PDF, DOCUMENT_PDF_KINDS, isDocumentPdfKind } from "@/lib/document-pdf";
import { documentPdfHref } from "@sai/core/tenant-routes";
import { PERMISSIONS } from "@sai/core/authz";

const RUTE = join(
  AKAR_REPO,
  "src/app/api/t/[tenantSlug]/[companySlug]/documents/pdf/[jenis]/[id]/route.ts"
);
const rute = readFileSync(RUTE, "utf8");
const tombol = readFileSync(join(AKAR_REPO, "src/components/shared/pdf-export-buttons.tsx"), "utf8");
const kirim = readFileSync(join(AKAR_REPO, "src/lib/invoice-send.ts"), "utf8");

describe("kertasnya diturunkan dari BUKU, bukan dari muatan peramban", () => {
  it("rutenya menerima ID, dan tidak punya badan permintaan sama sekali", () => {
    /* `GET` tanpa badan: tidak ada muatan yang bisa diteruskan, jadi jalur
       "render apa yang dikirim klien" tidak ada untuk ditutup. */
    expect(rute).toMatch(/export async function GET\(/);
    expect(tanpaKomentar(rute)).not.toMatch(/request\.json\(\)|readBoundedText|POST/);
  });

  it("tombol faktur mengirim ID, bukan muatan", () => {
    expect(tombol).toContain('fetchDocumentPdfBlob("invoice", invoiceId)');
    expect(tanpaKomentar(tombol)).not.toContain('import("@/lib/pdf/invoice-pdf")');
  });

  it("bentuk muatan faktur sisi klien DICABUT, bukan dibiarkan", () => {
    /* Tipe yang tinggal sebagai "bentuk yang dikirim peramban" adalah tipe
       yang mengundang jalur kedua dibangun lagi di atasnya. */
    expect(tanpaKomentar(tombol)).not.toMatch(/interface InvoicePDFData/);
  });

  it("cetak dan lampiran surel adalah SATU fungsi, bukan dua jalur", () => {
    /*
     * Bukan "keduanya memakai generator yang sama" — itu jaminan yang lebih
     * lemah, dan ia putus pada hari seseorang menambah satu langkah di salah
     * satunya. `invoicePdfById` memanggil `renderInvoicePdf` yang sama yang
     * dipakai `sendInvoiceByEmail`.
     */
    expect(kirim).toContain("export async function invoicePdfById(");
    const i = kirim.indexOf("export async function invoicePdfById(");
    const badan = kirim.slice(i, kirim.indexOf("\n}", i));
    expect(badan).toContain("renderInvoicePdf(invoice)");
    expect(badan).toContain("prisma.invoice.findUnique");
  });

  it("perakitan identitas & logo TIDAK diduplikasi", () => {
    /* Dua perakitan untuk satu benda akan menyimpang: yang satu memuat logo,
       yang lain lupa, dan gejalanya kertas yang berbeda untuk satu PT. */
    expect(kirim).toContain('serverPdfCompany("invoice-send")');
    expect(tanpaKomentar(kirim)).not.toContain("readCompanyLogo(");
  });
});

describe("peta jenis: LENGKAP, dan yang belum pindah tertulis", () => {
  it("setiap jenis punya entri", () => {
    const diPeta = Object.keys(DOCUMENT_PDF).sort();
    expect(diPeta).toEqual([...DOCUMENT_PDF_KINDS].sort());
  });

  it("setiap izin yang disebut benar-benar ada di matriks", () => {
    /* Izin yang salah tulis akan ditolak untuk SEMUA orang — tombol cetak yang
       tidak pernah bekerja, dan pesannya menyalahkan peran pengguna. */
    for (const [jenis, spec] of Object.entries(DOCUMENT_PDF)) {
      expect(PERMISSIONS, `${jenis} → ${spec.permission}`).toContain(spec.permission);
    }
  });

  it("izinnya BERBEDA per jenis, bukan satu izin untuk semua cetakan", () => {
    /* Satu izin tunggal akan membuat siapa pun yang boleh mencetak surat jalan
       juga boleh mencetak faktur — dan keduanya kertas yang berbeda nilainya. */
    const unik = new Set(Object.values(DOCUMENT_PDF).map((s) => s.permission));
    expect(unik.size).toBeGreaterThan(1);
    expect(DOCUMENT_PDF.invoice.permission).toBe("invoice.read");
    expect(DOCUMENT_PDF.contract.permission).toBe("contract.read");
  });

  it("jenis TANPA pemuat punya CATATAN yang menyebut apa yang dibutuhkannya", () => {
    /*
     * Lima entri `null` adalah DAFTAR PEKERJAAN yang terbaca, bukan lubang:
     * rutenya menjawab 404 dan tombolnya tetap menggambar di peramban. Yang
     * membuat daftar itu berguna adalah catatannya — tanpanya, `null` tidak
     * bisa dibedakan dari entri yang lupa diisi.
     */
    for (const [jenis, spec] of Object.entries(DOCUMENT_PDF)) {
      if (spec.muat !== null) continue;
      expect(spec.catatan, `${jenis} tanpa catatan`).toBeTruthy();
      expect(spec.catatan!.length, `${jenis}: catatan terlalu pendek`).toBeGreaterThan(20);
    }
  });

  it("tiga LAPORAN ditandai bukan dokumen satuan", () => {
    /* §5 menaruh laporan di jalur berbeda. Keputusan "bukan di sini" tertulis
       supaya tidak ditemukan lagi oleh orang berikutnya yang mencari di mana
       lembar opname seharusnya dibuat. */
    for (const jenis of ["opname-sheet", "finance-report", "stock-report"] as const) {
      expect(DOCUMENT_PDF[jenis].muat).toBeNull();
      expect(DOCUMENT_PDF[jenis].catatan).toMatch(/BUKAN dokumen satuan|laporan/);
    }
  });

  it("faktur SUDAH punya pemuatnya", () => {
    expect(DOCUMENT_PDF.invoice.muat).not.toBeNull();
  });

  it("penjaga tipe menolak jenis asing", () => {
    expect(isDocumentPdfKind("invoice")).toBe(true);
    expect(isDocumentPdfKind("faktur")).toBe(false);
    expect(isDocumentPdfKind("")).toBe(false);
  });
});

describe("rute: urutan pemeriksaan & bentuk jawaban", () => {
  it("gerbang izin berjalan SEBELUM barisnya dimuat", () => {
    const gerbang = rute.indexOf("await requireApiPermission(spec.permission, params)");
    const muat = rute.indexOf("await spec.muat(id)");
    expect(gerbang).toBeGreaterThan(-1);
    expect(muat).toBeGreaterThan(-1);
    expect(gerbang).toBeLessThan(muat);
  });

  it("izinnya DITURUNKAN dari jenis, bukan dipaku satu nilai", () => {
    expect(rute).toContain("DOCUMENT_PDF[jenis]");
    expect(rute).toMatch(/requireApiPermission\(spec\.permission, params\)/);
  });

  it("jenis tanpa pemuat dijawab 404 SEBELUM gerbang", () => {
    /* Bagi pemanggil, "belum ada pemuatnya" dan "tidak ada" sama saja — tidak
       ada kertas di alamat ini. Dan memeriksanya lebih dulu berarti jenis yang
       belum pindah tidak pernah menyentuh basis data. */
    const nol = rute.indexOf("spec.muat === null");
    const gerbang = rute.indexOf("await requireApiPermission(");
    expect(nol).toBeGreaterThan(-1);
    expect(nol).toBeLessThan(gerbang);
  });

  it("perusahaan datang dari JALUR, dan rutenya bertenant", () => {
    /* Alamat ini mendarat di `<iframe src>` dan `<a href download>` — keduanya
       tidak membawa header lingkup (#489). */
    expect(RUTE).toContain("[tenantSlug]/[companySlug]");
    expect(rute).toContain("TenantScopedParams");
  });

  it("kepemilikan dibuktikan BASIS DATANYA, bukan perbandingan tangan", () => {
    /* `prisma` di dalam pemuatnya adalah klien PT AKTIF, jadi id milik PT lain
       tidak menemukan apa pun. Perbandingan yang ditulis tangan adalah
       perbandingan yang bisa lupa ditulis. */
    expect(tanpaKomentar(rute)).not.toMatch(/companyId !==|authz\.companyId/);
    expect(rute).toMatch(/PT AKTIF|klien PT/);
  });

  it("404 untuk apa pun yang tidak ada — bukan 403, bukan 501", () => {
    expect(rute.match(/status: 404/g) ?? []).toHaveLength(1);
    expect(tanpaKomentar(rute)).not.toMatch(/status: (403|501)/);
  });

  it("jawabannya tidak boleh di-cache proxy bersama", () => {
    expect(rute).toContain('"Cache-Control": "private, no-store"');
    expect(rute).toContain('"X-Content-Type-Options": "nosniff"');
  });

  it("id divalidasi bentuknya sebelum dipakai", () => {
    expect(rute).toMatch(/\^\\d\+\$/);
    expect(rute).toContain("Number.isSafeInteger(id)");
  });
});

describe("alamat cetak: satu tempat rumusnya ditulis", () => {
  it("membawa tenant, perusahaan, jenis, dan id", () => {
    expect(documentPdfHref("pt-abc", "buku-utama", "invoice", 42)).toBe(
      "/api/t/pt-abc/buku-utama/documents/pdf/invoice/42"
    );
  });

  it("rutenya ADA di tempat yang ditunjuk rumusnya", () => {
    /* Rumus dan berkas rutenya bisa menyimpang tanpa satu galat pun — dan
       gejalanya 404 di tombol cetak, yang terbaca seperti dokumen yang hilang. */
    expect(existsSync(RUTE)).toBe(true);
  });

  it("klien memakai rumusnya, bukan merangkai alamat sendiri", () => {
    const berkas = readFileSync(join(AKAR_REPO, "src/lib/report-files.ts"), "utf8");
    expect(berkas).toContain("documentPdfHref(");
    expect(berkas).toMatch(/bukan jalur bertenant/);
  });
});

describe("yang BELUM pindah, dicacah bukan disembunyikan", () => {
  it("lima generator dokumen masih digambar peramban", () => {
    /*
     * Pencacah, bukan larangan: ia merah ketika satu generator lagi pindah,
     * dan daftar di sini harus menyusut bersamanya. `invoice-pdf` TIDAK boleh
     * ada lagi — itu yang dipindahkan commit ini.
     */
    const klien = [
      "src/components/shared/pdf-export-buttons.tsx",
      "src/components/dashboard/dashboard-export-actions.tsx",
      "src/app/(app)/(dashboard)/t/[tenantSlug]/[companySlug]/delivery-orders/[id]/pdf-button.tsx",
      "src/app/(app)/(dashboard)/t/[tenantSlug]/[companySlug]/returns/pdf-button.tsx",
    ]
      .map((p) => readFileSync(join(AKAR_REPO, p), "utf8"))
      .join("\n");
    const dinamis = [
      ...tanpaKomentar(klien).matchAll(/import\("@\/lib\/pdf\/([a-z-]+)"\)/g),
    ].map((m) => m[1]!);
    const unik = [...new Set(dinamis)].sort();

    expect(unik, "generator yang masih digambar peramban").toEqual([
      "contract-pdf",
      "finance-report-pdf",
      "opname-sheet-pdf",
      "return-pdf",
      "shipping-pdf",
      "stock-report-pdf",
    ]);
    expect(unik).not.toContain("invoice-pdf");
    expect(unik).not.toContain("statement-pdf");
  });
});
