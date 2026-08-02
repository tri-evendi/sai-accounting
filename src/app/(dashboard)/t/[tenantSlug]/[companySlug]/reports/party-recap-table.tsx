/**
 * Tabel rekap per pihak — dipakai "Penjualan per Pelanggan" dan "Pembelian per
 * Pemasok" (dua laporan berbentuk sama, hanya beda pihak & sumber datanya).
 *
 * Semua nominal IDR base (judul kolom menyatakannya, sel memakai
 * `hideCurrency`). Retur ditampilkan bertanda minus — pengurang, bukan
 * warna-saja. Dokumen valas tanpa kurs tidak ikut dijumlahkan dan disebut
 * terang-terangan per baris + di bawah tabel (pola `lib/receivables.ts`).
 */
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
import { Info } from "lucide-react";
import type { PartyRecapResult } from "@/lib/party-recap";

export function PartyRecapTable({
  result,
  labels,
}: {
  result: PartyRecapResult;
  labels: {
    party: string;
    documents: string;
    gross: string;
    returns: string;
    net: string;
    total: string;
    /** Label for the null-party bucket (e.g. "Tanpa pelanggan"). */
    noParty: string;
    empty: string;
    /** e.g. "Nilai kotor termasuk PPN; retur pada periode yang sama dikurangkan." */
    grossNote: string;
    /** Row-level "{count} dokumen tanpa kurs" text, already interpolated per row. */
    rowUnrated: (count: number) => string;
    /** Footer "{count} dokumen valas tanpa kurs …" text, already interpolated. */
    unratedNote: (count: number) => string;
  };
}) {
  const { rows, totals } = result;

  return (
    <>
      <p className="mb-4 flex items-start gap-1.5 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{labels.grossNote}</span>
      </p>

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{labels.party}</TableHead>
              <TableHead className="text-right">{labels.documents}</TableHead>
              <TableHead className="text-right">{labels.gross}</TableHead>
              <TableHead className="text-right">{labels.returns}</TableHead>
              <TableHead className="text-right">{labels.net}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.partyId ?? "none"}>
                <TableCell className="text-foreground">
                  {r.partyName ?? <span className="text-muted-foreground">{labels.noParty}</span>}
                  {r.unratedCount > 0 && (
                    <span className="block text-xs text-warning-strong">
                      {labels.rowUnrated(r.unratedCount)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-foreground">
                  {r.docCount}
                </TableCell>
                <TableCell className="p-0">
                  <MoneyCell value={r.grossBase} hideCurrency />
                </TableCell>
                <TableCell className="p-0">
                  {/* Minus = pengurang; MoneyCell mewarnai negatif + tanda. */}
                  <MoneyCell value={r.returnBase > 0 ? -r.returnBase : 0} hideCurrency />
                </TableCell>
                <TableCell className="p-0">
                  <MoneyCell className="font-medium" value={r.netBase} hideCurrency />
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {labels.empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow className="font-semibold hover:bg-transparent">
                <TableCell className="text-foreground">{labels.total}</TableCell>
                <TableCell className="text-right tabular-nums text-foreground">
                  {totals.docCount}
                </TableCell>
                <TableCell className="p-0">
                  <MoneyCell className="font-semibold" value={totals.grossBase} hideCurrency />
                </TableCell>
                <TableCell className="p-0">
                  <MoneyCell
                    className="font-semibold"
                    value={totals.returnBase > 0 ? -totals.returnBase : 0}
                    hideCurrency
                  />
                </TableCell>
                <TableCell className="p-0">
                  <MoneyCell className="font-semibold" value={totals.netBase} hideCurrency />
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </Card>

      {totals.unratedCount > 0 && (
        <p className="mt-3 text-sm text-warning-strong">{labels.unratedNote(totals.unratedCount)}</p>
      )}
    </>
  );
}
