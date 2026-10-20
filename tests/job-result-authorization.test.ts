/**
 * PENJAGA otorisasi hasil pekerjaan (rancangan §4).
 *
 * ══ KENAPA INI YANG PALING MUDAH TERLEWAT ══════════════════════════════════
 * `result_ref` memuat isi buku besar — ekspor neraca, faktur, paket laporan —
 * dan ia KUNCI, bukan kapabilitas. Rancangan §4 menyebutnya "yang paling mudah
 * terlewat", dan bentuk kegagalannya tidak punya gejala: unduhan yang
 * izinnya diperiksa saat pekerjaan LAHIR alih-alih saat DIUNDUH tetap bekerja
 * sempurna untuk setiap pengguna yang sah. Ia hanya juga bekerja untuk orang
 * yang perannya sudah dicabut.
 *
 * Yang dijaga di sini SIFAT berkas rutenya, bukan perilakunya di bawah HTTP:
 * memanggil route handler sungguhan menuntut sesi, basis data kendali, basis
 * data perusahaan, dan berkas di cakram. Idiom yang sama dengan
 * `tests/contract-jobs.test.ts` — yang diperiksa hanya sifat yang kalau hilang
 * TIDAK menghasilkan galat apa pun.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AKAR_REPO, tanpaKomentar } from "./akar-sumber";
import {
  JOB_RESULT_PERMISSION,
  isDownloadableKind,
  isValidResultRef,
  jobResultHref,
  resultFilename,
} from "@sai/core/job-result";
import { JOB_KINDS, type JobKind } from "@sai/core/generated/job-kinds";
import { PERMISSIONS } from "@sai/core/authz";

const RUTE = join(
  AKAR_REPO,
  "src/app/api/t/[tenantSlug]/[companySlug]/jobs/[kind]/[id]/result/route.ts"
);
const STORE = join(AKAR_REPO, "packages/platform/src/job-result-store.ts");

const rute = readFileSync(RUTE, "utf8");
const store = readFileSync(STORE, "utf8");

describe("peta izin: setiap jenis menyatakan siapa yang berhak", () => {
  it("LENGKAP atas seluruh `kind` di kontrak", () => {
    /* `Record<JobKind, …>` yang lengkap, bukan `Partial`: `kind` baru tidak
       akan mengompilasi sampai seseorang memutuskan siapa yang berhak
       mengunduh hasilnya. Penjaga ini menangkap hal yang `tsc` tidak bisa —
       entri yang DIHAPUS bersama kind-nya lalu kind-nya dikembalikan. */
    const diKontrak = Object.keys(JOB_KINDS).sort();
    const diPeta = Object.keys(JOB_RESULT_PERMISSION).sort();
    expect(diPeta).toEqual(diKontrak);
  });

  it("setiap izin yang disebut benar-benar ada di matriks", () => {
    /* Izin yang salah tulis akan ditolak `requireApiPermission` untuk SEMUA
       orang — tombol unduh yang tidak pernah bekerja, dan pesannya menyalahkan
       peran pengguna. */
    for (const [kind, izin] of Object.entries(JOB_RESULT_PERMISSION)) {
      if (izin === null) continue;
      expect(PERMISSIONS, `${kind} → ${izin}`).toContain(izin);
    }
  });

  it("ekspor laporan dan dokumen menuntut izin yang BERBEDA", () => {
    /* Satu izin tunggal untuk seluruh unduhan akan membuat siapa pun yang
       boleh mengunduh satu dokumen juga boleh mengunduh ekspor neraca —
       keduanya "hasil pekerjaan", dan hanya itu kesamaannya. */
    expect(JOB_RESULT_PERMISSION["report.export"]).not.toBe(
      JOB_RESULT_PERMISSION["document.generate"]
    );
  });

  it("jalur yang MENULIS buku tidak punya pintu unduhan", () => {
    /* Hasil jalur `ledger` adalah baris jurnal, bukan berkas. Pintu unduhan
       untuknya adalah pintu ke sesuatu yang tidak ada. */
    for (const [kind, spec] of Object.entries(JOB_KINDS)) {
      if (!spec.writesLedger) continue;
      expect(JOB_RESULT_PERMISSION[kind as JobKind], kind).toBeNull();
    }
  });

  it("manifest cadangan TIDAK bisa diunduh lewat rute per-PT", () => {
    /* Manifest menyebut nama basis data SELURUH tenant. Menjadikannya dapat
       diunduh lewat rute bertenant akan memberi satu PT jalan ke daftar itu;
       jalannya runbook operator, bukan permukaan HTTP. */
    expect(JOB_RESULT_PERMISSION["tenant.backup"]).toBeNull();
    expect(JOB_RESULT_PERMISSION["tenant.conformance"]).toBeNull();
    expect(isDownloadableKind("tenant.backup")).toBe(false);
  });
});

describe("rute unduhan: urutan pemeriksaan", () => {
  it("gerbang izin berjalan SEBELUM barisnya dibaca", () => {
    /*
     * Ini satu-satunya penjaga di berkas ini yang menjaga URUTAN, dan urutan
     * itulah yang menentukan apakah route ini membocorkan sesuatu: membaca
     * baris lebih dulu membuat penanya ANONIM menerima 401 untuk id yang ada
     * dan 404 untuk yang tidak — dan dari dua jawaban itu seseorang bisa
     * mencacah berapa ekspor yang pernah berjalan di SELURUH pemasangan.
     * Doktrin #317: volume pemakaian tidak boleh bocor ke permukaan publik.
     */
    const gerbang = rute.indexOf("await requireApiPermission(");
    const baca = rute.indexOf("await jobForDownload(");
    expect(gerbang, "requireApiPermission tidak ada").toBeGreaterThan(-1);
    expect(baca, "jobForDownload tidak ada").toBeGreaterThan(-1);
    expect(gerbang).toBeLessThan(baca);
  });

  it("izinnya DITURUNKAN dari `kind`, bukan dipaku satu nilai", () => {
    expect(rute).toContain("JOB_RESULT_PERMISSION[");
    expect(rute).toMatch(/requireApiPermission\(izin, params\)/);
  });

  it("jenis yang diklaim jalur DIVERIFIKASI terhadap barisnya", () => {
    /* Tanpa ini, gerbang `document.read` bisa dipakai mengambil hasil
       `report.export`: jenis di jalur hanya boleh MEMPERSEMPIT apa yang
       terjangkau, tidak pernah memperluas. */
    expect(rute).toMatch(/job\.kind !== kindDiminta/);
  });

  it("perusahaan dibandingkan EKSPLISIT terhadap konteks aktif", () => {
    /*
     * `jobs` hidup di basis data KENDALI, jadi ia tidak ikut isolasi #104 yang
     * membuat `findUnique` atas id milik PT lain memulangkan kosong — pola
     * rute berkas dokumen tidak berlaku di sini, dan perbandingan eksplisit
     * karena itu wajib.
     */
    expect(rute).toMatch(/job\.companyId !== authz\.companyId/);
    expect(rute).toMatch(/job\.companyId === null/);
  });

  it("status WAJIB `done` dan `result_ref` WAJIB ada", () => {
    expect(rute).toMatch(/job\.status !== "done"/);
    expect(rute).toMatch(/job\.resultRef === null/);
  });
});

describe("rute unduhan: tidak ada jalan keluar selain byte", () => {
  it("TIDAK PERNAH memantulkan ke URL penyimpanan", () => {
    /* Redirect ke URL bertanda tangan membuat izin diperiksa SEKALI lalu
       tautannya hidup sendiri sampai kedaluwarsa — dan tautan itu bisa
       dibagikan, disimpan peramban, dan muncul di log proxy. */
    expect(rute).not.toMatch(/NextResponse\.redirect|Response\.redirect|status: 30[1278]/);
    expect(rute).not.toMatch(/getSignedUrl|presign|signatureVersion/i);
  });

  it("di-stream, bukan dibaca utuh ke heap", () => {
    /* Rute berkas dokumen boleh `readFile` karena unggahan dibatasi 10 MB.
       Paket laporan belum dibatasi sama sekali, dan satu unduhan yang memegang
       seluruh berkas di heap berjalan di proses yang sedang melayani halaman
       orang lain. */
    expect(rute).toContain("createReadStream");
    expect(rute).not.toMatch(/\breadFile\(/);
  });

  it("`attachment`, bukan `inline`", () => {
    /* `inline` atas berkas yang tipenya salah tebak adalah satu langkah dari
       HTML yang dirender di origin kita sendiri. */
    expect(rute).toMatch(/attachment; filename=/);
    expect(rute).not.toMatch(/inline; filename=/);
  });

  it("jawabannya tidak boleh di-cache proxy bersama", () => {
    expect(rute).toContain('"Cache-Control": "private, no-store"');
    expect(rute).toContain('"X-Content-Type-Options": "nosniff"');
  });

  it("nama berkasnya dari `result_ref`, bukan dari muatan pekerjaan", () => {
    /*
     * Nama yang datang dari muatan bisa memuat apa pun, dan ia mendarat di
     * header `Content-Disposition` — tempat baris baru memecah respons.
     *
     * Versi pertama penjaga ini melarang kata `payload` muncul di rute sama
     * sekali, dan ia merah ketika gerbang KEDUA lahir — gerbang yang memang
     * HARUS membaca muatan untuk memeriksa izin laporannya (#355). Yang dijaga
     * sifatnya: muatan tidak boleh menyusun nama berkas.
     */
    expect(rute).toMatch(/resultFilename\(job\.resultRef\)/);
    const i = rute.indexOf("const filename =");
    expect(i).toBeGreaterThan(-1);
    expect(rute.slice(i, rute.indexOf("\n", i))).not.toMatch(/payload/);
    /* Dan muatan hanya punya SATU pembaca di rute ini: gerbang keduanya. */
    expect(tanpaKomentar(rute).match(/job\.payload/g) ?? []).toHaveLength(1);
  });
});

describe("gerbang KEDUA: izin yang dibawa muatannya (#355)", () => {
  const gate = readFileSync(join(AKAR_REPO, "src/lib/job-result-gate.ts"), "utf8");

  it("rute memanggilnya SESUDAH izin jenis dan perbandingan perusahaan", () => {
    /*
     * Urutannya bukan selera: gerbang kedua membaca MUATAN pekerjaan, dan
     * muatan itu tidak boleh terbaca oleh siapa pun yang belum lolos izin
     * jenis maupun perbandingan perusahaan.
     */
    const izin = rute.indexOf("await requireApiPermission(izin, params)");
    const pt = rute.indexOf("job.companyId !== authz.companyId");
    const kedua = rute.indexOf("await bolehAmbilHasil(");
    expect(izin).toBeLessThan(pt);
    expect(pt).toBeLessThan(kedua);
  });

  it("`switch`-nya LENGKAP — `kind` baru tidak bisa lolos tanpa keputusan", () => {
    /* Setiap `kind` wajib disebut, dan `tsc` menolak yang tidak. Keputusan
       "tidak butuh gerbang" ditulis sebagai `return` beserta alasannya, bukan
       sebagai ketiadaan baris. */
    for (const kind of Object.keys(JOB_KINDS)) {
      expect(gate, kind).toContain(`case "${kind}":`);
    }
  });

  it("ekspor laporan memeriksa izin LAPORANNYA, bukan hanya `report.export`", () => {
    /*
     * `report.export` menjawab "boleh mengekspor laporan", bukan "boleh
     * mengekspor laporan INI". Tanpa ini, pekerjaan atas Nilai Persediaan yang
     * diterbitkan ketika modul Stok masih aktif tetap bisa diunduh SESUDAH
     * modul itu dimatikan — melanggar justru aturan §4 yang menuntut izin
     * diperiksa SAAT MENGUNDUH.
     */
    const i = gate.indexOf('case "report.export":');
    const badan = gate.slice(i, gate.indexOf("case \"document.generate\":", i));
    expect(badan).toContain("canEffective(user, report.permission)");
    expect(badan).toContain("isExportable(report)");
  });

  it("muatan tanpa `reportId` DITOLAK, bukan dilewati gerbangnya", () => {
    /* Baris yang tidak bisa diperiksa bukan baris yang bersih — aturan yang
       sama dengan `vonisVersi` memulangkan `tak_terbaca` alih-alih `mutakhir`. */
    const i = gate.indexOf('case "report.export":');
    const badan = gate.slice(i, gate.indexOf("case \"document.generate\":", i));
    expect(badan).toMatch(/typeof reportId !== "string"[\s\S]{0,40}return false/);
  });

  it("jenis yang belum punya gerbangnya TIDAK bisa diunduh", () => {
    /* `document.generate` ada di kontrak tapi belum punya pemeriksaan
       kepemilikan dokumennya. `false` sampai itu ditulis. */
    const i = gate.indexOf('case "document.generate":');
    const badan = gate.slice(i, gate.indexOf("case \"import.process\":", i));
    expect(badan).toContain("return false");
  });

  it("muatannya TIDAK PERNAH dipulangkan ke pemanggil HTTP", () => {
    /* Ia dibaca gerbang, lalu dibuang. Muatan memuat parameter laporan beserta
       pilihan kolomnya — bukan angka, tapi juga bukan sesuatu yang perlu
       dikirim balik. */
    const i = rute.indexOf("return NextResponse.json(");
    const sisa = rute.slice(i);
    expect(sisa).not.toMatch(/job\.payload/);
  });
});

describe("`result_ref`: bentuknya divalidasi meski datang dari basis data kita", () => {
  it("menerima bentuk yang benar", () => {
    expect(isValidResultRef("report-export-12/Neraca_2026-10-20.xlsx")).toBe(true);
    expect(isValidResultRef("document-generate-7/INV-001.pdf")).toBe(true);
  });

  it("menolak path traversal dalam setiap bentuknya", () => {
    for (const jahat of [
      "../rahasia/x.pdf",
      "a/../../etc/passwd",
      "..%2Fx/y.pdf",
      "./x/y.pdf",
      "a/..",
      "../..",
    ]) {
      expect(isValidResultRef(jahat), jahat).toBe(false);
    }
  });

  it("menolak jalur absolut, garis miring berganda, dan pemisah Windows", () => {
    for (const jahat of ["/etc/passwd", "//a/b", "a//b", "a\\b", "\\a\\b", "a/b/c"]) {
      expect(isValidResultRef(jahat), jahat).toBe(false);
    }
  });

  it("menolak byte nol", () => {
    /* Pemotongan jalur di lapisan C: `a/b.pdf\0.png` lolos pemeriksaan
       ekstensi lalu membuka `a/b.pdf`. */
    expect(isValidResultRef("a/b.pdf\u0000.png")).toBe(false);
  });

  it("menolak yang kosong dan yang keterlaluan panjang", () => {
    expect(isValidResultRef("")).toBe(false);
    expect(isValidResultRef(`a/${"x".repeat(400)}`)).toBe(false);
  });

  it("menuntut TEPAT dua segmen", () => {
    /* Kedalaman yang bebas membuat "di bawah akar" menjadi sifat yang harus
       dibuktikan ulang tiap kali seseorang menambah lapis. */
    expect(isValidResultRef("satu-saja.pdf")).toBe(false);
    expect(isValidResultRef("a/b/c.pdf")).toBe(false);
  });

  it("nama berkasnya segmen terakhir", () => {
    expect(resultFilename("report-export-12/Neraca.xlsx")).toBe("Neraca.xlsx");
  });
});

describe("penyimpanan hasil: di luar `public/`, dan dijaga dua kali", () => {
  it("akarnya `data/`, bukan `public/`", () => {
    /* Berkas statis TIDAK melewati satu pun penjaga — pelajaran #367, dan
       satu-satunya alasan rute di atas ada. */
    expect(store).toMatch(/path\.join\(process\.cwd\(\), "data", "hasil"\)/);
    expect(store).not.toMatch(/"public"/);
  });

  it("jalurnya diperiksa LAGI sesudah digabung", () => {
    /* `path.join` menormalkan `..` dengan rapi, dan rapi adalah persis yang
       membuat lolosnya tidak terlihat. */
    const i = store.indexOf("export function resolveResultPath");
    const badan = store.slice(i, store.indexOf("\n}", i));
    expect(badan).toContain("isValidResultRef");
    /* Yang dijaga SIFATNYA — "jalur hasil wajib di bawah akarnya" — bukan nama
       variabel yang memegang akar itu. Versi pertama penjaga ini menyebut nama
       variabelnya, dan ia merah ketika akarnya diberi seam untuk pengujian:
       perubahan yang justru membuat fungsi penghapus bisa diuji sungguhan. */
    expect(badan).toMatch(/startsWith\([^)]*path\.sep\)/);
    expect(badan).toMatch(/return null;/);
  });

  it("ditulis lewat berkas sementara lalu di-rename", () => {
    /* Penulisan yang terputus meninggalkan berkas setengah yang NAMANYA
       TAMPAK SAH, dan `result_ref` yang sudah tercatat akan menunjuk ke sana. */
    const i = store.indexOf("export async function writeJobResult");
    const badan = store.slice(i, store.indexOf("\n}", i));
    expect(badan).toContain(".partial");
    expect(badan).toMatch(/await rename\(/);
  });

  it("pembersih yatim menyapu CAKRAM, bukan daftar baris", () => {
    /*
     * Pembersih yang berjalan dari daftar baris hanya bisa menemukan hasil yang
     * MASIH punya barisnya — yaitu persis yang tidak boleh dibuang. Yatim lahir
     * ketika barisnya hilang lebih dulu (`archiveDoneJobs` sesudah 14 hari).
     */
    const i = store.indexOf("export async function pruneOrphanResults");
    const badan = store.slice(i, store.indexOf("\n}", i));
    expect(badan).toContain("readdir");
    expect(badan).toMatch(/idMasihAda\.has\(id\)/);
  });

  it("pembersih MELEWATI nama yang bukan miliknya", () => {
    // Direktori yang bukan milik kita tidak boleh disentuh pembersih kita.
    const i = store.indexOf("export async function pruneOrphanResults");
    const badan = store.slice(i, store.indexOf("\n}", i));
    expect(badan).toMatch(/continue;/);
  });
});

describe("alamat unduhan: satu tempat rumusnya ditulis", () => {
  it("membawa tenant, perusahaan, jenis, dan id", () => {
    const href = jobResultHref("pt-abc", "buku-utama", "report.export", 42);
    expect(href).toBe("/api/t/pt-abc/buku-utama/jobs/report.export/42/result");
  });

  it("rutenya ADA di tempat yang ditunjuk rumusnya", () => {
    /* Rumus dan berkas rutenya bisa menyimpang tanpa satu galat pun — dan
       gejalanya 404 di tombol unduh, yang terbaca seperti pekerjaan yang gagal. */
    expect(existsSync(RUTE)).toBe(true);
  });
});
