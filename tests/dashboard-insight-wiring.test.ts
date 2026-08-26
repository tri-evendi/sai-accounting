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
const blok = page.slice(page.indexOf(MULAI), page.indexOf(MULAI) + 1200);

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
