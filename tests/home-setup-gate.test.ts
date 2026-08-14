/**
 * Beranda perusahaan wajib ikut memantulkan buku yang BELUM DISIAPKAN.
 *
 * ══ LUBANG YANG DITUTUP ════════════════════════════════════════════════════
 *
 * Gerbang "belum disiapkan" berdiri di `gateAfterCompany` — satu tempat yang
 * dilewati ~50 halaman lewat `requirePagePermission`. Beranda perusahaan TIDAK
 * termasuk: ia terbuka untuk semua peran, jadi tidak ada satu izin yang bisa ia
 * deklarasikan, dan karena itu ia menjaga dirinya sendiri.
 *
 * Akibatnya terlihat di produksi 14–15 Agustus 2026, pada pendaftar baru
 * pertama dari luar: SETIAP halaman lain memantulkannya ke wisaya penyiapan,
 * sementara halaman PERTAMA sesudah masuk — satu-satunya yang pasti ia buka —
 * justru tidak. Yang ia lihat adalah dasbor berisi nol, tanpa satu kalimat pun
 * yang menyebut bahwa wisayanya belum dijalankan. Ia menyerah, lalu mencoba
 * MEMBUAT PT-nya sekali lagi.
 *
 * ══ KENAPA TES SUMBER ══════════════════════════════════════════════════════
 * Yang dijaga adalah HUBUNGAN antar-berkas — siapa memanggil gerbang mana, dan
 * dengan urutan apa. Merendernya sungguhan menuntut sesi, konteks perusahaan,
 * dan basis data per-PT yang dipalsukan; perancahnya jauh lebih rapuh daripada
 * sifat yang dijaga. Pola yang sama dengan `tests/dashboard-session-deadlock.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const home = readFileSync(
  join(root, "src", "app", "(dashboard)", "t", "[tenantSlug]", "[companySlug]", "page.tsx"),
  "utf8"
);
const setupPage = readFileSync(
  join(root, "src", "app", "(setup)", "t", "[tenantSlug]", "[companySlug]", "setup", "page.tsx"),
  "utf8"
);
const pageAuth = readFileSync(join(root, "src", "lib", "page-auth.ts"), "utf8");

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const homeCode = strip(home);
const pageAuthCode = strip(pageAuth);

describe("beranda perusahaan — gerbang 'belum disiapkan'", () => {
  it("memanggil gerbangnya sendiri, sebab ia tidak lewat gateAfterCompany", () => {
    expect(homeCode).toContain("requireSetupDone(");
  });

  /*
   * SESUDAH kunci buku, bukan sebelum. "PT ini belum disiapkan" adalah
   * informasi TENTANG buku, dan buku tidak menjawab apa pun kepada orang yang
   * belum membuktikan kehadirannya — urutan yang sama dipakai `page-auth.ts`,
   * dan alasannya tertulis di sana.
   */
  it("dipanggil SESUDAH kunci buku", () => {
    const kunci = homeCode.indexOf("requireUnlockedCompany(");
    const setup = homeCode.indexOf("requireSetupDone(");
    expect(kunci).toBeGreaterThan(-1);
    expect(setup).toBeGreaterThan(kunci);
  });

  /*
   * Satu aturan, satu tempat. Menyalin badan gerbangnya ke beranda akan
   * membuat dua salinan yang salah satunya pasti tertinggal saat yang lain
   * berubah — dan yang tertinggal tidak akan berbunyi.
   */
  it("aturannya tinggal di SATU fungsi, dipakai kedua pemanggil", () => {
    expect(pageAuth).toContain("export async function requireSetupDone(");
    // `gateAfterCompany` ikut memakainya, bukan menyimpan salinannya sendiri.
    expect(pageAuthCode).toContain("await requireSetupDone(");
    expect(pageAuthCode.match(/isSetupDone\(\)/g)?.length ?? 0).toBe(1);
  });
});

describe("dan pantulannya tidak boleh berputar", () => {
  /*
   * Beranda memantul ke `/setup`. Kalau halaman wisayanya sendiri ikut terkena
   * gerbang yang sama, ia memantul ke dirinya sendiri tanpa henti — persis
   * bentuk kegagalan yang sudah pernah terjadi di repo ini (#343) dan yang
   * paling sulit dibaca dari luar: peramban berputar, log bersih.
   *
   * Yang mencegahnya adalah pengecualian `permission !== "setup.manage"` di
   * `gateAfterCompany`, dan itu hanya berlaku bila halaman wisayanya memang
   * MENDEKLARASIKAN izin itu.
   */
  it("halaman wisaya mendeklarasikan setup.manage — izin yang dikecualikan gerbang", () => {
    expect(setupPage).toContain('requirePagePermission("setup.manage"');
    expect(pageAuthCode).toContain('permission !== "setup.manage"');
  });
});
