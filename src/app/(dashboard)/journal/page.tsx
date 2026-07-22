import { requireAccountantPage } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { BookText } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  general: "Umum",
  sales: "Penjualan",
  purchase: "Pembelian",
  cash: "Kas/Bank",
  adjustment: "Penyesuaian",
  reversal: "Pembalikan",
};

export default async function JournalPage() {
  await requireAccountantPage(["bos"]);

  const journals = await prisma.journal.findMany({
    orderBy: [{ date: "desc" }, { id: "desc" }],
    include: { lines: true },
    take: 100,
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Jurnal Umum ({journals.length})</h1>
        <Link href="/journal/new">
          <Button>+ Jurnal Baru</Button>
        </Link>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="px-6 py-3 font-medium text-gray-500">Nomor</th>
              <th className="px-6 py-3 font-medium text-gray-500">Tanggal</th>
              <th className="px-6 py-3 font-medium text-gray-500">Tipe</th>
              <th className="px-6 py-3 font-medium text-gray-500">Keterangan</th>
              <th className="px-6 py-3 font-medium text-gray-500 text-right">Total (IDR)</th>
              <th className="px-6 py-3 font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {journals.length > 0 ? (
              journals.map((j) => {
                const total = j.lines.reduce((s, l) => s + Number(l.baseDebit), 0);
                return (
                  <tr key={j.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <Link href={`/journal/${j.id}`} className="font-mono text-blue-600 hover:underline">
                        {j.number}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-gray-600 tabular-nums">{formatDateShort(j.date)}</td>
                    <td className="px-6 py-3 text-gray-600">{TYPE_LABELS[j.type] ?? j.type}</td>
                    <td className="px-6 py-3 text-gray-600 max-w-xs truncate">{j.note ?? "—"}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{formatCurrency(total, "IDR")}</td>
                    <td className="px-6 py-3">
                      {j.isReversed ? (
                        <Badge variant="warning">Dibalik</Badge>
                      ) : j.type === "reversal" ? (
                        <Badge variant="default">Pembalikan</Badge>
                      ) : (
                        <Badge variant="success">Aktif</Badge>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={<BookText className="h-12 w-12" />}
                    title="Belum ada jurnal"
                    description="Sebagian besar jurnal dibuat otomatis dari faktur, kontrak, kas, dan stok. Jurnal manual dipakai untuk koreksi dan penyesuaian."
                    actionLabel="+ Buat Jurnal Manual"
                    actionHref="/journal/new"
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
