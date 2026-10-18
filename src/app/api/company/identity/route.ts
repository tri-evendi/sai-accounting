/**
 * Identitas perusahaan untuk ditampilkan — nama & alamat saja.
 *
 * SENGAJA TANPA PENJAGA IZIN, dan itu aman: kedua nilai ini memang sudah
 * tercetak di halaman masuk sebelum siapa pun log in, dan di setiap dokumen
 * yang dikirim ke pelanggan. Tidak ada data ledger, tidak ada identitas pajak
 * (NPWP dan kawan-kawannya tetap di `/api/company-settings` yang dijaga
 * `company_setting.manage`).
 *
 * Endpoint ini ada karena komponen client tidak boleh menyentuh Prisma; lihat
 * `@/lib/company-identity-client`. Terdaftar sebagai pengecualian di
 * `tests/authz-coverage.test.ts` dengan alasan yang sama seperti `health`.
 */
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { enterCompanyFromRequest } from "@/lib/company-request";
import { getCompanyIdentity } from "@/lib/company-identity";
import { readCompanyLogoMeta } from "@/lib/company-logo";

/**
 * Perusahaan datang dari PERMINTAAN, dan keanggotaan tetap diverifikasi
 * (issue #158).
 *
 * "Tanpa penjaga izin" bukan berarti "tanpa lingkup". Sampai #158 route ini
 * memungut perusahaannya dari sesi — satu-satunya sumber yang tersedia — jadi
 * kepala surat yang tercetak di faktur adalah kepala surat PT yang terakhir
 * dibuka, di tab mana pun. Kepala surat yang salah pada dokumen resmi bukan
 * cacat tampilan.
 *
 * Permintaan tanpa lingkup (halaman masuk, `/select-company`) dijawab 409, dan
 * kliennya memang sudah menyiapkan nilai cadangan untuk permintaan yang tidak
 * berhasil — jadi kulit halaman masuk tetap utuh tanpa satu pun query ke buku
 * perusahaan mana pun.
 */
export async function GET() {
  const session = await auth();
  const scoped = await enterCompanyFromRequest(session?.user?.id);
  if (!scoped.ok) {
    return NextResponse.json({ error: "Company scope required" }, { status: 409 });
  }

  const [identity, logo] = await Promise.all([
    getCompanyIdentity(),
    // Gagal-lunak: logo yang tak terbaca (mis. buku lama sebelum migration 0002) bukan alasan identitasnya gagal.
    readCompanyLogoMeta().catch((error) => {
      console.error("[company-identity] logo perusahaan tak terbaca:", error);
      return null;
    }),
  ]);
  return NextResponse.json({
    ...identity,
    logo: logo
      ? { version: logo.sha256.slice(0, 16), mimeType: logo.mimeType, width: logo.width, height: logo.height }
      : null,
  });
}
