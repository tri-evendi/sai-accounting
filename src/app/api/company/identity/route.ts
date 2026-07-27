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

import { getCompanyIdentity } from "@/lib/company-identity";

export async function GET() {
  const identity = await getCompanyIdentity();
  return NextResponse.json(identity);
}
