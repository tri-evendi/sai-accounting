/**
 * create-admin boleh melampaui kuota `max_users` dengan SADAR (#159 temuan 2):
 * ia skrip operator, dan operator kadang memang harus melewati batas (akun
 * darurat, masa peralihan). Yang dikunci tes ini adalah dua sifatnya:
 *   • kelebihan kuota TIDAK senyap — ada peringatan dengan aturan kursi yang
 *     sama dengan alur undangan (pengguna hidup + undangan menunggu);
 *   • peringatan TIDAK berubah menjadi blokir — akunnya tetap dibuat.
 * Dibuktikan dari SUMBER skripnya (pola tests/invitations.test.ts): refactor
 * yang menghapus peringatan atau menjadikannya `process.exit` langsung merah
 * tanpa membangun basis data di unit test.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("scripts/create-admin.ts — kuota max_users diperingatkan, tidak diblokir", () => {
  const src = readFileSync(join(__dirname, "..", "scripts", "create-admin.ts"), "utf8");

  it("memakai aturan kursi yang SAMA dengan alur undangan (userQuotaExceeded)", () => {
    expect(src).toContain("userQuotaExceeded(");
    // Undangan yang masih menunggu ikut dihitung sebagai kursi terpakai.
    expect(src).toContain("pendingInvitations");
  });

  it("kelebihan kuota berbunyi lewat console.warn", () => {
    expect(src).toMatch(/if \(willExceedQuota\) \{\s*\n\s*console\.warn\(/);
    expect(src).toContain("MELEBIHI KUOTA");
  });

  it("peringatannya BUKAN blokir: blok kuota tidak memanggil process.exit", () => {
    const start = src.indexOf("if (willExceedQuota) {");
    const end = src.indexOf("await controlDb.$disconnect", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(src.slice(start, end)).not.toContain("process.exit");
  });

  it("kuota dihitung SETELAH jalur 'akun sudah ada' berhenti — keanggotaan baru untuk orang lama tidak memakan kursi", () => {
    // Jalur existing return lebih dulu; penghitungan kursi hanya menyentuh
    // pembuatan AKUN BARU.
    const idxExistingReturn = src.indexOf("Kata sandi: TIDAK diubah");
    const idxQuota = src.indexOf("userQuotaExceeded(");
    expect(idxExistingReturn).toBeGreaterThan(-1);
    expect(idxQuota).toBeGreaterThan(idxExistingReturn);
  });
});
