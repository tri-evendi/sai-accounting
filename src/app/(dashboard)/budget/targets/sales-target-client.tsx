"use client";

/**
 * Target Penjualan — add/edit form + list with delete (issue #29). A plan; no
 * journal, no rate/currency. Customer/item are optional planning tags.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoneyCell } from "@/components/ui/money";
import { useToast } from "@/components/ui/toast";
import { MONTH_NAMES } from "@/lib/month-names";
import type { SalesTargetListRow } from "@/lib/budget-report";
import { Loader2, Trash2, Target } from "lucide-react";

interface NamedOption {
  id: number;
  name: string;
}

export function SalesTargetClient({
  customers,
  items,
  targets,
  defaultYear,
  defaultMonth,
}: {
  customers: NamedOption[];
  items: NamedOption[];
  targets: SalesTargetListRow[];
  defaultYear: number;
  defaultMonth: number;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [year, setYear] = useState(String(defaultYear));
  const [month, setMonth] = useState(String(defaultMonth));
  const [customerId, setCustomerId] = useState("");
  const [itemId, setItemId] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/budget/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: Number(year),
          month: Number(month),
          customerId: customerId ? Number(customerId) : null,
          itemId: itemId ? Number(itemId) : null,
          amount: Number(amount),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldErrors = data?.details?.fieldErrors as Record<string, string[]> | undefined;
        const first = fieldErrors ? Object.values(fieldErrors).flat().find(Boolean) : undefined;
        setError(first ?? data?.error ?? "Gagal menyimpan target.");
        return;
      }
      toast("Target tersimpan.", "success");
      setAmount("");
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/budget/targets/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data?.error ?? "Gagal menghapus target.", "error");
        return;
      }
      toast("Target dihapus.", "success");
      router.refresh();
    } catch {
      toast("Tidak dapat menghubungi server.", "error");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Tetapkan target</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="target-year"
              label="Tahun"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              options={Array.from({ length: 6 }, (_, i) => defaultYear + 1 - i).map((y) => ({
                value: String(y),
                label: String(y),
              }))}
              required
            />
            <Select
              id="target-month"
              label="Bulan"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              options={MONTH_NAMES.map((name, i) => ({ value: String(i + 1), label: name }))}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="target-customer"
              label="Pelanggan (opsional)"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="Semua pelanggan"
              options={[
                { value: "", label: "Semua pelanggan" },
                ...customers.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
            />
            <Select
              id="target-item"
              label="Komoditas (opsional)"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              placeholder="Semua komoditas"
              options={[
                { value: "", label: "Semua komoditas" },
                ...items.map((it) => ({ value: String(it.id), label: it.name })),
              ]}
            />
          </div>
          <div className="sm:max-w-xs">
            <Input
              id="target-amount"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className="text-right tabular-nums"
              label="Target (IDR)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              required
            />
          </div>
          {error && (
            <p className="rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={saving} className="cursor-pointer">
            {saving && (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            )}
            Simpan Target
          </Button>
        </form>
      </Card>

      {targets.length === 0 ? (
        <EmptyState
          icon={<Target className="h-12 w-12" />}
          title="Belum ada target"
          description="Tetapkan target penjualan pertama di atas untuk periode yang dipilih."
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Bulan</TableHead>
                <TableHead>Pelanggan</TableHead>
                <TableHead>Komoditas</TableHead>
                <TableHead className="text-right">Target</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {targets.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-foreground">
                    {MONTH_NAMES[t.month - 1]} {t.year}
                  </TableCell>
                  <TableCell className="text-foreground">{t.customerName ?? "Semua"}</TableCell>
                  <TableCell className="text-foreground">{t.itemName ?? "Semua"}</TableCell>
                  <TableCell className="p-0">
                    <MoneyCell value={t.amount} currency="IDR" />
                  </TableCell>
                  <TableCell className="text-right">
                      <ConfirmDialog
                        title="Hapus target penjualan ini?"
                        message={`Target ${MONTH_NAMES[t.month - 1]} ${t.year} (${t.customerName ?? "semua pelanggan"} · ${t.itemName ?? "semua barang"}) akan dihapus. Laporan pencapaian bulan itu akan kehilangan pembandingnya. Penjualan yang sudah tercatat tidak berubah.`}
                        confirmLabel="Hapus Target"
                        onConfirm={() => handleDelete(t.id)}
                        trigger={
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={deleting === t.id}
                            className="gap-1 text-destructive hover:bg-destructive-soft hover:text-destructive"
                            aria-label={`Hapus target ${MONTH_NAMES[t.month - 1]} ${t.year}`}
                          >
                            {deleting === t.id ? (
                              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                            ) : (
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            )}
                            Hapus
                          </Button>
                        }
                      />
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
