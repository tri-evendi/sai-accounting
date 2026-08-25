import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { listClosedPeriods } from "@/lib/period";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { getT } from "@/lib/i18n/server";
import { NewContractForm } from "./contract-form";

export const dynamic = "force-dynamic";

/**
 * Jarak di bawah tautan "Pelajari ini". Berkas ini server component, jadi
 * `antd` (dan `theme.useToken()`) tidak tersedia — nilainya sama dengan
 * `marginLG` AntD, ditulis di satu tempat supaya #203 bisa menukarnya.
 */
const LEARN_MORE_GAP = 24;

/**
 * Buat Kontrak — server shell (issue #4/#6).
 *
 * Dipecah mengikuti pola `/invoices/new` dan `/delivery-orders/new`: halaman ini
 * membaca bulan-bulan yang sudah ditutup di server, formulir kliennya yang
 * memakai daftar itu untuk menolak tanggal di periode terkunci SEBELUM dikirim.
 * Penjaganya tetap `assertPeriodOpen` di dalam transaksi penulisan — daftar ini
 * hanya memindahkan kabar buruknya lebih awal.
 */
export default async function NewContractPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("contract.write", params);
  const t = await getT();

  const [closedPeriods, items] = await Promise.all([
    listClosedPeriods(),
    /* Barang AKTIF saja (#104): yang dinonaktifkan tidak ditawarkan untuk
       kontrak BARU, tetapi kontrak lama yang menyebutnya tetap terbaca. */
    prisma.item.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, unit: true },
    }),
  ]);

  return (
    <div>
      {/* `w-full` dilepas: `<div>` blok memang sudah selebar induknya, dan
          `PageHeader` sendiri sudah membawa jarak bawahnya lewat token
          (`marginLG`) — `mb-1` lama tak pernah berlaku karena gaya sebaris
          primitifnya selalu menang atas kelas. */}
      <PageHeader
        breadcrumbs={[
          { label: t("contracts.breadcrumb"), href: "/contracts" },
          { label: t("contracts.createTitle") },
        ]}
        title={<TermTooltip term="kontrak">{t("contracts.createTitle")}</TermTooltip>}
        description={t("contracts.createDescription")}
      />
      <div style={{ marginBottom: LEARN_MORE_GAP }}>
        <LearnMore term="kontrak" label={t("contracts.learnMoreNew")} />
      </div>
      <NewContractForm closedPeriods={closedPeriods} itemOptions={items} />
    </div>
  );
}
