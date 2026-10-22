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
import { getT } from "@sai/platform/i18n/server";
import { UNASSIGNED_COST_CENTER, costCenterDisplayName } from "@/lib/cost-centers";

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
        ? costCenterDisplayName(c.code, c.name)
        : `${costCenterDisplayName(c.code, c.name)} (${t("common.inactive")})`,
    })),
  ];
}

/**
 * Nama yang ditampilkan untuk penyaring yang sedang aktif, untuk judul & ekspor.
 *
 * ── DI LUAR PERMINTAAN HTTP (#702, jebakan 4) ──────────────────────────────
 * Sampai 22 Okt 2026 fungsi ini SELALU memanggil `getT()` lebih dulu — dan
 * `getT()` membaca cookie bahasa lewat `cookies()`, yang MELEMPAR di luar
 * permintaan. Akibatnya ekspor Laba Rugi bersaring pusat biaya yang dirakit
 * pekerja antrean (`report.export`) GAGAL, apa pun pusat biayanya.
 *
 * `unassignedLabel` memutus ketergantungan itu: pemanggil yang merakit DOKUMEN
 * CETAK (`buildReportPayload`) menyerahkan `COST_CENTER_UNASSIGNED_PRINT_LABEL`
 * — bahasa dokumen cetak (id), sama dengan yang dicetak pelari Go — dan kamus
 * tidak disentuh sama sekali. Tanpa argumen itu perilakunya tetap seperti
 * dulu: halaman memakai bahasa penggunanya. `getT()` kini hanya dipanggil bila
 * memang dibutuhkan (penyaring "belum ditetapkan" tanpa label cetak).
 */
export async function costCenterFilterLabel(
  raw: string | null | undefined,
  client = prisma,
  unassignedLabel?: string
): Promise<string | null> {
  if (!raw) return null;
  if (raw === UNASSIGNED_COST_CENTER) {
    if (unassignedLabel !== undefined) return unassignedLabel;
    const t = await getT();
    return t("costCenters.filterUnassigned");
  }
  const id = Number.parseInt(raw, 10);
  if (!/^\d+$/.test(raw.trim()) || !(id > 0)) return null;
  const costCenter = await client.costCenter.findUnique({ where: { id } });
  return costCenter ? costCenterDisplayName(costCenter.code, costCenter.name) : null;
}
