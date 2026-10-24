import "server-only";

/**
 * Nama mitra yang DIKETIK di tenant (`tenants.referred_by_partner`, migration
 * kendali 0013) beserta jumlah tenantnya — HANYA untuk konsol `/landing/media`,
 * sebagai pengingat saat menyusun daftar mitra resmi di halaman publik.
 *
 * Teks bebas, jadi ejaannya bisa berbeda-beda; yang dipajang ke publik tetap
 * yang diketik operator di daftar mitra resmi, tidak pernah dari sini. Tidak
 * ada data tenant yang keluar dari konsol.
 *
 * Basis data kendali tak terjangkau = `null` (panelnya bilang begitu).
 */
import { controlDb } from "@sai/core/control-db";

export async function partnerReferralCounts(): Promise<{ name: string; tenants: number }[] | null> {
  try {
    const rows = await controlDb.tenant.groupBy({
      by: ["referredByPartner"],
      where: { referredByPartner: { not: null } },
      _count: { _all: true },
    });
    return rows
      .filter((r) => r.referredByPartner && r.referredByPartner.trim().length > 0)
      .map((r) => ({ name: (r.referredByPartner as string).trim(), tenants: r._count._all }))
      .sort((a, b) => b.tenants - a.tenants || a.name.localeCompare(b.name));
  } catch (error) {
    console.error("[partner-referrals] basis data kendali tak terbaca:", error);
    return null;
  }
}
