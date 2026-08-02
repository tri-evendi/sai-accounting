import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/components/ui/app-link";
import {
  BookText,
  TrendingUp,
  Scale,
  Waves,
  Target,
  HandCoins,
  Wallet,
  Users,
  Truck,
  Package,
  PackageOpen,
  Landmark,
  FileSpreadsheet,
  FileBarChart,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { reportsByCategory, type ReportDefinition } from "@/lib/report-catalog";
import { PageHeader } from "@/components/ui/page-header";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import type { Dictionary } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

/** lucide icon names referenced by the catalogue → components (keeps the catalogue pure). */
const ICONS: Record<string, LucideIcon> = {
  BookText,
  TrendingUp,
  Scale,
  Waves,
  Target,
  HandCoins,
  Wallet,
  Users,
  Truck,
  Package,
  PackageOpen,
  Landmark,
  FileSpreadsheet,
};

/**
 * Judul & penjelasan laporan hidup di kamus, dikunci dari `id` katalog
 * ("trial-balance" → "trial_balance"). Katalog di `lib/report-catalog.ts` tetap
 * pemilik struktur, status, dan href-nya; bila suatu id belum ada di kamus,
 * teks bahasa Indonesia dari katalog yang dipakai.
 */
function catalogText(
  dictionary: Dictionary,
  id: string
): { title: string; description: string } | undefined {
  const entries = dictionary.reports.catalogReport;
  return entries[id.replace(/-/g, "_") as keyof typeof entries];
}

function ReportCard({
  report,
  dictionary,
  t,
}: {
  report: ReportDefinition;
  dictionary: Dictionary;
  t: (key: "reports.comingSoon" | "reports.openReport") => string;
}) {
  const Icon = ICONS[report.icon] ?? FileBarChart;
  const soon = report.status === "coming_soon";
  const text = catalogText(dictionary, report.id);

  const inner = (
    <Card
      className={
        soon
          ? "h-full border-dashed bg-muted"
          : "h-full cursor-pointer transition-shadow hover:shadow-md"
      }
    >
      <div className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <Icon
            className={soon ? "h-6 w-6 text-muted-foreground" : "h-6 w-6 text-primary"}
            aria-hidden="true"
          />
          {soon && <Badge variant="default">{t("reports.comingSoon")}</Badge>}
        </div>
        <h3 className={`mt-3 font-semibold ${soon ? "text-muted-foreground" : "text-foreground"}`}>
          {text?.title ?? report.title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{text?.description ?? report.description}</p>
        {!soon && (
          <span className="mt-auto pt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
            {t("reports.openReport")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
    </Card>
  );

  if (soon || !report.href) return inner;
  return (
    <Link href={report.href} className="block h-full">
      {inner}
    </Link>
  );
}

export default async function ReportsPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("report.read", params);
  const t = await getT();
  const dictionary = await getDictionary(await getLocale());
  const groups = reportsByCategory();
  const categoryText = dictionary.reports.catalogCategory;

  return (
    <div>
      <div data-tour="pusat-laporan">
        <PageHeader
          className="mb-8"
          title={t("reports.title")}
          description={t("reports.description")}
        />
      </div>

      <div className="space-y-10">
        {groups.map((group, groupIndex) => (
          <section
            key={group.category}
            data-tour={groupIndex === 0 ? "laporan-kategori-pertama" : undefined}
          >
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-foreground">
                {categoryText[group.category]?.label ?? group.label}
              </h2>
              <p className="text-sm text-muted-foreground">
                {categoryText[group.category]?.description ?? group.description}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.reports.map((r) => (
                <ReportCard key={r.id} report={r} dictionary={dictionary} t={t} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
