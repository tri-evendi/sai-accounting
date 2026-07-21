"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function NewJournalPage() {
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
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Jurnal Baru</h1>

      {error && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-2 pr-2 font-medium">Akun</th>
                    <th className="py-2 px-2 font-medium text-right">Debit</th>
                    <th className="py-2 px-2 font-medium text-right">Kredit</th>
                    <th className="py-2 px-2 font-medium">Mata Uang</th>
                    <th className="py-2 px-2 font-medium text-right">Kurs</th>
                    <th className="py-2 pl-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2 pr-2 min-w-[220px]">
                        <Select
                          id={`acc-${i}`}
                          aria-label="Akun"
                          value={l.accountId}
                          onChange={(e) => updateLine(i, { accountId: e.target.value })}
                          options={accountOptions}
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          aria-label="Debit"
                          type="number"
                          step="0.01"
                          min="0"
                          className="text-right tabular-nums"
                          value={l.debit}
                          onChange={(e) => updateLine(i, { debit: e.target.value, credit: "" })}
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          aria-label="Kredit"
                          type="number"
                          step="0.01"
                          min="0"
                          className="text-right tabular-nums"
                          value={l.credit}
                          onChange={(e) => updateLine(i, { credit: e.target.value, debit: "" })}
                        />
                      </td>
                      <td className="py-2 px-2 w-24">
                        <Select
                          aria-label="Mata Uang"
                          value={l.currency}
                          onChange={(e) => updateLine(i, { currency: e.target.value, rate: e.target.value === "IDR" ? "1" : l.rate })}
                          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                        />
                      </td>
                      <td className="py-2 px-2 w-28">
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
                      </td>
                      <td className="py-2 pl-2">
                        <button
                          type="button"
                          aria-label="Hapus baris"
                          className="text-gray-400 hover:text-red-600 disabled:opacity-30"
                          disabled={lines.length <= 2}
                          onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td className="py-3 pr-2 text-gray-600">Total (IDR base)</td>
                    <td className="py-3 px-2 text-right tabular-nums">{formatCurrency(totalDebit, "IDR")}</td>
                    <td className="py-3 px-2 text-right tabular-nums">{formatCurrency(totalCredit, "IDR")}</td>
                    <td colSpan={3} className="py-3 px-2">
                      {balanced ? (
                        <span className="text-green-700">✓ Seimbang</span>
                      ) : (
                        <span className="text-red-600">Selisih {formatCurrency(Math.abs(totalDebit - totalCredit), "IDR")}</span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

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
