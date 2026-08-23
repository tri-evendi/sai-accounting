/**
 * `PATCH /api/tenant/slug` — ganti ALAMAT akun (issue #458 lingkup 3).
 *
 * Tetangganya `PATCH /api/tenant/profile` mengganti NAMA TAMPILAN dan sengaja
 * tidak menyentuh slug; route ini yang menyentuhnya, dan karena itu ia berdiri
 * sendiri: dua tindakan dengan akibat yang sangat berbeda tidak boleh berbagi
 * satu endpoint yang bisa keliru dipanggil.
 *
 * Seluruh aturannya (bentuk, slug terlarang, jeda 30 hari, pemesanan slug
 * lama) hidup di `lib/tenant-slug.ts` — dipakai route ini MAUPUN skrip operator
 * untuk akun lama (lingkup 4). Satu penulis, satu daftar pagar.
 *
 * ⚠ Jawabannya memuat alamat BARU, dan pemanggilnya wajib memindahkan
 * penggunanya ke sana: sesudah slug berganti, halaman yang sedang dibuka
 * pemanggil berdiri di alamat yang kini usang. Ia tidak rusak — jalur masuk
 * memantulkannya permanen — tetapi membiarkan orang di alamat lama sesudah ia
 * sendiri yang menggantinya adalah kebingungan yang tidak perlu.
 */

import { NextResponse } from "next/server";

import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import { tenantSlugSchema } from "@/lib/validations/tenant";
import { renameTenantSlug, type PenolakanSlug } from "@/lib/tenant-slug";
import { requireTenantApiPermission } from "@/lib/tenant-guard";
import { writeTenantAuditLog } from "@/lib/tenant-audit";
import { invalidateTenantState } from "@/lib/tenant-state";

/** Penolakan → kunci kamus. Peta eksplisit: kunci rakitan tidak diperiksa `tsc`. */
const PESAN: Record<PenolakanSlug | "tidak-ada", Parameters<Awaited<ReturnType<typeof getRequestI18n>>["t"]>[0]> = {
  bentuk: "validation.slugInvalid",
  terlarang: "tenantSlug.forbidden",
  sama: "tenantSlug.same",
  dipakai: "tenantSlug.taken",
  "terlalu-sering": "tenantSlug.tooSoon",
  "tidak-ada": "tenantSlug.taken",
};

export async function PATCH(request: Request) {
  const { dictionary, t } = await getRequestI18n();

  const auth = await requireTenantApiPermission("tenant.settings");
  if (!auth.authorized) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = tenantSlugSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
      { status: 400 }
    );
  }

  const hasil = await renameTenantSlug({
    tenantId: auth.tenant.tenantId,
    slugBaru: parsed.data.slug,
  });

  if (!hasil.ok) {
    /*
     * 409, bukan 400: bentuknya sah, keadaannyalah yang menolak (sudah
     * dipakai, atau baru saja diganti). Bedanya menentukan bagi yang membaca
     * jawabannya — 400 berarti "perbaiki ketikannya", 409 berarti "coba lagi
     * nanti atau pilih yang lain".
     */
    const status = hasil.reason === "bentuk" ? 400 : 409;
    return NextResponse.json({ error: t(PESAN[hasil.reason]) }, { status });
  }

  invalidateTenantState();

  await writeTenantAuditLog({
    tenantId: auth.tenant.tenantId,
    /* Slug LAMA sebagai berkas jejaknya: seluruh riwayat akun ini sudah tertulis
       di sana, dan memindahkannya ke berkas baru akan memutus riwayat itu tepat
       di peristiwa yang paling perlu bisa ditelusuri. */
    tenantSlug: hasil.slugLama,
    userId: auth.session.user.id,
    username: auth.session.user.name ?? auth.session.user.email ?? undefined,
    tenantRole: auth.tenant.role,
    action: "tenant.slug.change",
    details: { from: hasil.slugLama, to: hasil.slugBaru },
    request,
  });

  return NextResponse.json({ ok: true, slug: hasil.slugBaru });
}
