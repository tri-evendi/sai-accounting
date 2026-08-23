/**
 * `PATCH /api/tenant/profile` — ganti NAMA TAMPILAN akun (issue #458).
 *
 * ══ YANG BERUBAH, DAN YANG TIDAK ═══════════════════════════════════════════
 * Yang berubah `tenants.name` — nama yang tampil di bilah panel, di surel
 * undangan, dan di layar setiap anggota. Yang TIDAK berubah `tenants.slug`,
 * yaitu segmen `/t/<slug>/…` di setiap alamat buku.
 *
 * Pemisahan itu bukan setengah pekerjaan melainkan urutan yang benar: nama
 * tampilan tidak dipegang siapa pun selain layar, sedangkan slug sudah
 * terlanjur ada di bookmark, di surel undangan yang sudah terkirim, dan di
 * tautan yang dibagikan ke akuntan eksternal. Menggantinya menuntut pengalihan
 * permanen dan pemesanan slug lama — pekerjaan tersendiri (#458 lingkup 3),
 * dan mengerjakannya diam-diam di sini akan mematahkan tautan orang tanpa
 * seorang pun memutuskannya.
 *
 * ══ PENJAGA ════════════════════════════════════════════════════════════════
 * `tenant.settings` (OWNER_ONLY). Izin itu sudah ada sejak matriks tenant
 * ditulis, dan komentarnya memang berbunyi "Mengubah profil tenant (nama,
 * dsb.)" — yang belum ada selama ini adalah jalurnya.
 *
 * Tercatat di jejak audit tenant: nama akun adalah identitas yang dilihat
 * seluruh anggota, jadi perubahannya harus punya pelaku dan waktu.
 */

import { NextResponse } from "next/server";

import { controlDb } from "@/lib/control-db";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import { tenantProfileSchema } from "@/lib/validations/tenant";
import { requireTenantApiPermission } from "@/lib/tenant-guard";
import { writeTenantAuditLog } from "@/lib/tenant-audit";
import { invalidateTenantState } from "@/lib/tenant-state";

export async function PATCH(request: Request) {
  const { dictionary, t } = await getRequestI18n();

  const auth = await requireTenantApiPermission("tenant.settings");
  if (!auth.authorized) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = tenantProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
      { status: 400 }
    );
  }

  const sebelum = auth.tenant.tenantName;
  const sesudah = parsed.data.name;
  if (sebelum === sesudah) return NextResponse.json({ ok: true, name: sesudah });

  await controlDb.tenant.update({
    where: { id: auth.tenant.tenantId },
    data: { name: sesudah },
  });

  /* Nama akun ikut ke keadaan tenant yang di-cache (bilah panel membacanya);
     tanpa ini layar tetap menampilkan nama lama sampai cache-nya kedaluwarsa
     sendiri — dan pengguna akan mengira simpanannya gagal. */
  invalidateTenantState();

  await writeTenantAuditLog({
    tenantId: auth.tenant.tenantId,
    tenantSlug: auth.tenant.tenantSlug,
    userId: auth.session.user.id,
    username: auth.session.user.name ?? auth.session.user.email ?? undefined,
    tenantRole: auth.tenant.role,
    action: "tenant.profile.rename",
    /* Nama LAMA ikut dicatat: "diganti menjadi X" tanpa "dari Y" tidak bisa
       dibaca sebagai riwayat, hanya sebagai keadaan sekarang. */
    details: { from: sebelum, to: sesudah },
    request,
  });

  return NextResponse.json({ ok: true, name: sesudah });
}
