/**
 * Data CONTOH (issue #355) — pagar pengamannya, bukan datanya.
 *
 * Kode ini menulis ke BUKU SEBUAH PT. Yang berbahaya bukan angka contohnya,
 * melainkan kemungkinan ia mendarat di perusahaan yang salah atau di buku yang
 * sudah dipakai. Pagar-pagar di bawah adalah satu-satunya hal yang memisahkan
 * "alat demo" dari "alat perusak buku", dan tak satu pun dari mereka akan
 * berteriak kalau dicabut — kode yang kehilangan pagarnya tetap berjalan mulus,
 * hanya saja pada perusahaan yang keliru.
 *
 * ── TIGA BERKAS, TIGA TANGGUNG JAWAB ───────────────────────────────────────
 * Sejak buku perusahaan BARU ikut diisi contoh (14 Agustus 2026), angkanya
 * tinggal di satu modul bersama dan pemanggilnya ada dua:
 *
 *   • `src/lib/demo-seed.ts`      — angka + mesin posting + hitungan "sudah dipakai"
 *   • `scripts/seed-demo.ts`      — pagar baris perintah (slug, --id, penolakan)
 *   • `src/app/api/setup/route.ts` — pengisian buku perusahaan baru
 *
 * Gaya tesnya mengikuti `tests/create-admin-quota.test.ts`: berkas di repo ini
 * diperiksa dari SUMBERNYA, sebab mengimpornya akan menjalankan `main()`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const src = readFileSync(join(root, "scripts", "seed-demo.ts"), "utf8");
const lib = readFileSync(join(root, "src", "lib", "demo-seed.ts"), "utf8");
const route = readFileSync(join(root, "src", "app", "api", "setup", "route.ts"), "utf8");

/**
 * Sumber TANPA komentar — dipakai setiap asersi "tidak boleh mengandung".
 *
 * Kepala berkasnya menjelaskan justru hal-hal yang ia HINDARI: kenapa tak ada
 * `--force`, kenapa tanpa `Math.random()`, kenapa `company-registry` tak boleh
 * disentuh. Mencocokkan kalimat itu dengan pemakaian sungguhan membuat
 * dokumentasi yang baik menjatuhkan tesnya sendiri — dan cara termudah
 * memerahkannya menjadi "hapus penjelasannya", yang persis kebalikan dari yang
 * diinginkan. Penjelasan tentang sebuah jebakan bukan jebakan itu sendiri.
 */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const code = strip(src);
const libCode = strip(lib);
const routeCode = strip(route);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

describe("scripts/seed-demo.ts — pagar baris perintah", () => {
  it("perusahaan WAJIB disebut; tidak ada bawaan dan tidak ada mode semua-perusahaan", () => {
    expect(src).toContain("Sebutkan perusahaannya");
    // Yang paling berbahaya: memilih sendiri saat slug tidak disebut.
    expect(code).not.toMatch(/findFirst\(\s*\)/);
    expect(code.toLowerCase()).not.toContain("--all");
  });

  it("menolak buku yang sudah dipakai, dan tidak menyediakan --force", () => {
    expect(src).toContain("refuseIfInUse");
    expect(src).toContain("tidak pernah diisi data contoh");
    // Sebuah `--force` mengubah pagar menjadi saran.
    expect(code).not.toContain("--force");
  });

  it("slug yang ambigu antar-tenant dihentikan, bukan ditebak", () => {
    // `companies.slug` unik PER TENANT, bukan global.
    expect(src).toContain("rows.length > 1");
    expect(src).toContain("--id=");
  });

  it("skrip/cron membungkus pekerjaannya dengan runWithCompany (doktrin #104)", () => {
    expect(src).toContain("runWithCompany(");
  });

  /*
   * `lib/company-registry.ts` diawali `import "server-only"`, yang tidak bisa
   * diselesaikan di luar bundler Next: skrip `tsx` yang menyentuhnya mati
   * sebelum baris pertamanya berjalan. Terbukti sekali saat berkas ini ditulis.
   * Berlaku juga untuk modul bersama yang ia impor.
   */
  it("tidak menyentuh modul server-only", () => {
    expect(code).not.toContain("company-registry");
    expect(libCode).not.toContain('"server-only"');
    expect(src).toContain('import "dotenv/config"');
  });
});

describe("lib/demo-seed.ts — hitungan 'buku ini sudah dipakai'", () => {
  /*
   * Jurnal pembuka sengaja TIDAK dihitung sebagai "sudah dipakai": perusahaan
   * yang baru selesai wisaya penyiapan memang punya satu, dan justru perusahaan
   * seperti itulah yang paling masuk akal diisi contoh. Kalau pengecualian ini
   * hilang, pengisinya menolak persis pada kasus yang ia layani.
   */
  it("jurnal pembuka tidak dianggap sebagai transaksi", () => {
    /*
     * Penandanya `source_type = "opening_balance"` — konstanta
     * `OPENING_BALANCE_SOURCE` di `lib/opening-balance.ts`, yang berkas itu
     * sendiri sebut "the authoritative one" dan pakai sebagai pagar
     * jalan-sekali. BUKAN `journals.type`: kolom itu hanya mengenal
     * `general, sales, purchase, cash, adjustment, reversal`, jadi sebuah
     * pengecualian yang membaca `type: "opening"` tidak pernah cocok sekali pun.
     * Itu bukan hipotesis: versi pertama tes ini mengunci kalimat yang salah
     * itu, dan produksi menolak perusahaan `demo` karenanya pada 14 Agustus 2026.
     */
    expect(libCode).toContain("OPENING_BALANCE_SOURCE");
    expect(libCode).not.toMatch(/type:\s*\{\s*not:\s*"opening"/);
    /*
     * Arah sebaliknya, yang jauh lebih mahal: `source_type` NULLABLE, dan
     * jurnal yang diketik tangan tidak punya sumber. Kalau baris NULL ikut
     * termaafkan, pagarnya gagal-TERBUKA pada buku yang benar-benar sudah
     * dipakai — data contoh mendarat di pembukuan sungguhan.
     */
    expect(libCode).toContain("sourceType: null");
  });

  /*
   * Modul ini menulis lewat Prisma LANGSUNG, jadi tak satu pun skema zod
   * memeriksanya. Nilai yang tak dikenal karena itu tidak tertangkap saat baris
   * dibuat, melainkan nanti di `postForSource` — setelah barisnya terlanjur
   * tersimpan. Pengisi yang gagal di tengah meninggalkan buku separuh terisi
   * yang pagar `bookActivity` lalu menolak diperbaiki. Terjadi di produksi
   * 14 Agustus 2026 dengan nilai `"receive"`.
   */
  it("jenis transaksi pemasok hanya yang dikenal mesin posting", () => {
    const jenis = [...libCode.matchAll(/type:\s*"([a-z_]+)"/g)].map((m) => m[1]);
    expect(jenis).not.toContain("receive");
    // `validations/finance.ts`: z.enum(["purchase", "payment"]).
    expect(libCode).toContain('type: "purchase"');
  });

  it("setiap baris contoh ditandai supaya tak pernah menyamar jadi data asli", () => {
    expect(lib).toContain('export const SAMPLE_TAG = "[CONTOH]"');
    // Penandanya harus benar-benar dipakai pada master data & transaksinya.
    expect(lib.match(/\$\{SAMPLE_TAG\}/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
  });
});

describe("lib/demo-seed.ts — bukunya benar-benar terbukukan", () => {
  /*
   * Inti perbedaannya dengan `prisma/seed.ts`, yang menulis faktur & kas TANPA
   * jurnal. Dipakai sebagai contoh, fixture semacam itu menghasilkan Neraca yang
   * tidak seimbang dan Laba/Rugi kosong di samping daftar faktur yang penuh —
   * pengguna baru menyimpulkan aplikasinya salah hitung.
   */
  it("menempuh mesin posting yang sama dengan formulir sungguhan", () => {
    expect(lib).toContain("postForSource(");
    for (const sourceType of [
      "invoice",
      "invoice_payment",
      "supplier_transaction",
      "cash_movement",
    ]) {
      expect(lib, `sumber "${sourceType}" tidak diposting`).toContain(
        `sourceType: "${sourceType}"`
      );
    }
  });

  /* Mesin posting menolak menebak sisi lawan sebuah transaksi kas. */
  it("transaksi kas membawa counterAccountId", () => {
    expect(lib).toContain("counterAccountId");
  });

  /* Bagan akun boleh berbeda antar perusahaan; kode akun yang ditanam akan
     meledak diam-diam pada bagan lain. */
  it("akun beban dibaca dari pemetaan, bukan ditanam sebagai kode akun", () => {
    expect(lib).toContain("resolveAccountId(");
    expect(lib).toContain("MAPPING_KEYS.PURCHASE_EXPENSE");
    expect(libCode).not.toMatch(/"6101"|'6101'/);
  });

  /*
   * Piutangnya harus BERPEMILIK. Tanpa `customerId` angkanya tetap benar di
   * Neraca, tetapi grafik Umur Piutang — yang lahir di rilis yang sama dengan
   * data contoh ini — tampil kosong pada buku yang justru dibuat untuk
   * memamerkannya.
   */
  it("faktur contoh ditautkan ke pelanggannya", () => {
    expect(libCode).toContain("customerId:");
  });

  /*
   * Contoh yang berubah tiap dijalankan tak bisa dijadikan rujukan: tangkapan
   * layar dokumentasi basi seketika, dan laporan bug "angkanya beda dengan di
   * panduan" tidak bisa ditelusuri.
   */
  it("tanpa keacakan", () => {
    expect(libCode).not.toContain("Math.random");
  });
});

describe("api/setup — buku perusahaan BARU ikut terisi", () => {
  it("mengisi lewat modul bersama, bukan salinan angka kedua", () => {
    expect(routeCode).toContain("seedSampleBook");
    expect(routeCode).toContain("bookActivity");
  });

  /*
   * PALING PENTING di berkas ini.
   *
   * `is_demo` menyalakan gerbang tulis di KEDUA penjaga (`page-auth`,
   * `auth-guard`). Menyalakannya di sini akan membuat buku milik pelanggan
   * sendiri menolak setiap tulisan — perusahaan yang baru saja mereka siapkan
   * seketika menjadi hanya-baca, dan tak satu pun pesan galatnya akan
   * menjelaskan kenapa. Yang menandai isinya di sini hanyalah awalan
   * `[CONTOH]`: bukunya milik mereka, boleh ditulisi, barisnya boleh dihapus.
   */
  it("TIDAK pernah menandai perusahaan pelanggan sebagai demo", () => {
    expect(routeCode).not.toContain("isDemo");
  });

  /*
   * Penyiapan yang berhasil lalu dilaporkan gagal hanya karena data HIASAN
   * tidak jadi ditulis adalah pertukaran yang salah arah: perusahaannya sudah
   * tersiapkan dan saldo awalnya sudah terposting, dan tak satu pun dari itu
   * boleh dibatalkan oleh contoh yang tidak esensial.
   */
  it("kegagalan pengisian tidak pernah menjatuhkan penyiapan", () => {
    const mulai = routeCode.indexOf("let sample");
    const selesai = routeCode.indexOf("await invalidateEnabledModules");
    expect(mulai, "blok pengisian contoh tidak ditemukan").toBeGreaterThan(-1);
    expect(selesai).toBeGreaterThan(mulai);

    const blok = routeCode.slice(mulai, selesai);
    expect(blok).toContain("seedSampleBook");
    expect(blok).toContain("catch");
    // Sebuah `throw` di sini mengubah hiasan menjadi syarat.
    expect(blok).not.toContain("throw");
  });
});

describe("terdaftar sebagaimana mestinya", () => {
  it("package.json membedakannya dari prisma/seed.ts", () => {
    expect(pkg.scripts["db:seed:demo"]).toBe("tsx scripts/seed-demo.ts");
    expect(pkg.scripts._db_seed_demo_note).toContain("diposting");
  });
});
