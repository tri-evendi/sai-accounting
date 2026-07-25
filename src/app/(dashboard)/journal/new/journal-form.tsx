"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

interface AccountOption {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

interface LineRow {
  accountId: string;
  debit: string;
  credit: string;
  currency: string;
  rate: string;
}

const emptyLine = (): LineRow => ({ accountId: "", debit: "", credit: "", currency: "IDR", rate: "1" });

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const base = (amount: string, rate: string) => (Number(amount) || 0) * (Number(rate) || 1);

export function NewJournalForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<LineRow[]>([emptyLine(), emptyLine()]);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AccountOption[]) => setAccounts(data.filter((a) => a.isActive)))
      .catch(() => setAccounts([]));
  }, []);

  const accountOptions = [
    { value: "", label: "— Pilih akun —" },
    ...accounts.map((a) => ({ value: String(a.id), label: `${a.code} — ${a.name}` })),
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
      }));

    if (payloadLines.length < 2) {
      setError("Jurnal minimal 2 baris berisi.");
      return;
    }
    if (!balanced) {
      setError("Jurnal belum seimbang (total debit harus sama dengan total kredit dalam IDR).");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/journals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, note: note || null, lines: payloadLines }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Gagal menyimpan jurnal");
      setLoading(false);
    } else {
      router.push("/journal");
      router.refresh();
    }
  }

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[{ label: "Catatan Transaksi", href: "/journal" }, { label: "Jurnal Baru" }]}
        title="Jurnal Baru"
      />

      {error && <div className="mb-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong">{error}</div>}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Informasi Jurnal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input id="date" type="date" label="Tanggal" required value={date} onChange={(e) => setDate(e.target.value)} />
              <Input id="note" label="Keterangan" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opsional" />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Rincian Jurnal</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Grid baris jurnal — padding rapat (py-2, px-2) sengaja menimpa
                bawaan primitif agar sama dengan tampilan sebelum migrasi. */}
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-auto py-2 pr-2 pl-0">Akun</TableHead>
                  <TableHead className="h-auto px-2 py-2 text-right">Debit</TableHead>
                  <TableHead className="h-auto px-2 py-2 text-right">Kredit</TableHead>
                  <TableHead className="h-auto px-2 py-2">Mata Uang</TableHead>
                  <TableHead className="h-auto px-2 py-2 text-right">Kurs</TableHead>
                  <TableHead className="h-auto py-2 pr-0 pl-2"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell className="min-w-[220px] py-2 pr-2 pl-0">
                      <Select
                        id={`acc-${i}`}
                        aria-label="Akun"
                        value={l.accountId}
                        onChange={(e) => updateLine(i, { accountId: e.target.value })}
                        options={accountOptions}
                      />
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      <Input
                        aria-label="Debit"
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
                        aria-label="Kredit"
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
                        aria-label="Mata Uang"
                        value={l.currency}
                        onChange={(e) => updateLine(i, { currency: e.target.value, rate: e.target.value === "IDR" ? "1" : l.rate })}
                        options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                      />
                    </TableCell>
                    <TableCell className="w-28 px-2 py-2">
                      <Input
                        aria-label="Kurs"
                        type="number"
                        step="0.000001"
                        min="0"
                        className="text-right tabular-nums"
                        value={l.rate}
                        disabled={l.currency === "IDR"}
                        onChange={(e) => updateLine(i, { rate: e.target.value })}
                      />
                    </TableCell>
                    <TableCell className="py-2 pr-0 pl-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Hapus baris"
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
                  <TableCell className="py-3 pr-2 pl-0 text-muted-foreground">Total (IDR base)</TableCell>
                  <TableCell className="p-0">
                    <MoneyCell className="px-2 py-3" value={totalDebit} currency="IDR" />
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell className="px-2 py-3" value={totalCredit} currency="IDR" />
                  </TableCell>
                  <TableCell colSpan={3} className="px-2 py-3">
                    {balanced ? (
                      <span className="text-success-strong">✓ Seimbang</span>
                    ) : (
                      <span className="text-destructive">Selisih {formatCurrency(Math.abs(totalDebit - totalCredit), "IDR")}</span>
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
              <Plus className="mr-1 h-4 w-4" /> Tambah Baris
            </Button>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading || !balanced}>
            {loading ? "Menyimpan..." : "Simpan Jurnal"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Batal
          </Button>
        </div>
      </form>
    </div>
  );
}
