/**
 * Kebuntuan "Memuat sesi…" yang tak pernah selesai — insiden produksi
 * 14 Agustus 2026.
 *
 * ══ BENTUK KEBUNTUANNYA ════════════════════════════════════════════════════
 *
 * Dua tata letak bersarang, dan yang satu mengunci yang lain:
 *
 *   • `app/(app)/(dashboard)/layout.tsx` — bila `session.user.role` masih null, ia
 *     menampilkan loader "Memuat sesi…".
 *   • `app/(app)/(dashboard)/t/[tenantSlug]/[companySlug]/layout.tsx` — merender
 *     `CompanySessionSync`, SATU-SATUNYA pemanggil `update({ companyId })`
 *     yang menaruh perusahaan (dan karenanya peran) ke dalam token.
 *
 * Yang kedua adalah `children` milik yang pertama. Jadi ketika tata letak
 * dasbor mengembalikan loader SAJA — tanpa `children` — penambal tokennya tidak
 * pernah dipasang, `role` tidak pernah terisi, dan loadernya berputar selamanya.
 * Penambalnya terkunci di dalam pintu yang ia sendiri harus buka.
 *
 * Korbannya persis pengguna yang paling tidak boleh menemuinya: pendaftar baru
 * yang baru saja membuat PT PERTAMANYA, sebab tokennya terbit sebelum PT itu
 * ada. Di produksi ia mendaftar 04:54 UTC, membuat PT-nya 04:55, lalu mencoba
 * membuat PT yang sama sekali lagi pada 05:02 — yang memang dilakukan orang
 * ketika layar tidak pernah selesai memuat.
 *
 * ══ KENAPA TES SUMBER, BUKAN TES RENDER ════════════════════════════════════
 *
 * Yang salah bukan sepotong logika yang bisa dipanggil, melainkan HUBUNGAN
 * antara dua berkas: siapa merender siapa. Merendernya sungguhan menuntut
 * `next-auth`, `SessionProvider`, dan router App Router yang dipalsukan —
 * perancah yang jauh lebih rapuh daripada sifat yang dijaga, dan yang tetap
 * tidak akan menyebut nama berkas kedua. Gaya ini mengikuti
 * `tests/seed-demo.test.ts` dan `tests/create-admin-quota.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const layout = readFileSync(join(root, "src", "app", "(app)", "(dashboard)", "layout.tsx"), "utf8");
const companyLayout = readFileSync(
  join(root, "src", "app", "(app)", "(dashboard)", "t", "[tenantSlug]", "[companySlug]", "layout.tsx"),
  "utf8"
);
const sync = readFileSync(
  join(root, "src", "components", "layout", "company-session-sync.tsx"),
  "utf8"
);

/** Sumber tanpa komentar — penjelasan tentang jebakan bukan jebakan itu sendiri. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const layoutCode = strip(layout);

describe("tata letak dasbor — 'Memuat sesi…' tidak boleh mengunci penambalnya", () => {
  /*
   * Asersi INTI. Cabang `!role` wajib ikut merender `children`; tanpa itu
   * `CompanySessionSync` tidak pernah dipasang dan loadernya abadi.
   */
  it("cabang tanpa peran tetap merender children", () => {
    const mulai = layoutCode.indexOf("if (!role)");
    expect(mulai, "cabang `!role` tidak ditemukan lagi — periksa ulang tes ini").toBeGreaterThan(
      -1
    );

    /* Sampai `return (` milik kerangka penuh di bawahnya. */
    const selesai = layoutCode.indexOf("<Layout hasSider", mulai);
    expect(selesai).toBeGreaterThan(mulai);

    const cabang = layoutCode.slice(mulai, selesai);
    expect(cabang).toContain("children");
    expect(cabang).toContain("PageLoader");
  });

  /*
   * Isinya belum boleh TERLIHAT: tanpa peran tidak ada sidebar dan navbar, jadi
   * menampilkannya apa adanya mengedipkan halaman tanpa kerangka. Yang
   * dibutuhkan hanya subtree-nya TERPASANG supaya efeknya berjalan.
   */
  it("children di cabang itu dipasang tersembunyi, bukan ditampilkan", () => {
    const mulai = layoutCode.indexOf("if (!role)");
    const selesai = layoutCode.indexOf("<Layout hasSider", mulai);
    expect(layoutCode.slice(mulai, selesai)).toMatch(/<div hidden>\{children\}<\/div>/);
  });

  /*
   * Dan hanya pada rute yang jalurnya memang menyebut perusahaan: di
   * `/dashboard` telanjang tidak ada yang perlu ditambal, dan memasang subtree
   * diam-diam hanya menjalankan efek halaman yang tidak diminta siapa pun.
   */
  it("hanya pada rute berperusahaan, dan dikenali dari JALUR bukan dari sesi", () => {
    expect(layoutCode).toContain("useParams");
    expect(layoutCode).toContain("companySlug");
  });
});

describe("kenapa aturan di atas ada — hubungan antar-berkasnya", () => {
  /*
   * Kalau salah satu dari dua fakta ini berubah, kebuntuannya berpindah, bukan
   * hilang — dan asersi di atas berhenti menjaga apa pun tanpa memerah.
   */
  it("penambal token dirender oleh tata letak PERUSAHAAN (anak tata letak dasbor)", () => {
    expect(companyLayout).toContain("CompanySessionSync");
  });

  it("dan ia satu-satunya yang menaruh perusahaan ke dalam token", () => {
    expect(sync).toContain("update({ companyId })");
  });
});
