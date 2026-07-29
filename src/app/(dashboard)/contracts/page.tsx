import Link from "next/link";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { ChartCard } from "@/components/dashboard/chart-card";
import {
  ContractStatusChart,
  MonthlyActivityChart,
} from "@/components/shared/dashboard-charts";
import { chartPeriodStart, monthlyActivitySeries } from "@/lib/chart-data";
import { canEffective } from "@/lib/authz-effective";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateShort, parsePageParam } from "@/lib/utils";
import { Pagination } from "@/components/ui/pagination";
import { FileText } from "lucide-react";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { contractStatusLabels, statusFilterLabels } from "@/lib/i18n/labels";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; page?: string }>;
}) {
  const session = await requirePagePermission("contract.read");
  const t = await getT();
  const dictionary = await getDictionary(await getLocale());
  const statusLabels = statusFilterLabels(dictionary);
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const perPage = 10;
  const where: Record<string, unknown> = {};

  if (params.status && params.status !== "all") {
    where.status = params.status;
  }

  if (params.search) {
    where.OR = [
      { contractNo: { contains: params.search } },
      { buyer: { contains: params.search } },
      { consignee: { contains: params.search } },
      { consigneeRef: { name: { contains: params.search } } },
    ];
  }

  /*
   * Grafik (dipindah dari Beranda).
   *
   * "Aktivitas bulanan" menghitung kontrak DAN tagihan, dua izin yang berbeda.
   * Halaman ini hanya menjamin `contract.read`, jadi barisnya tidak diambil
   * dan grafiknya tidak dirender untuk pengguna yang tak boleh membaca
   * tagihan — bukan diambil lalu hasilnya dibuang. Matriks efektif yang
   * ditanya (`canEffective`), bukan asumsi "core pasti boleh".
   */
  const canViewInvoices = await canEffective(session.user, "invoice.read");
  // Satu `now` untuk batas kueri DAN pelabelan ember, supaya keduanya tidak
  // bisa jatuh di sisi tengah malam yang berbeda.
  const now = new Date();
  const chartFrom = chartPeriodStart(now);

  const [contracts, totalCount, statusCounts, recentContracts, recentInvoices] = await Promise.all([
    prisma.contract.findMany({
      where,
      orderBy: { date: "desc" },
      include: { items: true, payments: true, consigneeRef: true },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.contract.count({ where }),
    // Donat status menghitung SELURUH kontrak, bukan halaman/saringan yang
    // sedang aktif: menyaring `status=pending` lalu menggambar donatnya
    // hanya akan menghasilkan satu irisan 100%.
    prisma.contract.groupBy({ by: ["status"], _count: { _all: true } }),
    // Deret kontrak ikut TIDAK diambil kalau grafiknya memang tidak dirender.
    canViewInvoices
      ? prisma.contract.findMany({
          where: { createdAt: { gte: chartFrom } },
          select: { createdAt: true },
        })
      : Promise.resolve([]),
    canViewInvoices
      ? prisma.invoice.findMany({
          where: { createdAt: { gte: chartFrom } },
          select: { createdAt: true },
        })
      : Promise.resolve([]),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  const countByStatus = new Map(statusCounts.map((s) => [s.status, s._count._all]));
  const contractStatusLabel = contractStatusLabels(dictionary);
  // Urutan sah → menunggu → dibatalkan MENENTUKAN warna irisannya
  // (hijau/kuning/merah dipasangkan per POSISI di `ContractStatusChart`).
  const contractStatusData = [
    { name: contractStatusLabel.signed, value: countByStatus.get("signed") ?? 0 },
    { name: contractStatusLabel.pending, value: countByStatus.get("pending") ?? 0 },
    { name: contractStatusLabel.canceled, value: countByStatus.get("canceled") ?? 0 },
  ];
  const monthlyData = monthlyActivitySeries(recentContracts, recentInvoices, now);

  return (
    <div>
      <PageHeader
        className="mb-1"
        title={<TermTooltip term="kontrak">{t("contracts.title", { count: totalCount })}</TermTooltip>}
        actions={
          <Link href="/contracts/new" className="shrink-0">
            <Button>{t("contracts.addNew")}</Button>
          </Link>
        }
      />
      <LearnMore term="kontrak" className="mt-1 mb-6" label={t("contracts.learnMoreList")} />

      {/* Filters — hrefs membawa `search` yang sedang aktif agar berganti tab
          tidak diam-diam membuang kata kunci pencarian. `page` sengaja TIDAK
          dibawa: saringan baru = kembali ke halaman 1. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {["all", "signed", "pending", "canceled"].map((status) => {
          const query = new URLSearchParams();
          if (status !== "all") query.set("status", status);
          if (params.search) query.set("search", params.search);
          const qs = query.toString();
          return (
            <Link key={status} href={`/contracts${qs ? `?${qs}` : ""}`}>
              <Button
                variant={params.status === status || (!params.status && status === "all") ? "primary" : "secondary"}
                size="sm"
              >
                {statusLabels[status] ?? status}
              </Button>
            </Link>
          );
        })}
      </div>

      {/* Search — GET form; `status` ikut sebagai hidden input supaya mencari
          tidak mereset tab status yang sedang aktif. */}
      <form className="mb-4">
        {params.status && <input type="hidden" name="status" value={params.status} />}
        <TextInput
          type="text"
          name="search"
          placeholder={t("contracts.searchPlaceholder")}
          defaultValue={params.search}
          className="w-full max-w-md"
        />
        <Button type="submit" className="ml-2">
          {t("common.search")}
        </Button>
      </form>

      {/* Grafik: sebaran status + tren bulanan, di bawah saringan & sebelum
          daftarnya — konteks dulu, baru barisnya. */}
      <div
        className={`mb-6 grid gap-6 ${canViewInvoices ? "lg:grid-cols-2" : "grid-cols-1"}`}
      >
        <ChartCard
          title={t("dashboard.chartContractStatusTitle")}
          description={t("dashboard.chartContractStatusDesc")}
        >
          <ContractStatusChart data={contractStatusData} />
        </ChartCard>
        {canViewInvoices && (
          <ChartCard
            title={t("dashboard.chartMonthlyTitle")}
            description={t("dashboard.chartMonthlyDesc")}
          >
            <MonthlyActivityChart data={monthlyData} />
          </ChartCard>
        )}
      </div>

      {/* Table */}
      <Card>
        <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("contracts.colNo")}</TableHead>
                <TableHead>{t("common.date")}</TableHead>
                <TableHead>{t("contracts.colBuyer")}</TableHead>
                <TableHead>
                  <TermTooltip term="penerima_barang">{t("contracts.colConsignee")}</TermTooltip>
                </TableHead>
                <TableHead className="text-right">{t("contracts.colItemCount")}</TableHead>
                <TableHead>{t("common.currency")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState icon={<FileText className="h-12 w-12" />} title={t("contracts.emptyTitle")} description={t("contracts.emptyDescription")} actionLabel={t("contracts.addNew")} actionHref="/contracts/new" />
                  </TableCell>
                </TableRow>
              ) : (
                contracts.map((contract) => (
                  <TableRow key={contract.id}>
                    <TableCell>
                      <Link href={`/contracts/${contract.id}`} className="cursor-pointer font-medium text-primary hover:underline">
                        {contract.contractNo}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{formatDateShort(contract.date)}</TableCell>
                    <TableCell className="text-foreground">{contract.buyer}</TableCell>
                    <TableCell className="text-muted-foreground">{contract.consigneeRef?.name || contract.consignee || "-"}</TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">{contract.items.length}</TableCell>
                    <TableCell className="text-muted-foreground">{contract.currency}</TableCell>
                    <TableCell><StatusBadge status={contract.status} /></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
        </Table>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/contracts" searchParams={params} />
      </Card>
    </div>
  );
}
