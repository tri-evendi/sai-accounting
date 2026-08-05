/**
 * Laporan Kas & Bank — saldo awal, perubahan, dan saldo akhir tiap akun kas &
 * bank pada satu periode (katalog: `cash-bank`).
 *
 * ── Kenapa halaman sendiri, bukan `/finance` ─────────────────────────────────
 * Kartu katalog ini dulu menunjuk halaman modul keuangan. Halaman itu tempat
 * MENCATAT kas masuk & keluar: daftar transaksinya terpaginasi dan disaring per
 * jenis/mata uang. Laporan ini menjawab pertanyaan lain — bukan "transaksi apa
 * saja", melainkan "tiap rekening bergerak dari berapa ke berapa".
 *
 * ── Pembaca yang sama dengan Arus Kas ────────────────────────────────────────
 * Angkanya datang dari `getCashFlow`, bukan penghitungan kedua. Itu disengaja:
 * "perubahan" di laporan ini adalah arus kas bersih di laporan sebelah, dan dua
 * penghitung yang berselisih akan membuat dua laporan pada satu periode
 * menyebut angka berbeda untuk hal yang sama.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { getCashFlow } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoneyCell } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { PeriodFilter } from "../report-filters";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import { reportById, resolvePeriod } from "@/lib/report-catalog";
import { cashBankPayload } from "@/lib/report-payload";
import { cashBankColumns, type CashBankColumnId } from "@/lib/statement-layout";
import { formatDate } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function CashBankReportPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ from?: string; to?: string; cols?: string }>;
}) {
  // Izin KAS, bukan `report.read`: isinya mutasi rekening, dan sebuah laporan
  // tidak melonggarkan siapa yang boleh melihat datanya.
  await requirePagePermission("cash.read", params);
  const t = await getT();
  const sp = await searchParams;
  const { from, to, fromISO, toISO } = resolvePeriod(sp.from, sp.to);

  const cf = await getCashFlow(from, to);
  const definition = reportById("cash-bank");
  const payload = definition
    ? cashBankPayload(definition, from, to, cf, sp.cols)
    : null;

  // Katalog adalah sumber daftar kolomnya; tanpa definisinya laporan ini tidak
  // punya bentuk yang disepakati layar & berkas, jadi tak ada yang dirender.
  if (!payload || payload.kind !== "cash-bank") return null;

  const cols = cashBankColumns(payload);
  const HEADERS: Record<CashBankColumnId, string> = {
    account: t("reports.perCashAccountTitle"),
    opening: t("reports.colOpeningBalance"),
    net: t("reports.colChange"),
    closing: t("reports.colClosingBalance"),
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("reports.breadcrumb"), href: "/reports" },
          { label: t("reports.catalogReport.cash_bank.title") },
        ]}
        title={t("reports.catalogReport.cash_bank.title")}
        description={t("reports.periodWithCurrency", {
          from: formatDate(from),
          to: formatDate(to),
        })}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            <StatementExcelButton payload={payload} />
          </>
        }
      />

      <PeriodFilter basePath="/reports/cash-bank" from={fromISO} to={toISO} />

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {cols.map((c) => (
                <TableHead key={c} className={c === "account" ? undefined : "text-right"}>
                  {HEADERS[c]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {payload.rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={cols.length}
                  className="py-10 text-center text-muted-foreground"
                >
                  {t("reports.noCashMovement")}
                </TableCell>
              </TableRow>
            ) : (
              payload.rows.map((r) => (
                <TableRow key={r.code}>
                  {cols.map((c) =>
                    c === "account" ? (
                      <TableCell key={c} className="text-foreground">
                        <span className="mr-2 font-mono text-muted-foreground">{r.code}</span>
                        {r.name}
                      </TableCell>
                    ) : (
                      <TableCell key={c} className="p-0">
                        <MoneyCell
                          className={c === "closing" ? "font-medium" : undefined}
                          value={r[c]}
                          currency="IDR"
                        />
                      </TableCell>
                    )
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
          {payload.rows.length > 0 && (
            <TableFooter className="border-t-2 bg-transparent">
              <TableRow className="border-b-0 font-bold hover:bg-transparent">
                {cols.map((c) =>
                  c === "account" ? (
                    <TableCell key={c} className="text-foreground">
                      {t("common.total")}
                    </TableCell>
                  ) : (
                    <TableCell key={c} className="p-0">
                      <MoneyCell
                        className="font-bold"
                        value={
                          c === "opening"
                            ? payload.openingCash
                            : c === "net"
                              ? payload.netChange
                              : payload.closingCash
                        }
                        currency="IDR"
                      />
                    </TableCell>
                  )
                )}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </Card>
    </div>
  );
}
