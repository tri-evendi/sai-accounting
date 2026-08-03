import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { companiesForUser } from "@/lib/company-registry";
import { companyScopeFromRequest } from "@/lib/company-request";
import { getRequestI18n } from "@/lib/i18n/server";
import { tenantMembershipForUser } from "@/lib/tenant-directory";
import { tenantCan } from "@/lib/tenant-authz";

/**
 * Perusahaan yang boleh dibuka PENGGUNA YANG SEDANG MASUK (issue #104).
 *
 * Self-scoped, seperti `user/permissions` dan `user/accountant-mode`: ia hanya
 * pernah menjawab tentang pemanggilnya sendiri — `userId` diambil dari sesi dan
 * tidak pernah dari permintaan, jadi tidak ada cara menanyakan milik orang lain.
 *
 * SENGAJA TIDAK memakai `requireApiPermission`. Penjaga itu menuntut konteks
 * perusahaan, sedangkan route ini justru dipanggil ketika perusahaan BELUM
 * dipilih — memakainya di sini akan membuat pemilih perusahaan mustahil
 * dipakai, persis pada satu-satunya saat ia dibutuhkan.
 *
 * Yang dikembalikan hanya nama, slug, dan id — tidak ada nama basis data, tidak
 * ada apa pun tentang isinya.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.sessionExpired") }, { status: 401 });
  }

  const companies = await companiesForUser(Number.parseInt(session.user.id, 10));

  /*
   * "Yang sedang dibuka" menurut PERMINTAAN lebih dulu, sesi belakangan
   * (issue #158).
   *
   * Penukar perusahaan hidup di navbar SETIAP tab. Menandai yang aktif dari
   * cookie berarti tab yang membuka PT A menyorot PT B beberapa saat setelah
   * tab sebelah berpindah — tanda centang yang berbohong tentang buku mana yang
   * sedang dilihat. Slugnya dicocokkan ke daftar keanggotaan yang baru dibaca,
   * jadi header karangan tidak bisa menyorot apa pun yang bukan milik pemanggil.
   *
   * Sesi tetap menjadi jawaban CADANGAN, dan hanya di situ: `/select-company`
   * dan `/dashboard` telanjang memang tidak punya perusahaan di alamatnya, dan
   * "yang terakhir dibuka" adalah persis yang ingin mereka tampilkan.
   */
  const scope = await companyScopeFromRequest();
  const fromRequest = scope
    ? (companies.find((c) => c.slug === scope.companySlug)?.companyId ?? null)
    : null;

  /*
   * Boleh membuka /tenant? Dijawab DI SINI, bukan ditebak klien.
   *
   * Halaman akun tenant (langganan, tagihan, undangan staf, ekspor data)
   * menuntut `tenant.settings` — OWNER saja. Sampai perbaikan ini, satu-satunya
   * tautan menujunya ada di /select-company, layar yang pengguna BER-PT-SATU
   * tidak pernah lihat karena perusahaannya dipilihkan otomatis: halaman tempat
   * pelanggan mengurus langganan dan mengunduh datanya praktis tak terlihat.
   *
   * Peran TENANT tidak ada di sesi (sesi hanya membawa peran DI PERUSAHAAN),
   * jadi ia dibaca di sini — di permintaan yang memang sudah dilakukan menu
   * saat dibuka, bukan permintaan tambahan. Menu yang menampilkan tautan yang
   * memantul sama buruknya dengan tidak ada tautan sama sekali.
   */
  const tenantMembership = await tenantMembershipForUser(
    Number.parseInt(session.user.id, 10)
  );

  return NextResponse.json({
    activeId: fromRequest ?? session.user.companyId ?? null,
    companies: companies.map((c) => ({ id: c.companyId, name: c.name, slug: c.slug })),
    canManageTenant: tenantCan(tenantMembership, "tenant.settings"),
  });
}
