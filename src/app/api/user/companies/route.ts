import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { companiesForUser } from "@/lib/company-registry";
import { getRequestI18n } from "@/lib/i18n/server";

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

  return NextResponse.json({
    activeId: session.user.companyId ?? null,
    companies: companies.map((c) => ({ id: c.companyId, name: c.name, slug: c.slug })),
  });
}
