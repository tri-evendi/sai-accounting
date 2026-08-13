/**
 * Kerangka wisaya penyiapan (#103 → #341 → #352).
 *
 * Keputusan ini sudah berbalik DUA KALI, dan itu sendiri alasan tes ini ada:
 * yang membaca alasan salah satu arah saja akan membaliknya lagi dengan niat
 * baik. Yang dikunci di sini bukan seleranya melainkan tiga hal yang tidak
 * boleh hilang tanpa disadari.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..", "src");
const LAYOUT = join(SRC, "app", "(setup)", "layout.tsx");
const SHELL = join(SRC, "components", "setup", "setup-shell.tsx");

/**
 * KODE-nya saja, tanpa komentar.
 *
 * Kedua berkas ini MENJELASKAN panjang lebar kenapa mereka bukan
 * `PlatformShell` dan bukan sidebar — jadi mereka menyebut nama-nama itu
 * berkali-kali dalam prosa. Menguji teks mentahnya akan menuduh justru
 * penjelasan yang membuat keputusannya bisa dibaca, dan cara termurah membuat
 * tes ini hijau adalah MENGHAPUS penjelasan itu. Tes yang menghukum komentar
 * adalah tes yang mengajari orang menulis kode tanpa komentar.
 */
const kodeSaja = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("wisaya penyiapan memakai kerangka fokus (issue #352)", () => {
  const layout = kodeSaja(readFileSync(LAYOUT, "utf8"));
  const shell = kodeSaja(readFileSync(SHELL, "utf8"));

  it("layout merender `SetupShell`, bukan kulit panel akun", () => {
    expect(layout).toContain("SetupShell");
    /*
     * `PlatformShell` di sini persis keadaan yang #352 balikkan. Kalau ia
     * kembali, itu harus keputusan sadar yang mengubah tes ini — bukan sesuatu
     * yang menyelinap lewat penyeragaman kulit.
     */
    expect(layout).not.toContain("PlatformShell");
  });

  it("kerangkanya TANPA navigasi — itu seluruh gunanya", () => {
    /*
     * Sidebar dasbor di layar ini adalah puluhan pintu yang semuanya memantul:
     * halaman berlingkup perusahaan lewat gerbang setup dan dikembalikan ke
     * wisaya. Menu panel akun tidak memantul, tapi menawarkan pekerjaan lain
     * pada satu-satunya momen ketika pekerjaan lain belum bisa dimulai.
     */
    expect(shell).not.toContain("panelNav");
    expect(shell).not.toContain("Layout.Sider");
    expect(shell).not.toContain("PlatformShell");
  });

  it("jalan KELUAR tetap ada — layar pra-aplikasi tidak boleh jadi jalan buntu", () => {
    /*
     * MASTER.md §"Layar pra-aplikasi wajib punya jalan keluar". Menyempitkan
     * chrome tidak boleh mengunci orang yang salah masuk akun, atau yang perlu
     * membaca layarnya dalam bahasanya sendiri. `UserMenu` komponen yang SAMA
     * dengan bilah atas — satu perilaku, satu tempat memperbaikinya.
     */
    expect(shell).toContain("UserMenu");
    expect(shell).toContain("signOut");
  });

  it("layout tetap SERVER component — kulitnya klien, pohonnya tidak", () => {
    /*
     * Versi lama layout ini memikul `"use client"` dan itu tidak pernah perlu:
     * provider dan kulitnya masing-masing sudah menjadi batas kliennya sendiri.
     * Ambang di `rsc-boundary` naik satu untuk KERANGKA yang kembali; ia tidak
     * boleh naik lagi karena layout ikut menyeberang.
     */
    expect(layout.trimStart().startsWith('"use client"')).toBe(false);
  });
});
