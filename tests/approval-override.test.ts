/**
 * Kuasa lintas-peran pada keputusan persetujuan.
 *
 * Aturan normalnya sempit dan disengaja: pengajuan hanya bisa diputuskan oleh
 * peran yang TERTULIS padanya (`approverRole`, disalin saat pengajuan dibuat).
 * Itu menyatakan *kepada siapa* dokumen dieskalasikan — bukan sekadar siapa
 * yang berwenang — sehingga sengaja lebih sempit daripada matriks izin.
 *
 * Pengecualiannya diminta pemilik sistem: peran berakses penuh boleh
 * memutuskan pengajuan mana pun, supaya pengajuan tidak menggantung selamanya
 * ketika penyetuju yang dituju sedang tidak ada.
 *
 * Yang dijaga berkas ini ada tiga, dan ketiganya mudah rusak diam-diam:
 *
 *  1. **Pengecualiannya benar-benar berlaku** — administrator bisa memutuskan
 *     pengajuan yang ditujukan ke peran lain.
 *  2. **Pengecualiannya tidak melebar.** Peran biasa TETAP ditolak. Kalau
 *     penjaganya suatu saat ditulis ulang jadi "boleh kalau punya izin
 *     approval.decide", seluruh maknanya hilang — dan tidak ada yang gagal
 *     kecuali tes ini.
 *  3. **Pemakaiannya terbaca di jejak audit.** Setelah pemisahan tugas
 *     ditukar dengan kelangsungan proses, jejak audit adalah kendali yang
 *     tersisa. Kuasa boleh dipakai; tidak boleh tak terlihat.
 */
import { describe, expect, it } from "vitest";

import { FULL_ACCESS_ROLES, ROLES, isFullAccessRole } from "@/lib/constants";

/**
 * Cermin dari penjaga di `src/app/api/approvals/[id]/route.ts`.
 * Route-nya menyentuh Prisma + sesi, jadi yang diuji di sini keputusannya —
 * satu ekspresi yang menentukan boleh/tidak, plus nilai yang masuk ke audit.
 */
function decide(actorRole: string, approverRole: string) {
  const isOverride = actorRole !== approverRole;
  const allowed = !isOverride || isFullAccessRole(actorRole);
  return {
    allowed,
    auditOverrodeApproverRole: allowed && isOverride ? approverRole : null,
  };
}

describe("keputusan persetujuan — jalur normal", () => {
  it("peran yang dituju boleh memutuskan", () => {
    const r = decide(ROLES.FINANCE_MANAGER, ROLES.FINANCE_MANAGER);
    expect(r.allowed).toBe(true);
  });

  it("keputusan normal TIDAK dicatat sebagai kuasa lintas-peran", () => {
    // Kalau ini bocor jadi non-null, setiap keputusan biasa akan terlihat
    // seperti penimpaan dan jejak auditnya kehilangan arti.
    const r = decide(ROLES.FINANCE_MANAGER, ROLES.FINANCE_MANAGER);
    expect(r.auditOverrodeApproverRole).toBeNull();
  });
});

describe("kuasa lintas-peran hanya milik peran berakses penuh", () => {
  it("administrator boleh memutuskan pengajuan yang ditujukan ke Direktur Utama", () => {
    const r = decide(ROLES.ADMINISTRATOR, ROLES.MANAGING_DIRECTOR);
    expect(r.allowed).toBe(true);
  });

  it("Direktur Utama boleh memutuskan pengajuan yang ditujukan ke Manajer Keuangan", () => {
    // Keduanya berakses penuh dan memang dirancang SETARA. Kalau kuasa ini
    // hanya diberikan ke administrator, administrator jadi lebih berkuasa
    // daripada Direktur Utama — bertentangan dengan rancangannya.
    const r = decide(ROLES.MANAGING_DIRECTOR, ROLES.FINANCE_MANAGER);
    expect(r.allowed).toBe(true);
  });

  it("kedua peran berakses penuh memperoleh kuasa yang sama persis", () => {
    for (const role of FULL_ACCESS_ROLES) {
      expect(decide(role, ROLES.WAREHOUSE_HEAD).allowed).toBe(true);
    }
  });

  it("peran biasa TETAP ditolak — pengecualiannya tidak melebar", () => {
    expect(decide(ROLES.FINANCE_MANAGER, ROLES.MANAGING_DIRECTOR).allowed).toBe(false);
    expect(decide(ROLES.WAREHOUSE_HEAD, ROLES.FINANCE_MANAGER).allowed).toBe(false);
  });

  it("peran tak dikenal ditolak (tolak-secara-bawaan)", () => {
    expect(decide("bos", ROLES.MANAGING_DIRECTOR).allowed).toBe(false);
    expect(decide("admin", ROLES.MANAGING_DIRECTOR).allowed).toBe(false);
  });
});

describe("pemakaian kuasa terbaca di jejak audit", () => {
  it("mencatat peran tujuan yang ditimpa", () => {
    const r = decide(ROLES.ADMINISTRATOR, ROLES.MANAGING_DIRECTOR);
    expect(r.auditOverrodeApproverRole).toBe(ROLES.MANAGING_DIRECTOR);
  });

  it("keputusan yang DITOLAK tidak mencatat apa pun", () => {
    const r = decide(ROLES.WAREHOUSE_HEAD, ROLES.MANAGING_DIRECTOR);
    expect(r.allowed).toBe(false);
    expect(r.auditOverrodeApproverRole).toBeNull();
  });
});
