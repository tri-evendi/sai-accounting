import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";
import { NewBomForm } from "./bom-form";

export const dynamic = "force-dynamic";

/**
 * Resep Produksi Baru — cangkang server.
 *
 * Barang & stasiun kerja dibaca DI SINI, bukan dijemput formulir lewat `fetch`:
 * keduanya daftar kecil yang tidak berubah selama formulir terbuka, dan
 * membacanya di server berarti pemilihnya sudah terisi pada gambar pertama.
 */
export default async function NewBomPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("bill_of_material.write", params);
  const t = await getT();

  const [items, workCenters] = await Promise.all([
    prisma.item.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, unit: true },
    }),
    prisma.workCenter.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("boms.breadcrumb"), href: "/boms" },
          { label: t("boms.createTitle") },
        ]}
        title={t("boms.createTitle")}
      />
      <NewBomForm items={items} workCenters={workCenters} />
    </div>
  );
}
