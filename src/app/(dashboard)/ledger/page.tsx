import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { getAccountLedger } from "@/lib/ledger";
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
import { Money, MoneyCell } from "@/components/ui/money";
import { formatDateShort } from "@/lib/utils";
import { accountTypeLabel } from "@/lib/accounting";
import { LedgerFilter } from "./ledger-filter";
import { EmptyState } from "@/components/ui/empty-state";
import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; from?: string; to?: string }>;
}) {
  await requirePagePermission("ledger.read");
  const sp = await searchParams;

  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
  });

  const accountId = sp.accountId ? parseInt(sp.accountId) : undefined;
  const from = sp.from ? new Date(`${sp.from}T00:00:00`) : undefined;
  const to = sp.to ? new Date(`${sp.to}T23:59:59.999`) : undefined;
  const ledger = accountId ? await getAccountLedger(accountId, from, to) : null;

  const accountOptions = [
    { value: "", label: "— Pilih akun —" },
    ...accounts.map((a) => ({ value: String(a.id), label: `${a.code} — ${a.name}` })),
  ];

  return (
    <div>
      <PageHeader title="Buku Besar" />

      <LedgerFilter
        accountOptions={accountOptions}
        accountId={sp.accountId ?? ""}
        from={sp.from ?? ""}
        to={sp.to ?? ""}
      />

      {!ledger ? (
        <Card>
          <div className="px-6 py-10 text-center text-muted-foreground">
            Pilih akun untuk menampilkan mutasi & saldo berjalan.
          </div>
        </Card>
      ) : (
        <>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-foreground">
              <span className="font-mono">{ledger.account.code}</span> — {ledger.account.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              {accountTypeLabel(ledger.account.type)} · Saldo normal{" "}
              {ledger.account.normalBalance === "debit" ? "Debit" : "Kredit"}
            </p>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Tanggal</TableHead>
                  <TableHead>No. Jurnal</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Kredit</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableCell className="text-muted-foreground italic" colSpan={5}>
                    Saldo Awal
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell className="font-medium" value={ledger.opening} currency="IDR" />
                  </TableCell>
                </TableRow>
                {ledger.rows.map((r) => (
                  <TableRow key={r.lineId}>
                    <TableCell className="text-muted-foreground tabular-nums">{formatDateShort(r.date)}</TableCell>
                    <TableCell>
                      <Link href={`/journal/${r.journalId}`} className="font-mono text-primary hover:underline">
                        {r.number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.memo ?? r.note ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.debit > 0 ? <Money value={r.debit} currency="IDR" /> : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.credit > 0 ? <Money value={r.credit} currency="IDR" /> : "—"}
                    </TableCell>
                    <TableCell className="p-0">
                      <MoneyCell value={r.balance} currency="IDR" />
                    </TableCell>
                  </TableRow>
                ))}
                {ledger.rows.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="p-0">
                      <EmptyState
                        icon={<BookOpen className="h-12 w-12" />}
                        title="Tidak ada mutasi pada rentang ini"
                        description="Coba lebarkan rentang tanggalnya atau pilih akun lain. Kalau memang belum ada apa-apa, mulailah dari mencatat transaksi kas."
                        actionLabel="+ Catat Transaksi"
                        actionHref="/finance/new"
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              <TableFooter className="border-t-2 bg-transparent">
                <TableRow className="font-semibold hover:bg-transparent">
                  <TableCell colSpan={3}>Total &amp; Saldo Akhir</TableCell>
                  <TableCell className="p-0">
                    <MoneyCell value={ledger.totalDebit} currency="IDR" />
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell value={ledger.totalCredit} currency="IDR" />
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell value={ledger.closing} currency="IDR" />
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
