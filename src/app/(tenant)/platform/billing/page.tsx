/**
 * `/platform/billing` — langganan, paket berjalan, dan riwayat tagihan.
 * Penjaganya `tenant.billing` (OWNER, kontraktual — bukan peran di sebuah PT).
 *
 * ══ PENJAGA DI BARIS PERTAMA, BUKAN CABANG RENDER ══════════════════════════
 * Sampai audit rute, isi ini adalah `{canSeeBilling && <SubscriptionSection/>}`
 * di tengah halaman pendaratan, dan janji "data langganan tidak pernah DIBACA
 * untuk yang tak berhak" dijaga oleh letak `await` di dalam cabang itu — benar,
 * tapi rapuh: satu pemindahan baris ke luar cabang membuat query berjalan untuk
 * semua orang tanpa satu pun tes berbunyi (halamannya tetap terlihat sama).
 *
 * Sebagai rute tersendiri janji itu menjadi struktural: `member` tidak pernah
 * sampai ke berkas ini, sebab penjaga di baris pertama sudah memantulkannya.
 * Query di bawahnya karena itu tidak perlu bersyarat sama sekali.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { billingOverviewForTenant } from "@/lib/subscription-store";
import { getT } from "@/lib/i18n/server";
import { requireTenantPagePermission } from "@/lib/tenant-guard";

import { SubscriptionSection } from "../subscription-section";

export const dynamic = "force-dynamic";

export default async function PlatformBillingPage() {
  const { tenant } = await requireTenantPagePermission("tenant.billing");
  const t = await getT();

  const overview = await billingOverviewForTenant(tenant.tenantId);

  return (
    <>
      <PageHeader
        title={t("tenantSettings.title")}
        description={t("tenantSettings.description")}
        breadcrumbs={[
          { label: t("platform.title"), href: "/platform" },
          { label: t("tenantSettings.title") },
        ]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/platform/billing/plans">
              {t("platform.plansViewLabel")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        }
      />

      <div className="space-y-6">
        <SubscriptionSection overview={overview} />

        {/* Jalan keluar dari halaman ini menuju pertanyaan yang paling sering
            menyusul setelah membaca tagihan: "kalau saya butuh lebih?" —
            dijawab di katalog, bukan di sini, sebab jawabannya adalah
            perbandingan, bukan satu angka. */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-foreground">
              {t("platform.plansUpgradeHeading")}
            </h2>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-relaxed text-muted-foreground sm:flex-1">
              {t("platform.plansDescription")}
            </p>
            <Button asChild className="w-full shrink-0 sm:w-auto">
              <Link href="/platform/billing/plans">
                {t("platform.plansViewLabel")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
