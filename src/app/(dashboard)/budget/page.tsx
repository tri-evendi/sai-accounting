/**
 * Anggaran & Target — hub (issue #29). Three surfaces: input anggaran per akun,
 * input target penjualan, and the Realisasi vs Anggaran report. bos-only, like
 * the other planning/reporting surfaces.
 */
import { requirePagePermission } from "@/lib/page-auth";
import { Card } from "@/components/ui/card";
import { ClipboardList, Target, GaugeCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Link } from "@/components/ui/app-link";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function BudgetHubPage() {
  await requirePagePermission("budget.manage");
  const t = await getT();

  const surfaces = [
    {
      href: "/budget/report",
      icon: GaugeCircle,
      title: t("budget.surfaceReportTitle"),
      desc: t("budget.surfaceReportDesc"),
    },
    {
      href: "/budget/accounts",
      icon: ClipboardList,
      title: t("budget.surfaceAccountsTitle"),
      desc: t("budget.surfaceAccountsDesc"),
    },
    {
      href: "/budget/targets",
      icon: Target,
      title: t("budget.surfaceTargetsTitle"),
      desc: t("budget.surfaceTargetsDesc"),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("budget.title")}
        description={t("budget.description")}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {surfaces.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <div className="p-5">
                <s.icon className="h-6 w-6 text-primary" aria-hidden="true" />
                <h2 className="mt-3 font-semibold text-foreground">{s.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
