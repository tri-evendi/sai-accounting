/**
 * `scripts/seed-demo.ts` (issue #355) — pagar pengamannya, bukan datanya.
 *
 * Skrip ini menulis ke BUKU SEBUAH PT. Yang berbahaya bukan angka contohnya,
 * melainkan kemungkinan ia mendarat di perusahaan yang salah atau di buku yang
 * sudah dipakai. Empat pagar di bawah adalah satu-satunya hal yang memisahkan
 * "alat demo" dari "alat perusak buku", dan tak satu pun dari mereka akan
 * berteriak kalau dicabut — skrip yang kehilangan pagarnya tetap berjalan
 * mulus, hanya saja pada perusahaan yang keliru.
 *
 * Gaya tesnya mengikuti `tests/create-admin-quota.test.ts`: skrip di repo ini
 * diperiksa dari SUMBERNYA, sebab mengimpornya akan menjalankan `main()`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(__dirname, "..", "scripts", "seed-demo.ts"), "utf8");

/**
 * Sumber TANPA komentar — dipakai setiap asersi "tidak boleh mengandung".
 *
 * Kepala berkas skripnya menjelaskan justru hal-hal yang ia HINDARI: kenapa tak
 * ada `--force`, kenapa tanpa `Math.random()`, kenapa `company-registry` tak
 * boleh disentuh. Mencocokkan kalimat itu dengan pemakaian sungguhan membuat
 * dokumentasi yang baik menjatuhkan tesnya sendiri — dan cara termudah
 * memerahkannya menjadi "hapus penjelasannya", yang persis kebalikan dari yang
 * diinginkan. Penjelasan tentang sebuah jebakan bukan jebakan itu sendiri.
 */
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8")
) as { scripts: Record<string, string> };

describe("scripts/seed-demo.ts — pagar pengaman", () => {
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

  /*
   * Jurnal pembuka sengaja TIDAK dihitung sebagai "sudah dipakai": perusahaan
   * yang baru selesai wisaya penyiapan memang punya satu, dan justru perusahaan
   * seperti itulah yang paling masuk akal diisi demo. Kalau pengecualian ini
   * hilang, skripnya menolak persis pada kasus yang ia layani.
   */
  it("jurnal pembuka tidak dianggap sebagai transaksi", () => {
    expect(src).toContain('type: { not: "opening" }');
  });

  it("setiap baris contoh ditandai supaya tak pernah menyamar jadi data asli", () => {
    expect(src).toContain('const TAG = "[CONTOH]"');
    // Penandanya harus benar-benar dipakai pada master data & transaksinya.
    expect(src.match(/\$\{TAG\}/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
  });

  it("slug yang ambigu antar-tenant dihentikan, bukan ditebak", () => {
    // `companies.slug` unik PER TENANT, bukan global.
    expect(src).toContain("rows.length > 1");
    expect(src).toContain("--id=");
  });
});

describe("scripts/seed-demo.ts — bukunya benar-benar terbukukan", () => {
  /*
   * Inti perbedaannya dengan `prisma/seed.ts`, yang menulis faktur & kas TANPA
   * jurnal. Dipakai sebagai demo, fixture semacam itu menghasilkan Neraca yang
   * tidak seimbang dan Laba/Rugi kosong di samping daftar faktur yang penuh —
   * pengguna baru menyimpulkan aplikasinya salah hitung.
   */
  it("menempuh mesin posting yang sama dengan formulir sungguhan", () => {
    expect(src).toContain("postForSource(");
    for (const sourceType of ["invoice", "invoice_payment", "supplier_transaction", "cash_movement"]) {
      expect(src, `sumber "${sourceType}" tidak diposting`).toContain(`sourceType: "${sourceType}"`);
    }
  });

  /* Mesin posting menolak menebak sisi lawan sebuah transaksi kas. */
  it("transaksi kas membawa counterAccountId", () => {
    expect(src).toContain("counterAccountId");
  });

  /* Bagan akun boleh berbeda antar perusahaan; kode akun yang ditanam akan
     meledak diam-diam pada bagan lain. */
  it("akun beban dibaca dari pemetaan, bukan ditanam sebagai kode akun", () => {
    expect(src).toContain("resolveAccountId(");
    expect(src).toContain("MAPPING_KEYS.PURCHASE_EXPENSE");
    expect(code).not.toMatch(/"6101"|'6101'/);
  });

  it("skrip/cron membungkus pekerjaannya dengan runWithCompany (doktrin #104)", () => {
    expect(src).toContain("runWithCompany(");
  });

  /*
   * `lib/company-registry.ts` diawali `import "server-only"`, yang tidak bisa
   * diselesaikan di luar bundler Next: skrip `tsx` yang menyentuhnya mati
   * sebelum baris pertamanya berjalan. Terbukti sekali saat berkas ini ditulis.
   */
  it("tidak menyentuh modul server-only", () => {
    expect(code).not.toContain("company-registry");
    expect(src).toContain('import "dotenv/config"');
  });
});

describe("scripts/seed-demo.ts — demonya dapat direproduksi", () => {
  /*
   * Demo yang berubah tiap dijalankan tak bisa dijadikan rujukan: tangkapan
   * layar dokumentasi basi seketika, dan laporan bug "angkanya beda dengan di
   * panduan" tidak bisa ditelusuri.
   */
  it("tanpa keacakan", () => {
    expect(code).not.toContain("Math.random");
  });

  it("terdaftar di package.json dengan catatan yang membedakannya dari prisma/seed.ts", () => {
    expect(pkg.scripts["db:seed:demo"]).toBe("tsx scripts/seed-demo.ts");
    expect(pkg.scripts._db_seed_demo_note).toContain("diposting");
  });
});
