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
import { useDictionary, useT } from "@/lib/i18n/client";
import { monthNames } from "@/lib/i18n/labels";
import type { SalesTargetListRow } from "@/lib/budget-report";
import { Loader2, Trash2, Target } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";

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
  const translate = useT();
  const months = monthNames(useDictionary());
  const period = (year: number, month: number) =>
    translate("common.monthOfYear", { month: months[month - 1], year });

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
      const res = await apiFetch("/api/budget/targets", {
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
        setError(first ?? data?.error ?? translate("budget.saveTargetFailed"));
        return;
      }
      toast(translate("budget.targetSaved"), "success");
      setAmount("");
      router.refresh();
    } catch {
      setError(translate("budget.networkFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeleting(id);
    try {
      const res = await apiFetch(`/api/budget/targets/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data?.error ?? translate("budget.deleteTargetFailed"), "error");
        return;
      }
      toast(translate("budget.targetDeleted"), "success");
      router.refresh();
    } catch {
      toast(translate("budget.networkFailedShort"), "error");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">{translate("budget.setTarget")}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="target-year"
              label={translate("budget.yearField")}
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
              label={translate("budget.monthField")}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              options={months.map((name, i) => ({ value: String(i + 1), label: name }))}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="target-customer"
              label={translate("budget.customerOptional")}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder={translate("budget.allCustomers")}
              options={[
                { value: "", label: translate("budget.allCustomers") },
                ...customers.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
            />
            <Select
              id="target-item"
              label={translate("budget.itemOptional")}
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              placeholder={translate("budget.allItems")}
              options={[
                { value: "", label: translate("budget.allItems") },
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
              label={translate("budget.targetAmountField")}
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
            {translate("budget.submitTarget")}
          </Button>
        </form>
      </Card>

      {targets.length === 0 ? (
        <EmptyState
          icon={<Target className="h-12 w-12" />}
          title={translate("budget.emptyTargetTitle")}
          description={translate("budget.emptyTargetDescription")}
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{translate("budget.monthField")}</TableHead>
                <TableHead>{translate("common.customer")}</TableHead>
                <TableHead>{translate("budget.colCommodity")}</TableHead>
                <TableHead className="text-right">{translate("budget.colTarget")}</TableHead>
                <TableHead className="text-right">{translate("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {targets.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-foreground">
                    {period(t.year, t.month)}
                  </TableCell>
                  <TableCell className="text-foreground">{t.customerName ?? translate("common.all")}</TableCell>
                  <TableCell className="text-foreground">{t.itemName ?? translate("common.all")}</TableCell>
                  <TableCell className="p-0">
                    <MoneyCell value={t.amount} currency="IDR" />
                  </TableCell>
                  <TableCell className="text-right">
                      <ConfirmDialog
                        title={translate("budget.deleteTargetTitle")}
                        message={translate("budget.deleteTargetMessage", {
                          period: period(t.year, t.month),
                          customer: t.customerName ?? translate("budget.allCustomersLower"),
                          item: t.itemName ?? translate("budget.allItemsLower"),
                        })}
                        confirmLabel={translate("budget.deleteTargetConfirm")}
                        onConfirm={() => handleDelete(t.id)}
                        trigger={
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={deleting === t.id}
                            className="gap-1 text-destructive hover:bg-destructive-soft hover:text-destructive"
                            aria-label={translate("budget.deleteTargetAria", { period: period(t.year, t.month) })}
                          >
                            {deleting === t.id ? (
                              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                            ) : (
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            )}
                            {translate("common.delete")}
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
