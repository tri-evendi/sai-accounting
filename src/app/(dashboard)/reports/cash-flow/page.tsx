import { requirePagePermission } from "@/lib/page-auth";
import { getCashFlow } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money, MoneyCell } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { PeriodFilter } from "../report-filters";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import { PlainSummary } from "@/components/reports/plain-summary";
import { resolvePeriod } from "@/lib/report-catalog";
import { cashFlowSummary } from "@/lib/report-summary";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowDownLeft, ArrowUpRight, AlertTriangle, Minus } from "lucide-react";
import type { CashFlowGroup } from "@/lib/reports";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";

export const dynamic = "force-dynamic";

/**
 * Money with an explicit direction. Colour alone never carries the meaning — an
 * arrow icon and a +/− sign say the same thing, per the design system's
 * "jangan pernah mengandalkan warna saja".
 *
 * Sengaja BUKAN `Money`/`MoneyCell` (issue #52): pewarnaan di sini mengikuti
 * arah kas (masuk hijau / keluar merah, pasangan `*-strong`) dan selalu
 * disertai ikon panah + tanda +/−, sedangkan `Money` hanya mewarnai nilai
 * negatif. Nol pun tampil sebagai ikon "–" berlabel "Nihil", bukan "Rp 0".
 */
function Flow({ amount }: { amount: number }) {
  if (Math.round(amount * 100) === 0) {
    return (
      <span className="inline-flex items-center justify-end gap-1 text-muted-foreground tabular-nums">
        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">Nihil</span>
      </span>
    );
  }
  const inflow = amount > 0;
  const Icon = inflow ? ArrowDownLeft : ArrowUpRight;
  return (
    <span
      className={`inline-flex items-center justify-end gap-1 tabular-nums ${
        inflow ? "text-success-strong" : "text-destructive-strong"
      }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">{inflow ? "Kas masuk" : "Kas keluar"}</span>
      <span>
        {inflow ? "+" : "−"}
        {formatCurrency(Math.abs(amount), "IDR")}
      </span>
    </span>
  );
}

function Section({ group }: { group: CashFlowGroup }) {
  const unknown = group.category === "uncategorised";
  return (
    <>
      <TableRow
        className={unknown ? "bg-warning-soft hover:bg-warning-soft" : "bg-muted hover:bg-muted"}
      >
        <TableCell className="py-2 font-semibold text-foreground" colSpan={3}>
          <span className="inline-flex items-center gap-2">
            {group.label}
            {unknown && (
              <Badge variant="warning">
                <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
                Perlu ditinjau
              </Badge>
            )}
          </span>
          {unknown && (
            <p className="mt-1 text-xs font-normal text-warning-strong">
              Kas ini bergerak lewat akun yang jenisnya belum dipetakan ke operasi, investasi
              atau pendanaan. Angkanya tetap dihitung dalam total, tapi perlu dirapikan di
              Daftar Akun.
            </p>
          )}
        </TableCell>
      </TableRow>

      {group.lines.map((l) => (
        <TableRow key={l.code}>
          <TableCell className="py-2 pl-10 text-muted-foreground">
            <span className="mr-2 font-mono text-muted-foreground">{l.code}</span>
            {l.name}
          </TableCell>
          {/* Nol tampil "—" (bukan "Rp 0"), jadi selnya tetap dirender sendiri
              dengan `Money` di dalamnya. */}
          <TableCell className="py-2 text-right tabular-nums text-muted-foreground">
            {l.inflow > 0 ? <Money value={l.inflow} currency="IDR" /> : "—"}
          </TableCell>
          <TableCell className="py-2 text-right tabular-nums text-muted-foreground">
            {l.outflow > 0 ? <Money value={l.outflow} currency="IDR" /> : "—"}
          </TableCell>
        </TableRow>
      ))}

      {group.lines.length === 0 && (
        <TableRow className="hover:bg-transparent">
          <TableCell className="py-2 pl-10 text-muted-foreground" colSpan={3}>
            Tidak ada pergerakan kas pada periode ini.
          </TableCell>
        </TableRow>
      )}

      <TableRow className="font-medium">
        <TableCell className="py-2 text-foreground">Jumlah {group.label}</TableCell>
        <TableCell className="py-2 text-right" colSpan={2}>
          <Flow amount={group.net} />
        </TableCell>
      </TableRow>
    </>
  );
}

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePagePermission("report.read");
  const sp = await searchParams;
  const { from, to, fromISO, toISO } = resolvePeriod(sp.from, sp.to);
  const cf = await getCashFlow(from, to);
  const periodLabel = `Periode ${formatDate(from)} – ${formatDate(to)}`;

  const payload: StatementPayload = {
    kind: "cash-flow",
    period: periodLabel,
    groups: cf.groups.map((g) => ({
      label: g.label,
      lines: g.lines.map((l) => ({
        code: l.code,
        name: l.name,
        inflow: l.inflow,
        outflow: l.outflow,
        net: l.net,
      })),
      inflow: g.inflow,
      outflow: g.outflow,
      net: g.net,
    })),
    totalInflow: cf.totalInflow,
    totalOutflow: cf.totalOutflow,
    netChange: cf.netChange,
    openingCash: cf.openingCash,
    closingCash: cf.closingCash,
    reconciled: cf.reconciled,
    suspectUnrated: cf.suspectUnrated,
  };
  const summary = cashFlowSummary(cf, periodLabel);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Pusat Laporan", href: "/reports" }, { label: "Arus Kas" }]}
        title="Arus Kas"
        description={<>{periodLabel} · nilai dalam IDR</>}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            <StatementExcelButton payload={payload} />
          </>
        }
      />

      <PeriodFilter basePath="/reports/cash-flow" from={fromISO} to={toISO} />

      <PlainSummary summary={summary} />

      {cf.suspectUnrated > 0 && (
        <Card className="mb-4 border-warning/30 bg-warning-soft">
          <div className="flex gap-3 px-6 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-sm text-warning-strong">
              <span className="font-medium">{cf.suspectUnrated} baris jurnal</span> bermata uang
              asing tercatat dengan kurs 1, sehingga nilai rupiahnya kemungkinan belum
              dikonversi. Angka di bawah tetap mengikuti buku besar — perbaiki kursnya di jurnal
              terkait agar laporan akurat.
            </p>
          </div>
        </Card>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="px-6 py-4">
            <p className="text-sm text-muted-foreground">Kas awal periode</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
              {formatCurrency(cf.openingCash, "IDR")}
            </p>
          </div>
        </Card>
        <Card>
          <div className="px-6 py-4">
            <p className="text-sm text-muted-foreground">Perubahan kas</p>
            <p className="mt-1 text-xl font-semibold">
              <Flow amount={cf.netChange} />
            </p>
          </div>
        </Card>
        <Card>
          <div className="px-6 py-4">
            <p className="text-sm text-muted-foreground">Kas akhir periode</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
              {formatCurrency(cf.closingCash, "IDR")}
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Sumber / Penggunaan Kas</TableHead>
              <TableHead className="text-right">Kas Masuk</TableHead>
              <TableHead className="text-right">Kas Keluar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* An empty "Belum Terkategori" section is noise; a non-empty one is the
                whole point of the bucket, so it is always shown when it has rows. */}
            {cf.groups
              .filter((g) => g.category !== "uncategorised" || g.lines.length > 0)
              .map((g) => (
                <Section key={g.category} group={g} />
              ))}
          </TableBody>
          <TableFooter className="border-t-2 bg-transparent">
            <TableRow className="text-base font-bold hover:bg-transparent">
              <TableCell className="py-4 text-foreground">
                Kenaikan / Penurunan Kas
                <span className="ml-2 align-middle">
                  {cf.reconciled ? (
                    <Badge variant="success">Cocok dengan Buku Besar</Badge>
                  ) : (
                    <Badge variant="danger">Tidak cocok</Badge>
                  )}
                </span>
              </TableCell>
              <TableCell className="p-0">
                <MoneyCell className="py-4 text-foreground" value={cf.totalInflow} currency="IDR" />
              </TableCell>
              <TableCell className="p-0">
                <MoneyCell className="py-4 text-foreground" value={cf.totalOutflow} currency="IDR" />
              </TableCell>
            </TableRow>
            <TableRow className="border-b-0 text-base font-bold hover:bg-transparent">
              <TableCell className="text-foreground" colSpan={2}>
                Perubahan Kas Bersih
              </TableCell>
              <TableCell className="text-right">
                <Flow amount={cf.netChange} />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>

      {cf.cashAccounts.length > 0 && (
        <Card className="mt-6">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-semibold text-foreground">Rincian per Akun Kas &amp; Bank</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Saldo awal dan akhir tiap akun kas. Selisihnya harus sama dengan perubahan kas di
              atas — itulah yang dicek oleh lencana &ldquo;Cocok dengan Buku Besar&rdquo;.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Akun</TableHead>
                <TableHead className="text-right">Saldo Awal</TableHead>
                <TableHead className="text-right">Perubahan</TableHead>
                <TableHead className="text-right">Saldo Akhir</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cf.cashAccounts.map((a) => (
                <TableRow key={a.code}>
                  <TableCell className="py-2.5">
                    <span className="mr-2 font-mono text-muted-foreground">{a.code}</span>
                    {a.name}
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell className="py-2.5" value={a.opening} currency="IDR" />
                  </TableCell>
                  <TableCell className="py-2.5 text-right">
                    <Flow amount={a.net} />
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell className="py-2.5" value={a.closing} currency="IDR" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
