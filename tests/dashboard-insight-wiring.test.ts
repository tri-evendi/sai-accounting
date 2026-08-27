/**
 * PENJAGA #472 — kalimat dan kartu tidak boleh menyebut angka berbeda.
 *
 * Kriteria issue-nya menyebutnya cacat termahal di halaman ini, dan memang:
 * dua baris berdampingan yang menyebut piutang lewat tempo dengan nilai berbeda
 * menghancurkan kepercayaan pada SELURUH halaman, bukan hanya pada barisnya.
 *
 * == Ditutup dengan KONSTRUKSI, bukan dengan pencocokan ====================
 * Cara termudah melanggarnya adalah menambah kueri KEDUA khusus untuk
 * kalimatnya — dua kueri dengan batas waktu yang bergeser sepersekian detik
 * sudah cukup menghasilkan dua angka. Maka yang dijaga di sini bukan
 * "kedua angkanya sama" (yang hanya bisa diuji dengan basis data), melainkan
 * bahwa hanya ada SATU sumber untuk diperbandingkan.
 *
 * `lib/dashboard-insights.ts` sendiri diuji terpisah, tanpa basis data, di
 * `tests/dashboard-insights.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(
  join(
    __dirname,
    "..",
    "src",
    "app",
    "(app)",
    "(dashboard)",
    "t",
    "[tenantSlug]",
    "[companySlug]",
    "page.tsx"
  ),
  "utf8"
);

/**
 * Potongan tempat fakta kalimatnya dirakit.
 *
 * Dimulai dari `overdueRows` — bukan dari `buildDashboardInsights(` — sebab
 * penyaringan barisnya berdiri SEBELUM pemanggilan itu, dan justru baris itulah
 * yang menentukan angkanya berasal dari mana.
 */
const MULAI = "const overdueRows =";
const blok = page.slice(page.indexOf(MULAI), page.indexOf(MULAI) + 3600);

describe("faktanya diturunkan dari angka yang SUDAH dimuat kartunya", () => {
  it("halaman merakit faktanya, bukan modulnya yang membaca basis data", () => {
    expect(page).toMatch(/buildDashboardInsights\(\{/);
    const modul = readFileSync(
      join(__dirname, "..", "src", "lib", "dashboard-insights.ts"),
      "utf8"
    );
    /* Modul murni: sekali ia menyentuh Prisma, angkanya bisa berbeda dari
       kartunya tanpa ada yang bisa melihatnya dari sini. */
    expect(modul).not.toMatch(/prisma|@\/lib\/db/);
  });

  it("angka piutangnya berasal dari `receivables` yang sama dengan kartunya", () => {
    expect(blok).toMatch(/receivables\.overdueCount/);
    expect(blok).toMatch(/receivables\?\.rows/);
  });

  it("tanpa satu kueri pun yang ditambahkan untuk kalimatnya", () => {
    /* Kueri kedua adalah cara paling wajar — dan paling tak terlihat — untuk
       membuat kalimat dan kartu menyimpang. */
    expect(blok).not.toMatch(/prisma\./);
    expect(blok).not.toMatch(/await get(Receivables|Payables)/);
  });

  it("keempat kalimatnya punya faktanya, bukan hanya piutang", () => {
    /*
     * Sampai #472 lanjutan, tiga dari empat kalimat tidak pernah bisa muncul:
     * aturannya ada, faktanya tidak. Sebuah aturan tanpa fakta adalah kode mati
     * yang terlihat seperti fitur — ia lolos setiap tinjauan dan tidak pernah
     * menghasilkan satu kalimat pun di layar siapa pun.
     */
    expect(blok).toMatch(/cash:/);
    expect(blok).toMatch(/budget:/);
    expect(blok).toMatch(/concentration,?/);
  });

  it("angka kasnya diturunkan dari JURNAL, sumber yang sama dengan Arus Kas", () => {
    /*
     * Kartu kas beranda menjumlah `cash_movements` per mata uang tanpa batas
     * tanggal — sebuah SALDO. Kalimatnya menyebut SELISIH dua akhir bulan dalam
     * IDR base. Keduanya besaran berbeda, jadi keduanya tidak bisa saling
     * membantah; yang harus benar adalah bahwa selisihnya sama dengan
     * `netChange` di halaman yang dibuka tautannya, dan itu dijamin dengan
     * memakai rumus `getCashFlow` sendiri lewat `getCashBalanceBase`.
     */
    expect(page).toMatch(/getCashBalanceBase\(period\.to\)/);
    expect(page).toMatch(/getCashBalanceBase\(lastMonthEnd\)/);
    const reports = readFileSync(
      join(__dirname, "..", "src", "lib", "reports.ts"),
      "utf8"
    );
    /* Rumusnya harus tetap `accountNets` atas akun `cash_bank` — persis yang
       dipakai `openingCash`/`closingCash`. Salinan rumus kedua di sini akan
       menghasilkan kalimat yang membantah halamannya sendiri. */
    const fn = reports.slice(
      reports.indexOf("export async function getCashBalanceBase"),
      reports.indexOf("export async function getCashFlow")
    );
    expect(fn).toMatch(/accountNets\(\{ lte: asOf \}/);
    expect(fn).toMatch(/type: CASH_TYPE/);
  });

  it("ember mitra `null` tidak pernah menjadi kalimat konsentrasi", () => {
    /*
     * "Belum ditetapkan menyumbang 60% penjualan" bukan konsentrasi pelanggan —
     * itu data yang belum lengkap, dan menyebutnya sebagai risiko mitra adalah
     * kalimat yang SALAH, bukan kalimat yang kurang tepat.
     */
    expect(blok).toMatch(/partyId != null/);
  });

  it("hanya SATU sisi konsentrasi yang disebut, yang porsinya lebih besar", () => {
    /* Dua kalimat konsentrasi berdampingan memakan jatah tiga baris panel
       untuk mengatakan satu jenis hal. */
    expect(blok).toMatch(/topCustomer\.share >= topSupplier\.share/);
  });

  it("anggaran diam ketika modulnya belum dipakai", () => {
    /* `hasBudgets: false` berarti buku ini tidak punya satu baris anggaran pun.
       Melaporkan "0% di atas anggaran nol" adalah berita yang dikarang. */
    expect(blok).toMatch(/hasBudgets/);
  });

  it("kartu piutang tetap membaca medan yang sama", () => {
    /* Bila suatu hari kartunya pindah ke sumber lain, asersi ini merah — dan
       itu memang saat yang tepat untuk memeriksa kalimatnya ikut pindah. */
    expect(page).toMatch(/receivables\.overdueCount/g);
    expect((page.match(/receivables\.overdueCount/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("panelnya diam tanpa membekas", () => {
  it("daftar kosong memulangkan null, bukan panel berjudul tanpa isi", () => {
    const panel = readFileSync(
      join(__dirname, "..", "src", "components", "dashboard", "insight-panel.tsx"),
      "utf8"
    );
    expect(panel).toMatch(/insights\.length === 0\) return null/);
  });

  it("nada `warn` dibedakan ikon, bukan warna saja", () => {
    const panel = readFileSync(
      join(__dirname, "..", "src", "components", "dashboard", "insight-panel.tsx"),
      "utf8"
    );
    expect(panel).toMatch(/WarningOutlined/);
    expect(panel).toMatch(/InfoCircleOutlined/);
  });
});
