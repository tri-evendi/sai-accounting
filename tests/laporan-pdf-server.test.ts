/**
 * PENJAGA laporan PDF di server (rancangan §5, tahap 1c) — dan ini yang menutup
 * §5 untuk peramban: **nol** generator `src/lib/pdf/` tersisa di sana, dan
 * sejak tiga laporan terakhir (stok, opname, kas) memakai pembangun muatan di
 * server, peramban juga tidak lagi MERAKIT muatannya.
 *
 * ══ DUA ATURAN YANG DIJAGA DI DUA BERKAS ═══════════════════════════════════
 *   • `tests/dokumen-satuan-server.test.ts` menjaga bahwa DOKUMEN diturunkan
 *     dari BUKU, dari ID-nya. Ia diserahkan ke pihak luar dan disimpan sebagai
 *     bukti;
 *   • berkas INI menjaga sifat rute LAPORAN: izin per jenis, urutan
 *     pemeriksaan, satu pembangkitan, dan penyerahan ke antrean menurut
 *     ukuran. Tiga laporannya kini berbadan PARAMETER — muatannya dihitung
 *     server dari buku PT dengan pembaca yang sama dengan halamannya
 *     (`src/lib/report-pdf-payload.ts`); hanya `statement` yang masih
 *     mengirim muatan jadi.
 *
 * Perilakunya di bawah route handler sungguhan — isi kertas = isi dari muatan
 * rakitan peramban lama, antrean, otorisasi — di
 * `tests/laporan-pdf-parameter.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AKAR_REPO, berkasSumber, tanpaKomentar } from "./akar-sumber";
import { REPORT_PDF, isReportPdfKind } from "@/lib/report-pdf";
import { REPORT_PDF_KINDS } from "@/lib/report-pdf-kinds";
import { PERMISSIONS } from "@sai/core/authz";

const RUTE = join(AKAR_REPO, "src/app/api/reports/pdf/[jenis]/route.ts");
const rute = readFileSync(RUTE, "utf8");
const ruteTanpaKomentar = tanpaKomentar(rute);
const registri = readFileSync(join(AKAR_REPO, "src/lib/report-pdf.ts"), "utf8");

describe("peramban tidak menggambar PDF apa pun lagi", () => {
  it("NOL generator `src/lib/pdf/` diimpor dari komponen klien", () => {
    /*
     * Pencacah tahap 1c berakhir di sini: enam dokumen satuan lebih dulu, lalu
     * tiga laporan ini. Yang dijaga penjaga ini BUKAN jumlahnya lagi melainkan
     * NOL — dan nol adalah ambang yang tidak bisa menyusut diam-diam.
     *
     * Impornya dicari di SELURUH akar sumber, bukan di `src/` saja: begitu satu
     * komponen pindah ke `packages/*`, pemindai yang menyapu `src/` lulus
     * dengan nol pelanggar karena tak ada yang tersisa untuk dipindai —
     * kegagalan diam yang sudah terjadi sekali di Fase 2.
     */
    const pelanggar = berkasSumber([".tsx"])
      .filter(({ isi }) => isi.startsWith('"use client"'))
      /* Impor TIPE tidak menggambar apa pun — ia hilang saat kompilasi. */
      .filter(({ isi }) =>
        tanpaKomentar(isi)
          .split("\n")
          .some((baris) => /@\/lib\/pdf\//.test(baris) && !/^\s*import type /.test(baris))
      )
      .map(({ rel }) => rel);
    expect(pelanggar, "komponen klien yang masih memuat generator PDF").toEqual([]);
  });

  it("tak ada komponen klien yang memanggil `.output(`", () => {
    /* Pagar kedua dengan sasaran lain: impornya boleh berpindah bentuk (alias,
       re-export, barrel), tapi menggambar selalu berakhir di `output()`. */
    const pelanggar = berkasSumber([".tsx"])
      .filter(({ isi }) => isi.startsWith('"use client"'))
      .filter(({ isi }) => /\.output\(/.test(tanpaKomentar(isi)))
      .map(({ rel }) => rel);
    expect(pelanggar, "komponen klien yang masih memanggil output()").toEqual([]);
  });
});

describe("registri: empat keputusan per jenis, tak satu pun boleh lupa", () => {
  it("`REPORT_PDF` LENGKAP atas kosakata jenisnya", () => {
    expect(Object.keys(REPORT_PDF).sort()).toEqual([...REPORT_PDF_KINDS].sort());
  });

  it("setiap entri memutuskan keempatnya", () => {
    for (const jenis of REPORT_PDF_KINDS) {
      const spec = REPORT_PDF[jenis];
      expect(PERMISSIONS, `${jenis}: izinnya ada di matriks`).toContain(spec.permission);
      expect(typeof spec.schema.safeParse, `${jenis}: bentuknya`).toBe("function");
      expect(["parameter", "muatan"], `${jenis}: asal muatannya`).toContain(spec.sumber);
      expect(typeof spec.muatan, `${jenis}: pembangun muatannya`).toBe("function");
      expect(typeof spec.barisnya, `${jenis}: penghitung barisnya`).toBe("function");
      expect(typeof spec.slug, `${jenis}: nama berkasnya`).toBe("function");
    }
  });

  it("izinnya BUKAN satu izin untuk semua", () => {
    /*
     * Lembar stok bukan laporan kas. Satu izin untuk keempatnya berarti orang
     * yang boleh mencetak yang satu boleh mencetak semuanya — pintu kedua ke
     * data yang penjaga halamannya justru menutupnya.
     */
    const izin = new Set(REPORT_PDF_KINDS.map((j) => REPORT_PDF[j].permission));
    expect(izin.size).toBeGreaterThan(1);
  });

  it("lembar opname menuntut `inventory.write`, bukan `.read` (#129)", () => {
    /*
     * Ia dicetak untuk DIISI lalu diketik balik sebagai penyesuaian stok, dan
     * halaman opname-nya memang menuntut `inventory.write`. Menurunkannya ke
     * `.read` memberi orang yang hanya boleh MELIHAT stok sebuah formulir resmi
     * berkop perusahaan untuk pekerjaan yang tidak boleh ia lakukan.
     */
    expect(REPORT_PDF.opname.permission).toBe("inventory.write");
    expect(REPORT_PDF.stock.permission).toBe("inventory.read");
  });

  it("izinnya sama dengan izin HALAMAN yang menampilkannya", () => {
    /* Laporan yang bisa dicetak oleh orang yang tidak boleh membuka halamannya
       adalah pintu kedua ke data yang sama. */
    const halaman: Record<string, string> = {
      stock: "src/app/(app)/(dashboard)/t/[tenantSlug]/[companySlug]/inventory/page.tsx",
      opname: "src/app/(app)/(dashboard)/t/[tenantSlug]/[companySlug]/inventory/opname/page.tsx",
      finance: "src/app/(app)/(dashboard)/t/[tenantSlug]/[companySlug]/finance/page.tsx",
    };
    for (const [jenis, jalur] of Object.entries(halaman)) {
      const isi = readFileSync(join(AKAR_REPO, jalur), "utf8");
      const izin = isi.match(/requirePagePermission\(\s*"([a-z.]+)"/)?.[1];
      expect(izin, `${jenis}: izin halamannya terbaca`).toBeTruthy();
      expect(REPORT_PDF[jenis as "stock"].permission, `${jenis}`).toBe(izin);
    }
  });

  it("tidak ada pemanggil `/api/reports/pdf` tanpa jenis — rute itu tidak ada", () => {
    /* Terjadi: `downloadStatementPdf` tetap POST ke `/api/reports/pdf` sesudah
       rutenya pindah ke `[jenis]`, dan PDF laporan keuangan dijawab 404 dari
       20 sampai 24 Okt 2026 tanpa satu tes pun merah. */
    const sumber = tanpaKomentar(readFileSync(join(AKAR_REPO, "src/lib/report-files.ts"), "utf8"));
    expect(sumber).not.toMatch(/["'`]\/api\/reports\/pdf["'`]/);
  });

  it("`statement` memakai penghitung baris EKSPOR EXCEL, bukan penghitungnya sendiri", () => {
    /*
     * Dua penghitung untuk satu laporan berarti ada ukuran muatan yang ditolak
     * satu tombol dan diterima tombol di sebelahnya — dan pengguna yang
     * menemukannya tidak punya cara menduga mana yang benar.
     */
    expect(tanpaKomentar(registri)).toContain("buildReportSheet(muatan).rows.length");
  });

  it("laporan kas menghitung KEDUA bagiannya", () => {
    /* Saldo dan transaksi digambar di lembar yang sama; menghitung satu saja
       membuat ambang 413 melewatkan separuh lembarnya. */
    expect(REPORT_PDF.finance.barisnya({ balances: [1, 2], transactions: [1, 2, 3] })).toBe(5);
  });

  it("kosakata jenisnya SATU daftar, dibaca kedua sisi", () => {
    /* Registrinya `server-only`; tombol di peramban hanya butuh namanya. Dua
       daftar menyimpang tanpa galat — jenis yang diminta klien lalu dijawab 404
       oleh rute yang tidak pernah mengenalnya. */
    expect(registri).toContain('from "@/lib/report-pdf-kinds"');
    expect(tanpaKomentar(registri)).not.toMatch(/REPORT_PDF_KINDS = \[/);
    expect(isReportPdfKind("statement")).toBe(true);
    expect(isReportPdfKind("bukan-jenis")).toBe(false);
  });
});

describe("rute: urutan pemeriksaan adalah penjaganya", () => {
  it("JENIS diperiksa sebelum IZIN", () => {
    /*
     * Izin yang dituntut ditentukan jenisnya, jadi tidak ada izin yang bisa
     * diperiksa sebelum jenisnya diketahui. Urutan terbalik membuat penanya
     * ANONIM menerima jawaban yang berbeda untuk jenis yang ada dan yang tidak.
     */
    const jenis = ruteTanpaKomentar.indexOf("isReportPdfKind(jenis)");
    const izin = ruteTanpaKomentar.indexOf("requireApiPermission(");
    expect(jenis).toBeGreaterThan(-1);
    expect(izin).toBeGreaterThan(jenis);
  });

  it("jenis asing dijawab 404 BERTUBUH KOSONG", () => {
    /*
     * Tak ada manusia yang pernah melihat jawaban ini — tombolnya hanya pernah
     * mengirim jenis dari `REPORT_PDF_KINDS`. Kalimat di sini akan jadi kalimat
     * yang wajib diterjemahkan ke tiga bahasa dan tidak pernah dibaca satu
     * pun; `tests/i18n-api-errors.test.ts` menolaknya, dan penjaga ini
     * mengunci bentuk yang benar supaya ia tidak kembali sebagai `{ error:
     * "..." }` pada suntingan berikutnya.
     */
    expect(ruteTanpaKomentar).toContain("new Response(null, { status: 404 })");
    expect(ruteTanpaKomentar).not.toMatch(/status: 404[\s\S]{0,40}error/);
  });

  it("IZIN diperiksa sebelum badan dibaca", () => {
    /* Badan sampai 16 MB. Membacanya sebelum izin berarti siapa pun yang tahu
       URL-nya bisa membuat server menyerap 16 MB per permintaan. */
    const izin = ruteTanpaKomentar.indexOf("requireApiPermission(");
    const badan = ruteTanpaKomentar.indexOf("readBoundedText(");
    expect(badan).toBeGreaterThan(izin);
  });

  it("BENTUK divalidasi sebelum buku dibaca, buku sebelum barisnya dihitung, semuanya sebelum digambar", () => {
    /* `spec.muatan(` MEMBACA buku PT untuk tiga jenis berbadan parameter —
       badan yang tak lolos bentuk tidak boleh membuat satu kueri pun berjalan. */
    const izin = ruteTanpaKomentar.indexOf("requireApiPermission(");
    const bentuk = ruteTanpaKomentar.indexOf("safeParse(");
    const muatan = ruteTanpaKomentar.indexOf("spec.muatan(");
    const baris = ruteTanpaKomentar.indexOf("spec.barisnya(");
    const gambar = ruteTanpaKomentar.indexOf("spec.gambar(");
    expect(bentuk).toBeGreaterThan(izin);
    expect(muatan).toBeGreaterThan(bentuk);
    expect(baris).toBeGreaterThan(muatan);
    expect(gambar).toBeGreaterThan(baris);
  });

  it("izinnya DARI registri, bukan ditulis di rute", () => {
    /*
     * Satu izin yang ditulis tangan di rute adalah izin yang tidak berubah
     * ketika registrinya berubah. Rute ini karena itu tidak boleh memuat satu
     * pun literal izin, dan tidak boleh ber-`switch` atas jenis.
     */
    expect(ruteTanpaKomentar).toContain("requireApiPermission(spec.permission)");
    expect(ruteTanpaKomentar).not.toMatch(/requireApiPermission\(\s*"/);
    expect(ruteTanpaKomentar).not.toMatch(/switch\s*\(\s*jenis/);
  });

  it("batas BADAN dan batas BARIS keduanya 413", () => {
    /* Dua batas, dua sebab: byte sebelum diurai (memori), baris sesudah
       divalidasi (CPU menggambar). Yang satu tidak menggantikan yang lain. */
    expect(ruteTanpaKomentar).toContain("EXPORT_MAX_BODY_BYTES");
    expect(ruteTanpaKomentar).toContain("EXPORT_MAX_ROWS");
    expect(ruteTanpaKomentar.match(/status: 413/g) ?? []).toHaveLength(2);
  });

  it("byte-nya dibangkitkan SEKALI", () => {
    /* Syarat audit §5: yang disimpan sama dengan yang dikirim. Dua instance
       jsPDF atas muatan yang sama berbeda pada `/ID` di trailer — diukur, 60
       byte — jadi satu buffer untuk kedua tujuan. */
    expect(ruteTanpaKomentar.match(/output\("arraybuffer"\)/g) ?? []).toHaveLength(1);
  });

  it("identitas perusahaan dari SERVER, tidak pernah dari muatan", () => {
    /* Peramban bukan sumber kebenaran tentang PT mana ini: nama dan logo di
       kop surat ditentukan basis data PT yang sedang dibuka. */
    expect(ruteTanpaKomentar).toContain("serverPdfCompany(");
    expect(ruteTanpaKomentar).not.toMatch(/muatan\.company|payload\.company/);
  });

  it("jawabannya TIDAK pernah redirect, dan tidak bisa di-cache", () => {
    /* Isinya buku besar. Satu `Cache-Control` yang lalai membuat proxy bersama
       menyimpan laporan satu PT lalu menyajikannya ke PT lain. */
    expect(ruteTanpaKomentar).toContain('"Cache-Control": "private, no-store"');
    expect(ruteTanpaKomentar).not.toMatch(/NextResponse\.redirect/);
  });
});

describe("klien: satu pengambil, satu permintaan", () => {
  const files = readFileSync(join(AKAR_REPO, "src/lib/report-files.ts"), "utf8");

  it("jalurnya dibangun dari `jenis`, bukan ditulis empat kali", () => {
    expect(files).toContain("`/api/reports/pdf/${jenis}`");
  });

  it("Blob yang dipratinjau SAMA dengan yang diunduh", () => {
    /*
     * Permintaan kedua menghasilkan `/ID` PDF yang berbeda, sehingga yang
     * dilihat pengguna dan yang ia simpan bukan berkas yang sama byte-nya.
     * Tombolnya karena itu mengambil Blob SEKALI.
     */
    const tombol = readFileSync(
      join(AKAR_REPO, "src/components/shared/pdf-document-button.tsx"),
      "utf8"
    );
    expect(tanpaKomentar(tombol).match(/generate\(\)/g) ?? []).toHaveLength(1);
  });

  it("tombol beranda mengirim JENIS saja — tidak lagi mengambil barisnya lebih dulu", () => {
    /* Perjalanan ganda (baris turun dari `/api/inventory` / `/api/finance`, lalu
       naik lagi sebagai muatan) hilang: muatannya dihitung rute. */
    const beranda = tanpaKomentar(
      readFileSync(join(AKAR_REPO, "src/components/dashboard/dashboard-export-actions.tsx"), "utf8")
    );
    expect(beranda).toContain('fetchReportPdfBlob("stock", {})');
    expect(beranda).toContain('fetchReportPdfBlob("finance", {})');
    expect(beranda).not.toMatch(/\/api\/(inventory|finance)\b/);
    expect(beranda).not.toMatch(/generate(Stock|Finance)\w*PDF/);
  });

  it("tombol halaman mengirim PARAMETER, bukan barisnya", () => {
    const tombol = tanpaKomentar(
      readFileSync(join(AKAR_REPO, "src/components/shared/pdf-export-buttons.tsx"), "utf8")
    );
    expect(tombol).toContain('fetchReportPdfBlob("stock", {})');
    expect(tombol).toContain('fetchReportPdfBlob("opname", { date, showSystemQty })');
    expect(tombol).toContain('fetchReportPdfBlob("finance", filters)');
    expect(tombol).not.toMatch(/\{ items[,\s}]|\{ balances, transactions \}/);
  });

  it("202 dari rute PDF ditunggu di rute hasil, dengan `?jenis=`", () => {
    const i = files.indexOf("export async function fetchReportPdfBlob(");
    const badan = files.slice(i, files.indexOf("\n}", i));
    expect(badan).toContain("res.status === 202");
    expect(badan).toContain("tungguHasil(antre.jobId, antre.kind, undefined, { jenis })");
  });
});

describe("rute: kecil sinkron, besar diserahkan ke antrean (09 §5)", () => {
  it("menyerahkan LEBIH DULU, menolak kemudian — urutan yang sama dengan ekspor Excel", () => {
    const serah = ruteTanpaKomentar.indexOf(
      'if (spec.sumber === "parameter" && baris > EXPORT_QUEUE_HANDOFF_ROWS)'
    );
    const tolak = ruteTanpaKomentar.indexOf("if (baris > EXPORT_MAX_ROWS)");
    expect(serah, "percabangan penyerahan tidak ada").toBeGreaterThan(-1);
    expect(tolak).toBeGreaterThan(serah);
  });

  it("yang diterbitkan PARAMETER (badan), bukan muatan — dan tanpa `dedupeKey`", () => {
    const i = ruteTanpaKomentar.indexOf("await publishJob({");
    const badan = ruteTanpaKomentar.slice(i, ruteTanpaKomentar.indexOf("});", i));
    expect(badan).toContain('kind: "report.pdf"');
    expect(badan).toContain("companyId: authz.companyId");
    expect(badan).toContain("payload: { jenis, params: badan }");
    expect(badan).not.toMatch(/muatan|dedupeKey/);
  });

  it("hanya jenis berbadan parameter yang bisa diserahkan", () => {
    expect(REPORT_PDF.statement.sumber).toBe("muatan");
    expect(REPORT_PDF.stock.sumber).toBe("parameter");
    expect(REPORT_PDF.opname.sumber).toBe("parameter");
    expect(REPORT_PDF.finance.sumber).toBe("parameter");
  });

  it("pekerjanya memakai jalan yang SAMA — satu pembangkitan, registri yang sama", () => {
    const job = tanpaKomentar(readFileSync(join(AKAR_REPO, "src/lib/report-pdf-job.ts"), "utf8"));
    expect(job).toContain("REPORT_PDF[jenis]");
    expect(job).toContain("spec.muatan(");
    expect(job).toContain("serverPdfCompany(");
    expect(job.match(/output\("arraybuffer"\)/g) ?? []).toHaveLength(1);
    const pekerja = readFileSync(join(AKAR_REPO, "workers/interactive.ts"), "utf8");
    expect(pekerja).toMatch(/"report\.pdf": pdfLaporan/);
    expect(pekerja).toContain("renderReportPdfJob(");
  });
});
