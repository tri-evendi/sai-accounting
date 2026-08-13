/**
 * Payload cetak satu laporan, dihitung dari parameter — TANPA membuka halamannya.
 *
 * READ-ONLY: tidak menulis apa pun ke buku besar. Inilah yang membuat dialog
 * parameter di Pusat Laporan bisa mengunduh langsung: ia meminta payload untuk
 * `?id=` + parameternya, lalu memberikannya ke jalur cetak yang SUDAH ADA —
 * `generateStatementPDF` di peramban, atau POST ke `/api/reports/export` untuk
 * lembar sebar. Tidak ada pipa ekspor kedua yang bisa menyimpang dari yang
 * pertama; yang ditambahkan hanya cara mendapatkan payload-nya.
 *
 * Berizin `report.export` (bukan `report.read`): satu-satunya pemakainya adalah
 * tombol unduh, dan payload mentah seluruh buku besar adalah persis isi berkas
 * yang akan dihasilkannya.
 */
import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { canEffective } from "@/lib/authz-effective";
import { isExportable, reportById } from "@/lib/report-catalog";
import { buildReportPayload } from "@/lib/report-payload";
import { getRequestI18n } from "@/lib/i18n/server";

export async function GET(request: Request) {
  const authz = await requireApiPermission("report.export");
  if (!authz.authorized) return authz.response;

  const params = new URL(request.url).searchParams;
  const report = reportById(params.get("id") ?? "");

  // Laporan yang tidak dikenal DAN laporan yang memang belum punya payload
  // cetak menjawab sama: 404. Membedakannya hanya memberi tahu penebak isi
  // katalog, dan bagi pemanggil keduanya sama saja — tak ada berkas di sini.
  if (!report || !isExportable(report)) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.notFound") }, { status: 404 });
  }

  /*
   * Gerbang KEDUA: izin milik laporannya sendiri (issue #355).
   *
   * `report.export` hanya menjawab "boleh mengekspor laporan", bukan "boleh
   * mengekspor laporan INI". Tanpa baris di bawah, sebuah GET yang dirakit
   * tangan bisa menarik Nilai Persediaan dari perusahaan yang modul Stoknya
   * dimatikan — halaman layarnya tertutup, berkasnya tidak. Menyembunyikan
   * kartunya di Pusat Laporan tanpa menutup ini hanya memindahkan pintunya.
   *
   * `canEffective` memeriksa modul lebih dulu, jadi satu panggilan menutup
   * modul-mati maupun peran-tak-berhak. Jawabannya 404 yang sama dengan di
   * atas: pemanggil yang tidak berhak tidak perlu tahu laporan itu ada.
   */
  if (!(await canEffective(authz.session.user, report.permission))) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.notFound") }, { status: 404 });
  }

  const payload = await buildReportPayload(report, {
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    asOf: params.get("asOf") ?? undefined,
    year: params.get("year") ?? undefined,
    month: params.get("month") ?? undefined,
    costCenter: params.get("costCenter") ?? undefined,
    cols: params.get("cols") ?? undefined,
  });

  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
