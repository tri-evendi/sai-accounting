import { requirePageSession } from "@/lib/page-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
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

function ReportCard({ report }: { report: ReportDefinition }) {
  const Icon = ICONS[report.icon] ?? FileBarChart;
  const soon = report.status === "coming_soon";

  const inner = (
    <Card
      className={
        soon
          ? "h-full border-dashed bg-gray-50"
          : "h-full cursor-pointer transition-shadow hover:shadow-md"
      }
    >
      <div className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <Icon
            className={soon ? "h-6 w-6 text-gray-400" : "h-6 w-6 text-blue-600"}
            aria-hidden="true"
          />
          {soon && <Badge variant="default">Segera hadir</Badge>}
        </div>
        <h3 className={`mt-3 font-semibold ${soon ? "text-gray-500" : "text-gray-900"}`}>
          {report.title}
        </h3>
        <p className="mt-1 text-sm text-gray-500">{report.description}</p>
        {!soon && (
          <span className="mt-auto pt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600">
            Buka laporan <ArrowRight className="h-4 w-4" aria-hidden="true" />
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

export default async function ReportsPage() {
  await requirePageSession(["bos"]);
  const groups = reportsByCategory();

  return (
    <div>
      <div className="mb-8" data-tour="pusat-laporan">
        <h1 className="text-2xl font-bold text-gray-900">Pusat Laporan</h1>
        <p className="mt-1 text-sm text-gray-500">
          Semua laporan dalam satu tempat, dikelompokkan per kategori. Pilih laporan, atur
          periode, lalu ekspor ke PDF atau Excel. Nilai dalam IDR (nilai dasar buku besar).
        </p>
      </div>

      <div className="space-y-10">
        {groups.map((group, groupIndex) => (
          <section
            key={group.category}
            data-tour={groupIndex === 0 ? "laporan-kategori-pertama" : undefined}
          >
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-gray-900">{group.label}</h2>
              <p className="text-sm text-gray-500">{group.description}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.reports.map((r) => (
                <ReportCard key={r.id} report={r} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
