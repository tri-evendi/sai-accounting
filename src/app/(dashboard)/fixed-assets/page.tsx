/**
 * Aset Tetap — register + depreciation run (issue #28).
 *
 * The register lists every asset with its running book value (nilai buku), the
 * number the Neraca reflects. Depreciation is posted monthly through the run
 * control (D: Beban Penyusutan / K: Akumulasi Penyusutan); disposal and location
 * moves live on each asset's detail page.
 */
import { Link } from "@/components/ui/app-link";
import { requirePagePermission } from "@/lib/page-auth";
import { getFixedAssets, summarizeFixedAssets, getCategories } from "@/lib/fixed-assets";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoneyCell } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { Boxes, Info, MapPin, Plus, Tags } from "lucide-react";
import { RunDepreciation } from "./run-depreciation";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function FixedAssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requirePagePermission("fixed_asset.read");
  const t = await getT();
  const sp = await searchParams;
  const status = sp.status === "active" || sp.status === "disposed" ? sp.status : undefined;

  // Satu ambilan tanpa saring untuk ringkasan; tabelnya disaring di memori —
  // dulu register + join kategorinya dibaca DUA KALI per permintaan.
  const [allRows, categories] = await Promise.all([getFixedAssets({}), getCategories()]);
  const rows = status ? allRows.filter((r) => r.status === status) : allRows;
  const summary = summarizeFixedAssets(allRows);
  const hasCategories = categories.length > 0;

  return (
    <div>
      <PageHeader
        title={t("fixedAssets.title")}
        description={t("fixedAssets.descriptionBefore")}
        actions={
          <>
            <Link href="/fixed-assets/by-location">
              <Button variant="secondary" className="cursor-pointer">
                <MapPin className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t("fixedAssets.byLocation")}
              </Button>
            </Link>
            <Link href="/fixed-assets/categories">
              <Button variant="secondary" className="cursor-pointer">
                <Tags className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t("fixedAssets.categories")}
              </Button>
            </Link>
            <Link href="/fixed-assets/new">
              <Button className="cursor-pointer">
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t("fixedAssets.addNew")}
              </Button>
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t("fixedAssets.activeCount")}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{summary.activeCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t("fixedAssets.cost")}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {formatCurrency(summary.cost, "IDR")}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t("fixedAssets.accumulated")}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {formatCurrency(summary.accumulated, "IDR")}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t("fixedAssets.bookValue")}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {formatCurrency(summary.book, "IDR")}
          </p>
        </Card>
      </div>

      {hasCategories && <RunDepreciation />}

      <div className="my-6 flex flex-wrap gap-2">
        {[
          { key: "all", label: t("fixedAssets.filterAll"), href: "/fixed-assets", active: !status },
          {
            key: "active",
            label: t("fixedAssets.filterActive"),
            href: "/fixed-assets?status=active",
            active: status === "active",
          },
          {
            key: "disposed",
            label: t("fixedAssets.filterDisposed"),
            href: "/fixed-assets?status=disposed",
            active: status === "disposed",
          },
        ].map((f) => (
          <Link
            key={f.key}
            href={f.href}
            className={`rounded-md border px-3 py-2 text-sm transition-colors duration-200 cursor-pointer ${
              f.active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-muted"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {!hasCategories ? (
        <EmptyState
          icon={<Tags className="h-12 w-12" />}
          title={t("fixedAssets.noCategoryTitle")}
          description={t("fixedAssets.noCategoryDescription")}
          actionLabel={t("fixedAssets.createCategory")}
          actionHref="/fixed-assets/categories"
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-12 w-12" />}
          title={t("fixedAssets.emptyTitle")}
          description={t("fixedAssets.emptyDescription")}
          actionLabel={t("fixedAssets.addNew")}
          actionHref="/fixed-assets/new"
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("fixedAssets.colNumber")}</TableHead>
                <TableHead>{t("fixedAssets.colName")}</TableHead>
                <TableHead>{t("fixedAssets.colCategory")}</TableHead>
                <TableHead>{t("fixedAssets.colLocation")}</TableHead>
                <TableHead>{t("fixedAssets.colAcquired")}</TableHead>
                <TableHead className="text-right">{t("fixedAssets.colCost")}</TableHead>
                <TableHead className="text-right">{t("fixedAssets.colAccumulated")}</TableHead>
                <TableHead className="text-right">{t("fixedAssets.colBookValue")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-foreground">
                    <Link
                      href={`/fixed-assets/${r.id}`}
                      className="cursor-pointer text-primary transition-colors hover:underline"
                    >
                      {r.assetNo}
                    </Link>
                  </TableCell>
                  <TableCell className="text-foreground">{r.name}</TableCell>
                  <TableCell className="text-foreground">{r.categoryName}</TableCell>
                  <TableCell className="text-muted-foreground">{r.location ?? "—"}</TableCell>
                  <TableCell className="text-foreground">{formatDateShort(r.acquisitionDate)}</TableCell>
                  <TableCell className="p-0">
                    <MoneyCell value={r.acquisitionCost} currency="IDR" />
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell value={r.accumulatedDepreciation} currency="IDR" />
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell className="font-medium" value={r.bookValue} currency="IDR" />
                  </TableCell>
                  <TableCell>
                    {r.status === "disposed" ? (
                      <Badge variant="default">{t("fixedAssets.statusDisposed")}</Badge>
                    ) : r.isFullyDepreciated ? (
                      <Badge variant="warning">{t("fixedAssets.statusFullyDepreciated")}</Badge>
                    ) : (
                      <Badge variant="success">{t("common.active")}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <p className="mt-6 flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {t("fixedAssets.footnoteBefore")} <strong>{t("fixedAssets.footnoteEntry")}</strong>
          {t("fixedAssets.footnoteAfter")}
        </span>
      </p>
    </div>
  );
}
