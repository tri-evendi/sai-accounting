/**
 * Data CONTOH — melihat sisanya, dan membuangnya sekaligus.
 *
 * GET    → berapa yang masih ada (dipakai kartu di Pengaturan).
 * DELETE → buang semuanya, beserta jurnalnya.
 *
 * ══ KENAPA ROUTE INI ADA ═══════════════════════════════════════════════════
 * Sejak buku perusahaan BARU ikut diisi contoh, setiap pelanggan memulai
 * pembukuannya dengan pendapatan yang bukan miliknya. Awalan `[CONTOH]`
 * menandai BARISNYA — tetapi laporan menampilkan ANGKA, bukan baris, dan di
 * Laba/Rugi tidak ada satu pun tanda bahwa angka itu karangan. "Boleh dihapus"
 * tanpa route ini berarti ~23 dokumen dihapus satu per satu lewat layar yang
 * berbeda-beda, dengan urutan yang harus ditebak sendiri; yang ditawarkan
 * sebagai kemudahan berubah jadi pekerjaan rumah, dan datanya menetap.
 *
 * ══ `sample.clear`, BUKAN MENUMPANG `invoice.delete` ═══════════════════════
 * Satu penekanan menghapus belasan dokumen sekaligus. Menumpang izin dokumen
 * mana pun akan menjawab pertanyaan yang salah ("boleh hapus faktur?") untuk
 * tindakan yang cakupannya jauh lebih luas. Izinnya sendiri berakses penuh —
 * lihat alasannya di matriks (`lib/authz.ts`).
 *
 * ══ PERIODE TERTUTUP DIJAWAB APA ADANYA ════════════════════════════════════
 * Pembalikan jurnal lewat `assertPeriodOpen` (issue #13). Kalau data contohnya
 * jatuh di bulan yang sudah ditutup, penghapusan DITOLAK seluruhnya — dan itu
 * benar: membuka kembali periode yang sudah dikunci adalah keputusan
 * pembukuan, bukan efek samping tombol bersih-bersih. Jawabannya 422 dengan
 * kalimat aslinya, pola yang sama dengan route dokumen.
 */
import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/auth-guard";
import { clearSampleData, sampleDataSummary } from "@/lib/demo-seed";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  const result = await requireApiPermission("sample.clear");
  if (!result.authorized) return result.response;

  return NextResponse.json(await sampleDataSummary());
}

export async function DELETE(request: Request) {
  const result = await requireApiPermission("sample.clear");
  if (!result.authorized) return result.response;

  try {
    const { removed, keptPartners } = await clearSampleData();

    /*
     * Diaudit meski yang dibuang "hanya" data contoh: sesudahnya buku ini
     * kehilangan belasan dokumen sekaligus, dan orang berikutnya yang bertanya
     * "faktur contohnya ke mana" harus menemukan jawabannya di jejak audit —
     * bukan menyimpulkan bukunya pernah dibobol.
     */
    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.name,
      action: "sample_data.clear",
      entity: "sample_data",
      details: { removed, keptPartners },
      request,
    });

    return NextResponse.json({ ok: true, removed, keptPartners });
  } catch (e) {
    // Periode tertutup / aturan posting → 422 berkalimat, bukan 500 buram.
    return handlePostingError(e);
  }
}
