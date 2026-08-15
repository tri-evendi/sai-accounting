/**
 * Token API — daftar & penerbitan (issue #389, F-10).
 *
 * ══ KENAPA `user.manage` ═══════════════════════════════════════════════════
 * Menerbitkan token berarti menerbitkan KREDENSIAL yang membuka buku sebuah PT
 * sebagai sebuah peran. Izin yang sepadan adalah izin yang sudah boleh
 * melakukan hal setara — dan itu `user.manage`: pemegangnya sudah bisa
 * mengundang staf dengan peran APA PUN yang aktif di PT itu
 * (`api/tenant/invitations`), termasuk peran berakses penuh.
 *
 * Jadi tidak ada batas eskalasi BARU yang dibuka di sini; yang ada hanyalah
 * bentuk kedua dari kemampuan yang sudah dimiliki. Memilih izin yang lebih
 * longgar akan membuka batas baru diam-diam; memilih yang lebih ketat akan
 * membuat token mustahil diterbitkan oleh orang yang justru mengurus akses.
 *
 * ══ TOKENNYA HANYA ADA SEKALI ══════════════════════════════════════════════
 * Jawaban POST memuat token utuhnya, dan itu satu-satunya kesempatan
 * membacanya: yang tersimpan hanya SHA-256-nya.
 *
 * ══ TIDAK ADA GET DI SINI, DAN ITU DISENGAJA ═══════════════════════════════
 * Daftar tokennya dibaca HALAMANNYA sendiri, di server. Sebuah endpoint GET
 * yang tidak dipanggil siapa pun adalah permukaan yang tetap harus dijaga,
 * diuji, dan dipikirkan setiap kali izin berubah — tanpa satu pemakai pun yang
 * membenarkan biayanya. Permukaan API yang tak dipakai lebih buruk daripada
 * tidak ada.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { controlDb } from "@/lib/control-db";
import { requireApiPermission } from "@/lib/auth-guard";
import { currentCompanyId } from "@/lib/current-company";
import { activeRoleKeys } from "@/lib/roles";
import { issueToken } from "@/lib/api-token";
import { writeAuditLog } from "@/lib/audit";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  role: z.string().trim().min(1).max(20),
});

export async function POST(request: Request) {
  const result = await requireApiPermission("user.manage");
  if (!result.authorized) return result.response;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    const { dictionary, t } = await getRequestI18n();
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
      { status: 400 }
    );
  }

  /*
   * Peran divalidasi ke tabel `roles` PT INI — sama persis dengan undangan
   * staf. Peran kustom adalah DATA milik satu perusahaan, jadi daftar yang
   * ditulis di kode akan salah untuk perusahaan berikutnya.
   */
  const roleKeys = await activeRoleKeys();
  if (!roleKeys.includes(parsed.data.role)) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.roleUnknownOrInactive") }, { status: 400 });
  }

  const companyId = await currentCompanyId();

  /*
   * Dua langkah, dan urutannya menuntut demikian: id harus ADA di dalam token
   * (supaya pencocokan satu lookup berindeks), dan id baru ada sesudah
   * barisnya lahir. Baris lahir dengan hash SEMENTARA yang tidak cocok dengan
   * apa pun, lalu ditimpa hash sebenarnya.
   *
   * Kalau langkah kedua gagal, yang tertinggal adalah token yang TIDAK BISA
   * DIPAKAI SIAPA PUN — bukan token yang bisa dipakai tanpa diketahui
   * penerbitnya. Arah kegagalannya sengaja begitu.
   */
  const row = await controlDb.apiToken.create({
    data: {
      companyId,
      name: parsed.data.name,
      role: parsed.data.role,
      tokenHash: "-",
      createdByUserId: Number(result.session.user.id),
    },
    select: { id: true },
  });

  const issued = issueToken(row.id);
  await controlDb.apiToken.update({
    where: { id: row.id },
    data: { tokenHash: issued.hash },
  });

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name ?? result.session.user.email ?? result.session.user.id,
    role: result.session.user.role,
    action: "api_token.create",
    entity: "api_token",
    entityId: row.id,
    // Tokennya TIDAK PERNAH masuk jejak audit — jejak dibaca lebih banyak orang
    // daripada yang berhak memakai tokennya.
    details: { name: parsed.data.name, role: parsed.data.role },
    request,
  });

  return NextResponse.json({ id: row.id, token: issued.token }, { status: 201 });
}
