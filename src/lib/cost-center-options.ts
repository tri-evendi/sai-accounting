/**
 * Pilihan pemilih pusat biaya untuk penyaring laporan (issue #91).
 *
 * MODUL SERVER (membaca Prisma + kamus lewat `@/lib/i18n/server`). Dipakai
 * halaman Laba/Rugi dan buku besar; komponen penyaringnya menerima hasilnya
 * sebagai props biasa, jadi tak ada komponen client yang menyentuh modul
 * `server-only` (penjaga `tests/server-only-boundary.test.ts`).
 *
 * ── TIGA HAL YANG DIPUTUSKAN DI SINI ────────────────────────────────────────
 * 1. "Semua pusat biaya" bernilai KOSONG, dan itu berbeda dari "Belum
 *    ditetapkan" (`unassigned`). Keduanya harus bisa dipilih terpisah, kalau
 *    tidak angka yang belum bertag tak akan pernah bisa dilihat sendiri — dan
 *    janji rekonsiliasi (Σ semua + belum ditetapkan = total) tak bisa
 *    dibuktikan oleh pengguna di layar.
 * 2. Pusat biaya NONAKTIF tetap ditawarkan, ditandai "(Nonaktif)". Laporan
 *    membaca SEJARAH: cabang yang ditutup tahun lalu tetap punya laba/rugi
 *    tahun lalu, dan menyembunyikannya dari penyaring akan membuat angkanya
 *    tak terjangkau padahal masih ada di buku.
 * 3. Urut kode, sama seperti setiap pemilih master lain di app ini.
 */
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/i18n/server";
import { UNASSIGNED_COST_CENTER } from "@/lib/cost-centers";

export interface CostCenterOption {
  value: string;
  label: string;
}

export async function costCenterFilterOptions(client = prisma): Promise<CostCenterOption[]> {
  const t = await getT();
  const costCenters = await client.costCenter.findMany({ orderBy: { code: "asc" } });

  return [
    { value: "", label: t("costCenters.filterAll") },
    { value: UNASSIGNED_COST_CENTER, label: t("costCenters.filterUnassigned") },
    ...costCenters.map((c) => ({
      value: String(c.id),
      label: c.isActive
        ? `${c.code} — ${c.name}`
        : `${c.code} — ${c.name} (${t("common.inactive")})`,
    })),
  ];
}

/** Nama yang ditampilkan untuk penyaring yang sedang aktif, untuk judul & ekspor. */
export async function costCenterFilterLabel(
  raw: string | null | undefined,
  client = prisma
): Promise<string | null> {
  if (!raw) return null;
  const t = await getT();
  if (raw === UNASSIGNED_COST_CENTER) return t("costCenters.filterUnassigned");
  const id = Number.parseInt(raw, 10);
  if (!/^\d+$/.test(raw.trim()) || !(id > 0)) return null;
  const costCenter = await client.costCenter.findUnique({ where: { id } });
  return costCenter ? `${costCenter.code} — ${costCenter.name}` : null;
}
