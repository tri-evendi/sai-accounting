"use client";

/**
 * Anggaran Akun — add/edit form + list with delete (issue #29). Posts a plan;
 * no journal is involved, so there is no rate/currency and no posting-error path.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { MONTH_NAMES } from "@/lib/month-names";
import { formatCurrency } from "@/lib/utils";
import type { BudgetListRow } from "@/lib/budget-report";
import { Loader2, Trash2, ClipboardList } from "lucide-react";

interface AccountOption {
  id: number;
  code: string;
  name: string;
}

export function BudgetAccountsClient({
  accounts,
  budgets,
  defaultYear,
  defaultMonth,
}: {
  accounts: AccountOption[];
  budgets: BudgetListRow[];
  defaultYear: number;
  defaultMonth: number;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [accountId, setAccountId] = useState("");
  const [year, setYear] = useState(String(defaultYear));
  const [month, setMonth] = useState(String(defaultMonth));
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: Number(accountId),
          year: Number(year),
          month: Number(month),
          amount: Number(amount),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldErrors = data?.details?.fieldErrors as Record<string, string[]> | undefined;
        const first = fieldErrors ? Object.values(fieldErrors).flat().find(Boolean) : undefined;
        setError(first ?? data?.error ?? "Gagal menyimpan anggaran.");
        return;
      }
      toast("Anggaran tersimpan.", "success");
      setAccountId("");
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
      const res = await fetch(`/api/budget/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data?.error ?? "Gagal menghapus anggaran.", "error");
        return;
      }
      toast("Anggaran dihapus.", "success");
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
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Tetapkan anggaran</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="budget-account"
              label="Akun"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              options={accounts.map((a) => ({ value: String(a.id), label: `${a.code} · ${a.name}` }))}
              placeholder="Pilih akun pendapatan/beban"
              required
            />
            <Input
              id="budget-amount"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className="text-right tabular-nums"
              label="Anggaran (IDR)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="budget-year"
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
              id="budget-month"
              label="Bulan"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              options={MONTH_NAMES.map((name, i) => ({ value: String(i + 1), label: name }))}
              required
            />
          </div>
          {error && (
            <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={saving} className="cursor-pointer">
            {saving && (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            )}
            Simpan Anggaran
          </Button>
        </form>
      </Card>

      {budgets.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-12 w-12" />}
          title="Belum ada anggaran"
          description="Tetapkan anggaran pertama di atas untuk periode yang dipilih."
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-4 py-3 font-medium text-gray-500">Bulan</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Akun</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Anggaran</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {budgets.map((b) => (
                  <tr key={b.id} className="border-b border-gray-100">
                    <td className="px-4 py-3 text-gray-700">
                      {MONTH_NAMES[b.month - 1]} {b.year}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      <span className="font-mono text-gray-400 mr-2">{b.accountCode}</span>
                      {b.accountName}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                      {formatCurrency(b.amount, "IDR")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/* Menghapus anggaran mengubah angka "Realisasi vs Anggaran"
                          yang mungkin sudah dibaca orang lain, jadi dikonfirmasi
                          dulu (issue #6). */}
                      <ConfirmDialog
                        title="Hapus anggaran ini?"
                        message={`Anggaran ${b.accountCode} — ${b.accountName} untuk ${MONTH_NAMES[b.month - 1]} ${b.year} akan dihapus. Laporan Realisasi vs Anggaran bulan itu akan kehilangan pembandingnya. Jurnal dan transaksi tidak berubah.`}
                        confirmLabel="Hapus Anggaran"
                        onConfirm={() => handleDelete(b.id)}
                        trigger={
                          <button
                            type="button"
                            disabled={deleting === b.id}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-sm text-red-600 transition-colors duration-150 hover:bg-red-50 disabled:opacity-50"
                            aria-label={`Hapus anggaran ${b.accountCode} ${MONTH_NAMES[b.month - 1]} ${b.year}`}
                          >
                            {deleting === b.id ? (
                              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                            ) : (
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            )}
                            Hapus
                          </button>
                        }
                      />
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
