"use client";

import { useEffect, useState } from "react";
import { useAppRouter } from "@/components/ui/app-link";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { PageHeader } from "@/components/ui/page-header";
import { CURRENCIES } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

interface AccountOption {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

/** Pusat biaya aktif, untuk pemilih di kepala & per baris (issue #91). */
interface CostCenterOption {
  id: number;
  code: string;
  name: string;
}

interface LineRow {
  accountId: string;
  debit: string;
  credit: string;
  currency: string;
  rate: string;
  /** Kosong = ikut pilihan di kepala jurnal (issue #91). */
  costCenterId: string;
}

const emptyLine = (): LineRow => ({
  accountId: "",
  debit: "",
  credit: "",
  currency: "IDR",
  rate: "1",
  costCenterId: "",
});

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const base = (amount: string, rate: string) => (Number(amount) || 0) * (Number(rate) || 1);

export function NewJournalForm() {
  const router = useAppRouter();
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [lines, setLines] = useState<LineRow[]>([emptyLine(), emptyLine()]);

  useEffect(() => {
    apiFetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AccountOption[]) => setAccounts(data.filter((a) => a.isActive)))
      .catch(() => setAccounts([]));
    // Hanya yang aktif: yang sudah dinonaktifkan tak boleh bisa DIPILIH lagi,
    // walau namanya tetap terbaca pada jurnal lama yang menyebutnya.
    apiFetch("/api/cost-centers?activeOnly=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: CostCenterOption[]) => setCostCenters(data))
      .catch(() => setCostCenters([]));
  }, []);

  const accountOptions = [
    { value: "", label: t("common.pickAccount") },
    ...accounts.map((a) => ({ value: String(a.id), label: `${a.code} — ${a.name}` })),
  ];
  const costCenterChoices = costCenters.map((c) => ({
    value: String(c.id),
    label: `${c.code} — ${c.name}`,
  }));
  /** Kepala: kosong = seluruh perusahaan. */
  const headerCostCenterOptions = [
    { value: "", label: t("costCenters.filterUnassigned") },
    ...costCenterChoices,
  ];
  /** Baris: kosong = IKUT KEPALA, yang tidak sama artinya dengan di kepala. */
  const lineCostCenterOptions = [
    { value: "", label: t("journal.costCenterFollowHeader") },
    ...costCenterChoices,
  ];

  const totalDebit = lines.reduce((s, l) => s + base(l.debit, l.rate), 0);
  const totalCredit = lines.reduce((s, l) => s + base(l.credit, l.rate), 0);
  const balanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100) && totalDebit > 0;

  function updateLine(i: number, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const payloadLines = lines
      .filter((l) => l.accountId && (Number(l.debit) > 0 || Number(l.credit) > 0))
      .map((l) => ({
        accountId: Number(l.accountId),
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        currency: l.currency,
        rate: Number(l.rate) || 1,
        costCenterId: l.costCenterId ? Number(l.costCenterId) : null,
      }));

    if (payloadLines.length < 2) {
      setError(t("journal.minLines"));
      return;
    }
    if (!balanced) {
      setError(t("journal.notBalanced"));
      return;
    }

    setLoading(true);
    const res = await apiFetch("/api/journals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        note: note || null,
        costCenterId: costCenterId ? Number(costCenterId) : null,
        lines: payloadLines,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || t("journal.saveFailed"));
      setLoading(false);
    } else {
      router.push("/journal");
      router.refresh();
    }
  }

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: t("journal.breadcrumb"), href: "/journal" },
          { label: t("journal.newTitle") },
        ]}
        title={t("journal.newTitle")}
      />

      {error && <div className="mb-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong">{error}</div>}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("journal.infoTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input id="date" type="date" label={t("common.date")} required value={date} onChange={(e) => setDate(e.target.value)} />
              <Input
                id="note"
                label={t("common.description")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("journal.notePlaceholder")}
              />
              {/* issue #91 — pusat biaya BAWAAN. Baris boleh menimpanya, dan
                  memang harus bisa: satu jurnal yang sah dapat mencakup lebih
                  dari satu cabang. */}
              <div className="sm:col-span-2">
                <Select
                  id="costCenterId"
                  label={t("journal.costCenterField")}
                  value={costCenterId}
                  onChange={(e) => setCostCenterId(e.target.value)}
                  options={headerCostCenterOptions}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("journal.costCenterHint")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("journal.linesTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Grid baris jurnal — padding rapat (py-2, px-2) sengaja menimpa
                bawaan primitif agar sama dengan tampilan sebelum migrasi. */}
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-auto py-2 pr-2 pl-0">{t("common.account")}</TableHead>
                  <TableHead className="h-auto px-2 py-2 text-right">{t("common.debit")}</TableHead>
                  <TableHead className="h-auto px-2 py-2 text-right">{t("common.credit")}</TableHead>
                  <TableHead className="h-auto px-2 py-2">{t("common.currency")}</TableHead>
                  <TableHead className="h-auto px-2 py-2 text-right">{t("common.rateTerm")}</TableHead>
                  <TableHead className="h-auto px-2 py-2">{t("journal.colCostCenter")}</TableHead>
                  <TableHead className="h-auto py-2 pr-0 pl-2"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell className="min-w-[220px] py-2 pr-2 pl-0">
                      <Select
                        id={`acc-${i}`}
                        aria-label={t("common.account")}
                        value={l.accountId}
                        onChange={(e) => updateLine(i, { accountId: e.target.value })}
                        options={accountOptions}
                      />
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      <Input
                        aria-label={t("common.debit")}
                        type="number"
                        step="0.01"
                        min="0"
                        className="text-right tabular-nums"
                        value={l.debit}
                        onChange={(e) => updateLine(i, { debit: e.target.value, credit: "" })}
                      />
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      <Input
                        aria-label={t("common.credit")}
                        type="number"
                        step="0.01"
                        min="0"
                        className="text-right tabular-nums"
                        value={l.credit}
                        onChange={(e) => updateLine(i, { credit: e.target.value, debit: "" })}
                      />
                    </TableCell>
                    <TableCell className="w-24 px-2 py-2">
                      <Select
                        aria-label={t("common.currency")}
                        value={l.currency}
                        onChange={(e) => updateLine(i, { currency: e.target.value, rate: e.target.value === "IDR" ? "1" : l.rate })}
                        options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                      />
                    </TableCell>
                    <TableCell className="w-28 px-2 py-2">
                      <Input
                        aria-label={t("common.rateTerm")}
                        type="number"
                        step="0.000001"
                        min="0"
                        className="text-right tabular-nums"
                        value={l.rate}
                        disabled={l.currency === "IDR"}
                        onChange={(e) => updateLine(i, { rate: e.target.value })}
                      />
                    </TableCell>
                    <TableCell className="min-w-[180px] px-2 py-2">
                      <Select
                        aria-label={t("journal.colCostCenter")}
                        value={l.costCenterId}
                        onChange={(e) => updateLine(i, { costCenterId: e.target.value })}
                        options={lineCostCenterOptions}
                      />
                    </TableCell>
                    <TableCell className="py-2 pr-0 pl-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("journal.removeRow")}
                        className="text-muted-foreground hover:text-destructive"
                        disabled={lines.length <= 2}
                        onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter className="bg-transparent">
                <TableRow className="font-semibold hover:bg-transparent">
                  <TableCell className="py-3 pr-2 pl-0 text-muted-foreground">{t("journal.totalBase")}</TableCell>
                  <TableCell className="p-0">
                    <MoneyCell style={{ paddingInline: 8 }} value={totalDebit} currency="IDR" />
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell style={{ paddingInline: 8 }} value={totalCredit} currency="IDR" />
                  </TableCell>
                  <TableCell colSpan={4} className="px-2 py-3">
                    {balanced ? (
                      <span className="text-success-strong">✓ {t("journal.balanced")}</span>
                    ) : (
                      <span className="text-destructive">
                        {t("journal.difference", {
                          amount: formatCurrency(Math.abs(totalDebit - totalCredit), "IDR"),
                        })}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              <Plus className="mr-1 h-4 w-4" /> {t("journal.addRow")}
            </Button>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading || !balanced}>
            {loading ? t("common.saving") : t("journal.submit")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
