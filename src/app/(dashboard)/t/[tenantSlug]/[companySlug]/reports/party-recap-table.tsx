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
import type { PartyRecapColumnId } from "@/lib/statement-layout";

export function PartyRecapTable({
  result,
  columns,
  labels,
}: {
  result: PartyRecapResult;
  /**
   * Kolom yang ditampilkan — dari dialog parameter (`?cols=`), diputuskan
   * `partyRecapColumns()` yang sama dengan PDF & lembar sebarnya. Pratinjau
   * yang memperlihatkan kolom berbeda dari berkasnya adalah laporan yang tidak
   * dipercaya dua kali.
   */
  columns: PartyRecapColumnId[];
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
  const HEADERS: Record<PartyRecapColumnId, string> = {
    party: labels.party,
    docCount: labels.documents,
    gross: labels.gross,
    returns: labels.returns,
    net: labels.net,
  };

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
              {columns.map((c) => (
                <TableHead key={c} className={c === "party" ? undefined : "text-right"}>
                  {HEADERS[c]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.partyId ?? "none"}>
                {columns.map((c) =>
                  c === "party" ? (
                    <TableCell key={c} className="text-foreground">
                      {r.partyName ?? (
                        <span className="text-muted-foreground">{labels.noParty}</span>
                      )}
                      {r.unratedCount > 0 && (
                        <span className="block text-xs text-warning-strong">
                          {labels.rowUnrated(r.unratedCount)}
                        </span>
                      )}
                    </TableCell>
                  ) : c === "docCount" ? (
                    <TableCell key={c} className="text-right tabular-nums text-foreground">
                      {r.docCount}
                    </TableCell>
                  ) : (
                    <TableCell key={c} className="p-0">
                      {/* Retur: minus = pengurang; MoneyCell mewarnai negatif + tanda. */}
                      <MoneyCell
                        className={c === "net" ? "font-medium" : undefined}
                        value={
                          c === "gross"
                            ? r.grossBase
                            : c === "returns"
                              ? r.returnBase > 0
                                ? -r.returnBase
                                : 0
                              : r.netBase
                        }
                        hideCurrency
                      />
                    </TableCell>
                  )
                )}
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columns.length}
                  className="py-10 text-center text-muted-foreground"
                >
                  {labels.empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow className="font-semibold hover:bg-transparent">
                {columns.map((c) =>
                  c === "party" ? (
                    <TableCell key={c} className="text-foreground">
                      {labels.total}
                    </TableCell>
                  ) : c === "docCount" ? (
                    <TableCell key={c} className="text-right tabular-nums text-foreground">
                      {totals.docCount}
                    </TableCell>
                  ) : (
                    <TableCell key={c} className="p-0">
                      <MoneyCell
                        className="font-semibold"
                        value={
                          c === "gross"
                            ? totals.grossBase
                            : c === "returns"
                              ? totals.returnBase > 0
                                ? -totals.returnBase
                                : 0
                              : totals.netBase
                        }
                        hideCurrency
                      />
                    </TableCell>
                  )
                )}
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
