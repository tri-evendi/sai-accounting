/**
 * Token API — pembungkus server (issue #389, F-10).
 *
 * Daftar PERAN dibaca di server dari tabel `roles` PT ini, bukan dari daftar
 * yang ditulis di kode: peran kustom adalah DATA milik satu perusahaan
 * (issue #73), jadi daftar apa pun yang diketik di sini akan salah untuk
 * perusahaan berikutnya. Route penerbitnya memvalidasi ulang ke tabel yang
 * sama — pemilih di layar adalah kenyamanan, bukan penjaga.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { getActiveRoles } from "@/lib/roles";
import { controlDb } from "@/lib/control-db";
import { currentCompanyId } from "@/lib/current-company";

import { ApiTokensClient } from "./api-tokens-client";

export const dynamic = "force-dynamic";

export default async function ApiTokensPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("user.manage", params);

  /*
   * Daftarnya dibaca DI SERVER, bukan diambil ulang dari peramban saat mount.
   *
   * Bukan sekadar mengikuti doktrin RSC repo ini: sebuah `useEffect` yang
   * memanggil `setState` pada mount adalah render berjenjang yang ditolak lint
   * (`react-hooks/set-state-in-effect`), DAN ia menghasilkan layar yang berkedip
   * dari "memuat…" ke isinya pada setiap kunjungan — untuk data yang sudah
   * tersedia di server sebelum satu byte HTML pun terkirim.
   *
   * `token_hash` SENGAJA tidak diambil: daftar yang memuat hash memberi
   * penyerang bahan menebak di luar jangkauan pembatas laju kita.
   */
  const [roles, tokens] = await Promise.all([
    getActiveRoles(),
    currentCompanyId().then((companyId) =>
      controlDb.apiToken.findMany({
        where: { companyId },
        orderBy: [{ revokedAt: "asc" }, { id: "desc" }],
        select: {
          id: true,
          name: true,
          role: true,
          lastUsedAt: true,
          revokedAt: true,
          createdBy: { select: { name: true, email: true } },
        },
      })
    ),
  ]);

  return (
    <ApiTokensClient
      roles={roles.map((r) => ({ value: r.key, label: r.label || r.key }))}
      tokens={tokens.map((r) => ({
        id: r.id,
        name: r.name,
        role: r.role,
        lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
        revokedAt: r.revokedAt?.toISOString() ?? null,
        createdBy: r.createdBy.name ?? r.createdBy.email ?? "—",
      }))}
    />
  );
}
