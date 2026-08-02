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
import { useDictionary, useT } from "@/lib/i18n/client";
import { monthNames } from "@/lib/i18n/labels";
import type { BudgetListRow } from "@/lib/budget-report";
import { Loader2, Trash2, ClipboardList } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";

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
  const t = useT();
  const months = monthNames(useDictionary());
  const period = (year: number, month: number) =>
    t("common.monthOfYear", { month: months[month - 1], year });

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
      const res = await apiFetch("/api/budget", {
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
        setError(first ?? data?.error ?? t("budget.saveBudgetFailed"));
        return;
      }
      toast(t("budget.budgetSaved"), "success");
      setAccountId("");
      setAmount("");
      router.refresh();
    } catch {
      setError(t("budget.networkFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeleting(id);
    try {
      const res = await apiFetch(`/api/budget/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data?.error ?? t("budget.deleteBudgetFailed"), "error");
        return;
      }
      toast(t("budget.budgetDeleted"), "success");
      router.refresh();
    } catch {
      toast(t("budget.networkFailedShort"), "error");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">{t("budget.setBudget")}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="budget-account"
              label={t("common.account")}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              options={accounts.map((a) => ({ value: String(a.id), label: `${a.code} · ${a.name}` }))}
              placeholder={t("budget.pickAccountPlaceholder")}
              required
            />
            <Input
              id="budget-amount"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className="text-right tabular-nums"
              label={t("budget.amountField")}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="budget-year"
              label={t("budget.yearField")}
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
              label={t("budget.monthField")}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              options={months.map((name, i) => ({ value: String(i + 1), label: name }))}
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
            {t("budget.submitBudget")}
          </Button>
        </form>
      </Card>

      {budgets.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-12 w-12" />}
          title={t("budget.emptyBudgetTitle")}
          description={t("budget.emptyBudgetDescription")}
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("budget.monthField")}</TableHead>
                <TableHead>{t("common.account")}</TableHead>
                <TableHead className="text-right">{t("budget.colBudget")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgets.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="text-foreground">
                    {period(b.year, b.month)}
                  </TableCell>
                  <TableCell className="text-foreground">
                    <span className="font-mono text-muted-foreground mr-2">{b.accountCode}</span>
                    {b.accountName}
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell value={b.amount} currency="IDR" />
                  </TableCell>
                  <TableCell className="text-right">
                      {/* Menghapus anggaran mengubah angka "Realisasi vs Anggaran"
                          yang mungkin sudah dibaca orang lain, jadi dikonfirmasi
                          dulu (issue #6). */}
                      <ConfirmDialog
                        title={t("budget.deleteBudgetTitle")}
                        message={t("budget.deleteBudgetMessage", {
                          code: b.accountCode,
                          name: b.accountName,
                          period: period(b.year, b.month),
                        })}
                        confirmLabel={t("budget.deleteBudgetConfirm")}
                        onConfirm={() => handleDelete(b.id)}
                        trigger={
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={deleting === b.id}
                            className="gap-1 text-destructive hover:bg-destructive-soft hover:text-destructive"
                            aria-label={t("budget.deleteBudgetAria", {
                              code: b.accountCode,
                              period: period(b.year, b.month),
                            })}
                          >
                            {deleting === b.id ? (
                              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                            ) : (
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            )}
                            {t("common.delete")}
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
