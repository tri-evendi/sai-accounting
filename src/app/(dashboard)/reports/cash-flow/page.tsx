import { requirePageSession } from "@/lib/page-auth";
import { getCashFlow } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PeriodFilter } from "../report-filters";
import { StatementPDFButton } from "@/components/shared/pdf-export-buttons";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowDownLeft, ArrowUpRight, AlertTriangle, Minus } from "lucide-react";
import type { CashFlowGroup } from "@/lib/reports";

export const dynamic = "force-dynamic";

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Money with an explicit direction. Colour alone never carries the meaning — an
 * arrow icon and a +/− sign say the same thing, per the design system's
 * "jangan pernah mengandalkan warna saja".
 */
function Flow({ amount }: { amount: number }) {
  if (Math.round(amount * 100) === 0) {
    return (
      <span className="inline-flex items-center justify-end gap-1 text-gray-400 tabular-nums">
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
        inflow ? "text-green-700" : "text-red-700"
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
      <tr className={unknown ? "bg-amber-50" : "bg-gray-50"}>
        <td className="px-6 py-2 font-semibold text-gray-700" colSpan={3}>
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
            <p className="mt-1 text-xs font-normal text-amber-800">
              Kas ini bergerak lewat akun yang jenisnya belum dipetakan ke operasi, investasi
              atau pendanaan. Angkanya tetap dihitung dalam total, tapi perlu dirapikan di
              Daftar Akun.
            </p>
          )}
        </td>
      </tr>

      {group.lines.map((l) => (
        <tr key={l.code} className="border-b border-gray-100">
          <td className="px-6 py-2 pl-10 text-gray-600">
            <span className="mr-2 font-mono text-gray-400">{l.code}</span>
            {l.name}
          </td>
          <td className="px-6 py-2 text-right tabular-nums text-gray-500">
            {l.inflow > 0 ? formatCurrency(l.inflow, "IDR") : "—"}
          </td>
          <td className="px-6 py-2 text-right tabular-nums text-gray-500">
            {l.outflow > 0 ? formatCurrency(l.outflow, "IDR") : "—"}
          </td>
        </tr>
      ))}

      {group.lines.length === 0 && (
        <tr className="border-b border-gray-100">
          <td className="px-6 py-2 pl-10 text-gray-400" colSpan={3}>
            Tidak ada pergerakan kas pada periode ini.
          </td>
        </tr>
      )}

      <tr className="border-b border-gray-200 font-medium">
        <td className="px-6 py-2 text-gray-700">Jumlah {group.label}</td>
        <td className="px-6 py-2 text-right" colSpan={2}>
          <Flow amount={group.net} />
        </td>
      </tr>
    </>
  );
}

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePageSession(["bos"]);
  const sp = await searchParams;
  const now = new Date();
  const fromStr = sp.from ?? iso(new Date(now.getFullYear(), 0, 1));
  const toStr = sp.to ?? iso(now);
  const from = new Date(`${fromStr}T00:00:00`);
  const to = new Date(`${toStr}T23:59:59.999`);
  const cf = await getCashFlow(from, to);
  const periodLabel = `Periode ${formatDate(from)} – ${formatDate(to)}`;

  return (
    <div>
      <Breadcrumb items={[{ label: "Laporan", href: "/reports" }, { label: "Arus Kas" }]} />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-gray-900">Arus Kas</h1>
          <p className="text-sm text-gray-500">
            {periodLabel} · nilai dalam IDR
          </p>
        </div>
        <StatementPDFButton
          payload={{
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
          }}
        />
      </div>

      <PeriodFilter basePath="/reports/cash-flow" from={fromStr} to={toStr} />

      {cf.suspectUnrated > 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <div className="flex gap-3 px-6 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            <p className="text-sm text-amber-900">
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
            <p className="text-sm text-gray-500">Kas awal periode</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">
              {formatCurrency(cf.openingCash, "IDR")}
            </p>
          </div>
        </Card>
        <Card>
          <div className="px-6 py-4">
            <p className="text-sm text-gray-500">Perubahan kas</p>
            <p className="mt-1 text-xl font-semibold">
              <Flow amount={cf.netChange} />
            </p>
          </div>
        </Card>
        <Card>
          <div className="px-6 py-4">
            <p className="text-sm text-gray-500">Kas akhir periode</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">
              {formatCurrency(cf.closingCash, "IDR")}
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">Sumber / Penggunaan Kas</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500">Kas Masuk</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500">Kas Keluar</th>
              </tr>
            </thead>
            <tbody>
              {/* An empty "Belum Terkategori" section is noise; a non-empty one is the
                  whole point of the bucket, so it is always shown when it has rows. */}
              {cf.groups
                .filter((g) => g.category !== "uncategorised" || g.lines.length > 0)
                .map((g) => (
                  <Section key={g.category} group={g} />
                ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 text-base font-bold">
                <td className="px-6 py-4 text-gray-900">
                  Kenaikan / Penurunan Kas
                  <span className="ml-2 align-middle">
                    {cf.reconciled ? (
                      <Badge variant="success">Cocok dengan Buku Besar</Badge>
                    ) : (
                      <Badge variant="danger">Tidak cocok</Badge>
                    )}
                  </span>
                </td>
                <td className="px-6 py-4 text-right tabular-nums text-gray-700">
                  {formatCurrency(cf.totalInflow, "IDR")}
                </td>
                <td className="px-6 py-4 text-right tabular-nums text-gray-700">
                  {formatCurrency(cf.totalOutflow, "IDR")}
                </td>
              </tr>
              <tr className="border-t border-gray-200 text-base font-bold">
                <td className="px-6 py-3 text-gray-900" colSpan={2}>
                  Perubahan Kas Bersih
                </td>
                <td className="px-6 py-3 text-right">
                  <Flow amount={cf.netChange} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {cf.cashAccounts.length > 0 && (
        <Card className="mt-6">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="font-semibold text-gray-900">Rincian per Akun Kas &amp; Bank</h2>
            <p className="mt-1 text-sm text-gray-500">
              Saldo awal dan akhir tiap akun kas. Selisihnya harus sama dengan perubahan kas di
              atas — itulah yang dicek oleh lencana &ldquo;Cocok dengan Buku Besar&rdquo;.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-6 py-3 font-medium text-gray-500">Akun</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-500">Saldo Awal</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-500">Perubahan</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-500">Saldo Akhir</th>
                </tr>
              </thead>
              <tbody>
                {cf.cashAccounts.map((a) => (
                  <tr key={a.code} className="border-b border-gray-100">
                    <td className="px-6 py-2.5">
                      <span className="mr-2 font-mono text-gray-400">{a.code}</span>
                      {a.name}
                    </td>
                    <td className="px-6 py-2.5 text-right tabular-nums">
                      {formatCurrency(a.opening, "IDR")}
                    </td>
                    <td className="px-6 py-2.5 text-right">
                      <Flow amount={a.net} />
                    </td>
                    <td className="px-6 py-2.5 text-right tabular-nums">
                      {formatCurrency(a.closing, "IDR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
